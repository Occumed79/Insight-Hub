import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyResult, type RelevanceInput } from "../relevance";

type TrustedInput = RelevanceInput & { trustedProcurementContext: boolean };

function classifyTrusted(input: Omit<TrustedInput, "trustedProcurementContext">) {
  const trusted: TrustedInput = {
    ...input,
    trustedProcurementContext: true,
  };
  return classifyResult(trusted);
}

describe("trusted structured procurement context", () => {
  it("lets a medically relevant row pass even when the row omits RFP wording", () => {
    const result = classifyTrusted({
      title: "Employee Medical Examinations",
      description:
        "Pre-employment physical examinations, medical surveillance, audiometry and spirometry for city employees.",
      url: "https://data.example.gov/procurement/123",
      deadlineInFuture: true,
    });

    assert.equal(result.rejected, false);
    assert.ok(result.score >= 65);
    assert.deepEqual(result.matchedProcurementSignals, []);
  });

  it("does not turn a generic construction procurement into an Occu-Med match", () => {
    const result = classifyTrusted({
      title: "Bridge Rehabilitation",
      description: "Concrete paving, structural steel and roadway construction.",
      deadlineInFuture: true,
    });

    assert.equal(result.rejected, true);
  });

  it("does not turn employee-benefits procurement into occupational medical scope", () => {
    const result = classifyTrusted({
      title: "Employee Health Benefits Administration",
      description: "Health insurance plan enrollment and benefits administration for employees.",
      deadlineInFuture: true,
    });

    assert.equal(result.rejected, true);
  });
});
