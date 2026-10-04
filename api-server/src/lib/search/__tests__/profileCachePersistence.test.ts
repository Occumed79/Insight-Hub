import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "support", "cacheProcess.ts");

function run(mode: "write" | "read", env: Record<string, string>) {
  const r = spawnSync(process.execPath, ["--import", "tsx", script, mode], { env: { ...process.env, ...env }, encoding: "utf8", cwd: path.resolve(here, "../../../.."), timeout: 120_000 });
  assert.equal(r.status, 0, r.stderr);
  const line = r.stdout.trim().split("\n").filter((l) => l.startsWith("{")).pop()!;
  return JSON.parse(line) as { source: string; version: string; applied: boolean; categories: number };
}

it("a cache written at RELEVANCE_PROFILE_CACHE_PATH is read by a new process when Neon is down", () => {
  // Stand-in for the mounted disk: a nested path that does not exist yet (the loader creates it), same layout as render.yaml.
  const mount = fs.mkdtempSync(path.join(os.tmpdir(), "var-data-"));
  const cachePath = path.join(mount, "relevance", "occumed-relevance-profile-cache.json");
  const env = { RELEVANCE_PROFILE_CACHE_PATH: cachePath, OCCU_MED_AWARE_DATABASE_URL: "postgres://u:secret@neon.example/occumed", RFP_DATABASE_URL: "postgres://u:p@127.0.0.1:1/x", DATABASE_URL: "postgres://u:p@127.0.0.1:1/x" };
  try {
    const first = run("write", env); // process 1: live Neon load writes the cache, then exits
    assert.equal(first.source, "neon");
    assert.ok(fs.existsSync(cachePath));
    const second = run("read", env); // process 2 (restart): Neon unreachable
    assert.equal(second.source, "cache");
    assert.equal(second.version, first.version);
    assert.equal(second.categories, first.categories);
    // control: without the cache path a restarted process during an outage has nothing and fails closed
    const control = run("read", { ...env, RELEVANCE_PROFILE_CACHE_PATH: path.join(mount, "elsewhere.json") });
    assert.equal(control.source, "unavailable");
  } finally {
    fs.rmSync(mount, { recursive: true, force: true });
  }
});
