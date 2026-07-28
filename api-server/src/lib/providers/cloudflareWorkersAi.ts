import { resolveCredential } from "../config/providerConfig";

const DEFAULT_EMBEDDING_MODEL = "@cf/qwen/qwen3-embedding-0.6b";
const DEFAULT_RERANK_MODEL = "@cf/baai/bge-reranker-base";
const REQUEST_TIMEOUT_MS = 20_000;

export interface CloudflareRerankScore {
  index: number;
  score: number;
}

interface CloudflareCredentials {
  accountId: string;
  apiToken: string;
}

function finiteVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

/**
 * Cloudflare rerank models may return either a normalized probability or a raw
 * relevance logit. Keep probabilities unchanged and map other finite values
 * through a sigmoid so downstream ranking always receives a 0..1 score.
 */
export function normalizeCloudflareRerankScore(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric >= 0 && numeric <= 1) return numeric;
  return 1 / (1 + Math.exp(-numeric));
}

export class CloudflareWorkersAiClient {
  private authenticationDisabled = false;

  private async credentials(): Promise<CloudflareCredentials | null> {
    if (this.authenticationDisabled) return null;
    const [accountId, apiToken] = await Promise.all([
      resolveCredential("cloudflareAccountId", "CLOUDFLARE_ACCOUNT_ID"),
      resolveCredential("cloudflareApiToken", "CLOUDFLARE_API_TOKEN"),
    ]);
    return accountId && apiToken ? { accountId, apiToken } : null;
  }

  private async embeddingModel(): Promise<string> {
    return (
      (await resolveCredential(
        "cloudflareEmbeddingModel",
        "CLOUDFLARE_EMBEDDING_MODEL",
      )) ?? DEFAULT_EMBEDDING_MODEL
    );
  }

  private async rerankModel(): Promise<string> {
    return (
      (await resolveCredential(
        "cloudflareRerankModel",
        "CLOUDFLARE_RERANK_MODEL",
      )) ?? DEFAULT_RERANK_MODEL
    );
  }

  async isConfigured(): Promise<boolean> {
    return (await this.credentials()) !== null;
  }

  private disableAfterAuthenticationFailure(status: number): void {
    if (status === 401) {
      this.authenticationDisabled = true;
    }
  }

  private errorMessage(operation: string, status: number, body: string): string {
    this.disableAfterAuthenticationFailure(status);
    const suffix =
      status === 401
        ? " Cloudflare Workers AI has been disabled until the service restarts; fallback providers will be used."
        : "";
    return `Cloudflare Workers AI ${operation} error ${status}: ${body.slice(0, 240)}${suffix}`;
  }

  /**
   * Generate one vector per input through Workers AI's OpenAI-compatible
   * embeddings endpoint. The output remains isolated to this model's vector
   * space and must never be compared with Gemini/Jina/Voyage vectors.
   */
  async embed(texts: string[]): Promise<number[][] | null> {
    if (texts.length === 0) return [];
    const credentials = await this.credentials();
    if (!credentials) return null;
    const model = await this.embeddingModel();
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/ai/v1/embeddings`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: texts.map((text) => text.slice(0, 16_000)),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(this.errorMessage("embeddings", response.status, body));
    }
    const payload = (await response.json()) as {
      data?: Array<{ index?: number; embedding?: unknown }>;
    };
    const rows = payload.data ?? [];
    const vectors = rows
      .slice()
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map((row) => row.embedding)
      .filter(finiteVector);
    return vectors.length === texts.length ? vectors : null;
  }

  /**
   * Directly rerank a bounded candidate set against the Occu-Med semantic
   * profile. This is cheaper and more precise than asking a chat model to score
   * every result independently.
   */
  async rerank(query: string, documents: string[]): Promise<CloudflareRerankScore[] | null> {
    if (!query.trim() || documents.length === 0) return null;
    const credentials = await this.credentials();
    if (!credentials) return null;
    const model = await this.rerankModel();
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: query.slice(0, 8_000),
          contexts: documents.map((text) => ({ text: text.slice(0, 12_000) })),
          top_k: documents.length,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(this.errorMessage("rerank", response.status, body));
    }
    const payload = (await response.json()) as {
      result?: {
        response?: Array<Record<string, unknown>>;
      } | Array<Record<string, unknown>>;
    };
    const rows = Array.isArray(payload.result)
      ? payload.result
      : payload.result?.response ?? [];
    const scores = rows
      .map((row, order) => {
        const indexValue = row.index ?? row.id ?? order;
        const index = Number(indexValue);
        const score = normalizeCloudflareRerankScore(
          row.score ?? row.relevance_score ?? row.relevanceScore,
        );
        return { index, score };
      })
      .filter(
        (entry) =>
          Number.isInteger(entry.index) &&
          entry.index >= 0 &&
          entry.index < documents.length,
      );
    return scores.length > 0 ? scores : null;
  }
}

export const cloudflareWorkersAi = new CloudflareWorkersAiClient();
