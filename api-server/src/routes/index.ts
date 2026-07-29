import { Router, type IRouter } from "express";
import healthRouter from "./health";
import databaseStatusRouter from "./database-status";
import opportunitySafetyBoundaryRouter from "./opportunity-safety-boundary";
import opportunityFeedbackRouter from "./opportunity-feedback";
import settingsRouter from "./settings";
import competitorsRouter from "./competitors";
import prospectsRouter from "./prospects";
import prospectLocationsRouter from "./prospect-locations";
import prospectContactsRouter from "./prospect-contacts";
import clientsRouter from "./clients";
import clientContactsRouter from "./client-contacts";
import federalIntelRouter from "./federal-intel";
import stateAgenciesRouter from "./state-agencies";
import intelligenceFeedRouter from "./intelligence-feed";
import searchRouter from "./search";
import govconRouter from "./govcon";
import relevantNewsRouter from "./relevant-news";
import rfpProviderBoundaryRouter from "../middleware/rfp-provider-boundary";
import manualOnlyPortalHealthBoundaryRouter from "../middleware/manual-only-portal-health-boundary";
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
router.use(competitorsRouter);
router.use(prospectsRouter);
router.use(prospectLocationsRouter);
router.use(prospectContactsRouter);
router.use(clientsRouter);
router.use(clientContactsRouter);
router.use(federalIntelRouter);
router.use(stateAgenciesRouter);
router.use(intelligenceFeedRouter);
router.use(searchRouter);

export default router;
