from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Iterable
from urllib.parse import urlparse

import scrapy
from w3lib.html import remove_tags

PROCUREMENT_TERMS = [
    "rfp",
    "request for proposal",
    "request for proposals",
    "rfq",
    "rfi",
    "solicitation",
    "invitation to bid",
    "invitation for bid",
    "itb",
    "ifb",
    "bid opportunity",
    "procurement",
    "contract opportunity",
    "responses due",
    "closing date",
]

SERVICE_TERMS = [
    "occupational health",
    "occupational medicine",
    "employee health",
    "drug testing",
    "drug screening",
    "dot physical",
    "pre-employment physical",
    "pre employment physical",
    "medical surveillance",
    "fit for duty",
    "fitness for duty",
    "respirator fit",
    "pulmonary function",
    "spirometry",
    "audiogram",
    "hearing conservation",
    "vaccination",
    "immunization",
    "tb test",
]

HARD_REJECT_TERMS = [
    "now hiring",
    "job posting",
    "job opening",
    "career opportunity",
    "apply now",
    "submit resume",
    "registered nurse",
    "nurse staffing",
    "medical staffing",
    "contract awarded",
    "notice of award",
    "intent to award",
    "bid tabulation",
    "ambulance",
    "emergency medical services",
]

DATE_PATTERNS = [
    re.compile(r"(?:due|deadline|closing|closes|responses due)[:\s-]*([A-Z][a-z]+\s+\d{1,2},\s+20\d{2})", re.I),
    re.compile(r"(?:due|deadline|closing|closes|responses due)[:\s-]*(\d{1,2}/\d{1,2}/20\d{2})", re.I),
    re.compile(r"(?:due|deadline|closing|closes|responses due)[:\s-]*(20\d{2}-\d{1,2}-\d{1,2})", re.I),
]


def clean_text(parts: Iterable[str]) -> str:
    text = " ".join(p.strip() for p in parts if p and p.strip())
    text = remove_tags(text)
    return re.sub(r"\s+", " ", text).strip()


def has_any(text: str, terms: Iterable[str]) -> bool:
    normalized = text.lower()
    return any(term in normalized for term in terms)


def extract_deadline(text: str) -> str | None:
    for pattern in DATE_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(1)
    return None


@dataclass
class Candidate:
    title: str
    url: str
    description: str
    agency: str | None = None
    deadline: str | None = None
    portal: str | None = None


class RfpFinderSpider(scrapy.Spider):
    name = "rfp_finder"

    def __init__(self, keywords: str = "", start_urls: str = "", *args, **kwargs):
        super().__init__(*args, **kwargs)
        configured = [u.strip() for u in re.split(r"[,\n]", start_urls or "") if u.strip()]
        if not configured:
            raise ValueError("Set SCRAPY_RFP_START_URLS to one or more public procurement listing URLs.")
        self.start_urls = configured
        self.extra_terms = [t.strip().lower() for t in re.split(r"[,|]", keywords or "") if t.strip()]
        allowed = os.getenv("SCRAPY_RFP_ALLOWED_DOMAINS", "")
        if allowed.strip():
            self.allowed_domains = [d.strip() for d in allowed.split(",") if d.strip()]
        else:
            self.allowed_domains = sorted({urlparse(url).hostname or "" for url in self.start_urls})

    def parse(self, response: scrapy.http.Response):
        page_text = clean_text(response.css("body ::text").getall())
        portal = urlparse(response.url).hostname or response.url

        for container in response.css("tr, li, article, section, div"):
            text = clean_text(container.css("::text").getall())
            if len(text) < 25 or self._hard_reject(text):
                continue

            href = container.css("a::attr(href)").get()
            if not href:
                continue

            title = clean_text(container.css("a::text, h1::text, h2::text, h3::text, strong::text").getall()) or text[:160]
            candidate = self._candidate_from_text(response, title, href, text, portal)
            if candidate:
                yield candidate.__dict__
                yield response.follow(href, callback=self.parse_detail, meta={"candidate": candidate.__dict__})

        if self._looks_relevant(page_text):
            title = clean_text(response.css("h1::text, title::text").getall()) or response.url
            yield Candidate(
                title=title[:240],
                url=response.url,
                description=page_text[:3000],
                deadline=extract_deadline(page_text),
                portal=portal,
            ).__dict__

        yield from self._follow_pagination(response)

    def parse_detail(self, response: scrapy.http.Response):
        base = dict(response.meta.get("candidate") or {})
        detail_text = clean_text(response.css("body ::text").getall())
        if self._hard_reject(detail_text):
            return
        if not self._looks_relevant(" ".join([base.get("description", ""), detail_text])):
            return

        base.update(
            {
                "url": response.url,
                "title": clean_text(response.css("h1::text, title::text").getall()) or base.get("title") or response.url,
                "description": detail_text[:5000],
                "deadline": base.get("deadline") or extract_deadline(detail_text),
                "portal": base.get("portal") or (urlparse(response.url).hostname or response.url),
            }
        )
        yield base

    def _candidate_from_text(self, response, title: str, href: str, text: str, portal: str) -> Candidate | None:
        combined = f"{title} {href} {text}"
        if not self._looks_relevant(combined):
            return None
        return Candidate(
            title=title[:240],
            url=response.urljoin(href),
            description=text[:3000],
            deadline=extract_deadline(text),
            portal=portal,
        )

    def _looks_relevant(self, text: str) -> bool:
        if self._hard_reject(text):
            return False
        procurement = has_any(text, PROCUREMENT_TERMS)
        service = has_any(text, SERVICE_TERMS)
        keyword_match = not self.extra_terms or has_any(text, self.extra_terms)
        return procurement and service and keyword_match

    def _hard_reject(self, text: str) -> bool:
        return has_any(text, HARD_REJECT_TERMS)

    def _follow_pagination(self, response):
        next_selectors = response.xpath(
            "//a[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'next') "
            "or contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'more') "
            "or contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'older')]/@href"
        ).getall()
        for href in next_selectors[:3]:
            yield response.follow(href, callback=self.parse)
