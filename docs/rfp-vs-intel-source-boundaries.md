# RFP vs intel source boundaries

The RFP section should publish direct, actionable opportunities only. Broader intelligence sources are useful, but they should not be dumped into the visible RFP card list.

## Direct RFP sources

These sources can create records in `opportunities` when they pass validation and dedupe gates:

- SAM.gov opportunities
- Grants.gov opportunities if directly actionable
- Official state and local procurement portals after source-page verification
- BidNet/DemandStar/Tango-style bid portals only when the underlying listing is verified and has enough metadata

## Discovery-only sources

Search APIs can help find candidates, but raw search results must not be inserted straight into `opportunities`.

Examples:

- Serper
- Exa
- Tavily
- Gemini/web search wrappers
- Firecrawl/discovery crawlers

These should feed a staging/extraction flow:

```text
search/discovery result
→ original source page fetch
→ structured extraction
→ quality gate
→ dedupe
→ opportunity publish
```

## Intel-only sources

These are useful, but they do not represent direct RFP opportunities by default:

- USAspending
- Federal Register
- Oversight.gov
- GAO/OIG sources
- OSHA / regulatory sources
- contractor newsrooms
- agency profile feeds

They belong in the intel DB, not the RFP DB.

## USAspending boundary

USAspending is for award history, incumbents, recurring demand, re-compete prediction, and agency spend patterns.

It should answer:

- Who won similar contracts before?
- Which agencies buy medical/occupational services repeatedly?
- Which NAICS/PSC codes matter?
- Which contracts may become recompetes?

It should not publish direct RFP cards unless another authoritative opportunity source confirms an active solicitation.

## Federal Register boundary

Federal Register is for policy, notice, regulatory, and agency-signal intelligence.

It should feed:

- `intel_feed_items`
- `federal_intel_items`
- agency profile and policy radar features

It should not publish RFP cards unless it links to an actual procurement notice.

## Quality gate for visible RFP cards

A visible RFP card should have:

- title
- source URL
- provider/source name
- posted date or discovered date
- agency when available
- response deadline when available
- solicitation number or notice ID when available
- source confidence
- relevance classification
- dedupe key

Records that do not meet this bar should stay in staging/review instead of polluting the RFP list.
