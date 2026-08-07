import { Router, type IRouter } from "express";
import healthRouter from "./health";
import databaseStatusRouter from "./database-status";
import opportunitySafetyBoundaryRouter from "./opportunity-safety-boundary";
import opportunityFeedbackRouter from "./opportunity-feedback";
import settingsRouter from "./settings";
import searchRouter from "./search";
import govconRouter from "./govcon";
import relevantNewsRouter from "./relevant-news";
import transferredIntelligenceBoundaryRouter from "./transferred-intelligence-boundary";
import rfpSourcesRuntimeRouter from "./rfp-sources-runtime";
import rfpProviderBoundaryRouter from "../middleware/rfp-provider-boundary";
import manualOnlyPortalHealthBoundaryRouter from "../middleware/manual-only-portal-health-boundary";
import opportunityVectorSyncBoundary from "../middleware/opportunity-vector-sync-boundary";
import { lazyRouter } from "./lazy-router";

const router: IRouter = Router();

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

router.use(healthRouter);
router.use(databaseStatusRouter);

// The non-procurement intelligence workspaces were transferred to Insight Hub 2.
// Keep an explicit 410 boundary in front of the procurement API so old clients
// cannot silently keep writing to or reading from the retired Hub 1 handlers.
router.use(transferredIntelligenceBoundaryRouter);

// Keep the always-on read API small. RFP ingestion, provider inventories, and
// the portal catalogue pull in hundreds of adapter modules and are loaded only
// when a matching endpoint is actually requested.
router.use(
  lazyRouter(
    (req) => /^\/opportunities\/[^/]+\/summary\/?$/.test(req.path),
    () => import("./opportunity-summary-v2"),
  ),
);
router.use(rfpProviderBoundaryRouter);
router.use(
  lazyRouter(
    (req) => req.path.startsWith("/opportunities/ingestion-runs"),
    () => import("./ingestion-diagnostics"),
  ),
);
router.use(opportunitySafetyBoundaryRouter);
router.use(opportunityVectorSyncBoundary);
router.use(
  lazyRouter(
    (req) => req.path === "/opportunities" || req.path.startsWith("/opportunities/"),
    () => import("./opportunities"),
  ),
);
router.use(opportunityFeedbackRouter);
router.use(settingsRouter);
router.use(
  lazyRouter(
    (req) => req.path === "/providers" || req.path.startsWith("/providers/"),
    () => import("./providers"),
  ),
);
router.use(manualOnlyPortalHealthBoundaryRouter);
router.use(rfpSourcesRuntimeRouter);
router.use(
  lazyRouter(
    (req) => req.path.startsWith("/rfp-sources/crawler"),
    () => import("./crawler-admin"),
  ),
);
router.use(
  lazyRouter(
    (req) => req.path === "/rfp-sources" || req.path.startsWith("/rfp-sources/"),
    () => import("./rfp-sources"),
  ),
);
router.use(govconRouter);
router.use(relevantNewsRouter);
router.use(searchRouter);

export default router;
