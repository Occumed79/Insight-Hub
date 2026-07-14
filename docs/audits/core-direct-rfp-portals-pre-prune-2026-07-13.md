# Live audit and strict-prune plan: core direct RFP portals

Generated: 2026-07-14T00:16:10.956Z

## Summary

- Core records audited: **126**
- Records retained: **62**
- Records removed: **64**
- Registered parser-backed sources retained: **11**

| Status | Count |
|---|---:|
| dead | 20 |
| live | 62 |
| manual_review | 11 |
| mixed | 11 |
| reachable_unclear | 7 |
| unreachable_or_error | 15 |

## Removed records

| ID | Jurisdiction | Status | Endpoint result |
|---|---|---|---|
| `wa-webs` | Washington | reachable_unclear | 200 reachable_unclear |
| `al-staars` | Alabama | unreachable_or_error | ERR network_error |
| `ak-vss` | Alaska | unreachable_or_error | ERR network_error |
| `az-app` | Arizona | manual_review | 403 blocked_or_login |
| `co-vss` | Colorado | unreachable_or_error | ERR network_error |
| `de-mymarketplace` | Delaware | unreachable_or_error | ERR network_error |
| `dc-ocp` | District of Columbia | mixed | 200 live_procurement; 404 dead |
| `hi-hiepro` | Hawaii | reachable_unclear | 200 reachable_unclear |
| `ks-procurement` | Kansas | unreachable_or_error | ERR network_error; ERR network_error |
| `ky-vss` | Kentucky | unreachable_or_error | ERR network_error |
| `mn-swift` | Minnesota | unreachable_or_error | ERR network_error; ERR network_error |
| `mt-emacs` | Montana | dead | 404 dead |
| `ne-procurement` | Nebraska | unreachable_or_error | ERR network_error; ERR network_error |
| `nh-purchasing` | New Hampshire | manual_review | 403 blocked_or_login; 403 blocked_or_login |
| `ok-central-purchasing` | Oklahoma | mixed | 200 live_procurement; 404 dead |
| `or-oregonbuys` | Oregon | unreachable_or_error | ERR network_error |
| `sc-bid-opps` | South Carolina | mixed | 200 live_procurement; 404 dead |
| `tn-edison-rfps` | Tennessee | mixed | ERR network_error; 200 live_procurement |
| `ut-current-bids` | Utah | mixed | 200 live_procurement; 404 dead |
| `vt-bid-system` | Vermont | mixed | 200 live_procurement; 404 dead |
| `wv-purchasing-bulletin` | West Virginia | mixed | 200 live_procurement; 404 dead |
| `wi-esupplier` | Wisconsin | unreachable_or_error | ERR network_error; ERR network_error |
| `wy-bid-opportunities` | Wyoming | dead | 404 dead; 404 dead |
| `ca-city-of-los-angeles` | City of Los Angeles | manual_review | 403 blocked_or_login; 200 reachable_unclear |
| `ca-san-diego-county` | San Diego County | unreachable_or_error | ERR timeout; ERR timeout |
| `tx-city-of-dallas` | City of Dallas | unreachable_or_error | ERR network_error; ERR network_error |
| `tx-city-of-houston` | City of Houston | dead | 404 dead |
| `pa-city-of-philadelphia` | City of Philadelphia | mixed | 200 live_procurement; 200 reachable_unclear |
| `md-montgomery-county` | Montgomery County | mixed | 200 live_procurement; 404 dead |
| `nc-wake-county` | Wake County | dead | 404 dead; 404 dead |
| `ga-city-of-atlanta` | City of Atlanta | manual_review | 403 blocked_or_login |
| `az-maricopa-county` | Maricopa County | dead | 404 dead |
| `co-denver` | City and County of Denver | dead | 404 dead |
| `il-city-of-chicago` | City of Chicago | manual_review | 403 blocked_or_login; 403 blocked_or_login |
| `mi-city-of-detroit` | City of Detroit | manual_review | 403 blocked_or_login |
| `nj-newark` | City of Newark | dead | 404 dead |
| `ma-city-of-boston` | City of Boston | mixed | 200 live_procurement; 404 dead |
| `or-portland` | City of Portland | mixed | 200 live_procurement; 404 dead |
| `ca-lausd` | Los Angeles Unified School District | manual_review | 403 blocked_or_login |
| `ca-east-bay-mud` | East Bay Municipal Utility District | dead | 404 dead |
| `tx-houston-isd` | Houston Independent School District | dead | 404 dead |
| `tx-dfw-airport` | Dallas Fort Worth International Airport | dead | 404 dead |
| `tx-dart` | Dallas Area Rapid Transit | reachable_unclear | 200 reachable_unclear |
| `tx-san-antonio-water-system` | San Antonio Water System | dead | 404 dead |
| `ny-buffalo-public-schools` | Buffalo Public Schools | dead | 404 dead |
| `fl-broward-county` | Broward County | unreachable_or_error | ERR network_error |
| `fl-jacksonville-aviation-authority` | Jacksonville Aviation Authority | unreachable_or_error | 500 server_error |
| `pa-septa` | Southeastern Pennsylvania Transportation Authority | reachable_unclear | 200 reachable_unclear |
| `pa-pittsburgh` | City of Pittsburgh | dead | 404 dead |
| `md-wmata` | Washington Metropolitan Area Transit Authority | dead | 404 dead |
| `nc-charlotte` | City of Charlotte | reachable_unclear | 200 reachable_unclear |
| `ga-marta` | Metropolitan Atlanta Rapid Transit Authority | reachable_unclear | 200 reachable_unclear |
| `az-valley-metro` | Valley Metro Regional Public Transportation Authority | manual_review | 403 blocked_or_login |
| `co-rtd-denver` | Regional Transportation District | dead | 404 dead |
| `mi-wayne-county` | Wayne County | reachable_unclear | 200 reachable_unclear |
| `tn-memphis` | City of Memphis | dead | 404 dead |
| `nv-clark-county` | Clark County | dead | 404 dead |
| `sc-charleston-county` | Charleston County | unreachable_or_error | ERR network_error |
| `wi-milwaukee-county` | Milwaukee County | manual_review | 403 blocked_or_login |
| `mn-met-council` | Metropolitan Council | dead | 404 dead |
| `mo-kansas-city` | Kansas City | manual_review | 403 blocked_or_login |
| `al-birmingham` | City of Birmingham | dead | 404 dead |
| `ky-louisville` | Louisville Metro Government | manual_review | 403 blocked_or_login |
| `ct-hartford` | City of Hartford | dead | 404 dead |

Registered parser-backed sources are retained as verified integration sources even when a generic HTTP audit encounters a temporary access restriction. Every other retained record must return a clear procurement page or document for all stored endpoints.
