import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  ExternalLink,
  Globe2,
  Loader2,
  MapPin,
  RefreshCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

type PortalConnectorStatus = "direct_api" | "direct_adapter" | "generic_extraction";
type PortalOperationalStatus = "runnable" | "quarantined";
type PortalRunOutcome = "success" | "no_results" | "failed" | "validation_failed" | "quarantined";

type PortalSource = {
  id: string;
  name: string;
  jurisdiction: string;
  country: string;
  url: string;
  searchUrl?: string;
  accessMode: string;
  connectorStatus: PortalConnectorStatus;
  connectorLabel: string;
  connectorDescription: string;
  registeredAdapter: boolean;
  runtimeRunnable: boolean;
  quarantined?: boolean;
  quarantineReasonLabel?: string;
  registrationKind: "direct_api" | "adapter" | "approved_api" | "vetted_extractor";
  operationalStatus: PortalOperationalStatus;
};

type PortalHealthStatus = {
  sourceId: string;
  sourceName?: string;
  domain?: string;
  lastCheckedAt: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailureReason?: string;
  resultCount: number;
  matchedCount: number;
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  consecutiveFailures: number;
  lastOutcome: PortalRunOutcome;
  currentlyFailing: boolean;
  quarantined?: boolean;
  quarantineReasonLabel?: string;
};

type PortalHealth = {
  summary: {
    checked: number;
    success: number;
    noResults: number;
    failing: number;
    quarantined: number;
    validationFailed: number;
  };
  sources: PortalHealthStatus[];
};

type InventoryGroup = {
  id: PortalOperationalStatus;
  title: string;
  description: string;
  sources: PortalSource[];
};

type PortalInventoryResponse = {
  inventory?: {
    total: number;
    summary: {
      catalogued: number;
      registeredAdapters: number;
      runnable: number;
      quarantined: number;
    };
    groups: InventoryGroup[];
  };
  health?: PortalHealth;
  validation?: {
    published?: {
      clean: boolean;
      rawRecords: number;
      publishedRecords: number;
      removedRecords: number;
    };
  };
  degraded?: boolean;
  warnings?: string[];
};

const CACHE_KEY = "insight-hub:runtime-source-inventory:v1";
const REQUEST_TIMEOUT_MS = 12_000;

function accessLabel(source: PortalSource): string {
  if (source.accessMode === "api") return "Public API";
  if (source.accessMode === "csv") return "Structured listing";
  return "Public listing";
}

function connectorBadgeClass(status: PortalConnectorStatus): string {
  return status === "generic_extraction"
    ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
    : "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
}

function healthLabel(status?: PortalHealthStatus): string {
  if (!status) return "Awaiting health check";
  if (status.quarantined || status.lastOutcome === "quarantined") return "Quarantined";
  if (status.currentlyFailing) return status.lastOutcome === "validation_failed" ? "Validation failed" : "Failed";
  if (status.lastOutcome === "success") return `${status.matchedCount.toLocaleString()} matched`;
  if (status.lastOutcome === "no_results") return "No matched results";
  return status.lastOutcome.replaceAll("_", " ");
}

function healthBadgeClass(status?: PortalHealthStatus): string {
  if (!status) return "border-white/10 bg-white/5 text-white/45";
  if (status.quarantined || status.currentlyFailing || status.lastOutcome === "quarantined") {
    return "border-red-400/25 bg-red-400/10 text-red-200";
  }
  if (status.lastOutcome === "success") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (status.lastOutcome === "no_results") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-white/10 bg-white/5 text-white/55";
}

function PortalCard({ source, health }: { source: PortalSource; health?: PortalHealthStatus }) {
  const href = source.searchUrl || source.url;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={health?.lastFailureReason ?? source.connectorDescription}
      className="group rounded-xl border border-white/10 bg-white/[0.035] p-3.5 transition-all hover:border-primary/35 hover:bg-white/[0.06]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold leading-snug text-white transition-colors group-hover:text-primary">{source.name}</h4>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{source.jurisdiction}</span>
          </div>
        </div>
        <ExternalLink className="h-4 w-4 shrink-0 text-white/35 transition-colors group-hover:text-primary" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline" className="border-white/10 bg-white/5 text-[9px] font-normal text-white/65">{accessLabel(source)}</Badge>
        <Badge variant="outline" className={`text-[9px] font-normal ${connectorBadgeClass(source.connectorStatus)}`}>{source.connectorLabel}</Badge>
        <Badge variant="outline" className={source.operationalStatus === "runnable" ? "border-emerald-400/25 bg-emerald-400/10 text-[9px] font-normal text-emerald-200" : "border-red-400/25 bg-red-400/10 text-[9px] font-normal text-red-200"}>
          {source.operationalStatus === "runnable" ? "Runnable" : "Quarantined"}
        </Badge>
        <Badge variant="outline" className={`text-[9px] font-normal ${healthBadgeClass(health)}`}>{healthLabel(health)}</Badge>
      </div>
      <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-white/45">
        {health?.currentlyFailing && health.lastFailureReason ? health.lastFailureReason : source.quarantineReasonLabel ?? source.connectorDescription}
      </p>
    </a>
  );
}

