import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  TRANSFERRED_INTELLIGENCE_PREFIXES,
  isTransferredIntelligencePath,
} from "../transferred-intelligence-boundary";

const transferredFrontendRoutes = [
  "/portal/entities",
  "/portal/clients",
  "/portal/prospects",
  "/portal/competitors",
  "/portal/federal-agencies",
  "/portal/state-agencies",
];

const transferredRouteModules = [
  "./competitors",
  "./prospects",
  "./prospect-locations",
  "./prospect-contacts",
  "./clients",
  "./client-contacts",
  "./federal-intel",
  "./state-agencies",
  "./intelligence-feed",
];

test("Hub 1 classifies every transferred intelligence API prefix", () => {
  for (const prefix of TRANSFERRED_INTELLIGENCE_PREFIXES) {
    assert.equal(isTransferredIntelligencePath(prefix), true, prefix);
    assert.equal(isTransferredIntelligencePath(`${prefix}/example`), true, prefix);
  }
  assert.equal(isTransferredIntelligencePath("/opportunities"), false);
  assert.equal(isTransferredIntelligencePath("/govcon/forecasts"), false);
  assert.equal(isTransferredIntelligencePath("/relevant-news"), false);
  assert.equal(isTransferredIntelligencePath("/search"), false);
});

test("Hub 1 frontend exposes procurement workspaces only", async () => {
  const source = await readFile("../intel-suite/src/App.tsx", "utf8");
  for (const route of transferredFrontendRoutes) {
    assert.equal(source.includes(`path=\"${route}\"`), false, route);
  }

  for (const required of [
    "/portal/opportunities",
    "/portal/forecasts",
    "/portal/recompete-watch",
    "/portal/relevant-news",
    "/portal/settings",
  ]) {
    assert.equal(source.includes(`path=\"${required}\"`), true, required);
  }
});

test("Hub 1 API router does not mount transferred intelligence handlers", async () => {
  const source = await readFile("src/routes/index.ts", "utf8");
  assert.match(source, /transferredIntelligenceBoundaryRouter/);
  for (const modulePath of transferredRouteModules) {
    assert.equal(source.includes(`from \"${modulePath}\"`), false, modulePath);
  }
});
