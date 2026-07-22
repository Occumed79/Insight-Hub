import type {
  PortalSpider,
  SpiderRunContext,
  SpiderRunResult,
} from "../types";

/**
 * Portal-family configurations are resolved to their registered delegate before
 * execution. This guard keeps the sixth spider kind explicit in diagnostics and
 * fails safely if a caller bypasses the orchestrator.
 */
export class PortalFamilySpider implements PortalSpider {
  readonly kind = "portal_family" as const;

  async run(_context: SpiderRunContext): Promise<SpiderRunResult> {
    throw new Error(
      "Portal-family spiders must be resolved to their delegate by the crawler orchestrator",
    );
  }
}
