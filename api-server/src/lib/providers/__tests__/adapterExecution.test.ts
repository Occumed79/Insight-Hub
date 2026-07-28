import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataSourceProvider, ProviderStatus } from "../types";
import { runAdapterWithDeadline } from "../adapterExecution";

function provider(fetch: DataSourceProvider["fetch"]): DataSourceProvider {
  const status: ProviderStatus = {
    name: "publicPortalProviders",
    configured: true,
    healthy: true,
  };
  return {
    name: "publicPortalProviders",
    isConfigured: async () => true,
    fetch,
    getStatus: async () => status,
  };
}

describe("adapter execution guard", () => {
  it("returns successful adapter output unchanged", async () => {
    const result = await runAdapterWithDeadline(
      "working-source",
      provider(async () => ({ records: [], total: 0, errors: [] })),
      { limit: 10 },
      1_000,
    );

    assert.deepEqual(result, { records: [], total: 0, errors: [] });
  });

  it("moves on when an adapter ignores AbortSignal", async () => {
    const startedAt = Date.now();
    await assert.rejects(
      runAdapterWithDeadline(
        "hung-source",
        provider(async () => new Promise(() => undefined)),
        { limit: 10 },
        1_000,
      ),
      /hung-source timed out after 1000ms/,
    );
    assert.ok(Date.now() - startedAt < 2_000);
  });

  it("propagates parent cancellation into the adapter", async () => {
    const parent = new AbortController();
    const execution = runAdapterWithDeadline(
      "cancelled-source",
      provider(
        async ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener(
              "abort",
              () => reject(signal.reason),
              { once: true },
            );
          }),
      ),
      { limit: 10, signal: parent.signal },
      5_000,
    );

    parent.abort(new Error("manual cancellation"));
    await assert.rejects(execution, /manual cancellation/);
  });
});
