import { Router } from "express";

const router = Router();

const ALLOWED_RFP_PROVIDER_REQUESTS = new Set([
  "samGov",
  "sam_gov",
  "aiDiscovery",
  "ai_discovery",
  "webIntelligence",
  // Legacy selections are still accepted at the request boundary and are
  // collapsed into aiDiscovery by providerRunner. They no longer execute the
  // retired scraper providers.
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
]);

/**
 * Keep the manual RFP fetch endpoint limited to the restored AI discovery path
 * and the official SAM.gov API. Legacy scraper names are accepted only so old
 * browser requests and persisted retries can be redirected into aiDiscovery.
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
