import { DIRECT_RFP_PORTALS } from "./directRfpPortals";
import {
  PUBLISHED_DIRECT_RFP_PORTALS,
  REMOVED_UNRUNNABLE_DIRECT_RFP_PORTALS,
  validatePublishedDirectRfpCatalogue,
} from "./publishedDirectRfpCatalogue";

export interface CatalogueCompletionAuditReport {
  generatedAt: string;
  clean: boolean;
  summary: {
    rawRecordsAssessed: number;
    publishedRunnableRecords: number;
    removedNonRunnableRecords: number;
    accountedRecords: number;
    registeredAdapters: number;
    rawDuplicateIds: number;
    rawInvalidUrls: number;
    publishedValidationErrors: number;
  };
  publishedSourceIds: string[];
  removedSources: Array<{
    id: string;
    name: string;
    jurisdiction: string;
    reason: string;
  }>;
  errors: string[];
}

function validHttpUrl(value: string): boolean {
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function runCatalogueCompletionAudit(
  generatedAt = new Date().toISOString(),
): CatalogueCompletionAuditReport {
  const rawCounts = new Map<string, number>();
  const rawInvalidUrls: string[] = [];
  for (const portal of DIRECT_RFP_PORTALS) {
    rawCounts.set(portal.id, (rawCounts.get(portal.id) ?? 0) + 1);
    if (!validHttpUrl(portal.url)) rawInvalidUrls.push(`${portal.id}:url`);
    if (portal.searchUrl && !validHttpUrl(portal.searchUrl)) {
      rawInvalidUrls.push(`${portal.id}:searchUrl`);
    }
  }

  const rawDuplicateIds = [...rawCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  const publishedValidation = validatePublishedDirectRfpCatalogue();
  const errors: string[] = [];

  if (rawDuplicateIds.length > 0) {
    errors.push(`Raw catalogue contains duplicate IDs: ${rawDuplicateIds.join(", ")}`);
  }
  if (rawInvalidUrls.length > 0) {
    errors.push(`Raw catalogue contains invalid URLs: ${rawInvalidUrls.join(", ")}`);
  }
  if (!publishedValidation.clean) {
    for (const [key, value] of Object.entries(publishedValidation)) {
      if (key === "clean" || typeof value === "number" || typeof value === "boolean") {
        continue;
      }
      if (Array.isArray(value) && value.length > 0) {
        errors.push(`${key}: ${value.join(", ")}`);
      }
    }
    if (publishedValidation.missingSamGov) errors.push("missingSamGov");
  }

  const accountedRecords =
    PUBLISHED_DIRECT_RFP_PORTALS.filter((portal) =>
      DIRECT_RFP_PORTALS.some((raw) => raw.id === portal.id),
    ).length + REMOVED_UNRUNNABLE_DIRECT_RFP_PORTALS.length;
  if (accountedRecords !== DIRECT_RFP_PORTALS.length) {
    errors.push(
      `Catalogue partition mismatch: ${accountedRecords} accounted of ${DIRECT_RFP_PORTALS.length}`,
    );
  }

  return {
    generatedAt,
    clean: errors.length === 0,
    summary: {
      rawRecordsAssessed: DIRECT_RFP_PORTALS.length,
      publishedRunnableRecords: PUBLISHED_DIRECT_RFP_PORTALS.length,
      removedNonRunnableRecords: REMOVED_UNRUNNABLE_DIRECT_RFP_PORTALS.length,
      accountedRecords,
      registeredAdapters: publishedValidation.registeredAdapters,
      rawDuplicateIds: rawDuplicateIds.length,
      rawInvalidUrls: rawInvalidUrls.length,
      publishedValidationErrors: errors.length,
    },
    publishedSourceIds: PUBLISHED_DIRECT_RFP_PORTALS.map((portal) => portal.id),
    removedSources: REMOVED_UNRUNNABLE_DIRECT_RFP_PORTALS.map((portal) => ({
      id: portal.id,
      name: portal.name,
      jurisdiction: portal.jurisdiction,
      reason: "No registered runtime adapter or approved direct API; removed from the published catalogue.",
    })),
    errors,
  };
}

export function catalogueCompletionAuditMarkdown(
  report: CatalogueCompletionAuditReport,
): string {
  const lines = [
    "# Full Procurement Catalogue Completion Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `- Result: **${report.clean ? "CLEAN" : "FAILED"}**`,
    `- Raw records assessed: ${report.summary.rawRecordsAssessed}`,
    `- Published runnable records: ${report.summary.publishedRunnableRecords}`,
    `- Removed non-runnable records: ${report.summary.removedNonRunnableRecords}`,
    `- Accounted records: ${report.summary.accountedRecords}`,
    `- Registered adapters: ${report.summary.registeredAdapters}`,
    `- Duplicate raw IDs: ${report.summary.rawDuplicateIds}`,
    `- Invalid raw URLs: ${report.summary.rawInvalidUrls}`,
    "",
    "## Errors",
    "",
    ...(report.errors.length > 0 ? report.errors.map((error) => `- ${error}`) : ["None."]),
    "",
    "## Published runnable sources",
    "",
    ...report.publishedSourceIds.map((id) => `- ${id}`),
    "",
    "## Removed sources",
    "",
    ...report.removedSources.map(
      (source) => `- ${source.id} — ${source.name} — ${source.reason}`,
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
