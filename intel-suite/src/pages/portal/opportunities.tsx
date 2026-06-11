import { useState } from "react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Filter,
  DownloadCloud,
  Upload,
  ExternalLink,
  Trash2,
  Loader2,
  FileSpreadsheet,
  AlertCircle,
  Clock,
  Sparkles,
  Brain,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import {
  useListOpportunities,
  useGetSettings,
  useFetchOpportunities,
  useImportOpportunitiesFromCsv,
  useDeleteOpportunity,
  getListOpportunitiesQueryKey,
  useListProviders,
} from "@workspace/api-client-react";

type FeedbackGrade = "excellent" | "good" | "poor" | "spam";

interface GradeConfig {
  grade: FeedbackGrade;
  label: string;
  short: string;
}

const GRADE_CONFIGS: GradeConfig[] = [
  { grade: "excellent", label: "Excellent fit", short: "Excellent" },
  { grade: "good", label: "Good fit", short: "Good" },
  { grade: "poor", label: "Poor fit", short: "Poor" },
  { grade: "spam", label: "Not relevant", short: "N/A" },
];

const FETCH_PROVIDER_OPTIONS = [
  { key: "sam_gov", label: "SAM.gov", desc: "Federal solicitations", stub: false },
  { key: "grantsGov", label: "Grants.gov", desc: "Federal grants & programs", stub: false },
  { key: "usaSpending", label: "USASpending", desc: "Expiring contracts / re-competes", stub: false },
  { key: "serper", label: "Serper", desc: "Web search", stub: false },
  { key: "tavily", label: "Tavily", desc: "Deep AI research", stub: false },
  { key: "exa", label: "Exa", desc: "Semantic search", stub: false },
  { key: "jina", label: "Jina AI", desc: "URL extraction", stub: false },
  { key: "gemini", label: "Gemini AI", desc: "AI scoring", stub: false },
  { key: "groq", label: "Groq", desc: "Fast AI scoring", stub: false },
  { key: "openrouter", label: "OpenRouter", desc: "Multi-model AI", stub: false },
  { key: "statePortals", label: "State Portals", desc: "State & regional portals", stub: false },
  { key: "olostep", label: "Olostep", desc: "Web crawling", stub: false },
  { key: "browseAi", label: "Browse AI", desc: "Automated extraction", stub: false },
  { key: "firecrawl", label: "Firecrawl", desc: "Deep crawling", stub: false },
  { key: "you", label: "You.com", desc: "AI web search", stub: false },
  { key: "langsearch", label: "Langsearch", desc: "LLM search", stub: false },
  { key: "websearch", label: "WebSearch", desc: "Broad web search", stub: false },
  { key: "minimax", label: "Minimax AI", desc: "AI scoring", stub: false },
  { key: "tango", label: "Tango", desc: "Federal procurement opportunities", stub: false },
  { key: "bidnet", label: "BidNet", desc: "Pending direct API", stub: true },
];

