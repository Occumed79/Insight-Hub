# Direct RFP Wave 3: Texas ESBD / Texas SmartBuy Parser

Wave 3 adds the first dedicated direct portal parser.

## Source

- Portal: Texas ESBD / Texas SmartBuy
- URL: `https://www.txsmartbuy.gov/esbd`
- Access: public HTML
- Key required: no
- Login required: no

Texas ESBD explicitly exposes public solicitations and states sign-in is not required to view solicitations. It also lists structured fields such as solicitation ID, due date, due time, member number, status, posting date, created date, and last updated date.

## Provider

Provider name:

```text
texasEsbd
```

Aliases accepted by `/api/opportunities/fetch`:

```text
texasEsbd
texas_esbd
tx_esbd
txsmartbuy
```

## Fetch payload

```json
{
  "providers": ["texasEsbd"],
  "keywords": "respirator fit drug testing occupational health DOT physical",
  "dateRange": 90
}
```

Endpoint:

```text
POST /api/opportunities/fetch
```

## What the parser extracts

- Title
- Solicitation ID
- Due date
- Due time
- Agency/Texas SmartBuy member number
- Status
- Posting date
- Created date
- Last updated date
- Source URL

## Quality controls

- Skips inactive statuses such as closed, awarded, no award, and cancelled.
- Skips expired due dates.
- Applies the existing unified write-time quality gate before inserting.
- Uses stable external IDs: `tx-esbd-{solicitationId}`.
- Stores records in the RFP DB with official portal metadata.

## Safety

- No database schema changes.
- No migrations.
- No new env vars.
- No external paid API required.
- No Serper/Tavily/AI quota required for this provider.

## Next wave

Continue adding true direct parsers for the next Wave 1 portals:

1. New York State Contract Reporter
2. Virginia eVA
3. Pennsylvania eMarketplace
4. California Cal eProcure
5. Florida Vendor Bid System
