import React, { useEffect, useMemo, useState } from "react";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PoolSlot {
  slot: string;
  configured: boolean;
  active: boolean;
  coolingDown: boolean;
  cooldownUntil: string | null;
  attempts: number;
  successes: number;
  failures: number;
  lastOutcome: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  quotaLimit: number | null;
  quotaRemaining: number | null;
  quotaResetAt: string | null;
}

interface PoolSnapshot {
  id: string;
  rotateOnSuccess: boolean;
  configuredAccounts: number;
  activeSlot: string | null;
  slots: PoolSlot[];
}

interface BudgetSnapshot {
  provider: string;
  requestsToday: number;
  requestsThisMonth: number;
  remainingToday: number | null;
  remainingThisMonth: number | null;
  available: boolean;
  cooldownUntil: number;
  lastOutcome?: string;
}

interface QuotaPolicy {
  provider: string;
  renewal: string;
  priority: number;
  purpose: string;
}

interface RunProviderTelemetry {
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
}

interface RunTelemetry {
  runId: string;
  updatedAt: string | null;
  selectedDiscoveryProviders: string[];
  configuredDiscoveryProviders: string[];
  providers: RunProviderTelemetry[];
  aiScorers: string[];
}

interface TelemetryResponse {
  generatedAt?: string;
  quotaPolicies?: QuotaPolicy[];
  credentialPools?: Record<string, PoolSnapshot>;
  budgets?: BudgetSnapshot[];
  utilityModes?: {
    jina?: "keyed" | "keyless";
    keenable?: "keyed" | "keyless";
    microlink?: "keyed" | "keyless";
  };
  run?: RunTelemetry | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  you: "You.com",
  browserbase: "Browserbase",
  keenable: "Keenable",
  parallel: "Parallel",
  exa: "Exa",
  firecrawl: "Firecrawl",
  langsearch: "LangSearch",
  linkup: "Linkup",
  socrata: "Socrata",
  websearch: "Web Search",
  microlink: "Microlink",
  jina: "Jina Reader",
  samGov: "SAM.gov",
  tango: "Tango",
  cerebras: "Cerebras",
  groq: "Groq",
  openrouter: "OpenRouter",
  gemini: "Gemini",
};

function accountLabel(slot: string | null): string {
  if (!slot) return "—";
  const explicit = slot.match(/(?:API_KEY|KEY)_(\d+)$/i)?.[1];
  if (explicit) return `account ${explicit}`;
  if (/API_KEY$/i.test(slot)) return "account 1";
  if (/primary$/i.test(slot)) return "primary";
  if (/secondary$/i.test(slot)) return "secondary";
  if (/tertiary$/i.test(slot)) return "tertiary";
  if (/quaternary$/i.test(slot)) return "quaternary";
  return slot.replace(/_/g, " ").toLowerCase();
}

function poolForProvider(
  provider: string,
  pools: Record<string, PoolSnapshot>,
): PoolSnapshot | undefined {
  return Object.values(pools).find((pool) => {
    const id = pool.id.toLowerCase();
    return (
      id === provider.toLowerCase() ||
      id.startsWith(`${provider.toLowerCase()}-`)
    );
  });
}

function shortTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function slotQuota(slot: PoolSlot): string {
  if (slot.quotaRemaining != null && slot.quotaLimit != null) {
    return `${slot.quotaRemaining}/${slot.quotaLimit} left`;
  }
  if (slot.quotaRemaining != null) return `${slot.quotaRemaining} left`;
  if (slot.coolingDown) {
    const reset = shortTime(slot.cooldownUntil ?? slot.quotaResetAt);
    return reset ? `cooldown → ${reset}` : "cooling down";
  }
  if (slot.lastOutcome) return slot.lastOutcome.replaceAll("_", " ");
  return slot.configured ? "ready" : "not configured";
}

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

