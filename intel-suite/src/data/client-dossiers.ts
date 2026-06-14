/**
 * Client Dossier Data Model
 * Generic typed system for visualizing uploaded client intelligence.
 * Seed data: Weatherford + Freeport-McMoRan
 */

export type MetricUnit = "count" | "usd" | "percent" | "score" | "rate";

export type MetricCategory =
  | "safety"
  | "workforce"
  | "financial"
  | "risk"
  | "benchmark"
  | "geographic";

export interface DossierMetric {
  id: string;
  label: string;
  value: number;
  unit: MetricUnit;
  category: MetricCategory;
  trend?: number; // +/- percent change
  trendLabel?: string;
  sourceNote?: string;
}

export interface TrendPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

export interface BenchmarkItem {
  label: string;
  value: number;
  isClient?: boolean;
}

export interface SiteRisk {
  site: string;
  state?: string;
  value: number;
  severity?: "low" | "medium" | "high" | "critical";
  notes?: string;
}

export interface GeoSegment {
  region: string;
  revenueShare?: number;
  workforceShare?: number;
  revenueUsd?: number;
  employees?: number;
}

export interface NarrativeSection {
  id: string;
  title: string;
  narrative: string;
  bullets: string[];
  metricIds?: string[];
}

export interface ClientDossier {
  clientId: string;
  clientName: string;
  shortName: string;
  sector: string;
  headquarters: string;
  employees: number;
  summary: string;
  tags: string[];
  metrics: DossierMetric[];
  narrativeSections: NarrativeSection[];
  trends?: {
    trir?: TrendPoint[];
    ltir?: TrendPoint[];
    recordables?: TrendPoint[];
    revenue?: TrendPoint[];
  };
  benchmarks?: BenchmarkItem[];
  siteRisks?: SiteRisk[];
  geoSegments?: GeoSegment[];
  keyMessage?: string;
}

