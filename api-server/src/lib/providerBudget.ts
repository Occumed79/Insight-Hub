import { eq } from "drizzle-orm";
import { rfpDb, rfpPool, settingsTable } from "@workspace/db";

export type ProviderBudgetOutcome =
  | "success"
  | "empty"
  | "rate_limited"
  | "quota"
  | "auth"
  | "timeout"
  | "budget_exhausted"
  | "error";

export interface ProviderBudgetPolicy {
  dailyLimit: number | null;
  monthlyLimit: number | null;
  reserve: number;
}

export interface ProviderBudgetState {
  provider: string;
  dayKey: string;
  monthKey: string;
  requestsToday: number;
  requestsThisMonth: number;
  successes: number;
  usefulResults: number;
  emptyResults: number;
  failures: number;
  cooldownUntil: number;
  lastOutcome?: ProviderBudgetOutcome;
  lastError?: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
}

export interface ProviderBudgetSnapshot extends ProviderBudgetState {
  policy: ProviderBudgetPolicy;
  remainingToday: number | null;
  remainingThisMonth: number | null;
  available: boolean;
}

interface MemoryBudgetEntry {
  state: ProviderBudgetState;
  loadedAt: number;
}

const KEY_PREFIX = "provider-budget:v2:";
const memory = new Map<string, MemoryBudgetEntry>();
const writeQueues = new Map<string, Promise<void>>();
const MEMORY_TTL_MS = 5_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function budgetKey(provider: string): string {
  return `${KEY_PREFIX}${provider}`;
}

function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function utcMonthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

function blankState(provider: string, now = new Date()): ProviderBudgetState {
  return {
    provider,
    dayKey: utcDayKey(now),
    monthKey: utcMonthKey(now),
    requestsToday: 0,
    requestsThisMonth: 0,
    successes: 0,
    usefulResults: 0,
    emptyResults: 0,
    failures: 0,
    cooldownUntil: 0,
  };
}

function normalizeWindow(
  state: ProviderBudgetState,
  now = new Date(),
): ProviderBudgetState {
  const dayKey = utcDayKey(now);
  const monthKey = utcMonthKey(now);
  return {
    ...state,
    dayKey,
    monthKey,
    requestsToday: state.dayKey === dayKey ? state.requestsToday : 0,
    requestsThisMonth:
      state.monthKey === monthKey ? state.requestsThisMonth : 0,
  };
}

function parseState(provider: string, raw: string | undefined): ProviderBudgetState {
  if (!raw) return blankState(provider);
  try {
    const parsed = JSON.parse(raw) as Partial<ProviderBudgetState>;
    return normalizeWindow({
      ...blankState(provider),
      ...parsed,
      provider,
    });
  } catch {
    return blankState(provider);
  }
}

function cacheState(state: ProviderBudgetState): void {
  memory.set(state.provider, { state, loadedAt: Date.now() });
}

function envToken(provider: string): string {
  return provider.replace(/[^a-z0-9]+/gi, "_").toUpperCase();
}

function nonNegativeInteger(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function policyMap(): Record<string, Partial<ProviderBudgetPolicy>> {
  const raw = process.env.INSIGHT_PROVIDER_BUDGETS_JSON?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, Partial<ProviderBudgetPolicy>>)
      : {};
  } catch {
    console.warn(
      JSON.stringify({
        event: "provider_budget_policy_parse_failed",
        variable: "INSIGHT_PROVIDER_BUDGETS_JSON",
      }),
    );
    return {};
  }
}

/**
 * Exact free/trial allowances are configuration, never guessed in source code.
 * Examples:
 *   INSIGHT_BUDGET_LANGSEARCH_PRIMARY_DAILY=100
 *   INSIGHT_BUDGET_SERPER_MONTHLY=2500
 *   INSIGHT_PROVIDER_BUDGETS_JSON={"exa":{"monthlyLimit":1000,"reserve":25}}
 */
