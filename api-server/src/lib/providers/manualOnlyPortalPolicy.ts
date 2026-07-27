import { ENRICHED_DIRECT_RFP_PORTALS } from "./directRfpPortalRelevanceCatalog";
import {
  DELETED_PORTAL_IDS,
  DELETED_PORTAL_REASONS,
  deletedPortalReason,
  isDeletedPortalSourceId,
} from "./deletedPortalPolicy";
import { STATEWIDE_PROCUREMENT_SOURCES } from "./statewideProcurementConfigs";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";

/**
 * Compatibility exports for older call sites. These IDs are no longer retained
 * as manual-only or disabled catalogue records; they are deleted from published
 * source inventories and runtime provider maps.
 */
export const MANUAL_ONLY_PORTAL_REASONS = DELETED_PORTAL_REASONS;
export const MANUAL_ONLY_PORTAL_IDS = DELETED_PORTAL_IDS;

export function isManualOnlyPortalSourceId(sourceId: string): boolean {
  return isDeletedPortalSourceId(sourceId);
}

export function manualOnlyPortalReason(sourceId: string): string | undefined {
  return deletedPortalReason(sourceId);
}

/**
 * Legacy single-source helper. Deleted sources are never returned to a
 * catalogue or provider inventory.
 */
export function applyManualOnlyPortalPolicy(
  source: PublicPortalSource,
): PublicPortalSource {
  if (isDeletedPortalSourceId(source.id)) {
    throw new Error(`Deleted portal source cannot be retained: ${source.id}`);
  }
  return source;
}

let deletionPolicyRegistered = false;

/**
 * Remove formerly manual-only/disabled records from the published direct and
 * statewide catalogues. Historical source definitions may remain in generated
 * source files for migration traceability, but they cannot appear in the
 * application catalogue, adapter inventory, rotation, or health totals.
 */
export function registerManualOnlyDirectPortalPolicy(): void {
  if (deletionPolicyRegistered) return;
  deletionPolicyRegistered = true;

  for (let index = ENRICHED_DIRECT_RFP_PORTALS.length - 1; index >= 0; index -= 1) {
    const portal = ENRICHED_DIRECT_RFP_PORTALS[index];
    if (portal && isDeletedPortalSourceId(portal.id)) {
      ENRICHED_DIRECT_RFP_PORTALS.splice(index, 1);
    }
  }

  for (let index = STATEWIDE_PROCUREMENT_SOURCES.length - 1; index >= 0; index -= 1) {
    const source = STATEWIDE_PROCUREMENT_SOURCES[index];
    if (source && isDeletedPortalSourceId(source.id)) {
      STATEWIDE_PROCUREMENT_SOURCES.splice(index, 1);
    }
  }
}
