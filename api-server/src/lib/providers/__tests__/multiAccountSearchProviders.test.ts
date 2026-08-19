import assert from "node:assert/strict";
import test from "node:test";
import { clearFreeTierCredentialPoolState } from "../freeTierCredentialPool";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { ExaProvider } = await import("../exa");
const { YouProvider } = await import("../you");
const { BrowserbaseProvider } = await import("../browserbase");
const { FirecrawlProvider } = await import("../firecrawl");
const { GeminiProvider } = await import("../gemini");
const { GroqProvider } = await import("../groq");
const { OpenRouterProvider } = await import("../openrouter");
const { CohereProvider } = await import("../cohere");

function restoreEnvironment(
  names: readonly string[],
  originals: Array<string | undefined>,
) {
  names.forEach((name, index) => {
    const value = originals[index];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
}

test("Exa fails over across independent account keys after a 429", async () => {
  clearFreeTierCredentialPoolState();
  const originalFetch = globalThis.fetch;
  const names = ["EXA_API_KEY", "EXA_API_KEY_2", "EXA_API_KEY_3"] as const;
  const originalKeys = names.map((name) => process.env[name]);
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
    assert.equal((await provider.search("occupational health RFP")).length, 1);
    assert.equal((await provider.search("medical surveillance RFP")).length, 1);
    assert.deepEqual(attempted, [
      "exa-account-one",
      "exa-account-two",
      "exa-account-two",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(names, originalKeys);
    clearFreeTierCredentialPoolState();
  }
});

test("You.com fails over across independent account keys after a 429", async () => {
  clearFreeTierCredentialPoolState();
  const originalFetch = globalThis.fetch;
  const names = ["YOU_API_KEY", "YOU_API_KEY_2"] as const;
  const originalKeys = names.map((name) => process.env[name]);
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
    assert.equal((await provider.search("occupational health RFP")).length, 1);
    assert.equal((await provider.search("drug testing RFP")).length, 1);
    assert.deepEqual(attempted, [
      "you-account-one",
      "you-account-two",
      "you-account-two",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(names, originalKeys);
    clearFreeTierCredentialPoolState();
  }
});

test("Browserbase uses both separate accounts and stays on the successful replacement", async () => {
  clearFreeTierCredentialPoolState();
  const originalFetch = globalThis.fetch;
  const names = ["BROWSERBASE_API_KEY", "BROWSERBASE_KEY_2"] as const;
  const originals = names.map((name) => process.env[name]);
  const attempted: string[] = [];
  process.env.BROWSERBASE_API_KEY = "browserbase-account-one";
  process.env.BROWSERBASE_KEY_2 = "browserbase-account-two";

  globalThis.fetch = async (_input, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    const key = headers?.["X-BB-API-Key"] ?? "";
    attempted.push(key);
    if (key === "browserbase-account-one") {
      return new Response("rate limited", { status: 429 });
    }
    return new Response(
      JSON.stringify({
        results: [
          {
            id: "bb-1",
            title: "Occupational Health Services RFP",
            url: "https://example.gov/browserbase-rfp",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const provider = new BrowserbaseProvider();
    assert.equal((await provider.search("occupational health RFP")).length, 1);
    assert.equal((await provider.search("medical surveillance RFP")).length, 1);
    assert.deepEqual(attempted, [
      "browserbase-account-one",
      "browserbase-account-two",
      "browserbase-account-two",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(names, originals);
    clearFreeTierCredentialPoolState();
  }
});

test("Firecrawl search uses the same three-account pool as scrape", async () => {
  clearFreeTierCredentialPoolState();
  const originalFetch = globalThis.fetch;
  const names = [
    "FIRECRAWL_API_KEY",
    "FIRECRAWL_API_KEY_2",
    "FIRECRAWL_API_KEY_3",
  ] as const;
  const originals = names.map((name) => process.env[name]);
  const attempted: string[] = [];
  process.env.FIRECRAWL_API_KEY = "firecrawl-account-one";
  process.env.FIRECRAWL_API_KEY_2 = "firecrawl-account-two";
  process.env.FIRECRAWL_API_KEY_3 = "firecrawl-account-three";

  globalThis.fetch = async (_input, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    const authorization = headers?.Authorization ?? "";
    attempted.push(authorization.replace(/^Bearer\s+/i, ""));
    if (authorization.includes("firecrawl-account-one")) {
      return new Response("monthly credits exhausted", { status: 429 });
    }
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          web: [
            {
              url: "https://example.gov/firecrawl-rfp",
              title: "Employee Medical Testing RFP",
              description: "Drug testing and occupational health services",
            },
          ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const provider = new FirecrawlProvider();
    assert.equal((await provider.search("occupational health RFP")).length, 1);
    assert.equal((await provider.search("drug testing RFP")).length, 1);
    assert.deepEqual(attempted, [
      "firecrawl-account-one",
      "firecrawl-account-two",
      "firecrawl-account-two",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(names, originals);
    clearFreeTierCredentialPoolState();
  }
});

test("Gemini higher-level query generation uses all three separate account keys", async () => {
  clearFreeTierCredentialPoolState();
  const originalFetch = globalThis.fetch;
  const names = ["GEMINI_API_KEY", "GEMINI_KEY_2", "GEMINI_KEY_3"] as const;
  const originals = names.map((name) => process.env[name]);
  const attempted: string[] = [];
  process.env.GEMINI_API_KEY = "gemini-account-one";
  process.env.GEMINI_KEY_2 = "gemini-account-two";
  process.env.GEMINI_KEY_3 = "gemini-account-three";

  globalThis.fetch = async (input) => {
    const key = new URL(String(input)).searchParams.get("key") ?? "";
    attempted.push(key);
    if (key === "gemini-account-one") {
      return new Response(
        JSON.stringify({ error: { message: "daily quota exceeded" } }),
        { status: 429, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    "occupational health RFP 2026",
                    "medical surveillance RFP 2026",
                  ]),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const provider = new GeminiProvider();
    const first = await provider.generateSearchQueries("employee health");
    const second = await provider.generateSearchQueries("drug testing");
    assert.equal(first.length, 2);
    assert.equal(second.length, 2);
    assert.deepEqual(attempted, [
      "gemini-account-one",
      "gemini-account-two",
      "gemini-account-two",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(names, originals);
    clearFreeTierCredentialPoolState();
  }
});

test("Groq and OpenRouter backup accounts are sticky after a primary 429", async () => {
  for (const fixture of [
    {
      names: ["GROQ_API_KEY", "GROQ_KEY_2"] as const,
      primary: "groq-account-one",
      secondary: "groq-account-two",
      provider: new GroqProvider(),
      endpointToken: "groq.com",
    },
    {
      names: ["OPENROUTER_API_KEY", "OPENROUTER_KEY_2"] as const,
      primary: "openrouter-account-one",
      secondary: "openrouter-account-two",
      provider: new OpenRouterProvider(),
      endpointToken: "openrouter.ai",
    },
  ]) {
    clearFreeTierCredentialPoolState();
    const originalFetch = globalThis.fetch;
    const originals = fixture.names.map((name) => process.env[name]);
    const attempted: string[] = [];
    process.env[fixture.names[0]] = fixture.primary;
    process.env[fixture.names[1]] = fixture.secondary;

    globalThis.fetch = async (input, init) => {
      assert.match(String(input), new RegExp(fixture.endpointToken.replace(".", "\\.")));
      const headers = init?.headers as Record<string, string> | undefined;
      const key = (headers?.Authorization ?? "").replace(/^Bearer\s+/i, "");
      attempted.push(key);
      if (key === fixture.primary) return new Response("rate limited", { status: 429 });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    try {
      assert.equal(await fixture.provider.complete("test one"), "ok");
      assert.equal(await fixture.provider.complete("test two"), "ok");
      assert.deepEqual(attempted, [fixture.primary, fixture.secondary, fixture.secondary]);
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnvironment(fixture.names, originals);
      clearFreeTierCredentialPoolState();
    }
  }
});

test("Cohere four-account rerank pool fails over and stays on the successful account", async () => {
  clearFreeTierCredentialPoolState();
  const originalFetch = globalThis.fetch;
  const names = [
    "COHERE_API_KEY",
    "COHERE_API_KEY_2",
    "COHERE_API_KEY_3",
    "COHERE_API_KEY_4",
  ] as const;
  const originals = names.map((name) => process.env[name]);
  const attempted: string[] = [];
  process.env.COHERE_API_KEY = "cohere-account-one";
  process.env.COHERE_API_KEY_2 = "cohere-account-two";
  process.env.COHERE_API_KEY_3 = "cohere-account-three";
  process.env.COHERE_API_KEY_4 = "cohere-account-four";

  globalThis.fetch = async (_input, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    const key = (headers?.Authorization ?? "").replace(/^Bearer\s+/i, "");
    attempted.push(key);
    if (key === "cohere-account-one") {
      return new Response("rate limited", { status: 429 });
    }
    return new Response(
      JSON.stringify({ results: [{ index: 0, relevance_score: 0.99 }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const provider = new CohereProvider();
    assert.equal((await provider.rerank("occupational health", ["medical surveillance"]))?.length, 1);
    assert.equal((await provider.rerank("drug testing", ["employee testing"]))?.length, 1);
    assert.deepEqual(attempted, [
      "cohere-account-one",
      "cohere-account-two",
      "cohere-account-two",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(names, originals);
    clearFreeTierCredentialPoolState();
  }
});
