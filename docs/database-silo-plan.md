# Database silo plan

Insight Hub now treats the RFP/opportunity portal and the broader intelligence/client/prospect sections as separate logical data domains.

## Environment variables

Use exactly two database URLs in production:

- `RFP_DATABASE_URL` — the current Insight Hub RFP/opportunity Neon database.
- `INTEL_DATABASE_URL` — the new non-RFP intelligence/client/prospect/source-monitor Neon database.

`DATABASE_URL` is not used by the siloed app after this change. Do not set it as a third database layer. If Render still has `DATABASE_URL` from an older deployment, it should be removed after `RFP_DATABASE_URL` and `INTEL_DATABASE_URL` are set.

## RFP database ownership

The RFP database owns only opportunity search data and RFP user feedback.

Tables:

- `opportunities`
- `opportunity_feedback`
- `opportunity_ingestion_runs`
- `opportunity_ingestion_run_sources`
- `opportunity_raw_records`
- `opportunity_staging`
- `opportunity_source_registry`
- `opportunity_dedupe_keys`
- `settings` for RFP-specific settings until settings are split further

Potential future RFP-only tables should also live here:

- `opportunity_search_index`

## Intel database ownership

The intel database owns non-RFP application sections.

Tables:

- `federal_intel_items`
- `state_profiles`
- `state_agency_items`
- `state_intel_items`
- `intel_feed_items`
- `intel_feed_signals`
- `source_monitor_items`
- `source_monitor_runs`
- `clients`
- `client_branches`
- `client_contacts`
- `prospects`
- `prospect_locations`
- `prospect_jobs`
- `prospect_contacts`
- `competitors`
- `branch_hiring_posts`

## Runtime routing

The `@workspace/db` package exposes two concrete clients:

- `rfpDb`
- `intelDb`

Runtime code should import the concrete client for its domain. Opportunity,
feedback, provider-setting, manual-ingestion, staging, lineage, and dedupe paths
use `rfpDb`. Client, prospect, intelligence, competitor, and source-monitor
paths use `intelDb`. Request-scoped routing remains only as compatibility
protection for older code and is not a substitute for explicit ownership.

## Manual RFP ingestion ownership

The Opportunities fetch button is the only trigger for ingestion. A manual run
is recorded in `opportunity_ingestion_runs`; each selected provider is tracked
in `opportunity_ingestion_run_sources`. Provider records are retained in
`opportunity_raw_records`, normalized and quality-classified in
`opportunity_staging`, then accepted records are transactionally resolved
through `opportunity_dedupe_keys` into `opportunities`. Source lineage remains
in `opportunity_source_registry`, including when a raw record is a duplicate of
an existing canonical opportunity.

No cron, timer, startup ingestion, GitHub Actions ingestion, or unattended
rerun is configured. Deadline archival occurs when a manually initiated run
finishes or when the explicit manual reconciliation endpoint is called.

## Migration sequence

1. Set `RFP_DATABASE_URL` to the current Insight Hub RFP Neon database.
2. Set `INTEL_DATABASE_URL` to the new empty Neon database.
3. Remove the old `DATABASE_URL` env var from Render so there is no ambiguous third DB setting.
4. Run `pnpm db:push` against the RFP database before directing traffic to this release. This additively creates the manual-run, raw, staging, source-registry, and dedupe tables and adds `first_seen_at` / `last_seen_at`.
5. Run `pnpm db:push:intel` to create intel tables in the empty intel DB when provisioning a new intel database.
6. Run `pnpm db:verify-silo` and confirm the RFP DB and intel DB point to different databases and export only their owned schemas.
7. Export non-RFP data from the current RFP DB.
8. Import non-RFP data into the intel DB.
9. Run `pnpm db:verify-silo` again and compare row counts.
10. Only after row counts are verified, clean non-RFP tables from the RFP DB.

## Destructive cleanup rule

Do not drop or delete non-RFP tables from the RFP DB until the intel DB has been populated and verified.
