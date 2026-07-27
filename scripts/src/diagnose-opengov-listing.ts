import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const tenant = process.env.OPENGOV_DIAGNOSTIC_TENANT ?? "ocgov";
const url = `https://procurement.opengov.com/portal/embed/${tenant}/project-list?departmentId=all&status=all`;
const response = await fetch(url, {
  headers: {
    accept: "text/html,application/xhtml+xml",
    "user-agent":
      "Mozilla/5.0 (compatible; OccuMed-InsightHub/1.0; +https://www.occumed.com)",
  },
});
const html = await response.text();
const scriptSources = Array.from(
  html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi),
).map((match) => match[1]);
const markers = [
  "__NEXT_DATA__",
  "__NUXT__",
  "project-list",
  "Project Title",
  "solicitation_number",
  "published_at",
  "window.__",
].map((marker) => ({ marker, index: html.indexOf(marker) }));
const inlineScripts = Array.from(
  html.matchAll(/<script\b(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi),
)
  .map((match) => match[1] ?? "")
  .filter(Boolean)
  .map((value) => value.slice(0, 2_000));
const report = {
  url,
  status: response.status,
  contentType: response.headers.get("content-type"),
  length: html.length,
  scriptSources,
  markers,
  inlineScriptCount: inlineScripts.length,
  inlineScripts,
  firstTwoThousandCharacters: html.slice(0, 2_000),
};
const outputDir = resolve(
  process.env.OPENGOV_DIAGNOSTIC_DIR ?? "artifacts/opengov-diagnostic",
);
await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "response.html"), html, "utf8"),
  writeFile(
    resolve(outputDir, "diagnostic.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  ),
]);
console.log(JSON.stringify(report, null, 2));
