/**
 * Scheduled Crawler with Change Detection
 *
 * Role: Periodically crawl known government portal URLs and detect changes
 * to discover new opportunities without relying on external search APIs.
 *
 * Benefits:
 * - No API keys required
 * - Scheduled, reliable discovery
 * - Change detection minimizes processing
 * - Builds local index of opportunities
 * - Works offline
 */

import { createHash } from "crypto";
import type { NormalizedOpportunity } from "../providers/types";

interface CrawlTarget {
  url: string;
  name: string;
  state?: string;
  agency?: string;
  category?: string;
  lastCrawled?: Date;
  lastHash?: string;
  crawlIntervalMs: number;
  enabled: boolean;
}

interface CrawlResult {
  target: CrawlTarget;
  opportunities: NormalizedOpportunity[];
  newOpportunities: number;
  changedOpportunities: number;
  lastCrawled: Date;
  hash: string;
  error?: string;
}

interface CrawlSchedule {
  targets: CrawlTarget[];
  lastRun?: Date;
  nextRun?: Date;
  isRunning: boolean;
}

const DEFAULT_CRAWL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const HASH_ALGORITHM = "sha256";

// Default crawl targets - government portals with RSS feeds or listing pages
const DEFAULT_TARGETS: CrawlTarget[] = [
  {
    url: "https://sam.gov/api/prod/opportunities/v1/search?format=rss",
    name: "SAM.gov RSS",
    agency: "Federal",
    category: "Federal",
    crawlIntervalMs: DEFAULT_CRAWL_INTERVAL_MS,
    enabled: true,
  },
  {
    url: "https://www.grants.gov/web/grants/rss/opportunities",
    name: "Grants.gov RSS",
    agency: "Federal",
    category: "Grants",
    crawlIntervalMs: DEFAULT_CRAWL_INTERVAL_MS,
    enabled: true,
  },
  {
    url: "https://www.txsmartbuy.gov/esbd",
    name: "Texas ESBD",
    state: "TX",
    agency: "Texas",
    crawlIntervalMs: DEFAULT_CRAWL_INTERVAL_MS,
    enabled: true,
  },
  {
    url: "https://www.nyscr.ny.gov/Ads/Search",
    name: "New York SCR",
    state: "NY",
    agency: "New York",
    crawlIntervalMs: DEFAULT_CRAWL_INTERVAL_MS,
    enabled: true,
  },
];

export class ScheduledCrawler {
  private schedule: CrawlSchedule = {
    targets: [...DEFAULT_TARGETS],
    isRunning: false,
  };

  private opportunityCache = new Map<string, NormalizedOpportunity>();

  /**
   * Add a new crawl target.
   */
  addTarget(target: CrawlTarget): void {
    this.schedule.targets.push(target);
  }

  /**
   * Remove a crawl target by URL.
   */
  removeTarget(url: string): void {
    this.schedule.targets = this.schedule.targets.filter(t => t.url !== url);
  }

  /**
   * Enable or disable a crawl target.
   */
  setTargetEnabled(url: string, enabled: boolean): void {
    const target = this.schedule.targets.find(t => t.url === url);
    if (target) {
      target.enabled = enabled;
    }
  }

  /**
   * Get all crawl targets.
   */
  getTargets(): CrawlTarget[] {
    return [...this.schedule.targets];
  }

  /**
   * Calculate hash of content for change detection.
   */
  private calculateHash(content: string): string {
    return createHash(HASH_ALGORITHM).update(content).digest("hex");
  }

