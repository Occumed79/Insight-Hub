export type PortalOperationalStatus =
  | "runnable"
  | "unfinished"
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
      "Published official opportunity sources that still require an adapter or approved extractor.",
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
      "Published source metadata with no runtime collection authority yet.",
  },
];

export function buildPublicPortalRuntimeInventory<
  T extends PortalRuntimeInventoryInput,
>(sources: readonly T[]) {
  // Disabled/manual-only records are deleted from the inventory rather than
  // represented as a separate operational state.
  const classified: Array<PortalRuntimeInventorySource<T>> = sources
    .filter((source) => !source.disabled)
    .map((source) => ({
      ...source,
      operationalStatus: portalOperationalStatus(source),
    }));

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
      disabled: 0,
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
