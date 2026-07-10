import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { build } = require("../api-server/node_modules/esbuild");
import { mkdir, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const outdir = ".tmp/rfp-parser-smoke";
const outfile = `${outdir}/samples.mjs`;
await mkdir(outdir, { recursive: true });

try {
  await build({
    entryPoints: ["api-server/src/lib/providers/portal-parsers/fixtures/samples.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });

  const { PORTAL_PARSER_SAMPLE_FIXTURES, validatePortalParserSamples } = await import(pathToFileURL(outfile).href);
  if (!validatePortalParserSamples()) {
    throw new Error("One or more RFP parser fixtures did not produce candidates.");
  }
  console.log(`RFP parser smoke test passed for ${PORTAL_PARSER_SAMPLE_FIXTURES.length} fixture(s).`);
} finally {
  await rm(outdir, { recursive: true, force: true });
}
