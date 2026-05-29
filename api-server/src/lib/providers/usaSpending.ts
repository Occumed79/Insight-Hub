/**
 * USASpending.gov Provider — Expiring & Re-Compete Contract Intelligence
 *
 * Uses the official USASpending.gov REST API (no key, no auth required) to find:
 *   1. Active contracts in Occu-Med NAICS codes nearing expiration (bid before re-compete)
 *   2. Recently awarded occupational health contracts (confirms real demand + shows incumbents)
 *
 * Authentication: NONE — completely public API
 * Docs: https://api.usaspending.gov/docs/endpoints
 *
 * Key endpoints used:
 *   POST /api/v2/search/spending_by_award/   — search contracts by NAICS
 *   POST /api/v2/award/last_updated/         — freshness check
 */

import { createHash } from "crypto";
import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";

const USA_SPENDING_BASE = "https://api.usaspending.gov/api/v2";

// NAICS codes covering Occu-Med's full service footprint
const OCCU_MED_NAICS = [
  "621111", // Offices of Physicians (except Mental Health) — primary
  "621999", // All Other Miscellaneous Ambulatory Health Care Services
  "621512", // Diagnostic Imaging Centers
  "621310", // Offices of Chiropractors (DOT physicals)
  "561320", // Temporary Help Services (staffed health programs)
  "923120", // Administration of Public Health Programs
  "621610", // Home Health Care Services (sometimes bundled)
  "621910", // Ambulance Services (emergency response programs)
  "621420", // Outpatient Mental Health / Substance Abuse (EAP)
];

interface AwardResult {
  Award_ID?: string;
  "Award ID"?: string;
  Recipient_Name?: string;
  "Recipient Name"?: string;
  Description?: string;
  "Award Amount"?: number;
  "Award Amount_agg"?: number;
  "Start Date"?: string;
  "End Date"?: string;
  "Awarding Agency"?: string;
  "Awarding Sub Agency"?: string;
  "recipient_name"?: string;
  "award_id"?: string;
  "description"?: string;
  "period_of_performance_start_date"?: string;
  "period_of_performance_current_end_date"?: string;
  "awarding_agency_name"?: string;
  "awarding_sub_agency_name"?: string;
  "total_obligation"?: number;
  generated_internal_id?: string;
  "Contract Award Type"?: string;
  "NAICS Code"?: string;
  naics_code?: string;
}

interface SpendingByAwardResponse {
  results?: AwardResult[];
  page_metadata?: { total?: number; hasNext?: boolean };
}

export class USASpendingProvider implements DataSourceProvider {
  readonly name = "usaSpending" as const;

