import { createHash } from "node:crypto";
import type { NormalizedOpportunity } from "../providers/types";
import { classifyProviderRecordRelevance } from "../providers/providerQueryMatch";
import { geminiProvider, OCCUMED_PROFILE } from "../providers/gemini";
import { groqProvider } from "../providers/groq";
import { openrouterProvider } from "../providers/openrouter";
import { minimaxProvider } from "../providers/minimax";
import { clodProvider } from "../providers/clod";
import {
  cerebrasProvider,
  deepseekProvider,
  mistralProvider,
  nvidiaProvider,
} from "../providers/openAiCompatible";

interface JudgeProvider {
  name: string;
  isConfigured(): Promise<boolean>;
  complete(prompt: string, maxTokens?: number): Promise<string>;
}

export interface StructuredJudgeVote {
  judge: string;
  isOpportunity: boolean;
  relevanceScore: number;
  reason: string;
}

export interface StructuredJudgeDecision {
  approved: boolean;
  panelSize: number;
  yesVotes: number;
  noVotes: number;
  score: number;
  judges: string[];
  reasons: string[];
}

export interface StructuredJudgeResult {
  approved: NormalizedOpportunity[];
  rejected: number;
  deterministicRejected: number;
  panelRejected: number;
  unjudged: number;
  deferred: number;
  usedJudges: string[];
  errors: string[];
}

const JUDGE_PROVIDERS: JudgeProvider[] = [
  cerebrasProvider,
  groqProvider,
  geminiProvider,
  mistralProvider,
  deepseekProvider,
  nvidiaProvider,
  openrouterProvider,
  minimaxProvider,
  clodProvider,
];

export const STRUCTURED_JUDGE_PROVIDER_ORDER = JUDGE_PROVIDERS.map(
  (provider) => provider.name,
);

const PANEL_SIZE = 3;
const MIN_PANEL_SIZE = 2;
const CHUNK_SIZE = 10;
const MIN_APPROVAL_SCORE = 72;
const MIN_INDIVIDUAL_YES_SCORE = 62;
const DEFAULT_CANDIDATE_LIMIT = 30;
const PROVIDER_TIMEOUT_MS = 28_000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1_000;
const ORG_SERVICES = OCCUMED_PROFILE.services.join("; ");

type JsonRecord = Record<string, unknown>;

interface CachedDecision {
  value: StructuredJudgeDecision;
  expiresAt: number;
}

const decisionCache = new Map<string, CachedDecision>();

function cacheKey(record: NormalizedOpportunity): string {
  return createHash("sha256")
    .update(record.sourceUrl ?? "")
    .update("\n")
    .update(record.externalId ?? "")
    .update("\n")
    .update(record.title ?? "")
    .update("\n")
    .update((record.description ?? "").slice(0, 6_000))
    .digest("hex")
    .slice(0, 28);
}

