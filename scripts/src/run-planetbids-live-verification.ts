import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  PLANETBIDS_TENANTS,
  PlanetBidsPortalProvider,
  planetBidsListingUrl,
} from "../../api-server/src/lib/providers/planetBidsPortal";

interface TenantResult {
  portalId: string;
  buyerId: string;
  recordCount: number;
  errors: string[];
  sampleTitles: string[];
  shellDiagnostics?: {
    scripts: string[];
    endpointClues: string[];
  };
}

const reportDir = resolve(
  process.cwd(),
  process.env.PLANETBIDS_LIVE_REPORT_DIR ??
    "../artifacts/statewide-live-verification",
);
await mkdir(reportDir, { recursive: true });

async function captureShellDiagnostics(
  portalId: string,
  url: string,
): Promise<TenantResult["shellDiagnostics"]> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent":
        "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)",
    },
  });
  const html = await response.text();
  await writeFile(
    resolve(reportDir, `planetbids-${portalId}.html`),
    html,
    "utf8",
  );

  const scripts = Array.from(
    html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi),
    (match) => match[1] ?? "",
  )
    .filter(Boolean)
    .slice(0, 20);
  const endpointClues = Array.from(
    new Set(
      Array.from(
        html.matchAll(
          /(?:https?:\/\/[^"'\s<>]+|\/[A-Za-z0-9._~!$&()*+,;=:@%/?#-]*(?:api|bid|opportun|solicitation)[A-Za-z0-9._~!$&()*+,;=:@%/?#-]*)/gi,
        ),
        (match) => match[0],
      ),
    ),
  ).slice(0, 30);

  return { scripts, endpointClues };
}

const results: TenantResult[] = [];

for (const tenant of PLANETBIDS_TENANTS) {
  const provider = new PlanetBidsPortalProvider([tenant]);
  const result = await provider.fetch({ limit: 2 });
  const shellDiagnostics = result.errors.length
    ? await captureShellDiagnostics(
        tenant.portalId,
        planetBidsListingUrl(tenant),
      ).catch(() => undefined)
    : undefined;
  results.push({
    portalId: tenant.portalId,
    buyerId: tenant.buyerId,
    recordCount: result.records.length,
    errors: result.errors,
    sampleTitles: result.records.map((record) => record.title),
    shellDiagnostics,
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
