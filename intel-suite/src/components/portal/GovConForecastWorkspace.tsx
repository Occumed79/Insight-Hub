import { FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
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
  Sparkles,
} from "lucide-react";

export type GovConWorkspaceMode = "forecast" | "recompete";

type Relevance = {
  score: number;
  classification: "strong" | "possible" | "low";
  semanticSimilarity: number | null;
  provider: "gemini" | "deterministic";
  reasons: string[];
};

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
  relevance: Relevance;
};

type ForecastResponse = {
  records: ForecastRecord[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasNext: boolean;
  };
  sourcePageRecords: number;
  suppressedCount: number;
  lowRelevanceCount: number;
  semanticProvider: "gemini" | "deterministic";
  fetchedAt: string;
  cached?: boolean;
  error?: string;
};

type VerificationEvidence = {
  source: "USAspending" | "SAM Contract Awards";
  awardId: string | null;
  recipientName: string | null;
  agency: string | null;
  description: string | null;
  amount: number | null;
  startDate: string | null;
  endDate: string | null;
  naics: string | null;
  sourceUrl: string | null;
  matchScore: number;
};

type VerificationResponse = {
  confidence: "verified" | "high" | "medium" | "unverified";
  confidenceScore: number;
  summary: string;
  evidence: VerificationEvidence[];
  sourcesChecked: Array<{
    source: "USAspending" | "SAM Contract Awards";
    status: "matched" | "no_match" | "unavailable";
    detail?: string;
  }>;
  verifiedAt: string;
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

function hiddenStorageKey(mode: GovConWorkspaceMode): string {
  return `insight-hub:hidden-govcon:${mode}:v2`;
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
    // Current-session hiding still works when storage is unavailable.
  }
}

function apiBase(): string {
  return import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
}

async function fetchForecasts(mode: GovConWorkspaceMode, filters: Filters, fitOnly: boolean): Promise<ForecastResponse> {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(filters.offset),
    sortBy: "est_award_fy",
    sortOrder: "asc",
    fitOnly: String(fitOnly),
  });

  if (filters.naics) params.set("naics", filters.naics);
  if (filters.keywords) {
    params.set("keywords", filters.keywords);
    params.set("focus", filters.keywords);
  }
  if (filters.agency) params.set("agency", filters.agency);
  if (mode === "recompete") params.set("recompete", "true");

  const response = await fetch(`${apiBase()}/api/govcon/forecasts?${params.toString()}`);
  const payload = (await response.json().catch(() => ({}))) as ForecastResponse;
  if (!response.ok) throw new Error(payload.error || "Unable to load GovCon forecast data");
  return payload;
}

async function saveFeedback(mode: GovConWorkspaceMode, record: ForecastRecord): Promise<void> {
  const response = await fetch(`${apiBase()}/api/govcon/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "not_relevant",
      mode,
      recordId: record.id,
      title: record.title,
      agency: record.agency,
    }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "Feedback could not be saved");
  }
}

async function restoreFeedback(mode: GovConWorkspaceMode): Promise<void> {
  const response = await fetch(`${apiBase()}/api/govcon/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "restore_all", mode }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "Hidden records could not be restored");
  }
}

