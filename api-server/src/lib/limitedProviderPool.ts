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

const cooldowns = new Map<string, CooldownEntry>();
const cursors = new Map<string, number>();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

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

/**
 * Runs limited-capacity providers sequentially. Each successful call advances
 * the pool cursor so the next request begins with a different provider. Quota,
 * rate-limit, authentication, timeout, and upstream failures put only the
 * failing provider into an in-memory cooldown.
 */
export async function runLimitedProviderPool<T>(
  poolId: string,
  attempts: LimitedProviderAttempt<T>[],
  isUseful: (value: T) => boolean = () => true,
  options: { rotate?: boolean } = {},
): Promise<LimitedProviderPoolResult<T>> {
  const configured: LimitedProviderAttempt<T>[] = [];
  const errors: string[] = [];

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

    attempted.push(attempt.name);
    try {
      const value = await attempt.run();
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
