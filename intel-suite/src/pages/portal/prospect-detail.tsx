import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useLocation as useWouterLocation } from "wouter";
import {
  ArrowLeft, MapPin, Users, Globe, Calendar, Building2, Sparkles,
  RefreshCw, Zap, ChevronDown, ChevronUp, ExternalLink, Search,
  Factory, FlaskConical, Warehouse, Truck, GraduationCap,
  Landmark, Briefcase, HeartPulse, AlertCircle, X, SlidersHorizontal,
  Crown, DollarSign, Scale, ShieldAlert, CheckCircle, Cpu, Package,
  LayoutGrid, MessageSquare, Target, Layers, Star, UserCheck
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────
interface Prospect {
  id: string; name: string; website?: string; description?: string;
  industry?: string; headquarters?: string; employeeCount?: string;
  founded?: string; naicsCodes?: string; status: string; tier: string;
  researchSummary?: string; opportunitySignals?: string;
}

interface Location {
  id: string; prospectId: string; name?: string;
  type: string; city?: string; state?: string; country: string;
  address?: string; employeeEstimate?: string; description?: string;
  openPositions: number; healthPositions: number; hiringTrend?: string;
  hiringCategories?: string; jobsLastUpdated?: string; sourceUrl?: string;
}

interface Job {
  id: string; prospectId: string; locationId?: string; title: string;
  department?: string; rawLocation?: string; jobType?: string;
  postedDate?: string; url?: string; snippet?: string;
  isHealthRelated: boolean; healthRelevanceReason?: string;
}

interface Contact {
  id: string; prospectId: string; name: string; category: string;
  title?: string; department?: string; isEhsContact: boolean; isKeyContact: boolean;
  linkedinUrl?: string; email?: string; notes?: string;
}

// ── Contact category config ───────────────────────────────────────────────────
const CONTACT_CATEGORY_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string; border: string; order: number }> = {
  ehs_safety:               { label: "EHS & Safety",               icon: ShieldAlert,   color: "text-sky-300", bg: "bg-sky-500/12", border: "border-sky-500/22", order: 1 },
  quality:                  { label: "Quality",                     icon: CheckCircle,   color: "text-sky-300", bg: "bg-sky-500/12", border: "border-sky-500/22", order: 2 },
  ceo_leadership:           { label: "Executive Leadership",        icon: Crown,         color: "text-sky-300", bg: "bg-sky-500/12", border: "border-sky-500/22", order: 3 },
  human_resources:          { label: "Human Resources",             icon: Users,         color: "text-sky-300", bg: "bg-sky-500/12", border: "border-sky-500/22", order: 4 },
  operations:               { label: "Operations",                  icon: Layers,        color: "text-sky-300", bg: "bg-sky-500/12", border: "border-sky-500/22", order: 5 },
  business_unit:            { label: "Business Units",              icon: LayoutGrid,    color: "text-sky-300", bg: "bg-sky-500/12", border: "border-sky-500/22", order: 6 },
  procurement_supply_chain: { label: "Procurement & Supply Chain",  icon: Package,       color: "text-sky-300", bg: "bg-sky-500/12", border: "border-sky-500/22", order: 7 },
  finance:                  { label: "Finance",                     icon: DollarSign,    color: "text-sky-300", bg: "bg-sky-500/12", border: "border-sky-500/22", order: 8 },
  legal_compliance:         { label: "Legal & Compliance",          icon: Scale,         color: "text-sky-300", bg: "bg-sky-500/12", border: "border-sky-500/22", order: 9 },
  technology:               { label: "Technology & Digital",        icon: Cpu,           color: "text-sky-300", bg: "bg-sky-500/12", border: "border-sky-500/22", order: 10 },
  strategy:                 { label: "Strategy",                    icon: Target,        color: "text-sky-300", bg: "bg-sky-500/12", border: "border-sky-500/22", order: 11 },
  communications:           { label: "Communications",              icon: MessageSquare, color: "text-sky-300", bg: "bg-sky-500/12", border: "border-sky-500/22", order: 12 },
  board_governance:         { label: "Board & Governance",          icon: Landmark,      color: "text-sky-300", bg: "bg-sky-500/12", border: "border-sky-500/22", order: 13 },
  other:                    { label: "Other",                       icon: UserCheck,     color: "text-sky-300", bg: "bg-sky-500/10", border: "border-sky-500/15", order: 14 },
};

