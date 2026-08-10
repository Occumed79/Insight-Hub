export interface LimitedProviderAttempt<T> {
  name: string;
  isConfigured: () => Promise<boolean>;
  run: (signal?: AbortSignal) => Promise<T>;
}

export interface LimitedProviderPoolResult<T> {
  value: T | null;
  provider: string | null;
  attempted: string[];
  skippedCooldown: string[];
  /** Terminal errors only: populated when the pool produced no usable value. */
  errors: string[];
  /** Diagnostics from providers that failed before a later fallback succeeded. */
  recoveredErrors: string[];
}

interface CooldownEntry {
  until: number;
  reason: string;
}

interface PoolWindow {
  startedAt: number;
  lastUsedAt: number;
  attempts: number;
  loggedLimits: Set<"calls" | "runtime">;
}

interface PoolRuntimePolicy {
  budgetMs?: number;
  attemptTimeoutMs?: number;
  maxAttempts?: number;
}

const cooldowns = new Map<string, CooldownEntry>();
const cursors = new Map<string, number>();
const poolWindows = new Map<string, PoolWindow>();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const POOL_WINDOW_IDLE_RESET_MS = 30_000;
const POOL_WINDOW_RETENTION_MS = 5 * MINUTE;
const MAX_COOLDOWN_ENTRIES = 512;
const MAX_POOL_RUNTIME_KEYS = 128;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("Provider pool operation aborted");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

function trimOldest<K, V>(map: Map<K, V>, maximum: number): void {
  while (map.size > maximum) {
    const oldest = map.keys().next().value as K | undefined;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function pruneRuntimeState(now = Date.now()): void {
  for (const [key, cooldown] of cooldowns) {
    if (cooldown.until <= now) cooldowns.delete(key);
  }
  for (const [key, window] of poolWindows) {
    if (now - window.lastUsedAt > POOL_WINDOW_RETENTION_MS) {
      poolWindows.delete(key);
      cursors.delete(key);
    }
  }
  trimOldest(cooldowns, MAX_COOLDOWN_ENTRIES);
  trimOldest(poolWindows, MAX_POOL_RUNTIME_KEYS);
  trimOldest(cursors, MAX_POOL_RUNTIME_KEYS);
}

function cooldownMs(error: unknown): number {
  const message = errorText(error);
  if (
    /quota|credit|balance|billing|monthly|daily limit|resource exhausted/i.test(
      message,
    )
  ) {
    return 6 * HOUR;
  }
  if (/\b429\b|rate.?limit|too many requests|throttl/i.test(message)) {
    return 15 * MINUTE;
  }
  if (
    /\b(401|403)\b|unauthori[sz]ed|forbidden|invalid api.?key/i.test(message)
  ) {
    return 6 * HOUR;
  }
  if (
    /timeout|timed out|abort|ECONNRESET|ECONNREFUSED|\b5\d\d\b/i.test(message)
  ) {
    return 2 * MINUTE;
  }
  return MINUTE;
}

function poolProviderKey(poolId: string, provider: string): string {
  return `${poolId}:${provider}`;
}

function rotated<T>(items: T[], start: number): T[] {
  if (items.length < 2) return items;
  const offset = ((start % items.length) + items.length) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function runtimePolicy(poolId: string): PoolRuntimePolicy {
  if (poolId === "opportunity-web-discovery") {
    return { budgetMs: 45_000, attemptTimeoutMs: 10_000, maxAttempts: 6 };
  }
  if (poolId === "opportunity-page-enrichment") {
    return { budgetMs: 20_000, attemptTimeoutMs: 15_000, maxAttempts: 10 };
  }
  if (poolId === "opportunity-ai-extraction") {
    return { budgetMs: 35_000, attemptTimeoutMs: 12_000, maxAttempts: 8 };
  }
  if (poolId === "opportunity-structured-review") {
    return { budgetMs: 30_000, attemptTimeoutMs: 15_000, maxAttempts: 5 };
  }
  if (poolId === "opportunity-structured-federal") {
    return { budgetMs: 70_000, attemptTimeoutMs: 35_000 };
  }
  return {};
}

function currentPoolWindow(poolId: string, now: number): PoolWindow {
  pruneRuntimeState(now);
  const existing = poolWindows.get(poolId);
  if (!existing || now - existing.lastUsedAt > POOL_WINDOW_IDLE_RESET_MS) {
    const created = {
      startedAt: now,
      lastUsedAt: now,
      attempts: 0,
      loggedLimits: new Set<"calls" | "runtime">(),
    };
    poolWindows.delete(poolId);
    poolWindows.set(poolId, created);
    trimOldest(poolWindows, MAX_POOL_RUNTIME_KEYS);
    return created;
  }
  existing.lastUsedAt = now;
  return existing;
}

async function withAttemptTimeout<T>(
  run: (signal?: AbortSignal) => Promise<T>,
  timeoutMs: number | undefined,
  label: string,
  parentSignal?: AbortSignal,
): Promise<T> {
  throwIfAborted(parentSignal);

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let parentReject: ((reason?: unknown) => void) | undefined;
  const abortFromParent = () => {
    if (!parentSignal) return;
    const reason = abortReason(parentSignal);
    if (!controller.signal.aborted) controller.abort(reason);
    parentReject?.(reason);
  };

  const parentAbort = parentSignal
    ? new Promise<never>((_resolve, reject) => {
        parentReject = reject;
        parentSignal.addEventListener("abort", abortFromParent, { once: true });
      })
    : undefined;

  const timeout =
    timeoutMs && timeoutMs > 0
      ? new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            const error = new Error(`${label} timed out after ${timeoutMs}ms`);
            if (!controller.signal.aborted) controller.abort(error);
            reject(error);
          }, timeoutMs);
          timer.unref?.();
        })
      : undefined;

  const providerPromise = Promise.resolve().then(() => run(controller.signal));
  providerPromise.catch(() => undefined);

  try {
    const racers: Promise<T>[] = [providerPromise];
    if (timeout) racers.push(timeout as Promise<T>);
    if (parentAbort) racers.push(parentAbort as Promise<T>);
    return await Promise.race(racers);
  } finally {
    if (timer) clearTimeout(timer);
    if (parentSignal) {
      parentSignal.removeEventListener("abort", abortFromParent);
    }
  }
}

