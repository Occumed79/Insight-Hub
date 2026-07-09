import { spawnSync } from "node:child_process";

const config = process.argv[2];
const allow = process.env.ALLOW_DRIZZLE_PUSH_FORCE === "true";

if (!config) {
  console.error("Missing drizzle config path.");
  process.exit(1);
}

if (!allow) {
  console.error("Refusing to run drizzle-kit push --force.");
  console.error("This command can drop tables/columns that are not present in the selected schema.");
  console.error("Set ALLOW_DRIZZLE_PUSH_FORCE=true only for an intentional, reviewed manual migration.");
  process.exit(1);
}

const result = spawnSync("drizzle-kit", ["push", "--force", "--config", config], {
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
