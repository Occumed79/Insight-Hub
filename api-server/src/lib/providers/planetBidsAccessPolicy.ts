export const PLANETBIDS_WAF_BLOCKED_PORTAL_IDS = new Set([
  "ca-fresno",
  "ca-irvine",
  "ca-imperial-county",
]);

export function isPlanetBidsAutomationBlocked(portalId: string): boolean {
  return PLANETBIDS_WAF_BLOCKED_PORTAL_IDS.has(portalId);
}

export const PLANETBIDS_AUTOMATION_BLOCK_REASON =
  "PlanetBids serves an AWS WAF browser challenge to automated public listing requests. The buyer link is retained for manual browser access; no challenge bypass is attempted.";
