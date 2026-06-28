"""Run the Insight Hub Scrapy RFP crawler.

This script is intentionally isolated from the Node/TypeScript build. Configure the
API provider with:

  SCRAPY_RFP_COMMAND="python scripts/scrapy-rfp-finder/run.py"

Optional environment variables:
  SCRAPY_RFP_START_URLS       Comma/newline-separated portal URLs to crawl
  SCRAPY_RFP_OUTPUT           JSONL output path; provided by the API provider
  SCRAPY_RFP_KEYWORDS         Extra search/filter terms
  SCRAPY_RFP_LIMIT            Close spider after this many accepted items
  SCRAPY_RFP_MAX_PAGES        Close spider after this many downloaded pages
  SCRAPY_RFP_MAX_DEPTH        Maximum crawl depth from configured listing URLs
  SCRAPY_RFP_DOWNLOAD_DELAY   Base politeness delay between requests
  SCRAPY_RFP_AUTOTHROTTLE     Enable/disable Scrapy AutoThrottle, default true

Why CrawlerProcess instead of `scrapy runspider` here?
The uploaded Scrapy at-a-glance reference shows that `runspider` plus feed exports
is the smallest CLI path for one-off crawls. Insight Hub uses CrawlerProcess so the
API provider can set the same feed-export settings programmatically, pass spider
arguments from environment variables, and keep the crawler optional.
"""
from __future__ import annotations

import os
from pathlib import Path

from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings

from spider import RfpFinderSpider


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() not in {"0", "false", "no", "off"}


def main() -> None:
    output = Path(os.getenv("SCRAPY_RFP_OUTPUT", "/tmp/insight-hub-scrapy-rfp.jsonl"))
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()

    settings = get_project_settings()
    settings.setdict(
        {
            "BOT_NAME": "insight_hub_rfp_finder",
            # Respect portal crawl policies by default.
            "ROBOTSTXT_OBEY": env_bool("SCRAPY_RFP_ROBOTSTXT_OBEY", True),
            # Scrapy is async and can crawl fast; keep this intentionally polite.
            "DOWNLOAD_DELAY": float(os.getenv("SCRAPY_RFP_DOWNLOAD_DELAY", "0.75")),
            "CONCURRENT_REQUESTS": int(os.getenv("SCRAPY_RFP_CONCURRENT_REQUESTS", "4")),
            "CONCURRENT_REQUESTS_PER_DOMAIN": int(os.getenv("SCRAPY_RFP_CONCURRENT_PER_DOMAIN", "2")),
            "DEPTH_LIMIT": int(os.getenv("SCRAPY_RFP_MAX_DEPTH", "3")),
            "CLOSESPIDER_PAGECOUNT": int(os.getenv("SCRAPY_RFP_MAX_PAGES", "75")),
            "CLOSESPIDER_ITEMCOUNT": int(os.getenv("SCRAPY_RFP_LIMIT", "100")),
            "AUTOTHROTTLE_ENABLED": env_bool("SCRAPY_RFP_AUTOTHROTTLE", True),
            "AUTOTHROTTLE_START_DELAY": float(os.getenv("SCRAPY_RFP_AUTOTHROTTLE_START_DELAY", "1.0")),
            "AUTOTHROTTLE_MAX_DELAY": float(os.getenv("SCRAPY_RFP_AUTOTHROTTLE_MAX_DELAY", "8.0")),
            "AUTOTHROTTLE_TARGET_CONCURRENCY": float(os.getenv("SCRAPY_RFP_AUTOTHROTTLE_TARGET_CONCURRENCY", "1.5")),
            "RETRY_ENABLED": True,
            "HTTPERROR_ALLOWED_CODES": [403, 404, 410, 429, 500, 502, 503, 504],
            "USER_AGENT": os.getenv(
                "SCRAPY_RFP_USER_AGENT",
                "InsightHubRfpFinder/1.0 (+https://github.com/Occumed79/Insight-Hub)",
            ),
            # Feed exports are the bridge to the TypeScript provider. JSON Lines is
            # append/stream friendly and mirrors the Scrapy reference workflow.
            "FEEDS": {
                str(output): {
                    "format": "jsonlines",
                    "encoding": "utf8",
                    "overwrite": True,
                }
            },
            "LOG_LEVEL": os.getenv("SCRAPY_RFP_LOG_LEVEL", "INFO"),
        }
    )

    process = CrawlerProcess(settings)
    process.crawl(
        RfpFinderSpider,
        keywords=os.getenv("SCRAPY_RFP_KEYWORDS", ""),
        start_urls=os.getenv("SCRAPY_RFP_START_URLS", ""),
    )
    process.start(stop_after_crawl=True)


if __name__ == "__main__":
    main()
