import type { NextFunction, Request, Response } from "express";

export function opportunityVectorSyncBoundary(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.method !== "POST" || req.path !== "/opportunities/fetch") {
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
      const runId = typeof payload.runId === "string" ? payload.runId : null;
      if (runId) {
        queueMicrotask(() => {
          void import("../lib/search/opportunityVectorSync")
            .then(({ scheduleOpportunityVectorSync }) => scheduleOpportunityVectorSync(runId))
            .catch((error) => {
              req.log?.warn?.(error, "Unable to schedule opportunity vector indexing");
            });
        });
      }
    }
    return originalJson(body);
  }) as Response["json"];

  next();
}

export default opportunityVectorSyncBoundary;