async function verifyOfficialAward(record: ForecastRecord): Promise<VerificationResponse> {
  const response = await fetch(`${apiBase()}/api/govcon/recompete-verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: record.id,
      title: record.title,
      agency: record.agency,
      naics: record.naics,
      incumbentName: record.incumbentName ?? record.incumbentAward?.recipientName,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as VerificationResponse;
  if (!response.ok) throw new Error(payload.error || "Official award verification failed");
  return payload;
}

function relevanceClass(relevance: Relevance): string {
  if (relevance.classification === "strong") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (relevance.classification === "possible") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-white/10 bg-white/5 text-white/50";
}

function verificationClass(confidence: VerificationResponse["confidence"]): string {
  if (confidence === "verified") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (confidence === "high") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (confidence === "medium") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-red-300/20 bg-red-300/10 text-red-100/80";
}

function ForecastCard({
  record,
  mode,
  onHide,
}: {
  record: ForecastRecord;
  mode: GovConWorkspaceMode;
  onHide: (record: ForecastRecord) => void;
}) {
  const [verification, setVerification] = useState<VerificationResponse | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const description = plainText(record.description);
  const solicitationDate = displayDate(record.estimatedSolicitationDate);
  const expirationDate = displayDate(record.incumbentAward?.expires ?? null);
  const currentValue = displayMoney(record.incumbentAward?.currentValue ?? null);
  const timing = solicitationDate || record.estimatedAwardQuarter || (record.estimatedAwardFiscalYear ? `FY ${record.estimatedAwardFiscalYear}` : "—");
  const value = record.valueRangeText || displayMoney(record.valueHigh) || displayMoney(record.valueLow) || "—";

  const runVerification = async () => {
    setVerifying(true);
    setVerificationError(null);
    try {
      setVerification(await verifyOfficialAward(record));
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <article className="glass-card flex h-full flex-col rounded-2xl border border-white/10 p-4 transition-colors hover:border-primary/35">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-primary/65">
            <span>{record.source?.toUpperCase() || "GOVCON"}</span>
            {record.status && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/55">{record.status}</span>}
            {record.isRecompete && <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-amber-100/80">Recompete</span>}
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${relevanceClass(record.relevance)}`}>
              {record.relevance.provider === "gemini" && <Sparkles className="h-3 w-3" />}
              {record.relevance.score}% fit
            </span>
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
            onClick={() => onHide(record)}
            title="Hide as not relevant"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 text-[10px] text-white/55 transition-colors hover:border-red-300/25 hover:bg-red-300/10 hover:text-red-100"
          >
            <EyeOff className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Not relevant</span>
          </button>
        </div>
      </div>

      {description && <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-white/45">{description}</p>}

      {record.relevance.reasons.length > 0 && (
        <p className="mt-2 line-clamp-1 text-[10px] text-primary/55">{record.relevance.reasons.join(" · ")}</p>
      )}

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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-100/85">
              <ShieldCheck className="h-3.5 w-3.5" /> Incumbent position
            </div>
            <button
              type="button"
              onClick={() => void runVerification()}
              disabled={verifying}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/20 bg-amber-200/10 px-2.5 py-1.5 text-[10px] text-amber-100/80 transition-colors hover:bg-amber-200/15 disabled:opacity-50"
            >
              {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <BadgeCheck className="h-3 w-3" />}
              {verification ? "Recheck official awards" : "Verify official awards"}
            </button>
          </div>
          <div className="mt-1.5 space-y-0.5 text-xs text-white/55">
            <p className="line-clamp-1">{record.incumbentName || record.incumbentAward?.recipientName || "Incumbent not published"}</p>
            {(currentValue || expirationDate) && <p>{currentValue ? `Current value: ${currentValue}` : ""}{currentValue && expirationDate ? " · " : ""}{expirationDate ? `Expires: ${expirationDate}` : ""}</p>}
          </div>

          {verification && (
            <div className="mt-3 border-t border-amber-200/10 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wider ${verificationClass(verification.confidence)}`}>
                  {verification.confidence} · {verification.confidenceScore}%
                </span>
                {verification.cached && <span className="text-[10px] text-white/35">cached verification</span>}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-white/55">{verification.summary}</p>
              {verification.evidence.slice(0, 2).map((evidence, index) => (
                <div key={`${evidence.source}:${evidence.awardId ?? index}`} className="mt-2 rounded-lg border border-white/8 bg-black/15 p-2.5 text-[11px] text-white/55">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-white/70">{evidence.source}</span>
                    <span>{evidence.matchScore}% match</span>
                  </div>
                  <p className="mt-1 line-clamp-1">{evidence.recipientName || "Recipient unavailable"}{evidence.awardId ? ` · ${evidence.awardId}` : ""}</p>
                  <p className="mt-1">{displayMoney(evidence.amount) || "Value unavailable"}{evidence.endDate ? ` · Ends ${displayDate(evidence.endDate)}` : ""}</p>
                  {evidence.sourceUrl && <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary/75 hover:text-primary">Official record <ExternalLink className="h-3 w-3" /></a>}
                </div>
              ))}
            </div>
          )}

          {verificationError && <p className="mt-2 text-xs text-red-200/75">{verificationError}</p>}
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
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const queryKey = useMemo(
    () => ["govcon-forecasts", mode, filters.keywords, filters.agency, filters.naics, filters.offset, fitOnly],
    [mode, filters, fitOnly],
  );

  const query = useQuery({
    queryKey,
    queryFn: () => fetchForecasts(mode, filters, fitOnly),
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

  const hideRecord = (record: ForecastRecord) => {
    setFeedbackError(null);
    setHiddenIds((current) => {
      const next = new Set(current);
      next.add(record.id);
      saveHiddenIds(mode, next);
      return next;
    });
    void saveFeedback(mode, record)
      .then(() => query.refetch())
      .catch((error) => setFeedbackError(error instanceof Error ? error.message : "Feedback could not be saved"));
  };

  const restoreHidden = () => {
    const next = new Set<string>();
    saveHiddenIds(mode, next);
    setHiddenIds(next);
    setFeedbackError(null);
    void restoreFeedback(mode)
      .then(() => query.refetch())
      .catch((error) => setFeedbackError(error instanceof Error ? error.message : "Hidden records could not be restored"));
  };

  const records = query.data?.records ?? [];
  const visibleRecords = records.filter((record) => !hiddenIds.has(record.id));
  const hiddenOnPage = records.length - visibleRecords.length;
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
            ? "Track forecasted requirements, verify incumbent positions against official federal award records, and identify likely displacement opportunities."
            : "See agency procurement forecasts before solicitations are posted, ranked against Occu-Med’s actual service profile."}
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
          {query.data?.semanticProvider === "gemini" && <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] uppercase tracking-wider text-primary/80"><Sparkles className="h-3 w-3" /> Gemini ranked</span>}
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
        <span>{query.data?.sourcePageRecords ?? records.length} records evaluated on this source page</span>
        {fitOnly && (query.data?.lowRelevanceCount ?? 0) > 0 && <span>· {query.data?.lowRelevanceCount} low-fit result{query.data?.lowRelevanceCount === 1 ? "" : "s"} suppressed by server ranking</span>}
        {(query.data?.suppressedCount ?? 0) > 0 && <span>· {query.data?.suppressedCount} previously marked not relevant</span>}
        {hiddenOnPage > 0 && <span>· {hiddenOnPage} being hidden while feedback saves</span>}
      </div>

      {feedbackError && (
        <div className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-xs text-red-100/75">{feedbackError}</div>
      )}

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
        <div className="glass-card rounded-2xl border border-white/10 p-10 text-center text-white/45">No matching {isRecompete ? "recompetes" : "forecasts"}. Choose All industries, turn off Occu-Med fit only, or broaden the search terms.</div>
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
