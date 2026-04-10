import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import {
  Map, RefreshCw, ExternalLink, Loader2, AlertCircle,
  ShoppingCart, BookOpen, Building2, Heart, Users, Stethoscope,
  ShieldAlert, HardHat, DollarSign, Globe, Activity, Pill, Waves,
  CheckCircle2, Truck, BadgeCheck, Route, Lock, MousePointer2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;
function api(path: string) { return `${BASE}api/${path}`; }

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const STATE_NAME_TO_CODE: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR",
  California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
  "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
  Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA",
  "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV",
  Wisconsin: "WI", Wyoming: "WY",
};

const OSHA_FULL: Set<string> = new Set([
  "AK","AZ","CA","HI","IN","IA","KY","MD","MI","MN","NV","NM","NC","OR",
  "PR","SC","TN","UT","VT","VA","WA","WY",
]);
const OSHA_PUBLIC: Set<string> = new Set([
  "CT","IL","ME","NJ","NY","OH","WI",
]);

type Bucket =
  | "procurement" | "legislature" | "governor_agencies" | "health_dept"
  | "labor_warn" | "medical_licensing" | "emergency_mgmt" | "osha_plan"
  | "insurance_dept" | "corrections" | "fmcsa" | "post_guidelines" | "dot";

type IntelChannel = "public_health" | "travel_advisory" | "fda_recalls" | "disaster";

interface StateProfile {
  stateCode: string; stateName: string; region: string; oshaStatePlan: string;
  procurementUrl?: string; legislatureUrl?: string; govUrl?: string; healthDeptUrl?: string;
  laborUrl?: string; emergencyMgmtUrl?: string; medicalBoardUrl?: string;
  insuranceDeptUrl?: string; correctionsUrl?: string; dotUrl?: string; postCommissionUrl?: string;
  lastRefreshed?: string; itemCount: number;
}

interface StateItem {
  id: string; stateCode: string; bucket: Bucket; title: string;
  summary?: string; url?: string; publishedDate?: string;
  agency?: string; itemType?: string; relevanceScore: number; fetchedAt: string;
}

interface IntelItem {
  id: string; channel: IntelChannel; title: string; summary?: string;
  url?: string; publishedDate?: string; source?: string; severity?: string; fetchedAt: string;
}

const IC = "text-white/60";
const ACTIVE_BG = "bg-primary/12 border-primary/30 text-white";

const BUCKETS: { id: Bucket; label: string; icon: React.ReactNode; color: string; activeBg: string; desc: string }[] = [
  { id: "procurement",       label: "Procurement",       icon: <ShoppingCart className="w-3.5 h-3.5" />,  color: IC, activeBg: ACTIVE_BG, desc: "RFPs, bids & state contract opportunities" },
  { id: "legislature",       label: "Legislature",       icon: <BookOpen className="w-3.5 h-3.5" />,       color: IC, activeBg: ACTIVE_BG, desc: "Bills, session activity & regulatory trends" },
  { id: "governor_agencies", label: "Gov / Agencies",    icon: <Building2 className="w-3.5 h-3.5" />,     color: IC, activeBg: ACTIVE_BG, desc: "Executive orders & major agency announcements" },
  { id: "health_dept",       label: "Health Dept",       icon: <Heart className="w-3.5 h-3.5" />,          color: IC, activeBg: ACTIVE_BG, desc: "State health alerts, bulletins & policy" },
  { id: "labor_warn",        label: "Labor / WARN",      icon: <Users className="w-3.5 h-3.5" />,          color: IC, activeBg: ACTIVE_BG, desc: "WARN notices, layoffs & workforce signals" },
  { id: "medical_licensing", label: "Med Licensing",     icon: <Stethoscope className="w-3.5 h-3.5" />,    color: IC, activeBg: ACTIVE_BG, desc: "State medical & nursing board actions" },
  { id: "emergency_mgmt",    label: "Emergency Mgmt",    icon: <ShieldAlert className="w-3.5 h-3.5" />,    color: IC, activeBg: ACTIVE_BG, desc: "Disaster declarations & emergency ops" },
  { id: "osha_plan",         label: "OSHA Plan",         icon: <HardHat className="w-3.5 h-3.5" />,        color: IC, activeBg: ACTIVE_BG, desc: "State OSHA enforcement & workplace safety" },
  { id: "insurance_dept",    label: "Insurance",         icon: <DollarSign className="w-3.5 h-3.5" />,     color: IC, activeBg: ACTIVE_BG, desc: "Insurance bulletins & workers comp changes" },
  { id: "corrections",       label: "Corrections",       icon: <Lock className="w-3.5 h-3.5" />,           color: IC, activeBg: ACTIVE_BG, desc: "Corrections health services & procurement" },
  { id: "fmcsa",             label: "FMCSA / CDL",       icon: <Truck className="w-3.5 h-3.5" />,          color: IC, activeBg: ACTIVE_BG, desc: "DOT medical exams, CDL physicals & FMCSA" },
  { id: "post_guidelines",   label: "POST",              icon: <BadgeCheck className="w-3.5 h-3.5" />,     color: IC, activeBg: ACTIVE_BG, desc: "Law enforcement POST physical standards" },
  { id: "dot",               label: "State DOT",         icon: <Route className="w-3.5 h-3.5" />,          color: IC, activeBg: ACTIVE_BG, desc: "State transportation contracts & infrastructure" },
];

