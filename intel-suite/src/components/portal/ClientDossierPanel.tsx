import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  ReferenceLine,
} from "recharts";
import {
  ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus,
  AlertTriangle, ShieldCheck, Zap,
} from "lucide-react";
import type {
  ClientDossier, DossierMetric, NarrativeSection, SiteRisk,
} from "@/data/client-dossiers";
import { fmtMetric } from "@/data/client-dossiers";

const CHART_COLORS = {
  primary: "#5ea8ff",
  primarySoft: "rgba(94, 168, 255, 0.25)",
  secondary: "#a78bfa",
  secondarySoft: "rgba(167, 139, 250, 0.25)",
  emerald: "#34d399",
  emeraldSoft: "rgba(52, 211, 153, 0.25)",
  rose: "#fb7185",
  roseSoft: "rgba(251, 113, 133, 0.25)",
  amber: "#fbbf24",
  amberSoft: "rgba(251, 191, 36, 0.25)",
  slate: "#94a3b8",
  grid: "rgba(255, 255, 255, 0.06)",
  text: "rgba(207, 250, 254, 0.55)",
};

const PIE_COLORS = ["#5ea8ff", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#60a5fa"];

const SEVERITY_COLORS: Record<string, string> = {
  low: "#34d399",
  medium: "#fbbf24",
  high: "#fb7185",
  critical: "#ef4444",
};

const SEVERITY_BG: Record<string, string> = {
  low: "rgba(52, 211, 153, 0.10)",
  medium: "rgba(251, 191, 36, 0.10)",
  high: "rgba(251, 113, 133, 0.10)",
  critical: "rgba(239, 68, 68, 0.10)",
};

function TrendBadge({ trend, trendLabel }: { trend?: number; trendLabel?: string }) {
  if (trend == null) return null;
  const isUp = trend > 0;
  const isDown = trend < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const color = isUp ? "text-rose-400" : isDown ? "text-emerald-400" : "text-slate-400";
  const bg = isUp ? "bg-rose-500/10" : isDown ? "bg-emerald-500/10" : "bg-white/5";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${bg} ${color}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(trend).toFixed(1)}%{trendLabel ? ` ${trendLabel}` : ""}
    </span>
  );
}

function MetricCard({ metric }: { metric: DossierMetric }) {
  const isNegative = metric.category === "safety" && metric.label.toLowerCase().includes("fatalit");
  const isPositive = metric.category === "safety" && metric.label.toLowerCase().includes("trir") && (metric.trend ?? 0) < 0;
  const accentBorder = isNegative ? "border-rose-500/25" : isPositive ? "border-emerald-500/25" : "border-white/10";
  const accentBg = isNegative ? "bg-rose-500/5" : isPositive ? "bg-emerald-500/5" : "bg-white/[0.02]";

  return (
    <div className={`glass-card rounded-2xl p-4 border ${accentBorder} ${accentBg} hover:-translate-y-0.5 transition-all`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-100/50">{metric.label}</p>
        <TrendBadge trend={metric.trend} trendLabel={metric.trendLabel} />
      </div>
      <p className="text-2xl font-display font-black text-white">{fmtMetric(metric)}</p>
      {metric.sourceNote && (
        <p className="text-[10px] text-cyan-100/40 mt-1.5 leading-relaxed">{metric.sourceNote}</p>
      )}
    </div>
  );
}

function ExecutiveStrip({ dossier }: { dossier: ClientDossier }) {
  const topMetrics = dossier.metrics.filter((m) =>
    ["safety", "workforce", "financial"].includes(m.category)
  ).slice(0, 4);

  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/10">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-emerald-200/70">Key Intelligence Signals</p>
          <h2 className="mt-1 text-2xl font-display font-black text-white">{dossier.shortName} Executive Readout</h2>
        </div>
        <span className="rounded-full border border-cyan-100/18 bg-cyan-200/10 px-4 py-2 text-[10px] text-cyan-50/75">
          Live Dossier View
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {topMetrics.map((m) => (
          <div
            key={m.id}
            className="rounded-2xl border border-cyan-100/10 bg-black/20 p-4 shadow-[inset_0_0_24px_rgba(45,212,191,.06)]"
          >
            <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-100/42">{m.label}</p>
            <p className="mt-2 text-lg font-black text-cyan-50">{fmtMetric(m)}</p>
            {m.trend != null && (
              <p className={`mt-2 text-[11px] leading-5 ${m.trend > 0 ? "text-rose-300/70" : "text-emerald-300/70"}`}>
                {m.trend > 0 ? "▲" : "▼"} {Math.abs(m.trend).toFixed(1)}% {m.trendLabel || "vs prior"}
              </p>
            )}
          </div>
        ))}
      </div>
      {dossier.keyMessage && (
        <div className="mt-4 rounded-xl border border-amber-500/15 bg-amber-500/5 p-4 flex items-start gap-3">
          <Zap className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-200/80 leading-relaxed">{dossier.keyMessage}</p>
        </div>
      )}
    </div>
  );
}