const formatters: Record<MetricUnit, (v: number) => string> = {
  count: (v) => v.toLocaleString(),
  usd: (v) => {
    if (Math.abs(v) >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  },
  percent: (v) => `${v.toFixed(1)}%`,
  score: (v) => v.toFixed(2),
  rate: (v) => v.toFixed(2),
};

export function fmtMetric(m: DossierMetric): string {
  return formatters[m.unit](m.value);
}

// ── Seed Data ────────────────────────────────────────────────────────────────

export const clientDossiers: ClientDossier[] = [
  {
    clientId: "weatherford",
    clientName: "Weatherford International",
    shortName: "WFRD",
    sector: "Oilfield services, drilling support, global operations",
    headquarters: "Houston, Texas",
    employees: 19000,
    summary:
      "Weatherford is a sustain-the-advantage story. The company shows a 2024 TRIR of 0.12, LTIR of 0.02, zero fatalities, 42 recordable incidents, and 71.46M hours worked. The revised report emphasizes best-in-class oilfield-services safety with a large near-miss pool showing persistent exposure pressure.",
    tags: ["Oilfield services", "TRIR benchmark", "Near misses", "Remote work", "International workforce", "Hearing conservation"],
    metrics: [
      { id: "wfrd-trir", label: "2024 TRIR", value: 0.12, unit: "score", category: "safety", trend: -9.3, trendLabel: "vs prior year" },
      { id: "wfrd-ltir", label: "2024 LTIR", value: 0.02, unit: "score", category: "safety", trend: -9.0 },
      { id: "wfrd-recordables", label: "Recordable Incidents", value: 42, unit: "count", category: "safety", trend: -4.6 },
      { id: "wfrd-near-misses", label: "Near Misses", value: 6380, unit: "count", category: "safety", trend: 8.2 },
      { id: "wfrd-near-miss-freq", label: "Near-Miss Freq Rate", value: 17.87, unit: "rate", category: "safety" },
      { id: "wfrd-workforce", label: "Global Workforce", value: 19000, unit: "count", category: "workforce" },
      { id: "wfrd-na-workers", label: "North America Workers", value: 3518, unit: "count", category: "workforce" },
      { id: "wfrd-intl-pct", label: "International Workforce", value: 81, unit: "percent", category: "workforce" },
      { id: "wfrd-hours", label: "Hours Worked", value: 71457567, unit: "count", category: "workforce" },
    ],
    narrativeSections: [
      {
        id: "overview",
        title: "Overview",
        narrative:
          "Weatherford is a sustain-the-advantage story. The company shows a 2024 TRIR of 0.12, LTIR of 0.02, zero fatalities, 42 recordable incidents, and 71.46M hours worked.",
        bullets: [
          "2024 TRIR is 0.12, described as 93% below the BLS oilfield-services benchmark.",
          "2024 LTIR is 0.02, with only 8 lost-time injuries across the company.",
          "The near-miss pool is large enough to show persistent exposure while recordable injuries remain exceptionally low.",
        ],
        metricIds: ["wfrd-trir", "wfrd-ltir", "wfrd-recordables", "wfrd-near-misses"],
      },
      {
        id: "domestic-footprint",
        title: "Domestic Footprint Reality",
        narrative:
          "Weatherford is a smaller domestic opportunity because most of the workforce sits outside North America.",
        bullets: [
          "81% of the 19,000-worker population is outside North America.",
          "North America is approximately 3,518 workers, or 19% of the total.",
          "At current TRIR, the North American recordable injury burden is small in absolute terms.",
        ],
        metricIds: ["wfrd-workforce", "wfrd-intl-pct", "wfrd-na-workers"],
      },
      {
        id: "near-miss-alarm",
        title: "Near-Miss Number Is the Alarm",
        narrative:
          "The 17.87 near-miss frequency rate and roughly 6,380 near misses are the main leading-indicator issue.",
        bullets: [
          "The report calculates about 152 near misses per recordable injury.",
          "The high near-miss count can signal strong reporting culture, persistent exposure, or both.",
          "The core message is protecting an unusually strong safety advantage, not fixing a broken safety program.",
        ],
        metricIds: ["wfrd-near-miss-freq", "wfrd-near-misses", "wfrd-recordables"],
      },
    ],
    trends: {
      trir: [
        { label: "2020", value: 0.2 },
        { label: "2021", value: 0.19 },
        { label: "2022", value: 0.24 },
        { label: "2023", value: 0.22 },
        { label: "2024", value: 0.12 },
      ],
      ltir: [
        { label: "2020", value: 0.06 },
        { label: "2021", value: 0.03 },
        { label: "2022", value: 0.05 },
        { label: "2023", value: 0.06 },
        { label: "2024", value: 0.02 },
      ],
      recordables: [
        { label: "2020", value: 76 },
        { label: "2021", value: 63 },
        { label: "2022", value: 66 },
        { label: "2023", value: 68 },
        { label: "2024", value: 42 },
      ],
      revenue: [
        { label: "2020", value: 3600 },
        { label: "2021", value: 3600 },
        { label: "2022", value: 4300 },
        { label: "2023", value: 5100 },
        { label: "2024", value: 5500 },
        { label: "2025", value: 4900 },
      ],
    },
    benchmarks: [
      { label: "WFRD", value: 0.12, isClient: true },
      { label: "SLB est", value: 0.19 },
      { label: "Baker Hughes", value: 0.22 },
      { label: "Halliburton", value: 0.27 },
      { label: "BLS OFS", value: 1.6 },
      { label: "BLS Drilling", value: 1.9 },
    ],
    geoSegments: [
      { region: "MENA/Asia", revenueUsd: 2123000000, employees: 6716, revenueShare: 39.4 },
      { region: "Latin America", revenueUsd: 1393000000, employees: 3724, revenueShare: 25.8 },
      { region: "North America", revenueUsd: 1046000000, employees: 3518, revenueShare: 19.4 },
      { region: "Europe/SSA/Russia", revenueUsd: 951000000, employees: 4501, revenueShare: 17.6 },
    ],
    keyMessage:
      "Best-in-class TRIR with high near-miss signal; preserve performance through disciplined occ-med quality and regulatory consistency.",
  },
  {
    clientId: "freeport-mcmoran",
    clientName: "Freeport-McMoRan",
    shortName: "FCX",
    sector: "Copper mining, MSHA-regulated operations, contractor safety, silica surveillance, heat readiness",
    headquarters: "Phoenix, Arizona",
    employees: 53500,
    summary:
      "Freeport-McMoRan presents two safety stories at the same time. The headline TRIR remains strong versus the BLS copper-mining benchmark, but employee TRIR, total workforce TRIR, near-miss frequency, fatalities, and contractor exposure point to readiness and surveillance gaps.",
    tags: ["Copper mining", "MSHA", "Contractor safety", "Near misses", "Fatality signal", "Silica surveillance", "Heat stress"],
    metrics: [
      { id: "fcx-total-trir", label: "2024 Total TRIR", value: 0.69, unit: "score", category: "safety", trend: -0.01 },
      { id: "fcx-employee-trir", label: "2024 Employee TRIR", value: 0.77, unit: "score", category: "safety", trend: 0.02 },
      { id: "fcx-contractor-trir", label: "2024 Contractor TRIR", value: 0.57, unit: "score", category: "safety", trend: -0.05 },
      { id: "fcx-recordables", label: "2024 Recordable Events", value: 419, unit: "count", category: "safety", trend: -19 },
      { id: "fcx-near-miss-rate", label: "Near-Miss Rate", value: 1.61, unit: "rate", category: "safety", trend: 73, trendLabel: "vs 2023" },
      { id: "fcx-fatalities", label: "2024 Fatalities", value: 5, unit: "count", category: "safety", trend: 150, trendLabel: "since 2020" },
      { id: "fcx-workforce", label: "Total Workforce", value: 53500, unit: "count", category: "workforce" },
      { id: "fcx-revenue", label: "FY2024 Revenue", value: 25500000000, unit: "usd", category: "financial", trend: 12 },
    ],
    narrativeSections: [
      {
        id: "overview",
        title: "Overview",
        narrative:
          "FCX presents two safety stories at the same time. The headline TRIR remains strong versus the BLS copper-mining benchmark, but employee TRIR, total workforce TRIR, near-miss frequency, fatalities, and contractor exposure point to readiness and surveillance gaps.",
        bullets: [
          "FY2024 revenue is identified as $25.5B, up 12% year over year.",
          "The combined workforce is modeled at approximately 53,500 workers: 28,500 employees and 25,000 contractors.",
          "2024 total TRIR is 0.69, nearly flat versus 0.70 in 2023, but 33% higher than 2020.",
          "Recordable events fell to 419, the lowest point in the five-year window.",
        ],
        metricIds: ["fcx-revenue", "fcx-workforce", "fcx-total-trir", "fcx-recordables"],
      },
      {
        id: "safety-trend",
        title: "Safety Trend: Strong Benchmark, Mixed Direction",
        narrative:
          "The headline needs nuance. FCX is still far below mining industry TRIR benchmarks, but its total workforce TRIR is higher than in 2020 and contractor TRIR has worsened materially over the five-year window.",
        bullets: [
          "Total recordable events declined 19% from 516 in 2020 to 419 in 2024.",
          "Employee TRIR was 0.77 in 2024, slightly up from 0.75 in 2023.",
          "Contractor TRIR was 0.57 in 2024 and is 58% higher than the 2020 contractor TRIR of 0.36.",
          "Total workforce TRIR was 0.69 in 2024, 33% higher than the 2020 level of 0.52.",
          "Near-miss frequency rose from 0.93 in 2023 to 1.61 in 2024.",
        ],
        metricIds: ["fcx-total-trir", "fcx-employee-trir", "fcx-contractor-trir"],
      },
      {
        id: "fatality-signal",
        title: "Critical Signal: Fatalities and Contractor Exposure",
        narrative:
          "The uploaded report identifies five workforce fatalities in 2024, the worst point in the five-year window, with four of the five involving contract personnel.",
        bullets: [
          "2024 fatalities increased to 5, compared with 2 in 2023 and 1 in both 2021 and 2022.",
          "Four of the five 2024 fatalities involved contract personnel.",
          "Contractor TRIR remains below employee TRIR in absolute terms, but the contractor trend is materially worse than 2020.",
          "A direct-employee-only medical model would miss a major portion of the highest-severity risk signal.",
        ],
        metricIds: ["fcx-fatalities", "fcx-contractor-trir", "fcx-workforce"],
      },
      {
        id: "industry-benchmarking",
        title: "Industry Benchmarking",
        narrative:
          "FCX remains well below broader mining averages. The account should be framed as a mature mining safety program with high-consequence residual risks and a contractor-heavy fatality signal.",
        bullets: [
          "FCX 2024 total workforce TRIR is 0.69.",
          "BLS copper mining benchmark is approximately 1.80, placing FCX roughly 62% below the benchmark.",
          "BLS metal ore mining benchmark is approximately 2.10.",
          "ICMM member average is approximately 2.40, placing FCX roughly 71% below that benchmark.",
        ],
      },
    ],
    trends: {
      trir: [
        { label: "2020", value: 0.52 },
        { label: "2021", value: 0.55 },
        { label: "2022", value: 0.61 },
        { label: "2023", value: 0.70 },
        { label: "2024", value: 0.69 },
      ],
    },
    benchmarks: [
      { label: "FCX", value: 0.69, isClient: true },
      { label: "BLS Copper", value: 1.8 },
      { label: "BLS Metal Ore", value: 2.1 },
      { label: "ICMM Avg", value: 2.4 },
    ],
    siteRisks: [
      { site: "Sierrita Mine", state: "AZ", value: 61200, severity: "critical", notes: "Highest 2025 MSHA penalty total" },
      { site: "Morenci Mine", state: "AZ", value: 53600, severity: "high", notes: "9 citations totaling ~$53.6K" },
      { site: "Safford / Lone Star", state: "AZ", value: 14557, severity: "medium", notes: "1 citation" },
      { site: "Bagdad Mine", state: "AZ", value: 7676, severity: "low", notes: "1 citation" },
    ],
    geoSegments: [
      { region: "North America Copper", revenueShare: 40, workforceShare: 65 },
      { region: "Indonesia / Grasberg", revenueShare: 30, workforceShare: 8 },
      { region: "South America", revenueShare: 24, workforceShare: 24 },
      { region: "Molybdenum (CO)", revenueShare: 6, workforceShare: 3 },
    ],
    keyMessage:
      "Headline TRIR strength masks worsening employee trend and contractor-linked fatalities; close screening and surveillance gaps.",
  },
];

export function getDossier(clientId: string, clientName?: string): ClientDossier | undefined {
  const byId = clientDossiers.find((d) => d.clientId === clientId);
  if (byId) return byId;

  if (!clientName) return undefined;
  const normalized = clientName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return clientDossiers.find((d) => {
    const dossierNormalized = d.clientName.toLowerCase().replace(/[^a-z0-9]/g, "");
    return dossierNormalized.includes(normalized) || normalized.includes(dossierNormalized);
  });
}
