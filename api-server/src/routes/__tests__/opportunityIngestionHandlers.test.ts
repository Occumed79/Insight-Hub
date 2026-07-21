import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createStartIngestionHandler } from "../opportunityIngestionHandlers";

function responseFixture() {
  const result = { statusCode: 200, body: null as any };
  const response = {
    status(code: number) {
      result.statusCode = code;
      return response;
    },
    json(body: any) {
      result.body = body;
      return response;
    },
  };
  return { result, response };
}

describe("POST /opportunities/fetch handler", () => {
  it("returns 202 and a persisted runId promptly", async () => {
    const { result, response } = responseFixture();
    const handler = createStartIngestionHandler(async () => ({
      id: "run-1",
      status: "queued",
    }));
    await handler(
      { body: { providers: ["samGov"] }, log: { error() {} } } as any,
      response as any,
    );
    assert.equal(result.statusCode, 202);
    assert.equal(result.body.runId, "run-1");
    assert.equal(result.body.status, "queued");
  });

  it("returns 409 for a second active run", async () => {
    const { result, response } = responseFixture();
    const activeError = Object.assign(new Error("A run is active"), {
      name: "ActiveIngestionRunError",
      runId: "active-run",
    });
    const handler = createStartIngestionHandler(async () => {
      throw activeError;
    });
    await handler({ body: {}, log: { error() {} } } as any, response as any);
    assert.equal(result.statusCode, 409);
    assert.equal(result.body.runId, "active-run");
  });
});
