import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  catalogueCompletionAuditMarkdown,
  runCatalogueCompletionAudit,
} from "../../api-server/src/lib/providers/catalogueCompletionAudit";

const report = runCatalogueCompletionAudit();
const reportDir = resolve(
  process.env.CATALOGUE_COMPLETION_REPORT_DIR ??
    "artifacts/catalogue-completion-audit",
);

await mkdir(reportDir, { recursive: true });
await Promise.all([
  writeFile(
    resolve(reportDir, "catalogue-completion-audit.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    resolve(reportDir, "catalogue-completion-audit.md"),
    catalogueCompletionAuditMarkdown(report),
    "utf8",
  ),
]);

console.log(catalogueCompletionAuditMarkdown(report));

if (!report.clean) process.exitCode = 1;
