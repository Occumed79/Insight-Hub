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
