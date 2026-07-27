export type PortalOperationalStatus = "runnable" | "quarantined";

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
  if (!source.runtimeRunnable || !source.registeredAdapter) {
    throw new Error(
      `Non-runnable source cannot enter the published runtime inventory: ${source.id}`,
    );
  }
  return source.quarantined ? "quarantined" : "runnable";
}

const RUNTIME_GROUPS: Array<{
  id: PortalOperationalStatus;
  title: string;
  description: string;
}> = [
  {
    id: "runnable",
    title: "Runnable Sources",
    description:
      "Published sources backed by a registered adapter or approved direct API.",
  },
  {
    id: "quarantined",
    title: "Quarantined Sources",
    description:
      "Runtime-registered sources temporarily removed after validation failures, repeated failures, or repeated empty yield.",
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
      registeredAdapters: classified.length,
      runnable: classified.filter(
        (source) => source.operationalStatus === "runnable",
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
