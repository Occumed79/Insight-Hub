/**
 * Source Intelligence Monitor
 *
 * Scraped intelligence source dashboard that fetches, extracts, stores,
 * deduplicates, and displays recent items from every configured source in
 * the curated source registry. No iframes. No arbitrary URLs. Only approved
 * sources from the backend registry are scraped.
 */

import { useState, useMemo } from "react";
import {
  ExternalLink,
  RefreshCw,
  Search,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Loader2,
  Globe,
  Zap,
  ChevronDown,
  ChevronUp,
  Monitor,
  Filter,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;
function api(path: string) { return `${BASE}api/${path}`; }

// ── Types ─────────────────────────────────────────────────────────────────────

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
    case "success": return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    case "no_items_found": return <Clock className="w-4 h-4 text-amber-400" />;
    case "blocked": return <AlertTriangle className="w-4 h-4 text-orange-400" />;
    case "failed": return <XCircle className="w-4 h-4 text-red-400" />;
    case "timeout": return <Clock className="w-4 h-4 text-red-400" />;
    default: return <Activity className="w-4 h-4 text-muted-foreground" />;
  }
}

function statusLabel(status: ScrapeStatus) {
  switch (status) {
    case "success": return "Success";
    case "no_items_found": return "No items";
    case "blocked": return "Blocked";
    case "failed": return "Failed";
    case "timeout": return "Timeout";
    default: return status;
  }
}

function statusBadgeClass(status: ScrapeStatus) {
  switch (status) {
    case "success": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "no_items_found": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    case "blocked": return "bg-orange-500/10 text-orange-400 border-orange-500/20";
    case "failed": return "bg-red-500/10 text-red-400 border-red-500/20";
    case "timeout": return "bg-red-500/10 text-red-400 border-red-500/20";
    default: return "bg-white/5 text-muted-foreground border-white/10";
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Page Component ─────────────────────────────────────────────────────────────

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

  // ── Queries ─────────────────────────────────────────────────────────────────

  const {
    data: sourcesData,
    isLoading: sourcesLoading,
  } = useQuery<{ sources: MonitoredSource[] }>({
    queryKey: ["source-monitor", "sources"],
    queryFn: async () => {
      const resp = await fetch(api("source-monitor/sources"));
      if (!resp.ok) throw new Error("Failed to load sources");
      return resp.json();
    },
    staleTime: 30_000,
  });

  const {
    data: itemsData,
    isLoading: itemsLoading,
  } = useQuery<ItemsResponse>({
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

  // ── Mutations ───────────────────────────────────────────────────────────────

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
      toast({
        title: `${data.sourceId} refreshed`,
        description: `${statusLabel(data.status)} · ${data.itemsFound} items found`,
      });
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

  const sources = sourcesData?.sources ?? [];
  const items = itemsData?.items ?? [];
  const totalItems = itemsData?.total ?? 0;

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

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white">Source Intelligence Monitor</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Scraped intelligence from curated sources. Items are fetched, extracted,
          deduplicated, and stored. Use <strong>Refresh All</strong> to run the scraper
          across every enabled source.
        </p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Sources</div>
          <div className="text-xl font-bold text-white mt-1">{sources.length}</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Total Items</div>
          <div className="text-xl font-bold text-white mt-1">{totalItems}</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Success</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">{statusCounts["success"] ?? 0}</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Blocked / Failed</div>
          <div className="text-xl font-bold text-red-400 mt-1">{(statusCounts["blocked"] ?? 0) + (statusCounts["failed"] ?? 0) + (statusCounts["timeout"] ?? 0)}</div>
        </div>
      </div>

      {/* Top controls */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => refreshAllMutation.mutate()}
            disabled={refreshAllMutation.isPending}
            className="gap-2"
          >
            {refreshAllMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            Refresh All Sources
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as ScrapeStatus | "all"); setPage(1); }}
            className="h-9 rounded-md border border-white/10 bg-white/5 px-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search items…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="pl-8 h-9 w-52 bg-white/5 border-white/10 text-white text-xs placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => { setActiveCategory(cat); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              activeCategory === cat
                ? "bg-primary/20 text-primary border-primary/30"
                : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10 hover:text-white"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Source status grid (collapsible) */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowSources((v) => !v)}
          className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-white">Source Status</span>
            <Badge variant="outline" className="text-[10px] bg-white/5 border-white/10 text-muted-foreground">
              {sources.length}
            </Badge>
          </div>
          {showSources ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {showSources && (
          <div className="px-4 pb-4 space-y-3">
            {/* Source search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Filter sources…"
                value={sourceSearch}
                onChange={(e) => setSourceSearch(e.target.value)}
                className="pl-8 h-8 bg-white/5 border-white/10 text-white text-xs placeholder:text-muted-foreground"
              />
            </div>

            {/* Source grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredSources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 transition-colors"
                >
                  <div className="shrink-0">
                    {source.lastRun ? statusIcon(source.lastRun.status) : <Activity className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">{source.name}</span>
                      {!source.enabled && (
                        <Badge variant="outline" className="text-[10px] bg-white/5 border-white/10 text-muted-foreground shrink-0">
                          Disabled
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {source.category}
                      {source.lastRun && (
                        <span className="ml-2">
                          · {source.lastRun.itemsFound} items · {formatRelative(source.lastRun.completedAt ?? source.lastRun.startedAt)}
                        </span>
                      )}
                    </div>
                    {source.lastRun?.errorMessage && (
                      <div className="text-[11px] text-red-400 truncate mt-0.5">{source.lastRun.errorMessage}</div>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      onClick={() => refreshMutation.mutate(source.id)}
                      disabled={refreshMutation.isPending && refreshMutation.variables === source.id}
                      className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-white transition-colors disabled:opacity-40"
                      title="Refresh source"
                    >
                      {refreshMutation.isPending && refreshMutation.variables === source.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                      title="Open source"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {filteredSources.length === 0 && !sourcesLoading && (
              <div className="text-center py-6 text-sm text-muted-foreground">No sources match your filter.</div>
            )}
            {sourcesLoading && (
              <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading sources…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scraped items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            <h2 className="text-lg font-semibold text-white">Scraped Items</h2>
            <Badge variant="outline" className="text-[10px] bg-white/5 border-white/10 text-muted-foreground">
              {totalItems}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            Page {page} of {Math.max(1, Math.ceil(totalItems / PAGE_SIZE))}
          </div>
        </div>

        {itemsLoading && (
          <div className="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading items…
          </div>
        )}

        {!itemsLoading && items.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground bg-white/5 border border-white/10 rounded-xl">
            No scraped items yet. Run <strong>Refresh All Sources</strong> to populate.
          </div>
        )}

        {!itemsLoading && items.length > 0 && (
          <div className="grid grid-cols-1 gap-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={`text-[10px] ${statusBadgeClass(item.scrapeStatus)}`}>
                        {statusLabel(item.scrapeStatus)}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{item.sourceName}</span>
                      <span className="text-[11px] text-muted-foreground">· {item.category}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-white leading-snug">{item.title}</h3>
                    {item.summary && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.summary}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      {item.publishedDate && <span>Published: {formatDate(item.publishedDate)}</span>}
                      <span>Scraped: {formatRelative(item.scrapedAt)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    {item.itemUrl && (
                      <a
                        href={item.itemUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                        title="Open item"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                      title="Open source"
                    >
                      <Globe className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalItems > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {Math.ceil(totalItems / PAGE_SIZE)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(totalItems / PAGE_SIZE)}
              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
