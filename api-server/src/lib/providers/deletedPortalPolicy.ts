export const DELETED_PORTAL_REASONS: ReadonlyMap<string, string> = new Map([
  ["ri-bids", "No reliable public automated opportunity feed was available."],
  ["wi-vendornet", "No reliable public automated opportunity feed was available."],
  ["vt-bids", "The public site did not expose stable parseable opportunity records."],
  ["nd-spo", "The public search requires interactive access or CAPTCHA."],
  ["ct-ctsource", "The public route repeatedly timed out without a reliable adapter result."],
  ["al-state-procurement", "The public route repeatedly timed out without a reliable adapter result."],
  ["nm-active-procurements", "The public route repeatedly timed out without a reliable adapter result."],
  ["nc-evp", "The public route did not expose reliable parseable opportunities."],
  ["ca-siskiyou-county", "Repeated automated fetch failures prevented reliable collection."],
  ["ca-sdsu-procurement", "Repeated automated fetch failures prevented reliable collection."],
  ["ca-santa-barbara-county", "Repeated automated fetch failures prevented reliable collection."],
  ["ca-sacramento-city", "Repeated automated timeouts prevented reliable collection."],
  ["ca-port-of-oakland", "Repeated automated fetch failures prevented reliable collection."],
  ["ca-los-angeles-county", "Repeated automated timeouts prevented reliable collection."],
  ["ca-humboldt-county", "Repeated automated timeouts prevented reliable collection."],
  ["ca-bakersfield-purchasing", "Repeated automated fetch failures prevented reliable collection."],
  ["az-tucson-airport-authority", "Repeated automated fetch failures prevented reliable collection."],
  ["az-phoenix", "Repeated automated fetch failures prevented reliable collection."],
  ["fl-orange-county-public-schools", "The official site disallows automated crawling."],
  ["wy-state-purchasing", "The source requires authenticated Public Purchase vendor access."],
  ["ca-calaveras-county", "The source requires authenticated Public Purchase vendor access."],
  ["ca-fresno", "The source is blocked by a browser/WAF challenge."],
  ["ca-irvine", "The source is blocked by a browser/WAF challenge."],
  ["ca-imperial-county", "The source is blocked by a browser/WAF challenge."],
  ["ca-caleprocure", "The official listing returned HTTP 403 during repeated live adapter verification."],
  ["ca-san-francisco", "The official page returned no parseable active opportunity records during repeated live verification."],
  ["nh-bids", "The official bid listing returned HTTP 403 during repeated live adapter verification."],
  ["tn-greene-county", "The official page returned no parseable active opportunity records during repeated live verification."],
  ["wa-klickitat-county", "The legacy CivicEngage bid URL redirected outside its configured official source during repeated live verification."],
  ["az-chandler-unified-school-district-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["ca-city-of-palm-desert-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["ca-city-of-santa-cruz-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["ca-city-of-west-sacramento-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["ca-inyo-county", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["ca-orange-county", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["ca-san-bernardino-city-unified-school-district-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["ca-san-mateo-county", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["ca-santa-cruz-county", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["ca-solano-county", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["fl-alachua-county-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["fl-clay-county-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["fl-monroe-county-school-district-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["fl-pinellas-county-school-district-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["fl-santa-rosa-county-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["fl-volusia-county-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["md-wicomico-county-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["nj-jersey-city-public-schools-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["nj-passaic-city-school-district-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["oh-cleveland-metropolitan-school-district-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["pa-scranton-city-school-district-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["sc-richland-school-district-two-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
  ["va-richmond-public-schools-opengov", "The OpenGov public listing exposed no parseable opportunity records during repeated live adapter verification."],
]);

/**
 * These IDs are permanently excluded from published catalogue exports, runtime
 * adapter registries, ingestion rotation, source-health reporting, and UI
 * inventory. They are not represented as disabled or manual-only sources.
 */
export const DELETED_PORTAL_IDS = new Set(DELETED_PORTAL_REASONS.keys());

export function isDeletedPortalSourceId(sourceId: string): boolean {
  return DELETED_PORTAL_IDS.has(sourceId);
}

export function deletedPortalReason(sourceId: string): string | undefined {
  return DELETED_PORTAL_REASONS.get(sourceId);
}

export function removeDeletedPortalSources<T extends { id: string }>(
  sources: readonly T[],
): T[] {
  return sources.filter((source) => !isDeletedPortalSourceId(source.id));
}

export function removeDeletedPortalConfigs<T extends { portalId: string }>(
  configs: readonly T[],
): T[] {
  return configs.filter((config) => !isDeletedPortalSourceId(config.portalId));
}
