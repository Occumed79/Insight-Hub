import { CIVICENGAGE_PORTAL_IDS } from "./civicEngageBids";
import { manualOnlyPortalReason } from "./manualOnlyPortalPolicy";
import { OPENGOV_PORTAL_IDS } from "./openGov";
import { registerOpenGovCountyExtensions } from "./openGovCountyExtensions";
import {
  PLANETBIDS_AUTOMATION_BLOCK_REASON,
  PLANETBIDS_WAF_BLOCKED_PORTAL_IDS,
} from "./planetBidsAccessPolicy";
import { STATEWIDE_PROCUREMENT_PORTAL_IDS } from "./statewideProcurementConfigs";

registerOpenGovCountyExtensions();

export const PORTAL_CONNECTOR_STATUSES = [
  "direct_api",
  "direct_adapter",
  "generic_extraction",
  "serper_discovery",
  "directory_only",
  "stub",
] as const;

export type PortalConnectorStatus = (typeof PORTAL_CONNECTOR_STATUSES)[number];

export interface PortalCapabilityInput {
  id: string;
  country: string;
  level: string;
  accessMode: string;
  requiresKey?: boolean;
  requiresLogin?: boolean;
}

export interface PortalConnectorCapability {
  connectorStatus: PortalConnectorStatus;
  connectorLabel: string;
  connectorDescription: string;
  directCollection: boolean;
  requiresSerper: boolean;
}

const DIRECT_API_PORTAL_IDS = new Set(["us-sam-gov"]);
const AUTOMATION_RESTRICTED_PORTAL_IDS = new Set([
  "wy-state-purchasing",
  "ca-calaveras-county",
]);
const DIRECT_ADAPTER_PORTAL_IDS = new Set([
  "tx-esbd",
  "ny-contract-reporter",
  "ia-das",
  "ca-caleprocure",
  ...OPENGOV_PORTAL_IDS,
  ...CIVICENGAGE_PORTAL_IDS,
  ...STATEWIDE_PROCUREMENT_PORTAL_IDS,
]);

export function portalConnectorCapability(portal: PortalCapabilityInput): PortalConnectorCapability {
  const manualOnlyReason = manualOnlyPortalReason(portal.id);
  if (manualOnlyReason) {
    return {
      connectorStatus: "directory_only",
      connectorLabel: "Manual browser access",
      connectorDescription: manualOnlyReason,
      directCollection: false,
      requiresSerper: false,
    };
  }

  if (PLANETBIDS_WAF_BLOCKED_PORTAL_IDS.has(portal.id)) {
    return {
      connectorStatus: "directory_only",
      connectorLabel: "Manual browser access",
      connectorDescription: PLANETBIDS_AUTOMATION_BLOCK_REASON,
      directCollection: false,
      requiresSerper: false,
    };
  }

  if (AUTOMATION_RESTRICTED_PORTAL_IDS.has(portal.id)) {
    return {
      connectorStatus: "directory_only",
      connectorLabel: "Manual authenticated access",
      connectorDescription: "The official buyer uses Public Purchase, which requires authenticated vendor access and does not permit unapproved automated monitoring. The source is retained for manual access only.",
      directCollection: false,
      requiresSerper: false,
    };
  }

  if (DIRECT_API_PORTAL_IDS.has(portal.id)) {
    return {
      connectorStatus: "direct_api",
      connectorLabel: "Direct official API",
      connectorDescription: "Collected through a dedicated official structured API.",
      directCollection: true,
      requiresSerper: false,
    };
  }

  if (DIRECT_ADAPTER_PORTAL_IDS.has(portal.id)) {
    return {
      connectorStatus: "direct_adapter",
      connectorLabel: "Dedicated listing adapter",
      connectorDescription: "Collected through portal-specific official listing-page code.",
      directCollection: true,
      requiresSerper: false,
    };
  }

  if (portal.country !== "US") {
    return {
      connectorStatus: "serper_discovery",
      connectorLabel: "Serper discovery only",
      connectorDescription: "Google/Serper searches the official portal domain; no direct portal connector exists yet.",
      directCollection: false,
      requiresSerper: true,
    };
  }

  if (portal.level === "state" || portal.level === "district") {
    const genericPublicPage = !portal.requiresKey && !portal.requiresLogin && (portal.accessMode === "public_html" || portal.accessMode === "csv");
    if (genericPublicPage) {
      return {
        connectorStatus: "generic_extraction",
        connectorLabel: "Generic public-page extraction",
        connectorDescription: "A bounded set of same-domain public listing pages is fetched with generic link/text extraction. This is still not a portal-specific parser and does not guarantee complete portal coverage.",
        directCollection: true,
        requiresSerper: false,
      };
    }
    return {
      connectorStatus: "serper_discovery",
      connectorLabel: "Serper discovery only",
      connectorDescription: "The official domain is searched through Serper because no supported direct connector exists.",
      directCollection: false,
      requiresSerper: true,
    };
  }

  return {
    connectorStatus: "directory_only",
    connectorLabel: "Directory link only",
    connectorDescription: "The official portal is listed for manual access; automated collection is not implemented.",
    directCollection: false,
    requiresSerper: false,
  };
}

export function withPortalConnectorCapability<T extends PortalCapabilityInput>(portal: T): T & PortalConnectorCapability {
  return { ...portal, ...portalConnectorCapability(portal) };
}
