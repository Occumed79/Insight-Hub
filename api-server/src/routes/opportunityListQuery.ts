import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { SAM_GOV_DISCOVERY_CLASSIFICATION_CODES } from "../lib/providers/samGovTaxonomyEvidence";

/**
 * Build a PostgreSQL text[] literal with each value kept as a bound parameter.
 *
 * Passing a JavaScript array directly to Drizzle's sql template produces a row
 * expression (`($1, $2)`) rather than a PostgreSQL array. `LIKE ANY` requires
 * an actual array and otherwise fails the entire opportunities request.
 */
export function boundTextArray(values: readonly string[]): SQL {
  if (values.length === 0) {
    return sql`ARRAY[]::text[]`;
  }

  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

export function likeAnyText(expression: SQL, patterns: readonly string[]): SQL {
  return sql`${expression} LIKE ANY(${boundTextArray(patterns)})`;
}

export function notLikeAnyText(
  expression: SQL,
  patterns: readonly string[],
): SQL {
  return sql`NOT (${likeAnyText(expression, patterns)})`;
}

/**
 * Read-time evidence gate for the Opportunities page.
 *
 * Text relevance is always one independent path. Official SAM rows discovered
 * through an Occu-Med taxonomy classification are a second preservation path,
 * so a thin but potentially relevant SAM record can reach the downstream
 * quality classifier instead of disappearing before semantic review. The
 * classification path is additive only: unknown/new codes can still pass via
 * their actual opportunity text, and taxonomy membership alone does not make a
 * record actionable.
 */
export function opportunityServiceEvidenceFilter(
  table: typeof import("@workspace/db/schema").opportunitiesTable,
  servicePatterns: readonly string[],
): SQL {
  const textEvidence = likeAnyText(sql`(
    lower(${table.title}) || ' ' ||
    lower(coalesce(${table.description}, '')) || ' ' ||
    lower(coalesce(${table.agency}, ''))
  )`, servicePatterns);

  const samTaxonomyEvidence = and(
    eq(table.source, "sam_gov"),
    or(
      inArray(table.naicsCode, [...SAM_GOV_DISCOVERY_CLASSIFICATION_CODES.naics]),
      inArray(table.pscCode, [...SAM_GOV_DISCOVERY_CLASSIFICATION_CODES.psc]),
    ),
  );

  return or(textEvidence, samTaxonomyEvidence)!;
}

/** Keep numeric constants bound while giving PostgreSQL enough type context
 * for unary operators such as the negative feedback-weight clamp. */
export function boundNumeric(value: number): SQL<number> {
  return sql<number>`${value}::numeric`;
}

export function opportunityListErrorDetail(
  error: unknown,
  exposeInternalDetail = process.env.NODE_ENV !== "production",
): string {
  if (!exposeInternalDetail) return "Opportunity query failed";
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unknown opportunity query error";
}

/**
 * Public Opportunities response columns. Keep this explicit instead of using
 * Drizzle's select-all so newly added backend-only identity columns do not make
 * the read endpoint depend on migrations that are unrelated to rendering the
 * Opportunities page.
 */
export function opportunityListSelection(
  table: typeof import("@workspace/db/schema").opportunitiesTable,
) {
  return {
    id: table.id,
    noticeId: table.noticeId,
    title: table.title,
    agency: table.agency,
    subAgency: table.subAgency,
    office: table.office,
    type: table.type,
    status: table.status,
    naicsCode: table.naicsCode,
    naicsDescription: table.naicsDescription,
    pscCode: table.pscCode,
    contractType: table.contractType,
    postedDate: table.postedDate,
    responseDeadline: table.responseDeadline,
    periodOfPerformance: table.periodOfPerformance,
    setAside: table.setAside,
    placeOfPerformance: table.placeOfPerformance,
    description: table.description,
    solicitationNumber: table.solicitationNumber,
    samUrl: table.samUrl,
    estimatedValue: table.estimatedValue,
    ceilingValue: table.ceilingValue,
    floorValue: table.floorValue,
    awardAmount: table.awardAmount,
    awardee: table.awardee,
    source: table.source,
    providerName: table.providerName,
    relevanceScore: table.relevanceScore,
    sourceConfidence: table.sourceConfidence,
    tags: table.tags,
    notes: table.notes,
    userConfidence: table.userConfidence,
    userGrade: table.userGrade,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt,
  } as const;
}
