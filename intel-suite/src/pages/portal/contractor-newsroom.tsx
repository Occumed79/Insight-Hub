/**
 * Live Source Wall
 *
 * Iframe-only live previews of curated intelligence sources.
 * This page does NOT scrape, crawl, parse, or store any page content.
 * Each card simply embeds the target public site via a sandboxed <iframe>
 * so users can glance at headlines and updates without leaving the portal.
 *
 * The full source list is kept in frontend code. Some sites block iframe
 * embedding — the fallback UI handles those gracefully with an "Open in new tab"
 * option.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Monitor,
  Search,
  LayoutGrid,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// ── Data model ───────────────────────────────────────────────────────────────

type Category =
  | "All"
  | "Contractor Newsrooms"
  | "Federal Procurement / Awards"
  | "Regulatory / Rulemaking"
  | "Oversight / Pain Points"
  | "Workforce / Demand"
  | "Medical / Deployment / Occu-Med"
  | "State / Local Procurement";

interface Source {
  name: string;
  url: string;
  category: Category;
}

const SOURCES: Source[] = [
  // ── Contractor Newsrooms ──────────────────────────────────────────────────
  { name: "V2X", url: "https://www.v2x.com/newsroom/", category: "Contractor Newsrooms" },
  { name: "Amentum", url: "https://www.amentum.com/news/", category: "Contractor Newsrooms" },
  { name: "KBR", url: "https://www.kbr.com/en/newsroom", category: "Contractor Newsrooms" },
  { name: "Leidos", url: "https://www.leidos.com/newsroom", category: "Contractor Newsrooms" },
  { name: "CACI", url: "https://www.caci.com/news", category: "Contractor Newsrooms" },
  { name: "Booz Allen", url: "https://www.boozallen.com/e/media.html", category: "Contractor Newsrooms" },
  { name: "RTX", url: "https://www.rtx.com/news", category: "Contractor Newsrooms" },
  { name: "Lockheed Martin", url: "https://news.lockheedmartin.com/", category: "Contractor Newsrooms" },
  { name: "Northrop Grumman", url: "https://news.northropgrumman.com/", category: "Contractor Newsrooms" },
  { name: "General Dynamics", url: "https://www.gd.com/news", category: "Contractor Newsrooms" },
  { name: "Boeing Defense", url: "https://www.boeing.com/defense/news", category: "Contractor Newsrooms" },
  { name: "Parsons", url: "https://www.parsons.com/newsroom/", category: "Contractor Newsrooms" },
  { name: "SAIC", url: "https://www.saic.com/newsroom", category: "Contractor Newsrooms" },
  { name: "Serco North America", url: "https://www.serco.com/na/news", category: "Contractor Newsrooms" },
  { name: "Akima", url: "https://www.akima.com/news/", category: "Contractor Newsrooms" },
  { name: "Peraton", url: "https://www.peraton.com/news/", category: "Contractor Newsrooms" },
  { name: "ManTech", url: "https://www.mantech.com/news/", category: "Contractor Newsrooms" },
  { name: "Fluor", url: "https://newsroom.fluor.com/", category: "Contractor Newsrooms" },

  // ── Federal Procurement / Awards ───────────────────────────────────────────
  { name: "Defense.gov Contracts", url: "https://www.defense.gov/News/Contracts/", category: "Federal Procurement / Awards" },
  { name: "SAM.gov Opportunities", url: "https://sam.gov/content/opportunities", category: "Federal Procurement / Awards" },
  { name: "USAspending", url: "https://www.usaspending.gov/", category: "Federal Procurement / Awards" },
  { name: "Grants.gov", url: "https://www.grants.gov/", category: "Federal Procurement / Awards" },
  { name: "Acquisition.gov", url: "https://www.acquisition.gov/", category: "Federal Procurement / Awards" },
  { name: "Acquisition.gov FAR RSS", url: "https://www.acquisition.gov/far-site/rss", category: "Federal Procurement / Awards" },

  // ── Regulatory / Rulemaking ────────────────────────────────────────────────
  { name: "Federal Register", url: "https://www.federalregister.gov/", category: "Regulatory / Rulemaking" },
  { name: "Regulations.gov", url: "https://www.regulations.gov/", category: "Regulatory / Rulemaking" },
  { name: "GovInfo", url: "https://www.govinfo.gov/", category: "Regulatory / Rulemaking" },
  { name: "Congress.gov", url: "https://www.congress.gov/", category: "Regulatory / Rulemaking" },

  // ── Oversight / Pain Points ───────────────────────────────────────────────
  { name: "Oversight.gov", url: "https://www.oversight.gov/", category: "Oversight / Pain Points" },
  { name: "Oversight.gov Reports", url: "https://www.oversight.gov/reports", category: "Oversight / Pain Points" },
  { name: "GAO Reports", url: "https://www.gao.gov/reports-testimonies", category: "Oversight / Pain Points" },
  { name: "GAO Bid Protests", url: "https://www.gao.gov/legal/bid-protests", category: "Oversight / Pain Points" },
  { name: "DoD OIG", url: "https://www.dodig.mil/", category: "Oversight / Pain Points" },
  { name: "DHS OIG", url: "https://www.oig.dhs.gov/", category: "Oversight / Pain Points" },
  { name: "HHS OIG", url: "https://oig.hhs.gov/", category: "Oversight / Pain Points" },
  { name: "DOJ OIG", url: "https://oig.justice.gov/", category: "Oversight / Pain Points" },

  // ── Workforce / Demand ────────────────────────────────────────────────────
  { name: "USAJOBS", url: "https://www.usajobs.gov/", category: "Workforce / Demand" },
  { name: "BLS", url: "https://www.bls.gov/", category: "Workforce / Demand" },
  { name: "DOL WARN", url: "https://www.dol.gov/agencies/eta/layoffs/warn", category: "Workforce / Demand" },

  // ── Medical / Deployment / Occu-Med ─────────────────────────────────────
  { name: "CDC Travel Notices", url: "https://wwwnc.cdc.gov/travel/notices", category: "Medical / Deployment / Occu-Med" },
  { name: "State Dept Travel Advisories", url: "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html/", category: "Medical / Deployment / Occu-Med" },
  { name: "FMCSA Medical", url: "https://www.fmcsa.dot.gov/regulations/medical", category: "Medical / Deployment / Occu-Med" },
  { name: "FMCSA National Registry", url: "https://nationalregistry.fmcsa.dot.gov/", category: "Medical / Deployment / Occu-Med" },
  { name: "FAA AME Guide", url: "https://www.faa.gov/ame_guide", category: "Medical / Deployment / Occu-Med" },
  { name: "OSHA News Releases", url: "https://www.osha.gov/news/newsreleases", category: "Medical / Deployment / Occu-Med" },
  { name: "OSHA Data", url: "https://www.osha.gov/data", category: "Medical / Deployment / Occu-Med" },
  { name: "OSHA Enforcement", url: "https://www.osha.gov/ords/imis/establishment.html", category: "Medical / Deployment / Occu-Med" },

  // ── State / Local Procurement ─────────────────────────────────────────────
  { name: "NASPO State Procurement Directory", url: "https://www.naspo.org/states/", category: "State / Local Procurement" },
  { name: "Cal eProcure", url: "https://caleprocure.ca.gov/", category: "State / Local Procurement" },
  { name: "Colorado VSS", url: "https://codpa-vss.cloud.cgifederal.com/webapp/PRDVSS2X1/AltSelfService", category: "State / Local Procurement" },
  { name: "Texas SmartBuy", url: "https://www.txsmartbuy.gov/", category: "State / Local Procurement" },
  { name: "Florida Vendor Bid System", url: "https://vendor.myfloridamarketplace.com/", category: "State / Local Procurement" },
  { name: "NYS Contract Reporter", url: "https://www.nyscr.ny.gov/", category: "State / Local Procurement" },
];

const CATEGORIES: Category[] = [
  "All",
  "Contractor Newsrooms",
  "Federal Procurement / Awards",
  "Regulatory / Rulemaking",
  "Oversight / Pain Points",
  "Workforce / Demand",
  "Medical / Deployment / Occu-Med",
  "State / Local Procurement",
];

// ── Preview Card Component ───────────────────────────────────────────────────

interface PreviewCardProps {
  source: Source;
}

function PreviewCard({ source }: PreviewCardProps) {
  const [key, setKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setLoading(true);
    setTimedOut(false);
    const timer = setTimeout(() => {
      setTimedOut(true);
      setLoading(false);
    }, 20_000);
    return () => clearTimeout(timer);
  }, [key]);

  const handleLoad = useCallback(() => {
    setLoading(false);
  }, []);

  const handleReload = useCallback(() => {
    setKey((k) => k + 1);
  }, []);

  return (
    <div className="flex flex-col bg-white/5 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <Monitor className="w-4 h-4 text-primary shrink-0" />
          <h3 className="text-sm font-semibold text-white truncate">
            {source.name}
          </h3>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <button
            onClick={handleReload}
            className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
            title="Reload preview"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Category tag + URL */}
      <div className="px-4 py-1.5 border-b border-white/5 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium shrink-0">
          {source.category}
        </span>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-muted-foreground hover:text-primary truncate block"
        >
          {source.url}
        </a>
      </div>

      {/* Preview area */}
      <div className="relative w-full" style={{ height: "600px" }}>
        {loading && !timedOut && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/40 z-10">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="mt-3 text-xs text-muted-foreground">Loading preview…</span>
          </div>
        )}

        {timedOut && (
          <div className="absolute inset-x-0 bottom-0 z-20 p-3 text-center bg-background/90 border-t border-white/10 backdrop-blur-sm">
            <div className="flex items-center justify-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <p className="text-xs font-medium text-white">
                Preview blocked or slow — this site may not allow embedding.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary/20 hover:bg-primary/30 text-primary text-xs font-medium transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in new tab
              </a>
              <button
                onClick={handleReload}
                className="text-xs text-muted-foreground hover:text-white underline transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <iframe
          key={key}
          src={source.url}
          title={`${source.name} preview`}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation-by-user-activation"
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={handleLoad}
        />
      </div>
    </div>
  );
}

