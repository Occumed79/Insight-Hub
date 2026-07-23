import { ENRICHED_DIRECT_RFP_PORTALS } from "./directRfpPortalRelevanceCatalog";
import { STATEWIDE_PROCUREMENT_SOURCES } from "./statewideProcurementConfigs";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";

export const MANUAL_ONLY_PORTAL_REASONS: ReadonlyMap<string, string> = new Map([
  [
    "ri-bids",
    "Automated recovery pages repeatedly returned no parseable active opportunity rows. Retained as a manual official buyer link.",
  ],
  [
    "wi-vendornet",
    "Automated recovery pages repeatedly returned no parseable active opportunity rows. Retained as a manual official buyer link.",
  ],
  [
    "ca-siskiyou-county",
    "Repeated automated fetch failures. Retained as a manual official buyer link.",
  ],
  [
    "ca-sdsu-procurement",
    "Repeated automated fetch failures. Retained as a manual official buyer link.",
  ],
  [
    "ca-santa-barbara-county",
    "Repeated automated fetch failures. Retained as a manual official buyer link.",
  ],
  [
    "ca-sacramento-city",
    "Repeated automated request timeouts. Retained as a manual official buyer link.",
  ],
  [
    "ca-port-of-oakland",
    "Repeated automated fetch failures. Retained as a manual official buyer link.",
  ],
  [
    "ca-los-angeles-county",
    "Repeated automated request timeouts. Retained as a manual official buyer link.",
  ],
  [
    "ca-humboldt-county",
    "Repeated automated request timeouts. Retained as a manual official buyer link.",
  ],
  [
    "ca-bakersfield-purchasing",
    "Repeated automated fetch failures. Retained as a manual official buyer link.",
  ],
  [
    "az-tucson-airport-authority",
    "Repeated automated fetch failures. Retained as a manual official buyer link.",
  ],
  [
    "az-phoenix",
    "Repeated automated fetch failures. Retained as a manual official buyer link.",
  ],
  [
    "ct-ctsource",
    "Repeated automated request timeouts. Retained as a manual official buyer link.",
  ],
  [
    "al-state-procurement",
    "Repeated automated request timeouts. Retained as a manual official buyer link.",
  ],
  [
    "nm-active-procurements",
    "Repeated automated request timeouts. Retained as a manual official buyer link.",
  ],
]);

export const MANUAL_ONLY_PORTAL_IDS = new Set(MANUAL_ONLY_PORTAL_REASONS.keys());

export function isManualOnlyPortalSourceId(sourceId: string): boolean {
  return MANUAL_ONLY_PORTAL_IDS.has(sourceId);
}

export function manualOnlyPortalReason(sourceId: string): string | undefined {
  return MANUAL_ONLY_PORTAL_REASONS.get(sourceId);
}

export function applyManualOnlyPortalPolicy(
  source: PublicPortalSource,
): PublicPortalSource {
  const reason = manualOnlyPortalReason(source.id);
  if (!reason) return source;
  return {
    ...source,
    enabled: false,
    verificationStatus: "needs_review",
    notes: reason,
  };
}

let directCatalogPolicyRegistered = false;

export function registerManualOnlyDirectPortalPolicy(): void {
  if (directCatalogPolicyRegistered) return;
  directCatalogPolicyRegistered = true;

  for (let index = 0; index < ENRICHED_DIRECT_RFP_PORTALS.length; index += 1) {
    const portal = ENRICHED_DIRECT_RFP_PORTALS[index];
    if (!portal) continue;
    const reason = manualOnlyPortalReason(portal.id);
    if (!reason) continue;
    ENRICHED_DIRECT_RFP_PORTALS[index] = {
      ...portal,
      requiresLogin: true,
      notes: `${portal.notes} ${reason}`.trim(),
    };
  }

  for (let index = 0; index < STATEWIDE_PROCUREMENT_SOURCES.length; index += 1) {
    const source = STATEWIDE_PROCUREMENT_SOURCES[index];
    if (!source || !isManualOnlyPortalSourceId(source.id)) continue;
    STATEWIDE_PROCUREMENT_SOURCES[index] = applyManualOnlyPortalPolicy(source);
  }
}
