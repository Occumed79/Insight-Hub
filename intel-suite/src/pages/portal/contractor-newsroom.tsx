/**
 * Source Intelligence Monitor
 *
 * Scraped intelligence source dashboard that fetches, extracts, stores,
 * deduplicates, and displays recent items from every configured source in
 * the curated source registry. No iframes. No arbitrary URLs. Only approved
 * sources from the backend registry are scraped.
 */

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Filter,
  Globe,
  Loader2,
  Monitor,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

function api(path: string) {
  return `/api/${path}`;
}

type ScrapeStatus = "success" | "no_items_found" | "blocked" | "failed" | "timeout";

interface SourceRun {
  status: ScrapeStatus;
  itemsFound: number;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

interface MonitoredSource {
  id: string;
  name: string;
  category: string;
  url: string;
  enabled: boolean;
  lastRun: SourceRun | null;
}

interface ScrapedItem {
  id: string;
  sourceId: string;
  sourceName: string;
  category: string;
  title: string;
  summary: string | null;
  itemUrl: string | null;
  sourceUrl: string;
  publishedDate: string | null;
  scrapeStatus: ScrapeStatus;
  protectedFromCleanup?: boolean;
  protectedAt?: string | null;
  scrapedAt: string;
}

interface ItemsResponse {
  items: ScrapedItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface RefreshResult {
  sourceId: string;
  status: ScrapeStatus;
  itemsFound: number;
  errorMessage?: string;
  itemsCreated?: number;
  itemsUpdated?: number;
}

interface RefreshAllResponse {
  totalSources: number;
  success: number;
  blocked: number;
  failed: number;
  noItems: number;
  totalItemsFound: number;
  results: RefreshResult[];
}

interface CleanupResponse {
  deletedCount: number;
}

type CategoryFilter =
  | "All"
  | "Contractor Newsrooms"
  | "Federal Procurement / Awards"
  | "Regulatory / Rulemaking"
  | "Oversight / Pain Points"
  | "Workforce / Demand"
  | "Medical / Deployment / Occu-Med"
  | "State / Local Procurement";

const CATEGORIES: CategoryFilter[] = [
  "All",
  "Contractor Newsrooms",
  "Federal Procurement / Awards",
  "Regulatory / Rulemaking",
  "Oversight / Pain Points",
  "Workforce / Demand",
  "Medical / Deployment / Occu-Med",
  "State / Local Procurement",
];

const STATUS_OPTIONS: { label: string; value: ScrapeStatus | "all" }[] = [
  { label: "All statuses", value: "all" },
  { label: "Success", value: "success" },
  { label: "Blocked", value: "blocked" },
  { label: "No items", value: "no_items_found" },
  { label: "Failed", value: "failed" },
  { label: "Timeout", value: "timeout" },
];

function statusIcon(status: ScrapeStatus) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "no_items_found":
      return <Clock className="h-4 w-4 text-amber-400" />;
    case "blocked":
      return <AlertTriangle className="h-4 w-4 text-orange-400" />;
    case "failed":
    case "timeout":
      return <XCircle className="h-4 w-4 text-red-400" />;
    default:
      return <Activity className="h-4 w-4 text-muted-foreground" />;
  }
}

function statusLabel(status: ScrapeStatus) {
  switch (status) {
    case "success":
      return "Success";
    case "no_items_found":
      return "No items";
    case "blocked":
      return "Blocked";
    case "failed":
      return "Failed";
    case "timeout":
      return "Timeout";
    default:
      return status;
  }
}

