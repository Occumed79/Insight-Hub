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
