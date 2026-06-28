import { createHash } from "crypto";
import { constants } from "fs";
import { access, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { resolveCredential } from "../config/providerConfig";
import { classifyResult, parseResultDate } from "../search/relevance";
import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";

const execFileAsync = promisify(execFile);
const DEFAULT_JSONL_PATH = "/tmp/insight-hub-scrapy-rfp.jsonl";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const STRING_FIELDS = {
  title: ["title", "name", "opportunity_title", "solicitation_title"],
  url: ["url", "link", "sourceUrl", "source_url", "detail_url", "href"],
  agency: ["agency", "buyer", "owner", "department", "organization", "issuer"],
  description: ["description", "snippet", "summary", "content", "text", "body"],
  solicitationNumber: ["solicitationNumber", "solicitation_number", "bid_number", "bidNumber", "notice_id", "external_id"],
  location: ["location", "placeOfPerformance", "place_of_performance", "state", "city"],
  type: ["type", "notice_type", "procurement_type"],
  setAside: ["setAside", "set_aside"],
  sourcePortal: ["portal", "source", "source_name", "spider", "spider_name"],
} as const;

const DATE_FIELDS = {
  postedDate: ["postedDate", "posted_date", "publication_date", "publishedDate", "published_date", "date", "updated"],
  deadline: ["responseDeadline", "response_deadline", "deadline", "due_date", "dueDate", "closing_date", "close_date"],
} as const;

const OCCUMED_CONTEXT = [
  "occupational health",
  "occupational medicine",
  "drug testing",
  "drug screening",
  "DOT physical",
  "pre-employment physical",
  "employee health",
  "medical surveillance",
  "fit for duty",
  "respirator fit testing",
  "pulmonary function testing",
  "spirometry",
  "audiogram",
  "vaccination",
  "immunization",
].join(" ");

function firstString(raw: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstNumber(raw: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[$,]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function parseJsonl(content: string): { rows: Record<string, unknown>[]; errors: string[] } {
  const rows: Record<string, unknown>[] = [];
  const errors: string[] = [];

  content.split(/\r?\n/).forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        rows.push(parsed as Record<string, unknown>);
      } else {
        errors.push(`Line ${idx + 1}: expected a JSON object`);
      }
    } catch (err: any) {
      errors.push(`Line ${idx + 1}: ${err.message ?? String(err)}`);
    }
  });

  return { rows, errors };
}

function splitCommand(command: string): string[] {
  const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  return parts.map((part) => part.replace(/^"|"$/g, ""));
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function runScrapyCommand(command: string, outputPath: string, options: FetchOptions): Promise<void> {
  const parts = splitCommand(command);
  if (parts.length === 0) throw new Error("SCRAPY_RFP_COMMAND is empty");

  const [bin, ...args] = parts;
  await execFileAsync(bin, args, {
    timeout: 15 * 60 * 1000,
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      SCRAPY_RFP_OUTPUT: outputPath,
      SCRAPY_RFP_KEYWORDS: options.keywords ?? "",
      SCRAPY_RFP_LIMIT: String(Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT)),
    },
  });
}

