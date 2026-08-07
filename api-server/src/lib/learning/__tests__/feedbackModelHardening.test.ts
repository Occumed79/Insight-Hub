import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { candidateSharesFeedbackSignal, scoreOpportunity } = await import(
  "../feedbackModel"
);

const baseWeights = {
  agencies: {},
  naicsCodes: {},
  providers: { tango: -100, serper: 100 },
  tags: {},
  keywords: {},
  totalGrades: 10,
};

const baseCandidate = {
  id: "candidate-1",
  agency: "Unrelated Agency",
  naics_code: "541512",
  provider_name: "tango",
  tags: JSON.stringify(["construction", "technology"]),
  title: "Network modernization services",
  description: "Replace network infrastructure.",
  user_grade: null,
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

test("unrelated tagged records are excluded from bounded rescoring", () => {
  assert.equal(
    candidateSharesFeedbackSignal(
      {
        id: "graded-1",
        agency: "County Health Department",
        naicsCode: "621999",
        tags: JSON.stringify(["audiometry", "occupational-health"]),
        title: "Occupational audiometric testing",
      },
      baseCandidate,
    ),
    false,
  );
});

test("real agency, NAICS, tag, or title overlap remains eligible", () => {
  const graded = {
    id: "graded-1",
    agency: "County Health Department",
    naicsCode: "621999",
    tags: JSON.stringify(["audiometry", "occupational-health"]),
    title: "Occupational audiometric testing",
  };

  assert.equal(
    candidateSharesFeedbackSignal(graded, {
      ...baseCandidate,
      agency: "County Health Department",
    }),
    true,
  );
  assert.equal(
    candidateSharesFeedbackSignal(graded, {
      ...baseCandidate,
      tags: JSON.stringify(["audiometry"]),
    }),
    true,
  );
  assert.equal(
    candidateSharesFeedbackSignal(graded, {
      ...baseCandidate,
      title: "Audiometric testing contract",
    }),
    true,
  );
});

test("already graded candidates stay isolated from bounded rescoring", () => {
  assert.equal(
    candidateSharesFeedbackSignal(
      {
        id: "graded-1",
        agency: "County Health Department",
        title: "Audiometric testing",
      },
      {
        ...baseCandidate,
        agency: "County Health Department",
        user_grade: "poor",
      },
    ),
    false,
  );
});