function TrendChart({
  title, data, dataKey, color = CHART_COLORS.primary, soft = CHART_COLORS.primarySoft,
  valueLabel, refLine,
}: {
  title: string;
  data: Array<{ label: string; value: number; secondaryValue?: number }>;
  dataKey: string;
  color?: string;
  soft?: string;
  valueLabel?: string;
  refLine?: number;
}) {
  if (!data || data.length === 0) return null;

  const chartData = data.map((d) => ({
    name: d.label,
    value: d.value,
    ...(d.secondaryValue != null ? { secondary: d.secondaryValue } : {}),
  }));

  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/10">
      <p className="text-xs uppercase tracking-[0.22em] text-cyan-100/50 mb-4">{title}</p>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis dataKey="name" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              contentStyle={{
                background: "rgba(10, 22, 58, 0.92)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10,
                fontSize: 12,
                backdropFilter: "blur(12px)",
              }}
              labelStyle={{ color: "#fff", fontWeight: 600, marginBottom: 4 }}
              formatter={(v: number) => [valueLabel ? `${v} ${valueLabel}` : String(v), ""]}
            />
            {refLine != null && <ReferenceLine y={refLine} stroke={CHART_COLORS.slate} strokeDasharray="4 4" />}
            <Area type="monotone" dataKey="value" stroke={color} fill={`url(#grad-${dataKey})`} strokeWidth={2.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function BenchmarkChart({ benchmarks }: { benchmarks: Array<{ label: string; value: number; isClient?: boolean }> }) {
  if (!benchmarks || benchmarks.length === 0) return null;

  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/10">
      <p className="text-xs uppercase tracking-[0.22em] text-cyan-100/50 mb-4">TRIR Benchmark Comparison</p>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={benchmarks} layout="vertical" margin={{ left: 16, right: 16 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
            <XAxis type="number" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis dataKey="label" type="category" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
            <Tooltip
              contentStyle={{
                background: "rgba(10, 22, 58, 0.92)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10,
                fontSize: 12,
                backdropFilter: "blur(12px)",
              }}
              formatter={(v: number) => [String(v), "TRIR"]}
            />
            <Bar dataKey="value" radius={[0, 8, 8, 0]}>
              {benchmarks.map((entry, index) => (
                <Cell key={entry.label} fill={entry.isClient ? CHART_COLORS.primary : CHART_COLORS.slate} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SiteRiskChart({ risks }: { risks: SiteRisk[] }) {
  if (!risks || risks.length === 0) return null;

  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/10">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <p className="text-xs uppercase tracking-[0.22em] text-cyan-100/50">Site-Level Risk Hotspots</p>
      </div>
      <div className="space-y-3">
        {risks.map((risk) => (
          <div key={risk.site} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-white truncate">{risk.site}</span>
                <span className="text-xs text-muted-foreground">${risk.value.toLocaleString()}</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((risk.value / 70000) * 100, 100)}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{ background: SEVERITY_COLORS[risk.severity || "medium"] }}
                />
              </div>
              {risk.notes && <p className="text-[10px] text-cyan-100/40 mt-1">{risk.notes}</p>}
            </div>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0"
              style={{
                color: SEVERITY_COLORS[risk.severity || "medium"],
                borderColor: SEVERITY_COLORS[risk.severity || "medium"] + "40",
                background: SEVERITY_BG[risk.severity || "medium"],
              }}
            >
              {risk.state}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GeoSegmentChart({ segments }: { segments: Array<{ region: string; revenueShare?: number; workforceShare?: number }> }) {
  if (!segments || segments.length === 0) return null;

  const pieData = segments.map((s) => ({
    name: s.region,
    value: s.revenueShare ?? s.workforceShare ?? 0,
  }));

  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/10">
      <p className="text-xs uppercase tracking-[0.22em] text-cyan-100/50 mb-4">Revenue / Workforce Distribution</p>
      <div className="flex items-center gap-6">
        <div className="h-40 w-40 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={40} paddingAngle={3}>
                {pieData.map((_, index) => (
                  <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "rgba(10, 22, 58, 0.92)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 10,
                  fontSize: 12,
                  backdropFilter: "blur(12px)",
                }}
                formatter={(v: number, name: string) => [`${v}%`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2.5">
          {segments.map((s, i) => (
            <div key={s.region}>
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 text-xs text-white font-medium">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {s.region}
                </span>
                <span className="text-xs text-muted-foreground">{s.revenueShare ?? s.workforceShare ?? 0}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${s.revenueShare ?? s.workforceShare ?? 0}%`, background: PIE_COLORS[i % PIE_COLORS.length] }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NarrativePanel({ section, metrics }: { section: NarrativeSection; metrics: DossierMetric[] }) {
  const [open, setOpen] = useState(false);
  const sectionMetrics = useMemo(() => {
    if (!section.metricIds) return [];
    return metrics.filter((m) => section.metricIds!.includes(m.id));
  }, [section, metrics]);

  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/10">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left">
        <div>
          <h3 className="text-base font-display font-bold text-white">{section.title}</h3>
          <p className="text-sm text-cyan-100/50 mt-1 leading-relaxed line-clamp-2">{section.narrative}</p>
        </div>
        <div className="flex-shrink-0 ml-4">
          {open ? <ChevronUp className="w-4 h-4 text-cyan-100/50" /> : <ChevronDown className="w-4 h-4 text-cyan-100/50" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-white/5 grid gap-4 md:grid-cols-[1fr_.8fr]">
              <ul className="space-y-2">
                {section.bullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-cyan-50/80">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{bullet}</span>
                  </li>
                ))}
              </ul>
              {sectionMetrics.length > 0 && (
                <div className="grid gap-3">
                  {sectionMetrics.map((m) => (
                    <MetricCard key={m.id} metric={m} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ClientDossierPanel({ dossier }: { dossier: ClientDossier }) {
  const safetyMetrics = dossier.metrics.filter((m) => m.category === "safety");
  const workforceMetrics = dossier.metrics.filter((m) => m.category === "workforce");
  const financialMetrics = dossier.metrics.filter((m) => m.category === "financial");

  return (
    <div className="space-y-5">
      {/* Executive strip */}
      <ExecutiveStrip dossier={dossier} />

      {/* All metrics grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {safetyMetrics.slice(0, 4).map((m) => (
          <MetricCard key={m.id} metric={m} />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-5 xl:grid-cols-2">
        {dossier.trends?.trir && (
          <TrendChart
            title="TRIR Trend"
            data={dossier.trends.trir}
            dataKey="trir"
            color={CHART_COLORS.primary}
            soft={CHART_COLORS.primarySoft}
          />
        )}
        {dossier.trends?.ltir && (
          <TrendChart
            title="LTIR Trend"
            data={dossier.trends.ltir}
            dataKey="ltir"
            color={CHART_COLORS.emerald}
            soft={CHART_COLORS.emeraldSoft}
          />
        )}
        {dossier.benchmarks && dossier.benchmarks.length > 0 && (
          <BenchmarkChart benchmarks={dossier.benchmarks} />
        )}
        {dossier.siteRisks && dossier.siteRisks.length > 0 && (
          <SiteRiskChart risks={dossier.siteRisks} />
        )}
        {dossier.geoSegments && dossier.geoSegments.length > 0 && (
          <GeoSegmentChart segments={dossier.geoSegments} />
        )}
        {dossier.trends?.revenue && (
          <TrendChart
            title="Revenue Trend ($M)"
            data={dossier.trends.revenue}
            dataKey="revenue"
            color={CHART_COLORS.secondary}
            soft={CHART_COLORS.secondarySoft}
            valueLabel="$M"
          />
        )}
      </div>

      {/* Narrative sections */}
      <div className="space-y-4">
        {dossier.narrativeSections.map((section) => (
          <NarrativePanel key={section.id} section={section} metrics={dossier.metrics} />
        ))}
      </div>

      {/* Tags footer */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10">
        <p className="text-xs uppercase tracking-[0.22em] text-cyan-100/50 mb-3">Tags</p>
        <div className="flex flex-wrap gap-2">
          {dossier.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-cyan-100/15 bg-cyan-100/5 px-3 py-1 text-xs text-cyan-50/70"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
