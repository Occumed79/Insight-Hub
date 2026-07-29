import { FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  CircleAlert,
  ExternalLink,
  EyeOff,
  Loader2,
  MapPin,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";

export type GovConWorkspaceMode = "forecast" | "recompete";

type ForecastRecord = {
  id: string;
  source: string | null;
  sourceId: string | null;
  title: string;
  agency: string;
  subAgency: string | null;
  description: string | null;
  naics: string | null;
  setAside: string | null;
  state: string | null;
  valueRangeText: string | null;
  valueLow: number | null;
  valueHigh: number | null;
  estimatedSolicitationDate: string | null;
  estimatedAwardFiscalYear: number | null;
  estimatedAwardQuarter: string | null;
  status: string | null;
  isRecompete: boolean;
  incumbentName: string | null;
  incumbentAward: {
    recipientName: string | null;
    currentValue: number | null;
    expires: string | null;
    awardingAgency: string | null;
    latestActionDate: string | null;
  } | null;
  pointOfContact: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  sourceUrl: string | null;
  lastUpdatedDate: string | null;
};

type ForecastResponse = {
  records: ForecastRecord[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasNext: boolean;
  };
  fetchedAt: string;
  cached?: boolean;
  error?: string;
};

type Filters = {
  keywords: string;
  agency: string;
  naics: string;
  offset: number;
};

const PAGE_SIZE = 50;
const DEFAULT_NAICS = "621";

const INDUSTRY_OPTIONS = [
  { value: "621", label: "Health & medical services (NAICS 621)" },
  { value: "622", label: "Hospitals (NAICS 622)" },
  { value: "623", label: "Residential care (NAICS 623)" },
  { value: "624", label: "Social assistance (NAICS 624)" },
  { value: "561", label: "Business support services (NAICS 561)" },
  { value: "", label: "All industries" },
];

const OCCUMED_FIT_TERMS = [
  "occupational health",
  "employee health",
  "medical support",
  "medical services",
  "medical staffing",
  "health services",
  "workforce care",
  "medical exam",
  "physical exam",
  "pre-employment",
  "post-employment",
  "fitness for duty",
  "fitness testing",
  "drug testing",
  "drug collection",
  "audiogram",
  "audiology",
  "hearing test",
  "spirometry",
  "respirator",
  "dental",
  "behavioral health",
  "emergency medical",
  "ems support",
  "clinical support",
  "clinic",
  "laboratory",
  "diagnostic",
];

function displayDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function displayMoney(value: number | null): string | null {
  if (value === null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}

function plainText(value: string | null): string | null {
  if (!value) return null;
  const stripped = value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || null;
}

function isOccumedFit(record: ForecastRecord): boolean {
  const text = [record.title, record.description, record.agency, record.subAgency]
    .map((value) => plainText(value) ?? "")
    .join(" ")
    .toLowerCase();
  return OCCUMED_FIT_TERMS.some((term) => text.includes(term));
}

function hiddenStorageKey(mode: GovConWorkspaceMode): string {
  return `insight-hub:hidden-govcon:${mode}:v1`;
}

function loadHiddenIds(mode: GovConWorkspaceMode): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(hiddenStorageKey(mode)) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

function saveHiddenIds(mode: GovConWorkspaceMode, ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(hiddenStorageKey(mode), JSON.stringify(Array.from(ids)));
  } catch {
    // Hiding still works for the current page even when browser storage is unavailable.
  }
}

async function fetchForecasts(mode: GovConWorkspaceMode, filters: Filters): Promise<ForecastResponse> {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(filters.offset),
    sortBy: "est_award_fy",
    sortOrder: "asc",
  });

  if (filters.naics) params.set("naics", filters.naics);
  if (filters.keywords) params.set("keywords", filters.keywords);
  if (filters.agency) params.set("agency", filters.agency);
  if (mode === "recompete") params.set("recompete", "true");

  const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const response = await fetch(`${baseUrl}/api/govcon/forecasts?${params.toString()}`);
  const payload = (await response.json().catch(() => ({}))) as ForecastResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Unable to load GovCon forecast data");
  }

  return payload;
}

