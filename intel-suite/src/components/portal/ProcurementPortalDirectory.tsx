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
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

 type PortalConnectorStatus =
  | "direct_api"
  | "direct_adapter"
  | "generic_extraction"
  | "serper_discovery"
  | "directory_only"
  | "stub";

type PortalRunOutcome =
  | "success"
  | "no_results"
  | "failed"
  | "validation_failed";

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
};

type PortalHealth = {
  summary: {
    checked: number;
    success: number;
    noResults: number;
    failing: number;
    validationFailed: number;
  };
  sources: PortalHealthStatus[];
};

type InventoryGroup = {
  id: string;
  title: string;
  description: string;
  sources: PortalSource[];
};

type PortalInventoryResponse = {
  inventory?: {
    total: number;
    groups: InventoryGroup[];
  };
  health?: PortalHealth;
};

function accessLabel(source: PortalSource): string {
  if (source.accessMode === "api") return "Public API / search";
  if (source.accessMode === "public_html") return "Public listings";
  if (source.accessMode === "dynamic_html") return "Interactive portal";
  if (source.accessMode === "csv") return "Structured public listing";
  return "Supplier portal";
}

function connectorBadgeClass(status: PortalConnectorStatus): string {
  if (status === "direct_api" || status === "direct_adapter") {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  }
  if (status === "generic_extraction") {
    return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  }
  if (status === "serper_discovery") {
    return "border-sky-300/25 bg-sky-300/10 text-sky-100";
  }
  return "border-white/10 bg-white/5 text-white/55";
}

function healthLabel(status?: PortalHealthStatus): string {
  if (!status) return "Not checked";
  if (status.currentlyFailing) {
    return status.lastOutcome === "validation_failed"
      ? "Validation failed"
      : "Failed";
  }
  if (status.lastOutcome === "success") {
    return `${status.resultCount.toLocaleString()} returned`;
  }
  if (status.lastOutcome === "no_results") return "No results";
  return status.lastOutcome.replaceAll("_", " ");
}

function healthBadgeClass(status?: PortalHealthStatus): string {
  if (!status) return "border-white/10 bg-white/5 text-white/45";
  if (status.currentlyFailing) {
    return "border-red-400/25 bg-red-400/10 text-red-200";
  }
  if (status.lastOutcome === "success") {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  }
  if (status.lastOutcome === "no_results") {
    return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  }
  return "border-white/10 bg-white/5 text-white/55";
}

function PortalCard({
  source,
  health,
}: {
  source: PortalSource;
  health?: PortalHealthStatus;
}) {
  const href = source.searchUrl || source.url;
  const healthDetail = health?.currentlyFailing
    ? health.lastFailureReason
    : health
      ? `Last checked ${new Date(health.lastCheckedAt).toLocaleString()}`
      : undefined;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={healthDetail ?? source.connectorDescription}
      className="group rounded-xl border border-white/10 bg-white/[0.035] p-3.5 transition-all hover:border-primary/35 hover:bg-white/[0.06]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold leading-snug text-white transition-colors group-hover:text-primary">
            {source.name}
          </h4>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{source.jurisdiction}</span>
          </div>
        </div>
        <ExternalLink className="h-4 w-4 shrink-0 text-white/35 transition-colors group-hover:text-primary" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge
          variant="outline"
          className="border-white/10 bg-white/5 text-[9px] font-normal text-white/65"
        >
          {accessLabel(source)}
        </Badge>
        <Badge
          variant="outline"
          className={`text-[9px] font-normal ${connectorBadgeClass(source.connectorStatus)}`}
        >
          {source.connectorLabel}
        </Badge>
        <Badge
          variant="outline"
          className={`text-[9px] font-normal ${healthBadgeClass(health)}`}
        >
          {healthLabel(health)}
        </Badge>
      </div>
      <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-white/45">
        {health?.currentlyFailing && health.lastFailureReason
          ? health.lastFailureReason
          : source.connectorDescription}
      </p>
    </a>
  );
}

