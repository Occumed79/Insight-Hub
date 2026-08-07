import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { Server } from "node:http";
import requestObservability from "../../middleware/request-observability";
import {
  resetRuntimeTelemetryForTests,
  runtimeTelemetrySnapshot,
} from "../runtimeTelemetry";

test("request observability remains bounded under concurrent API load", async () => {
  resetRuntimeTelemetryForTests();
  const app = express();
  app.use(requestObservability);
  app.get("/api/ping", (_req, res) => res.json({ ok: true }));

  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const total = 200;
    const concurrency = 25;
    const latencies: number[] = [];
    const requestIds = new Set<string>();

    for (let offset = 0; offset < total; offset += concurrency) {
      const batch = Array.from(
        { length: Math.min(concurrency, total - offset) },
        async () => {
          const started = performance.now();
          const response = await fetch(`${baseUrl}/api/ping`);
          latencies.push(performance.now() - started);
          assert.equal(response.status, 200);
          const requestId = response.headers.get("x-request-id");
          assert.ok(requestId);
          requestIds.add(requestId);
          await response.arrayBuffer();
        },
      );
      await Promise.all(batch);
    }

    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1] ?? 0;
    assert.equal(
      requestIds.size,
      total,
      "each independent request should receive a distinct ID",
    );
    assert.ok(
      p95 < 1_000,
      `synthetic API p95 ${p95.toFixed(1)}ms exceeds 1000ms`,
    );

    const metric = runtimeTelemetrySnapshot().routes.find(
      (route) => route.key === "GET /api/ping",
    );
    assert.ok(metric);
    assert.equal(metric.count, total);
    assert.equal(metric.errorCount, 0);
    assert.ok(metric.p95Ms < 1_000);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});
