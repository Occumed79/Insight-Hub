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

  const articles = query.data?.articles ?? [];

  return (
    <div className="space-y-7">
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">Federal Contractor Intelligence</p>
        <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">Relevant News</h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-white/50 md:text-lg">
          Current reporting focused on federal contractors, contract awards, acquisitions, procurements, solicitations, and upcoming recompetes.
        </p>
      </section>

      <form onSubmit={submitSearch} className="glass-card flex flex-col gap-3 rounded-2xl border border-white/10 p-4 sm:flex-row">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3">
          <Search className="h-4 w-4 text-white/30" />
          <input
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Add a company, agency, contract vehicle, or topic..."
            className="h-full w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/15 px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary/25"
        >
          <Search className="h-4 w-4" /> Search News
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm text-white/45">
          {query.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Newspaper className="h-4 w-4 text-primary/70" />}
          <span>{query.isFetching ? "Refreshing GNews…" : `${articles.length.toLocaleString("en-US")} highly relevant articles`}</span>
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
            <p className="font-semibold">Relevant news could not be loaded.</p>
            <p className="mt-1 text-red-100/60">{query.error instanceof Error ? query.error.message : "Unknown error"}</p>
          </div>
        </div>
      )}

      {!query.isLoading && !query.isError && articles.length === 0 && (
        <div className="glass-card rounded-2xl border border-white/10 p-10 text-center text-white/45">
          No highly relevant federal contractor articles were returned. Clear the additional search term and refresh.
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        {articles.map((article) => (
          <article key={article.id} className="glass-card overflow-hidden rounded-2xl border border-white/10 transition-colors hover:border-primary/35">
            {article.image && (
              <div className="aspect-[16/7] overflow-hidden border-b border-white/10 bg-black/20">
                <img src={article.image} alt="" className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" loading="lazy" />
              </div>
            )}
            <div className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.15em] text-white/35">
                <span>{article.source.name}</span>
                <span>{displayDate(article.publishedAt)}</span>
              </div>
              <h2 className="mt-3 text-xl font-semibold leading-snug text-white">{article.title}</h2>
              {article.description && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-white/45">{article.description}</p>}
              <div className="mt-5 flex items-center justify-between gap-3">
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-primary/80">
                  relevance {article.relevanceScore}
                </span>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/65 transition-colors hover:border-primary/30 hover:text-white"
                >
                  Read Article <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
