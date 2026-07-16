import type { NormalizedOpportunity } from "./types";
import {
  OCCUMED_TERMS,
  UNKNOWN_DATE,
  type BsoTenant,
  type Detail,
  type ListingRow,
  attr,
  dateValue,
  decode,
  labelValue,
  parseDate,
  safeUrl,
  text,
} from "./bsoPortalCore";

export function parseRows(html: string, tenant: BsoTenant, pageUrl: string, page: number): ListingRow[] {
  const rows: ListingRow[] = [];
  const seen = new Set<string>();
  for (const anchor of html.matchAll(/<a\b([^>]*)href=["']([^"']*\/external\/bidDetail\.sda\?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const sourceUrl = safeUrl(anchor[2] ?? "", pageUrl, tenant.origin);
    if (!sourceUrl) continue;
    const docId = new URL(sourceUrl).searchParams.get("docId")?.trim() || text(anchor[3] ?? "");
    if (!docId || seen.has(docId.toLowerCase())) continue;
    const index = anchor.index ?? 0;
    const start = html.toLowerCase().lastIndexOf("<tr", index);
    const end = html.toLowerCase().indexOf("</tr>", index);
    const block = start >= 0 && end >= 0 ? html.slice(start, end + 5) : html.slice(Math.max(0, index - 800), index + 1600);
    const cells = Array.from(block.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((cell) => text(cell[1] ?? ""));
    const idIndex = Math.max(0, cells.findIndex((cell) => cell.includes(docId)));
    const deadlineIndex = cells.findIndex((cell, idx) => idx > idIndex && Boolean(dateValue(cell)));
    const between = (deadlineIndex >= 0 ? cells.slice(idIndex + 1, deadlineIndex) : cells.slice(idIndex + 1)).filter((cell) => cell && cell !== docId && !/^(?:view list|none|n\/a|--|-)$/i.test(cell));
    rows.push({
      docId,
      title: between.at(-1) || text(anchor[3] ?? "") || `Bid Solicitation ${docId}`,
      agency: between[0],
      buyer: between.length >= 3 ? between.at(-2) : undefined,
      alternateId: deadlineIndex >= 0 ? cells.slice(deadlineIndex + 1).find((cell) => cell && !/^(?:sent|open|active|published|released|available|awarded vendor|bid holder list)$/i.test(cell)) : undefined,
      responseDeadline: deadlineIndex >= 0 ? parseDate(dateValue(cells[deadlineIndex] ?? "")) : undefined,
      sourceUrl,
      listingPageUrl: pageUrl,
      page,
    });
    seen.add(docId.toLowerCase());
  }
  return rows;
}

export function parseDetail(html: string, tenant: BsoTenant, detailUrl: string): Detail {
  const plain = text(html);
  const attachments = new Map<string, { name: string; url: string }>();
  for (const anchor of html.matchAll(/<a\b([^>]*)href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const name = text(anchor[3] ?? "");
    const url = safeUrl(anchor[2] ?? "", detailUrl, tenant.origin);
    if (!name || !url || !/(?:download|attachment|file|document)/i.test(`${new URL(url).pathname}${new URL(url).search}`)) continue;
    attachments.set(url.toLowerCase(), { name, url });
  }
  const nigpCodes = Array.from(plain.matchAll(/NIGP Code\s*:\s*([0-9]{2,4}\s*-\s*[0-9]{2,4})/gi)).map((match) => match[1].replace(/\s+/g, ""));
  return {
    title: labelValue(plain, "Description", ["Bid Opening Date", "Purchaser"]),
    agency: labelValue(plain, "Organization", ["Department", "Location", "Fiscal Year"]),
    buyer: labelValue(plain, "Purchaser", ["Organization", "Department"]),
    alternateId: labelValue(plain, "Alternate Id", ["Required Date", "Available Date"]),
    bidType: labelValue(plain, "Bid Type", ["Informal Bid Flag", "Purchase Method"]),
    bulletin: labelValue(plain, "Bulletin Desc", ["Ship-to Address", "Bill-to Address", "File Attachments"]),
    contact: labelValue(plain, "Info Contact", ["Bid Type", "Informal Bid Flag"]),
    postedDate: parseDate(plain.match(/Available Date\s*:\s*([^A-Z]*?\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?)/i)?.[1]),
    responseDeadline: parseDate(plain.match(/Bid Opening Date\s*:\s*([^A-Z]*?\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?)/i)?.[1]),
    attachments: Array.from(attachments.values()),
    nigpCodes: Array.from(new Set(nigpCodes)),
  };
}

export function nextRequest(html: string, pageUrl: string, origin: string, nextPage: number): { url: string; body: URLSearchParams } | undefined {
  for (const anchor of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const onclick = attr(anchor[1] ?? "", "onclick");
    const label = text(anchor[2] ?? "") || attr(anchor[1] ?? "", "title") || "";
    if (!onclick || !(label === String(nextPage) || /^(?:next|next page|›|»|→)$/i.test(label))) continue;
    const formId = decode(onclick).match(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/i)?.[1] ?? decode(onclick).match(/submitForm\(\s*['"]([^'"]+)['"]/i)?.[1];
    if (!formId) continue;
    const escaped = formId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const form = html.match(new RegExp(`(<form\\b[^>]*\\bid=["']${escaped}["'][^>]*>)([\\s\\S]*?)<\\/form>`, "i"));
    if (!form) continue;
    const url = safeUrl(attr(form[1], "action") ?? pageUrl, pageUrl, origin);
    if (!url) continue;
    const body = new URLSearchParams();
    for (const input of form[2].matchAll(/<input\b([^>]*)>/gi)) {
      const name = attr(input[1] ?? "", "name");
      if (name && (attr(input[1] ?? "", "type") ?? "text").toLowerCase() === "hidden") body.set(name, attr(input[1] ?? "", "value") ?? "");
    }
    body.set(formId, formId);
    let commandAdded = false;
    for (const pair of decode(onclick).matchAll(/['"]([^'"]+)['"]\s*:\s*['"]([^'"]*)['"]/g)) { body.set(pair[1], pair[2]); commandAdded = true; }
    if (!commandAdded) {
      const component = decode(onclick).match(/submitForm\(\s*['"][^'"]+['"]\s*,\s*['"]([^'"]+)['"]/i)?.[1];
      if (component) body.set(component, component);
    }
    return { url, body };
  }
  return undefined;
}

export function toOpportunity(tenant: BsoTenant, row: ListingRow, detail?: Detail): NormalizedOpportunity | undefined {
  const responseDeadline = detail?.responseDeadline ?? row.responseDeadline;
  if (responseDeadline && responseDeadline.getTime() < Date.now()) return undefined;
  const postedDate = detail?.postedDate ?? UNKNOWN_DATE;
  const title = detail?.title || row.title;
  const agency = detail?.agency || row.agency || tenant.agency;
  const buyer = detail?.buyer || row.buyer;
  const alternateId = detail?.alternateId || row.alternateId;
  const description = [detail?.bulletin, detail?.contact ? `Contact: ${detail.contact}` : undefined, buyer ? `Buyer: ${buyer}` : undefined, alternateId ? `Alternate ID: ${alternateId}` : undefined, detail?.nigpCodes.length ? `NIGP codes: ${detail.nigpCodes.join(", ")}` : undefined].filter(Boolean).join("\n") || title;
  const matches = OCCUMED_TERMS.filter((term) => `${title} ${description}`.toLowerCase().includes(term));
  return {
    externalId: `bso-${tenant.id}-${row.docId}`,
    title,
    agency,
    subAgency: buyer,
    type: detail?.bidType || "Solicitation",
    status: "active",
    postedDate,
    responseDeadline,
    location: tenant.state,
    placeOfPerformance: tenant.state,
    description,
    solicitationNumber: row.docId,
    sourceUrl: row.sourceUrl,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerName: "publicPortalProviders",
      providerFamily: "public_portal",
      providerType: "dedicated_bso_adapter",
      connectorPlatform: "periscope_s2g_bso",
      portalId: tenant.id,
      portalName: tenant.name,
      portalState: tenant.state,
      sourceId: tenant.id,
      sourceRecordId: row.docId,
      issuingBuyer: agency,
      purchaser: buyer,
      alternateId,
      discoveryMethod: "direct_official_listing",
      sourceBadge: "Dedicated Public Parser",
      sourceConfidence: "high",
      listingPageUrl: row.listingPageUrl,
      listingPageNumber: row.page,
      paginationMode: row.page > 1 ? "jsf_form_post" : "public_open_bids_listing",
      officialDetailUrl: row.sourceUrl,
      documentUrls: detail?.attachments.map((attachment) => attachment.url) ?? [],
      attachments: detail?.attachments ?? [],
      detailFetched: Boolean(detail),
      dateUnknown: postedDate.getTime() === 0,
      collectedAt: new Date().toISOString(),
      occuMedMatched: matches.length > 0,
      occuMedMatchTerms: matches,
      tags: ["official-procurement-portal", "dedicated-adapter", "periscope-s2g-bso", `portal:${tenant.id}`, `state:${tenant.state}`, ...(detail ? ["detail-enriched"] : []), ...(postedDate.getTime() === 0 ? ["date-unknown"] : [])],
    },
  };
}
