import { createHash } from "node:crypto";
import { serperProvider } from "../providers/serper";
import { langsearchProvider } from "../providers/langsearch";
import {
  recordProviderFailure,
  recordProviderSuccess,
  selectBudgetedProviders,
} from "../providerBudget";

export interface AgencyForecastLead {
  id: string;
  source: string;
  sourceId: string;
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
  status: string;
  isRecompete: false;
  recompeteEvidence: "none";
  incumbentName: null;
  incumbentAward: null;
  pointOfContact: { name: null; email: null; phone: null };
  sourceUrl: string;
  lastUpdatedDate: string | null;
}

type SearchHit = {
  title: string;
  url: string;
  text: string;
  date?: string;
};

type ProviderSearchRun = {
  hits: SearchHit[];
  errors: string[];
};

const OFFICIAL_HOSTS = [
  "acquisitiongateway.gov",
  "gsa.gov",
  "dhs.gov",
  "hhs.gov",
  "va.gov",
  "state.gov",
  "defense.gov",
  "army.mil",
  "navy.mil",
  "af.mil",
];

const FORECAST_RE =
  /forecast|planned procurement|planned acquisition|anticipated procurement|acquisition planning|contracting opportunities/i;
const OCCUMED_RE =
  /occupational health|occupational medicine|medical exam|physical exam|drug testing|medical surveillance|audiogram|audiometric|spirometry|respirator|employee health|workforce health|deployment medical|vaccination|immunization|laboratory testing/i;

function hostAllowed(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return (
      host.endsWith(".gov") ||
      host.endsWith(".mil") ||
      OFFICIAL_HOSTS.some(
        (allowed) => host === allowed || host.endsWith(`.${allowed}`),
      )
    );
  } catch {
    return false;
  }
}

function inferAgency(text: string): string {
  const agencies: Array<[RegExp, string]> = [
    [
      /department of homeland security|\bdhs\b/i,
      "Department of Homeland Security",
    ],
    [
      /department of health and human services|\bhhs\b/i,
      "Department of Health and Human Services",
    ],
    [
      /department of veterans affairs|\bva\b/i,
      "Department of Veterans Affairs",
    ],
    [/department of state/i, "Department of State"],
    [/department of defense|\bdod\b/i, "Department of Defense"],
    [
      /general services administration|\bgsa\b/i,
      "General Services Administration",
    ],
    [
      /department of the army|\bu\.s\. army\b|\barmy\b/i,
      "Department of the Army",
    ],
    [
      /department of the navy|\bu\.s\. navy\b|\bnavy\b/i,
      "Department of the Navy",
    ],
    [
      /department of the air force|\bu\.s\. air force\b|\bair force\b/i,
      "Department of the Air Force",
    ],
  ];
  for (const [pattern, agency] of agencies) {
    if (pattern.test(text)) return agency;
  }
  return "Federal Agency Forecast";
}

export function forecastSearchHitCurrent(
  hit: Pick<SearchHit, "title" | "text" | "date">,
  now = Date.now(),
): boolean {
  if (hit.date) {
    const parsed = Date.parse(hit.date);
    if (Number.isFinite(parsed)) {
      // Search engines sometimes surface archived forecast pages. A dated hit
      // older than eighteen months is not safe enough for the live Forecast UI.
      return parsed >= now - 550 * 86_400_000 && parsed <= now + 90 * 86_400_000;
    }
  }

  const currentYear = new Date(now).getUTCFullYear();
  const combined = `${hit.title} ${hit.text}`;
  // Do not require a word boundary before the year: official forecast titles
  // commonly use FY2026/FY27-style prefixes where the preceding Y is itself a
  // word character. Numeric lookarounds avoid accidentally reading longer IDs.
  const years = Array.from(combined.matchAll(/(?<!\d)(20\d{2})(?!\d)/g))
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  if (years.length === 0) return true;
  return Math.max(...years) >= currentYear;
}

function normalizeHit(hit: SearchHit): AgencyForecastLead | null {
  if (!hit.url || !hostAllowed(hit.url) || !forecastSearchHitCurrent(hit)) {
    return null;
  }
  const combined = `${hit.title} ${hit.text}`.replace(/\s+/g, " ").trim();
  if (!FORECAST_RE.test(combined) || !OCCUMED_RE.test(combined)) return null;
  const hash = createHash("sha256")
    .update(`${hit.url}|${hit.title}`)
    .digest("hex")
    .slice(0, 24);
  return {
    id: `fco:${hash}`,
    source: "fco-official-search",
    sourceId: hash,
    title: hit.title.trim().slice(0, 500),
    agency: inferAgency(combined),
    subAgency: null,
    description: hit.text.trim().slice(0, 2_000) || null,
    naics: null,
    setAside: null,
    state: null,
    valueRangeText: null,
    valueLow: null,
    valueHigh: null,
    estimatedSolicitationDate: null,
    estimatedAwardFiscalYear: null,
    estimatedAwardQuarter: null,
    status: "forecast",
    isRecompete: false,
    recompeteEvidence: "none",
    incumbentName: null,
    incumbentAward: null,
    pointOfContact: { name: null, email: null, phone: null },
    sourceUrl: hit.url,
    lastUpdatedDate: hit.date ?? null,
  };
}

