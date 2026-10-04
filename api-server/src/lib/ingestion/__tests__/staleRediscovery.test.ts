import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeSourceRefresh } from "../pipelineRules";

const now = new Date("2026-10-03T12:00:00Z");
const past = new Date("2026-08-01T00:00:00Z");
const future = new Date("2026-12-01T00:00:00Z");
const rec = (provider: string, status: string, deadline: Date | null, extra = {}) => ({
  providerName: provider,
  status,
  responseDeadline: deadline,
  title: "Occupational Health Services",
  ...extra,
});

describe("stale/expired records are not reactivated by rediscovery", () => {
  const cases: Array<[string, ReturnType<typeof rec>, ReturnType<typeof rec>, string]> = [
    ["same provider, past deadline", rec("samGov", "archived", past), rec("samGov", "active", past), "archived"],
    ["lower-authority provider", rec("samGov", "archived", past), rec("texasEsbd", "active", past), "archived"],
    ["higher-authority provider, past deadline", rec("texasEsbd", "archived", past), rec("samGov", "active", past), "archived"],
    ["web search rediscovery", rec("samGov", "archived", past), rec("langsearch", "active", past), "archived"],
    ["rediscovery without a deadline", rec("samGov", "archived", past), rec("samGov", "active", null), "archived"],
    ["higher-authority provider, no deadline", rec("texasEsbd", "archived", past), rec("samGov", "active", null), "archived"],
    ["same deadline restated as future-looking active", rec("samGov", "archived", past), rec("samGov", "active", past), "archived"],
    ["active record whose deadline has passed is archived on refresh", rec("samGov", "active", past), rec("samGov", "active", past), "archived"],
    ["closed source status is archived", rec("samGov", "active", future), rec("samGov", "active", future, { rawData: { status: "Awarded" } }), "archived"],
  ];
  for (const [name, existing, incoming, expected] of cases) {
    it(name, () => {
      assert.equal(mergeSourceRefresh(existing, incoming, now).status, expected);
    });
  }

  it("reactivates only on an affirmative later, still-open deadline", () => {
    const merged = mergeSourceRefresh(rec("texasEsbd", "archived", past), rec("samGov", "active", future), now);
    assert.equal(merged.status, "active");
    assert.equal(merged.responseDeadline, future);
  });

  it("an earlier-than-existing deadline does not reactivate", () => {
    const earlier = new Date("2026-07-01T00:00:00Z");
    assert.equal(mergeSourceRefresh(rec("samGov", "archived", past), rec("samGov", "active", earlier), now).status, "archived");
  });

  it("a live record with a future deadline stays active", () => {
    assert.equal(mergeSourceRefresh(rec("samGov", "active", future), rec("samGov", "active", future), now).status, "active");
  });

  it("canonical ownership and preserved fields are unaffected", () => {
    const merged = mergeSourceRefresh({ ...rec("texasEsbd", "active", future), id: "x", notes: "keep" }, { ...rec("samGov", "active", future), id: "y", notes: "drop" }, now);
    assert.equal(merged.providerName, "samGov");
    assert.equal((merged as any).id, "x");
    assert.equal((merged as any).notes, "keep");
  });
});
