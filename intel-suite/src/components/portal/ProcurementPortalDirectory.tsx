import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
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

function PortalCard({ source }: { source: PortalSource }) {
  const href = source.searchUrl || source.url;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={source.connectorDescription}
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
      </div>
      <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-white/45">
        {source.connectorDescription}
      </p>
    </a>
  );
}

export function ProcurementPortalDirectory() {
  const [inventory, setInventory] =
    useState<PortalInventoryResponse["inventory"]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [activeGroupId, setActiveGroupId] = useState("direct");

  useEffect(() => {
    const controller = new AbortController();
    const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

    fetch(`${baseUrl}/api/rfp-sources?includeTier3=true`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Source inventory could not be loaded.");
        return response.json() as Promise<PortalInventoryResponse>;
      })
      .then((data) => {
        setInventory(data.inventory);
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
              The complete configured catalog, separated by the collection
              method actually implemented.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
                      <PortalCard key={source.id} source={source} />
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
