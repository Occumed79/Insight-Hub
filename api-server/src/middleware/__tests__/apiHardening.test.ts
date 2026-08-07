import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import {
  adminReadAllowed,
  expensiveRoutePolicy,
  mutationOriginAllowed,
} from "../api-hardening";

function request(values: {
  method: string;
  path: string;
  host?: string;
  origin?: string;
  protocol?: string;
  token?: string;
}): Request {
  return {
    method: values.method,
    path: values.path,
    protocol: values.protocol ?? "https",
    get(name: string) {
      if (name.toLowerCase() === "host") return values.host;
      if (name.toLowerCase() === "origin") return values.origin;
      if (name.toLowerCase() === "x-insight-hub-write-token") return values.token;
      return undefined;
    },
  } as unknown as Request;
}

test("same-origin writes are accepted and cross-origin writes are rejected", () => {
  const old = process.env.INSIGHT_HUB_ALLOWED_ORIGINS;
  try {
    delete process.env.INSIGHT_HUB_ALLOWED_ORIGINS;
    assert.equal(
      mutationOriginAllowed(
        request({
          method: "POST",
          path: "/opportunities/fetch",
          host: "insight.example.com",
          origin: "https://insight.example.com",
        }),
      ),
      true,
    );
    assert.equal(
      mutationOriginAllowed(
        request({
          method: "POST",
          path: "/opportunities/fetch",
          host: "insight.example.com",
          origin: "https://evil.example.com",
        }),
      ),
      false,
    );
  } finally {
    if (old === undefined) delete process.env.INSIGHT_HUB_ALLOWED_ORIGINS;
    else process.env.INSIGHT_HUB_ALLOWED_ORIGINS = old;
  }
});

test("same host with the wrong URL scheme is rejected", () => {
  const old = process.env.INSIGHT_HUB_ALLOWED_ORIGINS;
  try {
    delete process.env.INSIGHT_HUB_ALLOWED_ORIGINS;
    assert.equal(
      mutationOriginAllowed(
        request({
          method: "POST",
          path: "/opportunities/fetch",
          host: "insight.example.com",
          protocol: "https",
          origin: "http://insight.example.com",
        }),
      ),
      false,
    );
  } finally {
    if (old === undefined) delete process.env.INSIGHT_HUB_ALLOWED_ORIGINS;
    else process.env.INSIGHT_HUB_ALLOWED_ORIGINS = old;
  }
});

test("explicit allowed origins can perform writes", () => {
  const old = process.env.INSIGHT_HUB_ALLOWED_ORIGINS;
  try {
    process.env.INSIGHT_HUB_ALLOWED_ORIGINS = "https://trusted.example.com/";
    assert.equal(
      mutationOriginAllowed(
        request({
          method: "PATCH",
          path: "/federal-intel/x/tag",
          host: "insight.example.com",
          origin: "https://trusted.example.com",
        }),
      ),
      true,
    );
  } finally {
    if (old === undefined) delete process.env.INSIGHT_HUB_ALLOWED_ORIGINS;
    else process.env.INSIGHT_HUB_ALLOWED_ORIGINS = old;
  }
});

test("administrative reads require the configured admin capability token", () => {
  const old = process.env.INSIGHT_HUB_ADMIN_TOKEN;
  try {
    process.env.INSIGHT_HUB_ADMIN_TOKEN = "admin-secret";
    assert.equal(
      adminReadAllowed(
        request({ method: "GET", path: "/hardening/diagnostics" }),
      ),
      false,
    );
    assert.equal(
      adminReadAllowed(
        request({
          method: "GET",
          path: "/hardening/diagnostics",
          token: "wrong-secret",
        }),
      ),
      false,
    );
    assert.equal(
      adminReadAllowed(
        request({
          method: "GET",
          path: "/hardening/diagnostics",
          token: "admin-secret",
        }),
      ),
      true,
    );
  } finally {
    if (old === undefined) delete process.env.INSIGHT_HUB_ADMIN_TOKEN;
    else process.env.INSIGHT_HUB_ADMIN_TOKEN = old;
  }
});

test("administrative reads remain available when no admin token is configured", () => {
  const old = process.env.INSIGHT_HUB_ADMIN_TOKEN;
  try {
    delete process.env.INSIGHT_HUB_ADMIN_TOKEN;
    assert.equal(
      adminReadAllowed(
        request({ method: "GET", path: "/hardening/diagnostics" }),
      ),
      true,
    );
  } finally {
    if (old === undefined) delete process.env.INSIGHT_HUB_ADMIN_TOKEN;
    else process.env.INSIGHT_HUB_ADMIN_TOKEN = old;
  }
});

test("expensive routes have bounded policies", () => {
  assert.deepEqual(
    expensiveRoutePolicy({ method: "POST", path: "/opportunities/fetch" } as Request),
    { bucket: "manual-fetch", limit: 2, windowMs: 60_000 },
  );
  assert.equal(
    expensiveRoutePolicy({ method: "GET", path: "/opportunities" } as Request),
    null,
  );
  assert.equal(
    expensiveRoutePolicy({ method: "POST", path: "/opportunities/abc/summary" } as Request)?.bucket,
    "opportunity-summary",
  );
  assert.equal(
    expensiveRoutePolicy({ method: "POST", path: "/govcon/recompete-verify" } as Request)?.bucket,
    "recompete-verify",
  );
});
