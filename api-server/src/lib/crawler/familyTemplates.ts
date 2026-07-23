import { getSpiderConfig, registerSpiderConfig } from "./registry";
import type { SpiderConfig } from "./types";

export const STATIC_LISTING_FAMILY_TEMPLATE_ID =
  "portal-family-template:static-listing";
export const DOCUMENT_INDEX_FAMILY_TEMPLATE_ID =
  "portal-family-template:document-index";
export const FEED_FAMILY_TEMPLATE_ID = "portal-family-template:feed";

const FAMILY_TEMPLATES: SpiderConfig[] = [
  {
    id: STATIC_LISTING_FAMILY_TEMPLATE_ID,
    sourceId: "__template__:static-listing",
    kind: "static_listing",
    enabled: false,
    startUrls: ["https://template.invalid/bids"],
    allowedHosts: ["template.invalid"],
    scheduleMinutes: 60,
    limits: { maxPages: 5, maxUrls: 100, elapsedMs: 30_000 },
    notes:
      "Reusable bounded same-domain listing and pagination spider template.",
  },
  {
    id: DOCUMENT_INDEX_FAMILY_TEMPLATE_ID,
    sourceId: "__template__:document-index",
    kind: "document",
    enabled: false,
    startUrls: ["https://template.invalid/documents"],
    allowedHosts: ["template.invalid"],
    scheduleMinutes: 120,
    limits: { maxPages: 5, maxUrls: 100, elapsedMs: 30_000 },
    notes:
      "Reusable official document-index and solicitation attachment spider template.",
  },
  {
    id: FEED_FAMILY_TEMPLATE_ID,
    sourceId: "__template__:feed",
    kind: "feed",
    enabled: false,
    startUrls: ["https://template.invalid/feed.xml"],
    allowedHosts: ["template.invalid"],
    scheduleMinutes: 60,
    limits: { maxPages: 5, maxUrls: 100, elapsedMs: 30_000 },
    notes: "Reusable RSS and Atom procurement notice spider template.",
  },
];

export function registerPortalFamilyTemplates(): void {
  for (const template of FAMILY_TEMPLATES) {
    if (!getSpiderConfig(template.id)) registerSpiderConfig(template);
  }
}
