import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { scoreOpportunity } = await import("../feedbackModel");

const baseWeights = {
  agencies: {},
  naicsCodes: {},
  providers: { tango: -100, serper: 100 },
  tags: {},
  keywords: {},
  totalGrades: 10,
};

test("provider identity cannot poison or boost relevance", () => {
  assert.equal(
    scoreOpportunity({ providerName: "tango", title: "Example" }, baseWeights),
    50,
  );
  assert.equal(
    scoreOpportunity({ providerName: "serper", title: "Example" }, baseWeights),
    50,
  );
});

test("scope/content feedback still changes relevance", () => {
  const weights = {
    ...baseWeights,
    agencies: { "Department of Example": 2 },
    keywords: { audiometric: 3 },
  };
  assert.equal(
    scoreOpportunity(
      {
        providerName: "tango",
        agency: "Department of Example",
        title: "Audiometric testing services",
      },
      weights,
    ),
    72,
  );
});
