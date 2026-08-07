import { timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";

const router = Router();

interface RatePolicy {
  bucket: string;
  limit: number;
  windowMs: number;
}

interface RateWindow {
  startedAt: number;
  count: number;
}

const windows = new Map<string, RateWindow>();

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_RATE_WINDOWS = 5_000;
const RATE_WINDOW_RETENTION_MS = 15 * 60_000;

function configuredOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const raw of (process.env.INSIGHT_HUB_ALLOWED_ORIGINS ?? "").split(",")) {
    const value = raw.trim();
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Invalid allowlist entries are ignored rather than broadening access.
    }
  }
  return origins;
}

export function mutationOriginAllowed(req: Request): boolean {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) return true;
  const origin = req.get("origin");
  if (!origin) return true;

  try {
    const parsed = new URL(origin);
    const host = req.get("host");
    if (host) {
      const requestOrigin = `${req.protocol}://${host}`;
      if (parsed.origin === requestOrigin) return true;
    }
    return configuredOrigins().has(parsed.origin);
  } catch {
    return false;
  }
}

function writeTokenAllowed(req: Request): boolean {
  const required = process.env.INSIGHT_HUB_WRITE_TOKEN?.trim();
  if (!required || !MUTATING_METHODS.has(req.method.toUpperCase())) return true;
  const supplied = req.get("x-insight-hub-write-token") ?? "";
  const requiredBuffer = Buffer.from(required);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    requiredBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(requiredBuffer, suppliedBuffer)
  );
}

export function expensiveRoutePolicy(req: Pick<Request, "method" | "path">): RatePolicy | null {
  const method = req.method.toUpperCase();
  const path = req.path;
  if (method !== "POST" && method !== "PATCH" && method !== "DELETE") return null;

  if (method === "POST" && path === "/opportunities/fetch") {
    return { bucket: "manual-fetch", limit: 2, windowMs: 60_000 };
  }
  if (method === "POST" && path === "/opportunities/enrich") {
    return { bucket: "opportunity-enrich", limit: 2, windowMs: 5 * 60_000 };
  }
  if (method === "POST" && /^\/opportunities\/[^/]+\/summary\/?$/.test(path)) {
    return { bucket: "opportunity-summary", limit: 30, windowMs: 60_000 };
  }
  if (method === "POST" && path === "/govcon/recompete-verify") {
    return { bucket: "recompete-verify", limit: 20, windowMs: 60_000 };
  }
  if (method === "POST" && /\/federal-intel\/[^/]+\/refresh\/?$/.test(path)) {
    return { bucket: "federal-intel-refresh", limit: 10, windowMs: 60_000 };
  }
  if (method === "POST" && path === "/opportunities/feedback/rescore") {
    return { bucket: "feedback-rescore", limit: 1, windowMs: 10 * 60_000 };
  }
  if (method === "POST" && /^\/opportunities\/[^/]+\/feedback\/?$/.test(path)) {
    return { bucket: "opportunity-feedback", limit: 120, windowMs: 60_000 };
  }
  return null;
}

function pruneWindows(now: number): void {
  if (windows.size >= 500) {
    for (const [key, value] of windows) {
      if (now - value.startedAt > RATE_WINDOW_RETENTION_MS) windows.delete(key);
    }
  }

  // A burst of unique client addresses must not turn the in-memory limiter into
  // its own memory-exhaustion vector on the small production instance.
  while (windows.size >= MAX_RATE_WINDOWS) {
    const oldestKey = windows.keys().next().value as string | undefined;
    if (!oldestKey) break;
    windows.delete(oldestKey);
  }
}

router.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  if (!mutationOriginAllowed(req)) {
    return res.status(403).json({ error: "Cross-origin write request rejected." });
  }
  if (!writeTokenAllowed(req)) {
    return res.status(401).json({ error: "Write authorization token is required." });
  }

  const policy = expensiveRoutePolicy(req);
  if (!policy) return next();

  const now = Date.now();
  pruneWindows(now);
  const client = req.ip || req.socket.remoteAddress || "unknown";
  const key = `${client}:${policy.bucket}`;
  const existing = windows.get(key);
  const current =
    !existing || now - existing.startedAt >= policy.windowMs
      ? { startedAt: now, count: 0 }
      : existing;

  if (current.count >= policy.limit) {
    const retryAfterMs = Math.max(1, policy.windowMs - (now - current.startedAt));
    res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    return res.status(429).json({
      error: "Request rate limit reached for this expensive operation.",
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    });
  }

  current.count += 1;
  windows.set(key, current);
  return next();
});

export function clearApiHardeningRateWindows(): void {
  windows.clear();
}

export default router;
