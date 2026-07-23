import { Router } from "express";
import {
  DiscoveryCandidateNotFoundError,
  listDiscoveryCandidates,
  registerSpiderConfig,
  reviewDiscoveryCandidate,
  type ReviewDiscoveryCandidateInput,
} from "../lib/crawler";
import {
  crawlerSchedulerIntervalMs,
  isCrawlerSchedulerEnabled,
  runCrawlerSchedulerTick,
} from "../lib/crawler/scheduler";
import { listDueCrawlerSourceIds } from "../lib/providers/crawlerAugmentedPublicPortalProvider";

const router = Router();

router.get("/rfp-sources/crawler/discovery-candidates", async (_req, res) => {
  try {
    return res.json({ candidates: await listDiscoveryCandidates() });
  } catch (error) {
    return res.status(500).json({
      error: "Crawler discovery candidates could not be loaded",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post("/rfp-sources/crawler/discovery-candidates/review", async (req, res) => {
  const body = (req.body ?? {}) as Partial<ReviewDiscoveryCandidateInput>;
  if (
    typeof body.sourceId !== "string" ||
    typeof body.endpointUrl !== "string" ||
    !["approved", "rejected"].includes(String(body.decision))
  ) {
    return res.status(400).json({
      error:
        "sourceId, endpointUrl, and decision (approved or rejected) are required",
    });
  }

  try {
    const candidate = await reviewDiscoveryCandidate({
      sourceId: body.sourceId,
      endpointUrl: body.endpointUrl,
      decision: body.decision as "approved" | "rejected",
      note: typeof body.note === "string" ? body.note : undefined,
      config:
        body.config && typeof body.config === "object"
          ? body.config
          : undefined,
    });
    if (candidate.approvedConfig) registerSpiderConfig(candidate.approvedConfig);
    return res.json({ candidate });
  } catch (error) {
    if (error instanceof DiscoveryCandidateNotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(400).json({
      error: "Crawler discovery candidate review failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get("/rfp-sources/crawler/scheduler", async (_req, res) => {
  try {
    const dueSourceIds = await listDueCrawlerSourceIds();
    return res.json({
      enabled: isCrawlerSchedulerEnabled(),
      intervalMs: crawlerSchedulerIntervalMs(),
      dueSourceIds,
      dueCount: dueSourceIds.length,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Crawler scheduler status could not be loaded",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post("/rfp-sources/crawler/scheduler/run-due", async (_req, res) => {
  try {
    const result = await runCrawlerSchedulerTick();
    return res.status(result.started ? 202 : 200).json(result);
  } catch (error) {
    return res.status(500).json({
      error: "Crawler scheduler tick failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
