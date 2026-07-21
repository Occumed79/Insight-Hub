import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  boundTextArray,
  likeAnyText,
  notLikeAnyText,
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
});
