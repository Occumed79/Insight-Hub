import { isDeletedPortalSourceId } from "./deletedPortalPolicy";
import { isRegisteredPublicPortalAdapter } from "./publicPortalAdapterRegistry";

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
  parserStatus?: string;
  requiresKey?: boolean;
  requiresLogin?: boolean;
}

export interface PortalConnectorCapability {
  connectorStatus: PortalConnectorStatus;
  connectorLabel: string;
  connectorDescription: string;
  directCollection: boolean;
  requiresSerper: boolean;
  registeredAdapter: boolean;
  runtimeRunnable: boolean;
  unfinished: boolean;
  disabled: boolean;
  registrationKind: "direct_api" | "adapter" | "none";
}

export function portalConnectorCapability(
  portal: PortalCapabilityInput,
): PortalConnectorCapability {
  if (isDeletedPortalSourceId(portal.id)) {
    throw new Error(`Deleted portal source cannot be classified: ${portal.id}`);
  }

  if (portal.id === "us-sam-gov") {
    return {
      connectorStatus: "direct_api",
      connectorLabel: "Direct official API",
      connectorDescription: "Collected through the registered SAM.gov API provider.",
      directCollection: true,
      requiresSerper: false,
      registeredAdapter: true,
      runtimeRunnable: true,
      unfinished: false,
      disabled: false,
      registrationKind: "direct_api",
    };
  }

  if (portal.requiresKey || portal.requiresLogin) {
    throw new Error(
      `Authenticated or key-gated portal source must be deleted or backed by an approved API adapter: ${portal.id}`,
    );
  }

  if (isRegisteredPublicPortalAdapter(portal.id)) {
    return {
      connectorStatus: "direct_adapter",
      connectorLabel: "Registered adapter",
      connectorDescription:
        "Collected through a source-specific adapter registered in the runtime adapter registry.",
      directCollection: true,
      requiresSerper: false,
      registeredAdapter: true,
      runtimeRunnable: true,
      unfinished: false,
      disabled: false,
      registrationKind: "adapter",
    };
  }

  const unfinished =
    portal.parserStatus === "needs_parser" ||
    portal.parserStatus === "ready_to_parse";
  return {
    connectorStatus: unfinished ? "stub" : "directory_only",
    connectorLabel: unfinished ? "Unfinished source" : "Catalogued only",
    connectorDescription: unfinished
      ? "The published official opportunity source still requires a registered adapter or approved extractor."
      : "The published source is metadata-only and has no runtime collection authority.",
    directCollection: false,
    requiresSerper: false,
    registeredAdapter: false,
    runtimeRunnable: false,
    unfinished,
    disabled: false,
    registrationKind: "none",
  };
}

export function withPortalConnectorCapability<T extends PortalCapabilityInput>(
  portal: T,
): T & PortalConnectorCapability {
  return { ...portal, ...portalConnectorCapability(portal) };
}
