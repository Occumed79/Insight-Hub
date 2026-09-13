# Occu-Med Insight Hub (Hub 1)

## Authoritative scope

Insight Hub 1 is the procurement-facing workspace. Its active product surfaces are:

- **Opportunity Intelligence** (`/portal/opportunities`)
- **Forecasts** (`/portal/forecasts`)
- **Recompete Watch** (`/portal/recompete-watch`)
- **Relevant News** (`/portal/relevant-news`)
- **Integrations / provider telemetry** (`/portal/settings`)

The former Clients, Prospects, Competitors, Federal Agencies, State Agencies, and Intelligence Feed workspaces belong to **Insight Hub 2**. Do not resurrect those surfaces or their retired provider dependencies in Hub 1.

## Opportunity Intelligence architecture

Fetch Intelligence has four independent top-level source families. Selecting one must not silently force, suppress, masquerade as, or replace another.

1. **SAM.gov** — official structured U.S. federal opportunities.
2. **Tango / MakeGov** — independent structured secondary federal source.
3. **Canada + Europe Procurement** — CanadaBuys plus TED Europe.
4. **AI Discovery** — quota-aware state/local/private/web discovery ensemble.

### AI Discovery ensemble

The active discovery pool is intentionally bounded and quota-aware. It may use, where configured and budget-available:

- Keenable
- You.com
- Browserbase
- Parallel
- Exa
- Firecrawl
- LangSearch
- Linkup
- Tyler Data & Insights / Socrata
- WebSearch as an emergency broad-search fallback

Renewable/daily capacity should be preferred before scarce monthly capacity. One exhausted or failing member must not kill successful results from the rest of the ensemble.

### International procurement

- **CanadaBuys** is the official Canadian procurement path.
- **TED Europe** is the official European procurement path and includes Company Health Services / CPV 85147000 anchoring plus relevant keyword coverage.
- International records participate in the same normalization, evidence, dedupe, quality, and final ranking pipeline as U.S. opportunities.

### Enrichment / page reading

Discovery and page extraction are separate concerns. The enrichment stack includes:

- Jina Reader — keyless-first reader; a key raises available rate/capacity.
- Keenable fetch
- Browserbase
- Firecrawl
- Microlink — small-budget last-resort page extraction fallback.

### Relevance / judge pool

Ambiguous opportunity review can use the configured/budget-available judge pool, including:

- Cerebras
- Groq
- Mistral
- NVIDIA
- OpenRouter
- Minimax
- CLOD
- Gemini
- DeepSeek

Cohere is supporting reranking infrastructure. Cloudflare/Voyage/Pinecone/Qdrant are supporting embedding/vector infrastructure, not top-level RFP sources.

## Important guardrails

Do **not** reintroduce retired or superseded Opportunity Intelligence architecture:

- Tavily — removed.
- Serper — retired from Opportunity Intelligence.
- OloStep — retired.
- Old coded portal crawler farm — not the active architecture.
- Self-hosted crawler/search as a primary discovery mechanism — not allowed.
- `publicPortalProviders` as an independent top-level Fetch Intelligence source — legacy/internal compatibility path only.
- Euna/Bonfire crawler architecture as an independent source — legacy/internal compatibility path only.
- BidNet — not live until a real supported endpoint/authentication contract exists.
- Browse AI / BrowserUse — auxiliary integrations only; not active Opportunity Intelligence ingestion members.
- USAJobs — not a Hub 1 dependency.

Texas ESBD and New York State Contract Reporter implementations may remain as internal/compatibility portal adapters. They are **not** additional top-level manual Fetch Intelligence choices and must not displace the four source families above.

## Authoritative best-match ranking

Opportunity Intelligence uses the backend/API ordering as the source of truth.

The ranking pipeline is:

```text
SEARCH BROADLY
-> NORMALIZE
-> VERIFY / CLASSIFY
-> DEDUPLICATE
-> JUDGE OCCU-MED FIT
-> SCORE
-> RANK BEST TO WORST
-> PAGINATE
-> DISPLAY
```

The current implementation uses `calculateOpportunityRank` / the best-match ranking metadata and ranks the bounded global candidate set **before** limit/offset pagination. The candidate safety window is 10,000 records; when the window is reached, truncation must be explicit rather than pretending the result set is globally exhaustive.

