import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";
import { recordRequestMetric } from "../lib/runtimeTelemetry";

const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,64}$/;
const SLOW_REQUEST_MS = 2_000;

function requestIdFrom(req: Request): string {
  const incoming = req.get("x-request-id")?.trim();
  if (incoming && REQUEST_ID_RE.test(incoming)) return incoming;
  return randomUUID();
}

export function requestObservability(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const started = process.hrtime.bigint();
  const requestId = requestIdFrom(req);
  res.setHeader("X-Request-Id", requestId);

  res.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    recordRequestMetric({
      method: req.method,
      pathname: req.path,
      statusCode: res.statusCode,
      durationMs,
    });

    if (durationMs >= SLOW_REQUEST_MS || res.statusCode >= 500) {
      const fields = {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      };
      if (res.statusCode >= 500) {
        logger.error(fields, "API request completed with server error");
      } else {
        logger.warn(fields, "Slow API request completed");
      }
    }
  });

  next();
}

export default requestObservability;
