import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  boundNumeric,
  boundTextArray,
  likeAnyText,
  notLikeAnyText,
  opportunityListErrorDetail,
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
