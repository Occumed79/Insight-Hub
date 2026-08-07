import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;
const sourceUrl = process.env.RFP_DATABASE_URL;
const restoreUrl = process.env.RFP_RESTORE_DATABASE_URL;
if (!sourceUrl || !restoreUrl) {
  throw new Error("RFP_DATABASE_URL and RFP_RESTORE_DATABASE_URL are required");
}

async function snapshot(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const opportunity = await client.query(`
      SELECT
        COUNT(*)::int AS count,
        COALESCE(
          md5(string_agg(
            id::text || '|' || coalesce(notice_id, '') || '|' || title || '|' || source,
            ',' ORDER BY id::text
          )),
          md5('')
        ) AS fingerprint
      FROM opportunities
    `);
    const feedback = await client.query(`
      SELECT
        COUNT(*)::int AS count,
        COALESCE(
          md5(string_agg(
            id::text || '|' || opportunity_id::text || '|' || grade,
            ',' ORDER BY id::text
          )),
          md5('')
        ) AS fingerprint
      FROM opportunity_feedback
    `);
    const settings = await client.query(`
      SELECT
        COUNT(*)::int AS count,
        COALESCE(md5(string_agg(key || '=' || value, ',' ORDER BY key)), md5('')) AS fingerprint
      FROM settings
    `);
    const marker = await client.query(`
      SELECT value FROM settings WHERE key = 'dr_restore_marker'
    `);
    const fixture = await client.query(`
      SELECT notice_id, title, provider_key, source
      FROM opportunities
      WHERE notice_id = 'DR-RESTORE-001'
      ORDER BY created_at ASC
      LIMIT 1
    `);

    return {
      opportunity: opportunity.rows[0],
      feedback: feedback.rows[0],
      settings: settings.rows[0],
      marker: marker.rows[0]?.value ?? null,
      fixture: fixture.rows[0] ?? null,
    };
  } finally {
    await client.end();
  }
}

const [source, restored] = await Promise.all([
  snapshot(sourceUrl),
  snapshot(restoreUrl),
]);

assert.deepEqual(restored.opportunity, source.opportunity, "opportunities changed after restore");
assert.deepEqual(restored.feedback, source.feedback, "feedback changed after restore");
assert.deepEqual(restored.settings, source.settings, "settings changed after restore");
assert.equal(source.marker, "backup-restore-ok");
assert.equal(restored.marker, source.marker);
assert.deepEqual(restored.fixture, source.fixture);

console.log(
  JSON.stringify({
    event: "rfp_backup_restore_audit_passed",
    sourceDatabase: new URL(sourceUrl).pathname.replace(/^\//, ""),
    restoreDatabase: new URL(restoreUrl).pathname.replace(/^\//, ""),
    opportunities: source.opportunity.count,
    feedback: source.feedback.count,
    settings: source.settings.count,
  }),
);
