#!/usr/bin/env node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const require = createRequire(import.meta.url);
const esbuild = require(resolve(repoRoot, "api-server/node_modules/esbuild"));
const entryPoint = resolve(repoRoot, "api-server/src/lib/providers/publicPortalProviders/catalog.ts");
const outdir = mkdtempSync(join(tmpdir(), "public-portal-catalog-"));
const outfile = join(outdir, "catalog.mjs");

try {
  await esbuild.build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    logLevel: "silent",
  });

  const { validatePublicPortalCatalog } = await import(pathToFileURL(outfile).href);
  const summary = validatePublicPortalCatalog();
  console.log("Public portal catalog validation summary:");
  console.log(JSON.stringify(summary, null, 2));

  const failures = [];
  if (summary.duplicateIds.length) failures.push(`duplicateIds: ${summary.duplicateIds.join(", ")}`);
  if (summary.invalidUrls.length) failures.push(`invalidUrls: ${summary.invalidUrls.join(", ")}`);
  if (summary.aggregatorDomainLeakage.length) failures.push(`aggregatorDomainLeakage: ${summary.aggregatorDomainLeakage.join(", ")}`);

  if (failures.length) {
    console.error("Public portal catalog validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  }
} finally {
  rmSync(outdir, { recursive: true, force: true });
}
