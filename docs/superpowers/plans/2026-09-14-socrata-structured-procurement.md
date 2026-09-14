# Socrata Structured Procurement Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Socrata catalog-as-opportunity path with curated SODA3 row ingestion, explicit dataset routing, shared Occu-Med relevance, freshness/schema guards, and safe expansion through catalog quarantine.

**Architecture:** Socrata becomes a first-class structured government-data source rather than a member of generic web discovery. A curated dataset registry drives SODA3 POST queries and row normalization. Dataset class controls destination: live solicitations may enter Opportunities after row-level Occu-Med relevance; forecasts route to forecast/early-warning; awards/contracts/tabulations route to intelligence only; disabled/stale/schema-broken profiles fail closed.

**Tech Stack:** TypeScript, Node.js fetch, Socrata SODA3/SoQL, existing `NormalizedOpportunity`, `classifyResult()`, providerRunner ingestion, Node test runner.

**Spec:** User-provided `Insight_Hub_Socrata_OccuMed_RFP_Integration_Working_Document_FINAL.docx` (September 14, 2026).

## Global Constraints

- Catalog Discovery (`api.us.socrata.com/api/catalog/v1`) discovers/governs datasets only; catalog assets must never become opportunities.
- Production reads use SODA3 POST: `https://{domain}/api/v3/views/{datasetId}/query.json`.
- Public reads prefer `SOCRATA_APP_TOKEN` via `X-App-Token`; existing API-key/secret compatibility may remain.
- Shared Occu-Med ontology/relevance remains authoritative; no second Socrata-specific medical keyword engine.
- `trustedProcurementContext` may satisfy procurement-context evidence for qualified live feeds, but never medical/service relevance.
- Dataset history is routing evidence, never a whitelist against new buyers/services.
- Live, forecast, awards/intelligence, bid-tabulation, and disabled classes must remain separated at ingestion time.
- Schema/freshness failures fail closed per profile.
- Cross-source duplicates merge by solicitation/event identity rather than create duplicate cards.
- Production activation only after fixtures, live-read validation, and precision QA.

---

### Task 1: Separate catalog discovery from structured Socrata ingestion

**Files:**
- Create: `api-server/src/lib/providers/socrataCatalog.ts`
- Create: `api-server/src/lib/providers/socrataDatasetProfiles.ts`
- Modify: `api-server/src/lib/providers/socrata.ts`
- Test: `api-server/src/lib/providers/__tests__/socrataStructured.test.ts`

**Interfaces:**
- `SocrataDatasetProfile` defines `key`, `domain`, `datasetId`, `datasetClass`, `enabled`, `priority`, `expectedCadence`, `freshnessMaxAgeDays`, `fieldMap`, optional predicate/order/source URL template, `lastVerifiedAt`, optional schema fingerprint.
- `socrataCatalog.searchDatasets(query, signal)` returns dataset metadata only.
- `socrataProvider.fetch()` must never call catalog discovery to produce opportunity records.

- [ ] Write a failing test proving a catalog hit such as “Award Solicitations” cannot be returned by `socrataProvider.fetch()` as a `NormalizedOpportunity`.
- [ ] Add registry types and seed profiles from the FINAL document, with Tier A live profiles enabled only behind the structured flag.
- [ ] Move current catalog-search code into `socrataCatalog.ts` and keep it reusable for scout/quarantine work.
- [ ] Refactor `socrata.ts` so `fetch()` delegates only to structured row ingestion.
- [ ] Run `pnpm --filter @workspace/api-server typecheck` and the Socrata test file.
- [ ] Commit.

### Task 2: Add trusted procurement context to the shared relevance engine

**Files:**
- Modify: `api-server/src/lib/search/relevance.ts`
- Test: `api-server/src/lib/search/__tests__/socrataTrustedContext.test.ts`

**Interfaces:**
- Extend `RelevanceInput` with `trustedProcurementContext?: boolean`.
- Qualified context sets the procurement-context predicate true but does not add explicit medical/service evidence.

- [ ] Write failing tests: “Employee Medical Examinations” from a trusted live feed passes when scope is medically relevant; generic construction from the same feed still fails; employee-benefits-only procurement still fails/penalizes.
- [ ] Implement `trustedProcurementContext` as an alternative to literal procurement wording in path gating only.
- [ ] Preserve all hard rejects and service-evidence requirements.
- [ ] Run targeted relevance tests and `test:quality`.
- [ ] Commit.

### Task 3: Implement SODA3 row client, profile validation, and normalization

**Files:**
- Create: `api-server/src/lib/providers/socrataRowAdapter.ts`
- Modify: `api-server/src/lib/providers/socrata.ts`
- Modify: `api-server/src/lib/providers/socrataDatasetProfiles.ts`
- Test: `api-server/src/lib/providers/__tests__/socrataStructured.test.ts`

**Interfaces:**
- `querySocrataDataset(profile, options)` POSTs SODA3 SoQL with `X-App-Token`, deterministic ordering, bounded page size, and abort timeout.
- `normalizeSocrataRow(profile, row)` returns `NormalizedOpportunity | null`.
- `externalId = socrata:${domain}:${datasetId}:${rowPrimaryKey}`.
- `rawData.socrata` preserves `domain`, `datasetId`, `datasetLabel`, `datasetClass`, profile version, and original row.

- [ ] Add fixture rows for LA, SF, Montgomery County, NYC Current RFP, NYC Current Bids, and CityRecView.
- [ ] Write failing mapping tests for ID/title/agency/posted date/deadline/type/source URL and source provenance.
- [ ] Add objective server-side filtering: open/active/future deadline/relevant notice type/recent horizon as available per profile.
- [ ] Implement row-level expiration rejection before opportunity delivery.
- [ ] Implement schema validation/fingerprint checks and fail-closed diagnostics for missing required mappings.
- [ ] Implement freshness checks using cadence/max-age settings and quarantine stale profiles.
- [ ] Run Socrata fixtures, typecheck, and ingestion tests.
- [ ] Commit.