export function ProcurementPortalDirectory() {
  const [inventory, setInventory] =
    useState<PortalInventoryResponse["inventory"]>();
  const [health, setHealth] = useState<PortalHealth>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [activeGroupId, setActiveGroupId] = useState("direct");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

    fetch(`${baseUrl}/api/rfp-sources?includeTier3=true`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Source inventory could not be loaded.");
        return response.json() as Promise<PortalInventoryResponse>;
      })
      .then((data) => {
        setInventory(data.inventory);
        setHealth(data.health);
        const firstPopulatedGroup = data.inventory?.groups.find(
          (group) => group.sources.length > 0,
        );
        if (firstPopulatedGroup) setActiveGroupId(firstPopulatedGroup.id);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const activeGroup = useMemo(
    () => inventory?.groups.find((group) => group.id === activeGroupId),
    [activeGroupId, inventory],
  );
  const healthBySourceId = useMemo(
    () => new Map(health?.sources.map((status) => [status.sourceId, status])),
    [health],
  );
  const failingSources = useMemo(
    () => health?.sources.filter((status) => status.currentlyFailing) ?? [],
    [health],
  );

  const copyFailures = async () => {
    const report = failingSources
      .map(
        (status) =>
          `${status.sourceName ?? status.sourceId} (${status.sourceId}): ${
            status.lastFailureReason ?? "Unknown failure"
          }`,
      )
      .join("\n");
    if (!report) return;
    await navigator.clipboard.writeText(report);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <section className="glass-panel overflow-hidden rounded-2xl border border-white/10">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.025]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
            <Globe2 className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white">
              Configured Source & Adapter Inventory
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Complete configured catalog with durable portal-by-portal health.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {health && health.summary.failing > 0 && (
            <Badge
              variant="outline"
              className="border-red-400/25 bg-red-400/10 text-[10px] font-normal text-red-200"
            >
              {health.summary.failing.toLocaleString()} failing
            </Badge>
          )}
          {inventory && (
            <Badge
              variant="outline"
              className="border-white/10 bg-white/5 text-[10px] font-normal text-white/60"
            >
              {inventory.total.toLocaleString()} sources
            </Badge>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-white/50" />
          ) : (
            <ChevronDown className="h-4 w-4 text-white/50" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/10 px-5 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading configured
              sources...
            </div>
          ) : error || !inventory ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-muted-foreground">
              {error ?? "Source inventory is unavailable."}
            </div>
          ) : (
            <div className="space-y-5">
              {health && (
                <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-white/45">
                        Latest persisted portal health
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-[10px] text-emerald-200">
                          {health.summary.success.toLocaleString()} returned results
                        </Badge>
                        <Badge className="border border-amber-300/25 bg-amber-300/10 text-[10px] text-amber-100">
                          {health.summary.noResults.toLocaleString()} no results
                        </Badge>
                        <Badge className="border border-red-400/25 bg-red-400/10 text-[10px] text-red-200">
                          {health.summary.failing.toLocaleString()} failing
                        </Badge>
                        <Badge className="border border-white/10 bg-white/5 text-[10px] text-white/60">
                          {health.summary.checked.toLocaleString()} checked
                        </Badge>
                      </div>
                    </div>
                    {failingSources.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void copyFailures()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        {copied ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <ClipboardCopy className="h-3 w-3" />
                        )}
                        {copied ? "Copied" : "Copy all failures"}
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-white/40">
                    Health is stored per portal. A failed adapter no longer makes
                    the entire public-portal provider appear to have failed.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {inventory.groups.map((group) => {
                  const selected = group.id === activeGroupId;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setActiveGroupId(group.id)}
                      className={`rounded-full border px-2.5 py-1 text-[10px] transition-colors ${
                        selected
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/85"
                      }`}
                    >
                      {group.title} · {group.sources.length.toLocaleString()}
                    </button>
                  );
                })}
              </div>

              {activeGroup && (
                <div>
                  <div className="mb-3 flex items-end justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        {activeGroup.title}
                      </h3>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {activeGroup.description}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-white/40">
                      {activeGroup.sources.length.toLocaleString()} sources
                    </span>
                  </div>
                  <div className="grid max-h-[560px] grid-cols-1 gap-2.5 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
                    {activeGroup.sources.map((source) => (
                      <PortalCard
                        key={source.id}
                        source={source}
                        health={healthBySourceId.get(source.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] leading-relaxed text-white/40">
                “Direct API” and “Dedicated listing adapter” mean
                source-specific collection. Generic extraction is bounded
                public-page collection. Search/discovery sources rely on
                discovery tooling and are not direct adapters. Directory entries
                are links only.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
