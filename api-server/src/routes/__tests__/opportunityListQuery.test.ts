import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { opportunitiesTable } from "@workspace/db/schema";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  boundNumeric,
  boundTextArray,
  likeAnyText,
  notLikeAnyText,
  opportunityListErrorDetail,
  opportunityListSelection,
} from "../opportunityListQuery";

const dialect = new PgDialect();

describe("opportunity list PostgreSQL pattern filters", () => {
  it("binds LIKE ANY values as a text array instead of a record tuple", () => {
    const query = dialect.sqlToQuery(
      likeAnyText(sql`lower(title)`, ["%occupational health%", "%drug test%"]),
    );

    assert.match(query.sql, /LIKE ANY\(ARRAY\[\$1, \$2\]::text\[\]\)/);
    assert.doesNotMatch(query.sql, /ANY\(\(\$1, \$2\)\)/);
    assert.deepEqual(query.params, ["%occupational health%", "%drug test%"]);
  });

  it("builds a valid empty text array and a negated filter", () => {
    assert.equal(dialect.sqlToQuery(boundTextArray([])).sql, "ARRAY[]::text[]");
    assert.match(
      dialect.sqlToQuery(notLikeAnyText(sql`lower(title)`, ["%vacancy%"])).sql,
      /^NOT \(lower\(title\) LIKE ANY\(ARRAY\[\$1\]::text\[\]\)\)$/,
    );
  });

  it("casts bound feedback weights before applying unary minus", () => {
    const query = dialect.sqlToQuery(
      sql`GREATEST(-(${boundNumeric(15)}), 0::numeric)`,
    );

    assert.equal(query.sql, "GREATEST(-($1::numeric), 0::numeric)");
    assert.deepEqual(query.params, [15]);
  });

  it("preserves the real database error for the API response", () => {
    assert.equal(
      opportunityListErrorDetail(
        new Error("operator is not unique: - unknown"),
      ),
      "operator is not unique: - unknown",
    );
    assert.equal(
      opportunityListErrorDetail(undefined),
      "Unknown opportunity query error",
    );
  });
});


describe("opportunity list production schema compatibility", () => {
  it("does not select backend-only provider_key for the public list response", () => {
    const query = dialect.sqlToQuery(
      sql`select ${sql.join(
        Object.entries(opportunityListSelection(opportunitiesTable)).map(
          ([alias, column]) => sql`${column} as ${sql.identifier(alias)}`,
        ),
        sql`, `,
      )} from ${opportunitiesTable}`
    );

    assert.doesNotMatch(query.sql, /provider_key/);
    assert.match(query.sql, /provider_name/);
    assert.match(query.sql, /user_confidence/);
  });

  it("renders SQL for every Opportunities page filter combination", () => {
    const filters = [
      undefined,
      eq(opportunitiesTable.status, "active"),
      ilike(opportunitiesTable.type, "%Solicitation%"),
      sql`${opportunitiesTable.postedDate} >= ${new Date("2026-07-01T00:00:00.000Z")}`,
      ilike(opportunitiesTable.providerName, "samGov"),
      or(
        ilike(opportunitiesTable.title, "%drug%"),
        ilike(opportunitiesTable.agency, "%drug%"),
        ilike(opportunitiesTable.description, "%drug%"),
        ilike(opportunitiesTable.solicitationNumber, "%drug%"),
      ),
    ];

    const where = and(...filters.filter(Boolean) as any[]);
    const rankExpr = sql<number>`COALESCE(${opportunitiesTable.relevanceScore}::numeric, 50)`;
    const query = dialect.sqlToQuery(
      sql`select ${sql.join(
        Object.entries(opportunityListSelection(opportunitiesTable)).map(
          ([alias, column]) => sql`${column} as ${sql.identifier(alias)}`,
        ),
        sql`, `,
      )} from ${opportunitiesTable} where ${where} order by ${desc(rankExpr)} limit ${50} offset ${0}`
    );

    assert.match(query.sql, /where/);
    assert.match(query.sql, /order by/);
    assert.doesNotMatch(query.sql, /provider_key/);
  });
});
