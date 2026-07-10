# Direct RFP Portal Catalog

This catalog is the source-of-truth for official RFP/procurement portals that should be considered before any quota-based search or AI provider.

## Rule

Direct buyer/source portals come first:

1. SAM.gov and official state/district procurement portals
2. Dedicated parser or structured export/API when available
3. Quality gate and dedupe
4. Opportunity staging/promote-to-visible flow
5. Search, scraping, and AI only after cheap direct-source filters pass

## Explicitly excluded from the direct-source layer

These can be useful for discovery or enrichment, but they are not direct official source foundations:

- BidNet
- DemandStar
- GovWin
- PlanetBids network pages
- OpenGov network pages
- Periscope/S2G
- Generic Google/Search API results
- USAspending award records
- Federal Register policy/regulatory notices

USAspending and Federal Register belong in Federal Agencies intelligence windows, not the RFP/opportunity source list.

## Implementation in this branch

- `api-server/src/lib/providers/directRfpPortals.ts` contains the official portal catalog.
- `api-server/src/lib/providers/statePortals.ts` now uses that catalog instead of a mixed aggregator-heavy list.
- `GET /api/rfp-sources` exposes catalog metadata for admin/UI work and parser planning.
- `scripts/validate-direct-rfp-portals.mjs` validates catalog coverage and blocks aggregator leakage.

## Parser priority

Wave 1 should become dedicated parsers first:

1. SAM.gov
2. Texas ESBD / Texas SmartBuy
3. New York State Contract Reporter
4. Virginia eVA
5. Pennsylvania eMarketplace
6. California Cal eProcure
7. Florida Vendor Bid System
8. OhioBuys
9. Washington WEBS
10. eMaryland Marketplace Advantage
11. North Carolina eVP

## Wave 2 guardrails

Run this before merging direct source edits:

```bash
pnpm rfp:sources:validate
```

The validator fails if:

- SAM.gov is missing.
- The catalog has fewer than 45 direct portal entries after SAM.
- Any expected U.S. state is missing.
- Blocked aggregator domains leak into the direct catalog.
- Duplicate source IDs exist.

## Build safety

This change does not add tables, migrations, DB pushes, or env vars. It is a catalog/routing foundation only.

The production build command must stay non-destructive:

```bash
pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/intel-suite run build
```
