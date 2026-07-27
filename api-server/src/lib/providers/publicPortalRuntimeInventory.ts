export type PortalOperationalStatus =
  | "runnable"
  | "unfinished"
  | "disabled"
  | "quarantined"
  | "catalogued";

export interface PortalRuntimeInventoryInput {
  id: string;
  registeredAdapter: boolean;
  runtimeRunnable: boolean;
  unfinished: boolean;
  disabled: boolean;
  quarantined?: boolean;
}

export type PortalRuntimeInventorySource<T extends PortalRuntimeInventoryInput> =
  T & {
    operationalStatus: PortalOperationalStatus;
  };

export function portalOperationalStatus(
  source: PortalRuntimeInventoryInput,
): PortalOperationalStatus {
  if (source.quarantined) return "quarantined";
  if (source.disabled) return "disabled";
  if (source.runtimeRunnable) return "runnable";
  if (source.unfinished) return "unfinished";
  return "catalogued";
}

const RUNTIME_GROUPS: Array<{
  id: PortalOperationalStatus;
  title: string;
  description: string;
}> = [
  {
    id: "runnable",
    title: "Enabled / Runnable",
    description:
      "Sources backed by a registered adapter, approved official API, or deliberately vetted extractor.",
  },
  {
    id: "unfinished",
    title: "Unfinished Sources",
    description:
      "Catalogued sources that still need an adapter or an explicitly approved extractor.",
  },
  {
    id: "disabled",
    title: "Disabled Sources",
    description:
      "Sources intentionally excluded from automated collection by runtime policy.",
  },
  {
    id: "quarantined",
    title: "Quarantined Sources",
    description:
      "Runtime-registered sources temporarily removed after validation failures, repeated failures, or repeated empty yield.",
  },
  {
    id: "catalogued",
    title: "Catalogued Only",
    description:
      "Inventory metadata and manual links with no runtime collection authority.",
  },
];

export function buildPublicPortalRuntimeInventory<
  T extends PortalRuntimeInventoryInput,
>(sources: readonly T[]) {
  const classified: Array<PortalRuntimeInventorySource<T>> = sources.map(
    (source) => ({
      ...source,
      operationalStatus: portalOperationalStatus(source),
    }),
  );

  return {
    total: classified.length,
    summary: {
      catalogued: classified.length,
      registeredAdapters: classified.filter(
        (source) => source.registeredAdapter,
      ).length,
      runnable: classified.filter(
        (source) => source.operationalStatus === "runnable",
      ).length,
      unfinished: classified.filter(
        (source) => source.operationalStatus === "unfinished",
      ).length,
      disabled: classified.filter(
        (source) => source.operationalStatus === "disabled",
      ).length,
      quarantined: classified.filter(
        (source) => source.operationalStatus === "quarantined",
      ).length,
    },
    groups: RUNTIME_GROUPS.map((group) => ({
      ...group,
      sources: classified.filter(
        (source) => source.operationalStatus === group.id,
      ),
    })),
  };
}
