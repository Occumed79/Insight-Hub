# Wave 3 status

Texas ESBD / Texas SmartBuy direct parser is implemented and wired as provider `texasEsbd`.

This provider:

- does not require an API key
- fetches the official ESBD public listing page
- parses solicitation records from the listing markup
- skips closed/awarded/cancelled records
- skips expired due dates
- maps records into the existing unified RFP ingestion flow
- preserves official portal metadata in normalized records

Use:

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
