# Audit report: direct RFP portal chunks 001–010

Generated from live GitHub Actions checks on **2026-07-13** against `main` at `7524ccb58691e182d38bbdce2db65105106e1c75`.

## Scope and method

- Audited every record in `directRfpPortals.generated.001.ts` through `.010.ts`.
- Requested both `url` and `searchUrl` when they differed, with redirects enabled and a browser-style user agent.
- Recorded HTTP status, final URL, content type, page title, procurement-language signals, access blocks, timeouts, and network failures.
- Compared stored domains, parser/access metadata, normalized URLs, and normalized buyer identities against the full combined catalog.
- Automated 404/403/network results are audit flags. They require primary-source replacement research before deletion or promotion.

## Executive result

| Result | Count |
|---|---:|
| Live procurement source | 77 |
| Blocked/protected — manual review | 26 |
| Reachable but procurement purpose unclear | 11 |
| Network/server failure | 14 |
| Returned 404/410 | 79 |
| **Total records** | **207** |

Only **77 of 207 records (37.2%)** returned a clearly identifiable live procurement page during the audit. **79 records (38.2%)** returned 404/410 responses. The remaining 51 records require manual verification because they were blocked, unclear, or unreachable from the audit runner.

## Per-chunk status

| Chunk | Total | Live | 404/410 | Protected | Unclear | Error |
|---:|---:|---:|---:|---:|---:|---:|
| 001 | 36 | 14 | 14 | 2 | 3 | 3 |
| 002 | 36 | 14 | 12 | 3 | 2 | 5 |
| 003 | 35 | 12 | 16 | 4 | 3 | 0 |
| 004 | 12 | 7 | 3 | 2 | 0 | 0 |
| 005 | 21 | 8 | 7 | 6 | 0 | 0 |
| 006 | 16 | 6 | 7 | 1 | 0 | 2 |
| 007 | 18 | 9 | 7 | 1 | 0 | 1 |
| 008 | 21 | 4 | 8 | 4 | 2 | 3 |
| 009 | 6 | 2 | 1 | 3 | 0 | 0 |
| 010 | 6 | 1 | 4 | 0 | 1 | 0 |

## Metadata findings

- **access mode likely dynamic or protected:** 26
- **declared domain mismatch:** 1
- **duplicate buyer in combined catalog:** 24
- **duplicate url in combined catalog:** 3
- **login or access restriction possible:** 26
- **possible parser candidate:** 50
- **ready to parse not supported by live check:** 3

### Duplicate buyer groups affecting audited records

- `City of Houston`: `tx-city-of-houston`, `tx-houston`, `tx-houston-procurement`
- `Los Angeles World Airports`: `ca-lawa`, `ca-lawa-business`, `ca-los-angeles-world-airports`
- `City of Philadelphia`: `pa-city-of-philadelphia`, `pa-philadelphia`
- `City of Austin`: `tx-austin`, `tx-austin-purchasing`, `tx-city-of-austin`
- `City of St. Petersburg`: `fl-st-petersburg`, `fl-st-petersburg-procurement`
- `City of Long Beach`: `ca-city-of-long-beach`, `ca-long-beach`
- `City of Oakland`: `ca-oakland`, `ca-oakland-purchasing`
- `City of Anaheim`: `ca-anaheim`, `ca-anaheim-purchasing`
- `Port of Los Angeles`: `ca-port-la`, `ca-port-of-los-angeles`
- `City of San Antonio`: `tx-city-of-san-antonio`, `tx-san-antonio`, `tx-san-antonio-purchasing`
- `City of Corpus Christi`: `tx-corpus-christi`, `tx-corpus-christi-purchasing`
- `Port Houston`: `tx-port-houston`, `tx-port-houston-procurement`
- `San Antonio Water System`: `tx-san-antonio-water`, `tx-san-antonio-water-system`
- `City of Jacksonville`: `fl-jacksonville`, `fl-jacksonville-procurement`
- `City of Miami`: `fl-miami`, `fl-miami-procurement`
- `City of Tallahassee`: `fl-tallahassee`, `fl-tallahassee-procurement`
- `Florida International University`: `fl-fiu`, `fl-fiu-purchasing`
- `Greater Orlando Aviation Authority`: `fl-greater-orlando-aviation`, `fl-mco-procurement`
- `Central Florida Regional Transportation Authority`: `fl-lynx`, `fl-lynx-procurement`
- `City University of New York`: `ny-cuny`, `ny-cuny-procurement`
- `Niagara Frontier Transportation Authority`: `ny-buffalo-niagara-airport`, `ny-nfta`
- `Buffalo Public Schools`: `ny-buffalo-public-schools`, `ny-buffalo-schools`

### Exact duplicate URL groups

- `ca-city-of-long-beach`, `ca-long-beach`
- `ny-buffalo-niagara-airport`, `ny-nfta`

### `ready_to_parse` records not supported by the live check

- `ca-oakland` — City of Oakland — audit status `dead`
- `ca-santa-ana` — City of Santa Ana — audit status `dead`
- `ny-nyc-ddc` — New York City Department of Design and Construction — audit status `dead`

### Stored-domain mismatch

- `hi-honolulu` — honolulu.gov->www8.honolulu.gov

