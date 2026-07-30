export interface LimitedProviderAttempt<T> {
  name: string;
  isConfigured: () => Promise<boolean>;
  run: () => Promise<T>;
}

export interface LimitedProviderPoolResult<T> {
  value: T | null;
  provider: string | null;
  attempted: string[];
  skippedCooldown: string[];
  errors: string[];
}

interface CooldownEntry {
  until: number;
  reason: string;
}

interface PoolWindow {
  startedAt: number;
  lastUsedAt: number;
}

interface PoolRuntimePolicy {
  budgetMs?: number;
  attemptTimeoutMs?: number;
}

const cooldowns = new Map<string, CooldownEntry>();
const cursors = new Map<string, number>();
const poolWindows = new Map<string, PoolWindow>();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const POOL_WINDOW_IDLE_RESET_MS = 30_000;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    return { budgetMs: 30_000, attemptTimeoutMs: 7_000 };
  }
  if (poolId === "opportunity-page-enrichment") {
    return { budgetMs: 15_000, attemptTimeoutMs: 6_000 };
  }
  if (poolId === "opportunity-structured-federal") {
    return { budgetMs: 70_000, attemptTimeoutMs: 35_000 };
  }
  return {};
}

function currentPoolWindow(poolId: string, now: number): PoolWindow {
  const existing = poolWindows.get(poolId);
  if (!existing || now - existing.lastUsedAt > POOL_WINDOW_IDLE_RESET_MS) {
    const created = { startedAt: now, lastUsedAt: now };
    poolWindows.set(poolId, created);
    return created;
  }
  existing.lastUsedAt = now;
  return existing;
}

async function withAttemptTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
  label: string,
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    timer.unref?.();
  });

  promise.catch(() => undefined);
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Runs limited-capacity providers sequentially. Each successful call advances
 * the pool cursor so the next request begins with a different provider. Quota,
 * rate-limit, authentication, timeout, and upstream failures put only the
 * failing provider into an in-memory cooldown.
 *
 * Opportunity discovery and enrichment pools also have bounded runtime windows
 * so a manual Fetch Intelligence run returns partial useful results instead of
 * consuming the ingestion controller's full 90-second provider deadline.
 */
export async function runLimitedProviderPool<T>(
  poolId: string,
  attempts: LimitedProviderAttempt<T>[],
  isUseful: (value: T) => boolean = () => true,
  options: { rotate?: boolean } = {},
): Promise<LimitedProviderPoolResult<T>> {
  const configured: LimitedProviderAttempt<T>[] = [];
  const errors: string[] = [];
  const policy = runtimePolicy(poolId);
  const window = policy.budgetMs
    ? currentPoolWindow(poolId, Date.now())
    : undefined;

  for (const attempt of attempts) {
    try {
      if (await attempt.isConfigured()) configured.push(attempt);
    } catch (error) {
      errors.push(
        `${attempt.name} configuration check failed: ${errorText(error)}`,
      );
    }
  }

  const rotateProviders = options.rotate !== false;
  const start = rotateProviders ? (cursors.get(poolId) ?? 0) : 0;
  const ordered = rotated(configured, start);
  const attempted: string[] = [];
  const skippedCooldown: string[] = [];
  const now = Date.now();

  for (const attempt of ordered) {
    const key = poolProviderKey(poolId, attempt.name);
    const cooldown = cooldowns.get(key);
    if (cooldown && cooldown.until > now) {
      skippedCooldown.push(attempt.name);
      continue;
    }
    if (cooldown) cooldowns.delete(key);

    let effectiveTimeoutMs = policy.attemptTimeoutMs;
    if (window && policy.budgetMs) {
      window.lastUsedAt = Date.now();
      const remaining = policy.budgetMs - (Date.now() - window.startedAt);
      if (remaining <= 0) {
        errors.push(
          `${poolId} reached its ${policy.budgetMs}ms runtime budget; returning partial results`,
        );
        break;
      }
      effectiveTimeoutMs = effectiveTimeoutMs
        ? Math.min(effectiveTimeoutMs, remaining)
        : remaining;
    }

    attempted.push(attempt.name);
    try {
      const value = await withAttemptTimeout(
        attempt.run(),
        effectiveTimeoutMs,
        `${attempt.name} provider`,
      );
      if (!isUseful(value)) {
        errors.push(`${attempt.name} returned no usable result`);
        continue;
      }
      const configuredIndex = configured.findIndex(
        (candidate) => candidate.name === attempt.name,
      );
      if (rotateProviders) {
        cursors.set(
          poolId,
          configured.length > 0 ? (configuredIndex + 1) % configured.length : 0,
        );
      }
      return {
        value,
        provider: attempt.name,
        attempted,
        skippedCooldown,
        errors,
      };
    } catch (error) {
      const message = errorText(error);
      cooldowns.set(key, {
        until: Date.now() + cooldownMs(error),
        reason: message,
      });
      errors.push(`${attempt.name}: ${message}`);
    }
  }

  if (rotateProviders && configured.length > 0) {
    cursors.set(poolId, (start + 1) % configured.length);
  }
  return {
    value: null,
    provider: null,
    attempted,
    skippedCooldown,
    errors,
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
  return [...cooldowns.entries()].map(([poolProvider, value]) => ({
    poolProvider,
    ...value,
  }));
}
