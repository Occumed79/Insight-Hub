# Occu-Med Insight Hub

## Overview

Premium dark-mode government contracting and business intelligence platform for Occu-Med. macOS Tahoe / Liquid Glass aesthetic. pnpm workspace monorepo using TypeScript.

## Portals

- **Opportunity Intelligence** (`/portal/opportunities`) — multi-source opportunity discovery (SAM.gov live, Serper/Tavily/Gemini/State Portals operational, Tango/BidNet stubs)
- **Client Intelligence** (`/portal/clients`) — fully built: searchable/filterable list of all 28 seeded clients, client detail view with 5 tabs: **Org Structure** (14-category contact system with EHS pinning, bulk import API at `POST /api/clients/:id/contacts/bulk`, seeded for AC Transit/CACI/CDCR/Constellis), **FEC/Political** (PAC data, cycle charts, party-split donut), **Regulatory** (OSHA records), **Litigation** (CourtListener/RECAP), **Branches** (AI research + hiring trend). `client_contacts` table in DB.
- **Competitor Intelligence** (`/portal/competitors`) — fully built: competitor cards, tier badges, service tags, geographic coverage, AI research engine (Serper + Tavily + Gemini), contract signal extraction, detail panel flyout, "Load Known Competitors" seed action
- **Prospect Intelligence** (`/portal/prospects`) — fully built: list, detail view with 4 tabs (Overview, Locations, Hiring, Org Structure). Location discovery: Serper → Gemini (if key valid) → heuristic regex extraction → Wikipedia fallback. 14-category org contacts with EHS pinning.
- **Federal Agencies** (`/portal/federal-agencies`) — fully built: 9-bucket workspace (Forecast, Recompete Watch, Agency Pain, Policy Radar, Incumbent Tracker, Leadership/Org, Deploy/Medical, Budget/Funding, Protests) with Refresh per bucket.
- **State Agencies** (`/portal/state-agencies`) — fully built: 50-state selector grouped by region, 13 per-state buckets (Procurement, Legislature, Governor/Agencies, Health Dept, Labor/WARN, Medical Licensing, Emergency Mgmt, OSHA Plan, Insurance Dept, Corrections, FMCSA/CDL, POST Guidelines, State DOT), Cross-State Intel panel (CDC HAN, Travel Advisories, FDA Recalls, FEMA Disasters via OpenFEMA API). All states have hardcoded official URL links. Serper-powered refresh per bucket.
- **Integrations** (`/portal/settings`) — provider control center with credential management for all 7 data sources

## Provider Architecture

All providers live in `artifacts/api-server/src/lib/providers/`:
- **SAM.gov** — fully wired (direct source, requires `SAM_GOV_API_KEY`); quota resets midnight UTC daily; throttle code `900804` detected
- **Serper** — fully wired (web search, requires `SERPER_API_KEY`); powers web intelligence pipeline
- **Tavily** — fully wired (deep research, requires `TAVILY_API_KEY`); powers web intelligence pipeline
- **Gemini AI** — fully wired (query gen + opportunity extraction, requires `GEMINI_API_KEY`); free tier has strict daily quota limits
- **Tango** — stub (direct source, requires API endpoint confirmation from Tango support)
- **BidNet** — stub (direct source, requires API endpoint + `BIDNET_API_KEY` + BidNet support confirmation)

Credential resolution: DB first (`settingsTable`), then env var fallback (`resolveCredential()` in `providerConfig.ts`).

## Web Intelligence Pipeline

`artifacts/api-server/src/lib/search/webIntelligence.ts` — main orchestrator:
1. **Query generation** — Gemini generates 8 targeted search queries (falls back to `OCCUMED_DEFAULT_QUERIES` in `gemini.ts`)
2. **Web search** — Serper (Google) + Tavily in parallel
3. **Deduplication** — by URL
4. **RFP keyword pre-filter** — only candidates containing RFP/solicitation keywords proceed to Gemini (reduces API calls ~60%)
5. **Gemini extraction** — analyzes candidates, extracts structured data, scores relevance 0-100
6. **Fallback** — if Gemini quota is exhausted (`GEMINI_QUOTA_EXCEEDED`), pre-filtered candidates are saved directly as `sourceConfidence: "low"` with notes "Web discovery — AI analysis pending"

**Key GEMINI error propagation**: All `catch {}` blocks in `gemini.ts` re-throw `GEMINI_QUOTA_EXCEEDED` errors so the orchestrator can trigger the fallback path properly.

## Opportunity Data Model

`lib/db/src/schema/opportunities.ts` — full schema including:
title, agency, subAgency, office, type, status, naicsCode, naicsDescription, pscCode, contractType, postedDate, responseDeadline, periodOfPerformance, setAside, placeOfPerformance, description, solicitationNumber, samUrl, estimatedValue, ceilingValue, floorValue, awardAmount, awardee, source (enum), providerName (text), relevanceScore, sourceConfidence, tags (JSON text), notes

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
