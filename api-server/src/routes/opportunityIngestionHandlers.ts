import type { Request, Response } from "express";

type StartResult = { id: string; status: string };
type StartFunction = (request: {
  keywords?: string;
  dateRange?: number;
  providers?: string[];
}) => Promise<StartResult>;

export function createStartIngestionHandler(start: StartFunction) {
  return async (req: Request, res: Response) => {
    try {
      const { keywords, dateRange, providers } = req.body as {
        keywords?: string;
        dateRange?: number;
        providers?: string[];
      };
      const run = await start({ keywords, dateRange, providers });
      return res.status(202).json({ runId: run.id, status: run.status, run });
    } catch (error: any) {
      req.log?.error(error);
      if (
        error?.name === "ActiveIngestionRunError" ||
        error?.constructor?.name === "ActiveIngestionRunError"
      ) {
        return res
          .status(409)
          .json({ error: error.message, runId: error.runId });
      }
      const message = error?.message ?? String(error);
      if (message.startsWith("Unsupported RFP provider"))
        return res.status(400).json({ error: message });
      return res
        .status(500)
        .json({
          error: `Unable to start ingestion: ${message.slice(0, 300) || "Unknown error"}`,
        });
    }
  };
}