function statusBadgeClass(status: ScrapeStatus) {
  switch (status) {
    case "success":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "no_items_found":
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    case "blocked":
      return "bg-orange-500/10 text-orange-400 border-orange-500/20";
    case "failed":
    case "timeout":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    default:
      return "bg-white/5 text-muted-foreground border-white/10";
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function hostFromUrl(url: string | null | undefined): string {
  if (!url) return "source";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

export default function SourceIntelligenceMonitor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("All");
  const [statusFilter, setStatusFilter] = useState<ScrapeStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  const [showSources, setShowSources] = useState(true);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;

  const { data: sourcesData, isLoading: sourcesLoading } = useQuery<{ sources: MonitoredSource[] }>({
    queryKey: ["source-monitor", "sources"],
    queryFn: async () => {
      const resp = await fetch(api("source-monitor/sources"));
      if (!resp.ok) throw new Error("Failed to load sources");
      return resp.json();
    },
    staleTime: 30_000,
  });

  const { data: itemsData, isLoading: itemsLoading } = useQuery<ItemsResponse>({
    queryKey: ["source-monitor", "items", activeCategory, statusFilter, searchQuery, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        ...(activeCategory !== "All" ? { category: activeCategory } : {}),
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
      });
      const resp = await fetch(api(`source-monitor/items?${params}`));
      if (!resp.ok) throw new Error("Failed to load items");
      return resp.json();
    },
    staleTime: 30_000,
  });

  const refreshMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const resp = await fetch(api("source-monitor/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error ?? `Refresh failed (${resp.status})`);
      }
      return resp.json() as Promise<RefreshResult>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["source-monitor"] });
      toast({ title: `${data.sourceId} refreshed`, description: `${statusLabel(data.status)} · ${data.itemsFound} items found` });
    },
    onError: (err: any) => {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    },
  });

  const refreshAllMutation = useMutation({
    mutationFn: async () => {
      const resp = await fetch(api("source-monitor/refresh-all"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error ?? `Refresh-all failed (${resp.status})`);
      }
      return resp.json() as Promise<RefreshAllResponse>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["source-monitor"] });
      toast({
        title: "Refresh all complete",
        description: `${data.success} success, ${data.blocked} blocked, ${data.failed} failed, ${data.noItems} no items · ${data.totalItemsFound} total`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Refresh all failed", description: err.message, variant: "destructive" });
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const resp = await fetch(api("source-monitor/cleanup-junk"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error ?? `Cleanup failed (${resp.status})`);
      }
      return resp.json() as Promise<CleanupResponse>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["source-monitor", "items"] });
      toast({ title: "Junk cleanup complete", description: `${data.deletedCount} unprotected low-value items deleted.` });
    },
    onError: (err: any) => {
      toast({ title: "Cleanup failed", description: err.message, variant: "destructive" });
    },
  });

  const protectMutation = useMutation({
    mutationFn: async ({ itemId, protectedFromCleanup }: { itemId: string; protectedFromCleanup: boolean }) => {
      const resp = await fetch(api(`source-monitor/items/${itemId}/protect`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protectedFromCleanup }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error ?? `Protection update failed (${resp.status})`);
      }
      return resp.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["source-monitor", "items"] });
      toast({
        title: vars.protectedFromCleanup ? "Card protected" : "Card unprotected",
        description: vars.protectedFromCleanup
          ? "This card will survive junk cleanup."
          : "This card can now be deleted by junk cleanup.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Protection failed", description: err.message, variant: "destructive" });
    },
  });

  const sources = sourcesData?.sources ?? [];
  const items = itemsData?.items ?? [];
  const totalItems = itemsData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const filteredSources = useMemo(() => {
    const q = sourceSearch.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
  }, [sources, sourceSearch]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sources) {
      const st = s.lastRun?.status ?? "unknown";
      counts[st] = (counts[st] ?? 0) + 1;
    }
    return counts;
  }, [sources]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white">Source Intelligence Monitor</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Scraped intelligence from curated sources. Refresh sources, protect useful cards, then clean low-value navigation junk from the database.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Sources</div>
          <div className="mt-1 text-xl font-bold text-white">{sources.length}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Items</div>
          <div className="mt-1 text-xl font-bold text-white">{totalItems}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Success</div>
          <div className="mt-1 text-xl font-bold text-emerald-400">{statusCounts.success ?? 0}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Blocked / Failed</div>
          <div className="mt-1 text-xl font-bold text-red-400">
            {(statusCounts.blocked ?? 0) + (statusCounts.failed ?? 0) + (statusCounts.timeout ?? 0)}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => refreshAllMutation.mutate()} disabled={refreshAllMutation.isPending} className="gap-2">
            {refreshAllMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Refresh All Sources
          </Button>
          <Button
            onClick={() => cleanupMutation.mutate()}
            disabled={cleanupMutation.isPending}
            variant="outline"
            className="gap-2 border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/20"
          >
            {cleanupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Clean Junk Items
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as ScrapeStatus | "all");
              setPage(1);
            }}
            className="h-9 rounded-md border border-white/10 bg-white/5 px-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search items…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="h-9 w-52 border-white/10 bg-white/5 pl-8 text-xs text-white placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setActiveCategory(cat);
              setPage(1);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              activeCategory === cat
                ? "border-primary/30 bg-primary/20 text-primary"
                : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-md">
        <button
          onClick={() => setShowSources((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/5"
        >
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-white">Source Status</span>
            <Badge variant="outline" className="border-white/10 bg-white/5 text-[10px] text-muted-foreground">
              {sources.length}
            </Badge>
          </div>
          {showSources ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showSources && (
          <div className="space-y-3 px-4 pb-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Filter sources…"
                value={sourceSearch}
                onChange={(e) => setSourceSearch(e.target.value)}
                className="h-8 border-white/10 bg-white/5 pl-8 text-xs text-white placeholder:text-muted-foreground"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredSources.map((source) => (
                <div key={source.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:border-white/20">
                  <div className="shrink-0">{source.lastRun ? statusIcon(source.lastRun.status) : <Activity className="h-4 w-4 text-muted-foreground" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-white">{source.name}</span>
                      {!source.enabled && <Badge variant="outline" className="shrink-0 border-white/10 bg-white/5 text-[10px] text-muted-foreground">Disabled</Badge>}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {source.category}
                      {source.lastRun && <span className="ml-2">· {source.lastRun.itemsFound} items · {formatRelative(source.lastRun.completedAt ?? source.lastRun.startedAt)}</span>}
                    </div>
                    {source.lastRun?.errorMessage && <div className="mt-0.5 truncate text-[11px] text-red-400">{source.lastRun.errorMessage}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => refreshMutation.mutate(source.id)}
                      disabled={refreshMutation.isPending && refreshMutation.variables === source.id}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                      title="Refresh source"
                    >
                      {refreshMutation.isPending && refreshMutation.variables === source.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </button>
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white" title="Open source">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {filteredSources.length === 0 && !sourcesLoading && <div className="py-6 text-center text-sm text-muted-foreground">No sources match your filter.</div>}
            {sourcesLoading && <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading sources…</div>}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold text-white">Scraped Items</h2>
            <Badge variant="outline" className="border-white/10 bg-white/5 text-[10px] text-muted-foreground">{totalItems}</Badge>
          </div>
          <div className="text-xs text-muted-foreground">Page {page} of {totalPages}</div>
        </div>

        {itemsLoading && <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading items…</div>}

        {!itemsLoading && items.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/5 py-12 text-center text-sm text-muted-foreground">
            No scraped items match the current filters. Run <strong>Refresh All Sources</strong> or clear filters.
          </div>
        )}

        {!itemsLoading && items.length > 0 && (
          <div className="grid grid-cols-1 gap-3">
            {items.map((item) => {
              const protectedCard = Boolean(item.protectedFromCleanup);
              return (
                <div key={item.id} className={`rounded-xl border p-4 transition-colors ${protectedCard ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:border-white/20"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${statusBadgeClass(item.scrapeStatus)}`}>{statusLabel(item.scrapeStatus)}</Badge>
                        {protectedCard && <Badge variant="outline" className="border-emerald-400/30 bg-emerald-500/10 text-[10px] text-emerald-300">Protected</Badge>}
                        <span className="text-[11px] text-muted-foreground">{item.sourceName}</span>
                        <span className="text-[11px] text-muted-foreground">· {item.category}</span>
                        <span className="text-[11px] text-muted-foreground">· {hostFromUrl(item.itemUrl ?? item.sourceUrl)}</span>
                      </div>
                      <h3 className="text-sm font-semibold leading-snug text-white">{item.title}</h3>
                      {item.summary && <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{item.summary}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        {item.publishedDate && <span>Published: {formatDate(item.publishedDate)}</span>}
                        <span>Scraped: {formatRelative(item.scrapedAt)}</span>
                        {protectedCard && item.protectedAt && <span>Protected: {formatRelative(item.protectedAt)}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => protectMutation.mutate({ itemId: item.id, protectedFromCleanup: !protectedCard })}
                        disabled={protectMutation.isPending && protectMutation.variables?.itemId === item.id}
                        className={`rounded-md p-1.5 transition-colors disabled:opacity-40 ${protectedCard ? "text-emerald-300 hover:bg-emerald-500/20" : "text-muted-foreground hover:bg-white/10 hover:text-white"}`}
                        title={protectedCard ? "Remove cleanup protection" : "Protect from cleanup"}
                      >
                        {protectMutation.isPending && protectMutation.variables?.itemId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : protectedCard ? <ShieldCheck className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                      </button>
                      {item.itemUrl && (
                        <a href={item.itemUrl} target="_blank" rel="noopener noreferrer" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white" title="Open item">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white" title="Open source">
                        <Globe className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalItems > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="border-white/10 bg-white/5 text-white hover:bg-white/10">
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} className="border-white/10 bg-white/5 text-white hover:bg-white/10">
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
