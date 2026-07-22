import { registerSpider } from "./registry";
import { BrowserDiscoverySpider } from "./spiders/browserDiscoverySpider";
import { DocumentSpider } from "./spiders/documentSpider";
import { FeedSpider } from "./spiders/feedSpider";
import { JsonEndpointSpider } from "./spiders/jsonEndpointSpider";
import { PortalFamilySpider } from "./spiders/portalFamilySpider";
import { StaticListingSpider } from "./spiders/staticListingSpider";

let initialized = false;

export function initializeCrawlerSpiders(): void {
  if (initialized) return;
  registerSpider(new StaticListingSpider());
  registerSpider(new FeedSpider());
  registerSpider(new JsonEndpointSpider());
  registerSpider(new DocumentSpider());
  registerSpider(new BrowserDiscoverySpider());
  registerSpider(new PortalFamilySpider());
  initialized = true;
}

initializeCrawlerSpiders();

export * from "./types";
export * from "./registry";
export * from "./frontierStore";
export * from "./discoveryCandidateStore";
export * from "./orchestrator";
export * from "./sourceConfig";
export * from "./safety";
