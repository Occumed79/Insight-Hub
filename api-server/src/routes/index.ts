import { Router, type IRouter } from "express";
import healthRouter from "./health";
import opportunitiesRouter from "./opportunities";
import settingsRouter from "./settings";
import providersRouter from "./providers";
import competitorsRouter from "./competitors";
import prospectsRouter from "./prospects";
import prospectLocationsRouter from "./prospect-locations";
import prospectContactsRouter from "./prospect-contacts";
import clientsRouter from "./clients";
import clientContactsRouter from "./client-contacts";
import federalIntelRouter from "./federal-intel";
import stateAgenciesRouter from "./state-agencies";

const router: IRouter = Router();

router.use(healthRouter);
router.use(opportunitiesRouter);
router.use(settingsRouter);
router.use(providersRouter);
router.use(competitorsRouter);
router.use(prospectsRouter);
router.use(prospectLocationsRouter);
router.use(prospectContactsRouter);
router.use(clientsRouter);
router.use(clientContactsRouter);
router.use(federalIntelRouter);
router.use(stateAgenciesRouter);

export default router;