export function ProcurementPortalDirectory() {
  const [data, setData] = useState<PortalInventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [activeGroupId, setActiveGroupId] = useState<PortalOperationalStatus>("runnable");
  const [copied, setCopied] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    try {
      const cached = window.sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        setData(JSON.parse(cached) as PortalInventoryResponse);
        setLoading(false);
      }
    } catch {
      window.sessionStorage.removeItem(CACHE_KEY);
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    setError(null);

    fetch(`${baseUrl}/api/rfp-sources/runtime-inventory`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as PortalInventoryResponse & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Runnable source inventory could not be loaded.");
        return payload;
      })
      .then((payload) => {
        setData(payload);
        const firstPopulatedGroup = payload.inventory?.groups.find((group) => group.sources.length > 0);
        if (firstPopulatedGroup) setActiveGroupId(firstPopulatedGroup.id);
        try {
          window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
        } catch {
          // The live response is still usable when browser storage is unavailable.
        }
      })
      .catch((requestError: Error) => {
        if (requestError.name === "AbortError") {
          setError("Runnable source inventory timed out. The opportunity list is still available; retry this panel when the service finishes warming.");
        } else {
          setError(requestError.message);
        }
      })
      .finally(() => {
        window.clearTimeout(timer);
        setLoading(false);
      });

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [reloadToken]);

  const inventory = data?.inventory;
  const health = data?.health;
  const validation = data?.validation;
  const activeGroup = useMemo(() => inventory?.groups.find((group) => group.id === activeGroupId), [activeGroupId, inventory]);
  const healthBySourceId = useMemo(() => new Map(health?.sources.map((status) => [status.sourceId, status])), [health]);
  const failingSources = useMemo(() => health?.sources.filter((status) => status.currentlyFailing) ?? [], [health]);

  const copyFailures = async () => {
    const report = failingSources
      .map((status) => `${status.sourceName ?? status.sourceId} (${status.sourceId}): ${status.lastFailureReason ?? "Unknown failure"}`)
      .join("\n");
    if (!report) return;
    await navigator.clipboard.writeText(report);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <section className="glass-panel overflow-hidden rounded-2xl border border-white/10">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.025]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10"><Globe2 className="h-4 w-4 text-primary" /></div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white">Runnable Procurement Sources</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Published sources backed by active runtime connectors.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {inventory && <Badge variant="outline" className="border-emerald-400/25 bg-emerald-400/10 text-[10px] font-normal text-emerald-200">{inventory.summary.runnable.toLocaleString()} runnable</Badge>}
          {expanded ? <ChevronUp className="h-4 w-4 text-white/50" /> : <ChevronDown className="h-4 w-4 text-white/50" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/10 px-5 py-5">
          {loading && !inventory ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading runnable sources…</div>
          ) : !inventory ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-muted-foreground">
              <p>{error ?? "Source inventory is unavailable."}</p>
              <button type="button" onClick={() => { setLoading(true); setReloadToken((value) => value + 1); }} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white"><RefreshCcw className="h-3.5 w-3.5" /> Retry source inventory</button>
            </div>
          ) : (
            <div className="space-y-5">
              {error && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100/75">
                  <span>{error} Showing the last successful inventory.</span>
                  <button type="button" onClick={() => setReloadToken((value) => value + 1)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-200/20 px-2.5 py-1.5 hover:bg-amber-100/10"><RefreshCcw className="h-3 w-3" /> Retry</button>
                </div>
              )}

              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3.5">
                <div className="text-[10px] uppercase tracking-wider text-white/45">Published runtime inventory</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-[10px] text-emerald-200">{inventory.summary.runnable.toLocaleString()} runnable</Badge>
                  <Badge className="border border-cyan-300/25 bg-cyan-300/10 text-[10px] text-cyan-100">{inventory.summary.registeredAdapters.toLocaleString()} registered</Badge>
                  <Badge className="border border-red-400/25 bg-red-400/10 text-[10px] text-red-200">{inventory.summary.quarantined.toLocaleString()} quarantined</Badge>
                  {validation?.published && <Badge className={validation.published.clean ? "border border-emerald-400/25 bg-emerald-400/10 text-[10px] text-emerald-200" : "border border-red-400/25 bg-red-400/10 text-[10px] text-red-200"}>{validation.published.clean ? "catalogue clean" : "catalogue validation failed"}</Badge>}
                  {data?.degraded && <Badge className="border border-amber-300/25 bg-amber-300/10 text-[10px] text-amber-100">partial diagnostics</Badge>}
                </div>
              </div>

              {health && (
                <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-white/45">Runtime adapter health</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-[10px] text-emerald-200">{health.summary.success.toLocaleString()} returned matches</Badge>
                        <Badge className="border border-amber-300/25 bg-amber-300/10 text-[10px] text-amber-100">{health.summary.noResults.toLocaleString()} valid empty</Badge>
                        <Badge className="border border-red-400/25 bg-red-400/10 text-[10px] text-red-200">{health.summary.failing.toLocaleString()} failing</Badge>
                        <Badge className="border border-white/10 bg-white/5 text-[10px] text-white/60">{health.summary.checked.toLocaleString()} checked</Badge>
                      </div>
                    </div>
                    {failingSources.length > 0 && (
                      <button type="button" onClick={() => void copyFailures()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] text-white/70 hover:bg-white/10 hover:text-white">
                        {copied ? <Check className="h-3 w-3" /> : <ClipboardCopy className="h-3 w-3" />}
                        {copied ? "Copied" : "Copy adapter failures"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {inventory.groups.map((group) => (
                  <button key={group.id} type="button" onClick={() => setActiveGroupId(group.id)} className={activeGroupId === group.id ? "rounded-full border border-primary/30 bg-primary/15 px-3 py-1.5 text-xs text-primary" : "rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/55 hover:text-white"}>
                    {group.title} ({group.sources.length})
                  </button>
                ))}
              </div>

              {activeGroup && (
                <div>
                  <p className="mb-3 text-xs text-white/45">{activeGroup.description}</p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {activeGroup.sources.map((source) => <PortalCard key={source.id} source={source} health={healthBySourceId.get(source.id)} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
