import {
  normalizerForPortalSource,
  PORTAL_SEARCH_RESULT_NORMALIZER_IDS,
} from "./searchResultNormalizers";

export {
  normalizerForPortalSource,
  PORTAL_SEARCH_RESULT_NORMALIZER_IDS,
};

/**
 * Backward-compatible alias. This returns a generic search-result normalizer,
 * not a direct portal parser or crawler.
 */
export const parserForPortalSource = normalizerForPortalSource;

export type {
  PortalCandidateOpportunity,
  PortalParseInput,
  PortalParser,
} from "./types";