// ── Config ────────────────────────────────────────────────────────────────────
const LOCATION_TYPE_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  headquarters:   { label: "Headquarters",   icon: Landmark,      color: "text-sky-300", bg: "bg-sky-500/12" },
  manufacturing:  { label: "Manufacturing",   icon: Factory,       color: "text-sky-300", bg: "bg-sky-500/12" },
  office:         { label: "Office",          icon: Building2,     color: "text-sky-300", bg: "bg-sky-500/12" },
  research:       { label: "R&D",             icon: FlaskConical,  color: "text-sky-300", bg: "bg-sky-500/12" },
  testing:        { label: "Test Facility",   icon: FlaskConical,  color: "text-sky-300", bg: "bg-sky-500/12" },
  warehouse:      { label: "Warehouse",       icon: Warehouse,     color: "text-sky-300", bg: "bg-sky-500/12" },
  training:       { label: "Training",        icon: GraduationCap, color: "text-sky-300", bg: "bg-sky-500/12" },
  distribution:   { label: "Distribution",   icon: Truck,         color: "text-sky-300", bg: "bg-sky-500/12" },
  service_center: { label: "Service Center", icon: Briefcase,     color: "text-sky-300", bg: "bg-sky-500/12" },
  other:          { label: "Other",           icon: Building2,     color: "text-sky-300", bg: "bg-sky-500/10" },
};

const HIRING_TREND = {
  high:   { label: "Actively Hiring", dot: "bg-emerald-400", text: "text-emerald-400", ring: "ring-emerald-400/30" },
  medium: { label: "Hiring",          dot: "bg-amber-400",   text: "text-amber-400",   ring: "ring-amber-400/30" },
  low:    { label: "Limited Hiring",  dot: "bg-slate-400",   text: "text-slate-400",   ring: "ring-slate-400/30" },
  none:   { label: "No Postings",     dot: "bg-white/20",    text: "text-muted-foreground", ring: "ring-white/10" },
};

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  strategic:    { label: "STRATEGIC",  color: "text-rose-400",  bg: "bg-rose-500/15",  border: "border-rose-500/25" },
  enterprise:   { label: "ENTERPRISE", color: "text-primary",   bg: "bg-primary/15",   border: "border-primary/25" },
  "mid-market": { label: "MID-MARKET", color: "text-sky-400",   bg: "bg-sky-500/15",   border: "border-sky-500/25" },
};

