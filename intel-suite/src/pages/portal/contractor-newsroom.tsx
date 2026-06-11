/**
 * Contractor Newsroom Wall
 *
 * This page displays live iframe preview rectangles for major federal
 * contractor newsroom URLs. It does NOT scrape, crawl, parse, or store any
 * page content. Each card simply embeds the target site via a sandboxed
 * <iframe> so users can glance at headlines without leaving the portal.
 *
 * Phase 1 keeps the contractor list in frontend code. Future phases may
 * load the list from an API or allow user-managed subscriptions.
 */

import { useState, useEffect, useCallback } from "react";
import {
  ExternalLink,
  RefreshCw,
  Newspaper,
  AlertTriangle,
  Monitor,
} from "lucide-react";

// ── Contractor list (Phase 1: hard-coded frontend config) ───────────────────

interface Contractor {
  name: string;
  url: string;
}

const CONTRACTORS: Contractor[] = [
  { name: "V2X", url: "https://www.v2x.com/newsroom/" },
  { name: "Amentum", url: "https://www.amentum.com/news/" },
  { name: "KBR", url: "https://www.kbr.com/en/newsroom" },
  { name: "Leidos", url: "https://www.leidos.com/newsroom" },
  { name: "CACI", url: "https://www.caci.com/news" },
  { name: "Booz Allen", url: "https://www.boozallen.com/e/media.html" },
  { name: "RTX", url: "https://www.rtx.com/news" },
  { name: "Lockheed Martin", url: "https://news.lockheedmartin.com/" },
  { name: "Northrop Grumman", url: "https://news.northropgrumman.com/" },
  { name: "General Dynamics", url: "https://www.gd.com/news" },
  { name: "Boeing Defense", url: "https://www.boeing.com/defense/news" },
  { name: "Parsons", url: "https://www.parsons.com/newsroom/" },
  { name: "SAIC", url: "https://www.saic.com/newsroom" },
  { name: "Serco North America", url: "https://www.serco.com/na/news" },
  { name: "Akima", url: "https://www.akima.com/news/" },
  { name: "Peraton", url: "https://www.peraton.com/news/" },
  { name: "ManTech", url: "https://www.mantech.com/news/" },
  { name: "Fluor", url: "https://newsroom.fluor.com/" },
];

// ── Preview Card Component ───────────────────────────────────────────────────

interface PreviewCardProps {
  contractor: Contractor;
}

function PreviewCard({ contractor }: PreviewCardProps) {
  const [key, setKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);

  // Reset loading + timeout whenever the iframe key changes (reload)
  useEffect(() => {
    setLoading(true);
    setTimedOut(false);

    const timer = setTimeout(() => {
      setTimedOut(true);
      setLoading(false);
    }, 10_000);

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
            {contractor.name}
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
            href={contractor.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* URL label */}
      <div className="px-4 py-1.5 border-b border-white/5">
        <a
          href={contractor.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-muted-foreground hover:text-primary truncate block"
        >
          {contractor.url}
        </a>
      </div>

      {/* Preview area */}
      <div className="relative w-full" style={{ height: "480px" }}>
        {loading && !timedOut && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/40 z-10">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="mt-3 text-xs text-muted-foreground">Loading preview…</span>
          </div>
        )}

        {/* Fallback overlay (shown after timeout) */}
        {timedOut && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-20 p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-400 mb-3" />
            <p className="text-sm font-medium text-white mb-1">
              This site may block embedded previews.
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Open in a new tab to view the newsroom.
            </p>
            <a
              href={contractor.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary/20 hover:bg-primary/30 text-primary text-sm font-medium transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open in new tab
            </a>
            <button
              onClick={handleReload}
              className="mt-3 text-xs text-muted-foreground hover:text-white underline transition-colors"
            >
              Retry preview
            </button>
          </div>
        )}

        {/* Live iframe preview — sandboxed for safety */}
        <iframe
          key={key}
          src={contractor.url}
          title={`${contractor.name} newsroom preview`}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-popups"
          loading="lazy"
          onLoad={handleLoad}
        />
      </div>
    </div>
  );
}

// ── Page Component ─────────────────────────────────────────────────────────────

export default function ContractorNewsroomWall() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Newspaper className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white">Contractor Newsroom Wall</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Live preview wall for major federal contractor newsrooms. Each card embeds
          the contractor&apos;s public newsroom site directly. If a site blocks iframe
          previews, use <strong>Open in new tab</strong> instead.
        </p>
      </div>

      {/* Responsive grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {CONTRACTORS.map((c) => (
          <PreviewCard key={c.name} contractor={c} />
        ))}
      </div>
    </div>
  );
}
