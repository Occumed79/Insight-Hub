import assert from "node:assert/strict";
import test from "node:test";
import {
  recordRequestMetric,
  resetRuntimeTelemetryForTests,
  routeMetricKey,
  runtimeTelemetrySnapshot,
} from "../runtimeTelemetry";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/rfp_core";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/intel";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/auth";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/app";

test("route telemetry normalizes unbounded resource identifiers", () => {
  assert.equal(
    routeMetricKey(
      "get",
      "/api/opportunities/11111111-1111-4111-8111-111111111111/feedback",
    ),
    "GET /api/opportunities/:id/feedback",
  );
  assert.equal(
    routeMetricKey("get", "/api/items/123456789/details"),
    "GET /api/items/:id/details",
  );
});

test("runtime telemetry keeps route and sample cardinality bounded", () => {
  resetRuntimeTelemetryForTests();
  for (let index = 0; index < 90; index += 1) {
    recordRequestMetric({
      method: "GET",
      pathname: `/api/test-route-${index}`,
      statusCode: index % 10 === 0 ? 500 : 200,
      durationMs: index + 1,
    });
  }

  const snapshot = runtimeTelemetrySnapshot();
  assert.ok(snapshot.routes.length <= snapshot.routeMetricLimit);
  assert.equal(snapshot.routeMetricLimit, 64);
  assert.equal(snapshot.sampleLimitPerRoute, 64);
  assert.ok(snapshot.process.rssMb > 0);
  assert.ok(snapshot.process.eventLoopUtilization >= 0);
  assert.ok(snapshot.process.eventLoopUtilization <= 1);
});

test("runtime telemetry exposes latency and server-error measurements", () => {
  resetRuntimeTelemetryForTests();
  for (const durationMs of [20, 40, 60, 80, 100]) {
    recordRequestMetric({
      method: "GET",
      pathname: "/api/opportunities",
      statusCode: durationMs === 100 ? 503 : 200,
      durationMs,
    });
  }
  const metric = runtimeTelemetrySnapshot().routes.find(
    (route) => route.key === "GET /api/opportunities",
  );
  assert.ok(metric);
  assert.equal(metric?.count, 5);
  assert.equal(metric?.errorCount, 1);
  assert.equal(metric?.avgMs, 60);
  assert.equal(metric?.p95Ms, 100);
  assert.equal(metric?.maxMs, 100);
});