### Task 4: Make Socrata a direct structured source and remove it from generic web discovery

**Files:**
- Modify: `api-server/src/lib/sourceArchitecture.ts`
- Modify: `api-server/src/lib/config/providerConfig.ts`
- Modify: `api-server/src/lib/ingestion/providerRunner.ts`
- Modify: `api-server/src/lib/search/webIntelligence.ts`
- Modify: `api-server/src/lib/opportunityQuality.ts`
- Test: `api-server/src/lib/ingestion/__tests__/providerRunner.test.ts`
- Test: `api-server/src/lib/__tests__/opportunityQuality.test.ts`

**Interfaces:**
- Source architecture role for `socrata` becomes `direct_source`.
- `MANUAL_RFP_PROVIDERS`/default structured routing can invoke Socrata independently.
- Generic browser-discovery provider selection no longer contains Socrata.
- Official structured Socrata rows are treated as direct authoritative source evidence, not `search-discovery`.

- [ ] Write failing provider-runner test showing Socrata executes once as a structured provider rather than once per web discovery query.
- [ ] Remove `useSocrata` candidate generation from `webIntelligenceFetch` and discovery quota selection.
- [ ] Add a structured Socrata runner path with independent telemetry and guard handling.
- [ ] Update provider metadata/capabilities to “structured government open-data procurement.”
- [ ] Update opportunity-quality source classification so qualified live Socrata rows can be `official-direct` when row evidence is complete.
- [ ] Run providerRunner, quality, hardening, acceptance, and typecheck suites.
- [ ] Commit.

### Task 5: Enforce dataset-class routing and add forecast/intelligence destinations

**Files:**
- Modify: `api-server/src/lib/providers/socrataDatasetProfiles.ts`
- Modify: `api-server/src/lib/providers/socrataRowAdapter.ts`
- Modify: `api-server/src/lib/providers/socrata.ts`
- Modify: existing forecast/recompete ingestion modules located during implementation
- Test: `api-server/src/lib/providers/__tests__/socrataRouting.test.ts`

**Interfaces:**
- `live_solicitations` -> Opportunities provider output only after row-level relevance/open checks.
- `upcoming_forecast` -> forecast/early-warning ingestion only.
- `awards_intelligence` -> recompete/incumbent intelligence only.
- `bid_tabulation` -> competitor/pricing intelligence only.
- `disabled` -> no production output.

- [ ] Write failing routing tests for NYC Anticipated RFP, Cook FY2026 Buying Plan, Montgomery Award Solicitations, Cook Bid Tabulations, and Little Rock stale/disabled feed.
- [ ] Implement destination routing before UI/storage promotion.
- [ ] Guarantee Tier C/D records cannot be emitted by the live Socrata opportunity provider.
- [ ] Add dataset-class provenance to every stored intelligence record.
- [ ] Run routing and relevant forecast/recompete tests.
- [ ] Commit.

### Task 6: Add catalog scout quarantine and registry health diagnostics

**Files:**
- Create: `api-server/src/lib/providers/socrataRegistryScout.ts`
- Modify: registry persistence/schema modules located during implementation
- Modify: provider/runtime telemetry modules
- Test: `api-server/src/lib/providers/__tests__/socrataRegistryScout.test.ts`

**Interfaces:**
- Scout runs low-frequency short catalog queries (`solicitations`, `current bids`, `current rfp`, `request for proposals`, `bid opportunities`, `procurement notices`, `contract opportunities`, `upcoming procurements`, `acquisition forecast`).
- Candidates enter quarantine with metadata, domain, ID, columns, latest update, sample-row evidence, proposed class, score, and qualification status.
- New candidates never become production sources automatically.

- [ ] Write failing candidate-scoring/quarantine tests using positive reusable feeds and negative awards/stale/one-off datasets.
- [ ] Implement catalog candidate scoring and metadata/schema inspection.
- [ ] Persist quarantine records without enabling them.
- [ ] Re-probe disabled profiles periodically without deleting them.
- [ ] Emit `datasetProfilesScanned`, `datasetRowsFetched`, `openRows`, `relevanceAccepted`, `relevanceRejected`, `expiredRejected`, `schemaFailures`, `freshnessFailures`, `duplicatesMerged`, and `yieldByDataset` diagnostics.
- [ ] Run registry scout, ingestion, hardening, and typecheck tests.
- [ ] Commit.

### Task 7: Production acceptance and release gate

**Files:**
- Modify: CI/test manifest as needed so Socrata suites run in normal product gates.
- Test: live-read smoke test tooling that never writes/promotes unreviewed catalog candidates.

**Interfaces:**
- Structured feature flag remains off until acceptance gates pass.
- Acceptance target: >=90% precision in top surfaced Socrata live opportunities, zero catalog assets as opportunities, zero Tier C/D records in live RFPs, zero expired rows after expiration pass.

- [ ] Add Socrata fixture suites to `test:ingestion` / `test:quality` as appropriate.
- [ ] Run fixture tests, typecheck, full product build, hardening, acceptance benchmark, browser acceptance.
- [ ] Run bounded live reads against the P0 registry and inspect diagnostics without auto-enabling quarantined candidates.
- [ ] Verify top surfaced sample manually against the acceptance target.
- [ ] Enable `SOCRATA_STRUCTURED_ENABLED` only after gates pass; keep `SOCRATA_CATALOG_DISCOVERY_ENABLED` independently controlled.
- [ ] Merge only after CI and production deploy verification are green.
