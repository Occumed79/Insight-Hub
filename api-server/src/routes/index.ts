import { Router, type IRouter } from "express";
import apiHardeningRouter from "../middleware/api-hardening";
import healthRouter from "./health";
import databaseStatusRouter from "./database-status";
import hardeningDiagnosticsRouter from "./hardening-diagnostics";
import opportunitySafetyBoundaryRouter from "./opportunity-safety-boundary";
import opportunityFeedbackRouter from "./opportunity-feedback";
import settingsRouter from "./settings";
import competitorsRouter from "./competitors";
import prospectsRouter from "./prospects";
import prospectLocationsRouter from "./prospect-locations";
import prospectContactsRouter from "./prospect-contacts";
import clientsRouter from "./clients";
import clientContactsRouter from "./client-contacts";
import forecastPolicyBoundaryRouter from "./forecast-policy-boundary";
import federalIntelRouter from "./federal-intel";
import stateAgenciesRouter from "./state-agencies";
import intelligenceFeedRouter from "./intelligence-feed";
import searchRouter from "./search";
import govconForecastEnsembleRouter from "./govcon-forecast-ensemble";
import govconRouter from "./govcon";
import relevantNewsRouter from "./relevant-news";
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

router.use(apiHardeningRouter);

router.use(healthRouter);
router.use(databaseStatusRouter);
router.use(hardeningDiagnosticsRouter);

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
router.use(govconForecastEnsembleRouter);
router.use(govconRouter);
router.use(relevantNewsRouter);
router.use(competitorsRouter);
router.use(prospectsRouter);
router.use(prospectLocationsRouter);
router.use(prospectContactsRouter);
router.use(clientsRouter);
router.use(clientContactsRouter);
// Prevent the legacy forecast bucket from reappearing and route FAR/DFARS to
// Policy Radar before the generic federal-intel implementation can handle them.
router.use(forecastPolicyBoundaryRouter);
router.use(federalIntelRouter);
router.use(stateAgenciesRouter);
router.use(intelligenceFeedRouter);
router.use(searchRouter);

export default router;
