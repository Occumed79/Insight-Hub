import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const failures = [];
const MAX_SCAN_BYTES = 2_000_000;

const allowedEnvFiles = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
  "api-server/.env.example",
  "intel-suite/.env.example",
]);

for (const file of tracked) {
  const basename = file.split("/").pop() ?? file;
  if (
    (basename === ".env" || basename.startsWith(".env.")) &&
    !allowedEnvFiles.has(file) &&
    !/\.(example|sample|template)$/.test(file)
  ) {
    failures.push(`tracked environment file: ${file}`);
  }
}

const patterns = [
  ["OpenAI project key", /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g],
  ["OpenAI secret key", /\bsk-[A-Za-z0-9]{32,}\b/g],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ["GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
];

const textExtensions = /\.(?:[cm]?[jt]sx?|json|ya?ml|md|txt|env|toml|ini|conf|cfg|sh|bash|zsh|sql|html|css|scss|xml|properties)$/i;
const textNames = new Set(["Dockerfile", "Procfile", "render.yaml", "package.json"]);

for (const file of tracked) {
  if (!textExtensions.test(file) && !textNames.has(file.split("/").pop() ?? file)) continue;
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    continue;
  }
  if (size > MAX_SCAN_BYTES) continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const [label, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) failures.push(`${label} pattern found in ${file}`);
  }
}

const renderPath = tracked.includes("render.yaml") ? "render.yaml" : null;
if (renderPath) {
  const render = readFileSync(renderPath, "utf8");
  const lines = render.split(/\r?\n/);
  const secretKey = /(?:_API_KEY|_TOKEN|_SECRET|_PASSWORD|DATABASE_URL)$/i;

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*-\s+key:\s*([^\s#]+)\s*$/);
    if (!match) continue;
    const key = match[1];
    if (!secretKey.test(key)) continue;

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^\s*-\s+key:/.test(lines[cursor])) break;
      const value = lines[cursor].match(/^\s+value:\s*(.+?)\s*$/);
      if (value && value[1] && !/^(?:""|''|null|~)$/.test(value[1])) {
        failures.push(`render.yaml hardcodes secret-like ${key}`);
      }
    }
  }
}

if (failures.length) {
  console.error(
    JSON.stringify({
      event: "secret_hygiene_audit_failed",
      failures: [...new Set(failures)],
    }),
  );
  process.exit(1);
}

console.log(
  JSON.stringify({
    event: "secret_hygiene_audit_passed",
    trackedFiles: tracked.length,
    scannedPatternClasses: patterns.length,
    renderSecretValuesHardcoded: 0,
  }),
);
