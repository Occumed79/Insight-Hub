import { useState } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target, Plus, Search, RefreshCw, ExternalLink, Trash2, ChevronRight,
  Building2, Globe, MapPin, Users, Sparkles, X, AlertCircle, Loader2,
  TrendingUp, Award, Calendar, FileText, Shield, ChevronDown,
  Newspaper, Landmark, BarChart2
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  Cell,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContractWin {
  title: string;
  agency: string;
  value: string;
  date: string;
  url: string;
}

interface NewsArticle {
  headline: string;
  source: string;
  date: string;
  url: string;
}

interface FecFiling {
  committee: string;
  cycle: string;
  amount: number;
  recipient: string;
}

interface Competitor {
  id: string;
  name: string;
  website: string | null;
  description: string | null;
  services: string | null;       // JSON string[]
  coverageStates: string | null; // JSON string[]
  tier: "local" | "regional" | "national";
  headquarters: string | null;
  employeeCount: string | null;
  founded: string | null;
  notes: string | null;
  recentActivity: string | null;
  contractWins: string | null;   // JSON ContractWin[]
  intelligenceSources: string | null; // JSON string[]
  newsArticles: string | null;   // JSON NewsArticle[]
  fecFilings: string | null;     // JSON FecFiling[]
  lastResearched: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function tierColor(tier: string) {
  switch (tier) {
    case "national": return "bg-rose-500/15 text-rose-300 border-rose-500/30";
    case "regional": return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    default:         return "bg-blue-500/15 text-blue-300 border-blue-500/30";
  }
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Parse a contract value string like "$2.5 million" → number in millions */
function parseContractValue(val: string): number {
  if (!val) return 0;
  const m = val.replace(/,/g, "").match(/\$?([\d.]+)\s*(million|billion|M|B)?/i);
  if (!m) return 0;
  const num = parseFloat(m[1]);
  const unit = (m[2] || "").toLowerCase();
  if (unit === "billion" || unit === "b") return num * 1000;
  if (unit === "million" || unit === "m") return num;
  return num / 1_000_000;
}

/**
 * Group contract wins by year/quarter and sum values for a time-series bar chart.
 * Falls back to ordinal labels (Q1 2024, etc.) parsed from the date field.
 */
function buildContractTimeline(wins: ContractWin[]): { period: string; value: number; count: number }[] {
  const buckets: Record<string, { value: number; count: number }> = {};

  for (const w of wins) {
    const rawDate = w.date ?? "";
    // Try to extract a 4-digit year
    const yearMatch = rawDate.match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : null;

    // Try to extract a month for quarter grouping
    const monthMatch = rawDate.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
    let period = "Unknown";
    if (year && monthMatch) {
      const monthIdx = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
        .indexOf(monthMatch[1].toLowerCase());
      const quarter = Math.floor(monthIdx / 3) + 1;
      period = `Q${quarter} ${year}`;
    } else if (year) {
      period = year;
    }

    const amount = parseContractValue(w.value);
    if (!buckets[period]) buckets[period] = { value: 0, count: 0 };
    buckets[period].value += amount;
    buckets[period].count += 1;
  }

  // Sort chronologically; "Unknown" goes last
  return Object.entries(buckets)
    .map(([period, { value, count }]) => ({ period, value: Math.round(value * 100) / 100, count }))
    .sort((a, b) => {
      if (a.period === "Unknown") return 1;
      if (b.period === "Unknown") return -1;
      return a.period.localeCompare(b.period);
    });
}

/** Build monthly article volume from article dates for sparkline */
function buildMonthlyVolume(articles: NewsArticle[]): { month: string; count: number }[] {
  const counts: Record<string, number> = {};
  const now = new Date();
  // Pre-fill last 6 months
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    counts[key] = 0;
  }
  for (const a of articles) {
    if (!a.date) continue;
    const parsed = new Date(a.date);
    if (isNaN(parsed.getTime())) continue;
    const key = parsed.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts).map(([month, count]) => ({ month, count }));
}

// ── Seed competitors ──────────────────────────────────────────────────────────

const SEED_COMPETITORS = [
  {
    name: "Concentra",
    website: "https://www.concentra.com",
    description: "Nation's largest occupational health provider with 500+ urgent care and occupational health centers.",
    services: ["Occupational Health", "Urgent Care", "Drug Testing", "Physical Exams", "DOT Physicals", "Workers Comp"],
    coverageStates: ["CA","TX","FL","NY","PA","OH","IL","GA","NC","VA","WA","CO","AZ","TN","MD"],
    tier: "national",
    headquarters: "Addison, TX",
    employeeCount: "40,000+",
    founded: "1979",
  },
  {
    name: "Premise Health",
    website: "https://www.premisehealth.com",
    description: "Leading direct healthcare company delivering onsite and virtual employer health services.",
    services: ["Onsite Clinics", "Occupational Health", "Primary Care", "Wellness Programs", "Mental Health"],
    coverageStates: ["CA","TX","FL","NY","PA","OH","IL","GA","TN","CO"],
    tier: "national",
    headquarters: "Brentwood, TN",
    employeeCount: "5,000+",
    founded: "1989",
  },
  {
    name: "WorkCare",
    website: "https://www.workcare.com",
    description: "Occupational health management company specializing in injury care, prevention, and absence management.",
    services: ["Absence Management", "Workers Comp", "Occupational Health", "Drug Testing", "Fit-for-Duty"],
    coverageStates: ["CA","TX","FL","OH","PA","IL","NC","GA","VA"],
    tier: "national",
    headquarters: "Anaheim, CA",
    employeeCount: "500+",
    founded: "1989",
  },
  {
    name: "Medcor",
    website: "https://www.medcor.com",
    description: "Onsite and near-site occupational health and injury triage services for large employers and construction.",
    services: ["Onsite Clinics", "Injury Triage", "Occupational Health", "Wellness", "Telehealth"],
    coverageStates: ["IL","CA","TX","OH","PA","GA","NC","FL"],
    tier: "national",
    headquarters: "McHenry, IL",
    employeeCount: "2,000+",
    founded: "1991",
  },
  {
    name: "Marathon Health",
    website: "https://www.marathon-health.com",
    description: "Advanced primary and occupational health clinics for employers focused on reducing healthcare costs.",
    services: ["Primary Care", "Occupational Health", "Wellness", "Preventive Care", "Chronic Disease"],
    coverageStates: ["CO","IN","TX","OH","TN","GA","FL","NC"],
    tier: "national",
    headquarters: "Burlington, VT",
    employeeCount: "1,000+",
    founded: "2004",
  },
  {
    name: "Axiom Medical",
    website: "https://www.axiommedical.com",
    description: "Occupational health management platform and clinical services for HR and risk management teams.",
    services: ["Workers Comp", "Absence Management", "Occupational Health", "Telehealth", "Drug Testing"],
    coverageStates: ["TX","CA","FL","OH","PA","GA"],
    tier: "regional",
    headquarters: "The Woodlands, TX",
    employeeCount: "200+",
    founded: "2000",
  },
  {
    name: "OHD (Occupational Health Dynamics)",
    website: "https://www.ohdinc.com",
    description: "Occupational health consulting specializing in OSHA compliance, industrial hygiene, and safety programs.",
    services: ["OSHA Compliance", "Industrial Hygiene", "Medical Surveillance", "Hearing Conservation", "Respirator Fit"],
    coverageStates: ["TX","OK","LA","AR","KS"],
    tier: "regional",
    headquarters: "Houston, TX",
    employeeCount: "50-200",
    founded: "1993",
  },
  {
    name: "AllOne Health",
    website: "https://www.allonehealth.com",
    description: "Employee health and assistance program (EAP) provider offering behavioral health and occupational health services.",
    services: ["EAP", "Behavioral Health", "Occupational Health", "Wellness", "Absence Management"],
    coverageStates: ["MA","NY","CT","NJ","PA","OH","FL"],
    tier: "regional",
    headquarters: "Worcester, MA",
    employeeCount: "200+",
    founded: "1974",
  },
];

// ── Add/Edit Modal ────────────────────────────────────────────────────────────

function CompetitorModal({
  open,
  onClose,
  initial,
  onSave,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<Competitor>;
  onSave: (data: Record<string, unknown>) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [servicesRaw, setServicesRaw] = useState(
    parseJson<string[]>(initial?.services ?? null, []).join(", ")
  );
  const [statesRaw, setStatesRaw] = useState(
    parseJson<string[]>(initial?.coverageStates ?? null, []).join(", ")
  );
  const [tier, setTier] = useState<string>(initial?.tier ?? "regional");
  const [headquarters, setHeadquarters] = useState(initial?.headquarters ?? "");
  const [employeeCount, setEmployeeCount] = useState(initial?.employeeCount ?? "");
  const [founded, setFounded] = useState(initial?.founded ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name, website, description,
      services: servicesRaw.split(",").map((s) => s.trim()).filter(Boolean),
      coverageStates: statesRaw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
      tier, headquarters, employeeCount, founded, notes,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-popover/95 backdrop-blur-xl border-white/10 text-white sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{initial?.id ? "Edit Competitor" : "Add Competitor"}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Track a competitor's profile and capabilities.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 grid gap-1.5">
                <Label>Company Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Concentra" className="bg-background/50 border-white/10" required />
              </div>
              <div className="grid gap-1.5">
                <Label>Website</Label>
                <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." className="bg-background/50 border-white/10" />
              </div>
              <div className="grid gap-1.5">
                <Label>Tier</Label>
                <Select value={tier} onValueChange={setTier}>
                  <SelectTrigger className="bg-background/50 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-white/10">
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="regional">Regional</SelectItem>
                    <SelectItem value="national">National</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Headquarters</Label>
                <Input value={headquarters} onChange={(e) => setHeadquarters(e.target.value)} placeholder="City, State" className="bg-background/50 border-white/10" />
              </div>
              <div className="grid gap-1.5">
                <Label>Employee Count</Label>
                <Input value={employeeCount} onChange={(e) => setEmployeeCount(e.target.value)} placeholder="500+" className="bg-background/50 border-white/10" />
              </div>
              <div className="col-span-2 grid gap-1.5">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief company description..." className="bg-background/50 border-white/10 resize-none" rows={2} />
              </div>
              <div className="col-span-2 grid gap-1.5">
                <Label>Services (comma-separated)</Label>
                <Input value={servicesRaw} onChange={(e) => setServicesRaw(e.target.value)} placeholder="Drug Testing, DOT Physicals, Workers Comp" className="bg-background/50 border-white/10" />
              </div>
              <div className="col-span-2 grid gap-1.5">
                <Label>Coverage States (comma-separated)</Label>
                <Input value={statesRaw} onChange={(e) => setStatesRaw(e.target.value)} placeholder="CA, TX, FL, NY" className="bg-background/50 border-white/10" />
              </div>
              <div className="grid gap-1.5">
                <Label>Founded</Label>
                <Input value={founded} onChange={(e) => setFounded(e.target.value)} placeholder="1999" className="bg-background/50 border-white/10" />
              </div>
              <div className="col-span-2 grid gap-1.5">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." className="bg-background/50 border-white/10 resize-none" rows={2} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-white">Cancel</Button>
            <Button type="submit" disabled={isSaving || !name.trim()} className="bg-primary hover:bg-primary/90">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {initial?.id ? "Save Changes" : "Add Competitor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Contract Value Bar Chart ──────────────────────────────────────────────────

function ContractValueChart({ wins }: { wins: ContractWin[] }) {
  const timeline = buildContractTimeline(wins.filter((w) => w.value));
  const hasData = timeline.some((t) => t.value > 0 || t.count > 0);

  if (!hasData) {
    return (
      <p className="text-xs text-muted-foreground italic py-2">No valued contracts found — run Research to populate.</p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={timeline} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <XAxis
          dataKey="period"
          tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 9 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
          formatter={(v: number, name: string, p: any) => [
            v > 0 ? `$${v.toFixed(1)}M` : `${p.payload.count} contract${p.payload.count !== 1 ? "s" : ""}`,
            v > 0 ? "Total Value" : "Count",
          ]}
          labelStyle={{ color: "rgba(255,255,255,0.7)" }}
        />
        <Bar dataKey={timeline.some((t) => t.value > 0) ? "value" : "count"} radius={[4, 4, 0, 0]}>
          {timeline.map((_, i) => (
            <Cell key={i} fill={`rgba(99,102,241,${Math.max(0.35, 0.85 - i * 0.06)})`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Activity Sparkline ────────────────────────────────────────────────────────

function ActivitySparkline({ articles }: { articles: NewsArticle[] }) {
  const data = buildMonthlyVolume(articles);
  const hasActivity = data.some((d) => d.count > 0);

  if (!hasActivity) {
    return (
      <p className="text-xs text-muted-foreground italic py-1">No dated articles found.</p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={56}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.4} />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 8 }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,0.1)" }}
          contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
          formatter={(v: number) => [v, "Articles"]}
          labelStyle={{ color: "rgba(255,255,255,0.7)" }}
        />
        <Area type="monotone" dataKey="count" stroke="hsl(var(--accent))" strokeWidth={1.5} fill="url(#sparkGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Services Radar Chart ──────────────────────────────────────────────────────

const ALL_SERVICE_CATEGORIES = [
  "Drug Testing", "DOT Physicals", "Workers Comp", "Onsite Clinics",
  "Telehealth", "Wellness", "Mental Health", "Absence Management",
];

function ServicesRadar({ services }: { services: string[] }) {
  if (services.length === 0) return null;

  const lc = services.map((s) => s.toLowerCase());
  const data = ALL_SERVICE_CATEGORIES.map((cat) => ({
    subject: cat,
    value: lc.some((s) => s.includes(cat.toLowerCase().split(" ")[0])) ? 1 : 0,
  }));

  const hasAny = data.some((d) => d.value > 0);
  if (!hasAny) return null;

  return (
    <ResponsiveContainer width="100%" height={150}>
      <RadarChart data={data} margin={{ top: 0, right: 20, bottom: 0, left: 20 }}>
        <PolarGrid stroke="rgba(255,255,255,0.08)" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 8 }} />
        <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} dot={false} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ── Competitor Detail Panel ───────────────────────────────────────────────────

type PanelTab = "overview" | "news" | "political" | "charts";

function DetailPanel({ competitor, onClose, onResearch, isResearching }: {
  competitor: Competitor;
  onClose: () => void;
  onResearch: () => void;
  isResearching: boolean;
}) {
  const [activeTab, setActiveTab] = useState<PanelTab>("overview");

  const services = parseJson<string[]>(competitor.services, []);
  const states = parseJson<string[]>(competitor.coverageStates, []);
  const wins = parseJson<ContractWin[]>(competitor.contractWins, []);
  const sources = parseJson<string[]>(competitor.intelligenceSources, []);
  const newsArticles = parseJson<NewsArticle[]>(competitor.newsArticles, []);
  const fecFilings = parseJson<FecFiling[]>(competitor.fecFilings, []);

  const tabs: { id: PanelTab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "overview", label: "Overview", icon: FileText },
    { id: "news", label: "News", icon: Newspaper, count: newsArticles.length },
    { id: "political", label: "Political", icon: Landmark, count: fecFilings.length },
    { id: "charts", label: "Charts", icon: BarChart2 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.25 }}
      className="fixed right-0 top-0 h-full w-[440px] z-50 flex flex-col glass-panel border-l border-white/10 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-6 border-b border-white/8">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tierColor(competitor.tier)}`}>
              {competitor.tier.toUpperCase()}
            </span>
          </div>
          <h2 className="text-xl font-display font-semibold text-white truncate">{competitor.name}</h2>
          {competitor.headquarters && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <MapPin className="w-3 h-3" />{competitor.headquarters}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          <Button size="sm" variant="ghost" onClick={onResearch} disabled={isResearching}
            className="h-8 px-3 text-xs text-primary border border-primary/30 hover:bg-primary/10">
            {isResearching ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
            Research
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0 text-muted-foreground hover:text-white">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/8 px-4 gap-1 flex-shrink-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-white"
              }`}
            >
              <Icon className="w-3 h-3" />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`text-[9px] px-1 rounded-full ${active ? "bg-primary/20 text-primary" : "bg-white/8 text-muted-foreground"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* ── Overview Tab ── */}
        {activeTab === "overview" && (
          <>
            {competitor.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{competitor.description}</p>
            )}

            <div className="grid grid-cols-3 gap-3">
              {competitor.website && (
                <a href={competitor.website} target="_blank" rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1 p-3 rounded-xl bg-white/4 border border-white/8 hover:border-primary/30 transition-colors group">
                  <Globe className="w-4 h-4 text-primary group-hover:text-primary/80" />
                  <span className="text-[10px] text-muted-foreground">Website</span>
                </a>
              )}
              {competitor.employeeCount && (
                <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-white/4 border border-white/8">
                  <Users className="w-4 h-4 text-accent" />
                  <span className="text-[11px] font-medium text-white">{competitor.employeeCount}</span>
                  <span className="text-[9px] text-muted-foreground">Employees</span>
                </div>
              )}
              {competitor.founded && (
                <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-white/4 border border-white/8">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-[11px] font-medium text-white">{competitor.founded}</span>
                  <span className="text-[9px] text-muted-foreground">Founded</span>
                </div>
              )}
            </div>

            {services.length > 0 && (
              <div>
                <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Services</h4>
                <div className="flex flex-wrap gap-1.5">
                  {services.map((s) => (
                    <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary/90">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {states.length > 0 && (
              <div>
                <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Coverage ({states.length} states)</h4>
                <div className="flex flex-wrap gap-1">
                  {states.map((s) => (
                    <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-white/6 border border-white/10 text-white/70 font-mono">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {competitor.recentActivity && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Intelligence Summary</h4>
                  {competitor.lastResearched && (
                    <span className="text-[9px] text-muted-foreground/60">· {timeAgo(competitor.lastResearched)}</span>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-accent/5 border border-accent/15">
                  <p className="text-xs text-white/80 leading-relaxed">{competitor.recentActivity}</p>
                </div>
              </div>
            )}

            {wins.length > 0 && (
              <div>
                <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Contract Activity ({wins.length})</h4>
                <div className="space-y-2">
                  {wins.map((w, i) => (
                    <a key={i} href={w.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-start gap-2.5 p-3 rounded-xl bg-white/4 border border-white/8 hover:border-primary/30 transition-colors group">
                      <Award className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-white line-clamp-2 group-hover:text-primary/90">{w.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {w.agency && <span className="text-[10px] text-muted-foreground">{w.agency}</span>}
                          {w.value && <span className="text-[10px] text-emerald-400 font-medium">{w.value}</span>}
                          {w.date && <span className="text-[10px] text-muted-foreground/60">{w.date}</span>}
                        </div>
                      </div>
                      <ExternalLink className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary/60 flex-shrink-0 mt-0.5" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {competitor.notes && (
              <div>
                <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Notes</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{competitor.notes}</p>
              </div>
            )}

            {!competitor.recentActivity && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center border border-accent/20">
                  <Sparkles className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">No intelligence yet</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Click Research to gather contract activity and news.</p>
                </div>
                <Button size="sm" onClick={onResearch} disabled={isResearching} className="bg-primary hover:bg-primary/90 text-xs h-8">
                  {isResearching ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  {isResearching ? "Researching..." : "Run Research"}
                </Button>
              </div>
            )}
          </>
        )}

        {/* ── News Tab ── */}
        {activeTab === "news" && (
          <>
            {newsArticles.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Newspaper className="w-10 h-10 text-muted-foreground/30" />
                <div>
                  <p className="text-sm font-medium text-white">No news articles yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Run Research to pull recent headlines from credible health outlets.</p>
                </div>
                <Button size="sm" onClick={onResearch} disabled={isResearching} className="bg-primary hover:bg-primary/90 text-xs h-8">
                  {isResearching ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  {isResearching ? "Researching..." : "Run Research"}
                </Button>
              </div>
            ) : (
              <>
                <div className="mb-1">
                  <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">Activity by Month</h4>
                  <ActivitySparkline articles={newsArticles} />
                </div>
                <div className="space-y-2">
                  {newsArticles.map((a, i) => (
                    <a
                      key={i}
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-3 p-3 rounded-xl bg-white/4 border border-white/8 hover:border-primary/30 transition-colors group"
                    >
                      <Newspaper className="w-3.5 h-3.5 text-sky-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-white line-clamp-2 group-hover:text-primary/90">{a.headline}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {a.source && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400">{a.source}</span>
                          )}
                          {a.date && <span className="text-[10px] text-muted-foreground/60">{a.date}</span>}
                        </div>
                      </div>
                      <ExternalLink className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary/60 flex-shrink-0 mt-0.5" />
                    </a>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── Political Activity Tab ── */}
        {activeTab === "political" && (
          <>
            {fecFilings.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Landmark className="w-10 h-10 text-muted-foreground/30" />
                <div>
                  <p className="text-sm font-medium text-white">No FEC records found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Run Research to query the public FEC database for political contributions tied to this company.
                  </p>
                </div>
                <Button size="sm" onClick={onResearch} disabled={isResearching} className="bg-primary hover:bg-primary/90 text-xs h-8">
                  {isResearching ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  {isResearching ? "Researching..." : "Run Research"}
                </Button>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Political contributions sourced from the public FEC disbursements database. All figures are public record.
                </p>
                <div className="overflow-x-auto rounded-xl border border-white/8">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/8 bg-white/4">
                        <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Committee</th>
                        <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Recipient</th>
                        <th className="text-center px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Cycle</th>
                        <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fecFilings.map((f, i) => (
                        <tr key={i} className={`border-b border-white/5 ${i % 2 === 0 ? "" : "bg-white/2"} hover:bg-white/4 transition-colors`}>
                          <td className="px-3 py-2 text-white/80 truncate max-w-[110px]" title={f.committee}>{f.committee}</td>
                          <td className="px-3 py-2 text-muted-foreground truncate max-w-[100px]" title={f.recipient}>{f.recipient}</td>
                          <td className="px-3 py-2 text-center text-muted-foreground/70">{f.cycle || "—"}</td>
                          <td className="px-3 py-2 text-right text-emerald-400 font-medium tabular-nums">
                            ${f.amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-muted-foreground/50 text-center">
                  Source: FEC public disbursements API · fec.gov
                </p>
              </>
            )}
          </>
        )}

        {/* ── Charts Tab ── */}
        {activeTab === "charts" && (
          <>
            <div>
              <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
                <Award className="w-3 h-3 text-amber-400" />
                Contract Values
              </h4>
              <ContractValueChart wins={wins} />
            </div>

            <div>
              <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
                <Newspaper className="w-3 h-3 text-sky-400" />
                News Activity (last 6 mo.)
              </h4>
              <ActivitySparkline articles={newsArticles} />
            </div>

            {services.length > 0 && (
              <div>
                <h4 className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
                  <BarChart2 className="w-3 h-3 text-primary" />
                  Services Coverage
                </h4>
                <ServicesRadar services={services} />
              </div>
            )}

            {wins.length === 0 && newsArticles.length === 0 && services.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <BarChart2 className="w-10 h-10 text-muted-foreground/30" />
                <div>
                  <p className="text-sm font-medium text-white">No chart data yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Run Research to populate contract values and news timelines.</p>
                </div>
                <Button size="sm" onClick={onResearch} disabled={isResearching} className="bg-primary hover:bg-primary/90 text-xs h-8">
                  {isResearching ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  {isResearching ? "Researching..." : "Run Research"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

// ── Competitor Card ───────────────────────────────────────────────────────────

function CompetitorCard({
  competitor,
  selected,
  onSelect,
  onResearch,
  isResearching,
}: {
  competitor: Competitor;
  selected: boolean;
  onSelect: () => void;
  onResearch: (e: React.MouseEvent) => void;
  isResearching: boolean;
}) {
  const services = parseJson<string[]>(competitor.services, []);
  const states = parseJson<string[]>(competitor.coverageStates, []);
  const wins = parseJson<ContractWin[]>(competitor.contractWins, []);
  const news = parseJson<NewsArticle[]>(competitor.newsArticles, []);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-panel rounded-2xl p-5 border cursor-pointer transition-all duration-200 ${
        selected
          ? "border-primary/50 bg-primary/5 shadow-lg shadow-primary/10"
          : "border-white/10 hover:border-white/20 hover:bg-white/3"
      }`}
      onClick={onSelect}
    >
      {/* Top row */}
      <div className="flex items-start gap-3 mb-3">
        <CompanyLogo name={competitor.name} website={competitor.website} size={44} rounded="rounded-xl" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${tierColor(competitor.tier)}`}>
                  {competitor.tier.toUpperCase()}
                </span>
                {competitor.lastResearched && (
                  <span className="text-[9px] text-emerald-400/70 flex items-center gap-0.5">
                    <Sparkles className="w-2.5 h-2.5" />
                    {timeAgo(competitor.lastResearched)}
                  </span>
                )}
              </div>
              <h3 className="font-display font-semibold text-white text-sm leading-tight">{competitor.name}</h3>
              {competitor.headquarters && (
                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5" />{competitor.headquarters}
                </p>
              )}
            </div>
            <button
              onClick={onResearch}
              disabled={isResearching}
              title="Run intelligence research"
              className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors disabled:opacity-40"
            >
              {isResearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Services */}
      {services.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {services.slice(0, 4).map((s) => (
            <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 border border-white/8 text-white/60">{s}</span>
          ))}
          {services.length > 4 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 border border-white/8 text-muted-foreground">+{services.length - 4}</span>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground border-t border-white/6 pt-3 mt-2">
        {states.length > 0 && (
          <span className="flex items-center gap-1">
            <MapPin className="w-2.5 h-2.5" />{states.length} states
          </span>
        )}
        {wins.length > 0 && (
          <span className="flex items-center gap-1 text-amber-400/80">
            <Award className="w-2.5 h-2.5" />{wins.length} contract{wins.length !== 1 ? "s" : ""}
          </span>
        )}
        {news.length > 0 && (
          <span className="flex items-center gap-1 text-sky-400/80">
            <Newspaper className="w-2.5 h-2.5" />{news.length} articles
          </span>
        )}
        {competitor.employeeCount && (
          <span className="flex items-center gap-1">
            <Users className="w-2.5 h-2.5" />{competitor.employeeCount}
          </span>
        )}
        <ChevronRight className="w-3 h-3 ml-auto text-white/20" />
      </div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CompetitorsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Competitor | null>(null);
  const [researchingIds, setResearchingIds] = useState<Set<string>>(new Set());
  const [isResearchingAll, setIsResearchingAll] = useState(false);
  const [researchToast, setResearchToast] = useState<{ id: string; msg: string } | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery<{ competitors: Competitor[] }>({
    queryKey: ["competitors"],
    queryFn: () => fetch("/api/competitors").then((r) => r.json()),
  });

  const competitors = data?.competitors ?? [];
  const selected = competitors.find((c) => c.id === selectedId) ?? null;

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch("/api/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
      setIsAddOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      fetch(`/api/competitors/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
      setEditTarget(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/competitors/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
      setSelectedId(null);
    },
  });

  // ── Research single competitor ───────────────────────────────────────────────
  async function researchCompetitor(id: string) {
    setResearchingIds((s) => new Set(s).add(id));
    try {
      const res = await fetch(`/api/competitors/${id}/research`, { method: "POST" });
      const json = await res.json();
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
      const name = competitors.find((c) => c.id === id)?.name ?? "";
      const wins = json.stats?.contractWinsFound ?? 0;
      const articles = json.stats?.newsArticlesFound ?? 0;
      setResearchToast({ id: Date.now().toString(), msg: `${name}: ${wins} contracts · ${articles} news articles` });
      setTimeout(() => setResearchToast(null), 4000);
    } catch {
      // silent
    } finally {
      setResearchingIds((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  // ── Research all ─────────────────────────────────────────────────────────────
  async function researchAll() {
    setIsResearchingAll(true);
    for (const c of competitors) {
      await researchCompetitor(c.id);
    }
    setIsResearchingAll(false);
  }

  // ── Seed competitors ──────────────────────────────────────────────────────────
  const seedMutation = useMutation({
    mutationFn: async () => {
      for (const c of SEED_COMPETITORS) {
        await fetch("/api/competitors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(c),
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["competitors"] }),
  });

  // ── Filter ───────────────────────────────────────────────────────────────────
  const filtered = competitors.filter((c) => {
    const matchesSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.headquarters ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesTier = tierFilter === "all" || c.tier === tierFilter;
    return matchesSearch && matchesTier;
  });

  const researched = competitors.filter((c) => c.lastResearched).length;
  const totalWins = competitors.reduce((sum, c) => sum + parseJson<ContractWin[]>(c.contractWins, []).length, 0);
  const totalNews = competitors.reduce((sum, c) => sum + parseJson<NewsArticle[]>(c.newsArticles, []).length, 0);

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Competitor Intelligence</h1>
          <p className="text-muted-foreground mt-1">
            Monitor competitor capabilities, contract activity, and market positioning.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            className="bg-background/50 backdrop-blur-md border-white/10 hover:bg-white/5 hover:text-white text-sm"
            onClick={researchAll}
            disabled={isResearchingAll || competitors.length === 0}
          >
            {isResearchingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Research All
          </Button>
          <Button
            className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 text-sm"
            onClick={() => setIsAddOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Competitor
          </Button>
        </div>
      </div>

      {/* Stat bar */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Tracked", value: competitors.length, icon: Target, color: "text-sky-300" },
          { label: "Researched", value: researched, icon: Sparkles, color: "text-sky-300" },
          { label: "Contract Signals", value: totalWins, icon: Award, color: "text-sky-300" },
          { label: "News Articles", value: totalNews, icon: Newspaper, color: "text-sky-300" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass-panel rounded-2xl p-4 border border-white/10 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-display font-bold text-white">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search competitors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background/50 border-white/10 focus-visible:ring-primary/50 text-white"
          />
        </div>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-[140px] bg-background/50 border-white/10 text-white">
            <SelectValue placeholder="All Tiers" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-white/10">
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="national">National</SelectItem>
            <SelectItem value="regional">Regional</SelectItem>
            <SelectItem value="local">Local</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary/60" />
        </div>
      ) : competitors.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 min-h-[300px] glass-panel rounded-3xl border border-white/10 flex flex-col items-center justify-center p-12 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 border border-primary/20">
            <Target className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-display font-semibold text-white mb-2">No competitors tracked yet</h3>
          <p className="max-w-sm text-muted-foreground text-sm mb-6 leading-relaxed">
            Start by adding known competitors manually, or load the built-in list of major occupational health companies.
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="border-white/10 hover:bg-white/5"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
            >
              {seedMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
              Load Known Competitors
            </Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={() => setIsAddOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Manually
            </Button>
          </div>
        </motion.div>
      ) : (
        <div className={`grid gap-4 ${selected ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"}`}>
          <AnimatePresence>
            {filtered.map((c) => (
              <CompetitorCard
                key={c.id}
                competitor={c}
                selected={c.id === selectedId}
                onSelect={() => setSelectedId(c.id === selectedId ? null : c.id)}
                onResearch={(e) => { e.stopPropagation(); researchCompetitor(c.id); }}
                isResearching={researchingIds.has(c.id)}
              />
            ))}
          </AnimatePresence>
          {filtered.length === 0 && (
            <div className="col-span-3 flex items-center justify-center py-16 text-muted-foreground text-sm">
              No competitors match your search.
            </div>
          )}
        </div>
      )}

      {/* Detail panel overlay */}
      <AnimatePresence>
        {selected && (
          <DetailPanel
            competitor={selected}
            onClose={() => setSelectedId(null)}
            onResearch={() => researchCompetitor(selected.id)}
            isResearching={researchingIds.has(selected.id)}
          />
        )}
      </AnimatePresence>

      {/* Modals */}
      <CompetitorModal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSave={(data) => createMutation.mutate(data)}
        isSaving={createMutation.isPending}
      />
      {editTarget && (
        <CompetitorModal
          open
          onClose={() => setEditTarget(null)}
          initial={editTarget}
          onSave={(data) => updateMutation.mutate({ id: editTarget.id, ...data })}
          isSaving={updateMutation.isPending}
        />
      )}

      {/* Toast */}
      <AnimatePresence>
        {researchToast && (
          <motion.div
            key={researchToast.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl glass-panel border border-primary/30 shadow-lg shadow-primary/10"
          >
            <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm text-white">{researchToast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