Ranking must remain explainable and relevance-led. Occu-Med fit is the primary factor; service-line breadth, verified/open quality, source authority, actionable deadline, completeness, and bounded feedback adjustments may contribute. Source prestige must not overpower actual relevance.

Canonical ownership and ranking are separate concerns. A weak snippet must not overwrite a richer official record, but secondary evidence may still enrich lineage/metadata. Tango remains an independent source but does **not** receive privileged canonical authority over stronger evidence.

## Occu-Med opportunity fit

Search and judging should cover the real service scope rather than overfitting to the literal phrase `occupational health`, including combinations such as:

- occupational medicine / employee health
- pre-employment and pre-placement examinations
- periodic and fitness-for-duty examinations
- medical surveillance
- drug and alcohol / DOT testing
- audiometry / hearing conservation
- spirometry / pulmonary function testing
- respirator fit testing / medical clearance
- vision testing
- laboratory testing
- vaccinations / immunizations
- deployment medical screening
- international employee medical exams
- firefighter / public-safety medical exams
- mobile or multi-location occupational-health programs
- clinic/provider network coordination

The system should find relevant federal, state, county, city, transit, utility, school-district, university, public-safety, airport, port, defense, industrial-employer, private-employer, and subcontract/vendor opportunities.

## Other Hub 1 surfaces

### Forecasts

GovCon is a core forecast source, supplemented by official federal forecast sources where implemented.

### Recompete Watch

GovCon provides recompete intelligence, with USAspending and SAM/award evidence used for verification rather than as ordinary open-RFP discovery cards.

### Relevant News

GNews is the current Hub 1 news source. Failure or absence of its key should be handled as a provider/configuration state, not confused with Opportunity Intelligence.

## Runtime / Render deployment contract

Production service:

- Render service: `Insight-Hub`
- URL: `https://insight-hub-952b.onrender.com`
- GitHub: `Occumed79/Insight-Hub`
- Branch: `main`
- Build: `pnpm install && pnpm run build:prod`
- Start: `pnpm run start:prod` on the existing service

Core configuration names that must remain aligned across code, provider definitions, `render.yaml`, and live Render configuration include:

- `RFP_DATABASE_URL`
- `INTEL_DATABASE_URL`
- `SAM_GOV_API_KEY`
- `TANGO_API_KEY`
- `TANGO_BASE_URL`
- `PARALLEL_API_KEY`
- `GOVCON_API_KEY`
- `GNEWS_API_KEY`
- `MINIMAX_API_KEY`
- `SOCRATA_APP_TOKEN` **or** the canonical `SOCRATA_API_KEY` + `SOCRATA_API_SECRET` pair

The Socrata provider keeps backward compatibility for the old `SOCRATA_APP_SECRET` name, but new configuration should use `SOCRATA_API_SECRET` so the provider, settings UI, central env contract, and Render manifest agree.

Do not place secret values in this document.

## Key implementation paths

Opportunity Intelligence changes should trace the real end-to-end path rather than patching only the UI:

- `api-server/src/lib/ingestion/providerRunner.ts`
- `api-server/src/lib/ingestion/manualIngestion.ts`
- `api-server/src/lib/search/webIntelligence.ts`
- `api-server/src/lib/search/relevance.ts`
- `api-server/src/lib/opportunityEvidence.ts`
- `api-server/src/lib/opportunityQuality.ts`
- `api-server/src/lib/ingestion/opportunityIdentity.ts`
- `api-server/src/lib/ingestion/pipelineRules.ts`
- `api-server/src/lib/providers/`
- `api-server/src/lib/sourceArchitecture.ts`
- `api-server/src/routes/opportunities.ts`
- `api-server/src/lib/config/providerConfig.ts`
- `api-server/src/lib/config/providerTiers.ts`
- `intel-suite/src/pages/portal/opportunities.tsx`

## Verification expectations

For meaningful Opportunity Intelligence changes, preserve the repository's existing regression strategy and run the relevant checks, including typecheck, hardening/ingestion/quality regressions, frontend opportunity regressions, production build, and browser/Playwright acceptance when available. Do not weaken tests to make CI pass.
