import {
  BIDLOCKER_TENANTS,
  BidLockerPortalProvider,
} from "../../api-server/src/lib/providers/bidLockerPortal";

interface TenantVerification {
  portalId: string;
  tenantSlug: string;
  recordCount: number;
  errors: string[];
  sampleTitles: string[];
  completeDates: number;
}

const results: TenantVerification[] = [];

for (const tenant of BIDLOCKER_TENANTS) {
  const provider = new BidLockerPortalProvider([tenant]);
  const result = await provider.fetch({ limit: 5 });
  results.push({
    portalId: tenant.portalId,
    tenantSlug: tenant.tenantSlug,
    recordCount: result.records.length,
    errors: result.errors,
    sampleTitles: result.records.slice(0, 3).map((record) => record.title),
    completeDates: result.records.filter(
      (record) =>
        record.postedDate.getTime() > 0 && Boolean(record.responseDeadline),
    ).length,
  });
}

const totalRecords = results.reduce(
  (sum, result) => sum + result.recordCount,
  0,
);
console.log(
  JSON.stringify(
    {
      checked: results.length,
      totalRecords,
      results,
    },
    null,
    2,
  ),
);

const failures = results.filter((result) => result.errors.length > 0);
if (failures.length > 0) {
  console.error(
    `BidLocker live verification failed for ${failures
      .map((result) => result.portalId)
      .join(", ")}`,
  );
  process.exitCode = 1;
}
