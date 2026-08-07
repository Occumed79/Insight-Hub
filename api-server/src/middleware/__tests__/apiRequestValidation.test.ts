import assert from "node:assert/strict";
import test from "node:test";
import { validateMutationPayload } from "../api-request-validation";

test("manual fetch payload is bounded and strict", () => {
  const valid = validateMutationPayload({
    method: "POST",
    path: "/opportunities/fetch",
    body: {
      keywords: "occupational health services",
      dateRange: 30,
      providers: ["sam_gov", "tango", "aiDiscovery"],
    },
  } as any);
  assert.equal(valid.ok, true);

  const invalid = validateMutationPayload({
    method: "POST",
    path: "/opportunities/fetch",
    body: { dateRange: 100_000, surprise: true },
  } as any);
  assert.equal(invalid.ok, false);
});

test("trailing slashes cannot bypass mutation validation", () => {
  for (const path of [
    "/opportunities/fetch/",
    "/govcon/feedback/",
    "/govcon/recompete-verify/",
  ]) {
    const result = validateMutationPayload({
      method: "POST",
      path,
      body: { surprise: true },
    } as any);
    assert.equal(result.ok, false, `${path} must still be validated`);
  }
});

test("recompete verification requires bounded identity fields", () => {
  assert.equal(
    validateMutationPayload({
      method: "POST",
      path: "/govcon/recompete-verify",
      body: { id: "x", title: "Medical contract", agency: "Agency", naics: "621111" },
    } as any).ok,
    true,
  );
  assert.equal(
    validateMutationPayload({
      method: "POST",
      path: "/govcon/recompete-verify",
      body: { id: "x", title: "Medical contract", agency: "Agency", naics: "not-naics" },
    } as any).ok,
    false,
  );
});

test("GovCon feedback cannot submit incomplete not-relevant records", () => {
  assert.equal(
    validateMutationPayload({
      method: "POST",
      path: "/govcon/feedback",
      body: { mode: "forecast", action: "not_relevant", recordId: "abc" },
    } as any).ok,
    false,
  );
  assert.equal(
    validateMutationPayload({
      method: "POST",
      path: "/govcon/feedback",
      body: { mode: "forecast", action: "restore_all" },
    } as any).ok,
    true,
  );
});
