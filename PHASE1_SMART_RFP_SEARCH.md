# Phase 1 Smart RFP Search

This branch starts the Phase 1 local search implementation.

Implemented so far:
- Added a PostgreSQL full-text search migration for stored opportunities.
- Added `api-server/src/routes/search.ts` with `POST /search` backed by local database search.

Still required before merge:
- Register the search route in `api-server/src/routes/index.ts`.
- Add or wire the frontend sidebar/search UI.
- Run build/typecheck and migration validation.
