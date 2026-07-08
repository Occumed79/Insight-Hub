# Database silo plan

Insight Hub now treats the RFP/opportunity portal and the broader intelligence/client/prospect sections as separate logical data domains.

## Environment variables

Use two database URLs in production:

- `RFP_DATABASE_URL` — the RFP/opportunity database.
- `INTEL_DATABASE_URL` — the non-RFP intelligence/client/prospect/source-monitor database.

`DATABASE_URL` remains a temporary fallback so existing environments do not crash while deployment variables are being updated. Do not rely on that fallback long term.

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

For backward compatibility, existing imports of `db` use a request-scoped logical context. API paths for non-RFP sections route to the intel DB context; everything else defaults to the RFP DB context.

## Migration sequence

1. Set `RFP_DATABASE_URL` to the current Insight Hub RFP Neon database.
2. Set `INTEL_DATABASE_URL` to the new empty Neon database.
3. Run `pnpm db:push:intel` to create intel tables in the empty intel DB.
4. Run `pnpm db:verify-silo` and confirm the RFP DB and intel DB point to different databases.
5. Export non-RFP data from the current RFP DB.
6. Import non-RFP data into the intel DB.
7. Run `pnpm db:verify-silo` again and compare row counts.
8. Only after row counts are verified, clean non-RFP tables from the RFP DB.

## Destructive cleanup rule

Do not drop or delete non-RFP tables from the RFP DB until the intel DB has been populated and verified.
