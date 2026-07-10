#!/usr/bin/env node
import { mkdir, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const requireFromApiServer = createRequire(path.join(root, "api-server/package.json"));
const { build } = requireFromApiServer("esbuild");
const outdir = path.join(root, ".tmp-public-portals-validate");
const outfile = path.join(outdir, "catalog.mjs");

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [path.join(root, "api-server/src/lib/providers/publicPortalProviders/catalog.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  logLevel: "silent",
});

const { PUBLIC_PORTAL_SOURCES, validatePublicPortalCatalog } = await import(pathToFileURL(outfile).href);
const summary = validatePublicPortalCatalog(PUBLIC_PORTAL_SOURCES);

console.log("Public portal providers derived catalog validation");
console.log(`total derived sources: ${summary.totalDerivedSources}`);
console.log(`enabled sources: ${summary.enabledSources}`);
console.log(`needs_review sources: ${summary.needsReviewSources}`);
console.log(`disabled login/dynamic sources: ${summary.disabledLoginOrDynamicSources}`);
console.log(`duplicate IDs: ${summary.duplicateIds.length ? summary.duplicateIds.join(", ") : "none"}`);
console.log(`invalid URLs: ${summary.invalidUrls.length ? summary.invalidUrls.join(", ") : "none"}`);
console.log(`aggregator domain leakage: ${summary.aggregatorDomainLeakage.length ? summary.aggregatorDomainLeakage.join(", ") : "none"}`);

await rm(outdir, { recursive: true, force: true });

if (summary.duplicateIds.length || summary.invalidUrls.length || summary.aggregatorDomainLeakage.length) {
  process.exit(1);
}
