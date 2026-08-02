/**
 * RSS Feed Aggregator Provider
 *
 * Role: Aggregate RSS feeds from government portals to discover opportunities
 * without relying on external search APIs. RSS feeds are stable, free, and
 * don't require API keys.
 *
 * Benefits:
 * - No API keys required
 * - Stable and reliable
 * - Real-time updates
 * - Official government sources
 * - Low bandwidth
 */

import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

interface RssFeedConfig {
  name: string;
  url: string;
  state?: string;
  agency?: string;
  category?: string;
}

const GOVERNMENT_RSS_FEEDS: RssFeedConfig[] = [
  {
    name: "SAM.gov RSS",
    url: "https://sam.gov/api/prod/opportunities/v1/search?format=rss",
    agency: "Federal",
    category: "Federal",
  },
  {
    name: "Grants.gov RSS",
    url: "https://www.grants.gov/web/grants/rss/opportunities",
    agency: "Federal",
    category: "Grants",
  },
  {
    name: "California RSS",
    url: "https://www.calbuy.ca.gov/BidOpportunities/RSS",
    state: "CA",
    agency: "California",
  },
  {
    name: "Florida RSS",
    url: "https://www.floridabids.com/rss.aspx",
    state: "FL",
    agency: "Florida",
  },
  {
    name: "Texas RSS",
    url: "https://www.txsmartbuy.gov/esbd/rss",
    state: "TX",
    agency: "Texas",
  },
  {
    name: "New York RSS",
    url: "https://www.nyscr.ny.gov/Ads/Search?format=rss",
    state: "NY",
    agency: "New York",
  },
];

interface RssItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  category?: string;
  guid?: string;
}

interface ParsedRssFeed {
  title: string;
  items: RssItem[];
}

export class RssAggregatorProvider implements DataSourceProvider {
  readonly name = "rssAggregator" as const;

  async isConfigured(): Promise<boolean> {
    return true; // RSS feeds don't require configuration
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const limit = options.limit ?? 50;
    const records: NormalizedOpportunity[] = [];
    const errors: string[] = [];

    for (const feedConfig of GOVERNMENT_RSS_FEEDS) {
      try {
        const feed = await this.fetchRssFeed(feedConfig.url, options.signal);
        const feedRecords = this.parseRssToOpportunities(feed, feedConfig);
        records.push(...feedRecords);

        if (records.length >= limit) break;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`RSS feed ${feedConfig.name}: ${errorMsg}`);
      }
    }

    return {
      records: records.slice(0, limit),
      total: records.length,
      errors,
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: this.name,
      configured: true,
      healthy: true,
    };
  }

  /**
   * Fetch and parse an RSS feed.
   */
  private async fetchRssFeed(url: string, signal?: AbortSignal): Promise<ParsedRssFeed> {
    const response = await fetch(url, {
      signal,
      headers: {
        "Accept": "application/rss+xml, application/xml, text/xml",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xmlText = await response.text();
    return this.parseRssXml(xmlText);
  }

  /**
   * Parse RSS XML into structured data.
   */
  private parseRssXml(xmlText: string): ParsedRssFeed {
    const items: RssItem[] = [];
    
    // Simple XML parsing without external dependencies
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    const titleRegex = /<title[^>]*>([\s\S]*?)<\/title>/i;
    const linkRegex = /<link[^>]*>([\s\S]*?)<\/link>/i;
    const descriptionRegex = /<description[^>]*>([\s\S]*?)<\/description>/i;
    const pubDateRegex = /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i;
    const categoryRegex = /<category[^>]*>([\s\S]*?)<\/category>/i;
    const guidRegex = /<guid[^>]*>([\s\S]*?)<\/guid>/i;

    let match;
    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemContent = match[1];
      
      const titleMatch = titleRegex.exec(itemContent);
      const linkMatch = linkRegex.exec(itemContent);
      const descriptionMatch = descriptionRegex.exec(itemContent);
      const pubDateMatch = pubDateRegex.exec(itemContent);
      const categoryMatch = categoryRegex.exec(itemContent);
      const guidMatch = guidRegex.exec(itemContent);

      // Reset regex lastIndex for next iteration
      titleRegex.lastIndex = 0;
      linkRegex.lastIndex = 0;
      descriptionRegex.lastIndex = 0;
      pubDateRegex.lastIndex = 0;
      categoryRegex.lastIndex = 0;
      guidRegex.lastIndex = 0;

      if (titleMatch && linkMatch) {
        items.push({
          title: this.stripHtml(titleMatch[1]),
          link: linkMatch[1].trim(),
          description: descriptionMatch ? this.stripHtml(descriptionMatch[1]) : undefined,
          pubDate: pubDateMatch ? pubDateMatch[1].trim() : undefined,
          category: categoryMatch ? this.stripHtml(categoryMatch[1]) : undefined,
          guid: guidMatch ? guidMatch[1].trim() : undefined,
        });
      }
    }

    const channelTitleMatch = /<channel[^>]*>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i.exec(xmlText);
    const title = channelTitleMatch ? this.stripHtml(channelTitleMatch[1]) : "RSS Feed";

    return { title, items };
  }

  /**
   * Strip HTML tags from text.
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  /**
   * Convert RSS items to NormalizedOpportunity records.
   */
  private parseRssToOpportunities(
    feed: ParsedRssFeed,
    config: RssFeedConfig
  ): NormalizedOpportunity[] {
    return feed.items.map((item) => {
      const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
      const externalId = item.guid || item.link;
      const hash = this.simpleHash(externalId);

      return {
        externalId: `rss-${config.state || 'federal'}-${hash}`,
        title: item.title,
        agency: config.agency || "Government Agency",
        type: "Solicitation",
        status: "active",
        postedDate: pubDate,
        sourceUrl: item.link,
        description: item.description || item.title,
        source: "rssAggregator",
        providerName: "rssAggregator",
        rawData: {
          providerName: "rss_aggregator",
          providerFamily: "rss_feed",
          discoveryMethod: "rss_feed",
          portalName: config.name,
          portalState: config.state,
          sourceId: `rss-${config.state || 'federal'}`,
          sourceConfidence: "high",
          feedTitle: feed.title,
          rssCategory: item.category,
          rssPubDate: item.pubDate,
          tags: [
            "rss-feed",
            "official-source",
            config.state ? `state:${config.state}` : "federal",
            config.agency ? `agency:${config.agency}` : undefined,
          ].filter(Boolean) as string[],
        },
      };
    });
  }

  /**
   * Simple hash function for generating IDs.
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

export const rssAggregatorProvider = new RssAggregatorProvider();
