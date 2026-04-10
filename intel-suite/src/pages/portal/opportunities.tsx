import { useState } from "react";
import { useLocation } from "wouter";
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
  Sparkles
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
  useListProviders
} from "@workspace/api-client-react";

export default function OpportunitiesDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filters state
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "archived">("active");
  const [type, setType] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  
  // Dialogs state
  const [isFetchOpen, setIsFetchOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  
  // Fetch form state
  const [fetchQuery, setFetchQuery] = useState("");
  const [fetchDays, setFetchDays] = useState("30");
  const [fetchProviders, setFetchProviders] = useState<string[]>(["sam_gov", "serper", "tavily", "statePortals"]);

  // Import form state
  const [importFile, setImportFile] = useState<File | null>(null);

  // Queries
  const { data: settings } = useGetSettings();
  
  // API requires status to be strictly undefined if 'all' to avoid schema errors if 'all' isn't supported, 
  // but schema says [active, archived, all]. We will pass it directly.
  const { data: oppsData, isLoading: isLoadingOpps } = useListOpportunities({
    search: search || undefined,
    status: status !== "all" ? status as any : undefined,
    type: type !== "all" ? type : undefined,
    source: sourceFilter !== "all" ? sourceFilter : undefined,
    page,
    limit: PAGE_SIZE,
  });

  const { data: providersData } = useListProviders();

  // Mutations
  const fetchMutation = useFetchOpportunities({
    mutation: {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() });
        setIsFetchOpen(false);

        // Collect any per-provider errors (e.g. quota exceeded)
        const providerErrors: string[] = (data.providers ?? [])
          .flatMap((p: any) => p.errors ?? [])
          .filter(Boolean);

        const totalSaved = (data.created ?? 0) + (data.updated ?? 0);

        if (totalSaved > 0) {
          // Always show success if we got records — even with partial errors
          toast({
            title: "Intelligence Fetched",
            description: `Found ${data.fetched} opportunities. Added ${data.created}, updated ${data.updated}.${providerErrors.length > 0 ? " Some providers used fallback mode." : ""}`,
          });
          // Show quota/fallback warnings as a separate notice toast
          if (providerErrors.length > 0) {
            const quotaMsg = providerErrors.find(e => e.includes("quota") || e.includes("rate limit") || e.includes("fallback"));
            if (quotaMsg) {
              setTimeout(() => {
                toast({
                  title: "Provider Notice",
                  description: quotaMsg.slice(0, 140),
                  variant: "default",
                });
              }, 600);
            }
          }
        } else if (providerErrors.length > 0) {
          toast({
            variant: "destructive",
            title: "Fetch Issue",
            description: providerErrors[0],
          });
        } else {
          toast({
            title: "Fetch Complete",
            description: `Fetched ${data.fetched} records. Added ${data.created}, updated ${data.updated}.`,
          });
        }
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Fetch Failed",
          description: err.error || err.message || "Failed to fetch from configured sources",
        });
      }
    }
  });

  const importMutation = useImportOpportunitiesFromCsv({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() });
        setIsImportOpen(false);
        setImportFile(null);
        toast({
          title: "Import Complete",
          description: `Successfully imported ${data.imported} records. Skipped ${data.skipped}.`,
        });
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Import Failed",
          description: err.error || "Failed to import CSV",
        });
      }
    }
  });

  const deleteMutation = useDeleteOpportunity({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() });
        toast({ title: "Opportunity deleted" });
      }
    }
  });

  // Handlers
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

  const toggleFetchProvider = (key: string) => {
    setFetchProviders(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  };

  const handleFetchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMutation.mutate({
      data: {
        keywords: fetchQuery.trim(),
        dateRange: parseInt(fetchDays, 10),
        providers: fetchProviders.length > 0 ? fetchProviders : undefined,
      }
    });
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;
    importMutation.mutate({
      data: { file: importFile }
    });
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
    // Try to find well-known agency name patterns
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
      if (m && m.length >= 3 && m.length <= 40 && !/^(Request|Bid|Contract|For|The|And|Or|Of)$/i.test(m)) {
        return m;
      }
    }
    return null;
  };

  const getSourceBadge = (source: string | null | undefined, name: string | null | undefined) => {
    const s = source || "manual";
    const rawName = name || s;

    const displayNames: Record<string, string> = {
      sam_gov: "SAM.gov",
      serper: "Serper",
      tavily: "Tavily",
      tango: "Tango",
      bidnet: "BidNet",
      csv_import: "CSV Import",
      manual: "Manual",
      gemini: "Gemini AI",
    };
    const displayName = displayNames[rawName] ?? (rawName.charAt(0).toUpperCase() + rawName.slice(1));
    
    const colors: Record<string, string> = {
      sam_gov: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      serper: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      tavily: "bg-pink-500/10 text-pink-400 border-pink-500/20",
      tango: "bg-orange-500/10 text-orange-400 border-orange-500/20",
      bidnet: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
      csv_import: "bg-white/5 text-muted-foreground border-white/10",
      manual: "bg-white/5 text-muted-foreground border-white/10",
    };

    return (
      <Badge variant="outline" className={`font-normal ${colors[rawName] || colors[s] || "bg-white/5 text-muted-foreground border-white/10"}`}>
        {displayName}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Opportunities</h1>
          <p className="text-muted-foreground mt-1">Unified intelligence from SAM.gov, web discovery sources, and configured data providers.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="bg-background/50 backdrop-blur-md border-white/10 hover:bg-white/5 hover:text-white"
            onClick={() => setIsImportOpen(true)}
          >
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
          <Button
            variant="outline"
            className="bg-background/50 backdrop-blur-md border-white/10 hover:bg-white/5 hover:text-white"
            onClick={handleEnrich}
            disabled={isEnriching}
            title="Backfill missing Agency, Due Date, and Value by extracting full page content"
          >
            {isEnriching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {isEnriching ? "Enriching..." : "Re-enrich"}
          </Button>
          <Button 
            className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
            onClick={handleOpenFetch}
          >
            <DownloadCloud className="w-4 h-4 mr-2" />
            Fetch Intelligence
          </Button>
        </div>
      </div>

      {/* Provider Status Bar */}
      <div className="flex items-center gap-3 px-4 py-2 glass-panel rounded-full overflow-x-auto no-scrollbar">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold whitespace-nowrap">Active Sources:</span>
        <div className="flex items-center gap-2">
          {providersData?.providers.map(p => {
            const isStub = p.name === "tango" || p.name === "bidnet";
            const dotClass = isStub
              ? "bg-amber-500/40 border border-amber-500/40"
              : p.status?.configured
                ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]"
                : "bg-white/20";
            return (
              <div key={p.name} className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap" title={isStub ? "Pending API access — contact provider support" : p.status?.configured ? "Active" : "Not configured"}>
                <div className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                <span className={isStub ? "text-white/40" : "text-white/80"}>{p.displayName}</span>
                {isStub && <Clock className="w-2.5 h-2.5 text-amber-500/50" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Toolbar */}
      <div className="glass-panel rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search by title, agency, or NAICS..." 
            className="pl-9 bg-background/50 border-white/10 focus-visible:ring-primary/50 text-white"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Select value={status} onValueChange={(v: any) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[140px] bg-background/50 border-white/10 text-white">
              <div className="flex items-center gap-2">
                <Filter className="w-3 h-3 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-popover border-white/10">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>

          <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
            <SelectTrigger className="w-[160px] bg-background/50 border-white/10 text-white">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-white/10">
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Solicitation">Solicitation</SelectItem>
              <SelectItem value="Presolicitation">Presolicitation</SelectItem>
              <SelectItem value="Award Notice">Award Notice</SelectItem>
              <SelectItem value="Sources Sought">Sources Sought</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[140px] bg-background/50 border-white/10 text-white">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-white/10">
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="sam_gov">SAM.gov</SelectItem>
              <SelectItem value="serper">Serper</SelectItem>
              <SelectItem value="tavily">Tavily</SelectItem>
              <SelectItem value="tango">Tango</SelectItem>
              <SelectItem value="bidnet">BidNet</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Data Table Area */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-4 font-medium">Opportunity</th>
                <th className="p-4 font-medium">Agency</th>
                <th className="p-4 font-medium">Due Date</th>
                <th className="p-4 font-medium">Source</th>
                <th className="p-4 font-medium">Value</th>
                <th className="p-4 font-medium">Set-Aside</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoadingOpps ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                  </td>
                </tr>
              ) : oppsData?.data.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-16 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Search className="w-12 h-12 mb-4 opacity-20" />
                      <h3 className="text-lg font-medium text-white mb-2">No opportunities found</h3>
                      <p className="max-w-sm text-sm">
                        Configure your data sources in Integrations, use Fetch Intelligence to pull opportunities, or import a CSV file.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                <AnimatePresence>
                  {oppsData?.data.map((opp, i) => (
                    <motion.tr 
                      key={opp.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="hover:bg-white/5 transition-colors group cursor-pointer"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button, a")) return;
                        if (opp.samUrl) window.open(opp.samUrl, "_blank", "noreferrer");
                      }}
                    >
                      <td className="p-4 max-w-sm">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-white line-clamp-1 group-hover:text-primary transition-colors">{opp.title}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {opp.noticeId?.startsWith("web-") ? (
                              <span className="flex items-center gap-1">
                                <span className="opacity-60">via</span>
                                <span className="font-medium capitalize">{opp.providerName ?? "web"}</span>
                                {opp.samUrl && (
                                  <>
                                    <span className="opacity-40">·</span>
                                    <span className="opacity-60 truncate max-w-[160px]">{(() => { try { return new URL(opp.samUrl).hostname.replace(/^www\./, ""); } catch { return opp.samUrl; } })()}</span>
                                  </>
                                )}
                              </span>
                            ) : (
                              <span>ID: {opp.noticeId || opp.id.slice(0,8)}</span>
                            )}
                            {opp.naicsCode && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-white/20" />
                                <span>NAICS: {opp.naicsCode}</span>
                              </>
                            )}
                          </div>
                          {opp.description && (
                            <p className="text-xs text-muted-foreground/70 line-clamp-2 mt-0.5 leading-relaxed">
                              {stripMarkdown(opp.description).slice(0, 180)}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-white/80 whitespace-nowrap">
                        {opp.agency === "Unknown"
                          ? (extractAgencyHint(opp.title) ?? <span className="text-muted-foreground">—</span>)
                          : opp.agency}
                      </td>
                      <td className="p-4 text-sm whitespace-nowrap">
                        {opp.responseDeadline ? (
                          <span className={
                            new Date(opp.responseDeadline).getTime() - new Date().getTime() < 14 * 24 * 60 * 60 * 1000
                            ? "text-amber-400 font-medium"
                            : "text-white/80"
                          }>
                            {format(new Date(opp.responseDeadline), "MMM d")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-4 text-sm">
                        {getSourceBadge(opp.source, opp.providerName)}
                      </td>
                      <td className="p-4 text-sm text-white/80">
                        {formatCurrency(opp.estimatedValue || opp.awardAmount)}
                      </td>
                      <td className="p-4 text-sm text-white/80">
                        {opp.setAside || "—"}
                      </td>
                      <td className="p-4 text-sm">
                        <Badge variant="outline" className="bg-white/5 border-white/10 font-normal">
                          {opp.type}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <Badge 
                          variant="secondary" 
                          className={opp.status === 'active' 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : 'bg-white/5 text-muted-foreground border-white/10'
                          }
                        >
                          {opp.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {opp.samUrl && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-white/10 hover:text-white" asChild>
                              <a href={opp.samUrl} target="_blank" rel="noreferrer">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </Button>
                          )}
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 hover:bg-destructive/20 hover:text-destructive text-muted-foreground"
                            onClick={() => {
                              if (confirm("Delete this opportunity?")) {
                                deleteMutation.mutate({ id: opp.id });
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>
        {oppsData && oppsData.total > 0 && (
          <div className="p-4 border-t border-white/10 bg-black/20 flex justify-between items-center text-sm text-muted-foreground">
            <span>
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, oppsData.total)} of {oppsData.total} results
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs">Page {page} of {Math.ceil(oppsData.total / PAGE_SIZE)}</span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="h-8 border-white/10 bg-transparent hover:bg-white/5 disabled:opacity-30"
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * PAGE_SIZE >= oppsData.total}
                  onClick={() => setPage(p => p + 1)}
                  className="h-8 border-white/10 bg-transparent hover:bg-white/5 disabled:opacity-30"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fetch Dialog */}
      <Dialog open={isFetchOpen} onOpenChange={setIsFetchOpen}>
        <DialogContent className="bg-popover/95 backdrop-blur-xl border-white/10 text-white sm:max-w-[460px]">
          <form onSubmit={handleFetchSubmit}>
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Fetch Intelligence</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Choose sources and enter a search-style query for this intelligence run.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 py-6">
              {/* Provider selection */}
              <div className="grid gap-2">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Data Sources</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "sam_gov", label: "SAM.gov", desc: "Federal solicitations", stub: false },
                    { key: "serper", label: "Serper", desc: "Web search (Google)", stub: false },
                    { key: "tavily", label: "Tavily", desc: "Deep AI research", stub: false },
                    { key: "gemini", label: "Gemini AI", desc: "Structured extraction", stub: false },
                    { key: "statePortals", label: "State Portals", desc: "24 state & regional portals", stub: false },
                    { key: "tango", label: "Tango", desc: "Pending API access", stub: true },
                    { key: "bidnet", label: "BidNet Direct", desc: "Pending API access", stub: true },
                  ].map(({ key, label, desc, stub }) => {
                    const checked = fetchProviders.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={stub}
                        onClick={() => !stub && toggleFetchProvider(key)}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-colors ${
                          stub
                            ? "border-white/5 bg-white/2 opacity-40 cursor-not-allowed"
                            : checked
                              ? "border-primary/40 bg-primary/10 cursor-pointer"
                              : "border-white/10 bg-white/3 hover:bg-white/5 cursor-pointer"
                        }`}
                      >
                        <div className={`mt-0.5 w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center ${
                          stub ? "border-white/20" : checked ? "border-primary bg-primary" : "border-white/20"
                        }`}>
                          {checked && !stub && (
                            <svg className="w-2 h-2 text-white" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium leading-none">{label}</span>
                            {stub && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-500/70 font-medium">
                                <Clock className="w-2.5 h-2.5" /> Pending
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {fetchProviders.length === 0 && (
                  <p className="text-[11px] text-amber-400">Select at least one source to fetch from.</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="query">Search Query</Label>
                <div className="relative">
                  <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="query"
                    value={fetchQuery}
                    onChange={(e) => setFetchQuery(e.target.value)}
                    placeholder='e.g. "occupational health services" government RFP due in 30 days'
                    className="bg-background/50 border-white/10 pl-9"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Think like a search engine: include service, buyer type, and intent (RFP, bid, solicitation).
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {[
                    'occupational health services city county RFP',
                    'drug testing and DOT physical solicitation',
                    'employee wellness contract opportunity state government',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFetchQuery(preset)}
                      className="text-[10px] px-2 py-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="days">Date Range (Days Back)</Label>
                <Input 
                  id="days" 
                  type="number"
                  value={fetchDays}
                  onChange={(e) => setFetchDays(e.target.value)}
                  min="1" max="365"
                  className="bg-background/50 border-white/10"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsFetchOpen(false)} className="hover:bg-white/5">
                Cancel
              </Button>
              <Button type="submit" disabled={fetchMutation.isPending || fetchProviders.length === 0} className="bg-primary hover:bg-primary/90">
                {fetchMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DownloadCloud className="w-4 h-4 mr-2" />}
                {fetchMutation.isPending ? "Fetching..." : "Start Fetch"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="bg-popover/95 backdrop-blur-xl border-white/10 text-white sm:max-w-[425px]">
          <form onSubmit={handleImportSubmit}>
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Import CSV</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Upload a CSV file containing historical opportunities.
              </DialogDescription>
            </DialogHeader>
            <div className="py-8">
              <label 
                htmlFor="file-upload" 
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-white/10 border-dashed rounded-xl cursor-pointer bg-background/30 hover:bg-white/5 transition-colors"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <FileSpreadsheet className="w-8 h-8 mb-3 text-muted-foreground" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold text-white">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground/70">CSV files only</p>
                </div>
                <input 
                  id="file-upload" 
                  type="file" 
                  accept=".csv"
                  className="hidden" 
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                />
              </label>
              {importFile && (
                <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-3">
                  <FileSpreadsheet className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-primary">{importFile.name}</span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsImportOpen(false)} className="hover:bg-white/5">
                Cancel
              </Button>
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
