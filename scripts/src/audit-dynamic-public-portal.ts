import { auditPublicDynamicEndpoints } from "../../api-server/src/lib/providers/dynamicEndpointAudit";

const pageUrl = process.argv[2];
if (!pageUrl) {
  console.error(
    "Usage: pnpm --filter @workspace/scripts exec tsx src/audit-dynamic-public-portal.ts <official-public-portal-url>",
  );
  process.exit(1);
}
auditPublicDynamicEndpoints(pageUrl).then((report) =>
  console.log(JSON.stringify(report, null, 2)),
);
