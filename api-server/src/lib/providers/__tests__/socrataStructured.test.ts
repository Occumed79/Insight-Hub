import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SocrataProvider } from "../socrata";
import { sourceDefinition } from "../../sourceArchitecture";

describe("Socrata structured procurement boundary", () => {
  it("never emits catalog dataset metadata as an opportunity", async () => {
    const provider = new SocrataProvider();
    provider.search = async () => [
      {
        title: "Award Solicitations",
        description: "Daily list of active county contracts.",
        url: "https://data.montgomerycountymd.gov/d/ku39-t2wt",
        domain: "data.montgomerycountymd.gov",
        assetId: "ku39-t2wt",
        updatedAt: "2026-09-10T00:00:00.000Z",
      },
    ];

    const result = await provider.fetch({ keywords: "occupational health" });

    assert.equal(result.records.length, 0);
  });

  it("owns Socrata as a direct structured source, not browser discovery", () => {
    assert.equal(sourceDefinition("socrata")?.role, "direct_source");
  });
});
