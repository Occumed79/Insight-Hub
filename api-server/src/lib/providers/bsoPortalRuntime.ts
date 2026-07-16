import type { FetchOptions, NormalizedOpportunity } from "./types";
import { BSO_TENANTS, type BsoTenant, type Detail, type ListingRow, Session, envInt } from "./bsoPortalCore";
import { nextRequest, parseDetail, parseRows, toOpportunity } from "./bsoPortalParser";

export async function mapConcurrent<T, R>(values: readonly T[], concurrency: number, worker: (value: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), Math.max(values.length, 1)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      const value = values[index];
      if (value === undefined) return;
      results[index] = await worker(value, index);
    }
  }));
  return results;
}

export async function fetchBsoTenant(tenant: BsoTenant, options: FetchOptions, limit: number): Promise<{ records: NormalizedOpportunity[]; errors: string[] }> {
  const maxPages = envInt("BSO_MAX_PAGES", 3, 1, 10);
  const detailLimit = envInt("BSO_DETAIL_LIMIT", 20, 0, 100);
  const session = new Session(tenant.origin, envInt("BSO_REQUEST_TIMEOUT_MS", 20_000, 3_000, 60_000), envInt("BSO_MAX_RETRIES", 2, 0, 5));
  const errors: string[] = [];
  const rows = new Map<string, ListingRow>();
  let pageUrl = tenant.listingUrl;
  let html = await session.get(pageUrl, `${tenant.name} open-bid listing page 1`);
  const reportedTotal = Number.parseInt((html.match(/\b\d+\s*-\s*\d+\s+of\s+([\d,]+)/i)?.[1] ?? "").replace(/,/g, ""), 10) || undefined;
  const signatures = new Set<string>();
  let page = 0;
  while (page < maxPages && rows.size < limit) {
    page += 1;
    const pageRows = parseRows(html, tenant, pageUrl, page);
    const signature = pageRows.map((row) => row.docId.toLowerCase()).join("|");
    if (signature && signatures.has(signature)) { errors.push(`${tenant.id}: pagination repeated an already processed page.`); break; }
    if (signature) signatures.add(signature);
    for (const row of pageRows) { if (!rows.has(row.docId.toLowerCase())) rows.set(row.docId.toLowerCase(), row); if (rows.size >= limit) break; }
    if (page >= maxPages || rows.size >= limit) break;
    const request = nextRequest(html, pageUrl, tenant.origin, page + 1);
    if (!request) break;
    try { html = await session.post(request.url, request.body, `${tenant.name} open-bid listing page ${page + 1}`); pageUrl = request.url; }
    catch (error) { errors.push(`${tenant.id}: ${error instanceof Error ? error.message : String(error)}`); break; }
  }
  const selected = Array.from(rows.values()).slice(0, limit);
  const enriched = await mapConcurrent(selected, envInt("BSO_DETAIL_CONCURRENCY", 4, 1, 8), async (row, index) => {
    if (index >= detailLimit) return { row, detail: undefined as Detail | undefined };
    try { return { row, detail: parseDetail(await session.get(row.sourceUrl, `${tenant.name} detail ${row.docId}`), tenant, row.sourceUrl) }; }
    catch (error) { errors.push(`${tenant.id} detail ${row.docId}: ${error instanceof Error ? error.message : String(error)}`); return { row, detail: undefined as Detail | undefined }; }
  });
  let records = enriched.map(({ row, detail }) => toOpportunity(tenant, row, detail)).filter((record): record is NormalizedOpportunity => Boolean(record));
  if (options.keywords?.trim()) {
    const terms = options.keywords.toLowerCase().split(/[\s,]+/).filter(Boolean);
    records = records.filter((record) => terms.every((term) => `${record.title} ${record.description ?? ""} ${record.agency}`.toLowerCase().includes(term)));
  }
  if (reportedTotal && rows.size < Math.min(reportedTotal, limit) && page === 1) errors.push(`${tenant.id}: no compatible public JSF next-page command was found after page 1.`);
  if (reportedTotal && page >= maxPages && rows.size < reportedTotal) errors.push(`${tenant.id}: stopped at the configured ${maxPages}-page cap (${rows.size} of ${reportedTotal} rows inspected).`);
  return { records, errors };
}
