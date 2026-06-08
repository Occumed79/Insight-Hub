import { createHash } from "crypto";
import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";

const DEFAULT_BASE = process.env.FEDERAL_REGISTER_API_BASE || "https://www.federalregister.gov/api/v1";

const OCCU_MED_TERMS = [
  "occupational health",
  "medical surveillance",
  "drug testing",
  "physical examination",
  "respirator medical evaluation",
  "workplace health",
  "employee health",
  "fitness for duty",
];

interface FederalRegisterDocument {
  document_number?: string;
  title?: string;
  abstract?: string;
  type?: string;
  agency_names?: string[];
  agencies?: { name?: string; parent_id?: number; raw_name?: string }[];
  publication_date?: string;
  comments_close_on?: string;
  html_url?: string;
  pdf_url?: string;
  docket_ids?: string[];
  regulation_id_number_info?: Record<string, unknown>;
}

interface FederalRegisterResponse {
  results?: FederalRegisterDocument[];
  count?: number;
}

export class FederalRegisterProvider implements DataSourceProvider {
  readonly name = "federalRegister" as const;

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const allRecords: NormalizedOpportunity[] = [];
    const seen = new Set<string>();
    const errors: string[] = [];
    const terms = options.keywords?.trim()
      ? [options.keywords.trim(), ...OCCU_MED_TERMS.slice(0, 4)]
      : OCCU_MED_TERMS;

    for (const term of terms) {
      try {
        const url = new URL(`${DEFAULT_BASE.replace(/\/$/, "")}/documents.json`);
        url.searchParams.set("per_page", String(Math.min(options.limit ?? 20, 50)));
        url.searchParams.set("order", "newest");
        url.searchParams.set("conditions[term]", term);
        url.searchParams.set("conditions[type][]", "RULE");
        url.searchParams.append("conditions[type][]", "PRORULE");
        url.searchParams.append("conditions[type][]", "NOTICE");

        if (options.dateRange && options.dateRange > 0) {
          const start = new Date(Date.now() - options.dateRange * 24 * 60 * 60 * 1000);
          url.searchParams.set("conditions[publication_date][gte]", start.toISOString().slice(0, 10));
        }

        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          errors.push(`Federal Register query "${term}": HTTP ${response.status} — ${text.slice(0, 120)}`);
          continue;
        }

        const json = (await response.json()) as FederalRegisterResponse;
        for (const doc of json.results ?? []) {
          const opp = this.normalize(doc);
          if (!seen.has(opp.externalId)) {
            seen.add(opp.externalId);
            allRecords.push(opp);
          }
        }
      } catch (error) {
        errors.push(`Federal Register query "${term}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { records: allRecords, total: allRecords.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    try {
      const response = await fetch(`${DEFAULT_BASE.replace(/\/$/, "")}/documents.json?per_page=1`, {
        signal: AbortSignal.timeout(10000),
      });
      return { name: this.name, configured: true, healthy: response.ok };
    } catch (error) {
      return {
        name: this.name,
        configured: true,
        healthy: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private normalize(doc: FederalRegisterDocument): NormalizedOpportunity {
    const agency = doc.agency_names?.[0]
      ?? doc.agencies?.find((item) => item.name)?.name
      ?? doc.agencies?.[0]?.raw_name
      ?? "Federal Agency";
    const docket = doc.docket_ids?.[0];
    const documentNumber = doc.document_number
      ?? createHash("sha256").update(JSON.stringify(doc)).digest("hex").slice(0, 16);
    const closeDate = doc.comments_close_on ? new Date(doc.comments_close_on) : undefined;
    const postedDate = doc.publication_date ? new Date(doc.publication_date) : new Date();

    return {
      externalId: `federal-register-${documentNumber}`,
      title: doc.title ?? "Federal Register Notice",
      agency,
      type: doc.type ?? "Federal Register Notice",
      status: closeDate && closeDate < new Date() ? "archived" : "active",
      postedDate,
      responseDeadline: closeDate,
      description: [doc.abstract, docket ? `Docket: ${docket}` : null].filter(Boolean).join("\n\n") || undefined,
      solicitationNumber: docket ?? documentNumber,
      sourceUrl: doc.html_url ?? doc.pdf_url,
      source: "federalRegister",
      rawData: doc as Record<string, unknown>,
    };
  }
}

export const federalRegisterProvider = new FederalRegisterProvider();
