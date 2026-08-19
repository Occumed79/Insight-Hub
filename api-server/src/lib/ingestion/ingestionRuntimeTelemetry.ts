import { desc, inArray } from "drizzle-orm";
import { rfpDb } from "@workspace/db";
import { opportunityIngestionRunsTable } from "@workspace/db/schema/rfp";

export interface IngestionMemberTelemetry {
  provider: string;
  status: "selected" | "used" | "warning" | "failed" | "skipped";
  renewal?: string | null;
  accountSlot?: string | null;
  queryCount?: number;
  queries?: string[];
  candidates?: number;
  accepted?: number;
  aiScorers?: string[];
  enrichment?: Record<string, number>;
  spent?: boolean;
  note?: string;
  updatedAt: string;
}

export interface IngestionRunTelemetrySnapshot {
  runId: string;
  updatedAt: string | null;
  selectedDiscoveryProviders: string[];
  configuredDiscoveryProviders: string[];
  providers: IngestionMemberTelemetry[];
  aiScorers: string[];
}

type RunState = {
  updatedAt: number;
  selectedDiscoveryProviders: string[];
  configuredDiscoveryProviders: string[];
  providers: Map<string, IngestionMemberTelemetry>;
  aiScorers: Set<string>;
};

const runs = new Map<string, RunState>();
const MAX_RUNS = 32;
const RUN_TTL_MS = 6 * 60 * 60 * 1_000;
const ACTIVE_RUN_CACHE_MS = 1_000;
let activeRunCache: { runId: string | null; loadedAt: number } | null = null;
let activeRunPromise: Promise<string | null> | null = null;

function prune(now = Date.now()): void {
  for (const [runId, state] of runs) {
    if (now - state.updatedAt > RUN_TTL_MS) runs.delete(runId);
  }
  while (runs.size > MAX_RUNS) {
    const oldest = runs.keys().next().value as string | undefined;
    if (!oldest) break;
    runs.delete(oldest);
  }
}

function ensure(runId: string): RunState {
  prune();
  const existing = runs.get(runId);
  if (existing) {
    existing.updatedAt = Date.now();
    return existing;
  }
  const created: RunState = {
    updatedAt: Date.now(),
    selectedDiscoveryProviders: [],
    configuredDiscoveryProviders: [],
    providers: new Map(),
    aiScorers: new Set(),
  };
  runs.set(runId, created);
  prune();
  return created;
}

async function activeDurableRunId(): Promise<string | null> {
  const now = Date.now();
  if (activeRunCache && now - activeRunCache.loadedAt < ACTIVE_RUN_CACHE_MS) {
    return activeRunCache.runId;
  }
  if (activeRunPromise) return activeRunPromise;
  activeRunPromise = (async () => {
    try {
      const [row] = await rfpDb
        .select({ id: opportunityIngestionRunsTable.id })
        .from(opportunityIngestionRunsTable)
        .where(
          inArray(opportunityIngestionRunsTable.status, ["queued", "running"]),
        )
        .orderBy(desc(opportunityIngestionRunsTable.createdAt))
        .limit(1);
      const runId = row?.id ?? null;
      activeRunCache = { runId, loadedAt: Date.now() };
      return runId;
    } catch {
      activeRunCache = { runId: null, loadedAt: Date.now() };
      return null;
    } finally {
      activeRunPromise = null;
    }
  })();
  return activeRunPromise;
}

async function resolvedRunId(runId?: string): Promise<string | null> {
  return runId?.trim() || (await activeDurableRunId());
}

function applyDiscoverySelection(
  runId: string,
  input: { configured: string[]; selected: string[] },
): void {
  const state = ensure(runId);
  state.configuredDiscoveryProviders = [...input.configured];
  state.selectedDiscoveryProviders = [...input.selected];
  const selected = new Set(input.selected);
  const now = new Date().toISOString();
  for (const provider of input.configured) {
    const existing = state.providers.get(provider);
    state.providers.set(provider, {
      provider,
      status: selected.has(provider) ? "selected" : "skipped",
      spent: selected.has(provider),
      note: selected.has(provider)
        ? "Selected by quota-aware discovery scheduler"
        : "Held in reserve by quota-aware discovery scheduler",
      updatedAt: now,
      ...(existing ?? {}),
    });
  }
  state.updatedAt = Date.now();
}

export function recordDiscoverySelection(
  runId: string | undefined,
  input: { configured: string[]; selected: string[] },
): void {
  void resolvedRunId(runId).then((resolved) => {
    if (resolved) applyDiscoverySelection(resolved, input);
  });
}

function applyProviderTelemetry(
  runId: string,
  input: Omit<IngestionMemberTelemetry, "updatedAt">,
): void {
  const state = ensure(runId);
  const previous = state.providers.get(input.provider);
  const aiScorers = Array.from(
    new Set([...(previous?.aiScorers ?? []), ...(input.aiScorers ?? [])]),
  );
  aiScorers.forEach((scorer) => state.aiScorers.add(scorer));
  state.providers.set(input.provider, {
    ...(previous ?? {
      provider: input.provider,
      status: input.status,
      updatedAt: new Date().toISOString(),
    }),
    ...input,
    aiScorers,
    updatedAt: new Date().toISOString(),
  });
  state.updatedAt = Date.now();
}

export function recordIngestionProviderTelemetry(
  runId: string | undefined,
  input: Omit<IngestionMemberTelemetry, "updatedAt">,
): void {
  void resolvedRunId(runId).then((resolved) => {
    if (resolved) applyProviderTelemetry(resolved, input);
  });
}

export function ingestionRunTelemetrySnapshot(
  runId: string,
): IngestionRunTelemetrySnapshot {
  prune();
  const state = runs.get(runId);
  if (!state) {
    return {
      runId,
      updatedAt: null,
      selectedDiscoveryProviders: [],
      configuredDiscoveryProviders: [],
      providers: [],
      aiScorers: [],
    };
  }
  return {
    runId,
    updatedAt: new Date(state.updatedAt).toISOString(),
    selectedDiscoveryProviders: [...state.selectedDiscoveryProviders],
    configuredDiscoveryProviders: [...state.configuredDiscoveryProviders],
    providers: [...state.providers.values()].sort((left, right) =>
      left.provider.localeCompare(right.provider),
    ),
    aiScorers: [...state.aiScorers],
  };
}

export function clearIngestionRuntimeTelemetryForTests(): void {
  runs.clear();
  activeRunCache = null;
  activeRunPromise = null;
}
