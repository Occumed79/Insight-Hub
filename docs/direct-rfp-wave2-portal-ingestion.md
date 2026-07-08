# Direct RFP Wave 2: Official Portal Ingestion

Wave 1 created the direct official RFP portal catalog. Wave 2 makes the official state/district portal provider operational through the existing `/opportunities/fetch` path.

## What changed

- `statePortals.fetch()` now returns normalized opportunity records instead of always returning zero records.
- The provider still searches only official direct portal domains from `directRfpPortals.ts`.
- Aggregators remain excluded from the direct-source layer.
- Searches are quota-aware:
  - tier 1 and tier 2 official portals are searched by default
  - tier 3 portals stay off unless explicitly enabled by code options
  - total query count is capped per fetch run
  - results are deduped by normalized URL
- Normalization now preserves official portal metadata through `providerName`, `sourceConfidence`, tags, and notes.

## How to run

Use the existing fetch route with the official portal provider selected:

```json
{
  "providers": ["statePortals"],
  "keywords": "occupational health drug testing DOT physical",
  "dateRange": 90
}
```

Endpoint:

```text
POST /api/opportunities/fetch
```

## Safety

- No database schema changes.
- No migrations.
- No build script changes.
- No new env vars.
- Still depends on `SERPER_API_KEY` because this wave uses cheap official-domain discovery before dedicated parsers are built.

## Next

Wave 3 should add dedicated parser/importer implementations for the first official portals, starting with Texas ESBD / Texas SmartBuy.
