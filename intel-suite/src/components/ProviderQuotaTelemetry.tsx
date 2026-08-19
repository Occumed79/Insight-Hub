import React, { useEffect, useMemo, useState } from "react";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PoolSlot {
  slot: string;
  configured: boolean;
  active: boolean;
  coolingDown: boolean;
  cooldownUntil: string | null;
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

interface TelemetryResponse {
  generatedAt?: string;
  quotaPolicies?: QuotaPolicy[];
  credentialPools?: Record<string, PoolSnapshot>;
  budgets?: BudgetSnapshot[];
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
  samGov: "SAM.gov",
  tango: "Tango",
};

function accountLabel(slot: string | null): string {
  if (!slot) return "—";
  return slot
    .replace(/_API_KEY(?:_(\d+))?$/, (_match, index) =>
      index ? ` account ${index}` : " account 1",
    )
    .replace(/_KEY_(\d+)$/, " account $1")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());
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
        timer = setTimeout(() => setRefreshToken((value) => value + 1), 20_000);
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
      .map((policy) => {
        const budget = budgets.find(
          (item) => item.provider === policy.provider,
        );
        const pool = poolForProvider(policy.provider, credentialPools);
        return { policy, budget, pool };
      });
  }, [data]);

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
              No key values are exposed. Active account names and cooldowns only.
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
      ) : rows.length > 0 ? (
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {rows.map(({ policy, budget, pool }) => {
            const cooling = Boolean(
              budget?.cooldownUntil && budget.cooldownUntil > Date.now(),
            );
            const activeSlot = pool?.activeSlot ?? null;
            const configuredAccounts = pool?.configuredAccounts ?? null;
            return (
              <div
                key={policy.provider}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/85">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        budget?.available === false || cooling
                          ? "bg-amber-400"
                          : "bg-emerald-400"
                      }`}
                    />
                    <span>{PROVIDER_LABELS[policy.provider] ?? policy.provider}</span>
                    <span className="text-[9px] font-normal uppercase text-white/35">
                      {policy.renewal}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[9px] text-white/40">
                    {configuredAccounts != null
                      ? `${configuredAccounts} account${configuredAccounts === 1 ? "" : "s"} · ${accountLabel(activeSlot)}`
                      : policy.provider === "microlink"
                        ? "keyless fallback"
                        : "provider-level budget"}
                  </div>
                </div>
                <div className="shrink-0 text-right text-[9px] text-white/45">
                  {budget?.remainingToday != null
                    ? `${budget.remainingToday} today`
                    : budget?.remainingThisMonth != null
                      ? `${budget.remainingThisMonth} month`
                      : budget?.lastOutcome
                        ? budget.lastOutcome.replaceAll("_", " ")
                        : "ready"}
                </div>
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
    </div>
  );
}
