import { enrichBidLockerRecordDates } from "../../api-server/src/lib/providers/bidLockerDateEnrichment";
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
  const enriched = await enrichBidLockerRecordDates(result.records, { limit: 5 });
  const errors = [...result.errors, ...enriched.errors];
  const completeDates = enriched.records.filter(
    (record) =>
      record.postedDate.getTime() > 0 && Boolean(record.responseDeadline),
  ).length;
  if (enriched.records.length > 0 && completeDates !== enriched.records.length) {
    errors.push(
      `${tenant.portalId}: ${enriched.records.length - completeDates} record(s) still have incomplete public dates`,
    );
  }

  results.push({
    portalId: tenant.portalId,
    tenantSlug: tenant.tenantSlug,
    recordCount: enriched.records.length,
    errors,
    sampleTitles: enriched.records.slice(0, 3).map((record) => record.title),
    completeDates,
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
