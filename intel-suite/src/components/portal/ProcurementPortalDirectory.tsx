import { useEffect, useMemo, useState } from "react";
import {
  Building2,
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
  requiresLogin: boolean;
  parserStatus: string;
  notes: string;
  occumedFit?: string;
  connectorStatus: PortalConnectorStatus;
  connectorLabel: string;
  connectorDescription: string;
  directCollection: boolean;
  requiresSerper: boolean;
};

type DirectoryGroup = {
  id: string;
  title: string;
  sources: PortalSource[];
};

type PortalDirectoryResponse = {
  directory?: {
    unitedStates: {
      id: string;
      title: string;
      description: string;
      sources: PortalSource[];
    };
    international: {
      id: string;
      title: string;
      description: string;
      groups: DirectoryGroup[];
    };
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
        <Badge variant="outline" className="border-white/10 bg-white/5 text-[9px] font-normal text-white/65">
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
  const [directory, setDirectory] = useState<PortalDirectoryResponse["directory"]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [activeInternationalGroup, setActiveInternationalGroup] = useState("canada");

  useEffect(() => {
    const controller = new AbortController();
    const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

    fetch(`${baseUrl}/api/rfp-sources?includeTier3=true`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Portal directory could not be loaded.");
        return response.json() as Promise<PortalDirectoryResponse>;
      })
      .then((data) => {
        setDirectory(data.directory);
        const firstGroup = data.directory?.international.groups[0]?.id;
        if (firstGroup) setActiveInternationalGroup(firstGroup);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const activeGroup = useMemo(
    () => directory?.international.groups.find((group) => group.id === activeInternationalGroup),
    [activeInternationalGroup, directory],
  );

  const internationalCount = useMemo(
    () => directory?.international.groups.reduce((sum, group) => sum + group.sources.length, 0) ?? 0,
    [directory],
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
            <h2 className="text-base font-semibold text-white">Official Procurement Portal Directory</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Official portal links with the collection method that is actually implemented.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {directory && (
            <Badge variant="outline" className="border-white/10 bg-white/5 text-[10px] font-normal text-white/60">
              {(directory.unitedStates.sources.length + internationalCount).toLocaleString()} portals
            </Badge>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-white/50" /> : <ChevronDown className="h-4 w-4 text-white/50" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/10 px-5 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading official portals...
            </div>
          ) : error || !directory ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-muted-foreground">
              {error ?? "Portal directory is unavailable."}
            </div>
          ) : (
            <div className="space-y-7">
              <div>
                <div className="mb-3 flex items-end justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold text-white">{directory.unitedStates.title}</h3>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{directory.unitedStates.description}</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    {directory.unitedStates.sources.length} featured
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                  {directory.unitedStates.sources.map((source) => (
                    <PortalCard key={source.id} source={source} />
                  ))}
                </div>
              </div>

              <div className="border-t border-white/10 pt-6">
                <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Globe2 className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold text-white">{directory.international.title}</h3>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{directory.international.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {directory.international.groups.map((group) => {
                      const selected = group.id === activeInternationalGroup;
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => setActiveInternationalGroup(group.id)}
                          className={`rounded-full border px-2.5 py-1 text-[10px] transition-colors ${
                            selected
                              ? "border-primary/40 bg-primary/15 text-primary"
                              : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/85"
                          }`}
                        >
                          {group.title} · {group.sources.length}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                  {activeGroup?.sources.map((source) => (
                    <PortalCard key={source.id} source={source} />
                  ))}
                </div>
              </div>

              <p className="text-[10px] leading-relaxed text-white/40">
                A directory entry confirms an official source link, not a completed connector. Direct API and dedicated adapter labels indicate source-specific collection. Generic extraction reads one public page without full portal pagination. Serper discovery searches the official domain and requires source-page verification.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
