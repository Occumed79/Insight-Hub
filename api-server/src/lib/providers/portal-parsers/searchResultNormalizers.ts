import { createPortalParser } from "./generic";
import type { PortalParser } from "./types";

/**
 * These helpers normalize already-discovered search-result metadata. They are
 * not portal crawlers, listing adapters, pagination handlers, or direct API
 * integrations. Keeping them in a separate registry prevents generic snippet
 * normalization from being mistaken for completed portal connectivity.
 */
const STATE_BY_SOURCE_ID: Record<string, string | undefined> = {
  "us-sam-gov": undefined,
  "ca-caleprocure": "CA",
  "tx-esbd": "TX",
  "ny-contract-reporter": "NY",
  "fl-vbs": "FL",
  "pa-emarketplace": "PA",
  "va-eva": "VA",
  "oh-ohiobuys": "OH",
  "mi-sigma": "MI",
  "md-emma": "MD",
  "nc-evp": "NC",
};

const NORMALIZERS: Record<string, PortalParser> = Object.fromEntries(
  Object.entries(STATE_BY_SOURCE_ID).map(([sourceId, state]) => [
    sourceId,
    createPortalParser(state),
  ]),
);

export const PORTAL_SEARCH_RESULT_NORMALIZER_IDS = Object.freeze(
  Object.keys(NORMALIZERS),
);

export function normalizerForPortalSource(
  sourceId?: string,
): PortalParser | undefined {
  return sourceId ? NORMALIZERS[sourceId] : undefined;
}
