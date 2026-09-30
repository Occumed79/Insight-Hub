# Relevant News: APITube and GNews

The existing `/portal/relevant-news` page calls `/api/relevant-news`. The endpoint now combines GNews federal-procurement stories and APITube defense/aerospace contractor intelligence. This is news coverage, not a spending ledger or an official solicitation source; articles retain original publisher links. No news articles are inserted into opportunity tables or used to replace SAM.gov, Tango, GovCon, or the existing AI ranking pipeline.

## Configuration

On the existing Insight-Hub Render service, add the supplied credentials as environment variables:

| Variable | Purpose |
| --- | --- |
| `APITUBE_NEWS_API_KEY_2` | First supplied news credential |
| `APITUBE_NEWS_API_KEY_3` | Additional credential; authentication fallback |
| `APITUBE_NEWS_API_KEY` | Optional primary credential, if configured |
| `APITUBE_NEWS_MAX_ARTICLES` | Per-search result limit; defaults to 10 for compatibility with Free plans |
| `GNEWS_API_KEY` | Existing news source; optional when APITube is configured |
| `GNEWS_MAX_ARTICLES` | Existing GNews plan limit; defaults to 10 |

Values belong in the service environment. The frontend never receives credentials. Keys are deduplicated, and another credential is attempted only after an HTTP 401 authentication failure. APITube live keys on the same account share a quota; HTTP 429 applies a shared cooldown without switching credentials. A process-wide rolling limit caps APITube requests at 10 per minute. Multiple app replicas and other consumers still share the account's upstream limit.

## Coverage and behavior

- Default APITube coverage uses two Boolean headline queries: tracked contractors and defense/aerospace contracts, budgets, spending, LOGCAP, and AFCAP. Contractor names include V2X/Vectrus, Amentum, KBR, Fluor, Leidos, SAIC, CACI, Serco, Parsons, Lockheed Martin, RTX/Raytheon, Northrop Grumman, General Dynamics, Boeing, BAE Systems, L3Harris, Airbus, Safran, and GE Aerospace, plus historical names.
- Searches are English and cover the last seven days. The page's search field sends a quoted headline phrase to APITube and an additional phrase filter to GNews. Company tracking is headline-based; it is not an exhaustive company-activity census.
- Boolean `query` avoids APITube's 100-character `title` limit and strict `organization.name` directory lookup. A live `organization.name` request containing V2X returned `ER0220` because that entity was not found. Unknown entity names must not break coverage of all other contractors.
- Local admission requires federal procurement context, or a relevant company/defense/aerospace context together with procurement, spending, or business activity. Ordinary conflict reports, unrelated corporate awards, and workers' compensation stories are excluded. Publisher names cannot create relevance.
- Results map APITube's `results`, `href`, `published_at`, `body`, and source metadata into the existing article shape. Cards show the original publisher, provider, matching companies, and signal labels.
- Duplicate publisher URLs are removed across providers and searches, ignoring tracking parameters and fragments. The most relevant copy is retained, and results sort by publication time.
- Providers fail independently. A partial feed returns available articles and a visible warning; if every configured provider fails, the endpoint returns an error. Healthy results cache for 15 minutes; partial results for one minute. Identical concurrent requests share one fetch.
- Free APITube plans impose a 12-hour news delay, 10 results per search, and a five-page cap. Increasing the result limit requires a matching account plan. The current UI requests the first page only.

## Validation

Run `pnpm --filter @workspace/api-server run test:news`, `pnpm run typecheck`, and `pnpm run build:prod`.

Reference: [APITube endpoint guide](https://docs.apitube.io/platform/news-api/endpoints), [search parameters](https://docs.apitube.io/platform/news-api/everything), [response structure](https://docs.apitube.io/platform/news-api/response-structure), [rate limits](https://docs.apitube.io/platform/news-api/rate-limits), [military coverage](https://apitube.io/us/solutions/military-news-api), and [aerospace coverage](https://apitube.io/solutions/aerospace-news-api).