function ForecastCard({
  record,
  mode,
  onHide,
}: {
  record: ForecastRecord;
  mode: GovConWorkspaceMode;
  onHide: (id: string) => void;
}) {
  const description = plainText(record.description);
  const solicitationDate = displayDate(record.estimatedSolicitationDate);
  const expirationDate = displayDate(record.incumbentAward?.expires ?? null);
  const currentValue = displayMoney(record.incumbentAward?.currentValue ?? null);
  const timing = solicitationDate || record.estimatedAwardQuarter || (record.estimatedAwardFiscalYear ? `FY ${record.estimatedAwardFiscalYear}` : "—");
  const value = record.valueRangeText || displayMoney(record.valueHigh) || displayMoney(record.valueLow) || "—";

  return (
    <article className="glass-card flex h-full flex-col rounded-2xl border border-white/10 p-4 transition-colors hover:border-primary/35">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-primary/65">
            <span>{record.source?.toUpperCase() || "GOVCON"}</span>
            {record.status && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/55">{record.status}</span>}
            {record.isRecompete && <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-amber-100/80">Recompete</span>}
          </div>
          <h2 className="line-clamp-2 text-lg font-semibold leading-snug text-white">{record.title}</h2>
          <div className="mt-2 flex items-start gap-2 text-xs text-white/55">
            <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
            <span className="line-clamp-2">{record.agency}{record.subAgency ? ` · ${record.subAgency}` : ""}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {record.sourceUrl && (
            <a
              href={record.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open source"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary transition-colors hover:bg-primary/20"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => onHide(record.id)}
            title="Hide as not relevant"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 text-[10px] text-white/55 transition-colors hover:border-red-300/25 hover:bg-red-300/10 hover:text-red-100"
          >
            <EyeOff className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Not relevant</span>
          </button>
        </div>
      </div>

      {description && <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-white/45">{description}</p>}

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-white/8 bg-black/15 p-2.5">
          <p className="text-[9px] uppercase tracking-[0.14em] text-white/35">NAICS / Set-Aside</p>
          <p className="mt-1 line-clamp-1 text-white/75">{record.naics || "—"}{record.setAside ? ` · ${record.setAside}` : ""}</p>
        </div>
        <div className="rounded-lg border border-white/8 bg-black/15 p-2.5">
          <p className="text-[9px] uppercase tracking-[0.14em] text-white/35">Estimated Value</p>
          <p className="mt-1 line-clamp-1 text-white/75">{value}</p>
        </div>
        <div className="rounded-lg border border-white/8 bg-black/15 p-2.5">
          <p className="text-[9px] uppercase tracking-[0.14em] text-white/35">Expected Timing</p>
          <p className="mt-1 line-clamp-1 text-white/75">{timing}</p>
        </div>
        <div className="rounded-lg border border-white/8 bg-black/15 p-2.5">
          <p className="text-[9px] uppercase tracking-[0.14em] text-white/35">Place of Performance</p>
          <p className="mt-1 flex items-center gap-1.5 line-clamp-1 text-white/75"><MapPin className="h-3 w-3 shrink-0 text-primary/65" />{record.state || "Not listed"}</p>
        </div>
      </div>

      {mode === "recompete" && (
        <div className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.06] p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-100/85">
            <ShieldCheck className="h-3.5 w-3.5" /> Incumbent position
          </div>
          <div className="mt-1.5 space-y-0.5 text-xs text-white/55">
            <p className="line-clamp-1">{record.incumbentName || record.incumbentAward?.recipientName || "Incumbent not published"}</p>
            {(currentValue || expirationDate) && <p>{currentValue ? `Current value: ${currentValue}` : ""}{currentValue && expirationDate ? " · " : ""}{expirationDate ? `Expires: ${expirationDate}` : ""}</p>}
          </div>
        </div>
      )}
    </article>
  );
}

export function GovConForecastWorkspace({ mode }: { mode: GovConWorkspaceMode }) {
  const isRecompete = mode === "recompete";
  const [draftKeywords, setDraftKeywords] = useState("");
  const [draftAgency, setDraftAgency] = useState("");
  const [draftNaics, setDraftNaics] = useState(DEFAULT_NAICS);
  const [filters, setFilters] = useState<Filters>({ keywords: "", agency: "", naics: DEFAULT_NAICS, offset: 0 });
  const [fitOnly, setFitOnly] = useState(true);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => loadHiddenIds(mode));

  const queryKey = useMemo(
    () => ["govcon-forecasts", mode, filters.keywords, filters.agency, filters.naics, filters.offset],
    [mode, filters],
  );

  const query = useQuery({
    queryKey,
    queryFn: () => fetchForecasts(mode, filters),
    staleTime: 8 * 60 * 1000,
  });

  const submitFilters = (event: FormEvent) => {
    event.preventDefault();
    setFilters({
      keywords: draftKeywords.trim(),
      agency: draftAgency.trim(),
      naics: draftNaics,
      offset: 0,
    });
  };

  const hideRecord = (id: string) => {
    setHiddenIds((current) => {
      const next = new Set(current);
      next.add(id);
      saveHiddenIds(mode, next);
      return next;
    });
  };

  const restoreHidden = () => {
    const next = new Set<string>();
    saveHiddenIds(mode, next);
    setHiddenIds(next);
  };

  const records = query.data?.records ?? [];
  const sourceVisibleRecords = records.filter((record) => !hiddenIds.has(record.id));
  const fitFilteredCount = sourceVisibleRecords.filter((record) => !isOccumedFit(record)).length;
  const visibleRecords = fitOnly ? sourceVisibleRecords.filter(isOccumedFit) : sourceVisibleRecords;
  const hiddenOnPage = records.filter((record) => hiddenIds.has(record.id)).length;
  const total = query.data?.pagination.total ?? 0;
  const currentStart = total === 0 ? 0 : filters.offset + 1;
  const currentEnd = Math.min(filters.offset + PAGE_SIZE, total);

  return (
    <div className="space-y-7">
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">GovCon Forward Intelligence</p>
        <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">{isRecompete ? "Recompete Watch" : "Forecasts"}</h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-white/50 md:text-lg">
          {isRecompete
            ? "Track forecasted requirements that identify an incumbent, current contract position, expiration timing, and likely displacement opportunities."
            : "See agency procurement forecasts before solicitations are posted, including expected award timing, values, set-asides, and published points of contact."}
        </p>
      </section>

      <form onSubmit={submitFilters} className="glass-card grid gap-3 rounded-2xl border border-white/10 p-4 md:grid-cols-[1fr_1fr_260px_auto]">
        <label className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Keywords</span>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3">
            <Search className="h-4 w-4 text-white/30" />
            <input
              value={draftKeywords}
              onChange={(event) => setDraftKeywords(event.target.value)}
              placeholder="occupational health, exams, medical..."
              className="h-11 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
            />
          </div>
        </label>
        <label className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Agency</span>
          <input
            value={draftAgency}
            onChange={(event) => setDraftAgency(event.target.value)}
            placeholder="DHS, HHS, VA, DoD..."
            className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-primary/40"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Industry Focus</span>
          <select
            value={draftNaics}
            onChange={(event) => setDraftNaics(event.target.value)}
            className="h-11 w-full rounded-xl border border-white/10 bg-[hsl(207,72%,10%)] px-3 text-sm text-white/80 outline-none focus:border-primary/40"
          >
            {INDUSTRY_OPTIONS.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button type="submit" className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/15 px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary/25">
          <Search className="h-4 w-4" /> Search
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-white/45">
          {query.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <CalendarDays className="h-4 w-4 text-primary/70" />}
          <span>{query.isFetching ? "Refreshing GovCon data…" : `${visibleRecords.length.toLocaleString("en-US")} shown from ${total.toLocaleString("en-US")} source matches`}</span>
          {query.data?.cached && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wider">cached</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
            <input type="checkbox" checked={fitOnly} onChange={(event) => setFitOnly(event.target.checked)} className="accent-[hsl(var(--primary))]" />
            Occu-Med fit only
          </label>
          {hiddenIds.size > 0 && (
            <button type="button" onClick={restoreHidden} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60 hover:text-white">
              <RotateCcw className="h-3.5 w-3.5" /> Restore {hiddenIds.size} hidden
            </button>
          )}
          <button onClick={() => query.refetch()} disabled={query.isFetching} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/55 transition-colors hover:text-white disabled:opacity-50">
            <RefreshCcw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-white/40">
        <span>The default industry focus is Health & medical services (NAICS 621), not an unexplained free-form code.</span>
        {fitOnly && fitFilteredCount > 0 && <span>· {fitFilteredCount} off-topic result{fitFilteredCount === 1 ? "" : "s"} filtered on this page</span>}
        {hiddenOnPage > 0 && <span>· {hiddenOnPage} manually hidden on this page</span>}
      </div>

      {query.isError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-300/20 bg-red-300/10 p-4 text-sm text-red-100/80">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">GovCon data could not be loaded.</p>
            <p className="mt-1 text-red-100/60">{query.error instanceof Error ? query.error.message : "Unknown error"}</p>
          </div>
        </div>
      )}

      {!query.isLoading && !query.isError && records.length === 0 && (
        <div className="glass-card rounded-2xl border border-white/10 p-10 text-center text-white/45">No matching {isRecompete ? "recompetes" : "forecasts"}. Choose All industries or broaden the search terms.</div>
      )}

      {!query.isLoading && !query.isError && records.length > 0 && visibleRecords.length === 0 && (
        <div className="glass-card rounded-2xl border border-white/10 p-8 text-center text-white/45">
          <p>No visible records remain on this page.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {fitOnly && <button type="button" onClick={() => setFitOnly(false)} className="rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-xs text-primary hover:bg-primary/20">Show all source matches</button>}
            {hiddenIds.size > 0 && <button type="button" onClick={restoreHidden} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/65 hover:text-white">Restore hidden records</button>}
          </div>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        {visibleRecords.map((record) => <ForecastCard key={record.id} record={record} mode={mode} onHide={hideRecord} />)}
      </section>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/15 p-3 text-sm text-white/50">
          <span>Source page {currentStart.toLocaleString("en-US")}–{currentEnd.toLocaleString("en-US")} of {total.toLocaleString("en-US")}</span>
          <div className="flex gap-2">
            <button disabled={filters.offset === 0 || query.isFetching} onClick={() => setFilters((current) => ({ ...current, offset: Math.max(0, current.offset - PAGE_SIZE) }))} className="rounded-lg border border-white/10 px-3 py-2 transition-colors hover:text-white disabled:opacity-35">Previous</button>
            <button disabled={!query.data?.pagination.hasNext || query.isFetching} onClick={() => setFilters((current) => ({ ...current, offset: current.offset + PAGE_SIZE }))} className="rounded-lg border border-white/10 px-3 py-2 transition-colors hover:text-white disabled:opacity-35">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
