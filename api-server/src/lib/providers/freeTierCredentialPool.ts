import { resolveCredential } from "../config/providerConfig";

export interface CredentialSlot {
  dbKey?: string;
  envKey: string;
}

export interface FreeTierCredentialPoolOptions {
  /**
   * When true (default), move to the next key after every successful call.
   * When false, keep using the current account until it becomes unavailable,
   * then fail over to the next account and stay there.
   */
  rotateOnSuccess?: boolean;
}

const cursors = new Map<string, number>();
const cooldowns = new Map<string, number>();

function cooldownMs(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /\b(401|403)\b|invalid api.?key|unauthori[sz]ed|forbidden/i.test(message)
  ) {
    return 6 * 60 * 60 * 1_000;
  }
  if (/\b429\b|quota|rate.?limit|credit|balance|budget|exceed|exhaust/i.test(message)) {
    return 30 * 60 * 1_000;
  }
  return 60_000;
}

function isCredentialRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  // Do not spend every free-tier key on a deterministic bad request. Rotate
  // only for credential/quota pressure and transient upstream/network faults.
  if (/\b(400|404|405|413|422)\b/.test(message)) return false;
  return /\b(401|403|408|409|429|5\d\d)\b|quota|rate.?limit|credit|balance|budget|exceed|exhaust|timeout|ECONN|fetch failed/i.test(
    message,
  );
}

/**
 * A tiny in-process pool for free-tier keys. A failing key cools down and the
 * same operation immediately tries the next slot. Pools can either rotate on
 * every success or stay pinned to one account until quota/rate pressure forces
 * a failover.
 */
export class FreeTierCredentialPool {
  private readonly rotateOnSuccess: boolean;

  constructor(
    private readonly id: string,
    private readonly slots: readonly CredentialSlot[],
    options: FreeTierCredentialPoolOptions = {},
  ) {
    this.rotateOnSuccess = options.rotateOnSuccess ?? true;
  }

  private async credentials(): Promise<Array<{ slot: string; value: string }>> {
    const resolved = await Promise.all(
      this.slots.map(async ({ dbKey, envKey }) => ({
        slot: envKey,
        value: dbKey
          ? await resolveCredential(dbKey, envKey)
          : (process.env[envKey] ?? null),
      })),
    );
    const seen = new Set<string>();
    return resolved.flatMap(({ slot, value }) => {
      const normalized = value?.trim();
      if (!normalized || seen.has(normalized)) return [];
      seen.add(normalized);
      return [{ slot, value: normalized }];
    });
  }

  async isConfigured(): Promise<boolean> {
    return (await this.credentials()).length > 0;
  }

  async run<T>(operation: (apiKey: string) => Promise<T>): Promise<T> {
    const credentials = await this.credentials();
    if (credentials.length === 0) {
      throw new Error(`${this.id} API key not configured`);
    }
    const start = (cursors.get(this.id) ?? 0) % credentials.length;
    const ordered = [
      ...credentials.slice(start),
      ...credentials.slice(0, start),
    ];
    const now = Date.now();
    const available = ordered.filter(
      ({ slot }) => (cooldowns.get(`${this.id}:${slot}`) ?? 0) <= now,
    );
    const candidates = available.length > 0 ? available : ordered.slice(0, 1);
    const errors: string[] = [];
    for (const candidate of candidates) {
      try {
        const value = await operation(candidate.value);
        const index = credentials.findIndex(
          ({ slot }) => slot === candidate.slot,
        );
        cursors.set(
          this.id,
          this.rotateOnSuccess ? (index + 1) % credentials.length : index,
        );
        cooldowns.delete(`${this.id}:${candidate.slot}`);
        return value;
      } catch (error) {
        if (!isCredentialRetryable(error)) throw error;
        cooldowns.set(
          `${this.id}:${candidate.slot}`,
          Date.now() + cooldownMs(error),
        );
        errors.push(
          `${candidate.slot}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    throw new Error(
      `${this.id} credential pool exhausted: ${errors.join(" | ")}`,
    );
  }
}

export function clearFreeTierCredentialPoolState(): void {
  cursors.clear();
  cooldowns.clear();
}