// ── Page Component ─────────────────────────────────────────────────────────────

export default function LiveSourceWall() {
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSources = useMemo(() => {
    const byCategory =
      activeCategory === "All"
        ? SOURCES
        : SOURCES.filter((s) => s.category === activeCategory);

    const q = searchQuery.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter((s) => s.name.toLowerCase().includes(q));
  }, [activeCategory, searchQuery]);

  const sourceCount = filteredSources.length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <LayoutGrid className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white">Live Source Wall</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Iframe-only live previews of curated intelligence sources. No scraping,
          no crawling, no extraction.
        </p>
      </div>

      {/* Search + Category filters */}
      <div className="flex flex-col gap-4">
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search sources…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                activeCategory === cat
                  ? "bg-primary/20 text-primary border-primary/30"
                  : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10 hover:text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div className="text-xs text-muted-foreground">
        Showing {sourceCount} of {SOURCES.length} sources
        {activeCategory !== "All" && ` · ${activeCategory}`}
        {searchQuery.trim() && ` · matching “${searchQuery.trim()}”`}
      </div>

      {/* Responsive grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredSources.map((s) => (
          <PreviewCard key={s.name} source={s} />
        ))}
      </div>

      {filteredSources.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Search className="w-10 h-10 text-muted-foreground/40 mb-4" />
          <p className="text-sm text-muted-foreground">
            No sources match your filters.
          </p>
          <button
            onClick={() => {
              setActiveCategory("All");
              setSearchQuery("");
            }}
            className="mt-3 text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
