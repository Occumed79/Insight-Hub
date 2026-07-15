import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(scriptDir, "audit-core-direct-rfp-portals.mjs");
const runtimePath = path.join(scriptDir, ".audit-core-direct-rfp-portals.runtime.mjs");

const template = fs.readFileSync(templatePath, "utf8");
const broken = 'const openIndex = source.indexOf("[", markerIndex);';
const fixed = [
  'const assignmentIndex = source.indexOf("=", markerIndex);',
  '  const openIndex = source.indexOf("[", assignmentIndex);',
].join("\n  ");

if (!template.includes(broken)) {
  throw new Error("Core audit template no longer contains the expected array-boundary expression");
}

fs.writeFileSync(runtimePath, template.replace(broken, fixed));
try {
  await import(`${pathToFileURL(runtimePath).href}?run=${Date.now()}`);
} finally {
  fs.rmSync(runtimePath, { force: true });
}
