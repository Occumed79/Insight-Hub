# Live audit and strict-prune plan: direct RFP portal chunks 043-047

Generated: 2026-07-14T00:13:36.508Z

## Summary

- Records audited: **143**
- Strictly verified live records retained: **136**
- Unverified, mixed, protected, unclear, dead, or unreachable records removed: **7**

| Status | Count |
|---|---:|
| dead | 1 |
| live | 136 |
| mixed | 1 |
| reachable_unclear | 5 |

## Per-chunk accounting

| Chunk | Total | Retained | Removed |
|---:|---:|---:|---:|
| 043 | 29 | 29 | 0 |
| 044 | 23 | 23 | 0 |
| 045 | 27 | 27 | 0 |
| 046 | 29 | 22 | 7 |
| 047 | 35 | 35 | 0 |

## Removed records

| Chunk | ID | Jurisdiction | Status | Endpoint result |
|---:|---|---|---|---|
| 046 | `tn-bradley-county` | Bradley County | mixed | 200 live_procurement; 200 reachable_unclear |
| 046 | `tn-cocke-county` | Cocke County | reachable_unclear | 200 reachable_unclear |
| 046 | `tn-hamilton-county` | Hamilton County | reachable_unclear | 200 reachable_unclear |
| 046 | `tn-marion-county` | Marion County | reachable_unclear | 200 reachable_unclear |
| 046 | `tn-stewart-county` | Stewart County | reachable_unclear | 200 reachable_unclear |
| 046 | `tn-sumner-county` | Sumner County | reachable_unclear | 202 reachable_unclear |
| 046 | `tn-white-county` | White County | dead | 404 dead |

Only records whose stored endpoints all returned a clear live procurement page or procurement document are retained in the generated `pruned/` files.
