import { Router, type IRouter } from "express";
import { getRelevanceProfile } from "../lib/search/relevanceProfile";
import { profileDefaultQueries } from "../lib/search/profileText";

/**
 * Read-only view of the Occu-Med relevance profile for the UI. The UI never carries its own service
 * vocabulary: anything it needs to label, match or suggest comes from here (and so from the Neon profile).
 */
const router: IRouter = Router();

/** Service categories (non-adjacent) with the terms that evidence each, plus every service term. */
router.get("/relevance-profile/service-terms", (_req, res) => {
  const profile = getRelevanceProfile();
  res.json({
    source: profile.source,
    version: profile.version,
    categories: profile.categories
      .filter((c) => !c.adjacentOnly)
      .map((c) => ({
        id: c.id,
        label: c.label,
        terms: Array.from(new Set([...c.explicit, ...c.component, ...c.regulatory])),
      })),
    serviceTerms: profile.allServiceTerms,
  });
});

/** The two canonical thresholds (Neon facts relevance.accept_min / relevance.review_min). */
router.get("/relevance-profile/thresholds", (_req, res) => {
  const profile = getRelevanceProfile();
  res.json(profile.source === "unavailable"
    ? { source: profile.source, version: profile.version, acceptMin: null, reviewMin: null }
    : { source: profile.source, version: profile.version, ...profile.thresholds });
});

/** Suggested discovery queries, one per profile search bundle. */
router.get("/relevance-profile/search-presets", (_req, res) => {
  const profile = getRelevanceProfile();
  const queries = profileDefaultQueries(new Date().getFullYear(), profile);
  const bundles = profile.searchBundles.filter((b) => b.serviceTerms.length > 0);
  res.json({
    source: profile.source,
    version: profile.version,
    presets: bundles.map((b, i) => ({ key: b.key, label: b.label, query: queries[i] })),
  });
});

export default router;
