/**
 * Grants.gov Provider
 *
 * Searches the official Grants.gov REST API (search2 endpoint) for federal
 * funding opportunities that require occupational health vendors/contractors.
 *
 * Authentication: NONE required — endpoint is fully public.
 * Docs: https://www.grants.gov/api/api-guide
 * Endpoint: POST https://api.grants.gov/v1/api/search2
 *
 * Why this matters for Occu-Med:
 *   Many federal health programs (HRSA, CDC, DOL, DOD, VA, DHS) issue grants
 *   that include sub-contracts for occupational health testing, drug screening,
 *   physicals, and medical surveillance. These appear on Grants.gov BEFORE
 *   they appear on SAM.gov.
 */

import { createHash } from "crypto";
import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";

const GRANTS_GOV_BASE = "https://api.grants.gov/v1/api";

// Keyword searches targeted at opportunities that need occupational health vendors
const OCCU_MED_GRANT_QUERIES = [
  "occupational health services",
  "drug testing screening employees",
  "pre-employment medical examination",
  "DOT physical examination",
  "employee health wellness program",
  "workplace medical surveillance",
  "fit for duty examination",
  "substance abuse employee assistance",
  "medical review officer",
  "occupational medicine clinic",
];

interface GrantsGovOpportunity {
  id?: number;
  opportunity_id?: number;
  opportunity_number?: string;
  opportunity_title?: string;
  agency_name?: string;
  agency_code?: string;
  opportunity_status?: string;
  summary?: { summary_description?: string };
  close_date?: string;
  post_date?: string;
  estimated_total_program_funding?: number;
  expected_number_of_awards?: number;
  link?: { value?: string };
}

interface GrantsGovResponse {
  data?: {
    hits?: GrantsGovOpportunity[];
    total_records?: number;
  };
  message?: string;
}

export class GrantsGovProvider implements DataSourceProvider {
  readonly name = "grantsGov" as const;

  async isConfigured(): Promise<boolean> {
    return true; // No key required
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const allOpps: NormalizedOpportunity[] = [];
    const errors: string[] = [];
    const seenIds = new Set<string>();

    // Determine which queries to run based on provided keywords
    const queriesToRun = options.keywords?.trim()
      ? [options.keywords.trim(), ...OCCU_MED_GRANT_QUERIES.slice(0, 4)]
      : OCCU_MED_GRANT_QUERIES;

    // Run queries sequentially to avoid hammering the API
    for (const keyword of queriesToRun) {
      try {
        const body = {
          keyword,
          filters: {
            opportunity_status: { one_of: ["posted", "forecasted"] },
          },
          pagination: {
            page_offset: 1,
            page_size: 25,
            sort_order: [{ order_by: "close_date", sort_direction: "ascending" }],
          },
        };

        const resp = await fetch(`${GRANTS_GOV_BASE}/search2`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          errors.push(`Grants.gov query "${keyword}": HTTP ${resp.status} — ${text.slice(0, 120)}`);
          continue;
        }

        const json = (await resp.json()) as GrantsGovResponse;
        const hits = json.data?.hits ?? [];

        for (const hit of hits) {
          const opp = this.normalize(hit);
          if (!seenIds.has(opp.externalId)) {
            seenIds.add(opp.externalId);
            allOpps.push(opp);
          }
        }
      } catch (err: any) {
        errors.push(`Grants.gov query "${keyword}": ${err.message ?? String(err)}`);
      }
    }

    return { records: allOpps, total: allOpps.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    return { name: this.name, configured: true, healthy: true };
  }

  private normalize(hit: GrantsGovOpportunity): NormalizedOpportunity {
    const id = String(hit.opportunity_id ?? hit.id ?? "");
    const externalId = `grants-${id || createHash("sha256").update(hit.opportunity_title ?? "").digest("hex").slice(0, 12)}`;

    const url = hit.opportunity_number
      ? `https://grants.gov/search-results-detail/${id}`
      : undefined;

    const closeDate = hit.close_date ? new Date(hit.close_date) : undefined;
    const postDate = hit.post_date ? new Date(hit.post_date) : new Date();

    return {
      externalId,
      title: hit.opportunity_title ?? "Untitled Grant Opportunity",
      agency: hit.agency_name ?? "Federal Agency",
      subAgency: hit.agency_code,
      type: "Grant/Program",
      status: hit.opportunity_status === "posted" ? "active" : "active",
      naicsCode: undefined,
      postedDate: postDate,
      responseDeadline: closeDate,
      description: hit.summary?.summary_description,
      solicitationNumber: hit.opportunity_number,
      sourceUrl: url,
      estimatedValue: hit.estimated_total_program_funding,
      source: "grants_gov" as any,
      providerName: "Grants.gov",
      rawData: hit as Record<string, unknown>,
    };
  }
}

export const grantsGovProvider = new GrantsGovProvider();
