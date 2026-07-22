import { contentHash } from "../safety";
import {
  absoluteUrl,
  firstString,
  makeCrawlerOpportunity,
  parseCrawlerDate,
  readPath,
  readRecordsPath,
  stableExternalId,
} from "../spiderUtils";
import type {
  CrawlDiagnostics,
  JsonEndpointSpiderConfig,
  PortalSpider,
  SpiderRunContext,
  SpiderRunResult,
} from "../types";

function endpointForPage(
  config: JsonEndpointSpiderConfig,
  page: number,
  cursor?: string,
): { url: string; body?: Record<string, unknown> } {
  const pagination = config.pagination ?? { mode: "none" as const };
  const body = { ...(config.body ?? {}) };
  const url = new URL(config.endpointUrl);
  if (pagination.mode === "page") {
    const key = pagination.parameter ?? "page";
    if ((config.method ?? "GET") === "GET")
      url.searchParams.set(key, String(page));
    else body[key] = page;
  } else if (pagination.mode === "offset") {
    const size = pagination.pageSize ?? 100;
    const key = pagination.parameter ?? "offset";
    const sizeKey = pagination.pageSizeParameter ?? "limit";
    if ((config.method ?? "GET") === "GET") {
      url.searchParams.set(key, String((page - 1) * size));
      url.searchParams.set(sizeKey, String(size));
    } else {
      body[key] = (page - 1) * size;
      body[sizeKey] = size;
    }
  } else if (pagination.mode === "cursor" && cursor) {
    const key = pagination.parameter ?? "cursor";
    if ((config.method ?? "GET") === "GET")
      url.searchParams.set(key, cursor);
    else body[key] = cursor;
  }
  return { url: url.toString(), body };
}

export class JsonEndpointSpider implements PortalSpider {
  readonly kind = "json_endpoint" as const;

  async run(context: SpiderRunContext): Promise<SpiderRunResult> {
    if (context.config.kind !== this.kind)
      throw new Error(`JSON endpoint spider cannot run ${context.config.kind}`);
    const config = context.config;
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
    const records: SpiderRunResult["records"] = [];
    const seen = new Set<string>();
    const hashes: string[] = [];
    let cursor = context.frontier?.cursor;
    let lastEtag: string | undefined;
    let lastModified: string | undefined;
    let sawNotModified = false;

    for (let page = 1; page <= context.limits.maxPages; page += 1) {
      if (context.signal?.aborted) {
        const reason = context.signal.reason;
        diagnostics.errors.push(
          reason instanceof Error
            ? reason.message
            : "JSON endpoint spider cancelled",
        );
        break;
      }
      const request = endpointForPage(config, page, cursor);
      diagnostics.urlsVisited += 1;
      try {
        const method = config.method ?? "GET";
        const response = await context.fetchText(request.url, {
          method,
          headers: {
            ...(config.headers ?? {}),
            ...(method === "POST" ? { "content-type": "application/json" } : {}),
          },
          body: method === "POST" ? JSON.stringify(request.body ?? {}) : undefined,
        });
        lastEtag = response.etag ?? lastEtag;
        lastModified = response.lastModified ?? lastModified;
        if (response.notModified) {
          sawNotModified = true;
          break;
        }
        diagnostics.pagesCrawled += 1;
        hashes.push(contentHash(response.text));
        const payload = JSON.parse(response.text) as unknown;
        const rows = readRecordsPath(payload, config.recordsPath);
        if (rows.length === 0) break;

        for (const row of rows) {
          const title = firstString(row, config.fields.title);
          if (!title) continue;
          const solicitationNumber = firstString(
            row,
            config.fields.solicitationNumber,
          );
          const detailUrl = absoluteUrl(
            firstString(row, config.fields.detailUrl),
            response.url,
          );
          const externalId = stableExternalId(
            context.source.id,
            firstString(row, config.fields.id),
            solicitationNumber,
            detailUrl,
            title,
          );
          if (seen.has(externalId)) continue;
          seen.add(externalId);
          records.push(
            makeCrawlerOpportunity({
              source: context.source,
              externalId,
              title,
              agency: firstString(row, config.fields.agency),
              description: firstString(row, config.fields.description),
              solicitationNumber,
              postedDate: parseCrawlerDate(
                firstString(row, config.fields.postedDate),
              ),
              responseDeadline: parseCrawlerDate(
                firstString(row, config.fields.responseDeadline),
              ),
              sourceUrl: detailUrl ?? response.url,
              location: firstString(row, config.fields.location),
              type: firstString(row, config.fields.type),
              rawData: {
                spiderId: config.id,
                spiderKind: this.kind,
                endpointUrl: response.url,
                endpointRecord: row,
                endpointStatus: firstString(row, config.fields.status),
              },
            }),
          );
          if (records.length >= context.limits.maxUrls) break;
        }

        if (records.length >= context.limits.maxUrls) break;
        if (config.pagination?.mode === "cursor") {
          const next = config.pagination.cursorPath
            ? readPath(payload, config.pagination.cursorPath)
            : undefined;
          cursor =
            typeof next === "string" && next.trim() ? next.trim() : undefined;
          if (!cursor) break;
        } else if (!config.pagination || config.pagination.mode === "none") {
          break;
        }
      } catch (error) {
        diagnostics.errors.push(
          error instanceof Error ? error.message : String(error),
        );
        break;
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
      cursor,
    };
  }
}
