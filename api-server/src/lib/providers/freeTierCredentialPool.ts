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

export type CredentialSlotOutcome =
  | "success"
  | "rate_limited"
  | "quota"
  | "auth"
  | "timeout"
  | "error";

export interface CredentialPoolSlotSnapshot {
  slot: string;
  configured: boolean;
  active: boolean;
  coolingDown: boolean;
  cooldownUntil: string | null;
  attempts: number;
  successes: number;
  failures: number;
  lastOutcome: CredentialSlotOutcome | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  quotaLimit: number | null;
  quotaRemaining: number | null;
  quotaResetAt: string | null;
}

export interface CredentialPoolSnapshot {
  id: string;
  rotateOnSuccess: boolean;
  configuredAccounts: number;
  activeSlot: string | null;
  slots: CredentialPoolSlotSnapshot[];
}

type SlotRuntimeState = {
  attempts: number;
  successes: number;
  failures: number;
  lastOutcome: CredentialSlotOutcome | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  quotaLimit: number | null;
  quotaRemaining: number | null;
  quotaResetAt: string | null;
};

const cursors = new Map<string, number>();
const cooldowns = new Map<string, number>();
const slotStates = new Map<string, SlotRuntimeState>();
const poolInstances = new Map<string, FreeTierCredentialPool>();

function runtimeKey(poolId: string, slot: string): string {
  return `${poolId}:${slot}`;
}

function emptySlotState(): SlotRuntimeState {
  return {
    attempts: 0,
    successes: 0,
    failures: 0,
    lastOutcome: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    quotaLimit: null,
    quotaRemaining: null,
    quotaResetAt: null,
  };
}

function slotState(poolId: string, slot: string): SlotRuntimeState {
  const key = runtimeKey(poolId, slot);
  const state = slotStates.get(key) ?? emptySlotState();
  slotStates.set(key, state);
  return state;
}

function failureOutcome(error: unknown): CredentialSlotOutcome {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b(401|403)\b|invalid api.?key|unauthori[sz]ed|forbidden/i.test(message)) {
    return "auth";
  }
  if (/team_budget_exceeded|no_more_credits|api_key_budget_exceeded|quota|credit|balance|budget|exceed|exhaust/i.test(message)) {
    return "quota";
  }
  if (/\b429\b|rate.?limit|too many requests|throttl/i.test(message)) {
    return "rate_limited";
  }
  if (/\b408\b|timeout|timed out|ECONN|fetch failed|\b5\d\d\b/i.test(message)) {
    return "timeout";
  }
  return "error";
}

function cooldownMs(error: unknown): number {
  const outcome = failureOutcome(error);
  if (outcome === "auth") return 6 * 60 * 60 * 1_000;
  if (outcome === "quota") return 24 * 60 * 60 * 1_000;
  if (outcome === "rate_limited") return 30 * 60 * 1_000;
  if (outcome === "timeout") return 60_000;
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

function numericHeader(headers: Headers, names: string[]): number | null {
  for (const name of names) {
    const raw = headers.get(name);
    if (!raw) continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function resetHeader(headers: Headers): string | null {
  const raw =
    headers.get("x-ratelimit-reset") ??
    headers.get("ratelimit-reset") ??
    headers.get("x-rate-limit-reset");
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    const timestamp =
      numeric > 1_000_000_000_000
        ? numeric
        : numeric > 1_000_000_000
          ? numeric * 1_000
          : Date.now() + numeric * 1_000;
    return new Date(timestamp).toISOString();
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
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
    poolInstances.set(id, this);
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

  /** Record provider-supplied rate-limit headers against the actual account slot. */
  recordRateLimitHeaders(slot: string, headers: Headers): void {
    const state = slotState(this.id, slot);
    const limit = numericHeader(headers, [
      "x-ratelimit-limit",
      "ratelimit-limit",
      "x-rate-limit-limit",
    ]);
    const remaining = numericHeader(headers, [
      "x-ratelimit-remaining",
      "ratelimit-remaining",
      "x-rate-limit-remaining",
    ]);
    const resetAt = resetHeader(headers);
    if (limit != null) state.quotaLimit = limit;
    if (remaining != null) state.quotaRemaining = remaining;
    if (resetAt) state.quotaResetAt = resetAt;

    if (remaining === 0 && resetAt) {
      const resetMs = Date.parse(resetAt);
      if (Number.isFinite(resetMs) && resetMs > Date.now()) {
        cooldowns.set(runtimeKey(this.id, slot), resetMs);
      }
    }
  }

  async snapshot(): Promise<CredentialPoolSnapshot> {
    const credentials = await this.credentials();
    const cursor = credentials.length > 0
      ? (cursors.get(this.id) ?? 0) % credentials.length
      : 0;
    const activeSlot = credentials[cursor]?.slot ?? null;
    const configuredSlots = new Set(credentials.map((credential) => credential.slot));
    const now = Date.now();
    return {
      id: this.id,
      rotateOnSuccess: this.rotateOnSuccess,
      configuredAccounts: credentials.length,
      activeSlot,
      slots: this.slots.map(({ envKey }) => {
        const until = cooldowns.get(runtimeKey(this.id, envKey)) ?? 0;
        const state = slotState(this.id, envKey);
        return {
          slot: envKey,
          configured: configuredSlots.has(envKey),
          active: envKey === activeSlot,
          coolingDown: until > now,
          cooldownUntil: until > now ? new Date(until).toISOString() : null,
          attempts: state.attempts,
          successes: state.successes,
          failures: state.failures,
          lastOutcome: state.lastOutcome,
          lastAttemptAt: state.lastAttemptAt,
          lastSuccessAt: state.lastSuccessAt,
          quotaLimit: state.quotaLimit,
          quotaRemaining: state.quotaRemaining,
          quotaResetAt: state.quotaResetAt,
        };
      }),
    };
  }

  async run<T>(
    operation: (apiKey: string, slot: string) => Promise<T>,
  ): Promise<T> {
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
      ({ slot }) => (cooldowns.get(runtimeKey(this.id, slot)) ?? 0) <= now,
    );
    const candidates = available.length > 0 ? available : ordered.slice(0, 1);
    const errors: string[] = [];
    for (const candidate of candidates) {
      const state = slotState(this.id, candidate.slot);
      state.attempts += 1;
      state.lastAttemptAt = new Date().toISOString();
      try {
        const value = await operation(candidate.value, candidate.slot);
        state.successes += 1;
        state.lastOutcome = "success";
        state.lastSuccessAt = new Date().toISOString();
        const index = credentials.findIndex(
          ({ slot }) => slot === candidate.slot,
        );
        cursors.set(
          this.id,
          this.rotateOnSuccess ? (index + 1) % credentials.length : index,
        );
        const configuredReset = state.quotaResetAt
          ? Date.parse(state.quotaResetAt)
          : Number.NaN;
        if (state.quotaRemaining !== 0 || !Number.isFinite(configuredReset)) {
          cooldowns.delete(runtimeKey(this.id, candidate.slot));
        }
        return value;
      } catch (error) {
        state.failures += 1;
        state.lastOutcome = failureOutcome(error);
        if (!isCredentialRetryable(error)) throw error;
        cooldowns.set(
          runtimeKey(this.id, candidate.slot),
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

export async function credentialPoolTelemetry(): Promise<CredentialPoolSnapshot[]> {
  return Promise.all([...poolInstances.values()].map((pool) => pool.snapshot()));
}

export function clearFreeTierCredentialPoolState(): void {
  cursors.clear();
  cooldowns.clear();
  slotStates.clear();
}
