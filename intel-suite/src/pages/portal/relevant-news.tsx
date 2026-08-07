import { FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CircleAlert,
  ExternalLink,
  Loader2,
  Newspaper,
  RefreshCcw,
  Search,
} from "lucide-react";

type NewsArticle = {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  url: string;
  image: string | null;
  publishedAt: string | null;
  source: {
    name: string;
    url: string | null;
    country: string | null;
  };
  relevanceScore: number;
};

type NewsResponse = {
  articles: NewsArticle[];
  totalArticles: number;
  upstreamArticles: number;
  filteredOut: number;
  query: string;
  source: "gnews";
  fetchedAt: string;
  cached?: boolean;
  error?: string;
};

function displayDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

async function fetchRelevantNews(search: string): Promise<NewsResponse> {
  const params = new URLSearchParams({ max: "40" });
  if (search) params.set("search", search);
  const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const response = await fetch(`${baseUrl}/api/relevant-news?${params.toString()}`);
  const payload = (await response.json().catch(() => ({}))) as NewsResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Unable to load federal contractor news");
  }

  return payload;
}

function NewsSkeleton() {
  return (
    <article className="glass-card overflow-hidden rounded-2xl border border-white/10" aria-hidden="true">
      <div className="ui-skeleton aspect-[16/7] border-b border-white/10" />
      <div className="space-y-4 p-5">
        <div className="flex justify-between gap-4">
          <div className="ui-skeleton h-3 w-28 rounded-full" />
          <div className="ui-skeleton h-3 w-24 rounded-full" />
        </div>
        <div className="ui-skeleton h-6 w-11/12 rounded-lg" />
        <div className="space-y-2">
          <div className="ui-skeleton h-3 w-full rounded-full" />
          <div className="ui-skeleton h-3 w-4/5 rounded-full" />
        </div>
        <div className="flex justify-between gap-3 pt-1">
          <div className="ui-skeleton h-8 w-24 rounded-full" />
          <div className="ui-skeleton h-9 w-28 rounded-full" />
        </div>
      </div>
    </article>
  );
}

export default function RelevantNewsPage() {
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");

  const queryKey = useMemo(() => ["relevant-news", search], [search]);
  const query = useQuery({
    queryKey,
    queryFn: () => fetchRelevantNews(search),
    staleTime: 12 * 60 * 1000,
  });

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setSearch(draftSearch.trim());
  };

  const clearSearch = () => {
    setDraftSearch("");
    setSearch("");
  };

  const articles = query.data?.articles ?? [];
  const upstreamArticles = query.data?.upstreamArticles ?? 0;
  const filteredOut = query.data?.filteredOut ?? 0;
  const statusText = query.isFetching
    ? "Refreshing relevant news"
    : `${articles.length.toLocaleString("en-US")} articles shown`;

  return (
    <div className="ui-page-shell space-y-7" aria-busy={query.isFetching}>
      <section aria-labelledby="relevant-news-title">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">Federal Contractor Intelligence</p>
        <h1 id="relevant-news-title" className="text-4xl font-bold tracking-tight text-white md:text-5xl">Relevant News</h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-white/50 md:text-lg">
          Current reporting focused on federal contracts, contract awards, acquisitions, procurements, solicitations, and upcoming recompetes.
        </p>
      </section>

      <form onSubmit={submitSearch} role="search" aria-label="Search relevant news" className="glass-card flex flex-col gap-3 rounded-2xl border border-white/10 p-4 sm:flex-row">
        <label htmlFor="relevant-news-search" className="sr-only">Search relevant news</label>
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/20">
          <Search className="h-4 w-4 shrink-0 text-white/30" aria-hidden="true" />
          <input
            id="relevant-news-search"
            name="search"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Add a company, agency, contract vehicle, or topic..."
            autoComplete="off"
            className="h-11 min-w-0 w-full bg-transparent text-base text-white outline-none placeholder:text-white/25 sm:text-sm"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/15 px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary/25"
        >
          <Search className="h-4 w-4" aria-hidden="true" /> Search News
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm text-white/45" aria-live="polite" aria-atomic="true">
          {query.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" /> : <Newspaper className="h-4 w-4 text-primary/70" aria-hidden="true" />}
          <span className="sr-only">{statusText}</span>
          <span aria-hidden="true">
            {query.isFetching
              ? "Refreshing GNews…"
              : `${articles.length.toLocaleString("en-US")} shown · ${upstreamArticles.toLocaleString("en-US")} returned by GNews`}
          </span>
          {filteredOut > 0 && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wider">{filteredOut} filtered</span>}
          {query.data?.cached && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wider">cached</span>}
        </div>
        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/55 transition-colors hover:text-white disabled:opacity-50"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
        </button>
      </div>

      {query.isError && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-300/20 bg-red-300/10 p-4 text-sm text-red-100/80">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">Relevant news could not be loaded.</p>
            <p className="ui-break-anywhere mt-1 text-red-100/60">{query.error instanceof Error ? query.error.message : "Unknown error"}</p>
          </div>
        </div>
      )}

      {!query.isLoading && !query.isError && articles.length === 0 && (
        <div className="glass-card rounded-2xl border border-white/10 p-6 text-center text-white/45 sm:p-10">
          <p className="font-medium text-white/70">
            {upstreamArticles > 0
              ? `GNews returned ${upstreamArticles} article${upstreamArticles === 1 ? "" : "s"}, but none met the federal-contract relevance threshold.`
              : "GNews returned no articles for this search."}
          </p>
          <p className="mt-2 text-sm">The feed uses a broader federal-contract query and does not restrict results by publisher country.</p>
          {search && (
            <button type="button" onClick={clearSearch} className="mt-4 min-h-11 rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/20">
              Clear additional search term
            </button>
          )}
        </div>
      )}

      {query.isLoading && (
        <section aria-label="Loading relevant news" className="grid gap-4 md:grid-cols-2">
          <NewsSkeleton />
          <NewsSkeleton />
          <NewsSkeleton />
          <NewsSkeleton />
        </section>
      )}

      {!query.isLoading && (
        <section aria-label="Relevant news results" className="grid min-w-0 gap-4 md:grid-cols-2">
          {articles.map((article) => (
            <article key={article.id} className="glass-card min-w-0 overflow-hidden rounded-2xl border border-white/10 transition-colors hover:border-primary/35">
              {article.image && (
                <div className="aspect-[16/7] overflow-hidden border-b border-white/10 bg-black/20">
                  <img
                    src={article.image}
                    alt={article.title}
                    className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              )}
              <div className="min-w-0 p-5">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.15em] text-white/35">
                  <span className="ui-break-anywhere">{article.source.name}</span>
                  <time dateTime={article.publishedAt ?? undefined}>{displayDate(article.publishedAt)}</time>
                </div>
                <h2 className="ui-break-anywhere mt-3 text-xl font-semibold leading-snug text-white">{article.title}</h2>
                {article.description && <p className="ui-break-anywhere mt-3 line-clamp-3 text-sm leading-relaxed text-white/45">{article.description}</p>}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-primary/80">relevance {article.relevanceScore}</span>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/65 transition-colors hover:border-primary/30 hover:text-white"
                  >
                    Read Article <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