function rawToOpportunity(raw: Record<string, unknown>, index: number, keywords?: string): NormalizedOpportunity | null {
  const title = firstString(raw, STRING_FIELDS.title);
  const url = firstString(raw, STRING_FIELDS.url);
  if (!title || !url) return null;

  const description = firstString(raw, STRING_FIELDS.description) ?? title;
  const agency = firstString(raw, STRING_FIELDS.agency) ?? "Unknown";
  const deadline = parseResultDate(firstString(raw, DATE_FIELDS.deadline));
  const postedDate = parseResultDate(firstString(raw, DATE_FIELDS.postedDate)) ?? new Date();
  const location = firstString(raw, STRING_FIELDS.location);
  const sourcePortal = firstString(raw, STRING_FIELDS.sourcePortal) ?? "Scrapy RFP crawler";
  const solicitationNumber = firstString(raw, STRING_FIELDS.solicitationNumber);
  const estimatedValue = firstNumber(raw, ["estimatedValue", "estimated_value", "value", "budget", "amount"]);

  const relevance = classifyResult({
    title,
    snippet: `${description} ${OCCUMED_CONTEXT}`,
    description,
    url,
    date: postedDate,
    deadlineInFuture: deadline ? deadline > new Date() : undefined,
    keywords,
  });

  if (relevance.rejected) return null;
  if (relevance.score < 45 && !deadline) return null;

  const urlHash = createHash("sha256").update(url).digest("hex").slice(0, 20);
  const externalId = firstString(raw, ["externalId", "external_id", "id"]) ?? `scrapy-${urlHash}`;
  const dateUnknown = relevance.publishedDate == null;
  const tags = [
    "scrapy",
    "crawler",
    relevance.category,
    dateUnknown ? "date-unknown" : null,
    relevance.stale ? "stale" : null,
  ].filter(Boolean) as string[];

  return {
    externalId,
    title,
    agency,
    type: firstString(raw, STRING_FIELDS.type) ?? "Solicitation",
    status: deadline && deadline < new Date() ? "archived" : "active",
    postedDate: relevance.publishedDate ?? postedDate,
    responseDeadline: deadline ?? undefined,
    setAside: firstString(raw, STRING_FIELDS.setAside),
    placeOfPerformance: location,
    location,
    description,
    solicitationNumber,
    sourceUrl: url,
    estimatedValue,
    source: "scrapyRfp",
    providerName: "scrapyRfp",
    rawData: {
      providerName: "scrapy_rfp_crawler",
      sourcePortal,
      sourceIndex: index,
      relevanceScore: relevance.score,
      relevanceReason: relevance.reasons.join("; "),
      relevanceReasons: relevance.reasons,
      sourceConfidence: relevance.score >= 75 ? "high" : relevance.score >= 50 ? "medium" : "low",
      tags,
      fallback: false,
      raw,
    },
  };
}

export class ScrapyRfpProvider implements DataSourceProvider {
  readonly name = "scrapyRfp" as const;

  async isConfigured(): Promise<boolean> {
    const command = await resolveCredential("scrapyRfpCommand", "SCRAPY_RFP_COMMAND");
    const jsonlPath = await resolveCredential("scrapyRfpJsonlPath", "SCRAPY_RFP_JSONL");
    if (command?.trim()) return true;
    return jsonlPath ? fileExists(jsonlPath) : fileExists(DEFAULT_JSONL_PATH);
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const command = await resolveCredential("scrapyRfpCommand", "SCRAPY_RFP_COMMAND");
    const configuredJsonlPath = await resolveCredential("scrapyRfpJsonlPath", "SCRAPY_RFP_JSONL");
    const errors: string[] = [];
    let outputPath = configuredJsonlPath || DEFAULT_JSONL_PATH;
    let tempDir: string | null = null;

    try {
      if (command?.trim()) {
        tempDir = await mkdtemp(join(tmpdir(), "insight-hub-scrapy-"));
        outputPath = join(tempDir, "rfp-results.jsonl");
        await runScrapyCommand(command, outputPath, options);
      }

      if (!(await fileExists(outputPath))) {
        return {
          records: [],
          total: 0,
          errors: [
            command?.trim()
              ? `Scrapy command completed but did not write ${outputPath}`
              : "Scrapy RFP provider is not configured. Set SCRAPY_RFP_COMMAND or SCRAPY_RFP_JSONL.",
          ],
        };
      }

      const content = await readFile(outputPath, "utf-8");
      const { rows, errors: parseErrors } = parseJsonl(content);
      errors.push(...parseErrors.slice(0, 10).map((e) => `Scrapy JSONL: ${e}`));

      const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const records = rows
        .map((row, idx) => rawToOpportunity(row, idx, options.keywords))
        .filter((record): record is NormalizedOpportunity => Boolean(record))
        .slice(0, limit);

      return { records, total: records.length, errors };
    } catch (err: any) {
      return { records: [], total: 0, errors: [`Scrapy RFP: ${err.message ?? String(err)}`] };
    } finally {
      if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return {
      name: "scrapyRfp",
      configured,
      healthy: configured,
      recordCount: 0,
    };
  }
}

export const scrapyRfpProvider = new ScrapyRfpProvider();