  async isConfigured(): Promise<boolean> {
    return true; // No API key required
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const allOpps: NormalizedOpportunity[] = [];
    const errors: string[] = [];
    const seenIds = new Set<string>();

    // Date window: contracts ending within the next 18 months are re-compete candidates
    const today = new Date();
    const endWindowStart = new Date(today);
    endWindowStart.setDate(today.getDate() - 30); // include recently expired too
    const endWindowEnd = new Date(today);
    endWindowEnd.setMonth(today.getMonth() + 18);

    const fmt = (d: Date) => d.toISOString().split("T")[0];

    // Run a search per NAICS code (batched to avoid timeouts)
    const naicsBatches: string[][] = [];
    for (let i = 0; i < OCCU_MED_NAICS.length; i += 3) {
      naicsBatches.push(OCCU_MED_NAICS.slice(i, i + 3));
    }

    for (const naicsBatch of naicsBatches) {
      try {
        const body = {
          filters: {
            award_type_codes: ["A", "B", "C", "D"], // contracts only
            naics_codes: naicsBatch,
            time_period: [
              {
                // Active or recently active contracts — we want re-competes
                start_date: fmt(endWindowStart),
                end_date: fmt(endWindowEnd),
                date_type: "date_signed",
              },
            ],
            // Focus on contracts with meaningful dollar value
            award_amounts: [{ lower_bound: 10000 }],
          },
          fields: [
            "Award ID",
            "Recipient Name",
            "Description",
            "Award Amount",
            "Start Date",
            "End Date",
            "Awarding Agency",
            "Awarding Sub Agency",
            "Contract Award Type",
            "NAICS Code",
            "generated_internal_id",
          ],
          sort: "End Date",
          order: "asc",
          limit: 40,
          page: 1,
        };

        const resp = await fetch(`${USA_SPENDING_BASE}/search/spending_by_award/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          errors.push(`USASpending NAICS ${naicsBatch.join(",")}: HTTP ${resp.status} — ${text.slice(0, 150)}`);
          continue;
        }

        const json = (await resp.json()) as SpendingByAwardResponse;
        const results = json.results ?? [];

        for (const award of results) {
          const opp = this.normalize(award);
          if (!seenIds.has(opp.externalId)) {
            seenIds.add(opp.externalId);
            allOpps.push(opp);
          }
        }
      } catch (err: any) {
        errors.push(`USASpending batch ${naicsBatch.join(",")}: ${err.message ?? String(err)}`);
      }
    }

    return { records: allOpps, total: allOpps.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    try {
      const resp = await fetch(`${USA_SPENDING_BASE}/awards/last_updated/`);
      const healthy = resp.ok;
      return { name: this.name, configured: true, healthy };
    } catch {
      return { name: this.name, configured: true, healthy: false };
    }
  }

  private normalize(award: AwardResult): NormalizedOpportunity {
    const awardId =
      award["Award ID"] ??
      award.award_id ??
      award.generated_internal_id ??
      "";

    const externalId = `usaspend-${awardId || createHash("sha256").update(JSON.stringify(award)).digest("hex").slice(0, 16)}`;

    const agency =
      award["Awarding Agency"] ??
      award.awarding_agency_name ??
      "Federal Agency";

    const subAgency =
      award["Awarding Sub Agency"] ??
      award.awarding_sub_agency_name;

    const description = award["Description"] ?? award.description;
    const recipient = award["Recipient Name"] ?? award.recipient_name ?? "";

    const endDateStr = award["End Date"] ?? award.period_of_performance_current_end_date;
    const startDateStr = award["Start Date"] ?? award.period_of_performance_start_date;

    const endDate = endDateStr ? new Date(endDateStr) : undefined;
    const startDate = startDateStr ? new Date(startDateStr) : new Date();

    const amount = award["Award Amount"] ?? award.total_obligation;

    const naics = award["NAICS Code"] ?? award.naics_code ?? "";

    // Build a meaningful title: "Re-Compete: [description] — [agency]"
    const descSnippet = description
      ? description.slice(0, 80).replace(/[^a-z0-9 ,.()\-\/]/gi, " ").trim()
      : "Occupational Health Services";

    const isExpiringSoon = endDate && (endDate.getTime() - Date.now()) < 90 * 24 * 60 * 60 * 1000;
    const prefix = isExpiringSoon ? "Re-Compete (Expiring): " : "Active Contract: ";

    // Link to USASpending award detail
    const internalId = award.generated_internal_id;
    const sourceUrl = internalId
      ? `https://www.usaspending.gov/award/${internalId}`
      : undefined;

    return {
      externalId,
      title: `${prefix}${descSnippet}`,
      agency,
      subAgency,
      type: "Contract/Re-Compete",
      status: "active",
      naicsCode: naics,
      postedDate: startDate,
      responseDeadline: endDate,
      description: description
        ? `${description}

Incumbent: ${recipient || "Unknown"}. Contract expiring ${endDateStr ?? "TBD"} — potential re-compete opportunity.`
        : `Incumbent: ${recipient || "Unknown"}. Contract expiring ${endDateStr ?? "TBD"}.`,
      source: "usa_spending" as any,
      providerName: "USASpending.gov",
      awardAmount: amount ? parseFloat(String(amount)) : undefined,
      awardee: recipient || undefined,
      rawData: award as Record<string, unknown>,
    };
  }
}

export const usaSpendingProvider = new USASpendingProvider();
