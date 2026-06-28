# Scrapy RFP Finder bridge

This is an optional crawler bridge for Insight Hub's RFP finder. It follows the Scrapy patterns from the uploaded tutorial and at-a-glance reference: define a spider, extract structured items with CSS/XPath selectors, follow pagination/detail links, and export results as JSON Lines for the TypeScript API provider to import.

It is intentionally isolated from the Node build so Render deploys do not break when Python/Scrapy is unavailable.

## Why this exists

Search APIs are useful for discovery, but many procurement portals hide the best data behind paginated listings, detail pages, inconsistent markup, or portal-specific result cards. Scrapy gives Insight Hub a controlled path to crawl explicitly configured public procurement pages, follow links, preserve structured RFP evidence, and hand the results back to the existing opportunity pipeline.

## What from Scrapy is being used

- **Spiders**: `RfpFinderSpider` owns the crawling and extraction rules.
- **CSS/XPath selectors**: listing cards/rows are parsed with CSS selectors; pagination links use XPath text matching.
- **`response.follow`**: detail pages and pagination are scheduled through Scrapy's request engine.
- **Asynchronous crawl engine**: Scrapy can process multiple requests efficiently, but this bridge intentionally throttles it.
- **Feed exports**: results are written as JSON Lines, which the Node provider reads.
- **Politeness controls**: robots.txt, download delay, concurrency-per-domain, depth limit, AutoThrottle, and close-spider limits are configured in `run.py`.

## Local setup

```bash
cd scripts/scrapy-rfp-finder
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
SCRAPY_RFP_OUTPUT=/tmp/insight-hub-scrapy-rfp.jsonl \
SCRAPY_RFP_START_URLS="https://example.gov/procurement/open-bids" \
SCRAPY_RFP_KEYWORDS="occupational health,drug testing,DOT physical" \
python run.py
```

The example URL is only a placeholder. The spider intentionally requires real start URLs through `SCRAPY_RFP_START_URLS`; do not hardcode live crawl targets into the spider.

## Alternative one-off Scrapy workflow

The Scrapy reference also shows the lightweight `runspider` pattern:

```bash
scrapy runspider spider.py -o /tmp/insight-hub-scrapy-rfp.jsonl
```

For Insight Hub, prefer `python run.py` because it sets feed export options, politeness controls, and spider arguments from environment variables. The one-off command is useful for selector debugging only.

## API integration

Set either of these in Render or Settings → Integrations:

```bash
SCRAPY_RFP_COMMAND="python scripts/scrapy-rfp-finder/run.py"
# or point to a JSONL file produced by an external scheduled crawler
SCRAPY_RFP_JSONL="/tmp/insight-hub-scrapy-rfp.jsonl"
```

Then include `scrapyRfp` in the providers array sent to `/opportunities/fetch`.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `SCRAPY_RFP_START_URLS` | Comma/newline-separated public procurement listing URLs to crawl. Required for command mode. | none |
| `SCRAPY_RFP_OUTPUT` | JSONL output path. The API provider sets this to a temp file in command mode. | `/tmp/insight-hub-scrapy-rfp.jsonl` |
| `SCRAPY_RFP_JSONL` | Existing JSONL path to import without running a crawler. | none |
| `SCRAPY_RFP_KEYWORDS` | Optional extra search/filter terms. | empty |
| `SCRAPY_RFP_LIMIT` | Close spider after this many accepted items. | `100` |
| `SCRAPY_RFP_MAX_PAGES` | Close spider after this many downloaded pages. | `75` |
| `SCRAPY_RFP_MAX_DEPTH` | Maximum depth from configured listing pages. | `3` |
| `SCRAPY_RFP_DOWNLOAD_DELAY` | Base delay between requests. | `0.75` |
| `SCRAPY_RFP_CONCURRENT_REQUESTS` | Global request concurrency. | `4` |
| `SCRAPY_RFP_CONCURRENT_PER_DOMAIN` | Per-domain request concurrency. | `2` |
| `SCRAPY_RFP_AUTOTHROTTLE` | Enable Scrapy AutoThrottle. | `true` |
| `SCRAPY_RFP_ROBOTSTXT_OBEY` | Respect robots.txt. | `true` |

## Expected JSONL item shape

The API provider accepts flexible field names, but these are ideal:

```json
{"title":"Occupational Health Services RFP","url":"https://example.gov/bids/123","agency":"City Example","description":"...","deadline":"2026-08-15","solicitationNumber":"RFP-123","location":"CA"}
```

Each line must be one JSON object. Bad lines are reported as parser errors without crashing the whole import.

## Debugging selectors

Use Scrapy shell against a single configured page when a portal changes markup:

```bash
scrapy shell "https://example.gov/procurement/open-bids"
```

Useful checks:

```python
response.css("tr, li, article, section, div")
response.css("a::attr(href)").getall()
response.xpath("//a[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'next')]/@href").getall()
```

Keep selectors defensive. Procurement portals often omit fields, rename columns, or mix open/closed/awarded notices on the same page.

## Safety boundaries

- Crawl only explicitly configured public procurement listing URLs.
- Respect robots.txt by default.
- Keep concurrency low and AutoThrottle enabled.
- Do not add Python/Scrapy installation to the normal Node/Render build.
- Do not store credentials in crawler code.
- Do not treat Scrapy output as trusted; the TypeScript provider still runs relevance, junk filtering, dedupe, and normalization.
