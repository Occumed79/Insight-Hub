# Scrapy RFP Finder bridge

This is an optional crawler bridge for Insight Hub's RFP finder. It follows the Scrapy pattern from the uploaded tutorial: define a spider, yield extracted items, follow pagination/detail links, and export results as JSON Lines for the TypeScript API provider to import.

It is intentionally isolated from the Node build so Render deploys do not break when Python/Scrapy is unavailable.

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

## API integration

Set either of these in Render or Settings → Integrations:

```bash
SCRAPY_RFP_COMMAND="python scripts/scrapy-rfp-finder/run.py"
# or point to a JSONL file produced by an external scheduled crawler
SCRAPY_RFP_JSONL="/tmp/insight-hub-scrapy-rfp.jsonl"
```

Then include `scrapyRfp` in the providers array sent to `/opportunities/fetch`.

## Expected JSONL item shape

The API provider accepts flexible field names, but these are ideal:

```json
{"title":"Occupational Health Services RFP","url":"https://example.gov/bids/123","agency":"City Example","description":"...","deadline":"2026-08-15","solicitationNumber":"RFP-123","location":"CA"}
```

## Why this exists

Search APIs are useful for discovery, but many procurement portals hide the best data behind paginated listings, detail pages, or inconsistent markup. Scrapy gives Insight Hub a controlled path to crawl specific public portals, follow links, and preserve structured RFP evidence without pretending every portal has a clean API.
