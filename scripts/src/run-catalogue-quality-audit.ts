import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { DIRECT_RFP_PORTALS } from "../../api-server/src/lib/providers/directRfpPortals";
import {
  auditDirectRfpCatalogue,
  catalogueAuditMarkdown,
} from "../../api-server/src/lib/providers/catalogueQualityAudit";

const report = auditDirectRfpCatalogue(DIRECT_RFP_PORTALS);
const reportDir = resolve(
  process.env.CATALOGUE_AUDIT_REPORT_DIR ??
    "artifacts/catalogue-quality-audit",
);

await mkdir(reportDir, { recursive: true });
await Promise.all([
  writeFile(
    resolve(reportDir, "catalogue-quality-audit.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    resolve(reportDir, "catalogue-quality-audit.md"),
    catalogueAuditMarkdown(report),
    "utf8",
  ),
]);

console.log(catalogueAuditMarkdown(report));

if (
  process.env.CATALOGUE_AUDIT_ENFORCE === "true" &&
  (report.summary.bySeverity.critical > 0 ||
    report.summary.bySeverity.error > 0)
) {
  process.exitCode = 1;
}
