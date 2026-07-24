import { Router } from "express";
import { isManualOnlyPortalSourceId } from "../lib/providers/manualOnlyPortalPolicy";

interface PortalHealthStatusLike {
  sourceId?: string;
  currentlyFailing?: boolean;
  quarantined?: boolean;
  lastOutcome?: string;
}

interface PortalHealthBodyLike {
  health?: {
    summary?: Record<string, number>;
    sources?: PortalHealthStatusLike[];
  };
}

export function filterManualOnlyPortalHealth<T>(body: T): T {
  if (!body || typeof body !== "object") return body;
  const candidate = body as T & PortalHealthBodyLike;
  const sources = candidate.health?.sources;
  if (!Array.isArray(sources)) return body;

  const filtered = sources.filter(
    (status) =>
      typeof status.sourceId !== "string" ||
      !isManualOnlyPortalSourceId(status.sourceId),
  );
  const summary = filtered.reduce(
    (acc, status) => {
      acc.checked += 1;
      if (status.quarantined || status.lastOutcome === "quarantined") {
        acc.quarantined += 1;
      } else if (status.currentlyFailing) {
        acc.failing += 1;
      } else if (status.lastOutcome === "success") {
        acc.success += 1;
      } else if (status.lastOutcome === "no_results") {
        acc.noResults += 1;
      } else if (status.lastOutcome === "validation_failed") {
        acc.validationFailed += 1;
      }
      return acc;
    },
    {
      checked: 0,
      success: 0,
      noResults: 0,
      failing: 0,
      quarantined: 0,
      validationFailed: 0,
    },
  );

  return {
    ...candidate,
    health: {
      ...candidate.health,
      sources: filtered,
      summary,
    },
  };
}

const router = Router();

router.use("/rfp-sources", (_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) =>
    originalJson(filterManualOnlyPortalHealth(body))) as typeof res.json;
  next();
});

export default router;
