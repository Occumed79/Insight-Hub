import { eq } from "drizzle-orm";
import { rfpDb, settingsTable } from "@workspace/db";

export type ProviderBudgetOutcome =
  | "success"
  | "empty"
  | "rate_limited"
  | "quota"
  | "auth"
  | "timeout"
  | "error";

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

const KEY_PREFIX = "provider-budget:v1:";
const memory = new Map<string, ProviderBudgetState>();
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

function parseState(
  provider: string,
  raw: string | undefined,
): ProviderBudgetState {
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

export async function getProviderBudget(
  provider: string,
): Promise<ProviderBudgetState> {
  const cached = memory.get(provider);
  if (cached) {
    const normalized = normalizeWindow(cached);
    memory.set(provider, normalized);
    return normalized;
  }

  try {
    const [row] = await rfpDb
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, budgetKey(provider)))
      .limit(1);
    const state = parseState(provider, row?.value);
    memory.set(provider, state);
    return state;
  } catch {
    const state = blankState(provider);
    memory.set(provider, state);
    return state;
  }
}

async function persistProviderBudget(
  state: ProviderBudgetState,
): Promise<void> {
  memory.set(state.provider, state);
  try {
    await rfpDb
      .insert(settingsTable)
      .values({ key: budgetKey(state.provider), value: JSON.stringify(state) })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { value: JSON.stringify(state) },
      });
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "provider_budget_persist_failed",
        provider: state.provider,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

function classifyFailure(error: unknown): {
  outcome: ProviderBudgetOutcome;
  cooldownMs: number;
  message: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /quota|credit|balance|billing|monthly|daily limit|resource exhausted/i.test(
      message,
    )
  ) {
    // Trial allowances are often daily or monthly. A full-day durable cooldown
    // is deliberately conservative: it prevents redeploys from repeatedly
    // burning a known-exhausted key while still allowing automatic recovery.
    return { outcome: "quota", cooldownMs: 24 * HOUR, message };
  }
  if (/\b429\b|rate.?limit|too many requests|throttl/i.test(message)) {
    return { outcome: "rate_limited", cooldownMs: 15 * MINUTE, message };
  }
  if (
    /\b(401|403)\b|unauthori[sz]ed|forbidden|invalid api.?key/i.test(message)
  ) {
    return { outcome: "auth", cooldownMs: 24 * HOUR, message };
  }
  if (
    /timeout|timed out|abort|ECONNRESET|ECONNREFUSED|\b5\d\d\b/i.test(
      message,
    )
  ) {
    return { outcome: "timeout", cooldownMs: 2 * MINUTE, message };
  }
  return { outcome: "error", cooldownMs: MINUTE, message };
}

export async function recordProviderSuccess(
  provider: string,
  usefulResults: number,
): Promise<void> {
  const now = new Date();
  const state = normalizeWindow(await getProviderBudget(provider), now);
  await persistProviderBudget({
    ...state,
    requestsToday: state.requestsToday + 1,
    requestsThisMonth: state.requestsThisMonth + 1,
    successes: state.successes + 1,
    usefulResults: state.usefulResults + Math.max(0, usefulResults),
    emptyResults: state.emptyResults + (usefulResults > 0 ? 0 : 1),
    cooldownUntil: 0,
    lastOutcome: usefulResults > 0 ? "success" : "empty",
    lastError: undefined,
    lastAttemptAt: now.toISOString(),
    lastSuccessAt:
      usefulResults > 0 ? now.toISOString() : state.lastSuccessAt,
  });
}

export async function recordProviderFailure(
  provider: string,
  error: unknown,
): Promise<void> {
  const now = new Date();
  const failure = classifyFailure(error);
  const state = normalizeWindow(await getProviderBudget(provider), now);
  await persistProviderBudget({
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
  });
}

export async function providerBudgetAvailable(
  provider: string,
): Promise<boolean> {
  const state = await getProviderBudget(provider);
  return state.cooldownUntil <= Date.now();
}

function usefulness(state: ProviderBudgetState): number {
  const attempts = Math.max(1, state.successes + state.failures);
  const successRate = state.successes / attempts;
  const yieldPerSuccess =
    state.successes > 0 ? state.usefulResults / state.successes : 0;
  const quotaPenalty =
    state.lastOutcome === "quota" || state.lastOutcome === "rate_limited"
      ? 100
      : 0;
  return successRate * 40 + Math.min(40, yieldPerSuccess) - quotaPenalty;
}

/**
 * Order configured limited providers by durable availability and observed yield.
 * Stable ordering is preserved until enough observations exist to justify moving
 * a source up or down, so trial allowances are not burned by random rotation.
 */
export async function selectBudgetedProviders(
  providers: string[],
  maxProviders: number,
): Promise<string[]> {
  const rows = await Promise.all(
    providers.map(async (provider, index) => ({
      provider,
      index,
      state: await getProviderBudget(provider),
    })),
  );
  return rows
    .filter(({ state }) => state.cooldownUntil <= Date.now())
    .sort((left, right) => {
      const rightScore = usefulness(right.state);
      const leftScore = usefulness(left.state);
      if (rightScore !== leftScore) return rightScore - leftScore;
      return left.index - right.index;
    })
    .slice(0, Math.max(1, maxProviders))
    .map(({ provider }) => provider);
}

export async function providerBudgetSnapshot(
  providers: string[],
): Promise<ProviderBudgetState[]> {
  return Promise.all(providers.map((provider) => getProviderBudget(provider)));
}
