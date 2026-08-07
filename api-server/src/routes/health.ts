import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import {
  runtimeLiveness,
  runtimeReadiness,
} from "../lib/runtimeHealth";

const router: IRouter = Router();

function deploymentRevision(): string | null {
  return (
    process.env.RENDER_GIT_COMMIT?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    process.env.GIT_COMMIT_SHA?.trim() ||
    null
  );
}

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ...data,
    ...runtimeLiveness(),
    revision: deploymentRevision(),
  });
});

router.head("/healthz", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).end();
});

router.get("/readyz", async (req, res) => {
  const force = req.query.force === "true";
  const readiness = await runtimeReadiness(force);
  res.setHeader("Cache-Control", "no-store");
  res.status(readiness.ok ? 200 : 503).json({
    ...readiness,
    revision: deploymentRevision(),
  });
});

router.head("/readyz", async (_req, res) => {
  const readiness = await runtimeReadiness();
  res.setHeader("Cache-Control", "no-store");
  res.status(readiness.ok ? 200 : 503).end();
});

export default router;
