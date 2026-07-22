import { contentHash } from "../safety";
import {
  absoluteUrl,
  makeCrawlerOpportunity,
  parseCrawlerDate,
  stableExternalId,
  stripMarkup,
  xmlBlocks,
  xmlLink,
  xmlValue,
} from "../spiderUtils";
import type {
  CrawlDiagnostics,
  PortalSpider,
  SpiderRunContext,
  SpiderRunResult,
} from "../types";

export class FeedSpider implements PortalSpider {
  readonly kind = "feed" as const;

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
    const records: SpiderRunResult["records"] = [];
    const seen = new Set<string>();
    const hashes: string[] = [];
    let lastEtag: string | undefined;
    let lastModified: string | undefined;
    let sawNotModified = false;

    for (const feedUrl of context.config.startUrls.slice(
      0,
      context.limits.maxPages,
    )) {
      if (context.signal?.aborted) {
        const reason = context.signal.reason;
        diagnostics.errors.push(
          reason instanceof Error ? reason.message : "Feed spider cancelled",
        );
        break;
      }
      diagnostics.urlsVisited += 1;
      try {
        const response = await context.fetchText(feedUrl);
        lastEtag = response.etag ?? lastEtag;
        lastModified = response.lastModified ?? lastModified;
        if (response.notModified) {
          sawNotModified = true;
          continue;
        }
        diagnostics.pagesCrawled += 1;
        hashes.push(contentHash(response.text));
        const blocks = [
          ...xmlBlocks(response.text, "item"),
          ...xmlBlocks(response.text, "entry"),
        ];

        for (const block of blocks) {
          const title = xmlValue(block, "title");
          if (!title) continue;
          const link = absoluteUrl(xmlLink(block), response.url);
          const guid = xmlValue(block, "guid") ?? xmlValue(block, "id");
          const description = stripMarkup(
            xmlValue(block, "description") ??
              xmlValue(block, "summary") ??
              xmlValue(block, "content") ??
              "",
          );
          const solicitationNumber =
            xmlValue(block, "solicitationNumber") ??
            xmlValue(block, "reference") ??
            xmlValue(block, "number");
          const key = stableExternalId(
            context.source.id,
            guid,
            solicitationNumber,
            link,
            title,
          );
          if (seen.has(key)) continue;
          seen.add(key);
          records.push(
            makeCrawlerOpportunity({
              source: context.source,
              externalId: key,
              title,
              description: description || undefined,
              solicitationNumber,
              postedDate: parseCrawlerDate(
                xmlValue(block, "pubDate") ??
                  xmlValue(block, "published") ??
                  xmlValue(block, "updated"),
              ),
              responseDeadline: parseCrawlerDate(
                xmlValue(block, "deadline") ??
                  xmlValue(block, "closingDate") ??
                  xmlValue(block, "dueDate"),
              ),
              sourceUrl: link ?? response.url,
              rawData: {
                spiderId: context.config.id,
                spiderKind: this.kind,
                feedUrl: response.url,
                feedGuid: guid,
              },
            }),
          );
          if (records.length >= context.limits.maxUrls) break;
        }
      } catch (error) {
        diagnostics.errors.push(
          error instanceof Error ? error.message : String(error),
        );
      }
      if (records.length >= context.limits.maxUrls) break;
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
