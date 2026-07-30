import { Router } from "express";
import {
  MANUAL_RFP_PROVIDERS,
  PROVIDER_ALIASES,
} from "../lib/ingestion/providerRunner";

const router = Router();

/**
 * Keep the HTTP request boundary synchronized with the provider runner. The
 * boundary accepts canonical provider names plus every legacy/UI alias that the
 * runner knows how to normalize. This prevents a newly supported provider such
 * as Tango or GovCon from being rejected before ingestion starts.
 */
export const ALLOWED_RFP_PROVIDER_REQUESTS = new Set<string>([
  ...MANUAL_RFP_PROVIDERS,
  ...PROVIDER_ALIASES.keys(),
]);

export function unsupportedRfpProviders(providers: string[]): string[] {
  return Array.from(
    new Set(
      providers.filter(
        (provider) => !ALLOWED_RFP_PROVIDER_REQUESTS.has(provider),
      ),
    ),
  );
}

router.post("/opportunities/fetch", (req, res, next) => {
  const providers = req.body?.providers;
  if (providers == null) return next();

  if (
    !Array.isArray(providers) ||
    providers.some((provider) => typeof provider !== "string")
  ) {
    return res.status(400).json({
      error: "providers must be an array of supported RFP provider names",
    });
  }

  const unsupported = unsupportedRfpProviders(providers);

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
