/**
 * Re-score stored federal records with the CURRENT relevance filter and
 * archive the ones that no longer pass. Dry run by default.
 *
 *   node --import tsx scripts/rescore-stored-federal-records.ts            # preview
 *   node --import tsx scripts/rescore-stored-federal-records.ts --apply    # archive failures
 *   node --import tsx scripts/rescore-stored-federal-records.ts --provider=tango
 *
 * Rows are archived (status = 'archived'), never deleted, and get a note
 * explaining why, so the change is reversible and auditable.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { opportunitiesTable, rfpDb, rfpPool } from "@workspace/db";
import { classifyProviderRecordRelevance } from "../src/lib/providers/providerQueryMatch";
import type { NormalizedOpportunity } from "../src/lib/providers/types";

const apply = process.argv.includes("--apply");
const providerArg =
  process.argv.find((arg) => arg.startsWith("--provider="))?.split("=")[1] ?? "tango";

function toRecord(row: typeof opportunitiesTable.$inferSelect): NormalizedOpportunity {
  return {
    externalId: row.noticeId ?? row.id,
    title: row.title,
    agency: row.agency,
    subAgency: row.subAgency ?? undefined,
    type: row.type,
    status: row.status,
    naicsCode: row.naicsCode ?? undefined,
    pscCode: row.pscCode ?? undefined,
    postedDate: row.postedDate,
    responseDeadline: row.responseDeadline ?? undefined,
    setAside: row.setAside ?? undefined,
    placeOfPerformance: row.placeOfPerformance ?? undefined,
    description: row.description ?? undefined,
    solicitationNumber: row.solicitationNumber ?? undefined,
    sourceUrl: row.samUrl ?? undefined,
    source: row.source as NormalizedOpportunity["source"],
    providerName: row.providerName ?? undefined,
  };
}

async function main() {
  const rows = await rfpDb
    .select()
    .from(opportunitiesTable)
    .where(
      and(
        eq(opportunitiesTable.status, "active"),
        sql`(lower(coalesce(${opportunitiesTable.providerName}, '')) = ${providerArg.toLowerCase()}
          OR lower(coalesce(${opportunitiesTable.providerKey}, '')) = ${providerArg.toLowerCase()})`,
      ),
    );

  const failing: Array<{ id: string; title: string; agency: string; score: number; reason: string }> = [];
  for (const row of rows) {
    const relevance = classifyProviderRecordRelevance(toRecord(row));
    if (relevance.rejected) {
      failing.push({
        id: row.id,
        title: row.title,
        agency: row.agency,
        score: relevance.score,
        reason: relevance.rejectReason ?? "Insufficient Occu-Med service evidence",
      });
    }
  }

  console.log(`Checked ${rows.length} active "${providerArg}" rows; ${failing.length} fail the current filter.`);
  for (const item of failing.slice(0, 50)) {
    console.log(`  [${item.score}] ${item.agency} | ${item.title.slice(0, 90)}`);
  }
  if (failing.length > 50) console.log(`  ...and ${failing.length - 50} more`);

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to archive these rows.");
    return;
  }
  if (failing.length === 0) return;

  const note = "Archived by rescore: failed current Occu-Med relevance filter";
  const ids = failing.map((item) => item.id);
  for (let index = 0; index < ids.length; index += 200) {
    await rfpDb
      .update(opportunitiesTable)
      .set({ status: "archived", notes: note, updatedAt: new Date() })
      .where(inArray(opportunitiesTable.id, ids.slice(index, index + 200)));
  }
  console.log(`\nArchived ${ids.length} rows.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => rfpPool.end());
