import { Router } from "express";

const router = Router();

export const TRANSFERRED_INTELLIGENCE_PREFIXES = [
  "/competitors",
  "/prospects",
  "/prospect-locations",
  "/prospect-contacts",
  "/clients",
  "/client-contacts",
  "/federal-intel",
  "/state-agencies",
  "/intelligence-feed",
] as const;

export function isTransferredIntelligencePath(path: string): boolean {
  return TRANSFERRED_INTELLIGENCE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

router.use((req, res, next) => {
  if (!isTransferredIntelligencePath(req.path)) return next();

  res.setHeader("Cache-Control", "no-store");
  return res.status(410).json({
    error: "This intelligence workspace has moved to Insight Hub 2.",
    code: "INTELLIGENCE_WORKSPACE_TRANSFERRED",
    owner: "Insight-Hub2.0",
    path: req.path,
  });
});

export default router;
