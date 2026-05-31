import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Rss, RefreshCw, ExternalLink, Bookmark, X, Loader2,
  AlertCircle, ChevronDown, Filter, Zap, Globe, Building2,
  TrendingUp, FileText, DollarSign, ShieldAlert, BarChart2,
  MapPin, Layers, Check,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BASE = import.meta.env.BASE_URL;
function api(path: string) { return `${BASE}api/${path}`; }

// ── Types ─────────────────────────────────────────────────────────────────────

type SignalType =
  | "regulatory_change" | "procurement_forecast" | "expiring_contract"
  | "new_rulemaking" | "enforcement_action" | "budget_funding"
  | "grant_program" | "industry_trend" | "state_procurement" | "other";

type Feedback = "saved" | "dismissed" | "new";
type Scope = "federal" | "state";

interface IntelItem {
  id: string;
  scope: Scope;
  stateCode: string | null;
  signalType: SignalType;
  source: string;
  agency: string | null;
  title: string;
  summary: string | null;
  sourceUrl: string | null;
  publishedDate: string | null;
  feedback: Feedback;
  relevanceScore: number;
  fetchedAt: string;
}

interface FeedResponse {
  items: IntelItem[];
  total: number;
  page: number;
  pages: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_STATES = [
  { code: "AL", name: "Alabama" },     { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },     { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "DC", name: "Washington D.C." }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },     { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },       { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },     { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },      { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },   { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },    { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },    { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },     { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },      { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },    { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },{ code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },    { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },{ code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },{ code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },   { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },        { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },    { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },{ code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

const SIGNAL_TYPES: { value: SignalType | "all"; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "all",                label: "All Signals",          icon: <Layers className="w-3.5 h-3.5" />,    color: "text-white/50" },
  { value: "regulatory_change",  label: "Regulatory Change",    icon: <ShieldAlert className="w-3.5 h-3.5" />, color: "text-amber-400" },
  { value: "new_rulemaking",     label: "New Rulemaking",       icon: <FileText className="w-3.5 h-3.5" />,  color: "text-blue-400" },
  { value: "procurement_forecast",label: "Procurement Forecast",icon: <TrendingUp className="w-3.5 h-3.5" />,color: "text-emerald-400" },
  { value: "expiring_contract",  label: "Expiring Contract",    icon: <RefreshCw className="w-3.5 h-3.5" />, color: "text-orange-400" },
  { value: "enforcement_action", label: "Enforcement Action",   icon: <AlertCircle className="w-3.5 h-3.5" />,color: "text-red-400" },
  { value: "budget_funding",     label: "Budget / Funding",     icon: <DollarSign className="w-3.5 h-3.5" />, color: "text-purple-400" },
  { value: "grant_program",      label: "Grant Program",        icon: <Zap className="w-3.5 h-3.5" />,       color: "text-cyan-400" },
  { value: "state_procurement",  label: "State Procurement",    icon: <Building2 className="w-3.5 h-3.5" />, color: "text-sky-400" },
  { value: "industry_trend",     label: "Industry Trend",       icon: <BarChart2 className="w-3.5 h-3.5" />, color: "text-violet-400" },
  { value: "other",              label: "Other",                icon: <Globe className="w-3.5 h-3.5" />,     color: "text-white/40" },
];

function getSignalConfig(type: string) {
  return SIGNAL_TYPES.find(s => s.value === type) ?? SIGNAL_TYPES[SIGNAL_TYPES.length - 1]!;
}

function signalBadgeClass(type: string): string {
  const map: Record<string, string> = {
    regulatory_change:   "bg-amber-500/15 text-amber-300 border-amber-500/30",
    new_rulemaking:      "bg-blue-500/15 text-blue-300 border-blue-500/30",
    procurement_forecast:"bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    expiring_contract:   "bg-orange-500/15 text-orange-300 border-orange-500/30",
    enforcement_action:  "bg-red-500/15 text-red-300 border-red-500/30",
    budget_funding:      "bg-purple-500/15 text-purple-300 border-purple-500/30",
    grant_program:       "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    state_procurement:   "bg-sky-500/15 text-sky-300 border-sky-500/30",
    industry_trend:      "bg-violet-500/15 text-violet-300 border-violet-500/30",
    other:               "bg-white/5 text-white/40 border-white/10",
  };
  return map[type] ?? map["other"]!;
}

function cleanSummary(summary: string | null): string | null {
  if (!summary) return null;
  const cleaned = summary
    .split(/
/)
    .filter(line => !line.trim().startsWith("https://api.sam.gov"))
    .join(" ")
    .replace(/Solicitation #N\/A\.?\s*/gi, "")
    .replace(/https?:\/\/api\.sam\.gov\S+/g, "")
    .trim();
  return cleaned.length > 10 ? cleaned : null;
}

function fmtDate(d: string | null) {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return null; }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function IntelligenceFeedPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Scope state: "federal" or a state code
  const [selectedScope, setSelectedScope] = useState<"federal" | string>("federal");
  const [signalFilter, setSignalFilter] = useState<SignalType | "all">("all");
  const [feedbackFilter, setFeedbackFilter] = useState<Feedback | "all">("new");
  const [page, setPage] = useState(1);
  const [fetchingScope, setFetchingScope] = useState<string | null>(null);
  const PAGE_SIZE = 24;

  const isFederal = selectedScope === "federal";
  const stateCode = isFederal ? undefined : selectedScope;
  const selectedStateName = ALL_STATES.find(s => s.code === selectedScope)?.name;

  // ── Query ─────────────────────────────────────────────────────────────────

  const queryKey = ["intel-feed", selectedScope, signalFilter, feedbackFilter, page];

  const { data, isLoading, isError } = useQuery<FeedResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        scope: isFederal ? "federal" : "state",
        ...(stateCode ? { stateCode } : {}),
        ...(signalFilter !== "all" ? { signalType: signalFilter } : {}),
        ...(feedbackFilter !== "all" ? { feedback: feedbackFilter } : {}),
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      const resp = await fetch(api(`intel-feed?${params}`));
      if (!resp.ok) throw new Error("Failed to load");
      return resp.json();
    },
    staleTime: 60_000,
  });

  // ── Fetch mutation ────────────────────────────────────────────────────────

  const fetchMutation = useMutation({
    mutationFn: async (scope: "federal" | string) => {
      const body = scope === "federal"
        ? { scope: "federal", dateRange: 30 }
        : { scope: "state", stateCode: scope, dateRange: 30 };
      const resp = await fetch(api("intel-feed/fetch"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error("Fetch failed");
      return resp.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["intel-feed"] });
      toast({
        title: "Intelligence fetched",
        description: `Found ${data.fetched} signals. ${data.created} new, ${data.updated} updated.`,
      });
      setFetchingScope(null);
    },
    onError: () => {
      toast({ variant: "destructive", title: "Fetch failed", description: "Could not pull latest intel." });
      setFetchingScope(null);
    },
  });

  const handleFetch = (scope: "federal" | string) => {
    setFetchingScope(scope);
    fetchMutation.mutate(scope);
  };

  // ── Feedback mutation ─────────────────────────────────────────────────────

  const feedbackMutation = useMutation({
    mutationFn: async ({ id, feedback }: { id: string; feedback: Feedback }) => {
      const resp = await fetch(api(`intel-feed/${id}/feedback`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      if (!resp.ok) throw new Error("Feedback failed");
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intel-feed"] });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to save feedback" });
    },
  });

  const handleFeedback = (id: string, fb: Feedback) => {
    feedbackMutation.mutate({ id, feedback: fb });
  };

  // ── Scope change ──────────────────────────────────────────────────────────

  const handleScopeChange = useCallback((val: string) => {
    setSelectedScope(val);
    setPage(1);
    setSignalFilter("all");
    setFeedbackFilter("new");
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const items = data?.items ?? [];
  const totalPages = data?.pages ?? 1;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex-none border-b border-white/8 bg-background/60 backdrop-blur-xl px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Rss className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-white leading-tight">Intelligence Feed</h1>
              <p className="text-xs text-muted-foreground">
                {isFederal ? "Federal signals" : `${selectedStateName} signals`}
                {data ? ` — ${data.total.toLocaleString()} items` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Scope selector */}
            <Select value={selectedScope} onValueChange={handleScopeChange}>
              <SelectTrigger className="h-8 w-[180px] text-xs bg-white/5 border-white/10 text-white">
                <MapPin className="w-3.5 h-3.5 mr-1 text-primary" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-white/10 max-h-72 overflow-y-auto">
                <SelectItem value="federal" className="text-xs text-white/90">🇺🇸 Federal</SelectItem>
                {ALL_STATES.map(s => (
                  <SelectItem key={s.code} value={s.code} className="text-xs text-white/80">
                    {s.code} — {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Signal type filter */}
            <Select value={signalFilter} onValueChange={(v) => { setSignalFilter(v as any); setPage(1); }}>
              <SelectTrigger className="h-8 w-[180px] text-xs bg-white/5 border-white/10 text-white">
                <Filter className="w-3.5 h-3.5 mr-1 text-white/50" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-white/10">
                {SIGNAL_TYPES.map(s => (
                  <SelectItem key={s.value} value={s.value} className="text-xs text-white/80">
                    <span className="flex items-center gap-2">
                      <span className={s.color}>{s.icon}</span>
                      {s.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Feedback filter */}
            <Select value={feedbackFilter} onValueChange={(v) => { setFeedbackFilter(v as any); setPage(1); }}>
              <SelectTrigger className="h-8 w-[130px] text-xs bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-white/10">
                <SelectItem value="all"       className="text-xs text-white/80">All items</SelectItem>
                <SelectItem value="new"       className="text-xs text-white/80">New only</SelectItem>
                <SelectItem value="saved"     className="text-xs text-white/80">Saved</SelectItem>
                <SelectItem value="dismissed" className="text-xs text-white/80">Dismissed</SelectItem>
              </SelectContent>
            </Select>

            {/* Fetch button */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
              onClick={() => handleFetch(selectedScope)}
              disabled={fetchingScope === selectedScope}
            >
              {fetchingScope === selectedScope
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              }
              {fetchingScope === selectedScope ? "Fetching…" : "Fetch latest"}
            </Button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isLoading && (
          <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading intelligence…</span>
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center py-24 gap-2 text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">Failed to load feed. Try refreshing.</span>
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
            <Rss className="w-8 h-8 opacity-20" />
            <p className="text-sm">No signals yet for this view.</p>
            <Button
              size="sm" variant="outline"
              className="text-xs border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => handleFetch(selectedScope)}
              disabled={fetchingScope === selectedScope}
            >
              {fetchingScope === selectedScope
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Fetching…</>
                : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Pull signals now</>
              }
            </Button>
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <IntelCard
                    key={item.id}
                    item={item}
                    onFeedback={handleFeedback}
                    isMutating={feedbackMutation.isPending}
                  />
                ))}
              </AnimatePresence>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs border-white/10 text-white/60"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >Previous</Button>
                <span className="text-xs text-muted-foreground px-2">
                  Page {page} of {totalPages}
                </span>
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs border-white/10 text-white/60"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >Next</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Intel Card ────────────────────────────────────────────────────────────────

interface IntelCardProps {
  item: IntelItem;
  onFeedback: (id: string, fb: Feedback) => void;
  isMutating: boolean;
}

function IntelCard({ item, onFeedback, isMutating }: IntelCardProps) {
  const signal = getSignalConfig(item.signalType);
  const isSaved = item.feedback === "saved";
  const isDismissed = item.feedback === "dismissed";
  const date = fmtDate(item.publishedDate);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: isDismissed ? 0.35 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={[
        "group relative flex flex-col rounded-xl border bg-card/50 backdrop-blur-sm p-4 gap-3",
        "transition-all duration-200 hover:bg-card/80",
        isSaved
          ? "border-primary/40 ring-1 ring-primary/20"
          : isDismissed
          ? "border-white/5 opacity-40"
          : "border-white/8 hover:border-white/15",
      ].join(" ")}
    >
      {/* Signal type badge + score */}
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border ${signalBadgeClass(item.signalType)}`}>
          <span className={signal.color}>{signal.icon}</span>
          {signal.label}
        </span>
        <div className="flex items-center gap-1.5">
          {item.relevanceScore >= 70 && (
            <span className="text-[9px] text-emerald-400/80 font-medium bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5">
              High relevance
            </span>
          )}
          {isSaved && (
            <span className="text-[9px] text-primary/80 font-medium bg-primary/10 border border-primary/20 rounded-full px-1.5 py-0.5 flex items-center gap-1">
              <Check className="w-2.5 h-2.5" />Saved
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-white/90 leading-snug line-clamp-2 flex-1">
        {item.title}
      </h3>

      {/* Agency + date */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
        {item.agency && (
          <span className="flex items-center gap-1 truncate max-w-[180px]">
            <Building2 className="w-3 h-3 flex-shrink-0" />
            {item.agency}
          </span>
        )}
        {date && (
          <span className="ml-auto flex-shrink-0">{date}</span>
        )}
      </div>

      {/* Summary */}
      {cleanSummary(item.summary) && (
        <p className="text-xs text-white/55 leading-relaxed line-clamp-3">
          {cleanSummary(item.summary)}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 mt-auto">
        {item.sourceUrl && (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            View source
          </a>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Dismiss */}
          <button
            onClick={() => onFeedback(item.id, isDismissed ? "new" : "dismissed")}
            disabled={isMutating}
            className={[
              "h-7 w-7 rounded-lg border flex items-center justify-center transition-all",
              isDismissed
                ? "border-red-500/40 bg-red-500/15 text-red-400"
                : "border-white/10 text-white/30 hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10",
            ].join(" ")}
            title={isDismissed ? "Undo dismiss" : "Dismiss"}
          >
            <X className="w-3.5 h-3.5" />
          </button>

          {/* Save */}
          <button
            onClick={() => onFeedback(item.id, isSaved ? "new" : "saved")}
            disabled={isMutating}
            className={[
              "h-7 w-7 rounded-lg border flex items-center justify-center transition-all",
              isSaved
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-white/10 text-white/30 hover:border-primary/30 hover:text-primary hover:bg-primary/10",
            ].join(" ")}
            title={isSaved ? "Unsave" : "Save"}
          >
            <Bookmark className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
