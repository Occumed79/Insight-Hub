import assert from "node:assert/strict";
import test from "node:test";
import { clearFreeTierCredentialPoolState } from "../freeTierCredentialPool";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { ExaProvider } = await import("../exa");
const { YouProvider } = await import("../you");

test("Exa fails over across independent account keys after a 429", async () => {
  clearFreeTierCredentialPoolState();
  const originalFetch = globalThis.fetch;
  const originalKeys = [
    process.env.EXA_API_KEY,
    process.env.EXA_API_KEY_2,
    process.env.EXA_API_KEY_3,
  ];
  const attempted: string[] = [];

  process.env.EXA_API_KEY = "exa-account-one";
  process.env.EXA_API_KEY_2 = "exa-account-two";
  process.env.EXA_API_KEY_3 = "exa-account-three";

  globalThis.fetch = async (_input, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    const key = headers?.["x-api-key"] ?? "";
    attempted.push(key);
    if (key === "exa-account-one") {
      return new Response("monthly quota exhausted", { status: 429 });
    }
    return new Response(
      JSON.stringify({
        results: [
          {
            id: "exa-1",
            url: "https://example.gov/rfp",
            title: "Occupational Health RFP",
            highlights: ["employee medical surveillance"],
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const provider = new ExaProvider();
    const first = await provider.search("occupational health RFP");
    const second = await provider.search("medical surveillance RFP");
    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.deepEqual(attempted, [
      "exa-account-one",
      "exa-account-two",
      "exa-account-two",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    const names = ["EXA_API_KEY", "EXA_API_KEY_2", "EXA_API_KEY_3"] as const;
    names.forEach((name, index) => {
      const value = originalKeys[index];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    });
    clearFreeTierCredentialPoolState();
  }
});

test("You.com fails over across independent account keys after a 429", async () => {
  clearFreeTierCredentialPoolState();
  const originalFetch = globalThis.fetch;
  const originalKeys = [process.env.YOU_API_KEY, process.env.YOU_API_KEY_2];
  const attempted: string[] = [];

  process.env.YOU_API_KEY = "you-account-one";
  process.env.YOU_API_KEY_2 = "you-account-two";

  globalThis.fetch = async (_input, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    const key = headers?.["X-API-Key"] ?? "";
    attempted.push(key);
    if (key === "you-account-one") {
      return new Response("daily rate limit exhausted", { status: 429 });
    }
    return new Response(
      JSON.stringify({
        hits: [
          {
            title: "Employee Medical Services RFP",
            url: "https://example.gov/employee-medical-rfp",
            description: "Occupational health examinations",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const provider = new YouProvider();
    const first = await provider.search("occupational health RFP");
    const second = await provider.search("drug testing RFP");
    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.deepEqual(attempted, [
      "you-account-one",
      "you-account-two",
      "you-account-two",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    const names = ["YOU_API_KEY", "YOU_API_KEY_2"] as const;
    names.forEach((name, index) => {
      const value = originalKeys[index];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    });
    clearFreeTierCredentialPoolState();
  }
});