function getCached(record: NormalizedOpportunity): StructuredJudgeDecision | null {
  const key = cacheKey(record);
  const entry = decisionCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    decisionCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(
  record: NormalizedOpportunity,
  decision: StructuredJudgeDecision,
): void {
  decisionCache.set(cacheKey(record), {
    value: decision,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function stripJson(text: string): string {
  return text
    .replace(/```json\n?/gi, "")
    .replace(/```/g, "")
    .trim();
}

function parseJsonArray(text: string): unknown[] | null {
  const cleaned = stripJson(text);
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (Array.isArray(parsed)) return parsed;
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { results?: unknown[] }).results)
    ) {
      return (parsed as { results: unknown[] }).results;
    }
  } catch {}

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function boundedScore(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function conciseError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function configuredCandidateLimit(): number {
  const parsed = Number.parseInt(
    process.env.STRUCTURED_RFP_JUDGE_CANDIDATE_LIMIT ?? "",
    10,
  );
  if (!Number.isFinite(parsed)) return DEFAULT_CANDIDATE_LIMIT;
  return Math.max(10, Math.min(60, parsed));
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function recordText(record: NormalizedOpportunity): string {
  return [
    `Title: ${record.title}`,
    `Buyer: ${record.agency}`,
    record.subAgency ? `Sub-agency: ${record.subAgency}` : "",
    `Notice type: ${record.type}`,
    record.solicitationNumber
      ? `Solicitation number: ${record.solicitationNumber}`
      : "",
    record.naicsCode ? `NAICS: ${record.naicsCode}` : "",
    record.naicsDescription
      ? `NAICS description: ${record.naicsDescription}`
      : "",
    record.placeOfPerformance
      ? `Place of performance: ${record.placeOfPerformance}`
      : "",
    record.responseDeadline
      ? `Response deadline: ${record.responseDeadline.toISOString()}`
      : "Response deadline: unknown",
    `Description: ${(record.description ?? "").slice(0, 3_200)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPrompt(
  providerName: string,
  records: NormalizedOpportunity[],
): string {
  const items = records
    .map((record, index) => `[${index}]\n${recordText(record)}`)
    .join("\n\n");

  return `You are one independent judge on a strict procurement relevance panel for Occu-Med.

Occu-Med can perform: ${ORG_SERVICES}.
Source being reviewed: ${providerName}.
Today: ${new Date().toISOString().slice(0, 10)}.

A YES verdict requires all of the following:
1. The record is a real procurement notice that is currently open for responses.
2. The primary purchased scope—not incidental boilerplate—requires occupational health, employee medical examinations, drug/alcohol testing, medical surveillance, audiometry, spirometry, respirator medical evaluations or fit testing, vaccinations, deployment medical screening, fitness-for-duty evaluations, or management of a provider network delivering those services.
3. Occu-Med could realistically bid as the prime or a meaningful subcontractor.

Reject records where medical, health, workforce, safety, testing, or regulatory words appear only in clauses, background text, agency descriptions, or generic boilerplate. Reject construction, corrosion repair, painting, snow removal, parking garages, chillers, toilets, surveillance cameras, IT, laboratory equipment purchases, EEG systems, DNA extraction systems, weapons, facilities maintenance, and unrelated clinical treatment even when the notice contains incidental health or safety language.

Return ONLY JSON in this shape:
{"results":[{"index":0,"isOpportunity":true,"relevanceScore":92,"reason":"The core scope purchases occupational medical examinations and drug testing."}]}

Score relevance to Occu-Med from 0 to 100. Be conservative. Analyze every item.

ITEMS:
${items}`;
}

async function completeWithTimeout(
  provider: JudgeProvider,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Request cancelled", "AbortError");
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`${provider.name} judge timed out`)),
      PROVIDER_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([provider.complete(prompt, 2_400), deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function runJudge(
  provider: JudgeProvider,
  providerName: string,
  records: NormalizedOpportunity[],
  signal?: AbortSignal,
): Promise<Map<number, StructuredJudgeVote>> {
  const text = await completeWithTimeout(
    provider,
    buildPrompt(providerName, records),
    signal,
  );
  const rows = parseJsonArray(text);
  if (!rows) throw new Error(`${provider.name} returned malformed panel JSON`);

  const votes = new Map<number, StructuredJudgeVote>();
  rows.forEach((raw, order) => {
    if (!raw || typeof raw !== "object") return;
    const object = raw as JsonRecord;
    const parsedIndex = Number(object.index);
    const index = Number.isInteger(parsedIndex) ? parsedIndex : order;
    if (index < 0 || index >= records.length) return;
    const isOpportunity = object.isOpportunity === true;
    const reason =
      typeof object.reason === "string" && object.reason.trim()
        ? object.reason.trim().slice(0, 500)
        : isOpportunity
          ? "Judge approved the record as a core Occu-Med procurement."
          : "Judge rejected the record as unrelated or insufficiently supported.";
    votes.set(index, {
      judge: provider.name,
      isOpportunity,
      relevanceScore: boundedScore(object.relevanceScore),
      reason,
    });
  });

  if (votes.size < Math.max(1, Math.ceil(records.length * 0.7))) {
    throw new Error(
      `${provider.name} returned only ${votes.size}/${records.length} panel decisions`,
    );
  }
  return votes;
}

export function aggregateJudgePanelVotes(
  votes: StructuredJudgeVote[],
): StructuredJudgeDecision {
  const yesVotes = votes.filter((vote) => vote.isOpportunity);
  const noVotes = votes.length - yesVotes.length;
  const yesScores = yesVotes
    .map((vote) => vote.relevanceScore)
    .sort((left, right) => left - right);
  const score = yesScores.length
    ? Math.round(
        yesScores.reduce((sum, value) => sum + value, 0) / yesScores.length,
      )
    : 0;
  const requiredYes = votes.length >= 3 ? 2 : MIN_PANEL_SIZE;
  const approved =
    votes.length >= MIN_PANEL_SIZE &&
    yesVotes.length >= requiredYes &&
    score >= MIN_APPROVAL_SCORE &&
    yesScores.every((value) => value >= MIN_INDIVIDUAL_YES_SCORE);

  return {
    approved,
    panelSize: votes.length,
    yesVotes: yesVotes.length,
    noVotes,
    score,
    judges: votes.map((vote) => vote.judge),
    reasons: Array.from(new Set(votes.map((vote) => vote.reason))).slice(0, 4),
  };
}

function existingTags(record: NormalizedOpportunity): string[] {
  return Array.isArray(record.rawData?.tags)
    ? record.rawData.tags.filter(
        (tag): tag is string => typeof tag === "string" && tag.trim().length > 0,
      )
    : [];
}

function approvedRecord(
  record: NormalizedOpportunity,
  decision: StructuredJudgeDecision,
): NormalizedOpportunity {
  const summary = `Judge panel ${decision.yesVotes}/${decision.panelSize} approved: ${decision.reasons.join(" ")}`;
  return {
    ...record,
    rawData: {
      ...(record.rawData ?? {}),
      relevanceScore: decision.score,
      relevanceReason: summary,
      judgePanelApproved: true,
      judgePanel: decision,
      tags: Array.from(
        new Set([...existingTags(record), "judge-panel-approved"]),
      ),
    },
  };
}

export async function judgeStructuredOpportunities(
  records: NormalizedOpportunity[],
  options: { providerName: string; signal?: AbortSignal },
): Promise<StructuredJudgeResult> {
  const errors: string[] = [];
  const usedJudges = new Set<string>();
  const deterministic = records
    .map((record) => ({
      record,
      relevance: classifyProviderRecordRelevance(record),
    }))
    .filter(
      ({ relevance }) =>
        !relevance.rejected &&
        relevance.score >= 65 &&
        relevance.confidence !== "possible_adjacent",
    )
    .sort((left, right) => {
      const scoreDelta = right.relevance.score - left.relevance.score;
      if (scoreDelta) return scoreDelta;
      const leftDeadline = left.record.responseDeadline?.getTime() ?? Infinity;
      const rightDeadline = right.record.responseDeadline?.getTime() ?? Infinity;
      return leftDeadline - rightDeadline;
    });

  const deterministicRejected = records.length - deterministic.length;
  const limit = configuredCandidateLimit();
  const selected = deterministic.slice(0, limit).map(({ record }) => record);
  const deferred = Math.max(0, deterministic.length - selected.length);
  const approved: NormalizedOpportunity[] = [];
  let panelRejected = 0;
  let unjudged = 0;

  const configured: JudgeProvider[] = [];
  for (const provider of JUDGE_PROVIDERS) {
    try {
      if (await provider.isConfigured()) configured.push(provider);
    } catch (error) {
      errors.push(`${provider.name} configuration check: ${conciseError(error)}`);
    }
  }

  for (const group of chunk(selected, CHUNK_SIZE)) {
    if (options.signal?.aborted) break;

    const cached = group.map((record) => getCached(record));
    const pendingIndexes = cached
      .map((decision, index) => (decision ? -1 : index))
      .filter((index) => index >= 0);

    const providerVotes: Array<Map<number, StructuredJudgeVote>> = [];
    const available = [...configured];

    if (pendingIndexes.length > 0) {
      for (const provider of available) {
        if (providerVotes.length >= MIN_PANEL_SIZE) break;
        try {
          const votes = await runJudge(
            provider,
            options.providerName,
            group,
            options.signal,
          );
          providerVotes.push(votes);
          usedJudges.add(provider.name);
        } catch (error) {
          errors.push(`${provider.name} judge: ${conciseError(error)}`);
        }
      }

      const disagreement = group.some((_record, index) => {
        const votes = providerVotes
          .map((map) => map.get(index))
          .filter((vote): vote is StructuredJudgeVote => Boolean(vote));
        return (
          votes.length >= 2 &&
          votes.some((vote) => vote.isOpportunity) &&
          votes.some((vote) => !vote.isOpportunity)
        );
      });

      if (disagreement && providerVotes.length >= MIN_PANEL_SIZE) {
        for (const provider of available) {
          if (usedJudges.has(provider.name)) continue;
          try {
            const votes = await runJudge(
              provider,
              options.providerName,
              group,
              options.signal,
            );
            providerVotes.push(votes);
            usedJudges.add(provider.name);
            break;
          } catch (error) {
            errors.push(`${provider.name} tie-break judge: ${conciseError(error)}`);
          }
        }
      }
    }

    group.forEach((record, index) => {
      let decision = cached[index];
      if (!decision) {
        const votes = providerVotes
          .map((map) => map.get(index))
          .filter((vote): vote is StructuredJudgeVote => Boolean(vote))
          .slice(0, PANEL_SIZE);
        decision = aggregateJudgePanelVotes(votes);
        setCached(record, decision);
      }

      if (decision.panelSize < MIN_PANEL_SIZE) {
        unjudged += 1;
        return;
      }
      if (!decision.approved) {
        panelRejected += 1;
        return;
      }
      approved.push(approvedRecord(record, decision));
    });
  }

  if (selected.length > 0 && configured.length < MIN_PANEL_SIZE) {
    errors.push(
      `Structured RFP judge panel requires at least ${MIN_PANEL_SIZE} configured AI judges; only ${configured.length} were available. Unjudged records were not promoted.`,
    );
  }

  return {
    approved,
    rejected: deterministicRejected + panelRejected + unjudged + deferred,
    deterministicRejected,
    panelRejected,
    unjudged,
    deferred,
    usedJudges: [...usedJudges],
    errors: Array.from(new Set(errors)).slice(0, 12),
  };
}

export function clearStructuredJudgeCache(): void {
  decisionCache.clear();
}
