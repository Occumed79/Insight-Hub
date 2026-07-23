import { registerSpider } from "./registry";
import { BrowserDiscoverySpider } from "./spiders/browserDiscoverySpider";
import { DocumentSpider } from "./spiders/documentSpider";
import { FeedSpider } from "./spiders/feedSpider";
import { JsonEndpointSpider } from "./spiders/jsonEndpointSpider";
import { PortalFamilySpider } from "./spiders/portalFamilySpider";
import { StaticListingSpider } from "./spiders/staticListingSpider";

export function initializeCrawlerSpiders(): void {
  registerSpider(new StaticListingSpider());
  registerSpider(new FeedSpider());
  registerSpider(new JsonEndpointSpider());
  registerSpider(new DocumentSpider());
  registerSpider(new BrowserDiscoverySpider());
  registerSpider(new PortalFamilySpider());
}

initializeCrawlerSpiders();

export * from "./types";
export * from "./registry";
export * from "./frontierStore";
export * from "./discoveryCandidateStore";
export * from "./orchestrator";
export * from "./sourceConfig";
export * from "./safety";
