import assert from "node:assert/strict";

const rawBaseUrl = process.env.INSIGHT_PRODUCTION_URL?.trim();
if (!rawBaseUrl) {
  throw new Error("INSIGHT_PRODUCTION_URL is required");
}

const baseUrl = rawBaseUrl.replace(/\/$/, "");
const expectedCommit = process.env.EXPECTED_COMMIT_SHA?.trim() || null;
const timeoutMs = Number(process.env.ACCEPTANCE_TIMEOUT_MS ?? 12_000);

function endpoint(path) {
  return `${baseUrl}${path}`;
}

async function fetchBounded(path, init = {}) {
  const response = await fetch(endpoint(path), {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: "application/json, text/html;q=0.9, */*;q=0.8",
      "User-Agent": "Insight-Hub-Production-Acceptance/1.0",
      ...(init.headers ?? {}),
    },
  });
  return response;
}

async function jsonCheck(path, verify) {
  const response = await fetchBounded(path);
  assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`);
  const body = await response.json();
  verify(body);
  return body;
}

function normalizedRevision(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function revisionsMatch(expected, actual) {
  const left = normalizedRevision(expected);
  const right = normalizedRevision(actual);
  if (!left || !right) return false;
  return left === right || left.startsWith(right) || right.startsWith(left);
}

const results = [];

const health = await jsonCheck("/api/healthz", (body) => {
  assert.equal(body?.ok, true, "healthz did not report ok=true");
  assert.equal(body?.service, "insight-hub", "healthz service identity changed");
});
results.push({ check: "healthz", ok: true, revision: health.revision ?? null });

if (expectedCommit) {
  assert.ok(
    revisionsMatch(expectedCommit, health.revision),
    `deployed revision ${health.revision ?? "<missing>"} does not match expected ${expectedCommit}`,
  );
  results.push({ check: "deployment-revision", ok: true });
}

await jsonCheck("/api/readyz?force=true", (body) => {
  assert.equal(body?.ok, true, "readyz did not report ok=true");
  assert.equal(body?.ready, true, "readyz did not report ready=true");
  if (expectedCommit) {
    assert.ok(
      revisionsMatch(expectedCommit, body?.revision),
      "readyz revision does not match expected deployment",
    );
  }
});
results.push({ check: "readyz", ok: true });

await jsonCheck("/api/database-status", (body) => {
  assert.equal(body?.ok, true, "database-status did not report ok=true");
});
results.push({ check: "database-status", ok: true });

await jsonCheck("/api/opportunities?limit=1&view=actionable", (body) => {
  const rows = body?.data;
  assert.ok(Array.isArray(rows), "opportunity response data is not an array");
  assert.ok(
    Number.isFinite(Number(body?.total ?? rows.length)),
    "opportunity response total is not numeric",
  );
});
results.push({ check: "opportunity-read", ok: true });

for (const path of [
  "/portal/opportunities",
  "/portal/forecasts",
  "/portal/recompete-watch",
  "/portal/relevant-news",
  "/portal/settings",
]) {
  const response = await fetchBounded(path, {
    headers: { Accept: "text/html" },
  });
  assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`);
  const html = await response.text();
  assert.match(
    html,
    /<div[^>]+id=["']root["'][^>]*>/i,
    `${path} did not return the app shell`,
  );
  results.push({ check: `frontend:${path}`, ok: true });
}

console.log(
  JSON.stringify({
    event: "insight_hub_production_acceptance_passed",
    baseUrl,
    expectedCommit,
    deployedRevision: health.revision ?? null,
    checks: results,
    checkedAt: new Date().toISOString(),
  }),
);
