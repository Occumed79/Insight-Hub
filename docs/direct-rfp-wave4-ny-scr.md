# Direct RFP Wave 4: New York State Contract Reporter Parser

Wave 4 adds the second state-level direct portal parser after Texas ESBD.

## Source

- Portal: New York State Contract Reporter
- Search URL: `https://www.nyscr.ny.gov/Ads/Search`
- Access: public open-opportunity listing
- Key required: no
- Login required: not for the public listing; detailed ad view may require a free NYSCR account

NYSCR is New York's official state procurement activity website. Its public open-opportunity search lists CR numbers, titles, agency/company, issue dates, due dates, location, category, and ad type.

## Provider

Provider name:

```text
nyScr
```

## Fetch payload

```json
{
  "providers": ["nyScr"],
  "keywords": "occupational health drug testing DOT physical medical surveillance",
  "dateRange": 90
}
```

Endpoint:

```text
POST /api/opportunities/fetch
```

## What the parser extracts

- Title
- CR number
- Agency or company
- Division
- Issue date
- Due date
- Location
- Category
- Ad type
- Note
- Public search/listing source URL

## Quality controls

- Skips expired due dates.
- Applies existing unified quality gate before inserting.
- Uses stable external IDs: `ny-scr-{CR#}`.
- Stores records in the RFP DB with official portal metadata.

## Safety

- No database schema changes.
- No migrations.
- No new env vars.
- No Serper/Tavily/AI quota required for this provider.

## Next direct parser queue

1. Virginia eVA
2. Pennsylvania eMarketplace
3. California Cal eProcure
4. Florida Vendor Bid System