export function ProviderQuotaTelemetry() {
  const [data, setData] = useState<TelemetryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        setError(null);
        const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
        const response = await fetch(
          `${baseUrl}/api/providers/telemetry?ts=${Date.now()}`,
          {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" },
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          throw new Error(`Provider telemetry HTTP ${response.status}`);
        }
        const next = (await response.json()) as TelemetryResponse;
        setData(next);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
      if (!controller.signal.aborted) {
        timer = setTimeout(() => setRefreshToken((value) => value + 1), 10_000);
      }
    };
    void load();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [refreshToken]);

  const rows = useMemo(() => {
    if (!data) return [];
    const quotaPolicies = Array.isArray(data.quotaPolicies)
      ? data.quotaPolicies
      : [];
    const budgets = Array.isArray(data.budgets) ? data.budgets : [];
    const credentialPools =
      data.credentialPools && typeof data.credentialPools === "object"
        ? data.credentialPools
        : {};

    return quotaPolicies
      .filter((policy) => policy.purpose === "discovery")
      .sort((left, right) => left.priority - right.priority)
      .map((policy) => ({
        policy,
        budget: budgets.find((item) => item.provider === policy.provider),
        pool: poolForProvider(policy.provider, credentialPools),
      }));
  }, [data]);

  const runRows = data?.run?.providers ?? [];
  const sam = runRows.find((row) => row.provider === "samGov");
  const firecrawlRun = runRows.find((row) => row.provider === "firecrawl");
  const scorers = data?.run?.aiScorers ?? [];

  return (
    <div className="rounded-xl border border-white/10 bg-background/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/55">
              Search quota / account routing
            </div>
            <div className="text-[10px] text-white/35">
              Live account slots, resets, provider spend and run scorers. Secret values are never exposed.
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-white/50 hover:text-white"
          onClick={() => {
            setLoading(true);
            setRefreshToken((value) => value + 1);
          }}
          title="Refresh provider quota status"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {error ? (
        <div className="mt-3 text-[11px] text-amber-300">
          Telemetry unavailable: {error}
        </div>
      ) : (
        <>
          {data?.run && data.run.updatedAt && (
            <div className="mt-3 rounded-lg border border-primary/15 bg-primary/[0.05] p-2.5">
              <div className="text-[9px] uppercase tracking-wider text-primary/75">
                Current Fetch Intelligence run
              </div>
              <div className="mt-1 grid gap-1 text-[10px] text-white/70 sm:grid-cols-2">
                <div>
                  <span className="text-white/40">SAM.gov:</span>{" "}
                  {sam?.queryCount != null
                    ? `${sam.queryCount} targeted quer${sam.queryCount === 1 ? "y" : "ies"}`
                    : sam
                      ? sam.status
                      : "not selected"}
                  {sam?.queries?.length ? ` · ${sam.queries.join(", ")}` : ""}
                </div>
                <div>
                  <span className="text-white/40">AI scorers:</span>{" "}
                  {scorers.length > 0
                    ? scorers.map(providerLabel).join(", ")
                    : "not used yet"}
                </div>
                <div>
                  <span className="text-white/40">Discovery spend:</span>{" "}
                  {data.run.selectedDiscoveryProviders.length > 0
                    ? data.run.selectedDiscoveryProviders
                        .map(providerLabel)
                        .join(", ")
                    : "not started yet"}
                </div>
                <div>
                  <span className="text-white/40">Firecrawl:</span>{" "}
                  {firecrawlRun
                    ? firecrawlRun.spent
                      ? `${firecrawlRun.status} / spent`
                      : "held in reserve"
                    : data.run.configuredDiscoveryProviders.includes("firecrawl")
                      ? "held in reserve"
                      : "not configured"}
                </div>
              </div>
              {runRows.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {runRows.map((row) => (
                    <span
                      key={row.provider}
                      className={`rounded border px-1.5 py-0.5 text-[9px] ${
                        row.status === "failed"
                          ? "border-red-400/20 bg-red-400/[0.05] text-red-200"
                          : row.status === "skipped"
                            ? "border-white/10 bg-white/[0.02] text-white/35"
                            : "border-emerald-400/15 bg-emerald-400/[0.04] text-emerald-200/80"
                      }`}
                    >
                      {providerLabel(row.provider)} · {row.spent ? row.status : "held"}
                      {row.accountSlot ? ` · ${accountLabel(row.accountSlot)}` : ""}
                      {row.accepted != null ? ` · ${row.accepted} accepted` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5 text-[9px] text-white/50">
            <span className="rounded border border-white/10 bg-white/[0.025] px-2 py-1">
              Jina Reader: {data?.utilityModes?.jina ?? "unknown"}
            </span>
            <span className="rounded border border-white/10 bg-white/[0.025] px-2 py-1">
              Keenable: {data?.utilityModes?.keenable ?? "unknown"}
            </span>
            <span className="rounded border border-white/10 bg-white/[0.025] px-2 py-1">
              Microlink: {data?.utilityModes?.microlink ?? "unknown"} · final fallback
            </span>
          </div>

          {rows.length > 0 ? (
            <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {rows.map(({ policy, budget, pool }) => {
                const cooling = Boolean(
                  budget?.cooldownUntil && budget.cooldownUntil > Date.now(),
                );
                const configuredAccounts = pool?.configuredAccounts ?? null;
                return (
                  <div
                    key={policy.provider}
                    className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/85">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            budget?.available === false || cooling
                              ? "bg-amber-400"
                              : "bg-emerald-400"
                          }`}
                        />
                        <span>{providerLabel(policy.provider)}</span>
                        <span className="text-[9px] font-normal uppercase text-white/35">
                          {policy.renewal}
                        </span>
                      </div>
                      <div className="text-[9px] text-white/40">
                        {budget?.remainingToday != null
                          ? `${budget.remainingToday} today`
                          : budget?.remainingThisMonth != null
                            ? `${budget.remainingThisMonth} month`
                            : budget?.lastOutcome
                              ? budget.lastOutcome.replaceAll("_", " ")
                              : "ready"}
                      </div>
                    </div>

                    {pool ? (
                      <div className="mt-1.5 grid gap-1">
                        {pool.slots
                          .filter((slot) => slot.configured)
                          .map((slot) => (
                            <div
                              key={slot.slot}
                              className="flex items-center justify-between gap-2 text-[9px]"
                            >
                              <span className={slot.active ? "text-primary" : "text-white/45"}>
                                {accountLabel(slot.slot)}
                                {slot.active ? " · active" : ""}
                              </span>
                              <span className={slot.coolingDown ? "text-amber-300" : "text-white/40"}>
                                {slotQuota(slot)}
                                {slot.quotaResetAt && slot.quotaRemaining === 0
                                  ? ` · reset ${shortTime(slot.quotaResetAt) ?? "pending"}`
                                  : ""}
                              </span>
                            </div>
                          ))}
                        {configuredAccounts === 0 && (
                          <div className="text-[9px] text-white/30">No configured account slots</div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-1 text-[9px] text-white/35">
                        {policy.provider === "keenable"
                          ? `keyless-capable · ${data?.utilityModes?.keenable ?? "unknown"}`
                          : "provider-level budget"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : loading ? (
            <div className="mt-3 flex items-center gap-2 text-[11px] text-white/45">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading provider state…
            </div>
          ) : (
            <div className="mt-3 text-[10px] text-white/35">
              Provider quota details are not available yet; discovery can still run.
            </div>
          )}
        </>
      )}
    </div>
  );
}