export default function OpportunitiesDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "archived">("active");
  const [type, setType] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const [isFetchOpen, setIsFetchOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  const [fetchQuery, setFetchQuery] = useState("");
  const [fetchDays, setFetchDays] = useState("30");
  // grantsGov + usaSpending are free (no key) and fully implemented — enable them by
  // default so a stock fetch pulls federal grants and expiring/re-compete contracts too.
  const [fetchProviders, setFetchProviders] = useState<string[]>(["sam_gov", "grantsGov", "usaSpending", "serper", "tavily", "statePortals"]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [gradingIds, setGradingIds] = useState<Set<string>>(new Set());

  const { data: settings } = useGetSettings();
  const { data: providersData } = useListProviders();

  const { data: oppsData, isLoading: isLoadingOpps } = useListOpportunities({
    search: search || undefined,
    status: status !== "all" ? status as any : undefined,
    type: type !== "all" ? type : undefined,
    source: sourceFilter !== "all" ? sourceFilter : undefined,
    dateRange: dateFilter !== "all" ? Number(dateFilter) : undefined,
    page,
    limit: PAGE_SIZE,
  });

  const handleGrade = async (opportunityId: string, grade: FeedbackGrade) => {
    setGradingIds((prev) => new Set(prev).add(opportunityId));
    try {
      const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const resp = await fetch(`${baseUrl}/api/opportunities/${opportunityId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit grade");
      }
      queryClient.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() });
      toast({ title: "Grade saved", description: `Marked as ${grade}. The model is learning.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Grade failed", description: err.message });
    } finally {
      setGradingIds((prev) => {
        const next = new Set(prev);
        next.delete(opportunityId);
        return next;
      });
    }
  };

  const fetchMutation = useFetchOpportunities({
    mutation: {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() });
        setIsFetchOpen(false);
        const providerErrors: string[] = (data.providers ?? []).flatMap((p: any) => p.errors ?? []).filter(Boolean);
        const totalSaved = (data.created ?? 0) + (data.updated ?? 0);

        if (totalSaved > 0) {
          toast({
            title: "Intelligence Fetched",
            description: `Found ${data.fetched} opportunities. Added ${data.created}, updated ${data.updated}.${providerErrors.length > 0 ? " Some providers used fallback mode." : ""}`,
          });
          if (providerErrors.length > 0) {
            const quotaMsg = providerErrors.find((e) => e.includes("quota") || e.includes("rate limit") || e.includes("fallback"));
            if (quotaMsg) {
              setTimeout(() => toast({ title: "Provider Notice", description: quotaMsg.slice(0, 140), variant: "default" }), 600);
            }
          }
        } else if (providerErrors.length > 0) {
          toast({ variant: "destructive", title: "Fetch Issue", description: providerErrors[0] });
        } else {
          toast({ title: "Fetch Complete", description: `Fetched ${data.fetched} records. Added ${data.created}, updated ${data.updated}.` });
        }
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Fetch Failed", description: err.error || err.message || "Failed to fetch from configured sources" });
      },
    },
  });

  const importMutation = useImportOpportunitiesFromCsv({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() });
        setIsImportOpen(false);
        setImportFile(null);
        toast({ title: "Import Complete", description: `Successfully imported ${data.imported} records. Skipped ${data.skipped}.` });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Import Failed", description: err.error || "Failed to import CSV" });
      },
    },
  });

  const deleteMutation = useDeleteOpportunity({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() });
        toast({ title: "Opportunity deleted" });
      },
    },
  });

  const handleOpenFetch = () => {
    setFetchQuery(settings?.defaultKeywords || "");
    setFetchDays(settings?.defaultDateRange?.toString() || "30");
    setIsFetchOpen(true);
  };

  const handleEnrich = async () => {
    setIsEnriching(true);
    try {
      const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const resp = await fetch(`${baseUrl}/api/opportunities/enrich`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Enrichment failed");
      queryClient.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() });
      toast({
        title: "Enrichment Complete",
        description: `Updated ${data.enriched} records. Agencies: ${data.agencyUpdated}, Deadlines: ${data.deadlineUpdated}, Values: ${data.valueUpdated}.${data.errors?.length ? " Some URLs couldn't be extracted." : ""}`,
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Enrichment Failed", description: err.message });
    } finally {
      setIsEnriching(false);
    }
  };

  const handlePurgeJunk = async () => {
    if (!confirm("This will scan all records in the database and permanently delete any that don't match Occu-Med service lines. Continue?")) return;
    setIsPurging(true);
    try {
      const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const resp = await fetch(`${baseUrl}/api/opportunities/purge-junk`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Purge failed");
      queryClient.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() });
      toast({
        title: "🧹 Junk Purged",
        description: `Scanned ${data.scanned} records. Deleted ${data.deleted} junk entries. Kept ${data.kept} valid opportunities.`,
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Purge Failed", description: err.message });
    } finally {
      setIsPurging(false);
    }
  };

  const toggleFetchProvider = (key: string) => {
    setFetchProviders((prev) => prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]);
  };

  const handleFetchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMutation.mutate({
      data: {
        keywords: fetchQuery.trim(),
        dateRange: parseInt(fetchDays, 10),
        providers: fetchProviders.length > 0 ? fetchProviders : undefined,
      },
    });
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;
    importMutation.mutate({ data: { file: importFile } });
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return "—";
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
    return `$${amount}`;
  };

  const stripMarkdown = (text: string) =>
    text.replace(/#+\s*/g, "").replace(/\*+/g, "").replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();

  const extractAgencyHint = (title: string): string | null => {
    const t = title.replace(/^\[PDF\]\s*/i, "").replace(/^\[DOC\]\s*/i, "").trim();
    const patterns = [
      /\bCity of ([A-Z][a-zA-Z\s]{2,30}?)(?:\s+(?:RFP|Request|Bid|Contract|for|–|-)|$)/,
      /\bCounty of ([A-Z][a-zA-Z\s]{2,20}?)(?:\s+(?:RFP|Request|Bid|Contract|for|–|-)|$)/,
      /\b([A-Z][a-zA-Z]{2,20} County)\b/,
      /\b([A-Z][a-zA-Z]{2,20} City)\b/,
      /\bState of ([A-Z][a-zA-Z]{3,20})\b/,
      /^([A-Z][a-zA-Z]{3,30}(?:\s+[A-Z][a-zA-Z]{2,20})?)(?:\s+[-–]|\s+RFP|\s+Request)/,
    ];
    for (const p of patterns) {
      const m = t.match(p)?.[1]?.trim();
      if (m && m.length >= 3 && m.length <= 40 && !/^(Request|Bid|Contract|For|The|And|Or|Of)$/i.test(m)) return m;
    }
    return null;
  };

  const getSourceBadge = (source: string | null | undefined, name: string | null | undefined) => {
    const rawName = name || source || "manual";
    // Normalize providerName keys to display labels
    const providerLabelMap: Record<string, string> = {
      statePortals: "State Portals",
      samGov: "SAM.gov",
      sam_gov: "SAM.gov",
      serper: "Serper",
      tavily: "Tavily",
      gemini: "Gemini",
      exa: "Exa",
      firecrawl: "Firecrawl",
      manual: "Manual",
    };
    if (providerLabelMap[rawName]) {
      const colorMap: Record<string, string> = {
        statePortals: "bg-blue-500/10 text-blue-300 border-blue-500/20",
        samGov: "bg-amber-500/10 text-amber-300 border-amber-500/20",
        sam_gov: "bg-amber-500/10 text-amber-300 border-amber-500/20",
        serper: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
        tavily: "bg-pink-500/10 text-pink-300 border-pink-500/20",
        gemini: "bg-purple-500/10 text-purple-300 border-purple-500/20",
        exa: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
        firecrawl: "bg-orange-500/10 text-orange-300 border-orange-500/20",
        manual: "bg-slate-500/10 text-slate-300 border-slate-500/20",
      };
      return (
        <Badge className={"text-[10px] font-medium border " + (colorMap[rawName] ?? "bg-slate-500/10 text-slate-300 border-slate-500/20")}>
          {providerLabelMap[rawName]}
        </Badge>
      );
    }
    const displayNames: Record<string, string> = {
      sam_gov: "SAM.gov",
      samGov: "SAM.gov",
      statePortals: "State Portals",
      serper: "Serper",
      tavily: "Tavily",
      exa: "Exa",
      you: "You.com",
      langsearch: "Langsearch",
      websearch: "WebSearch",
      tango: "Tango",
      bidnet: "BidNet",
      csv_import: "CSV Import",
      manual: "Manual",
      gemini: "Gemini AI",
    };
    const displayName = displayNames[rawName] ?? (rawName.charAt(0).toUpperCase() + rawName.slice(1));
    const colors: Record<string, string> = {
      sam_gov: "bg-blue-500/10 text-blue-300 border-blue-500/20",
      samGov: "bg-blue-500/10 text-blue-300 border-blue-500/20",
      statePortals: "bg-violet-500/10 text-violet-300 border-violet-500/20",
      serper: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
      tavily: "bg-pink-500/10 text-pink-300 border-pink-500/20",
      exa: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
      you: "bg-sky-500/10 text-sky-300 border-sky-500/20",
      langsearch: "bg-purple-500/10 text-purple-300 border-purple-500/20",
      websearch: "bg-teal-500/10 text-teal-300 border-teal-500/20",
      tango: "bg-orange-500/10 text-orange-300 border-orange-500/20",
      bidnet: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
      csv_import: "bg-white/5 text-muted-foreground border-white/10",
      manual: "bg-white/5 text-muted-foreground border-white/10",
    };

    return <Badge variant="outline" className={`font-normal ${colors[rawName] || "bg-white/5 text-muted-foreground border-white/10"}`}>{displayName}</Badge>;
  };

  const getOpportunityUrl = (opp: any) => opp.samUrl || opp.sourceUrl || opp.url || null;
  const getAgency = (opp: any) => opp.agency === "Unknown" ? (extractAgencyHint(opp.title) ?? "—") : (opp.agency ?? "—");
  const opportunities = oppsData?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Opportunities</h1>
          <p className="text-muted-foreground mt-1">Review active procurement leads in a cleaner card layout.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="bg-background/50 backdrop-blur-md border-white/10 hover:bg-white/5 hover:text-white" onClick={() => setIsImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import CSV
          </Button>
          <Button variant="outline" className="bg-background/50 backdrop-blur-md border-white/10 hover:bg-white/5 hover:text-white" onClick={handleEnrich} disabled={isEnriching} title="Backfill missing Agency, Due Date, and Value by extracting full page content">
            {isEnriching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {isEnriching ? "Enriching..." : "Re-enrich"}
          </Button>
          <Button variant="outline" className="bg-red-500/10 border-red-500/25 text-red-300 hover:bg-red-500/20 hover:text-red-200 backdrop-blur-md" onClick={handlePurgeJunk} disabled={isPurging} title="Permanently delete all records that don't match Occu-Med service lines">
            {isPurging ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <span className="mr-2 text-sm">🧹</span>}
            {isPurging ? "Purging..." : "Purge Junk"}
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20" onClick={handleOpenFetch}>
            <DownloadCloud className="w-4 h-4 mr-2" /> Fetch Intelligence
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-2 glass-panel rounded-full overflow-x-auto no-scrollbar">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold whitespace-nowrap">Active Sources:</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSourceFilter("all"); setPage(1); }}
            className={"flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap border transition-all " + (sourceFilter === "all" ? "bg-primary/20 border-primary/40 text-primary font-bold" : "bg-white/5 border-white/10 text-white/60 hover:text-white/90 hover:bg-white/10")}
          >
            All
          </button>
          {providersData?.providers.map((p) => {
            const isStub = p.name === "bidnet";
            const dotClass = isStub ? "bg-amber-500/40 border border-amber-500/40" : p.status?.configured ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]" : "bg-white/20";
            const providerKey = p.name === "sam_gov" ? "samGov" : p.name;
            const isSelected = sourceFilter === providerKey;
            return (
              <button
                key={p.name}
                disabled={isStub}
                onClick={() => { if (!isStub) { setSourceFilter(isSelected ? "all" : providerKey); setPage(1); } }}
                className={"flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap border transition-all " + (isStub ? "opacity-40 cursor-not-allowed bg-white/5 border-white/10" : isSelected ? "bg-primary/20 border-primary/40 text-primary font-bold cursor-pointer" : "bg-white/5 border-white/10 hover:bg-white/10 cursor-pointer")}
                title={isStub ? "Pending direct API wiring" : p.status?.configured ? "Click to filter by " + p.displayName : "Not configured"}
              >
                <div className={"w-1.5 h-1.5 rounded-full " + dotClass} />
                <span className={isStub ? "text-white/40" : isSelected ? "" : "text-white/80"}>{p.displayName}</span>
                {isStub && <Clock className="w-2.5 h-2.5 text-amber-500/50" />}
              </button>
            );
          })}
        </div>
        {sourceFilter !== "all" && (
          <button
            onClick={() => { setSourceFilter("all"); setPage(1); }}
            className="ml-auto text-[10px] text-muted-foreground hover:text-white transition-colors whitespace-nowrap flex items-center gap-1 shrink-0"
          >
            ✕ Clear filter
          </button>
        )}
      </div>

      <div className="glass-panel rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by title, agency, or NAICS..." className="pl-9 bg-background/50 border-white/10 focus-visible:ring-primary/50 text-white" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Select value={status} onValueChange={(v: any) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[140px] bg-background/50 border-white/10 text-white"><div className="flex items-center gap-2"><Filter className="w-3 h-3 text-muted-foreground" /><SelectValue placeholder="Status" /></div></SelectTrigger>
            <SelectContent className="bg-popover border-white/10">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
            <SelectTrigger className="w-[160px] bg-background/50 border-white/10 text-white"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent className="bg-popover border-white/10">
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Solicitation">Solicitation</SelectItem>
              <SelectItem value="Presolicitation">Presolicitation</SelectItem>
              <SelectItem value="Award Notice">Award Notice</SelectItem>
              <SelectItem value="Sources Sought">Sources Sought</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[150px] bg-background/50 border-white/10 text-white"><div className="flex items-center gap-2"><Clock className="w-3 h-3 text-muted-foreground" /><SelectValue placeholder="Date" /></div></SelectTrigger>
            <SelectContent className="bg-popover border-white/10">
              <SelectItem value="all">Any Date</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>

        </div>
      </div>

      <div className="glass-panel rounded-2xl border border-white/10 p-4">
        {isLoadingOpps ? (
          <div className="p-16 text-center"><Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" /></div>
        ) : opportunities.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center">
            <AlertCircle className="w-12 h-12 mb-4 opacity-25" />
            <h3 className="text-lg font-medium text-white mb-2">No opportunities found</h3>
            <p className="max-w-sm text-sm">Try adjusting your filters or run Fetch Intelligence with a tighter query.</p>
          </div>
        ) : (
          <AnimatePresence>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {opportunities.map((opp: any, i: number) => {
                const href = getOpportunityUrl(opp);
                const urgent = opp.responseDeadline && new Date(opp.responseDeadline).getTime() - new Date().getTime() < 14 * 24 * 60 * 60 * 1000;
                const isGrading = gradingIds.has(opp.id);
                const rel = opp.relevance ?? null;
                // Per-card confidence band derived from the actual relevance score
                // (always meaningful), not the feedback model's flat/null userConfidence.
                const relConfidence: "high" | "medium" | "low" | null = rel?.confidence ?? null;
                const confTone = relConfidence === "high"
                  ? "text-emerald-300"
                  : relConfidence === "medium"
                    ? "text-sky-300"
                    : relConfidence === "low"
                      ? "text-amber-300"
                      : "text-white/85";
                const relScore = rel?.score ?? (typeof opp.relevanceScore === "number" ? Math.round(opp.relevanceScore) : null);
                const relTone = relScore == null ? "" : relScore >= 75
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"
                  : relScore >= 50
                    ? "bg-sky-500/10 text-sky-300 border-sky-500/25"
                    : "bg-amber-500/10 text-amber-300 border-amber-500/25";

                return (
                  <motion.article
                    key={opp.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ delay: Math.min(i * 0.025, 0.25) }}
                    className="group relative min-h-[310px] rounded-2xl border border-white/10 bg-white/[0.035] hover:bg-white/[0.055] hover:border-primary/30 transition-all duration-200 p-4 flex flex-col gap-4 shadow-lg shadow-black/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap gap-2 items-center">
                        {getSourceBadge(opp.source, opp.providerName)}
                        {relScore != null && (
                          <Badge variant="outline" className={`${relTone} font-semibold tabular-nums`} title="Occu-Med relevance score">
                            {relScore}% match
                          </Badge>
                        )}
                      </div>
                      <Badge variant="outline" className={opp.status === "active" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-white/5 text-muted-foreground border-white/10"}>{opp.status}</Badge>
                    </div>

                    <div className="space-y-2 flex-1">
                      <h3 className="text-sm font-semibold leading-snug text-white line-clamp-3 group-hover:text-primary transition-colors">
                        {opp.title}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                        {opp.description ? stripMarkdown(opp.description).slice(0, 240) : "No description available."}
                      </p>
                      {(rel?.reasons?.length || rel?.stale || rel?.dateUnknown) && (
                        <div className="flex flex-col gap-1 pt-0.5">
                          {rel?.reasons?.length > 0 && (
                            <div className="flex items-start gap-1 text-[10px] text-muted-foreground/90 leading-snug">
                              <Sparkles className="w-3 h-3 mt-px shrink-0 text-primary/60" />
                              <span className="line-clamp-2">{rel.reasons.slice(0, 2).join(" · ")}</span>
                            </div>
                          )}
                          {(rel?.stale || rel?.dateUnknown) && (
                            <div className="flex items-center gap-1 text-[10px] text-amber-300/90">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              {rel?.dateUnknown ? "Date unknown" : "May be a stale/older result"}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl border border-white/10 bg-black/15 p-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Agency</div>
                        <div className="mt-1 text-white/85 line-clamp-1">{getAgency(opp)}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/15 p-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Due</div>
                        <div className={`mt-1 ${urgent ? "text-amber-300 font-medium" : "text-white/85"}`}>
                          {opp.responseDeadline ? format(new Date(opp.responseDeadline), "MMM d, yyyy") : "—"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/15 p-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Value</div>
                        <div className="mt-1 text-white/85">{formatCurrency(opp.estimatedValue || opp.awardAmount)}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/15 p-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Posted</div>
                        <div className="mt-1 text-white/85">
                          {rel?.dateUnknown ? <span className="text-amber-300/80">Unknown</span> : (opp.postedDate ? format(new Date(opp.postedDate), "MMM d, yyyy") : "—")}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/15 p-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Confidence</div>
                        <div className={`mt-1 flex items-center gap-1 capitalize ${confTone}`}>
                          <Brain className="w-3 h-3 text-primary/70" /> {relConfidence ?? "—"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1 flex-wrap">
                        {GRADE_CONFIGS.map(({ grade, label, short }) => {
                          const isActive = opp.userGrade === grade;
                          return (
                            <button
                              key={grade}
                              title={label}
                              disabled={isGrading}
                              onClick={() => handleGrade(opp.id, grade)}
                              className={`px-2 py-1 rounded-md border text-[10px] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${isActive ? "bg-white/15 border-white/30 text-white font-medium" : "border-white/10 text-muted-foreground bg-transparent hover:bg-white/5 hover:text-white/80 hover:border-white/20"}`}
                            >
                              {isGrading && isActive ? <Loader2 className="w-3 h-3 animate-spin inline" /> : short}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-1">
                        {href && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-white/10 hover:text-white" asChild>
                            <a href={href} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" /></a>
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-destructive/20 hover:text-destructive text-muted-foreground" onClick={() => { if (confirm("Delete this opportunity?")) deleteMutation.mutate({ id: opp.id }); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </AnimatePresence>
        )}

        {oppsData && oppsData.total > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10 flex flex-col sm:flex-row justify-between gap-3 sm:items-center text-sm text-muted-foreground">
            <span>Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, oppsData.total)} of {oppsData.total} results</span>
            <div className="flex items-center gap-2">
              <span className="text-xs">Page {page} of {Math.ceil(oppsData.total / PAGE_SIZE)}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="h-8 border-white/10 bg-transparent hover:bg-white/5 disabled:opacity-30">Prev</Button>
                <Button variant="outline" size="sm" disabled={page * PAGE_SIZE >= oppsData.total} onClick={() => setPage((p) => p + 1)} className="h-8 border-white/10 bg-transparent hover:bg-white/5 disabled:opacity-30">Next</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={isFetchOpen} onOpenChange={setIsFetchOpen}>
        <DialogContent className="bg-popover/95 backdrop-blur-xl border-white/10 text-white sm:max-w-[720px]">
          <form onSubmit={handleFetchSubmit}>
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Fetch Intelligence</DialogTitle>
              <DialogDescription className="text-muted-foreground">Choose sources and enter a search-style query for this intelligence run.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 py-6">
              <div className="grid gap-2">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Data Sources</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[340px] overflow-y-auto pr-1">
                  {FETCH_PROVIDER_OPTIONS.map(({ key, label, desc, stub }) => {
                    const checked = fetchProviders.includes(key);
                    return (
                      <button key={key} type="button" disabled={stub} onClick={() => !stub && toggleFetchProvider(key)} className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-colors ${stub ? "border-white/5 bg-white/2 opacity-40 cursor-not-allowed" : checked ? "border-primary/40 bg-primary/10 cursor-pointer" : "border-white/10 bg-white/3 hover:bg-white/5 cursor-pointer"}`}>
                        <div className={`mt-0.5 w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center ${stub ? "border-white/20" : checked ? "border-primary bg-primary" : "border-white/20"}`}>
                          {checked && !stub && <svg className="w-2 h-2 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium leading-none">{label}</span>
                            {stub && <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-500/70 font-medium"><Clock className="w-2.5 h-2.5" /> Pending</span>}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {fetchProviders.length === 0 && <p className="text-[11px] text-amber-400">Select at least one source to fetch from.</p>}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="query">Search Query</Label>
                <div className="relative">
                  <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input id="query" value={fetchQuery} onChange={(e) => setFetchQuery(e.target.value)} placeholder='e.g. "occupational health services" government RFP due in 30 days' className="bg-background/50 border-white/10 pl-9" />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {["occupational health services city county RFP", "drug testing and DOT physical solicitation", "employee wellness contract opportunity state government"].map((preset) => (
                    <button key={preset} type="button" onClick={() => setFetchQuery(preset)} className="text-[10px] px-2 py-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-white/80">{preset}</button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="days">Date Range (Days Back)</Label>
                <Input id="days" type="number" value={fetchDays} onChange={(e) => setFetchDays(e.target.value)} min="1" max="365" className="bg-background/50 border-white/10" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsFetchOpen(false)} className="hover:bg-white/5">Cancel</Button>
              <Button type="submit" disabled={fetchMutation.isPending || fetchProviders.length === 0} className="bg-primary hover:bg-primary/90">
                {fetchMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DownloadCloud className="w-4 h-4 mr-2" />}
                {fetchMutation.isPending ? "Fetching..." : "Start Fetch"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="bg-popover/95 backdrop-blur-xl border-white/10 text-white sm:max-w-[425px]">
          <form onSubmit={handleImportSubmit}>
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Import CSV</DialogTitle>
              <DialogDescription className="text-muted-foreground">Upload a CSV file containing historical opportunities.</DialogDescription>
            </DialogHeader>
            <div className="py-8">
              <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full h-32 border-2 border-white/10 border-dashed rounded-xl cursor-pointer bg-background/30 hover:bg-white/5 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <FileSpreadsheet className="w-8 h-8 mb-3 text-muted-foreground" />
                  <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold text-white">Click to upload</span> or drag and drop</p>
                  <p className="text-xs text-muted-foreground/70">CSV files only</p>
                </div>
                <input id="file-upload" type="file" accept=".csv" className="hidden" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
              </label>
              {importFile && (
                <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-3">
                  <FileSpreadsheet className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-primary">{importFile.name}</span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsImportOpen(false)} className="hover:bg-white/5">Cancel</Button>
              <Button type="submit" disabled={!importFile || importMutation.isPending} className="bg-primary hover:bg-primary/90">
                {importMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {importMutation.isPending ? "Importing..." : "Upload & Import"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