export function providerBudgetPolicy(provider: string): ProviderBudgetPolicy {
  const token = envToken(provider);
  const mapped = policyMap()[provider] ?? {};
  const dailyLimit =
    nonNegativeInteger(process.env[`INSIGHT_BUDGET_${token}_DAILY`]) ??
    nonNegativeInteger(mapped.dailyLimit);
  const monthlyLimit =
    nonNegativeInteger(process.env[`INSIGHT_BUDGET_${token}_MONTHLY`]) ??
    nonNegativeInteger(mapped.monthlyLimit);
  const reserve = Math.max(
    0,
    nonNegativeInteger(process.env[`INSIGHT_BUDGET_${token}_RESERVE`]) ??
      nonNegativeInteger(mapped.reserve) ??
      0,
  );
  return { dailyLimit, monthlyLimit, reserve };
}

export async function getProviderBudget(provider: string): Promise<ProviderBudgetState> {
  const cached = memory.get(provider);
  if (cached && Date.now() - cached.loadedAt < MEMORY_TTL_MS) {
    const normalized = normalizeWindow(cached.state);
    memory.set(provider, { ...cached, state: normalized });
    return normalized;
  }

  try {
    const [row] = await rfpDb
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, budgetKey(provider)))
      .limit(1);
    const state = parseState(provider, row?.value);
    cacheState(state);
    return state;
  } catch {
    return cached ? normalizeWindow(cached.state) : blankState(provider);
  }
}

async function withProviderWriteQueue(
  provider: string,
  operation: () => Promise<void>,
): Promise<void> {
  const previous = writeQueues.get(provider) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  writeQueues.set(provider, current);
  try {
    await current;
  } finally {
    if (writeQueues.get(provider) === current) writeQueues.delete(provider);
  }
}

