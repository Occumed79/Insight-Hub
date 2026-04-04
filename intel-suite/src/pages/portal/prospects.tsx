import { useState, useEffect, useMemo } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation as useWouterLocation } from "wouter";
import {
  UserSearch, Plus, RefreshCw, ExternalLink, MapPin, Users, Building2,
  X, ChevronRight, Sparkles, Globe, Search, Calendar, Zap, ArrowUpRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────
interface Prospect {
  id: string;
  name: string;
  website?: string;
  description?: string;
  industry?: string;
  headquarters?: string;
  employeeCount?: string;
  founded?: string;
  naicsCodes?: string;
  status: "prospect" | "lead" | "qualified" | "active";
  tier: "strategic" | "enterprise" | "mid-market";
  notes?: string;
  researchSummary?: string;
  opportunitySignals?: string;
  intelligenceSources?: string;
  lastResearched?: string;
  createdAt: string;
}

// ── Status / tier config ──────────────────────────────────────────────────────
const STATUS_CONFIG = {
  prospect:  { label: "PROSPECT",  bg: "bg-slate-500/20",  text: "text-slate-300",  border: "border-slate-500/30" },
  lead:      { label: "LEAD",      bg: "bg-amber-500/20",  text: "text-amber-300",  border: "border-amber-500/30" },
  qualified: { label: "QUALIFIED", bg: "bg-emerald-500/20",text: "text-emerald-300",border: "border-emerald-500/30" },
  active:    { label: "ACTIVE",    bg: "bg-primary/20",    text: "text-primary",    border: "border-primary/30" },
};

const TIER_CONFIG = {
  strategic:   { label: "STRATEGIC",   color: "text-rose-400",  bg: "bg-rose-500/15",  border: "border-rose-500/25" },
  enterprise:  { label: "ENTERPRISE",  color: "text-primary",   bg: "bg-primary/15",   border: "border-primary/25" },
  "mid-market":{ label: "MID-MARKET",  color: "text-sky-400",   bg: "bg-sky-500/15",   border: "border-sky-500/25" },
};

// ── Seed data ─────────────────────────────────────────────────────────────────
const SEED_PROSPECTS = [
  {
    name: "Airbus Defence and Space", website: "https://www.airbus.com/en/products-services/defence",
    description: "Global aerospace and defense manufacturer with substantial US workforce across manufacturing and engineering facilities.",
    industry: "Defense & Aerospace", headquarters: "Leiden, Netherlands (US: Herndon, VA)",
    employeeCount: "35,000+", founded: "2014", tier: "strategic",
    naicsCodes: ["336411", "336412", "541330", "336415"],
  },
  {
    name: "Boeing", website: "https://www.boeing.com",
    description: "World's largest aerospace company with massive US manufacturing operations across commercial, defense, and space divisions.",
    industry: "Defense & Aerospace", headquarters: "Arlington, VA",
    employeeCount: "170,000+", founded: "1916", tier: "strategic",
    naicsCodes: ["336411", "336412", "336413", "541330"],
  },
  {
    name: "General Atomics", website: "https://www.ga.com",
    description: "Defense technology company specializing in nuclear energy, unmanned aircraft systems, and electromagnetic systems with large San Diego workforce.",
    industry: "Defense Technology", headquarters: "San Diego, CA",
    employeeCount: "16,000+", founded: "1955", tier: "enterprise",
    naicsCodes: ["336411", "541712", "541330", "336415"],
  },
  {
    name: "HENSOLDT", website: "https://www.hensoldt.net",
    description: "German defense electronics company with growing US operations specializing in radar, optronics, and electronic warfare.",
    industry: "Defense Electronics", headquarters: "Taufkirchen, Germany (US: Herndon, VA)",
    employeeCount: "6,800+", founded: "2017", tier: "mid-market",
    naicsCodes: ["334511", "334512", "541330"],
  },
  {
    name: "Kongsberg Defence & Aerospace", website: "https://www.kongsberg.com/kda",
    description: "Norwegian defense company with US operations delivering missile systems, remote weapon stations, and C2 technology.",
    industry: "Defense & Aerospace", headquarters: "Kongsberg, Norway (US: Johnstown, PA)",
    employeeCount: "5,000+", founded: "1814", tier: "mid-market",
    naicsCodes: ["336414", "334511", "541330"],
  },
  {
    name: "Leonardo DRS", website: "https://www.leonardodrs.com",
    description: "US defense electronics subsidiary of Italy's Leonardo, providing advanced technology solutions to US military and government customers.",
    industry: "Defense Electronics", headquarters: "Arlington, VA",
    employeeCount: "10,000+", founded: "2001", tier: "enterprise",
    naicsCodes: ["334511", "334512", "541330", "336415"],
  },
  {
    name: "Northrop Grumman", website: "https://www.northropgrumman.com",
    description: "Major US defense contractor and technology company with a large, geographically dispersed workforce across aerospace, defense, and intelligence sectors.",
    industry: "Defense & Aerospace", headquarters: "Falls Church, VA",
    employeeCount: "100,000+", founded: "1939", tier: "strategic",
    naicsCodes: ["336411", "336414", "541330", "541512"],
  },
  {
    name: "Parsons Corporation", website: "https://www.parsons.com",
    description: "Defense and intelligence contractor specializing in cybersecurity, missile defense, and critical infrastructure with a large government workforce.",
    industry: "Defense IT & Engineering", headquarters: "Centreville, VA",
    employeeCount: "17,000+", founded: "1944", tier: "enterprise",
    naicsCodes: ["541330", "541512", "541519", "236220"],
  },
  {
    name: "Peckham, Inc.", website: "https://www.peckham.org",
    description: "Nonprofit government contractor providing manufacturing and professional services, employing individuals with disabilities and other disadvantaged populations.",
    industry: "Government Manufacturing", headquarters: "Lansing, MI",
    employeeCount: "4,000+", founded: "1976", tier: "mid-market",
    naicsCodes: ["561990", "339993", "811212"],
  },
  {
    name: "Peraton", website: "https://www.peraton.com",
    description: "National security technology company performing highly complex work in space, cyber, intelligence, and defense for the US government.",
    industry: "Defense IT & Intelligence", headquarters: "Herndon, VA",
    employeeCount: "24,000+", founded: "2017", tier: "strategic",
    naicsCodes: ["541512", "541519", "541711", "336414"],
  },
  {
    name: "RTX Corporation", website: "https://www.rtx.com",
    description: "Aerospace and defense giant (formerly Raytheon Technologies) operating Pratt & Whitney, Collins Aerospace, and Raytheon with major manufacturing operations nationwide.",
    industry: "Defense & Aerospace", headquarters: "Arlington, VA",
    employeeCount: "185,000+", founded: "1922", tier: "strategic",
    naicsCodes: ["336412", "334511", "336414", "541330"],
  },
  {
    name: "Safran", website: "https://www.safran-group.com",
    description: "French aerospace and defense manufacturer with significant US operations in aircraft engines, nacelles, and landing systems.",
    industry: "Defense & Aerospace", headquarters: "Paris, France (US: Gainesville, TX)",
    employeeCount: "83,000+", founded: "2005", tier: "enterprise",
    naicsCodes: ["336412", "336413", "336415", "541330"],
  },
  {
    name: "SAIC", website: "https://www.saic.com",
    description: "Technology integrator serving US defense, intelligence, and federal civilian agencies with IT solutions, engineering, and digital transformation services.",
    industry: "Defense IT", headquarters: "Reston, VA",
    employeeCount: "26,000+", founded: "1969", tier: "enterprise",
    naicsCodes: ["541512", "541519", "541330", "541711"],
  },
  {
    name: "Serco Group", website: "https://www.serco.com/na",
    description: "International services company providing defense, justice, immigration, and transport services, with a large US government contracting workforce.",
    industry: "Government Services", headquarters: "Hook, UK (US: Herndon, VA)",
    employeeCount: "50,000+", founded: "1929", tier: "enterprise",
    naicsCodes: ["561990", "541330", "922190", "488190"],
  },
  {
    name: "Tecmotiv (USA) Inc.", website: "https://www.tecmotiv.com",
    description: "Engineering and technical services provider supporting US defense and government programs with specialized workforce solutions.",
    industry: "Defense Engineering", headquarters: "Rockville, MD",
    employeeCount: "500+", founded: "2010", tier: "mid-market",
    naicsCodes: ["541330", "541512", "336415"],
  },
  {
    name: "Thales Group", website: "https://www.thalesgroup.com",
    description: "French multinational defense and technology company with major US operations in air traffic management, defense electronics, and cybersecurity.",
    industry: "Defense Electronics", headquarters: "La Défense, France (US: Falls Church, VA)",
    employeeCount: "77,000+", founded: "1893", tier: "strategic",
    naicsCodes: ["334511", "334512", "541512", "336411"],
  },
  {
    name: "United Launch Alliance", website: "https://www.ulalaunch.com",
    description: "National security launch provider operating Atlas V and Vulcan Centaur rockets for US government satellite missions with specialized workforce.",
    industry: "Space Launch", headquarters: "Centennial, CO",
    employeeCount: "2,300+", founded: "2006", tier: "mid-market",
    naicsCodes: ["336415", "541330", "541712"],
  },
];

// ── Prospect Card ─────────────────────────────────────────────────────────────
function ProspectCard({
  prospect,
  isSelected,
  onSelect,
  onResearch,
  researching,
}: {
  prospect: Prospect;
  isSelected: boolean;
  onSelect: () => void;
  onResearch: (e: React.MouseEvent) => void;
  researching: boolean;
}) {
  const naics: string[] = prospect.naicsCodes ? JSON.parse(prospect.naicsCodes) : [];
  const signals: any[] = prospect.opportunitySignals ? JSON.parse(prospect.opportunitySignals) : [];
  const status = STATUS_CONFIG[prospect.status];
  const tier = TIER_CONFIG[prospect.tier];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`glass-card rounded-2xl p-5 cursor-pointer transition-all duration-200 ${
        isSelected ? "ring-2 ring-primary/50 -translate-y-0.5" : ""
      }`}
      onClick={onSelect}
    >
      {/* Header: logo + name + research button */}
      <div className="flex items-start gap-3 mb-3">
        <CompanyLogo name={prospect.name} website={prospect.website} size={44} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-display font-semibold text-white leading-snug">{prospect.name}</h3>
            <button
              onClick={onResearch}
              disabled={researching}
              className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors border border-primary/20 disabled:opacity-40 flex-shrink-0 mt-0.5"
              title="Research this prospect"
            >
              {researching ? (
                <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-primary" />
              )}
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tier.bg} ${tier.color} ${tier.border}`}>
              {tier.label}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${status.bg} ${status.text} ${status.border}`}>
              {status.label}
            </span>
            {prospect.lastResearched && (
              <span className="text-[10px] text-accent flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                Researched
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
        <MapPin className="w-3 h-3 flex-shrink-0" />
        <span className="truncate">{prospect.headquarters}</span>
      </div>

      {prospect.industry && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Building2 className="w-3 h-3 flex-shrink-0" />
          <span>{prospect.industry}</span>
        </div>
      )}

      {naics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {naics.slice(0, 3).map((code) => (
            <span key={code} className="text-[10px] bg-secondary/60 text-secondary-foreground px-1.5 py-0.5 rounded font-mono">
              {code}
            </span>
          ))}
          {naics.length > 3 && (
            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5">+{naics.length - 3}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-white/5 pt-3">
        <div className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          <span>{prospect.employeeCount || "—"}</span>
        </div>
        {signals.length > 0 && (
          <div className="flex items-center gap-1 text-accent">
            <Zap className="w-3 h-3" />
            <span>{signals.length} signal{signals.length !== 1 ? "s" : ""}</span>
          </div>
        )}
        <ChevronRight className="w-4 h-4 opacity-40" />
      </div>
    </motion.div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ prospect, onClose, onResearch, researching }: {
  prospect: Prospect;
  onClose: () => void;
  onResearch: () => void;
  researching: boolean;
}) {
  const naics: string[] = prospect.naicsCodes ? JSON.parse(prospect.naicsCodes) : [];
  const signals: any[] = prospect.opportunitySignals ? JSON.parse(prospect.opportunitySignals) : [];
  const status = STATUS_CONFIG[prospect.status];
  const tier = TIER_CONFIG[prospect.tier];

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.2 }}
      className="w-96 flex-shrink-0 glass-panel rounded-2xl flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-6 border-b border-white/8">
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tier.bg} ${tier.color} ${tier.border}`}>
              {tier.label}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${status.bg} ${status.text} ${status.border}`}>
              {status.label}
            </span>
          </div>
          <h2 className="text-xl font-display font-bold text-white leading-snug">{prospect.name}</h2>
          {prospect.headquarters && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {prospect.headquarters}
            </p>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Globe, label: "Website", value: prospect.website ? new URL(prospect.website).hostname.replace("www.", "") : "—", href: prospect.website },
            { icon: Users, label: "Employees", value: prospect.employeeCount || "—" },
            { icon: Calendar, label: "Founded", value: prospect.founded || "—" },
          ].map(({ icon: Icon, label, value, href }) => (
            <div key={label} className="glass-surface rounded-xl p-3 text-center">
              <Icon className="w-3.5 h-3.5 text-primary mx-auto mb-1" />
              <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-medium text-accent hover:underline truncate block"
                  onClick={(e) => e.stopPropagation()}>
                  {value}
                </a>
              ) : (
                <div className="text-xs font-medium text-white truncate">{value}</div>
              )}
            </div>
          ))}
        </div>

        {/* Description */}
        {prospect.description && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">About</h4>
            <p className="text-sm text-foreground/80 leading-relaxed">{prospect.description}</p>
          </div>
        )}

        {/* Industry */}
        {prospect.industry && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Industry</h4>
            <span className="text-sm text-white bg-secondary/60 px-3 py-1 rounded-lg">{prospect.industry}</span>
          </div>
        )}

        {/* NAICS Codes */}
        {naics.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">NAICS Codes</h4>
            <div className="flex flex-wrap gap-1.5">
              {naics.map((code) => (
                <span key={code} className="text-xs bg-secondary/80 text-secondary-foreground px-2 py-1 rounded font-mono border border-white/8">
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Research Summary */}
        {prospect.researchSummary && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-accent" /> AI Intelligence
            </h4>
            <div className="glass-surface rounded-xl p-4">
              <p className="text-sm text-foreground/80 leading-relaxed">{prospect.researchSummary}</p>
            </div>
          </div>
        )}

        {/* Opportunity Signals */}
        {signals.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <Zap className="w-3 h-3 text-accent" /> Opportunity Signals
            </h4>
            <div className="space-y-2">
              {signals.map((signal, i) => (
                <a key={i} href={signal.url} target="_blank" rel="noopener noreferrer"
                  className="block glass-surface rounded-xl p-3 hover:bg-white/5 transition-colors group"
                  onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-semibold bg-accent/15 text-accent px-1.5 py-0.5 rounded">
                          {signal.type}
                        </span>
                        {signal.date && <span className="text-[10px] text-muted-foreground">{signal.date}</span>}
                      </div>
                      <p className="text-xs text-foreground/75 leading-snug line-clamp-2">{signal.title}</p>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-accent flex-shrink-0 mt-0.5 transition-colors" />
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {prospect.notes && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{prospect.notes}</p>
          </div>
        )}
      </div>

      {/* Research button */}
      <div className="p-4 border-t border-white/8">
        <Button onClick={onResearch} disabled={researching} className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30">
          {researching ? (
            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Researching…</>
          ) : (
            <><Sparkles className="w-4 h-4 mr-2" /> Research This Prospect</>
          )}
        </Button>
        {prospect.lastResearched && (
          <p className="text-center text-[10px] text-muted-foreground mt-2">
            Last researched {new Date(prospect.lastResearched).toLocaleDateString()}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ── Add Prospect Modal ────────────────────────────────────────────────────────
function AddModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ name: "", website: "", industry: "", headquarters: "", employeeCount: "", tier: "enterprise" });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/prospects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Prospect added", description: form.name });
      onAdded();
      onClose();
    } catch {
      toast({ title: "Error", description: "Could not add prospect", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative glass-panel rounded-2xl p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-display font-semibold text-white">Add Prospect</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Company Name *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Acme Corporation" className="bg-white/5 border-white/10" required />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Website</label>
            <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="https://..." className="bg-white/5 border-white/10" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Industry</label>
              <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}
                placeholder="Defense & Aerospace" className="bg-white/5 border-white/10" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tier</label>
              <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}
                className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                <option value="strategic">Strategic</option>
                <option value="enterprise">Enterprise</option>
                <option value="mid-market">Mid-Market</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Headquarters</label>
              <Input value={form.headquarters} onChange={(e) => setForm({ ...form, headquarters: e.target.value })}
                placeholder="Arlington, VA" className="bg-white/5 border-white/10" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Employees</label>
              <Input value={form.employeeCount} onChange={(e) => setForm({ ...form, employeeCount: e.target.value })}
                placeholder="10,000+" className="bg-white/5 border-white/10" />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 border-white/10">Cancel</Button>
            <Button type="submit" disabled={saving || !form.name.trim()} className="flex-1">
              {saving ? "Adding…" : "Add Prospect"}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [, navigate] = useWouterLocation();
  const [showAdd, setShowAdd] = useState(false);
  const [researching, setResearching] = useState<Record<string, boolean>>({});
  const [researchingAll, setResearchingAll] = useState(false);
  const { toast } = useToast();

  async function load() {
    try {
      const res = await fetch(`${BASE}/api/prospects`);
      const data = await res.json();
      setProspects(data.prospects || []);
    } catch {
      toast({ title: "Error", description: "Failed to load prospects", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function seedProspects() {
    let added = 0;
    for (const p of SEED_PROSPECTS) {
      try {
        await fetch(`${BASE}/api/prospects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...p, naicsCodes: p.naicsCodes }),
        });
        added++;
      } catch { }
    }
    toast({ title: `${added} prospects loaded`, description: "Defense & aerospace accounts ready for research" });
    load();
  }

  async function research(id: string) {
    setResearching((r) => ({ ...r, [id]: true }));
    try {
      const res = await fetch(`${BASE}/api/prospects/${id}/research`, { method: "POST" });
      const data = await res.json();
      const signals = data.prospect?.opportunitySignals ? JSON.parse(data.prospect.opportunitySignals).length : 0;
      toast({ title: "Research complete", description: `${signals} opportunity signal${signals !== 1 ? "s" : ""} found` });
      await load();
      if (selected?.id === id) {
        setSelected((s) => s ? { ...s, ...data.prospect } : null);
      }
    } catch {
      toast({ title: "Research failed", description: "Check API keys in Integrations", variant: "destructive" });
    } finally {
      setResearching((r) => ({ ...r, [id]: false }));
    }
  }

  async function researchAll() {
    setResearchingAll(true);
    let done = 0;
    for (const p of prospects) {
      await research(p.id);
      done++;
    }
    toast({ title: "Research complete", description: `All ${done} prospects researched` });
    setResearchingAll(false);
  }

  const filtered = useMemo(() => {
    return prospects.filter((p) => {
      const matchSearch = !search || [p.name, p.industry, p.headquarters].some(
        (f) => f?.toLowerCase().includes(search.toLowerCase())
      );
      const matchTier = filterTier === "all" || p.tier === filterTier;
      const matchStatus = filterStatus === "all" || p.status === filterStatus;
      return matchSearch && matchTier && matchStatus;
    });
  }, [prospects, search, filterTier, filterStatus]);

  const totalSignals = prospects.reduce((acc, p) => {
    return acc + (p.opportunitySignals ? JSON.parse(p.opportunitySignals).length : 0);
  }, 0);
  const researched = prospects.filter((p) => p.lastResearched).length;

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Prospect Intelligence</h1>
          <p className="text-muted-foreground mt-1">Defense & aerospace accounts — occupational health opportunity pipeline.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={researchAll} disabled={researchingAll || prospects.length === 0}
            className="border-white/10 hover:bg-white/5">
            {researchingAll ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Research All
          </Button>
          <Button onClick={() => setShowAdd(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" /> Add Prospect
          </Button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: UserSearch, label: "Tracked", value: prospects.length, color: "text-primary" },
          { icon: Sparkles, label: "Researched", value: researched, color: "text-accent" },
          { icon: Zap, label: "Opportunity Signals", value: totalSignals, color: "text-sky-300" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="glass-panel rounded-2xl p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <div className="text-2xl font-display font-bold text-white">{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prospects…"
            className="pl-9 bg-white/5 border-white/10 text-sm" />
        </div>
        <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)}
          className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white min-w-[130px]">
          <option value="all">All Tiers</option>
          <option value="strategic">Strategic</option>
          <option value="enterprise">Enterprise</option>
          <option value="mid-market">Mid-Market</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white min-w-[130px]">
          <option value="all">All Status</option>
          <option value="prospect">Prospect</option>
          <option value="lead">Lead</option>
          <option value="qualified">Qualified</option>
          <option value="active">Active</option>
        </select>
      </div>

      {/* Content */}
      <div className="flex gap-5 flex-1 min-h-0">
        {/* Grid */}
        <div className={`flex-1 min-h-0 overflow-y-auto ${selected ? "hidden md:block" : ""}`}>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : filtered.length === 0 && prospects.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="glass-panel rounded-3xl border border-white/10 flex flex-col items-center justify-center p-12 text-center min-h-[360px]">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20">
                <UserSearch className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-2xl font-display font-semibold text-white mb-4">No prospects tracked yet</h3>
              <p className="max-w-md text-muted-foreground leading-relaxed mb-6">
                Load the built-in list of defense &amp; aerospace companies from your prospect PDFs, or add one manually.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={seedProspects} className="border-white/15">
                  <UserSearch className="w-4 h-4 mr-2" /> Load Defense & Aerospace Prospects
                </Button>
                <Button onClick={() => setShowAdd(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Add Manually
                </Button>
              </div>
            </motion.div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">No prospects match your filters.</div>
          ) : (
            <div className={`grid gap-4 ${selected ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"}`}>
              <AnimatePresence>
                {filtered.map((p) => (
                  <ProspectCard
                    key={p.id}
                    prospect={p}
                    isSelected={selected?.id === p.id}
                    onSelect={() => navigate(`/portal/prospects/${p.id}`)}
                    onResearch={(e) => { e.stopPropagation(); research(p.id); }}
                    researching={!!researching[p.id]}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <AnimatePresence>
          {selected && (
            <DetailPanel
              prospect={selected}
              onClose={() => setSelected(null)}
              onResearch={() => research(selected.id)}
              researching={!!researching[selected.id]}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Add modal */}
      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdded={load} />}
    </div>
  );
}
