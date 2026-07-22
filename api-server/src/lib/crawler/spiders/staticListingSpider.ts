import {
  extractPaginationUrls,
  extractStaticHtmlOpportunities,
  withPublicPortalMetadata,
} from "../../providers/publicPortalProviders/genericExtractors";
import { canonicalizeCrawlerUrl, contentHash } from "../safety";
import type {
  CrawlDiagnostics,
  PortalSpider,
  SpiderRunContext,
  SpiderRunResult,
} from "../types";

export class StaticListingSpider implements PortalSpider {
  readonly kind = "static_listing" as const;

  async run(context: SpiderRunContext): Promise<SpiderRunResult> {
    const diagnostics: CrawlDiagnostics = {
      spiderId: context.config.id,
      sourceId: context.source.id,
      kind: this.kind,
      startedAt: new Date().toISOString(),
      pagesCrawled: 0,
      urlsVisited: 0,
      bytesRead: 0,
      retries: 0,
      discoveredUrls: [],
      errors: [],
    };
    const queue = [...context.config.startUrls];
    const seenPages = new Set<string>();
    const seenRecords = new Set<string>();
    const records: SpiderRunResult["records"] = [];
    const hashes: string[] = [];
    let lastEtag: string | undefined;
    let lastModified: string | undefined;
    let sawNotModified = false;

    while (
      queue.length > 0 &&
      diagnostics.pagesCrawled < context.limits.maxPages &&
      diagnostics.urlsVisited < context.limits.maxUrls &&
      records.length < context.limits.maxUrls
    ) {
      if (context.signal?.aborted)
        throw context.signal.reason ?? new Error("Static listing spider cancelled");
      const rawUrl = queue.shift();
      if (!rawUrl) break;
      const pageUrl = canonicalizeCrawlerUrl(
        rawUrl,
        context.source.sourceUrl,
        context.config.allowedHosts,
      );
      if (!pageUrl || seenPages.has(pageUrl)) continue;
      seenPages.add(pageUrl);
      diagnostics.urlsVisited += 1;

      try {
        const response = await context.fetchText(pageUrl);
        lastEtag = response.etag ?? lastEtag;
        lastModified = response.lastModified ?? lastModified;
        if (response.notModified) {
          sawNotModified = true;
          continue;
        }
        diagnostics.pagesCrawled += 1;
        hashes.push(contentHash(response.text));
        const pageSource = { ...context.source, sourceUrl: response.url };
        const pageRecords = extractStaticHtmlOpportunities(
          response.text,
          pageSource,
          Math.max(1, context.limits.maxUrls - records.length),
        ).map((record) => withPublicPortalMetadata(record, pageSource));

        for (const record of pageRecords) {
          const key = `${record.sourceUrl ?? ""}|${record.solicitationNumber ?? ""}|${record.title}`.toLowerCase();
          if (seenRecords.has(key)) continue;
          seenRecords.add(key);
          records.push({
            ...record,
            rawData: {
              ...(record.rawData ?? {}),
              spiderId: context.config.id,
              spiderKind: this.kind,
              listingPageUrl: response.url,
            },
          });
          if (records.length >= context.limits.maxUrls) break;
        }

        const nextUrls = extractPaginationUrls(
          response.text,
          response.url,
          context.source.domain,
          Math.max(6, context.limits.maxPages * 3),
        );
        for (const nextUrl of nextUrls) {
          const canonical = canonicalizeCrawlerUrl(
            nextUrl,
            response.url,
            context.config.allowedHosts,
          );
          if (!canonical || seenPages.has(canonical) || queue.includes(canonical)) continue;
          queue.push(canonical);
          context.recordDiscoveredUrl(canonical);
          diagnostics.discoveredUrls.push(canonical);
        }
      } catch (error) {
        diagnostics.errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    diagnostics.completedAt = new Date().toISOString();
    const outcome = records.length > 0
      ? "success"
      : sawNotModified && diagnostics.errors.length === 0
        ? "not_modified"
        : diagnostics.errors.length > 0
          ? "failed"
          : "no_results";
    return {
      outcome,
      records,
      diagnostics,
      etag: lastEtag,
      lastModified,
      contentHash: hashes.length ? contentHash(hashes.join("|")) : context.frontier?.contentHash,
    };
  }
}
