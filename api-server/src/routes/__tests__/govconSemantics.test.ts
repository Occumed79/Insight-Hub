import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { isGovConSemanticCandidate } = await import("../govcon");

const DAY_MS = 86_400_000;

function currentFederalFiscalYear(now: number): number {
  const date = new Date(now);
  return date.getUTCFullYear() + (date.getUTCMonth() >= 9 ? 1 : 0);
}

function candidate(now: number, overrides: Record<string, unknown> = {}) {
  return {
    id: "forecast-1",
    source: "agency",
    sourceId: "1",
    title: "Occupational health services forecast",
    agency: "Department of Example",
    subAgency: null,
    description: "Planned occupational health requirement",
    naics: "621111",
    setAside: null,
    state: null,
    valueRangeText: null,
    valueLow: null,
    valueHigh: null,
    estimatedSolicitationDate: new Date(now + 90 * DAY_MS).toISOString(),
    estimatedAwardFiscalYear: currentFederalFiscalYear(now) + 1,
    estimatedAwardQuarter: "Q2",
    status: "planned",
    isRecompete: false,
    recompeteEvidence: "none",
    incumbentName: null,
    incumbentAward: null,
    pointOfContact: { name: null, email: null, phone: null },
    sourceUrl: "https://example.gov/forecast/1",
    lastUpdatedDate: new Date(now).toISOString(),
    ...overrides,
  } as any;
}

test("forecast mode requires forward-looking forecast semantics", () => {
  const now = Date.now();
  assert.equal(isGovConSemanticCandidate(candidate(now), "forecast", now), true);
  assert.equal(
    isGovConSemanticCandidate(candidate(now, { status: "closed" }), "forecast", now),
    false,
  );
});

test("stale forecast dates are rejected even when status says planned", () => {
  const now = Date.now();
  assert.equal(
    isGovConSemanticCandidate(
      candidate(now, {
        estimatedSolicitationDate: new Date(now - 60 * DAY_MS).toISOString(),
        estimatedAwardFiscalYear: null,
        estimatedAwardQuarter: null,
        status: "planned",
      }),
      "forecast",
      now,
    ),
    false,
  );
});

test("past award fiscal years are rejected when no future timing exists", () => {
  const now = Date.now();
  assert.equal(
    isGovConSemanticCandidate(
      candidate(now, {
        estimatedSolicitationDate: null,
        estimatedAwardFiscalYear: currentFederalFiscalYear(now) - 1,
        estimatedAwardQuarter: "Q4",
        status: "forecast",
      }),
      "forecast",
      now,
    ),
    false,
  );
});

test("status fallback is used only when timing fields are absent", () => {
  const now = Date.now();
  assert.equal(
    isGovConSemanticCandidate(
      candidate(now, {
        estimatedSolicitationDate: null,
        estimatedAwardFiscalYear: null,
        estimatedAwardQuarter: null,
        status: "anticipated",
      }),
      "forecast",
      now,
    ),
    true,
  );
});

test("normal active solicitations are not automatically recompetes", () => {
  const now = Date.now();
  assert.equal(
    isGovConSemanticCandidate(
      candidate(now, {
        status: "active",
        isRecompete: false,
        recompeteEvidence: "none",
      }),
      "recompete",
      now,
    ),
    false,
  );
});

test("recompete mode requires incumbent or award evidence", () => {
  const now = Date.now();
  assert.equal(
    isGovConSemanticCandidate(
      candidate(now, {
        isRecompete: true,
        recompeteEvidence: "none",
      }),
      "recompete",
      now,
    ),
    false,
  );

  assert.equal(
    isGovConSemanticCandidate(
      candidate(now, {
        isRecompete: true,
        recompeteEvidence: "incumbent-award",
        incumbentName: "Incumbent Corp",
        incumbentAward: {
          recipientName: "Incumbent Corp",
          currentValue: 2_000_000,
          expires: new Date(now + 240 * DAY_MS).toISOString(),
          awardingAgency: "Department of Example",
          latestActionDate: new Date(now - 30 * DAY_MS).toISOString(),
        },
      }),
      "recompete",
      now,
    ),
    true,
  );
});

test("very stale incumbent expirations do not remain recompete candidates", () => {
  const now = Date.now();
  assert.equal(
    isGovConSemanticCandidate(
      candidate(now, {
        estimatedSolicitationDate: null,
        isRecompete: true,
        recompeteEvidence: "incumbent-award",
        incumbentName: "Old Incumbent",
        incumbentAward: {
          recipientName: "Old Incumbent",
          currentValue: 1_000_000,
          expires: new Date(now - 400 * DAY_MS).toISOString(),
          awardingAgency: "Department of Example",
          latestActionDate: null,
        },
      }),
      "recompete",
      now,
    ),
    false,
  );
});