function queries(focus?: string): string[] {
  const year = new Date().getFullYear();
  const scope = focus?.trim()
    ? focus.trim().slice(0, 120)
    : "occupational health medical examinations drug testing medical surveillance";
  return [
    `Forecast of Contracting Opportunities ${scope} acquisitiongateway.gov ${year}`,
    `federal agency acquisition forecast ${scope} ${year}`,
    `planned procurement employee health occupational medicine ${year}`,
  ];
}

async function configuredProviders(): Promise<string[]> {
  const rows = await Promise.all([
    serperProvider
      .isConfigured()
      .then((configured) => ({ provider: "serper", configured }))
      .catch(() => ({ provider: "serper", configured: false })),
    langsearchProvider
      .isConfigured()
      .then((configured) => ({ provider: "langsearch", configured }))
      .catch(() => ({ provider: "langsearch", configured: false })),
  ]);
  return rows.filter((row) => row.configured).map((row) => row.provider);
}

async function runProvider(
  provider: string,
  focus?: string,
): Promise<ProviderSearchRun> {
  const searchQueries = queries(focus);
  if (provider === "serper") {
    const hits = await serperProvider.searchMultiple(searchQueries, 8);
    return {
      hits: hits.map((hit) => ({
        title: hit.title,
        url: hit.link,
        text: hit.snippet ?? "",
        date: hit.date,
      })),
      errors: [],
    };
  }

  const batches = await Promise.allSettled(
    searchQueries.map((query) =>
      langsearchProvider.search(query, { dateRange: 365 }),
    ),
  );
  const hits: SearchHit[] = [];
  const errors: string[] = [];
  batches.forEach((result, index) => {
    if (result.status === "fulfilled") {
      hits.push(
        ...result.value.map((hit) => ({
          title: hit.title,
          url: hit.url,
          text: hit.content,
          date: hit.dateRaw,
        })),
      );
      return;
    }
    errors.push(
      `query ${index + 1}: ${
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
      }`,
    );
  });
  return { hits, errors };
}

export async function fetchAgencyForecastLeads(
  focus?: string,
): Promise<{
  records: AgencyForecastLead[];
  providers: string[];
  errors: string[];
}> {
  const configured = await configuredProviders();
  const selected = await selectBudgetedProviders(configured, 2);
  const errors: string[] = [];
  const all: AgencyForecastLead[] = [];

  if (selected.length === 0) {
    errors.push(
      configured.length === 0
        ? "No official forecast discovery search provider is configured."
        : "All configured official forecast discovery providers are in budget cooldown.",
    );
    return { records: [], providers: [], errors };
  }

  const settled = await Promise.allSettled(
    selected.map(async (provider) => {
      try {
        const run = await runProvider(provider, focus);
        const records = run.hits
          .map(normalizeHit)
          .filter((record): record is AgencyForecastLead => Boolean(record));

        if (run.hits.length === 0 && run.errors.length > 0) {
          const failure = new Error(run.errors.join("; "));
          await recordProviderFailure(provider, failure);
          throw failure;
        }

        await recordProviderSuccess(provider, records.length);
        return { records, errors: run.errors };
      } catch (error) {
        // The all-query-failed branch already recorded the failure above.
        if (!(error instanceof Error) || !/query \d+:/.test(error.message)) {
          await recordProviderFailure(provider, error);
        }
        throw error;
      }
    }),
  );

  settled.forEach((result, index) => {
    const provider = selected[index] ?? "unknown";
    if (result.status === "fulfilled") {
      all.push(...result.value.records);
      errors.push(
        ...result.value.errors.map((message) => `${provider}: ${message}`),
      );
    } else {
      errors.push(
        `${provider}: ${
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
        }`,
      );
    }
  });

  const deduped = new Map<string, AgencyForecastLead>();
  for (const record of all) {
    const key = record.sourceUrl.toLowerCase().replace(/\/$/, "");
    if (!deduped.has(key)) deduped.set(key, record);
  }
  return { records: [...deduped.values()], providers: selected, errors };
}
