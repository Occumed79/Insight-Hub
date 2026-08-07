# Insight Hub Stability Architecture

## Purpose

This document describes the current hardened runtime architecture for opportunity and acquisition intelligence. It replaces the older self-hosted-first design notes, which no longer match production ownership.

The primary goals are:

- preserve source quality and provenance;
- prevent one provider failure from suppressing other sources;
- conserve limited API and model allowances;
- keep stale, closed, or semantically unrelated records out of actionable views;
- make retries, cooldowns, feedback, and rate limits durable across API instances;
- keep legacy crawler and local-model experiments from silently re-entering production paths.

## Runtime Ownership

The machine-readable source ownership registry is `api-server/src/lib/sourceArchitecture.ts`. That registry is authoritative when older comments or historical files disagree with current behavior.

### Direct opportunity sources

- **SAM.gov** — official U.S. federal opportunities.
- **Tango** — independent structured federal opportunity pool.
- **Texas ESBD / Texas SmartBuy** — dedicated Texas public procurement adapter.
- **New York State Contract Reporter** — dedicated New York public procurement adapter.

Manual federal opportunity discovery keeps SAM.gov and Tango independent. A weak or empty result from one does not suppress the other.

### Browser/search discovery

Configured discovery providers may include LangSearch, Serper, Exa, Parallel, Linkup, You.com, Socrata, and WebSearch. The runtime selects a bounded subset using durable provider availability/yield state instead of randomly exhausting every configured trial key.

Browser/search discovery is supplemental. It does not replace structured federal sources and it does not grant search snippets the same authority as official records.

### Page enrichment

Managed enrichment may use Jina, Olostep, Firecrawl, and related explicitly enabled services. Enrichment is separate from discovery so a page-extraction failure does not redefine source ownership.

### AI review

Ambiguous structured opportunities may be reviewed by a bounded panel of configured external model providers. Clear high-confidence records remain deterministic to avoid unnecessary model spend.

Panel safeguards include:

- at most one vote per provider per record;
- distinct-provider consensus;
- early stop once consensus is reached;
- stricter threshold when only one judge is available;
- durable provider cooldown/budget accounting.

### Forecast and recompete intelligence

- **Forecasts** are owned by the GovCon + official federal forecast ensemble.
- **Recompete Watch** requires incumbent/award evidence and sensible timing.
- **USAspending/SAM verification** remains part of official award/recompete verification.
- **FAR/DFARS RSS** belongs to policy intelligence, not the Forecast pipeline.

The retired `/api/federal-intel/forecast` path is not a second forecast source.

## Explicitly Retired or Disabled Paths

The following are not production opportunity-discovery owners:

- Local LLM / Ollama / LocalAI extraction;
- self-hosted crawler as a manual opportunity source;
- self-hosted search as a manual opportunity source;
- scheduled crawler as a manual opportunity source;
- browser-automation experiments such as BrowseAI/BrowserUse;
- Cloudflare worker extraction paths that were disabled after authentication/reliability failures;
- award/history or policy feeds treated as if they were open RFP sources.

### Local LLM retirement

Local LLM support is retired from the hardened runtime. The old provider implementation and Ollama setup script were removed, provider settings no longer expose it, the provider registry returns an explicit retired tombstone, and deployment configuration no longer requests `LOCAL_LLM_ENDPOINT` or `LOCAL_LLM_MODEL`.

Do not add Local LLM/Ollama back as a fallback without a new architecture decision, dedicated resource sizing, isolation from the web process, production health gates, and explicit ownership in `sourceArchitecture.ts`.

## Provider Budget Ledger

Provider allowance state is stored durably in the existing RFP settings KV table. No schema migration is required.

The ledger tracks:

- daily and monthly request counts;
- successes, failures, empty results, and useful result yield;
- last outcome/error;
- last attempt/success timestamps;
- durable cooldown deadlines.

Quota, authentication, rate-limit, timeout, and reliability failures receive bounded cooldowns. Writes are serialized with transaction-scoped PostgreSQL advisory locks so concurrent requests or multiple API instances cannot overwrite counters or erase a newer cooldown.

A short-lived process cache reduces unnecessary reads but is intentionally non-authoritative.

## Opportunity Acceptance Boundary

Raw discovery is not equivalent to an actionable opportunity.

Structured and discovered records pass through guards for:

- query/service relevance;
- expiration and deadline state;
- deterministic or panel review where appropriate;
- cross-source deduplication;
- opportunity quality classification;
- durable user suppression/feedback.

