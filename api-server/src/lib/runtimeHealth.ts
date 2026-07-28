import { intelPool, rfpPool } from "@workspace/db";

const READINESS_CACHE_MS = 5_000;
const DATABASE_PROBE_TIMEOUT_MS = 2_500;

export interface DatabaseProbeResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface RuntimeReadiness {
  ok: boolean;
  ready: boolean;
  shuttingDown: boolean;
  checkedAt: string;
  databases: {
    rfp: DatabaseProbeResult;
    intel: DatabaseProbeResult;
  };
}

let ready = false;
let shuttingDown = false;
let cachedReadiness: RuntimeReadiness | undefined;
let cacheExpiresAt = 0;
let inFlightProbe: Promise<RuntimeReadiness> | undefined;

function conciseError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300);
  return String(error).slice(0, 300);
}

async function probePool(
  pool: typeof rfpPool,
  logicalDatabase: "rfp" | "intel",
): Promise<DatabaseProbeResult> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const query = pool.query({
    text: "select 1 as healthy",
    query_timeout: DATABASE_PROBE_TIMEOUT_MS,
  });
  query.catch(() => undefined);
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${logicalDatabase} readiness probe timed out`)),
      DATABASE_PROBE_TIMEOUT_MS + 250,
    );
  });

  try {
    await Promise.race([query, deadline]);
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: conciseError(error),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function performReadinessProbe(): Promise<RuntimeReadiness> {
  const [rfp, intel] = await Promise.all([
    probePool(rfpPool, "rfp"),
    probePool(intelPool, "intel"),
  ]);
  const dependenciesHealthy = rfp.ok && intel.ok;
  const result: RuntimeReadiness = {
    ok: ready && !shuttingDown && dependenciesHealthy,
    ready,
    shuttingDown,
    checkedAt: new Date().toISOString(),
    databases: { rfp, intel },
  };
  cachedReadiness = result;
  cacheExpiresAt = Date.now() + READINESS_CACHE_MS;
  return result;
}

export function markRuntimeReady(): void {
  ready = true;
  shuttingDown = false;
  invalidateReadinessCache();
}

export function markRuntimeShuttingDown(): void {
  ready = false;
  shuttingDown = true;
  invalidateReadinessCache();
}

export function runtimeLiveness(): {
  ok: true;
  service: "insight-hub";
  awake: true;
  ready: boolean;
  shuttingDown: boolean;
  uptimeSeconds: number;
} {
  return {
    ok: true,
    service: "insight-hub",
    awake: true,
    ready,
    shuttingDown,
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

export function invalidateReadinessCache(): void {
  cachedReadiness = undefined;
  cacheExpiresAt = 0;
}

export async function runtimeReadiness(
  force = false,
): Promise<RuntimeReadiness> {
  if (!force && cachedReadiness && Date.now() < cacheExpiresAt) {
    return cachedReadiness;
  }
  if (inFlightProbe) return inFlightProbe;
  inFlightProbe = performReadinessProbe().finally(() => {
    inFlightProbe = undefined;
  });
  return inFlightProbe;
}
