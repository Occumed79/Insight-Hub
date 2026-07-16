# RFP vs intel source boundaries

The RFP section should publish direct, actionable opportunities only. Broader intelligence sources are useful, but they should not be dumped into the visible RFP card list.

## Direct RFP sources

These sources can create records in `opportunities` when they pass validation and dedupe gates:

- SAM.gov opportunities
- Official state and local procurement portals after source-page verification
- Tango (direct API, when configured and the endpoint contract is confirmed)

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

## Never-RFP sources

These must not produce RFP opportunity cards under any circumstances:

- **BidNet Direct** — configuration scaffold only; endpoint integration is not implemented.
- **DemandStar** — not integrated.

## Intel-only sources

These are useful, but they do not represent direct RFP opportunities by default:

- USAspending (award history, incumbents, re-compete signals — intel DB only)
- Grants.gov (federal funding intelligence — intel DB only; not an RFP ingestion source)
- Federal Register
- Oversight.gov
- GAO/OIG sources
- OSHA / regulatory sources
- contractor newsrooms
- agency profile feeds

They belong in the intel DB, not the RFP DB.

## USAspending boundary

USAspending is for award history, incumbents, recurring demand, re-compete prediction, and agency spend patterns. It feeds the intel database only.

It should answer:

- Who won similar contracts before?
- Which agencies buy medical/occupational services repeatedly?
- Which NAICS/PSC codes matter?
- Which contracts may become recompetes?

It must not publish RFP opportunity cards. USAspending award records are intel signals, not active solicitations.

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