The normal actionable view excludes records marked **Not relevant**. The All Records view remains the audit/recovery surface.

Bulk destructive “purge junk” behavior is disabled. Rejected evidence belongs in staging/audit paths rather than being used as a reason to delete canonical production history indiscriminately.

## Forecast Freshness Boundary

A forecast record with explicit timing must contain current/future timing. A stale solicitation date or past federal fiscal year cannot be rescued merely because the source labels the record `planned`, `forecast`, `active`, or `open`.

Status fallback is used only when the source genuinely provides no timing fields.

Supplemental official-agency forecast search results are restricted to government/military hosts, procurement-forecast language, Occu-Med-compatible scope, and freshness signals. Search-provider failures are recorded as failures rather than being converted into false zero-result successes.

## Feedback Learning

Feedback is split into global scope/content learning and contextual learning.

### Global learning

Provider identity is diagnostic only. A poor result from SAM, Tango, Serper, or another source cannot poison all future records from that provider.

Global relevance learning uses meaningful overlap such as:

- agency;
- NAICS;
- tags/service scope;
- title/content keywords.

Bounded rescoring requires an actual shared signal and excludes already graded unrelated records.

### Contextual learning

Contextual feedback aggregates are transactionally updated with PostgreSQL advisory locks. Re-grading the same opportunity in the same context replaces the previous contribution rather than double-counting it.

## API Safety Boundary

The API applies:

- restricted production CORS;
- full-origin mutation checks, including scheme;
- bounded request bodies;
- strict payload validation on expensive/high-risk mutation routes;
- security headers;
- capability-based optional write/admin tokens;
- shared durable rate limiting with a bounded local fallback when the database is unavailable.

The production proxy terminates TLS ahead of the Node process, so the Express application trusts exactly one proxy hop. This allows origin checks and per-client rate limits to use the forwarded HTTPS protocol/client address correctly.

These controls reduce abuse and accidental expensive operations. They are not a substitute for a full end-user authentication/session system if the application is exposed to untrusted users.

## Database and Concurrency Rules

For JSON aggregates or counters stored in the settings KV table:

1. use a database transaction;
2. acquire a transaction-scoped advisory lock for the logical key;
3. read the current row;
4. perform the read/modify/write while still holding the lock;
5. commit before updating any process cache.

Do not implement durable counters as an unlocked `SELECT` followed by an upsert. That loses concurrent updates across requests or instances.

## Cache Rules

Caches must be:

- bounded by entry count;
- bounded by TTL;
- invalidated or bypassed for correctness-sensitive state;
- paired with in-flight request deduplication when identical upstream calls can consume quota.

Forecast response caches and provider-budget caches follow these rules.

## Observability

`/api/hardening/diagnostics` exposes non-secret architecture and provider-budget telemetry for troubleshooting.

Useful diagnostics include:

- source role and active/disabled ownership;
- provider/key-slot cooldown state;
- recovered provider failures;
- structured-review decisions;
- forecast source breakdown and deduplication counts;
- ingestion rejection/expiration counts.

Never include raw API keys, write tokens, database credentials, or secret environment values in diagnostics.

## CI and Release Gates

The hardened branch is expected to pass the repository gates for:

- workspace/API typecheck;
- hardening regressions;
- opportunity-ingestion regressions;
- opportunity-quality regressions;
- Forecast/Recompete semantic tests;
- frontend production build;
- API production build;
- crawler-foundation compatibility tests;
- statewide/catalogue verification where those workflows apply.

A green build on an older commit is not validation of a newer hardening commit. Always evaluate checks against the current PR head.

## Production Safety Principles

- Do not make one provider a hidden fallback that suppresses independent sources.
- Do not treat search-engine results as official structured records.
- Do not spend AI calls on records a deterministic rule can confidently decide.
- Do not erase a quota/reliability cooldown because a concurrent request happened to succeed.
- Do not allow stale forecast timing to survive on a generic status label.
- Do not let feedback about one source become a source-wide relevance penalty.
- Do not expose retired integrations as configurable/healthy providers.
- Do not claim production browser behavior is validated solely because repository CI is green.

## Current Direction

Insight Hub now favors a small number of explicit, observable owners for each job instead of accumulating overlapping fallback paths. New integrations should be added to the authoritative source registry first, assigned one primary role, given a clear budget/reliability strategy, and covered by a regression that proves they cannot degrade existing source independence or data quality.