  /**
   * Fetch content from a URL.
   */
  private async fetchContent(url: string, signal?: AbortSignal): Promise<string> {
    const response = await fetch(url, {
      signal,
      headers: {
        "Accept": "application/rss+xml, application/xml, text/html, text/plain",
        "User-Agent": "Insight-Hub-ScheduledCrawler/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * Detect changes between previous and current content.
   */
  private detectChanges(
    previousHash: string | undefined,
    currentHash: string,
    previousOpportunities: NormalizedOpportunity[],
    currentOpportunities: NormalizedOpportunity[]
  ): { newOpportunities: number; changedOpportunities: number } {
    if (!previousHash) {
      // First crawl - all opportunities are new
      return { newOpportunities: currentOpportunities.length, changedOpportunities: 0 };
    }

    if (previousHash === currentHash) {
      // No changes
      return { newOpportunities: 0, changedOpportunities: 0 };
    }

    // Content changed - detect new/changed opportunities
    const previousIds = new Set(previousOpportunities.map(o => o.externalId));
    const currentIds = new Set(currentOpportunities.map(o => o.externalId));

    const newOpportunities = currentOpportunities.filter(o => !previousIds.has(o.externalId)).length;
    const changedOpportunities = currentOpportunities.filter(o => {
      const prev = previousOpportunities.find(p => p.externalId === o.externalId);
      if (!prev) return false;
      return JSON.stringify(prev) !== JSON.stringify(o);
    }).length;

    return { newOpportunities, changedOpportunities };
  }

  /**
   * Crawl a single target.
   */
  private async crawlTarget(target: CrawlTarget, signal?: AbortSignal): Promise<CrawlResult> {
    const startTime = Date.now();
    let opportunities: NormalizedOpportunity[] = [];
    let error: string | undefined;

    try {
      const content = await this.fetchContent(target.url, signal);
      const hash = this.calculateHash(content);

      // Parse opportunities from content
      // This is a simplified version - in production, you'd use the appropriate parser
      // for each target (RSS parser, HTML parser, etc.)
      opportunities = this.parseContentToOpportunities(content, target);

      // Detect changes
      const { newOpportunities, changedOpportunities } = this.detectChanges(
        target.lastHash,
        hash,
        this.getOpportunitiesFromCache(target.url),
        opportunities
      );

      // Update target
      target.lastCrawled = new Date();
      target.lastHash = hash;

      // Update cache
      this.updateOpportunityCache(target.url, opportunities);

      return {
        target,
        opportunities,
        newOpportunities,
        changedOpportunities,
        lastCrawled: target.lastCrawled,
        hash,
      };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      return {
        target,
        opportunities: [],
        newOpportunities: 0,
        changedOpportunities: 0,
        lastCrawled: new Date(),
        hash: target.lastHash || "",
        error,
      };
    }
  }

  /**
   * Parse content to opportunities (simplified - use appropriate parsers in production).
   */
  private parseContentToOpportunities(content: string, target: CrawlTarget): NormalizedOpportunity[] {
    // This is a placeholder - in production, you'd use:
    // - RSS parser for RSS feeds
    // - HTML parser for listing pages
    // - Specific parsers for each portal type
    
    // For now, return empty array - this would be implemented with actual parsers
    return [];
  }

  /**
   * Get opportunities from cache for a target.
   */
  private getOpportunitiesFromCache(url: string): NormalizedOpportunity[] {
    const cached = Array.from(this.opportunityCache.values()).filter(o => {
      const sourceUrl = typeof o.sourceUrl === 'string' ? o.sourceUrl : '';
      const rawDataUrl = typeof o.rawData?.sourceUrl === 'string' ? o.rawData.sourceUrl : '';
      return sourceUrl.includes(url) || rawDataUrl.includes(url);
    });
    return cached;
  }

  /**
   * Update opportunity cache for a target.
   */
  private updateOpportunityCache(url: string, opportunities: NormalizedOpportunity[]): void {
    // Remove old opportunities for this URL
    for (const [id, opp] of this.opportunityCache.entries()) {
      const sourceUrl = typeof opp.sourceUrl === 'string' ? opp.sourceUrl : '';
      const rawDataUrl = typeof opp.rawData?.sourceUrl === 'string' ? opp.rawData.sourceUrl : '';
      if (sourceUrl.includes(url) || rawDataUrl.includes(url)) {
        this.opportunityCache.delete(id);
      }
    }
    
    // Add new opportunities
    for (const opp of opportunities) {
      this.opportunityCache.set(opp.externalId, opp);
    }
  }

  /**
   * Run scheduled crawl for all enabled targets that are due.
   */
  async runScheduledCrawl(signal?: AbortSignal): Promise<CrawlResult[]> {
    if (this.schedule.isRunning) {
      throw new Error("Crawl already in progress");
    }

    this.schedule.isRunning = true;
    this.schedule.lastRun = new Date();

    const results: CrawlResult[] = [];
    const now = Date.now();

    for (const target of this.schedule.targets) {
      if (!target.enabled) continue;

      // Check if target is due for crawl
      if (target.lastCrawled && (now - target.lastCrawled.getTime()) < target.crawlIntervalMs) {
        continue;
      }

      try {
        const result = await this.crawlTarget(target, signal);
        results.push(result);
      } catch (err) {
        results.push({
          target,
          opportunities: [],
          newOpportunities: 0,
          changedOpportunities: 0,
          lastCrawled: new Date(),
          hash: target.lastHash || "",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.schedule.isRunning = false;
    
    // Calculate next run time
    const nextRunDelay = this.schedule.targets
      .filter(t => t.enabled)
      .reduce((min, t) => Math.min(min, t.crawlIntervalMs), DEFAULT_CRAWL_INTERVAL_MS);
    
    this.schedule.nextRun = new Date(now + nextRunDelay);

    return results;
  }

  /**
   * Get crawl schedule status.
   */
  getScheduleStatus(): CrawlSchedule {
    return {
      ...this.schedule,
      targets: [...this.schedule.targets],
    };
  }

  /**
   * Get cached opportunities.
   */
  getCachedOpportunities(): NormalizedOpportunity[] {
    return Array.from(this.opportunityCache.values());
  }

  /**
   * Clear opportunity cache.
   */
  clearCache(): void {
    this.opportunityCache.clear();
  }
}

// Singleton instance
export const scheduledCrawler = new ScheduledCrawler();