function logRecoveredErrors(
  poolId: string,
  provider: string,
  attempted: string[],
  recoveredErrors: string[],
): void {
  if (recoveredErrors.length === 0) return;
  console.warn(
    JSON.stringify({
      event: "limited_provider_pool_recovered",
      poolId,
      successfulProvider: provider,
      attempted,
      recoveredErrors,
    }),
  );
}

function logBudgetReached(
  poolId: string,
  limitType: "calls" | "runtime",
  limit: number,
  window?: PoolWindow,
): void {
  // Discovery/extraction calls fan out across many candidates. Once their
  // shared ceiling is exhausted every later candidate observes the same
  // condition, so emit one diagnostic per window rather than flooding logs.
  if (window?.loggedLimits.has(limitType)) return;
  window?.loggedLimits.add(limitType);
  console.info(
    JSON.stringify({
      event: "limited_provider_pool_budget_reached",
      poolId,
      limitType,
      limit,
      outcome: "partial-results-preserved",
    }),
  );
}

/**
 * Runs limited-capacity providers sequentially. Each success advances the pool
 * cursor so the next request begins with a different provider. Provider errors
 * enter cooldown, but a recovered fallback failure is diagnostic—not a failed
 * Fetch Intelligence run. Only an exhausted pool returns terminal errors.
 *
 * Opportunity pools also enforce a shared call ceiling across the active run
 * window. Reaching that ceiling is normal partial completion, not an error.
 * Parent cancellation is never converted into provider failure/cooldown state.
 */
