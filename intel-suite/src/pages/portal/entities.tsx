import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, Search, Target, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ClientsPage from "./clients";

interface Prospect {
  id: string;
  name: string;
  website?: string | null;
  description?: string | null;
  industry?: string | null;
  headquarters?: string | null;
  employeeCount?: string | null;
  status: "prospect" | "lead" | "qualified" | "active";
  tier: "strategic" | "enterprise" | "mid-market";
  notes?: string | null;
  researchSummary?: string | null;
  opportunitySignals?: string | null;
  intelligenceSources?: string | null;
  lastResearched?: string | null;
}

interface ProspectsResponse {
  prospects: Prospect[];
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function badgeClass(value: string) {
  if (value === "strategic" || value === "active") return "border-rose-500/30 bg-rose-500/15 text-rose-300";
  if (value === "qualified" || value === "enterprise") return "border-primary/30 bg-primary/15 text-primary";
  if (value === "lead") return "border-amber-500/30 bg-amber-500/15 text-amber-300";
  return "border-white/10 bg-white/5 text-white/60";
}

function ProspectEntitiesPanel() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery<ProspectsResponse>({
    queryKey: ["entities", "prospects"],
    queryFn: async () => {
      const resp = await fetch("/api/prospects");
      if (!resp.ok) throw new Error("Failed to load prospects");
      return resp.json();
    },
    staleTime: 30_000,
  });

  const prospects = data?.prospects ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return prospects;
    return prospects.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.industry ?? "").toLowerCase().includes(q) ||
      (p.headquarters ?? "").toLowerCase().includes(q) ||
      (p.researchSummary ?? "").toLowerCase().includes(q) ||
      (p.notes ?? "").toLowerCase().includes(q)
    );
  }, [prospects, search]);

  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight text-white">Entity Intelligence</h1>
        <p className="mt-1 text-lg text-muted-foreground">Existing prospect records are available here inside the Entities workspace.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="glass-panel rounded-xl border border-white/5 p-4"><p className="text-xs text-muted-foreground">Prospects</p><p className="text-2xl font-bold text-white">{prospects.length}</p></div>
        <div className="glass-panel rounded-xl border border-white/5 p-4"><p className="text-xs text-muted-foreground">Researched</p><p className="text-2xl font-bold text-primary">{prospects.filter((p) => p.lastResearched).length}</p></div>
        <div className="glass-panel rounded-xl border border-white/5 p-4"><p className="text-xs text-muted-foreground">Qualified / Active</p><p className="text-2xl font-bold text-emerald-400">{prospects.filter((p) => p.status === "qualified" || p.status === "active").length}</p></div>
        <div className="glass-panel rounded-xl border border-white/5 p-4"><p className="text-xs text-muted-foreground">Strategic</p><p className="text-2xl font-bold text-rose-400">{prospects.filter((p) => p.tier === "strategic").length}</p></div>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search prospect entities…" className="pl-9" />
        {search && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white" onClick={() => setSearch("")}><X className="h-3.5 w-3.5" /></button>}
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel rounded-3xl border border-white/10 p-12 text-center"><Target className="mx-auto mb-4 h-10 w-10 text-primary/40" /><p className="font-semibold text-white">No prospect entities found</p></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map((prospect) => {
            const signals = parseJson<{ title: string; type: string; url?: string }[]>(prospect.opportunitySignals, []);
            const sources = parseJson<string[]>(prospect.intelligenceSources, []);
            return (
              <div key={prospect.id} className="glass-card rounded-2xl border border-white/5 p-5 transition-all hover:border-primary/25">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <Badge variant="outline" className={`text-[10px] uppercase ${badgeClass(prospect.status)}`}>{prospect.status}</Badge>
                      <Badge variant="outline" className={`text-[10px] uppercase ${badgeClass(prospect.tier)}`}>{prospect.tier}</Badge>
                    </div>
                    <h3 className="truncate text-lg font-semibold text-white">{prospect.name}</h3>
                    {prospect.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{prospect.description}</p>}
                  </div>
                  {prospect.website && <a href={prospect.website} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><ExternalLink className="h-4 w-4" /></a>}
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  {[prospect.industry, prospect.headquarters, prospect.employeeCount].filter(Boolean).join(" · ")}
                </div>
                {prospect.researchSummary && <p className="mt-3 rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs leading-relaxed text-white/75">{prospect.researchSummary}</p>}
                {signals.length > 0 && <p className="mt-3 text-xs text-amber-300">{signals.length} opportunity signal{signals.length === 1 ? "" : "s"}</p>}
                {sources.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{sources.length} intelligence source{sources.length === 1 ? "" : "s"}</p>}
                {prospect.notes && <p className="mt-3 text-xs text-white/60">Notes: {prospect.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function EntitiesPage() {
  const [tab, setTab] = useState<"clients" | "prospects">("clients");

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        <Button variant={tab === "clients" ? "default" : "outline"} onClick={() => setTab("clients")} className={tab === "clients" ? "" : "border-white/10 bg-white/5 text-white hover:bg-white/10"}>
          <Users className="mr-2 h-4 w-4" /> Client Records
        </Button>
        <Button variant={tab === "prospects" ? "default" : "outline"} onClick={() => setTab("prospects")} className={tab === "prospects" ? "" : "border-white/10 bg-white/5 text-white hover:bg-white/10"}>
          <Target className="mr-2 h-4 w-4" /> Prospect Records
        </Button>
      </div>
      {tab === "clients" ? <ClientsPage /> : <ProspectEntitiesPanel />}
    </div>
  );
}
