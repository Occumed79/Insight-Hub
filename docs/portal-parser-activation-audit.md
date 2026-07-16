# Portal parser activation audit

## Finding

The legacy portal parser registry did not contain portal-specific collectors for California Cal eProcure, Florida VBS/MFMP, Pennsylvania eMarketplace, Virginia eVA, OhioBuys, Michigan SIGMA, Maryland eMMA, or North Carolina eVP. Those modules were state-labeled wrappers around one generic search-result normalizer.

They must not be counted as direct portal adapters.

## Actual runtime classification

### Dedicated direct adapters

- Texas ESBD / Texas SmartBuy
- New York State Contract Reporter

### Generic public-page extraction

The public HTML/CSV catalog path uses bounded same-domain link and text extraction, now with configurable pagination. This remains generic extraction and does not imply complete portal-specific coverage.

Relevant statewide systems in this category include:

- Pennsylvania eMarketplace
- Virginia eVA
- OhioBuys / Ohio Procurement
- eMaryland Marketplace Advantage
- North Carolina eVP

### Serper discovery only

Dynamic or supplier-portal systems without a supported direct runner remain official-domain search discovery targets, including:

- California Cal eProcure
- Florida Vendor Bid System / MFMP
- Michigan SIGMA VSS

## Architecture correction

Generic search-result normalization is now held in a separately named registry. It may improve fields on an already discovered Serper result, but it is not treated as a crawler, direct API, listing adapter, pagination implementation, or proof of portal connectivity.

## Pagination improvement

Eligible generic public HTML sources now support bounded same-domain pagination. The default limit is three listing pages per source and is controlled by `PUBLIC_PORTAL_MAX_PAGES`. Pagination links must remain on the official source domain and must present explicit pagination signals such as `rel=next`, next-page text, or pagination markup.

No dynamic browser automation, supplier login automation, direct API activation, or production-source verification was performed in this batch.
