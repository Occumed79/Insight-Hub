import { manualOnlyPortalReason } from "./manualOnlyPortalPolicy";
import {
  PLANETBIDS_AUTOMATION_BLOCK_REASON,
  PLANETBIDS_WAF_BLOCKED_PORTAL_IDS,
} from "./planetBidsAccessPolicy";
import {
  isRegisteredPublicPortalAdapter,
  publicPortalRuntimeDisabledReason,
} from "./publicPortalAdapterRegistry";

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

function disabledCapability(
  reason: string,
  connectorLabel = "Manual browser access",
): PortalConnectorCapability {
  return {
    connectorStatus: "directory_only",
    connectorLabel,
    connectorDescription: reason,
    directCollection: false,
    requiresSerper: false,
    registeredAdapter: false,
    runtimeRunnable: false,
    unfinished: false,
    disabled: true,
    registrationKind: "none",
  };
}

export function portalConnectorCapability(
  portal: PortalCapabilityInput,
): PortalConnectorCapability {
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

  if (PLANETBIDS_WAF_BLOCKED_PORTAL_IDS.has(portal.id)) {
    return disabledCapability(
      PLANETBIDS_AUTOMATION_BLOCK_REASON,
      "Manual browser access",
    );
  }

  const manualOnlyReason = manualOnlyPortalReason(portal.id);
  if (manualOnlyReason) {
    return disabledCapability(manualOnlyReason, "Manual browser access");
  }

  const runtimeDisabled = publicPortalRuntimeDisabledReason(portal.id);
  if (runtimeDisabled) {
    return disabledCapability(runtimeDisabled, "Manual browser access");
  }

  if (portal.requiresKey || portal.requiresLogin) {
    return disabledCapability(
      "The catalogued source requires credentials or authenticated vendor access and has no approved runtime adapter.",
      "Manual browser access",
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
      ? "The source is catalogued, but no registered adapter, approved official API, or deliberately vetted extractor exists."
      : "The source is retained as inventory metadata and a manual link only.",
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
