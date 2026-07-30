import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { meaningfulLocalSearchTerms } from "../localSearchPolicy";

describe("Opportunity Intelligence local-search policy", () => {
  it("drops generic procurement filler and keeps the service intent", () => {
    assert.deepEqual(
      meaningfulLocalSearchTerms(
        "find me open government RFP opportunities for occupational health services",
      ),
      ["occupational", "health"],
    );
  });

  it("requires each meaningful concept instead of matching generic services", () => {
    assert.deepEqual(
      meaningfulLocalSearchTerms("drug testing and DOT physical services"),
      ["drug", "testing", "dot", "physical"],
    );
  });
});