export async function runLimitedProviderPool<T>(
  poolId: string,
  attempts: LimitedProviderAttempt<T>[],
  isUseful: (value: T) => boolean = () => true,
  options: {
    rotate?: boolean;
    budgetMs?: number;
    attemptTimeoutMs?: number;
    maxAttempts?: number;
    signal?: AbortSignal;
  } = {},
): Promise<LimitedProviderPoolResult<T>> {
  pruneRuntimeState();
  throwIfAborted(options.signal);

  const configured: LimitedProviderAttempt<T>[] = [];
  const encounteredErrors: string[] = [];
  const defaults = runtimePolicy(poolId);
  const policy: PoolRuntimePolicy = {
    budgetMs: options.budgetMs ?? defaults.budgetMs,
    attemptTimeoutMs: options.attemptTimeoutMs ?? defaults.attemptTimeoutMs,
    maxAttempts: options.maxAttempts ?? defaults.maxAttempts,
  };
  const window =
    policy.budgetMs || policy.maxAttempts
      ? currentPoolWindow(poolId, Date.now())
      : undefined;

  for (const attempt of attempts) {
    throwIfAborted(options.signal);
    try {
      if (await attempt.isConfigured()) configured.push(attempt);
    } catch (error) {
      throwIfAborted(options.signal);
      encounteredErrors.push(
        `${attempt.name} configuration check failed: ${errorText(error)}`,
      );
    }
  }

  const rotateProviders = options.rotate !== false;
  const start = rotateProviders ? (cursors.get(poolId) ?? 0) : 0;
  const ordered = rotated(configured, start);
  const attempted: string[] = [];
  const skippedCooldown: string[] = [];
  let budgetReached = false;

  for (const attempt of ordered) {
    throwIfAborted(options.signal);
    const now = Date.now();
    const key = poolProviderKey(poolId, attempt.name);
    const cooldown = cooldowns.get(key);
    if (cooldown && cooldown.until > now) {
      skippedCooldown.push(attempt.name);
      continue;
    }
    if (cooldown) cooldowns.delete(key);

    if (window && policy.maxAttempts != null) {
      window.lastUsedAt = Date.now();
      if (window.attempts >= policy.maxAttempts) {
        logBudgetReached(poolId, "calls", policy.maxAttempts, window);
        budgetReached = true;
        break;
      }
    }

    let effectiveTimeoutMs = policy.attemptTimeoutMs;
    if (window && policy.budgetMs) {
      window.lastUsedAt = Date.now();
      const remaining = policy.budgetMs - (Date.now() - window.startedAt);
      if (remaining <= 0) {
        logBudgetReached(poolId, "runtime", policy.budgetMs, window);
        budgetReached = true;
        break;
      }
      effectiveTimeoutMs = effectiveTimeoutMs
        ? Math.min(effectiveTimeoutMs, remaining)
        : remaining;
    }

    attempted.push(attempt.name);
    if (window) window.attempts += 1;

    try {
      const value = await withAttemptTimeout(
        attempt.run,
        effectiveTimeoutMs,
        `${attempt.name} provider`,
        options.signal,
      );
      throwIfAborted(options.signal);
      if (!isUseful(value)) {
        encounteredErrors.push(`${attempt.name} returned no usable result`);
        continue;
      }

      const configuredIndex = configured.findIndex(
        (candidate) => candidate.name === attempt.name,
      );
      if (rotateProviders) {
        cursors.delete(poolId);
        cursors.set(
          poolId,
          configured.length > 0 ? (configuredIndex + 1) % configured.length : 0,
        );
        trimOldest(cursors, MAX_POOL_RUNTIME_KEYS);
      }

      logRecoveredErrors(poolId, attempt.name, attempted, encounteredErrors);
      return {
        value,
        provider: attempt.name,
        attempted,
        skippedCooldown,
        errors: [],
        recoveredErrors: [...encounteredErrors],
      };
    } catch (error) {
      if (options.signal?.aborted) throw abortReason(options.signal);
      const message = errorText(error);
      cooldowns.delete(key);
      cooldowns.set(key, {
        until: Date.now() + cooldownMs(error),
        reason: message,
      });
      trimOldest(cooldowns, MAX_COOLDOWN_ENTRIES);
      encounteredErrors.push(`${attempt.name}: ${message}`);
    }
  }

  throwIfAborted(options.signal);
  if (rotateProviders && configured.length > 0) {
    cursors.delete(poolId);
    cursors.set(poolId, (start + 1) % configured.length);
    trimOldest(cursors, MAX_POOL_RUNTIME_KEYS);
  }
  return {
    value: null,
    provider: null,
    attempted,
    skippedCooldown,
    errors: budgetReached ? [] : encounteredErrors,
    recoveredErrors: budgetReached ? encounteredErrors : [],
  };
}

export function clearLimitedProviderPoolState(): void {
  cooldowns.clear();
  cursors.clear();
  poolWindows.clear();
}

export function limitedProviderPoolSnapshot(): Array<{
  poolProvider: string;
  until: number;
  reason: string;
}> {
  pruneRuntimeState();
  return [...cooldowns.entries()].map(([poolProvider, value]) => ({
    poolProvider,
    ...value,
  }));
}
