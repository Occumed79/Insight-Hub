import { auditPublicDynamicEndpoints } from "../../providers/dynamicEndpointAudit";
import type {
  BrowserDiscoverySpiderConfig,
  CrawlDiagnostics,
  PortalSpider,
  SpiderRunContext,
  SpiderRunResult,
} from "../types";

export class BrowserDiscoverySpider implements PortalSpider {
  readonly kind = "browser_discovery" as const;

  async run(context: SpiderRunContext): Promise<SpiderRunResult> {
    if (context.config.kind !== this.kind)
      throw new Error(`Browser discovery spider cannot run ${context.config.kind}`);
    const config = context.config as BrowserDiscoverySpiderConfig;
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
      dynamicEndpoints: [],
    };

    for (const pageUrl of config.startUrls.slice(0, context.limits.maxPages)) {
      if (context.signal?.aborted)
        throw context.signal.reason ?? new Error("Browser discovery spider cancelled");
      diagnostics.urlsVisited += 1;
      try {
        const endpoints = await auditPublicDynamicEndpoints(pageUrl, {
          timeoutMs: Math.min(
            context.limits.elapsedMs,
            context.limits.requestTimeoutMs * 2,
          ),
          maxResponses: Math.min(config.maxResponses ?? 10, context.limits.maxUrls),
          allowedApiHosts: config.allowedHosts,
          searchText: config.searchText,
          activateOpportunityTab: config.activateOpportunityTab,
          activateFilterText: config.activateFilterText,
          paginateOnce: config.paginateOnce,
        });
        diagnostics.pagesCrawled += 1;
        diagnostics.dynamicEndpoints?.push(...endpoints);
        for (const endpoint of endpoints) {
          context.recordDiscoveredUrl(endpoint.endpointUrl);
          diagnostics.discoveredUrls.push(endpoint.endpointUrl);
        }
      } catch (error) {
        diagnostics.errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    diagnostics.completedAt = new Date().toISOString();
    const endpointCount = diagnostics.dynamicEndpoints?.length ?? 0;
    return {
      outcome:
        endpointCount > 0
          ? "success"
          : diagnostics.errors.length > 0
            ? "failed"
            : "no_results",
      records: [],
      diagnostics,
    };
  }
}
