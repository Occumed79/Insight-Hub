import { FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  CircleAlert,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCcw,
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

async function fetchForecasts(mode: GovConWorkspaceMode, filters: Filters): Promise<ForecastResponse> {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(filters.offset),
    naics: filters.naics,
    sortBy: "est_award_fy",
    sortOrder: "asc",
  });

  if (filters.keywords) params.set("keywords", filters.keywords);
  if (filters.agency) params.set("agency", filters.agency);
  if (mode === "recompete") params.set("recompete", "true");
  if (!filters.naics) params.delete("naics");

  const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const response = await fetch(`${baseUrl}/api/govcon/forecasts?${params.toString()}`);
  const payload = (await response.json().catch(() => ({}))) as ForecastResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Unable to load GovCon forecast data");
  }

  return payload;
}

function ForecastCard({ record, mode }: { record: ForecastRecord; mode: GovConWorkspaceMode }) {
  const solicitationDate = displayDate(record.estimatedSolicitationDate);
  const expirationDate = displayDate(record.incumbentAward?.expires ?? null);
  const currentValue = displayMoney(record.incumbentAward?.currentValue ?? null);

  return (
    <article className="glass-card rounded-2xl border border-white/10 p-5 transition-colors hover:border-primary/35">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-primary/65">
            <span>{record.source?.toUpperCase() || "GOVCON"}</span>
            {record.status && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/55">{record.status}</span>}
            {record.isRecompete && (
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-amber-100/80">Recompete</span>
            )}
          </div>
          <h2 className="text-xl font-semibold leading-snug text-white">{record.title}</h2>
          <div className="mt-2 flex items-center gap-2 text-sm text-white/55">
            <Building2 className="h-4 w-4 shrink-0 text-primary/70" />
            <span>{record.agency}{record.subAgency ? ` · ${record.subAgency}` : ""}</span>
          </div>
        </div>

        {record.sourceUrl && (
          <a
            href={record.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
          >
            Source <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {record.description && (
        <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-white/45">{record.description}</p>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/8 bg-black/15 p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">NAICS / Set-Aside</p>
          <p className="mt-1 text-sm text-white/75">{record.naics || "—"}{record.setAside ? ` · ${record.setAside}` : ""}</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-black/15 p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">Estimated Value</p>
          <p className="mt-1 text-sm text-white/75">{record.valueRangeText || displayMoney(record.valueHigh) || displayMoney(record.valueLow) || "—"}</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-black/15 p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">Expected Timing</p>
          <p className="mt-1 text-sm text-white/75">{solicitationDate || record.estimatedAwardQuarter || (record.estimatedAwardFiscalYear ? `FY ${record.estimatedAwardFiscalYear}` : "—")}</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-black/15 p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">Place of Performance</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-white/75"><MapPin className="h-3.5 w-3.5 text-primary/65" />{record.state || "Not listed"}</p>
        </div>
      </div>

      {mode === "recompete" && (
        <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-100/85">
            <ShieldCheck className="h-4 w-4" />
            Incumbent position
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/55">
            <span>{record.incumbentName || record.incumbentAward?.recipientName || "Incumbent not published"}</span>
            {currentValue && <span>Current value: {currentValue}</span>}
            {expirationDate && <span>Expires: {expirationDate}</span>}
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
  const [draftNaics, setDraftNaics] = useState("621");
  const [filters, setFilters] = useState<Filters>({ keywords: "", agency: "", naics: "621", offset: 0 });

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
      naics: draftNaics.trim(),
      offset: 0,
    });
  };

  const records = query.data?.records ?? [];
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

      <form onSubmit={submitFilters} className="glass-card grid gap-3 rounded-2xl border border-white/10 p-4 md:grid-cols-[1fr_1fr_160px_auto]">
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
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">NAICS Prefix</span>
          <input
            value={draftNaics}
            onChange={(event) => setDraftNaics(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="621"
            className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-primary/40"
          />
        </label>
        <button
          type="submit"
          className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/15 px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary/25"
        >
          <Search className="h-4 w-4" /> Search
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm text-white/45">
          {query.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <CalendarDays className="h-4 w-4 text-primary/70" />}
          <span>{query.isFetching ? "Refreshing GovCon data…" : `${total.toLocaleString("en-US")} matching records`}</span>
          {query.data?.cached && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wider">cached</span>}
        </div>
        <button
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/55 transition-colors hover:text-white disabled:opacity-50"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
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
        <div className="glass-card rounded-2xl border border-white/10 p-10 text-center text-white/45">
          No matching {isRecompete ? "recompetes" : "forecasts"}. Clear the NAICS prefix or broaden the search terms.
        </div>
      )}

      <section className="grid gap-4">
        {records.map((record) => <ForecastCard key={record.id} record={record} mode={mode} />)}
      </section>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/15 p-3 text-sm text-white/50">
          <span>Showing {currentStart.toLocaleString("en-US")}–{currentEnd.toLocaleString("en-US")} of {total.toLocaleString("en-US")}</span>
          <div className="flex gap-2">
            <button
              disabled={filters.offset === 0 || query.isFetching}
              onClick={() => setFilters((current) => ({ ...current, offset: Math.max(0, current.offset - PAGE_SIZE) }))}
              className="rounded-lg border border-white/10 px-3 py-2 transition-colors hover:text-white disabled:opacity-35"
            >
              Previous
            </button>
            <button
              disabled={!query.data?.pagination.hasNext || query.isFetching}
              onClick={() => setFilters((current) => ({ ...current, offset: current.offset + PAGE_SIZE }))}
              className="rounded-lg border border-white/10 px-3 py-2 transition-colors hover:text-white disabled:opacity-35"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