const INTEL_CHANNELS: { id: IntelChannel; label: string; icon: React.ReactNode; color: string; activeBg: string; desc: string }[] = [
  { id: "public_health",   label: "Public Health",     icon: <Activity className="w-3.5 h-3.5" />, color: IC, activeBg: ACTIVE_BG, desc: "CDC HAN & state health alert networks" },
  { id: "travel_advisory", label: "Travel Advisories", icon: <Globe className="w-3.5 h-3.5" />,    color: IC, activeBg: ACTIVE_BG, desc: "CDC travel notices & State Dept advisories" },
  { id: "fda_recalls",     label: "FDA Recalls",       icon: <Pill className="w-3.5 h-3.5" />,     color: IC, activeBg: ACTIVE_BG, desc: "FDA MedWatch safety alerts & drug recalls" },
  { id: "disaster",        label: "FEMA Disasters",    icon: <Waves className="w-3.5 h-3.5" />,    color: IC, activeBg: ACTIVE_BG, desc: "OpenFEMA disaster declarations" },
];

const OSHA_BADGE: Record<string, { label: string; cls: string }> = {
  full:        { label: "State OSHA Plan",    cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/35" },
  public_only: { label: "Public Sector Only", cls: "bg-amber-500/20 text-amber-300 border-amber-500/35" },
  federal:     { label: "Federal OSHA",       cls: "bg-slate-500/20 text-slate-300 border-slate-500/35" },
};

const SEV_BADGE: Record<string, string> = {
  high:   "bg-red-500/20 text-red-300 border-red-500/35",
  medium: "bg-amber-500/20 text-amber-300 border-amber-500/35",
  low:    "bg-slate-500/15 text-slate-400 border-slate-500/25",
};

const ITEM_TYPE_BADGE: Record<string, string> = {
  rfp: "bg-sky-500/20 text-sky-300", rfi: "bg-violet-500/20 text-violet-300",
  award: "bg-emerald-500/20 text-emerald-300", legislation: "bg-purple-500/20 text-purple-300",
  notice: "bg-amber-500/20 text-amber-300", warn: "bg-red-500/20 text-red-300",
  safety: "bg-orange-500/20 text-orange-300", emergency: "bg-rose-500/20 text-rose-300",
  news: "bg-slate-500/20 text-slate-300",
};

function getBucketUrl(state: StateProfile, bucket: Bucket): string | undefined {
  const map: Partial<Record<Bucket, string | undefined>> = {
    procurement: state.procurementUrl, legislature: state.legislatureUrl,
    governor_agencies: state.govUrl, health_dept: state.healthDeptUrl,
    labor_warn: state.laborUrl, emergency_mgmt: state.emergencyMgmtUrl,
    medical_licensing: state.medicalBoardUrl, insurance_dept: state.insuranceDeptUrl,
    corrections: state.correctionsUrl, dot: state.dotUrl, post_guidelines: state.postCommissionUrl,
  };
  return map[bucket];
}

export default function StateAgenciesPage() {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [activeBucket, setActiveBucket] = useState<Bucket>("procurement");
  const [activeIntelChannel, setActiveIntelChannel] = useState<IntelChannel>("public_health");
  const [view, setView] = useState<"state" | "intel">("state");

  const qc = useQueryClient();
  const { toast } = useToast();

  const statesQ = useQuery<{ states: StateProfile[] }>({
    queryKey: ["state-agencies-states"],
    queryFn: () => fetch(api("state-agencies/states")).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const itemsQ = useQuery<{ items: StateItem[]; bucketCounts: Record<string, number> }>({
    queryKey: ["state-items", selectedState, activeBucket],
    queryFn: () => fetch(api(`state-agencies/items?stateCode=${selectedState}&bucket=${activeBucket}`)).then((r) => r.json()),
    enabled: !!selectedState,
    staleTime: 2 * 60 * 1000,
  });

  const intelQ = useQuery<{ items: IntelItem[]; channelCounts: Record<string, number> }>({
    queryKey: ["state-intel", activeIntelChannel],
    queryFn: () => fetch(api(`state-agencies/intel?channel=${activeIntelChannel}`)).then((r) => r.json()),
    staleTime: 2 * 60 * 1000,
  });

  const refreshBucket = useMutation({
    mutationFn: (vars: { stateCode: string; bucket: Bucket }) =>
      fetch(api("state-agencies/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      }).then((r) => r.json()),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["state-items", vars.stateCode] });
      qc.invalidateQueries({ queryKey: ["state-agencies-states"] });
      const label = BUCKETS.find((b) => b.id === vars.bucket)?.label ?? vars.bucket;
      toast({ title: `${label} refreshed`, description: `${data.added ?? 0} items loaded for ${vars.stateCode}` });
    },
    onError: () => toast({ title: "Refresh failed", variant: "destructive" }),
  });

  const refreshIntel = useMutation({
    mutationFn: (channel: IntelChannel) =>
      fetch(api("state-agencies/intel/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      }).then((r) => r.json()),
    onSuccess: (data, channel) => {
      qc.invalidateQueries({ queryKey: ["state-intel", channel] });
      const label = INTEL_CHANNELS.find((c) => c.id === channel)?.label ?? channel;
      toast({ title: `${label} refreshed`, description: `${data.added ?? 0} items loaded` });
    },
    onError: () => toast({ title: "Refresh failed", variant: "destructive" }),
  });

  const allStates = statesQ.data?.states ?? [];
  const selectedProfile = allStates.find((s) => s.stateCode === selectedState);
  const stateMap = useMemo(() => Object.fromEntries(allStates.map((s) => [s.stateCode, s])), [allStates]);
  const statesWithData = useMemo(() => new Set(allStates.filter((s) => s.itemCount > 0).map((s) => s.stateCode)), [allStates]);

  const bucketCounts = itemsQ.data?.bucketCounts ?? {};
  const channelCounts = intelQ.data?.channelCounts ?? {};
  const totalIntelItems = Object.values(channelCounts).reduce((a, b) => a + b, 0);

  const lastRefreshed = useMemo(() => {
    if (!selectedProfile?.lastRefreshed) return {};
    try { return JSON.parse(selectedProfile.lastRefreshed); } catch { return {}; }
  }, [selectedProfile]);

  const isRefreshingBucket = refreshBucket.isPending && refreshBucket.variables?.bucket === activeBucket;
  const isRefreshingIntel = refreshIntel.isPending && refreshIntel.variables === activeIntelChannel;
  const hoveredProfile = hoveredState ? stateMap[hoveredState] : null;

  function getStateStyle(code: string) {
    const isSelected = selectedState === code && view === "state";
    const isHovered = hoveredState === code;
    const hasData = statesWithData.has(code);
    const oshaFull = OSHA_FULL.has(code);
    const oshaPublic = OSHA_PUBLIC.has(code);

    if (isSelected) {
      return {
        fill: "rgba(56,139,253,0.55)",
        stroke: "rgba(147,197,253,1)",
        strokeWidth: 1.8,
        filter: "drop-shadow(0 0 12px rgba(74,160,255,1)) drop-shadow(0 0 28px rgba(30,120,255,0.75))",
        cursor: "pointer",
      };
    }
    if (isHovered) {
      return {
        fill: "rgba(56,100,220,0.45)",
        stroke: "rgba(147,197,253,0.95)",
        strokeWidth: 1.2,
        filter: "drop-shadow(0 0 8px rgba(100,180,255,0.90)) drop-shadow(0 0 20px rgba(50,130,255,0.55))",
        cursor: "pointer",
      };
    }
    if (hasData) {
      return {
        fill: oshaFull ? "rgba(16,100,80,0.45)" : oshaPublic ? "rgba(100,70,10,0.42)" : "rgba(30,60,180,0.38)",
        stroke: oshaFull ? "rgba(52,211,153,0.75)" : oshaPublic ? "rgba(251,191,36,0.70)" : "rgba(100,160,255,0.55)",
        strokeWidth: 0.8,
        filter: "none",
        cursor: "pointer",
      };
    }
    return {
      fill: oshaFull ? "rgba(16,80,60,0.32)" : oshaPublic ? "rgba(80,55,8,0.32)" : "rgba(20,45,140,0.28)",
      stroke: oshaFull ? "rgba(52,211,153,0.55)" : oshaPublic ? "rgba(251,191,36,0.50)" : "rgba(80,140,255,0.38)",
      strokeWidth: 0.6,
      filter: "none",
      cursor: "pointer",
    };
  }

  return (
    <div className="flex text-white -mx-6 lg:-mx-8 -mb-6 lg:-mb-8 overflow-hidden bg-background" style={{ height: "calc(100vh - 4rem)" }}>

      {/* ── Left panel: US map ─────────────────────────────────────────────── */}
      <div className="w-[46%] min-w-[380px] flex-shrink-0 border-r border-white/10 flex flex-col" style={{ background: "hsl(222,82%,7%)" }}>

        {/* Map header */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center gap-3 flex-shrink-0" style={{ background: "hsl(222,82%,8%)" }}>
          <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Map className="w-3.5 h-3.5 text-primary" />
          </div>
          <h1 className="text-sm font-bold text-white">State Agencies</h1>
          <div className="ml-auto flex items-center gap-4 text-[10px] font-medium">
            <span className="flex items-center gap-1.5 text-white/50">
              <span className="w-5 h-0.5 rounded-full bg-emerald-400/70 inline-block" />
              <span>Full OSHA</span>
            </span>
            <span className="flex items-center gap-1.5 text-white/50">
              <span className="w-5 h-0.5 rounded-full bg-amber-400/65 inline-block" />
              <span>Public Only</span>
            </span>
          </div>
        </div>

        {/* Cross-State Intel button */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <button
            onClick={() => { setView("intel"); setSelectedState(null); }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
              view === "intel"
                ? "bg-purple-500/20 text-purple-200 border-purple-500/35 shadow-lg shadow-purple-500/10"
                : "bg-white/4 border-white/10 text-white/65 hover:bg-white/8 hover:text-white hover:border-white/20"
            }`}
          >
            <div className={`w-5 h-5 rounded-md flex items-center justify-center ${view === "intel" ? "bg-purple-500/30" : "bg-white/8"}`}>
              <Globe className="w-3 h-3" />
            </div>
            Cross-State Intel
            <span className="text-[10px] text-white/40 font-normal hidden sm:inline">CDC · FDA · FEMA · State Dept</span>
            {totalIntelItems > 0 && (
              <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-purple-500/25 text-purple-300 border border-purple-500/30">
                {totalIntelItems}
              </span>
            )}
          </button>
        </div>

        {/* US Geographic Map */}
        <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center px-2 pb-2">
          {/* Ambient glow behind the map */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "radial-gradient(ellipse 70% 50% at 50% 55%, rgba(30,80,220,0.12) 0%, transparent 70%)",
          }} />

          <ComposableMap
            projection="geoAlbersUsa"
            style={{ width: "100%", height: "100%" }}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }: { geographies: Array<{ rsmKey: string; properties: { name?: string } }> }) =>
                geographies.map((geo: { rsmKey: string; properties: { name?: string } }) => {
                  const name: string = geo.properties.name ?? "";
                  const code = STATE_NAME_TO_CODE[name] ?? "";
                  if (!code) return null;
                  const style = getStateStyle(code);
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={() => { setSelectedState(code); setView("state"); }}
                      onMouseEnter={() => setHoveredState(code)}
                      onMouseLeave={() => setHoveredState(null)}
                      style={{
                        default: { ...style, outline: "none" },
                        hover: {
                          fill: "rgba(56,100,220,0.48)",
                          stroke: "rgba(147,197,253,0.95)",
                          strokeWidth: 1.2,
                          filter: "drop-shadow(0 0 8px rgba(100,180,255,0.90)) drop-shadow(0 0 20px rgba(50,130,255,0.55))",
                          cursor: "pointer",
                          outline: "none",
                        },
                        pressed: {
                          fill: "rgba(56,139,253,0.60)",
                          stroke: "rgba(147,197,253,1)",
                          strokeWidth: 1.8,
                          filter: "drop-shadow(0 0 14px rgba(74,160,255,1)) drop-shadow(0 0 32px rgba(30,120,255,0.75))",
                          cursor: "pointer",
                          outline: "none",
                        },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>

          {/* Hover tooltip */}
          <AnimatePresence>
            {hoveredProfile && (
              <motion.div
                key={hoveredProfile.stateCode}
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.12 }}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none z-10"
              >
                <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-white/20 shadow-2xl backdrop-blur-md"
                  style={{ background: "hsl(222,82%,10%)" }}>
                  <span className="font-black text-primary text-sm tracking-wide">{hoveredProfile.stateCode}</span>
                  <span className="text-xs text-white/80 font-medium">{hoveredProfile.stateName}</span>
                  {OSHA_BADGE[hoveredProfile.oshaStatePlan] && (
                    <Badge variant="outline" className={`text-[9px] ${OSHA_BADGE[hoveredProfile.oshaStatePlan].cls}`}>
                      {OSHA_BADGE[hoveredProfile.oshaStatePlan].label}
                    </Badge>
                  )}
                  {hoveredProfile.itemCount > 0 && (
                    <span className="text-[10px] font-semibold text-primary/80 bg-primary/15 px-1.5 py-0.5 rounded-md">
                      {hoveredProfile.itemCount}
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Selected state quick strip */}
        {selectedProfile && view === "state" && (
          <div className="border-t border-white/10 px-4 py-2.5 flex-shrink-0 flex items-center gap-2.5"
            style={{ background: "linear-gradient(90deg, rgba(56,139,253,0.10) 0%, rgba(30,60,180,0.06) 100%)" }}>
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/35 flex items-center justify-center shrink-0">
              <span className="text-[11px] font-black text-primary">{selectedProfile.stateCode}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{selectedProfile.stateName}</p>
              <p className="text-[10px] text-white/45">{selectedProfile.region}</p>
            </div>
            {OSHA_BADGE[selectedProfile.oshaStatePlan] && (
              <Badge variant="outline" className={`text-[9px] shrink-0 ${OSHA_BADGE[selectedProfile.oshaStatePlan].cls}`}>
                {OSHA_BADGE[selectedProfile.oshaStatePlan].label}
              </Badge>
            )}
            {selectedProfile.itemCount > 0 && (
              <Badge variant="outline" className="text-[9px] border-primary/30 text-primary/80 bg-primary/10 shrink-0">
                {selectedProfile.itemCount} items
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* ── Right panel: detail ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col bg-background">
        <AnimatePresence mode="wait">

          {/* Cross-state intel */}
          {view === "intel" && (
            <motion.div key="intel" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }} className="flex-1 overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-white/10 flex items-center gap-4"
                style={{ background: "linear-gradient(135deg, rgba(147,51,234,0.08) 0%, transparent 60%)" }}>
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5 text-purple-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-bold text-white">Cross-State Intelligence</h2>
                  <p className="text-xs text-white/45 mt-0.5">CDC · FDA MedWatch · OpenFEMA · State Dept Advisories</p>
                </div>
              </div>
              <div className="px-5 pt-3 pb-2.5 border-b border-white/8 flex gap-2 flex-wrap items-center">
                {INTEL_CHANNELS.map((ch) => (
                  <button key={ch.id} onClick={() => setActiveIntelChannel(ch.id)} title={ch.desc}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      activeIntelChannel === ch.id
                        ? ch.activeBg
                        : "border-white/8 bg-white/3 text-white/50 hover:text-white/80 hover:bg-white/7 hover:border-white/15"
                    }`}>
                    <span className={activeIntelChannel === ch.id ? "" : ch.color}>{ch.icon}</span>
                    {ch.label}
                    {channelCounts[ch.id] > 0 && (
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-white/10 text-white/50 ml-0.5">{channelCounts[ch.id]}</span>
                    )}
                  </button>
                ))}
                <div className="ml-auto">
                  <Button size="sm" variant="outline" onClick={() => refreshIntel.mutate(activeIntelChannel)} disabled={isRefreshingIntel}
                    className="h-7 text-xs border-white/15 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white">
                    {isRefreshingIntel ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                    Refresh
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <IntelItemGrid items={intelQ.data?.items ?? []} isLoading={intelQ.isLoading} />
              </div>
            </motion.div>
          )}

          {/* State detail */}
          {view === "state" && selectedProfile && (
            <motion.div key={`state-${selectedState}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }} className="flex-1 overflow-hidden flex flex-col">

              {/* State header */}
              <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3.5"
                style={{ background: "linear-gradient(135deg, rgba(56,139,253,0.10) 0%, transparent 60%)" }}>
                <div className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0 shadow-lg shadow-primary/10">
                  <span className="text-base font-black text-primary">{selectedProfile.stateCode}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-white">{selectedProfile.stateName}</h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-white/45">{selectedProfile.region}</span>
                    {OSHA_BADGE[selectedProfile.oshaStatePlan] && (
                      <Badge variant="outline" className={`text-[9px] ${OSHA_BADGE[selectedProfile.oshaStatePlan].cls}`}>
                        {OSHA_BADGE[selectedProfile.oshaStatePlan].label}
                      </Badge>
                    )}
                    {selectedProfile.itemCount > 0 && (
                      <Badge variant="outline" className="text-[9px] border-primary/25 text-primary/70 bg-primary/8">{selectedProfile.itemCount} items</Badge>
                    )}
                  </div>
                </div>
                {/* Quick links */}
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {[
                    { url: selectedProfile.procurementUrl, label: "Procurement" },
                    { url: selectedProfile.legislatureUrl, label: "Legislature" },
                    { url: selectedProfile.healthDeptUrl, label: "Health" },
                    { url: selectedProfile.dotUrl, label: "DOT" },
                  ].filter((l) => l.url).slice(0, 4).map((l) => (
                    <a key={l.label} href={l.url} target="_blank" rel="noreferrer"
                      className="text-[10px] px-2 py-1 rounded-lg border border-white/12 bg-white/4 text-white/50 hover:text-white/80 hover:border-white/22 hover:bg-white/8 transition-all flex items-center gap-1 font-medium">
                      {l.label} <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ))}
                </div>
              </div>

              {/* Bucket tabs */}
              <div className="px-4 py-2.5 border-b border-white/8 flex gap-1.5 overflow-x-auto flex-shrink-0 scrollbar-none" style={{ background: "hsl(222,82%,8%)", scrollbarWidth: "none" }}>
                {BUCKETS.map((b) => {
                  const count = bucketCounts[b.id] ?? 0;
                  const refreshed = lastRefreshed[b.id];
                  const isActive = activeBucket === b.id;
                  return (
                    <button key={b.id} onClick={() => setActiveBucket(b.id)} title={b.desc}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all border whitespace-nowrap ${
                        isActive ? b.activeBg : "border-transparent bg-transparent text-white/45 hover:text-white/75 hover:bg-white/6"
                      }`}>
                      <span className={isActive ? "" : b.color}>{b.icon}</span>
                      <span>{b.label}</span>
                      {count > 0 ? (
                        <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${isActive ? "bg-white/15 text-white/70" : "bg-white/8 text-white/35"}`}>{count}</span>
                      ) : refreshed ? (
                        <CheckCircle2 className="w-2.5 h-2.5 opacity-30" />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 overflow-hidden flex flex-col">
                <BucketPanel
                  state={selectedProfile}
                  bucket={activeBucket}
                  items={itemsQ.data?.items ?? []}
                  isLoading={itemsQ.isLoading}
                  isRefreshing={isRefreshingBucket}
                  lastRefreshed={lastRefreshed[activeBucket]}
                  onRefresh={() => refreshBucket.mutate({ stateCode: selectedState!, bucket: activeBucket })}
                />
              </div>
            </motion.div>
          )}

          {/* No state selected — inviting empty state */}
          {view === "state" && !selectedState && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-center text-center p-10 relative overflow-hidden">

              {/* Background ambient glow */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-[0.07]"
                  style={{ background: "radial-gradient(circle, hsl(205,82%,62%) 0%, transparent 70%)" }} />
              </div>

              {/* Icon */}
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-2xl border border-primary/25 flex items-center justify-center shadow-2xl shadow-primary/10"
                  style={{ background: "linear-gradient(135deg, rgba(56,139,253,0.15) 0%, rgba(30,60,180,0.08) 100%)" }}>
                  <MousePointer2 className="w-9 h-9 text-primary/70" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <Map className="w-3 h-3 text-emerald-400" />
                </div>
              </div>

              <h3 className="text-lg font-bold text-white mb-2">Select a State</h3>
              <p className="text-sm text-white/50 max-w-sm leading-relaxed mb-8">
                Click any state on the map to explore procurement, legislative, health, labor, FMCSA, POST, and DOT intelligence.
              </p>

              {/* Category grid preview */}
              <div className="grid grid-cols-4 gap-2 max-w-sm w-full mb-8">
                {BUCKETS.slice(0, 8).map((b) => (
                  <div key={b.id} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-white/8 bg-white/3">
                    <span className={b.color}>{b.icon}</span>
                    <span className="text-[9px] text-white/40 font-medium leading-tight text-center">{b.label}</span>
                  </div>
                ))}
              </div>

              <Button variant="outline" size="sm"
                className="border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 hover:text-purple-200 hover:border-purple-500/45 transition-all font-semibold"
                onClick={() => setView("intel")}>
                <Globe className="w-3.5 h-3.5 mr-2" />
                View Cross-State Intel
              </Button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Bucket Panel ──────────────────────────────────────────────────────────────

function BucketPanel({ state, bucket, items, isLoading, isRefreshing, lastRefreshed, onRefresh }: {
  state: StateProfile; bucket: Bucket; items: StateItem[];
  isLoading: boolean; isRefreshing: boolean; lastRefreshed?: string; onRefresh: () => void;
}) {
  const cfg = BUCKETS.find((b) => b.id === bucket)!;
  const officialUrl = getBucketUrl(state, bucket);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="px-5 py-2.5 flex items-center gap-3 border-b border-white/8 bg-white/2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cfg.activeBg.split(" ").slice(0,2).join(" ")}`}>
          <span className={cfg.color}>{cfg.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-bold text-white">{cfg.label}</span>
          <span className="text-xs text-white/35 ml-2 hidden xl:inline">{cfg.desc}</span>
        </div>
        {officialUrl && (
          <a href={officialUrl} target="_blank" rel="noreferrer"
            className="text-xs text-white/40 hover:text-primary flex items-center gap-1 transition-colors font-medium">
            Official Source <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {lastRefreshed && (
          <span className="text-[10px] text-white/25 hidden sm:block">{new Date(lastRefreshed).toLocaleDateString()}</span>
        )}
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={isRefreshing}
          className="h-7 text-xs border-white/15 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white">
          {isRefreshing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
          Refresh
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-white/40">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading {cfg.label} data…</span>
          </div>
        ) : items.length === 0 ? (
          <EmptyBucket cfg={cfg} stateName={state.stateName} onRefresh={onRefresh} isRefreshing={isRefreshing} />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {items.map((item) => <StateItemCard key={item.id} item={item} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function StateItemCard({ item }: { item: StateItem }) {
  const typeBadge = ITEM_TYPE_BADGE[item.itemType ?? "news"] ?? ITEM_TYPE_BADGE.news;
  const score = item.relevanceScore ?? 0;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="group relative bg-white/4 hover:bg-white/7 border border-white/10 hover:border-white/20 rounded-xl p-4 transition-all cursor-default">
      {score >= 30 && (
        <div className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(56,139,253,0.8)]" />
      )}
      <div className="flex items-start gap-2 mb-2">
        {item.itemType && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${typeBadge}`}>
            {item.itemType.toUpperCase()}
          </span>
        )}
        <h4 className="text-sm font-semibold text-white leading-tight line-clamp-2">{item.title}</h4>
      </div>
      {item.summary && (
        <p className="text-xs text-white/55 line-clamp-3 mb-3 leading-relaxed">{item.summary}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] text-white/35 font-medium">
          {item.agency && <span>{item.agency}</span>}
          {item.fetchedAt && <span className="text-white/22">· {new Date(item.fetchedAt).toLocaleDateString()}</span>}
        </div>
        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-[10px] text-white/35 hover:text-primary transition-colors opacity-0 group-hover:opacity-100 font-medium">
            Open <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    </motion.div>
  );
}

function IntelItemGrid({ items, isLoading }: { items: IntelItem[]; isLoading: boolean }) {
  if (isLoading) return (
    <div className="flex items-center justify-center gap-3 py-16 text-white/40">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-sm">Loading intelligence…</span>
    </div>
  );
  if (!items.length) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white/4 border border-white/10 flex items-center justify-center mb-4">
        <AlertCircle className="w-7 h-7 text-white/30" />
      </div>
      <p className="text-sm font-semibold text-white/60 mb-1">No items yet</p>
      <p className="text-xs text-white/35 max-w-xs">Click Refresh to pull the latest data from CDC, FDA, FEMA, and State Dept.</p>
    </div>
  );
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {items.map((item) => (
        <motion.div key={item.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="group bg-white/4 hover:bg-white/7 border border-white/10 hover:border-white/20 rounded-xl p-4 transition-all cursor-default">
          <div className="flex items-start gap-2 mb-2">
            {item.severity && (
              <Badge variant="outline" className={`text-[10px] shrink-0 ${SEV_BADGE[item.severity] ?? SEV_BADGE.low}`}>
                {item.severity.toUpperCase()}
              </Badge>
            )}
            <h4 className="text-sm font-semibold text-white leading-tight line-clamp-2">{item.title}</h4>
          </div>
          {item.summary && <p className="text-xs text-white/55 line-clamp-3 mb-3 leading-relaxed">{item.summary}</p>}
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-white/35 flex gap-2 font-medium">
              {item.source && <span>{item.source}</span>}
              {item.fetchedAt && <span className="text-white/22">· {new Date(item.fetchedAt).toLocaleDateString()}</span>}
            </div>
            {item.url && (
              <a href={item.url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-[10px] text-white/35 hover:text-primary transition-colors opacity-0 group-hover:opacity-100 font-medium">
                Open <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function EmptyBucket({ cfg, stateName, onRefresh, isRefreshing }: {
  cfg: { label: string; color: string; icon: React.ReactNode; desc: string; activeBg: string };
  stateName: string; onRefresh: () => void; isRefreshing: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center mb-4 ${cfg.activeBg.split(" ").slice(0, 2).join(" ")} border-white/10`}>
        <span className={`${cfg.color} scale-125`}>{cfg.icon}</span>
      </div>
      <p className="text-sm font-semibold text-white/70 mb-1">No {cfg.label} data for {stateName}</p>
      <p className="text-xs text-white/38 mb-6 max-w-xs leading-relaxed">{cfg.desc}</p>
      <Button size="sm" variant="outline" onClick={onRefresh} disabled={isRefreshing}
        className="border-white/15 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 font-semibold">
        {isRefreshing ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
        Load {cfg.label} Data
      </Button>
    </div>
  );
}
