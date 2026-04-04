import { useState } from "react";
import { AgencyLogo } from "@/components/company-logo";
import { motion, AnimatePresence } from "framer-motion";
import {
  Landmark, RefreshCw, AlertCircle, Loader2, ExternalLink,
  TrendingUp, Shield, FileText, Users, Briefcase, Globe,
  Activity, DollarSign, Gavel, ChevronDown, Check,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionTag = "monitor" | "pursue" | "brief" | "contact" | "wait";
type Bucket =
  | "forecast"
  | "recompete-watch"
  | "agency-pain"
  | "policy-radar"
  | "incumbent-tracker"
  | "leadership-org"
  | "deployment-medical"
  | "budget-funding"
  | "protest-litigation";

interface IntelItem {
  id: string;
  bucket: Bucket;
  sourceType: string;
  agency: string | null;
  component: string | null;
  office: string | null;
  regionCountry: string | null;
  title: string;
  summary: string | null;
  datePosted: string | null;
  status: string | null;
  contractorIncumbent: string | null;
  relatedRef: string | null;
  budgetSignal: string | null;
  oversightSignal: string | null;
  medicalTravelRelevance: string | null;
  occuMedScore: number;
  actionTag: ActionTag;
  sourceUrl: string | null;
  fetchedAt: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

const BUCKETS: { id: Bucket; label: string; icon: React.ReactNode; description: string }[] = [
  { id: "forecast",           label: "Forecast",        icon: <TrendingUp className="w-4 h-4" />,  description: "Pre-solicitation notices and procurement forecasts" },
  { id: "recompete-watch",    label: "Recompete Watch", icon: <RefreshCw className="w-4 h-4" />,   description: "Expiring contracts approaching recompete window" },
  { id: "agency-pain",        label: "Agency Pain",     icon: <AlertCircle className="w-4 h-4" />, description: "OIG/GAO oversight findings, audit failures" },
  { id: "policy-radar",       label: "Policy Radar",    icon: <FileText className="w-4 h-4" />,    description: "Federal Register rules and FAR/DFARS policy shifts" },
  { id: "incumbent-tracker",  label: "Incumbents",      icon: <Briefcase className="w-4 h-4" />,   description: "Current contract holders at priority agencies" },
  { id: "leadership-org",     label: "Leadership",      icon: <Users className="w-4 h-4" />,       description: "Senior hires, org changes at target agencies" },
  { id: "deployment-medical", label: "Deploy/Medical",  icon: <Globe className="w-4 h-4" />,       description: "CDC travel health notices and State Dept advisories" },
  { id: "budget-funding",     label: "Budget",          icon: <DollarSign className="w-4 h-4" />,  description: "CBJ documents and OMB budget signals" },
  { id: "protest-litigation", label: "Protests",        icon: <Gavel className="w-4 h-4" />,       description: "GAO bid protest decisions and recent awards" },
];

const PRIORITY_AGENCIES = [
  "DoD", "State", "DHS", "CBP", "ICE", "USCIS", "DOJ/BOP",
  "HHS", "OPM", "DOL/OSHA", "FMCSA", "FAA",
];

const AGENCY_DOMAIN: Record<string, string> = {
  "dod":      "defense.gov",
  "state":    "state.gov",
  "dhs":      "dhs.gov",
  "cbp":      "cbp.gov",
  "ice":      "ice.gov",
  "uscis":    "uscis.gov",
  "doj/bop":  "justice.gov",
  "hhs":      "hhs.gov",
  "opm":      "opm.gov",
  "dol/osha": "osha.gov",
  "fmcsa":    "fmcsa.dot.gov",
  "faa":      "faa.gov",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function actionTagStyle(tag: ActionTag) {
  switch (tag) {
    case "pursue":  return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "brief":   return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "contact": return "bg-blue-500/15 text-blue-300 border-blue-500/30";
    case "monitor": return "bg-white/10 text-white/60 border-white/15";
    case "wait":    return "bg-white/5 text-white/35 border-white/10";
  }
}

function scoreColor(score: number) {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 45) return "bg-amber-500";
  return "bg-white/20";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
}

function isPriorityAgency(agency: string | null, component: string | null): boolean {
  if (!agency && !component) return false;
  const text = `${agency ?? ""} ${component ?? ""}`.toLowerCase();
  return [
    "defense", "department of defense", "dod",
    "state department", "department of state",
    "homeland security", "dhs", "cbp", "customs and border", "ice", "uscis", "immigration",
    "department of justice", "bureau of prisons", "bop",
    "health and human services", "hhs",
    "office of personnel management", "opm",
    "department of labor", "osha",
    "fmcsa", "federal motor carrier",
    "federal aviation", "faa",
  ].some(kw => text.includes(kw));
}

function getApiBase(): string {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api`;
}

// ── Intel Card ────────────────────────────────────────────────────────────────

function IntelCard({ item, onTagChange }: { item: IntelItem; onTagChange: (id: string, tag: ActionTag) => void }) {
  const priority = isPriorityAgency(item.agency, item.component);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className={`glass-panel rounded-2xl border p-4 flex flex-col gap-3 ${priority ? "border-primary/30 bg-primary/5" : "border-white/10"}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {priority && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
              Priority
            </span>
          )}
          {item.agency && (
            <Badge variant="outline" className="text-[11px] bg-white/5 border-white/15 text-white/70 font-medium">
              {item.agency}
            </Badge>
          )}
          {item.component && item.component !== item.agency && (
            <span className="text-[11px] text-white/40">{item.component}</span>
          )}
          <Badge variant="outline" className="text-[10px] bg-white/5 border-white/10 text-white/40 uppercase tracking-wide">
            {item.sourceType.replace(/_/g, " ")}
          </Badge>
        </div>
        <span className="text-[11px] text-white/40 whitespace-nowrap flex-shrink-0">{formatDate(item.datePosted)}</span>
      </div>

      {/* Title + summary */}
      <div>
        <p className="text-sm font-medium text-white leading-snug line-clamp-2">{item.title}</p>
        {item.office && (
          <p className="text-[11px] text-white/40 mt-0.5">{item.office}</p>
        )}
        {item.summary && (
          <p className="text-xs text-white/50 mt-1 leading-relaxed line-clamp-3">{item.summary}</p>
        )}
      </div>

      {/* Signal badges */}
      <div className="flex flex-wrap gap-1.5">
        {item.contractorIncumbent && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300">
            Incumbent: {item.contractorIncumbent.slice(0, 30)}
          </span>
        )}
        {item.budgetSignal && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
            {item.budgetSignal}
          </span>
        )}
        {item.oversightSignal && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-300">
            {item.oversightSignal}
          </span>
        )}
        {item.medicalTravelRelevance && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
            {item.medicalTravelRelevance}
          </span>
        )}
        {item.relatedRef && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40 font-mono">
            {item.relatedRef.slice(0, 24)}
          </span>
        )}
        {item.regionCountry && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-300">
            {item.regionCountry}
          </span>
        )}
      </div>

      {/* Score bar + action tag */}
      <div className="flex items-center gap-3 mt-auto">
        {/* Score */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] text-white/40 uppercase tracking-wide whitespace-nowrap">Relevance</span>
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${scoreColor(item.occuMedScore ?? 0)}`}
              style={{ width: `${item.occuMedScore ?? 0}%` }}
            />
          </div>
          <span className="text-[11px] text-white/60 font-mono w-6 text-right">{item.occuMedScore ?? 0}</span>
        </div>

        {/* Action tag */}
        <Select
          value={item.actionTag}
          onValueChange={(v) => onTagChange(item.id, v as ActionTag)}
        >
          <SelectTrigger className={`h-7 text-[11px] px-2.5 border rounded-lg w-[100px] font-medium ${actionTagStyle(item.actionTag)}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-white/10 text-white text-xs">
            {(["pursue", "contact", "brief", "monitor", "wait"] as ActionTag[]).map((tag) => (
              <SelectItem key={tag} value={tag} className="capitalize">
                <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium ${actionTagStyle(tag)}`}>
                  {tag}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Source link */}
        {item.sourceUrl && (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </motion.div>
  );
}

// ── Bucket Tab ────────────────────────────────────────────────────────────────

function BucketTab({
  bucket,
  agencyFilter,
}: {
  bucket: Bucket;
  agencyFilter: string | null;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const apiBase = getApiBase();

  const { data, isLoading, error } = useQuery<{ items: IntelItem[] }>({
    queryKey: ["federal-intel", bucket],
    queryFn: async () => {
      const resp = await fetch(`${apiBase}/federal-intel/${bucket}`);
      if (!resp.ok) throw new Error(`Failed to load ${bucket}`);
      return resp.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const resp = await fetch(`${apiBase}/federal-intel/${bucket}/refresh`, { method: "POST" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Refresh failed" }));
        throw new Error(err.error ?? "Refresh failed");
      }
      return resp.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["federal-intel", bucket] });
      const sourceSummary = (result.sources as { source: string; count: number; ok: boolean }[] | undefined)
        ?.map(s => `${s.source.replace(/_/g, " ")}: ${s.count}`)
        .join(" · ") ?? "";
      toast({
        title: "Refreshed",
        description: `${result.count ?? 0} items fetched.${sourceSummary ? " " + sourceSummary : ""}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    },
  });

  const tagMutation = useMutation({
    mutationFn: async ({ id, actionTag }: { id: string; actionTag: ActionTag }) => {
      const resp = await fetch(`${apiBase}/federal-intel/${id}/tag`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionTag }),
      });
      if (!resp.ok) throw new Error("Failed to update tag");
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["federal-intel", bucket] });
    },
    onError: () => {
      toast({ title: "Failed to save tag", variant: "destructive" });
    },
  });

  const allItems = data?.items ?? [];
  let items = allItems;
  let filterActive = false;

  // Filter by agency chip if selected — soft filter: fall back to all items if no matches
  if (agencyFilter) {
    const kw = agencyFilter.toLowerCase();
    const agencyKeyMap: Record<string, string[]> = {
      "dod":      ["defense", "department of defense", "dept of defense", "army", "navy", "air force", "marine", "pentagon"],
      "state":    ["state department", "department of state", "dept of state"],
      "dhs":      ["homeland security", "dhs"],
      "cbp":      ["customs and border", "cbp"],
      "ice":      ["ice", "immigration and customs"],
      "uscis":    ["uscis", "citizenship and immigration"],
      "doj/bop":  ["justice", "bureau of prisons", "bop", "dept of justice"],
      "hhs":      ["health and human services", "hhs", "dept of health"],
      "opm":      ["personnel management", "opm"],
      "dol/osha": ["labor", "osha", "dept of labor"],
      "fmcsa":    ["motor carrier", "fmcsa"],
      "faa":      ["federal aviation", "faa"],
    };
    const keywords = agencyKeyMap[kw] ?? [kw];
    const filtered = allItems.filter((item) => {
      const text = `${item.agency ?? ""} ${item.component ?? ""} ${item.title ?? ""}`.toLowerCase();
      return keywords.some(k => text.includes(k));
    });
    // Only apply filter if it actually narrows results; otherwise show all
    if (filtered.length > 0) {
      items = filtered;
      filterActive = true;
    }
  }

  const isEmpty = !isLoading && !error && items.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Tab toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/50">
          {allItems.length
            ? `${items.length} item${items.length !== 1 ? "s" : ""}${filterActive ? ` matching ${agencyFilter}` : agencyFilter ? ` (no ${agencyFilter} items — showing all)` : ""}`
            : "No data yet — click Refresh to fetch live sources"}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white gap-2"
        >
          {refreshMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {refreshMutation.isPending ? "Fetching…" : "Refresh"}
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-white/40 gap-3">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-300 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {(error as Error).message}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center gap-4"
        >
          <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Activity className="w-6 h-6 text-white/20" />
          </div>
          <div>
            <p className="text-white/50 text-sm">No items in this bucket yet.</p>
            <p className="text-white/30 text-xs mt-1">Click Refresh to pull live data from public sources.</p>
          </div>
        </motion.div>
      )}

      {/* Cards grid */}
      {items.length > 0 && (
        <motion.div
          layout
          className="grid grid-cols-1 xl:grid-cols-2 gap-3"
        >
          <AnimatePresence mode="popLayout">
            {items.map((item) => (
              <IntelCard
                key={item.id}
                item={item}
                onTagChange={(id, tag) => tagMutation.mutate({ id, actionTag: tag })}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FederalAgenciesPage() {
  const [activeBucket, setActiveBucket] = useState<Bucket>("forecast");
  const [agencyFilter, setAgencyFilter] = useState<string | null>(null);

  const activeDef = BUCKETS.find(b => b.id === activeBucket)!;

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-white tracking-tight">Federal Agencies</h1>
        <p className="text-muted-foreground mt-1 text-base">
          9-bucket intelligence workspace — procurement forecasts, recompetes, oversight, policy, incumbents, leadership, deployment, budget, and protests.
        </p>
      </div>

      {/* Priority agency filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setAgencyFilter(null)}
          className={`text-[11px] font-medium px-3 py-1 rounded-full border transition-all ${
            agencyFilter === null
              ? "bg-primary/15 border-primary/40 text-primary"
              : "bg-white/5 border-white/10 text-white/50 hover:text-white/80 hover:border-white/20"
          }`}
        >
          All Agencies
        </button>
        {PRIORITY_AGENCIES.map((a) => {
          const key = a.toLowerCase();
          const domain = AGENCY_DOMAIN[key];
          const isActive = agencyFilter === key;
          return (
            <button
              key={a}
              onClick={() => setAgencyFilter(isActive ? null : key)}
              className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                isActive
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-white/5 border-white/10 text-white/50 hover:text-white/80 hover:border-white/20"
              }`}
            >
              {domain && <AgencyLogo domain={domain} label={a} size={14} />}
              {a}
            </button>
          );
        })}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {BUCKETS.map((b) => (
          <button
            key={b.id}
            onClick={() => setActiveBucket(b.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
              activeBucket === b.id
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-white/5 border-white/10 text-white/50 hover:text-white/80 hover:bg-white/8 hover:border-white/15"
            }`}
          >
            {b.icon}
            {b.label}
          </button>
        ))}
      </div>

      {/* Active bucket content */}
      <motion.div
        key={activeBucket}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex-1 min-h-0"
      >
        <div className="glass-panel rounded-2xl border border-white/10 p-5">
          {/* Bucket description */}
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/8">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              {activeDef.icon}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{activeDef.label}</p>
              <p className="text-xs text-white/40">{activeDef.description}</p>
            </div>
          </div>

          <BucketTab bucket={activeBucket} agencyFilter={agencyFilter} />
        </div>
      </motion.div>
    </div>
  );
}
