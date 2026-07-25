import { hasCloudflareBrowserEnvironment } from "../providers/cloudflareBrowserRun";
import { registerPortalFamilyTemplates } from "./familyTemplates";
import { registerSpider } from "./registry";
import { BrowserDiscoverySpider } from "./spiders/browserDiscoverySpider";
import { DocumentSpider } from "./spiders/documentSpider";
import { FeedSpider } from "./spiders/feedSpider";
import { JsonEndpointSpider } from "./spiders/jsonEndpointSpider";
import { PortalFamilySpider } from "./spiders/portalFamilySpider";
import { StaticListingSpider } from "./spiders/staticListingSpider";

export function initializeCrawlerSpiders(): void {
  // Explicit false remains an operator kill switch. Otherwise, configured
  // Cloudflare Browser Run credentials make the existing browser-discovery
  // sources runnable without requiring a second enablement variable.
  if (
    process.env.PUBLIC_PORTAL_BROWSER_DISCOVERY_ENABLED === undefined &&
    hasCloudflareBrowserEnvironment()
  ) {
    process.env.PUBLIC_PORTAL_BROWSER_DISCOVERY_ENABLED = "true";
  }

  registerSpider(new StaticListingSpider());
  registerSpider(new FeedSpider());
  registerSpider(new JsonEndpointSpider());
  registerSpider(new DocumentSpider());
  registerSpider(new BrowserDiscoverySpider());
  registerSpider(new PortalFamilySpider());
  registerPortalFamilyTemplates();
}

initializeCrawlerSpiders();

export * from "./types";
export * from "./registry";
export * from "./familyTemplates";
export * from "./frontierStore";
export * from "./discoveryCandidateStore";
export * from "./orchestrator";
export * from "./sourceConfig";
export * from "./safety";