async function mutateDurableProviderBudget(
  provider: string,
  mutate: (state: ProviderBudgetState, now: Date) => ProviderBudgetState,
): Promise<ProviderBudgetState> {
  const client = await rfpPool.connect();
  const key = budgetKey(provider);
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
    const result = await client.query<{ value: string }>(
      'SELECT value FROM settings WHERE key = $1 FOR UPDATE',
      [key],
    );
    const now = new Date();
    const current = parseState(provider, result.rows[0]?.value);
    const next = mutate(normalizeWindow(current, now), now);
    await client.query(
      `INSERT INTO settings (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(next)],
    );
    await client.query("COMMIT");
    cacheState(next);
    return next;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function classifyFailure(error: unknown): {
  outcome: ProviderBudgetOutcome;
  cooldownMs: number;
  message: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  if (/budget exhausted/i.test(message)) {
    return { outcome: "budget_exhausted", cooldownMs: HOUR, message };
  }
  if (/quota|credit|balance|billing|monthly|daily limit|resource exhausted/i.test(message)) {
    return { outcome: "quota", cooldownMs: 24 * HOUR, message };
  }
  if (/\b429\b|rate.?limit|too many requests|throttl/i.test(message)) {
    return { outcome: "rate_limited", cooldownMs: 15 * MINUTE, message };
  }
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden|invalid api.?key/i.test(message)) {
    return { outcome: "auth", cooldownMs: 24 * HOUR, message };
  }
  if (/timeout|timed out|abort|ECONNRESET|ECONNREFUSED|\b5\d\d\b/i.test(message)) {
    return { outcome: "timeout", cooldownMs: 2 * MINUTE, message };
  }
  return { outcome: "error", cooldownMs: MINUTE, message };
}

async function recordBudgetMutation(
  provider: string,
  mutate: (state: ProviderBudgetState, now: Date) => ProviderBudgetState,
): Promise<void> {
  await withProviderWriteQueue(provider, async () => {
    try {
      await mutateDurableProviderBudget(provider, mutate);
    } catch (error) {
      const now = new Date();
      const current = normalizeWindow(await getProviderBudget(provider), now);
      cacheState(mutate(current, now));
      console.warn(
        JSON.stringify({
          event: "provider_budget_persist_failed",
          provider,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  });
}

export async function recordProviderSuccess(
  provider: string,
  usefulResults: number,
): Promise<void> {
  await recordBudgetMutation(provider, (state, now) => ({
    ...state,
    requestsToday: state.requestsToday + 1,
    requestsThisMonth: state.requestsThisMonth + 1,
    successes: state.successes + 1,
    usefulResults: state.usefulResults + Math.max(0, usefulResults),
    emptyResults: state.emptyResults + (usefulResults > 0 ? 0 : 1),
    cooldownUntil: state.cooldownUntil > now.getTime() ? state.cooldownUntil : 0,
    lastOutcome: usefulResults > 0 ? "success" : "empty",
    lastError: undefined,
    lastAttemptAt: now.toISOString(),
    lastSuccessAt: usefulResults > 0 ? now.toISOString() : state.lastSuccessAt,
  }));
}

export async function recordProviderFailure(
  provider: string,
  error: unknown,
): Promise<void> {
  const failure = classifyFailure(error);
  await recordBudgetMutation(provider, (state, now) => ({
    ...state,
    requestsToday: state.requestsToday + 1,
    requestsThisMonth: state.requestsThisMonth + 1,
    failures: state.failures + 1,
    cooldownUntil: Math.max(
      state.cooldownUntil,
      now.getTime() + failure.cooldownMs,
    ),
    lastOutcome: failure.outcome,
    lastError: failure.message.replace(/\s+/g, " ").slice(0, 300),
    lastAttemptAt: now.toISOString(),
  }));
}

function remaining(
  limit: number | null,
  used: number,
  reserve: number,
): number | null {
  return limit == null ? null : Math.max(0, limit - reserve - used);
}

export async function getProviderBudgetSnapshot(
  provider: string,
): Promise<ProviderBudgetSnapshot> {
  const state = await getProviderBudget(provider);
  const policy = providerBudgetPolicy(provider);
  const remainingToday = remaining(
    policy.dailyLimit,
    state.requestsToday,
    policy.reserve,
  );
  const remainingThisMonth = remaining(
    policy.monthlyLimit,
    state.requestsThisMonth,
    policy.reserve,
  );
  return {
    ...state,
    policy,
    remainingToday,
    remainingThisMonth,
    available:
      state.cooldownUntil <= Date.now() &&
      (remainingToday == null || remainingToday > 0) &&
      (remainingThisMonth == null || remainingThisMonth > 0),
  };
}

export async function providerBudgetAvailable(provider: string): Promise<boolean> {
  return (await getProviderBudgetSnapshot(provider)).available;
}

function usefulness(snapshot: ProviderBudgetSnapshot): number {
  const attempts = Math.max(1, snapshot.successes + snapshot.failures);
  const successRate = snapshot.successes / attempts;
  const yieldPerSuccess =
    snapshot.successes > 0 ? snapshot.usefulResults / snapshot.successes : 0;
  const quotaPenalty =
    snapshot.lastOutcome === "quota" ||
    snapshot.lastOutcome === "rate_limited" ||
    snapshot.lastOutcome === "budget_exhausted"
      ? 100
      : 0;
  const dailyRatio =
    snapshot.policy.dailyLimit && snapshot.remainingToday != null
      ? snapshot.remainingToday / snapshot.policy.dailyLimit
      : 1;
  const monthlyRatio =
    snapshot.policy.monthlyLimit && snapshot.remainingThisMonth != null
      ? snapshot.remainingThisMonth / snapshot.policy.monthlyLimit
      : 1;
  return (
    successRate * 40 +
    Math.min(40, yieldPerSuccess) +
    Math.min(dailyRatio, monthlyRatio) * 20 -
    quotaPenalty
  );
}

export async function selectBudgetedProviders(
  providers: string[],
  maxProviders: number,
): Promise<string[]> {
  const rows = await Promise.all(
    providers.map(async (provider, index) => ({
      provider,
      index,
      snapshot: await getProviderBudgetSnapshot(provider),
    })),
  );
  return rows
    .filter(({ snapshot }) => snapshot.available)
    .sort((left, right) => {
      const rightScore = usefulness(right.snapshot);
      const leftScore = usefulness(left.snapshot);
      if (rightScore !== leftScore) return rightScore - leftScore;
      return left.index - right.index;
    })
    .slice(0, Math.max(1, maxProviders))
    .map(({ provider }) => provider);
}

export async function providerBudgetSnapshot(
  providers: string[],
): Promise<ProviderBudgetSnapshot[]> {
  return Promise.all(providers.map((provider) => getProviderBudgetSnapshot(provider)));
}

export function clearProviderBudgetMemory(): void {
  memory.clear();
}
