import { performance } from "node:perf_hooks";

const MAX_ROUTE_METRICS = 64;
const MAX_SAMPLES_PER_ROUTE = 64;

type RouteMetricState = {
  key: string;
  count: number;
  errorCount: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
  lastStatus: number;
  lastAt: number;
  samples: number[];
};

const routes = new Map<string, RouteMetricState>();

function boundedPath(pathname: string): string {
  const normalized = pathname
    .split("?")[0]
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      ":id",
    )
    .replace(/\/\d{4,}(?=\/|$)/g, "/:id")
    .replace(/\/[0-9a-f]{24,}(?=\/|$)/gi, "/:id")
    .replace(/\/+/g, "/");
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

export function routeMetricKey(method: string, pathname: string): string {
  return `${method.toUpperCase()} ${boundedPath(pathname)}`;
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index] ?? 0;
}

function evictIfNeeded(incomingKey: string): void {
  if (routes.has(incomingKey) || routes.size < MAX_ROUTE_METRICS) return;
  let oldestKey: string | null = null;
  let oldestAt = Number.POSITIVE_INFINITY;
  for (const [key, metric] of routes) {
    if (metric.lastAt < oldestAt) {
      oldestAt = metric.lastAt;
      oldestKey = key;
    }
  }
  if (oldestKey) routes.delete(oldestKey);
}

export function recordRequestMetric(input: {
  method: string;
  pathname: string;
  statusCode: number;
  durationMs: number;
}): void {
  const key = routeMetricKey(input.method, input.pathname);
  evictIfNeeded(key);
  const durationMs = Math.max(0, Math.round(input.durationMs * 100) / 100);
  const current = routes.get(key) ?? {
    key,
    count: 0,
    errorCount: 0,
    totalMs: 0,
    maxMs: 0,
    lastMs: 0,
    lastStatus: 0,
    lastAt: 0,
    samples: [],
  };

  current.count += 1;
  if (input.statusCode >= 500) current.errorCount += 1;
  current.totalMs += durationMs;
  current.maxMs = Math.max(current.maxMs, durationMs);
  current.lastMs = durationMs;
  current.lastStatus = input.statusCode;
  current.lastAt = Date.now();
  current.samples.push(durationMs);
  if (current.samples.length > MAX_SAMPLES_PER_ROUTE) current.samples.shift();
  routes.set(key, current);
}

export function runtimeTelemetrySnapshot() {
  const memory = process.memoryUsage();
  const elu = performance.eventLoopUtilization();

  return {
    generatedAt: new Date().toISOString(),
    process: {
      uptimeSeconds: Math.floor(process.uptime()),
      rssMb: Math.round((memory.rss / 1024 / 1024) * 10) / 10,
      heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 10) / 10,
      heapTotalMb: Math.round((memory.heapTotal / 1024 / 1024) * 10) / 10,
      externalMb: Math.round((memory.external / 1024 / 1024) * 10) / 10,
      eventLoopUtilization:
        Math.round(Math.max(0, Math.min(1, elu.utilization)) * 10_000) / 10_000,
    },
    routeMetricLimit: MAX_ROUTE_METRICS,
    sampleLimitPerRoute: MAX_SAMPLES_PER_ROUTE,
    routes: [...routes.values()]
      .sort((a, b) => b.lastAt - a.lastAt)
      .map((metric) => ({
        key: metric.key,
        count: metric.count,
        errorCount: metric.errorCount,
        errorRate:
          metric.count === 0
            ? 0
            : Math.round((metric.errorCount / metric.count) * 10_000) / 10_000,
        avgMs:
          metric.count === 0
            ? 0
            : Math.round((metric.totalMs / metric.count) * 100) / 100,
        p95Ms: percentile(metric.samples, 0.95),
        maxMs: metric.maxMs,
        lastMs: metric.lastMs,
        lastStatus: metric.lastStatus,
        lastAt: new Date(metric.lastAt).toISOString(),
      })),
  };
}

export function resetRuntimeTelemetryForTests(): void {
  routes.clear();
}
