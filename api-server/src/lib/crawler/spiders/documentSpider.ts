import {
  extractPaginationUrls,
  extractPdfLinkOpportunities,
  withPublicPortalMetadata,
} from "../../providers/publicPortalProviders/genericExtractors";
import { canonicalizeCrawlerUrl, contentHash } from "../safety";
import type {
  CrawlDiagnostics,
  DocumentSpiderConfig,
  PortalSpider,
  SpiderRunContext,
  SpiderRunResult,
} from "../types";

export class DocumentSpider implements PortalSpider {
  readonly kind = "document" as const;

  async run(context: SpiderRunContext): Promise<SpiderRunResult> {
    if (context.config.kind !== this.kind)
      throw new Error(`Document spider cannot run ${context.config.kind}`);
    const config = context.config as DocumentSpiderConfig;
    const diagnostics: CrawlDiagnostics = {
      spiderId: config.id,
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
    const queue = [...config.startUrls];
    const seenPages = new Set<string>();
    const seenDocuments = new Set<string>();
    const records: SpiderRunResult["records"] = [];
    const hashes: string[] = [];
    const documentPattern = new RegExp(
      config.documentPattern ?? "\\.(pdf|docx?|xlsx?|zip)(?:$|[?#])",
      "i",
    );
    let lastEtag: string | undefined;
    let lastModified: string | undefined;
    let sawNotModified = false;

    while (
      queue.length > 0 &&
      diagnostics.pagesCrawled < context.limits.maxPages &&
      diagnostics.urlsVisited < context.limits.maxUrls
    ) {
      if (context.signal?.aborted) {
        const reason = context.signal.reason;
        diagnostics.errors.push(
          reason instanceof Error ? reason.message : "Document spider cancelled",
        );
        break;
      }
      const rawUrl = queue.shift();
      if (!rawUrl) break;
      const pageUrl = canonicalizeCrawlerUrl(
        rawUrl,
        context.source.sourceUrl,
        config.allowedHosts,
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
        const extracted = extractPdfLinkOpportunities(
          response.text,
          pageSource,
          Math.max(1, context.limits.maxUrls - records.length),
        );
        for (const record of extracted) {
          const documentUrl = record.sourceUrl;
          if (!documentUrl || !documentPattern.test(documentUrl)) continue;
          const canonical = canonicalizeCrawlerUrl(
            documentUrl,
            response.url,
            config.allowedHosts,
          );
          if (!canonical || seenDocuments.has(canonical)) continue;
          seenDocuments.add(canonical);
          context.recordDiscoveredUrl(canonical);
          diagnostics.discoveredUrls.push(canonical);
          records.push(
            withPublicPortalMetadata(
              {
                ...record,
                sourceUrl: canonical,
                rawData: {
                  ...(record.rawData ?? {}),
                  spiderId: config.id,
                  spiderKind: this.kind,
                  documentUrl: canonical,
                  documentIndexUrl: response.url,
                  documentFetchDeferred: true,
                },
              },
              pageSource,
            ),
          );
          if (records.length >= context.limits.maxUrls) break;
        }

        for (const nextUrl of extractPaginationUrls(
          response.text,
          response.url,
          context.source.domain,
          Math.max(6, context.limits.maxPages * 3),
        )) {
          const canonical = canonicalizeCrawlerUrl(
            nextUrl,
            response.url,
            config.allowedHosts,
          );
          if (!canonical || seenPages.has(canonical) || queue.includes(canonical))
            continue;
          queue.push(canonical);
          context.recordDiscoveredUrl(canonical);
          diagnostics.discoveredUrls.push(canonical);
        }
      } catch (error) {
        diagnostics.errors.push(
          error instanceof Error ? error.message : String(error),
        );
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
      contentHash: hashes.length
        ? contentHash(hashes.join("|"))
        : context.frontier?.contentHash,
    };
  }
}
