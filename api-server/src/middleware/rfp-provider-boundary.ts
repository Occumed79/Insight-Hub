import { Router } from "express";

const router = Router();

const ALLOWED_RFP_PROVIDER_REQUESTS = new Set([
  "samGov",
  "sam_gov",
  "publicPortalProviders",
  "public_portal_providers",
  "publicPortals",
  "public_portals",
  "statePortals",
  "eunaBonfire",
  "euna_bonfire",
  "eunaSupplierNetwork",
  "internationalPublicPortals",
  "international_public_portals",
  "internationalOpportunities",
  "tango",
  "bidnet",
  "serper",
  "tavily",
  "exa",
]);

/**
 * Keep the manual RFP fetch endpoint limited to actual opportunity sources and
 * explicitly supported discovery engines. AI processors, vector stores,
 * intelligence-only feeds, and infrastructure utilities do not belong here.
 */
router.post("/opportunities/fetch", (req, res, next) => {
  const providers = req.body?.providers;
  if (providers == null) return next();

  if (!Array.isArray(providers) || providers.some((provider) => typeof provider !== "string")) {
    return res.status(400).json({
      error: "providers must be an array of supported RFP provider names",
    });
  }

  const unsupported = Array.from(
    new Set(providers.filter((provider) => !ALLOWED_RFP_PROVIDER_REQUESTS.has(provider))),
  );

  if (unsupported.length > 0) {
    return res.status(400).json({
      error: "One or more providers are not valid RFP opportunity sources.",
      unsupportedProviders: unsupported,
      allowedProviders: Array.from(ALLOWED_RFP_PROVIDER_REQUESTS),
    });
  }

  return next();
});

export default router;
