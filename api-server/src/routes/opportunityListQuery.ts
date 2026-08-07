import { sql, type SQL } from "drizzle-orm";

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