## 404/410 records by chunk

### Chunk 001 — 14

`al-jefferson-county`, `fl-hillsborough-county`, `ga-fulton-county`, `ia-des-moines`, `ks-wichita`, `ma-massport`, `mp-procurement`, `nd-fargo`, `nj-essex-county`, `ny-nyc-dcas`, `ok-oklahoma-city`, `pa-allegheny-county`, `sc-richland-county`, `sd-sioux-falls`

### Chunk 002 — 12

`ut-salt-lake-city`, `wv-charleston`, `wy-cheyenne`, `ca-los-angeles-world-airports`, `il-metropolitan-water-reclamation-district`, `md-maryland-transportation-authority`, `al-mobile-county-public-schools`, `co-aurora`, `de-new-castle-county`, `fl-palm-beach-county`, `ga-dekalb-county`, `ks-johnson-county`

### Chunk 003 — 16

`me-bangor`, `ma-boston-public-schools-procurement`, `mi-grand-rapids`, `mn-ramsey-county`, `nv-washoe-county`, `nm-bernalillo-county`, `ny-westchester-county`, `oh-cuyahoga-county`, `tn-chattanooga`, `tx-austin`, `vt-south-burlington`, `wa-spokane`, `wv-huntington`, `wy-casper`, `pr-university-of-puerto-rico`, `vi-water-and-power-authority-procurement`

### Chunk 004 — 3

`ga-savannah`, `nc-durham`, `tx-arlington`

### Chunk 005 — 7

`ca-contra-costa-county`, `ca-oakland`, `ca-santa-ana`, `ca-berkeley`, `ca-santa-monica`, `ca-lawa`, `ca-mwd`

### Chunk 006 — 7

`tx-bexar-county`, `tx-san-antonio`, `tx-university-of-texas-system`, `tx-houston-airports`, `tx-port-houston`, `tx-capmetro`, `tx-san-antonio-water`

### Chunk 007 — 7

`fl-miami`, `fl-orlando`, `fl-tallahassee`, `fl-gainesville`, `fl-fiu`, `fl-hart`, `fl-lynx`

### Chunk 008 — 8

`ny-nyc-ddc`, `ny-syracuse`, `ny-albany-city`, `ny-cuny`, `ny-monroe-county-water-authority`, `ny-buffalo-schools`, `ny-rochester-schools`, `ny-syracuse-schools`

### Chunk 009 — 1

`az-chandler`

### Chunk 010 — 4

`va-chesapeake`, `oh-cleveland`, `tx-el-paso-county`, `ga-gwinnett-county`

## Protected or bot-blocked records by chunk

### Chunk 001 — 2

`de-wilmington`, `ne-omaha`

### Chunk 002 — 3

`wi-milwaukee`, `mi-oakland-county`, `ct-new-haven`

### Chunk 003 — 4

`md-prince-georges-county`, `mo-st-louis-county`, `ri-warwick`, `sd-rapid-city`

### Chunk 004 — 2

`ca-san-jose`, `nc-greensboro`

### Chunk 005 — 6

`ca-riverside-county`, `ca-santa-clara-county`, `ca-pasadena`, `ca-glendale`, `ca-burbank`, `ca-csu`

### Chunk 006 — 1

`tx-richardson`

### Chunk 007 — 1

`fl-port-everglades`

### Chunk 008 — 4

`ny-albany-county`, `ny-suffolk-county`, `ny-rochester`, `ny-suny`

### Chunk 009 — 3

`tx-irving`, `il-lake-county`, `ca-kern-county`

## Network/server failures by chunk

### Chunk 001 — 3

`ak-university-of-alaska`, `hi-honolulu`, `me-portland`

### Chunk 002 — 5

`va-virginia-beach`, `wa-sound-transit`, `az-tucson`, `ca-sacramento-county`, `in-fort-wayne`

### Chunk 006 — 2

`tx-corpus-christi`, `tx-texas-am`

### Chunk 007 — 1

`fl-miami-dade-schools`

### Chunk 008 — 3

`ny-buffalo-niagara-airport`, `ny-nfta`, `ny-onondaga-county`

## Reachable but unclear records by chunk

### Chunk 001 — 3

`ar-little-rock`, `gu-general-services-agency`, `in-indianapolis`

### Chunk 002 — 2

`ar-fayetteville`, `ia-linn-county`

### Chunk 003 — 3

`mt-missoula`, `nh-nashua`, `va-norfolk`

### Chunk 008 — 2

`ny-nassau-county`, `ny-buffalo`

### Chunk 010 — 1

`ga-cobb-county`

## Required correction sequence

1. Research replacements for the 79 stored endpoints returning 404/410.
2. Manually verify the 26 protected endpoints and change `accessMode`/`parserStatus` where static parsing is unsupported.
3. Recheck the 14 network/server failures from a browser and an independent network before changing them.
4. Resolve duplicate buyer groups by retaining the best canonical record and removing or consolidating redundant historical entries.
5. Promote the 50 live `catalog_only` pages to parsing candidates only after confirming that they expose repeatable opportunity listings rather than generic purchasing information.
6. Rerun the complete combined-catalog validators and the live endpoint audit after corrections.