// ── Location Card ─────────────────────────────────────────────────────────────
function LocationCard({ loc, jobs, onDelete }: { loc: Location; jobs: Job[]; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const locType = LOCATION_TYPE_CONFIG[loc.type] || LOCATION_TYPE_CONFIG.other;
  const trend = HIRING_TREND[loc.hiringTrend as keyof typeof HIRING_TREND] || HIRING_TREND.none;
  const TypeIcon = locType.icon;
  const categories: { category: string; count: number }[] = loc.hiringCategories ? JSON.parse(loc.hiringCategories) : [];
  const locJobs = jobs.filter((j) => j.locationId === loc.id);
  const healthJobs = locJobs.filter((j) => j.isHealthRelated);

  return (
    <motion.div layout className="glass-card rounded-xl overflow-hidden">
      {/* Card header */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Type icon */}
            <div className={`w-9 h-9 rounded-lg ${locType.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
              <TypeIcon className={`w-4 h-4 ${locType.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${locType.bg} ${locType.color}`}>
                  {locType.label}
                </span>
                {loc.openPositions > 0 && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 ${trend.bg || "bg-transparent"} ${trend.text} ${trend.ring}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${trend.dot} mr-1`} />
                    {trend.label}
                  </span>
                )}
              </div>
              <h4 className="text-sm font-semibold text-white truncate">{loc.name || `${loc.city || ""}, ${loc.country}`}</h4>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span>{[loc.city, loc.state, loc.country].filter(Boolean).join(", ")}</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {loc.employeeEstimate && (
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-white">{loc.employeeEstimate}</div>
                <div className="text-[10px] text-muted-foreground">employees</div>
              </div>
            )}
            {loc.openPositions > 0 && (
              <div className="text-right">
                <div className="text-sm font-bold text-white">{loc.openPositions}</div>
                <div className="text-[10px] text-muted-foreground">openings</div>
              </div>
            )}
            {healthJobs.length > 0 && (
              <div className="text-right">
                <div className="text-sm font-bold text-rose-400">{healthJobs.length}</div>
                <div className="text-[10px] text-muted-foreground">health</div>
              </div>
            )}
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Description */}
        {loc.description && !expanded && (
          <p className="text-xs text-muted-foreground mt-2 ml-12 line-clamp-1">{loc.description}</p>
        )}
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/8 px-4 pb-4 pt-3 overflow-hidden"
          >
            {loc.description && (
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{loc.description}</p>
            )}

            {/* Category breakdown */}
            {categories.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Hiring by Department</div>
                <div className="flex flex-wrap gap-1.5">
                  {categories.sort((a, b) => b.count - a.count).map((cat) => (
                    <span key={cat.category} className={`text-xs px-2 py-1 rounded-lg flex items-center gap-1 ${
                      cat.category === "Health & Safety" ? "bg-rose-500/20 text-rose-300" : "bg-secondary/60 text-secondary-foreground"
                    }`}>
                      {cat.category === "Health & Safety" && <HeartPulse className="w-3 h-3" />}
                      {cat.category} <span className="font-semibold">{cat.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Job listings for this location */}
            {locJobs.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Open Positions</div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {locJobs.map((job) => (
                    <a key={job.id} href={job.url || "#"} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors group">
                      <div className="flex items-center gap-2 min-w-0">
                        {job.isHealthRelated && <HeartPulse className="w-3 h-3 text-rose-400 flex-shrink-0" />}
                        <span className="text-xs text-white truncate">{job.title}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {job.department && (
                          <span className="text-[10px] text-muted-foreground hidden sm:block">{job.department}</span>
                        )}
                        <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-accent transition-colors" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {locJobs.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No job postings matched to this location yet.</p>
            )}

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
              {loc.sourceUrl && (
                <a href={loc.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] text-accent hover:underline flex items-center gap-1">
                  <Globe className="w-3 h-3" /> Source
                </a>
              )}
              <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="text-[10px] text-destructive hover:text-destructive/80 flex items-center gap-1 ml-auto">
                <X className="w-3 h-3" /> Remove location
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Job Row ───────────────────────────────────────────────────────────────────
function JobRow({ job, locationName }: { job: Job; locationName?: string }) {
  return (
    <a href={job.url || "#"} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group border border-white/5 hover:border-white/10">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${job.isHealthRelated ? "bg-rose-500/20" : "bg-secondary/60"}`}>
        {job.isHealthRelated ? <HeartPulse className="w-4 h-4 text-rose-400" /> : <Briefcase className="w-4 h-4 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{job.title}</div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {job.department && <span className="text-[10px] text-muted-foreground">{job.department}</span>}
          {locationName && <span className="text-[10px] text-muted-foreground">· {locationName}</span>}
          {job.rawLocation && !locationName && <span className="text-[10px] text-muted-foreground">· {job.rawLocation}</span>}
          {job.postedDate && <span className="text-[10px] text-muted-foreground">· {job.postedDate}</span>}
          {job.jobType && <span className="text-[10px] bg-secondary/60 text-secondary-foreground px-1.5 py-0.5 rounded">{job.jobType}</span>}
        </div>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-accent transition-colors flex-shrink-0" />
    </a>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProspectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useWouterLocation();
  const { toast } = useToast();

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "locations" | "hiring" | "org">("overview");
  const [contactSearch, setContactSearch] = useState("");
  const [contactFilter, setContactFilter] = useState("all");

  const [discoveringLocations, setDiscoveringLocations] = useState(false);
  const [discoveringJobs, setDiscoveringJobs] = useState(false);

  const [jobSearch, setJobSearch] = useState("");
  const [jobFilterHealth, setJobFilterHealth] = useState(false);
  const [jobFilterDept, setJobFilterDept] = useState("all");
  const [locSearch, setLocSearch] = useState("");
  const [locFilterType, setLocFilterType] = useState("all");
  const [locFilterTrend, setLocFilterTrend] = useState("all");

  async function loadAll() {
    if (!id) return;
    setLoading(true);
    try {
      const [pRes, lRes, jRes, cRes] = await Promise.all([
        fetch(`${BASE}/api/prospects`),
        fetch(`${BASE}/api/prospects/${id}/locations`),
        fetch(`${BASE}/api/prospects/${id}/jobs`),
        fetch(`${BASE}/api/prospects/${id}/contacts`),
      ]);
      const pData = await pRes.json();
      const lData = await lRes.json();
      const jData = await jRes.json();
      const cData = await cRes.json();
      const found = (pData.prospects || []).find((p: Prospect) => p.id === id);
      setProspect(found || null);
      setLocations(lData.locations || []);
      setJobs(jData.jobs || []);
      setContacts(cData.contacts || []);
    } catch {
      toast({ title: "Error loading prospect", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, [id]);

  async function discoverLocations() {
    setDiscoveringLocations(true);
    try {
      const res = await fetch(`${BASE}/api/prospects/${id}/discover-locations`, { method: "POST" });
      const data = await res.json();
      if (data.error) {
        toast({
          title: "Location discovery failed",
          description: data.error,
          variant: "destructive",
          action: (
            <ToastAction altText="Open Settings" onClick={() => navigate("/portal/settings")}>
              Open Settings
            </ToastAction>
          ),
        });
        return;
      }
      setLocations(data.locations || []);
      if ((data.added ?? 0) === 0 && (data.total ?? 0) === 0) {
        toast({
          title: "No locations found",
          description: data.message || "Try checking that your Serper and Gemini API keys are configured.",
          action: (
            <ToastAction altText="Open Settings" onClick={() => navigate("/portal/settings")}>
              Open Settings
            </ToastAction>
          ),
        });
      } else {
        toast({ title: `${data.added} new locations discovered`, description: `${data.total} total worldwide branches` });
        setActiveTab("locations");
      }
    } catch (e: any) {
      toast({ title: "Location discovery failed", description: e.message, variant: "destructive" });
    } finally {
      setDiscoveringLocations(false);
    }
  }

  async function discoverJobs() {
    setDiscoveringJobs(true);
    try {
      const res = await fetch(`${BASE}/api/prospects/${id}/discover-jobs`, { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setJobs(data.jobs || []);
      setLocations(data.locations || []);
      toast({
        title: `${data.stats?.jobsFound || 0} job postings pulled`,
        description: `${data.stats?.healthJobs || 0} health/safety roles identified`,
      });
      setActiveTab("hiring");
    } catch (e: any) {
      toast({ title: "Job discovery failed", description: e.message, variant: "destructive" });
    } finally {
      setDiscoveringJobs(false);
    }
  }

  async function deleteLocation(locId: string) {
    try {
      await fetch(`${BASE}/api/prospects/${id}/locations/${locId}`, { method: "DELETE" });
      setLocations((prev) => prev.filter((l) => l.id !== locId));
      setJobs((prev) => prev.filter((j) => j.locationId !== locId));
      toast({ title: "Location removed" });
    } catch {
      toast({ title: "Failed to remove location", variant: "destructive" });
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const naics: string[] = prospect?.naicsCodes ? JSON.parse(prospect.naicsCodes) : [];
  const signals: any[] = prospect?.opportunitySignals ? JSON.parse(prospect.opportunitySignals) : [];
  const tier = prospect ? (TIER_CONFIG[prospect.tier] || TIER_CONFIG.enterprise) : TIER_CONFIG.enterprise;

  // Locations by country
  const locationsByCountry = useMemo(() => {
    const filtered = locations.filter((l) => {
      const matchSearch = !locSearch || [l.name, l.city, l.country, l.state].some(
        (f) => f?.toLowerCase().includes(locSearch.toLowerCase())
      );
      const matchType = locFilterType === "all" || l.type === locFilterType;
      const matchTrend = locFilterTrend === "all" || l.hiringTrend === locFilterTrend;
      return matchSearch && matchType && matchTrend;
    });
    const grouped: Record<string, Location[]> = {};
    filtered.forEach((l) => {
      const key = l.country || "Unknown";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(l);
    });
    return Object.entries(grouped).sort((a, b) => {
      if (a[0] === "United States") return -1;
      if (b[0] === "United States") return 1;
      return a[0].localeCompare(b[0]);
    });
  }, [locations, locSearch, locFilterType, locFilterTrend]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      const matchSearch = !jobSearch || j.title.toLowerCase().includes(jobSearch.toLowerCase()) ||
        j.department?.toLowerCase().includes(jobSearch.toLowerCase()) ||
        j.rawLocation?.toLowerCase().includes(jobSearch.toLowerCase());
      const matchHealth = !jobFilterHealth || j.isHealthRelated;
      const matchDept = jobFilterDept === "all" || j.department === jobFilterDept;
      return matchSearch && matchHealth && matchDept;
    });
  }, [jobs, jobSearch, jobFilterHealth, jobFilterDept]);

  const departments = useMemo(() => {
    const depts = new Set(jobs.map((j) => j.department).filter(Boolean));
    return Array.from(depts).sort();
  }, [jobs]);

  const locationCountryChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    locations.forEach((l) => {
      const c = l.country || "Unknown";
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([country, count]) => ({ country: country === "United States" ? "USA" : country, count }));
  }, [locations]);

  const locationTypeChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    locations.forEach((l) => {
      const t = l.type || "other";
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, value]) => ({
        name: LOCATION_TYPE_CONFIG[type]?.label || "Other",
        value,
      }));
  }, [locations]);

  const deptChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    jobs.forEach((j) => {
      const d = j.department || "General";
      counts[d] = (counts[d] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([dept, count]) => ({ dept, count }));
  }, [jobs]);

  const totalOpenPositions = locations.reduce((acc, l) => acc + (l.openPositions || 0), 0);
  const totalHealthPositions = locations.reduce((acc, l) => acc + (l.healthPositions || 0), 0);
  const countriesCount = new Set(locations.map((l) => l.country)).size;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (!prospect) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-muted-foreground">Prospect not found.</p>
        <Button onClick={() => navigate("/portal/prospects")} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Prospects
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 h-full overflow-hidden">
      {/* ── Back + header ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 pb-5">
        <button onClick={() => navigate("/portal/prospects")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors mb-4 group">
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          All Prospects
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tier.bg} ${tier.color} ${tier.border}`}>
                {tier.label}
              </span>
              {prospect.industry && (
                <span className="text-xs text-muted-foreground">{prospect.industry}</span>
              )}
            </div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">{prospect.name}</h1>
            {prospect.headquarters && (
              <div className="flex items-center gap-1.5 text-muted-foreground text-sm mt-1">
                <MapPin className="w-3.5 h-3.5" /> {prospect.headquarters}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={discoverLocations} disabled={discoveringLocations}
              className="border-white/10 hover:bg-white/5 text-sm">
              {discoveringLocations ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
              {discoveringLocations ? "Discovering…" : "Discover Locations"}
            </Button>
            <Button variant="outline" onClick={discoverJobs} disabled={discoveringJobs}
              className="border-white/10 hover:bg-white/5 text-sm">
              {discoveringJobs ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              {discoveringJobs ? "Pulling Jobs…" : "Pull Hiring Data"}
            </Button>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { label: "Org Contacts",        value: contacts.length,                          color: "text-amber-400",  icon: Users },
            { label: "EHS Contacts",        value: contacts.filter(c=>c.isEhsContact).length, color: "text-rose-400",   icon: ShieldAlert },
            { label: "Worldwide Branches",  value: locations.length,                          color: "text-primary",    icon: Building2 },
            { label: "Open Positions",      value: totalOpenPositions,                        color: "text-sky-400",    icon: Briefcase },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="glass-panel rounded-xl p-3 flex items-center gap-3">
              <Icon className={`w-4 h-4 ${color} flex-shrink-0`} />
              <div>
                <div className={`text-xl font-display font-bold ${color}`}>{value}</div>
                <div className="text-[10px] text-muted-foreground">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-5 bg-white/5 rounded-xl p-1 w-fit flex-wrap">
          {[
            { key: "overview",   label: "Overview" },
            { key: "org",        label: "Org Structure", badge: contacts.length,   badgeColor: "bg-amber-500/20 text-amber-400" },
            { key: "locations",  label: "Locations",     badge: locations.length,  badgeColor: "bg-primary/20 text-primary" },
            { key: "hiring",     label: "Hiring",        badge: jobs.length,       badgeColor: "bg-sky-500/20 text-sky-400" },
          ].map(({ key, label, badge, badgeColor }) => (
            <button key={key} onClick={() => setActiveTab(key as any)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === key ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-white"
              }`}>
              {label}
              {badge != null && badge > 0 && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pb-6">
            <div className="space-y-4">
              {prospect.description && (
                <div className="glass-panel rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">About</h3>
                  <p className="text-sm text-foreground/80 leading-relaxed">{prospect.description}</p>
                </div>
              )}
              {naics.length > 0 && (
                <div className="glass-panel rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">NAICS Codes</h3>
                  <div className="flex flex-wrap gap-2">
                    {naics.map((code) => (
                      <span key={code} className="font-mono text-xs bg-secondary/80 px-2.5 py-1.5 rounded-lg border border-white/8">{code}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="glass-panel rounded-2xl p-5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Facts</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Employees", value: prospect.employeeCount, icon: Users },
                    { label: "Founded", value: prospect.founded, icon: Calendar },
                    { label: "Website", value: prospect.website ? new URL(prospect.website).hostname.replace("www.","") : null, icon: Globe, href: prospect.website },
                    { label: "Industry", value: prospect.industry, icon: Building2 },
                  ].filter(f => f.value).map(({ label, value, icon: Icon, href }) => (
                    <div key={label} className="glass-surface rounded-xl p-3">
                      <Icon className="w-3.5 h-3.5 text-primary mb-1" />
                      <div className="text-[10px] text-muted-foreground">{label}</div>
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-accent hover:underline truncate block">{value}</a>
                      ) : (
                        <div className="text-xs font-medium text-white">{value}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              {prospect.researchSummary && (
                <div className="glass-panel rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-accent" /> AI Intelligence Summary
                  </h3>
                  <p className="text-sm text-foreground/80 leading-relaxed">{prospect.researchSummary}</p>
                </div>
              )}
              {signals.length > 0 && (
                <div className="glass-panel rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-accent" /> Opportunity Signals
                  </h3>
                  <div className="space-y-2">
                    {signals.map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-start gap-2 p-2.5 rounded-xl glass-surface hover:bg-white/5 transition-colors group">
                        <span className="text-[10px] font-semibold bg-accent/15 text-accent px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">{s.type}</span>
                        <p className="text-xs text-foreground/75 leading-snug flex-1 line-clamp-2">{s.title}</p>
                        <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-accent flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {!prospect.researchSummary && signals.length === 0 && (
                <div className="glass-panel rounded-2xl p-8 text-center">
                  <Sparkles className="w-8 h-8 text-primary/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No AI research yet. Go back to the prospects list and click the ✦ Research button to generate intelligence.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ORG STRUCTURE TAB */}
        {activeTab === "org" && (
          <div className="pb-6">
            {contacts.length === 0 ? (
              <div className="glass-panel rounded-2xl p-12 text-center">
                <Users className="w-12 h-12 text-primary/30 mx-auto mb-4" />
                <h3 className="text-xl font-display font-semibold text-white mb-3">No org structure loaded</h3>
                <p className="text-muted-foreground text-sm">Organizational contacts will appear here once added.</p>
              </div>
            ) : (
              <>
                {/* EHS Key Contacts — pinned at top */}
                {contacts.filter(c => c.isEhsContact).length > 0 && (
                  <div className="mb-7">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                      <h3 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">EHS & Safety Contacts — Primary Buyers</h3>
                      <span className="text-xs bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full">{contacts.filter(c => c.isEhsContact).length}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {contacts.filter(c => c.isEhsContact).map(contact => (
                        <div key={contact.id} className="rounded-xl p-4 border border-rose-500/30 bg-rose-500/8">
                          <div className="flex items-start justify-between gap-2">
                            <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-rose-400">
                              {contact.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                            </div>
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
                          </div>
                          <div className="mt-2">
                            <div className="text-sm font-semibold text-white">{contact.name}</div>
                            {contact.title && <div className="text-xs text-rose-300/80 mt-0.5 leading-snug">{contact.title}</div>}
                          </div>
                          {contact.linkedinUrl && (
                            <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-accent hover:underline flex items-center gap-1 mt-2">
                              <ExternalLink className="w-3 h-3" /> LinkedIn
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Search + filter bar */}
                <div className="flex gap-3 mb-5">
                  <div className="relative flex-1 min-w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)}
                      placeholder="Search contacts…" className="pl-8 bg-white/5 border-white/10 text-sm h-9" />
                  </div>
                  <select value={contactFilter} onChange={(e) => setContactFilter(e.target.value)}
                    className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                    <option value="all">All Departments</option>
                    {Object.entries(CONTACT_CATEGORY_CONFIG)
                      .sort((a, b) => a[1].order - b[1].order)
                      .map(([key, cfg]) => (
                        <option key={key} value={key}>{cfg.label}</option>
                      ))}
                  </select>
                </div>

                {/* Grouped by category */}
                {(() => {
                  const filtered = contacts.filter(c => {
                    const matchSearch = !contactSearch ||
                      c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
                      c.title?.toLowerCase().includes(contactSearch.toLowerCase());
                    const matchFilter = contactFilter === "all" || c.category === contactFilter;
                    return matchSearch && matchFilter;
                  });

                  const grouped = filtered.reduce((acc, c) => {
                    const key = c.category || "other";
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(c);
                    return acc;
                  }, {} as Record<string, Contact[]>);

                  return Object.entries(grouped)
                    .sort((a, b) => {
                      const aOrder = CONTACT_CATEGORY_CONFIG[a[0]]?.order ?? 99;
                      const bOrder = CONTACT_CATEGORY_CONFIG[b[0]]?.order ?? 99;
                      return aOrder - bOrder;
                    })
                    .map(([category, cats]) => {
                      const cfg = CONTACT_CATEGORY_CONFIG[category] || CONTACT_CATEGORY_CONFIG.other;
                      const CatIcon = cfg.icon;
                      return (
                        <div key={category} className="mb-6">
                          <div className="flex items-center gap-2 mb-3">
                            <div className={`w-6 h-6 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                              <CatIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
                            </div>
                            <h4 className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</h4>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cats.length}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {cats.map(contact => (
                              <div key={contact.id} className={`rounded-xl p-3.5 border ${cfg.border} bg-white/3 hover:bg-white/5 transition-colors`}>
                                <div className="flex items-center gap-2.5">
                                  <div className={`w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center flex-shrink-0 text-xs font-bold ${cfg.color}`}>
                                    {contact.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm font-medium text-white truncate">{contact.name}</span>
                                      {contact.isEhsContact && <ShieldAlert className="w-3 h-3 text-rose-400 flex-shrink-0" />}
                                    </div>
                                    {contact.title && (
                                      <div className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{contact.title}</div>
                                    )}
                                  </div>
                                </div>
                                {contact.linkedinUrl && (
                                  <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer"
                                    className="text-[10px] text-accent hover:underline flex items-center gap-1 mt-2">
                                    <ExternalLink className="w-2.5 h-2.5" /> LinkedIn
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                })()}
              </>
            )}
          </div>
        )}

        {/* LOCATIONS TAB */}
        {activeTab === "locations" && (
          <div className="pb-6">
            {/* Charts — shown only when there are locations */}
            {locations.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                {/* Bar chart: locations by country */}
                <div className="glass-panel rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Locations by Country</h3>
                  <ResponsiveContainer width="100%" height={Math.max(180, locationCountryChartData.length * 28)}>
                    <BarChart data={locationCountryChartData} layout="vertical" margin={{ left: 4, right: 16, top: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="country" tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                        itemStyle={{ color: "hsl(var(--primary))" }}
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Donut chart: facility types */}
                <div className="glass-panel rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Facility Types</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={locationTypeChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={78}
                        paddingAngle={2}
                      >
                        {locationTypeChartData.map((_, idx) => {
                          const palette = [
                            "hsl(var(--primary))",
                            "#f59e0b", "#f97316", "#8b5cf6", "#06b6d4",
                            "#10b981", "#ec4899", "#6366f1", "#84cc16", "#ef4444",
                          ];
                          return <Cell key={idx} fill={palette[idx % palette.length]} />;
                        })}
                      </Pie>
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
                      />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        itemStyle={{ color: "hsl(var(--foreground))" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex gap-3 mb-5 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input value={locSearch} onChange={(e) => setLocSearch(e.target.value)}
                  placeholder="Search locations…" className="pl-8 bg-white/5 border-white/10 text-sm h-9" />
              </div>
              <select value={locFilterType} onChange={(e) => setLocFilterType(e.target.value)}
                className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                <option value="all">All Types</option>
                {Object.entries(LOCATION_TYPE_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <select value={locFilterTrend} onChange={(e) => setLocFilterTrend(e.target.value)}
                className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                <option value="all">All Trends</option>
                <option value="high">Actively Hiring</option>
                <option value="medium">Hiring</option>
                <option value="low">Limited</option>
                <option value="none">No Postings</option>
              </select>
            </div>

            {locations.length === 0 ? (
              <div className="glass-panel rounded-2xl p-12 text-center">
                <Globe className="w-12 h-12 text-primary/30 mx-auto mb-4" />
                <h3 className="text-xl font-display font-semibold text-white mb-3">No locations discovered yet</h3>
                <p className="text-muted-foreground text-sm mb-5 max-w-sm mx-auto">
                  Click "Discover Locations" to find all worldwide branches and facilities using AI-powered web research.
                </p>
                <Button onClick={discoverLocations} disabled={discoveringLocations}>
                  {discoveringLocations ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
                  Discover Locations
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {locationsByCountry.map(([country, locs]) => (
                  <div key={country}>
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-white">{country}</h3>
                      <span className="text-xs text-muted-foreground">({locs.length})</span>
                    </div>
                    <div className="space-y-2">
                      {locs.map((loc) => (
                        <LocationCard key={loc.id} loc={loc} jobs={jobs} onDelete={() => deleteLocation(loc.id)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* HIRING INTELLIGENCE TAB */}
        {activeTab === "hiring" && (
          <div className="pb-6">
            {/* Summary bar */}
            {jobs.length > 0 && (
              <div className="flex gap-3 mb-5 flex-wrap">
                {[
                  { label: "Total Postings", value: jobs.length, color: "text-white" },
                  { label: "Health/Safety", value: jobs.filter(j => j.isHealthRelated).length, color: "text-rose-400" },
                  { label: "Showing", value: filteredJobs.length, color: "text-accent" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="glass-surface rounded-xl px-4 py-2 flex items-center gap-2">
                    <span className={`text-lg font-display font-bold ${color}`}>{value}</span>
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Department breakdown bar chart */}
            {deptChartData.length > 0 && (
              <div className="glass-panel rounded-2xl p-5 mb-5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Job Postings by Department</h3>
                <ResponsiveContainer width="100%" height={Math.max(160, deptChartData.length * 30)}>
                  <BarChart data={deptChartData} layout="vertical" margin={{ left: 4, right: 16, top: 0, bottom: 0 }}>
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="dept" tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={110} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {deptChartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.dept === "Health & Safety" ? "#f43f5e" : "hsl(var(--primary))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Filters */}
            <div className="flex gap-3 mb-5 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input value={jobSearch} onChange={(e) => setJobSearch(e.target.value)}
                  placeholder="Search jobs…" className="pl-8 bg-white/5 border-white/10 text-sm h-9" />
              </div>
              <select value={jobFilterDept} onChange={(e) => setJobFilterDept(e.target.value)}
                className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                <option value="all">All Departments</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <button onClick={() => setJobFilterHealth(!jobFilterHealth)}
                className={`h-9 px-3 rounded-lg border text-sm flex items-center gap-2 transition-colors ${
                  jobFilterHealth ? "bg-rose-500/20 border-rose-500/40 text-rose-300" : "bg-white/5 border-white/10 text-muted-foreground hover:text-white"
                }`}>
                <HeartPulse className="w-3.5 h-3.5" /> Health Only
              </button>
            </div>

            {jobs.length === 0 ? (
              <div className="glass-panel rounded-2xl p-12 text-center">
                <Briefcase className="w-12 h-12 text-primary/30 mx-auto mb-4" />
                <h3 className="text-xl font-display font-semibold text-white mb-3">No hiring data yet</h3>
                <p className="text-muted-foreground text-sm mb-5 max-w-sm mx-auto">
                  Click "Pull Hiring Data" to scrape job postings across all locations and identify health and safety hiring trends.
                </p>
                <Button onClick={discoverJobs} disabled={discoveringJobs}>
                  {discoveringJobs ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                  Pull Hiring Data
                </Button>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No jobs match your filters.</div>
            ) : (
              <div className="space-y-2">
                {filteredJobs.map((job) => {
                  const loc = locations.find((l) => l.id === job.locationId);
                  const locName = loc ? [loc.city, loc.country].filter(Boolean).join(", ") : undefined;
                  return <JobRow key={job.id} job={job} locationName={locName} />;
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
