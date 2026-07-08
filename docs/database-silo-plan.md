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
- `settings` for RFP-specific settings until settings are split further

Future RFP-only tables should also live here:

- `opportunity_staging`
- `opportunity_source_registry`
- `opportunity_dedupe_keys`
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

Existing imports of `db` use a request-scoped logical context. API paths for non-RFP sections route to the intel DB context; everything else defaults to the RFP DB context.

## Migration sequence

1. Set `RFP_DATABASE_URL` to the current Insight Hub RFP Neon database.
2. Set `INTEL_DATABASE_URL` to the new empty Neon database.
3. Remove the old `DATABASE_URL` env var from Render so there is no ambiguous third DB setting.
4. Run `pnpm db:push:intel` to create intel tables in the empty intel DB.
5. Run `pnpm db:verify-silo` and confirm the RFP DB and intel DB point to different databases.
6. Export non-RFP data from the current RFP DB.
7. Import non-RFP data into the intel DB.
8. Run `pnpm db:verify-silo` again and compare row counts.
9. Only after row counts are verified, clean non-RFP tables from the RFP DB.

## Destructive cleanup rule

Do not drop or delete non-RFP tables from the RFP DB until the intel DB has been populated and verified.
