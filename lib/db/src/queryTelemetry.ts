import { performance } from "node:perf_hooks";

type LogicalDatabase = "rfp" | "intel";

type QueryMetric = {
  key: string;
  logicalDatabase: LogicalDatabase;
  operation: string;
  relation: string;
  count: number;
  errorCount: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
  lastAt: number;
  samples: number[];
};

const MAX_QUERY_METRICS = 64;
const MAX_SAMPLES_PER_QUERY = 64;
const metrics = new Map<string, QueryMetric>();

function boundedIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function compactSql(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n\r]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeRelation(value: string | undefined): string {
  if (!value) return "unknown";
  const cleaned = value
    .replace(/["'`;(),]/g, "")
    .replace(/[^A-Za-z0-9_.-]/g, "")
    .slice(0, 80);
  return cleaned || "unknown";
}

export function describeSqlQuery(query: unknown): {
  operation: string;
  relation: string;
} {
  let text = "";
  if (typeof query === "string") text = query;
  else if (query && typeof query === "object" && "text" in query) {
    const candidate = (query as { text?: unknown }).text;
    if (typeof candidate === "string") text = candidate;
  }

  const compact = compactSql(text);
  const operation = compact.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() ?? "UNKNOWN";
  const relationPattern =
    operation === "INSERT"
      ? /\bINTO\s+([^\s]+)/i
      : operation === "UPDATE"
        ? /^UPDATE\s+([^\s]+)/i
        : operation === "DELETE"
          ? /\bFROM\s+([^\s]+)/i
          : operation === "CREATE"
            ? /\b(?:TABLE|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s]+)/i
            : /\bFROM\s+([^\s]+)/i;
  return { operation, relation: safeRelation(compact.match(relationPattern)?.[1]) };
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
  if (metrics.has(incomingKey) || metrics.size < MAX_QUERY_METRICS) return;
  let oldestKey: string | null = null;
  let oldestAt = Number.POSITIVE_INFINITY;
  for (const [key, metric] of metrics) {
    if (metric.lastAt < oldestAt) {
      oldestAt = metric.lastAt;
      oldestKey = key;
    }
  }
  if (oldestKey) metrics.delete(oldestKey);
}

function recordQueryMetric(input: {
  logicalDatabase: LogicalDatabase;
  query: unknown;
  durationMs: number;
  failed: boolean;
}): void {
  const descriptor = describeSqlQuery(input.query);
  const key = `${input.logicalDatabase}:${descriptor.operation}:${descriptor.relation}`;
  evictIfNeeded(key);
  const durationMs = Math.max(0, Math.round(input.durationMs * 100) / 100);
  const current = metrics.get(key) ?? {
    key,
    logicalDatabase: input.logicalDatabase,
    operation: descriptor.operation,
    relation: descriptor.relation,
    count: 0,
    errorCount: 0,
    totalMs: 0,
    maxMs: 0,
    lastMs: 0,
    lastAt: 0,
    samples: [],
  };
  current.count += 1;
  if (input.failed) current.errorCount += 1;
  current.totalMs += durationMs;
  current.maxMs = Math.max(current.maxMs, durationMs);
  current.lastMs = durationMs;
  current.lastAt = Date.now();
  current.samples.push(durationMs);
  if (current.samples.length > MAX_SAMPLES_PER_QUERY) current.samples.shift();
  metrics.set(key, current);

  const slowThresholdMs = boundedIntegerEnv(
    "DATABASE_SLOW_QUERY_MS",
    750,
    100,
    30_000,
  );
  if (input.failed || durationMs >= slowThresholdMs) {
    const payload = {
      event: input.failed ? "database_query_failed" : "database_query_slow",
      logicalDatabase: input.logicalDatabase,
      operation: descriptor.operation,
      relation: descriptor.relation,
      durationMs,
      thresholdMs: slowThresholdMs,
    };
    if (input.failed) console.error(JSON.stringify(payload));
    else console.warn(JSON.stringify(payload));
  }
}

export function instrumentPoolQueries<T extends { query: (...args: any[]) => any }>(
  pool: T,
  logicalDatabase: LogicalDatabase,
): T {
  const originalQuery = pool.query.bind(pool) as (...args: any[]) => any;
  const wrapped = (...args: any[]) => {
    const query = args[0];
    const started = performance.now();
    const lastIndex = args.length - 1;
    const callback = typeof args[lastIndex] === "function" ? args[lastIndex] : null;

    if (callback) {
      args[lastIndex] = (error: unknown, result: unknown) => {
        recordQueryMetric({
          logicalDatabase,
          query,
          durationMs: performance.now() - started,
          failed: Boolean(error),
        });
        callback(error, result);
      };
      try {
        return originalQuery(...args);
      } catch (error) {
        recordQueryMetric({
          logicalDatabase,
          query,
          durationMs: performance.now() - started,
          failed: true,
        });
        throw error;
      }
    }

    try {
      const result = originalQuery(...args);
      if (result && typeof result.then === "function") {
        return result.then(
          (value: unknown) => {
            recordQueryMetric({
              logicalDatabase,
              query,
              durationMs: performance.now() - started,
              failed: false,
            });
            return value;
          },
          (error: unknown) => {
            recordQueryMetric({
              logicalDatabase,
              query,
              durationMs: performance.now() - started,
              failed: true,
            });
            throw error;
          },
        );
      }
      return result;
    } catch (error) {
      recordQueryMetric({
        logicalDatabase,
        query,
        durationMs: performance.now() - started,
        failed: true,
      });
      throw error;
    }
  };

  (pool as { query: (...args: any[]) => any }).query = wrapped;
  return pool;
}

export function databaseQueryTelemetrySnapshot() {
  return {
    generatedAt: new Date().toISOString(),
    metricLimit: MAX_QUERY_METRICS,
    sampleLimitPerMetric: MAX_SAMPLES_PER_QUERY,
    slowQueryThresholdMs: boundedIntegerEnv(
      "DATABASE_SLOW_QUERY_MS",
      750,
      100,
      30_000,
    ),
    queries: [...metrics.values()]
      .sort((a, b) => b.lastAt - a.lastAt)
      .map((metric) => ({
        key: metric.key,
        logicalDatabase: metric.logicalDatabase,
        operation: metric.operation,
        relation: metric.relation,
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
        lastAt: new Date(metric.lastAt).toISOString(),
      })),
  };
}

export function resetDatabaseQueryTelemetryForTests(): void {
  metrics.clear();
}
