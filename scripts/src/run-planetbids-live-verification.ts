import {
  PLANETBIDS_TENANTS,
  PlanetBidsPortalProvider,
} from "../../api-server/src/lib/providers/planetBidsPortal";

interface TenantResult {
  portalId: string;
  buyerId: string;
  recordCount: number;
  errors: string[];
  sampleTitles: string[];
}

const results: TenantResult[] = [];

for (const tenant of PLANETBIDS_TENANTS) {
  const provider = new PlanetBidsPortalProvider([tenant]);
  const result = await provider.fetch({ limit: 2 });
  results.push({
    portalId: tenant.portalId,
    buyerId: tenant.buyerId,
    recordCount: result.records.length,
    errors: result.errors,
    sampleTitles: result.records.map((record) => record.title),
  });
}

console.log(JSON.stringify({ checked: results.length, results }, null, 2));

const failures = results.filter((result) => result.errors.length > 0);
if (failures.length > 0) {
  console.error(
    `PlanetBids live verification failed for ${failures
      .map((result) => result.portalId)
      .join(", ")}`,
  );
  process.exitCode = 1;
}
