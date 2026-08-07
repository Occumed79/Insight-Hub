import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/rfp_core";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/intel";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/auth";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/app";

const architecture = await import("../sourceArchitecture");
const { MANUAL_RFP_PROVIDERS } = await import("../ingestion/providerRunner");
const { PROVIDER_DEFINITIONS } = await import("../config/providerConfig");
const { PROVIDER_TIERS } = await import("../config/providerTiers");
const { providerBudgetPolicy } = await import("../providerBudget");
const { deriveOpportunityContext, normalizeQueryContext } = await import(
  "../learning/contextualFeedback"
);

const DISCOVERY_ROLES = [
  "direct_source",
  "browser_discovery",
  "intelligence",
] as const;

test("source architecture has one valid owner for every configured integration", () => {
  assert.deepEqual(architecture.validateSourceArchitecture(), []);

  for (const name of Object.keys(PROVIDER_DEFINITIONS)) {
    const source = architecture.sourceDefinition(name);
    assert.ok(source, `${name} is missing from sourceArchitecture.ts`);
    const tier = PROVIDER_TIERS[name as keyof typeof PROVIDER_TIERS];
    assert.ok(tier, `${name} is missing from providerTiers.ts`);
    if (tier.tier === "disabled") {
      assert.equal(source?.active, false, `${name} is disabled in tiers but active in source ownership`);
      assert.equal(source?.role, "legacy_disabled", `${name} must use legacy_disabled ownership`);
    }
  }

  for (const source of architecture.INSIGHT_SOURCE_ARCHITECTURE) {
    if (source.active) assert.notEqual(source.role, "legacy_disabled");
  }
});

test("manual RFP runtime excludes disabled crawler and browser automation paths", () => {
  for (const disabled of [
    "scheduledCrawler",
    "selfHostedCrawler",
    "selfHostedSearch",
    "localLlm",
    "browseAi",
    "browserUse",
  ]) {
    assert.equal(MANUAL_RFP_PROVIDERS.has(disabled), false, disabled);
  }

  for (const provider of [
    "samGov",
    "tango",
    "rssAggregator",
    "emailNotifications",
  ]) {
    assert.equal(
      architecture.sourceAllowedForRoles(provider, DISCOVERY_ROLES),
      true,
      provider,
    );
  }
  assert.throws(() =>
    architecture.assertSourceAllowedForRoles(
      "selfHostedCrawler",
      DISCOVERY_ROLES,
    ),
  );
  assert.throws(() =>
    architecture.assertSourceAllowedForRoles("jina", ["browser_discovery"]),
  );
});

test("provider budget policy enforces configured daily monthly and reserve ceilings", () => {
  const oldDaily = process.env.INSIGHT_BUDGET_LANGSEARCH_PRIMARY_DAILY;
  const oldMonthly = process.env.INSIGHT_BUDGET_LANGSEARCH_PRIMARY_MONTHLY;
  const oldReserve = process.env.INSIGHT_BUDGET_LANGSEARCH_PRIMARY_RESERVE;
  try {
    process.env.INSIGHT_BUDGET_LANGSEARCH_PRIMARY_DAILY = "100";
    process.env.INSIGHT_BUDGET_LANGSEARCH_PRIMARY_MONTHLY = "2000";
    process.env.INSIGHT_BUDGET_LANGSEARCH_PRIMARY_RESERVE = "25";
    assert.deepEqual(providerBudgetPolicy("langsearch:primary"), {
      dailyLimit: 100,
      monthlyLimit: 2000,
      reserve: 25,
    });
  } finally {
    if (oldDaily === undefined) {
      delete process.env.INSIGHT_BUDGET_LANGSEARCH_PRIMARY_DAILY;
    } else {
      process.env.INSIGHT_BUDGET_LANGSEARCH_PRIMARY_DAILY = oldDaily;
    }
    if (oldMonthly === undefined) {
      delete process.env.INSIGHT_BUDGET_LANGSEARCH_PRIMARY_MONTHLY;
    } else {
      process.env.INSIGHT_BUDGET_LANGSEARCH_PRIMARY_MONTHLY = oldMonthly;
    }
    if (oldReserve === undefined) {
      delete process.env.INSIGHT_BUDGET_LANGSEARCH_PRIMARY_RESERVE;
    } else {
      process.env.INSIGHT_BUDGET_LANGSEARCH_PRIMARY_RESERVE = oldReserve;
    }
  }
});

test("query contexts remain distinct and service scope fallback is stable", () => {
  assert.equal(
    normalizeQueryContext("  Audiometric testing, HEARING conservation!! "),
    "audiometric testing hearing conservation",
  );
  assert.notEqual(
    normalizeQueryContext("audiometric testing"),
    normalizeQueryContext("drug and alcohol testing"),
  );
  const context = deriveOpportunityContext({
    title: "Occupational Health Audiometric Testing RFP",
    agency: "Department of Example",
    description: "Employee hearing conservation and audiogram services",
  });
  assert.match(context, /scope:/);
  assert.match(context, /audiometry|occupational-health/);
});
