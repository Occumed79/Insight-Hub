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
  | "generic_extraction";

type PortalOperationalStatus = "runnable" | "quarantined";

type PortalRunOutcome =
  | "success"
  | "no_results"
  | "failed"
  | "validation_failed"
  | "quarantined";

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
  registrationKind:
    | "direct_api"
    | "adapter"
    | "approved_api"
    | "vetted_extractor";
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
};

function accessLabel(source: PortalSource): string {
  if (source.accessMode === "api") return "Public API";
  if (source.accessMode === "csv") return "Structured listing";
  return "Public listing";
}

function connectorBadgeClass(status: PortalConnectorStatus): string {
  if (status === "direct_api" || status === "direct_adapter") {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  }
  return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
}

function operationalBadgeClass(status: PortalOperationalStatus): string {
  return status === "runnable"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
    : "border-red-400/25 bg-red-400/10 text-red-200";
}

function healthLabel(status?: PortalHealthStatus): string {
  if (!status) return "Awaiting health check";
  if (status.quarantined || status.lastOutcome === "quarantined") {
    return "Quarantined";
  }
  if (status.currentlyFailing) {
    return status.lastOutcome === "validation_failed"
      ? "Validation failed"
      : "Failed";
  }
  if (status.lastOutcome === "success") {
    return `${status.matchedCount.toLocaleString()} matched`;
  }
  if (status.lastOutcome === "no_results") return "No matched results";
  return status.lastOutcome.replaceAll("_", " ");
}

function healthBadgeClass(status?: PortalHealthStatus): string {
  if (!status) return "border-white/10 bg-white/5 text-white/45";
  if (
    status.quarantined ||
    status.lastOutcome === "quarantined" ||
    status.currentlyFailing
  ) {
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
    : health?.quarantineReasonLabel
      ? health.quarantineReasonLabel
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
          className={`text-[9px] font-normal ${operationalBadgeClass(source.operationalStatus)}`}
        >
          {source.operationalStatus === "runnable" ? "Runnable" : "Quarantined"}
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
          : source.quarantineReasonLabel ?? source.connectorDescription}
      </p>
    </a>
  );
}

export function ProcurementPortalDirectory() {
  const [inventory, setInventory] =
    useState<PortalInventoryResponse["inventory"]>();
  const [health, setHealth] = useState<PortalHealth>();
  const [validation, setValidation] =
    useState<PortalInventoryResponse["validation"]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [activeGroupId, setActiveGroupId] =
    useState<PortalOperationalStatus>("runnable");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

    fetch(`${baseUrl}/api/rfp-sources?includeTier3=true`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Source catalogue could not be loaded.");
        }
        return response.json() as Promise<PortalInventoryResponse>;
      })
      .then((data) => {
        setInventory(data.inventory);
        setHealth(data.health);
        setValidation(data.validation);
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
              Runnable Procurement Sources
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every published source is backed by an active runtime adapter.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {inventory && (
            <Badge
              variant="outline"
              className="border-emerald-400/25 bg-emerald-400/10 text-[10px] font-normal text-emerald-200"
            >
              {inventory.summary.runnable.toLocaleString()} runnable
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
              <Loader2 className="h-4 w-4 animate-spin" /> Loading runnable
              sources...
            </div>
          ) : error || !inventory ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-muted-foreground">
              {error ?? "Source catalogue is unavailable."}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3.5">
                <div className="text-[10px] uppercase tracking-wider text-white/45">
                  Published catalogue
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-[10px] text-emerald-200">
                    {inventory.summary.runnable.toLocaleString()} runnable
                  </Badge>
                  <Badge className="border border-cyan-300/25 bg-cyan-300/10 text-[10px] text-cyan-100">
                    {inventory.summary.registeredAdapters.toLocaleString()} registered adapters
                  </Badge>
                  <Badge className="border border-red-400/25 bg-red-400/10 text-[10px] text-red-200">
                    {inventory.summary.quarantined.toLocaleString()} quarantined
                  </Badge>
                  {validation?.published && (
                    <Badge
                      className={
                        validation.published.clean
                          ? "border border-emerald-400/25 bg-emerald-400/10 text-[10px] text-emerald-200"
                          : "border border-red-400/25 bg-red-400/10 text-[10px] text-red-200"
                      }
                    >
                      {validation.published.clean ? "catalogue clean" : "catalogue validation failed"}
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-white/40">
                  Unadapted, login-only, blocked, disabled, and manual-only
                  records are removed instead of being presented as sources.
                </p>
              </div>

              {health && (
                <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-white/45">
                        Runtime adapter health
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-[10px] text-emerald-200">
                          {health.summary.success.toLocaleString()} returned matches
                        </Badge>
                        <Badge className="border border-amber-300/25 bg-amber-300/10 text-[10px] text-amber-100">
                          {health.summary.noResults.toLocaleString()} valid empty results
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
                        {copied ? "Copied" : "Copy adapter failures"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {inventory.groups
                  .filter((group) => group.sources.length > 0)
                  .map((group) => {
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
            </div>
          )}
        </div>
      )}
    </section>
  );
}
