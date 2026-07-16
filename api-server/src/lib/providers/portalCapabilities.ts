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
const DIRECT_ADAPTER_PORTAL_IDS = new Set([
  "tx-esbd",
  "ny-contract-reporter",
]);

/**
 * Report the connector that actually exists in the repository.
 *
 * This deliberately ignores parserStatus. parserStatus describes catalog intent,
 * not proof that a dedicated connector was implemented. The capability returned
 * here is derived from the runtime paths that are currently available.
 */
export function portalConnectorCapability(
  portal: PortalCapabilityInput,
): PortalConnectorCapability {
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
    const genericPublicPage =
      !portal.requiresKey &&
      !portal.requiresLogin &&
      (portal.accessMode === "public_html" || portal.accessMode === "csv");

    if (genericPublicPage) {
      return {
        connectorStatus: "generic_extraction",
        connectorLabel: "Generic public-page extraction",
        connectorDescription: "One public page is fetched with generic link/text extraction; this is not a portal-specific parser or complete pagination.",
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

export function withPortalConnectorCapability<T extends PortalCapabilityInput>(
  portal: T,
): T & PortalConnectorCapability {
  return {
    ...portal,
    ...portalConnectorCapability(portal),
  };
}
