"""Run the Insight Hub Scrapy RFP crawler.

This script is intentionally isolated from the Node/TypeScript build. Configure the
API provider with:

  SCRAPY_RFP_COMMAND="python scripts/scrapy-rfp-finder/run.py"

Optional environment variables:
  SCRAPY_RFP_START_URLS  Comma/newline-separated portal URLs to crawl
  SCRAPY_RFP_OUTPUT      JSONL output path; provided by the API provider
  SCRAPY_RFP_KEYWORDS    Extra search/filter terms
  SCRAPY_RFP_LIMIT       Close spider after this many accepted items
  SCRAPY_RFP_MAX_PAGES   Close spider after this many downloaded pages
"""
from __future__ import annotations

import os
from pathlib import Path

from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings

from spider import RfpFinderSpider


def main() -> None:
    output = Path(os.getenv("SCRAPY_RFP_OUTPUT", "/tmp/insight-hub-scrapy-rfp.jsonl"))
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()

    settings = get_project_settings()
    settings.setdict(
        {
            "BOT_NAME": "insight_hub_rfp_finder",
            "ROBOTSTXT_OBEY": True,
            "DOWNLOAD_DELAY": float(os.getenv("SCRAPY_RFP_DOWNLOAD_DELAY", "0.75")),
            "CONCURRENT_REQUESTS_PER_DOMAIN": int(os.getenv("SCRAPY_RFP_CONCURRENT_PER_DOMAIN", "2")),
            "CLOSESPIDER_PAGECOUNT": int(os.getenv("SCRAPY_RFP_MAX_PAGES", "75")),
            "CLOSESPIDER_ITEMCOUNT": int(os.getenv("SCRAPY_RFP_LIMIT", "100")),
            "USER_AGENT": os.getenv(
                "SCRAPY_RFP_USER_AGENT",
                "InsightHubRfpFinder/1.0 (+https://github.com/Occumed79/Insight-Hub)",
            ),
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
    process.start()


if __name__ == "__main__":
    main()
