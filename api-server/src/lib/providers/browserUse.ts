/**
 * BrowserUse AI Provider
 *
 * Role: AI-powered browser automation. Given a natural-language task,
 * BrowserUse autonomously controls a real browser to navigate, interact,
 * and extract data from complex web applications that block simple scrapers.
 *
 * API docs: https://docs.browser-use.com
 */

import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const BROWSER_USE_BASE = "https://api.browser-use.com/api/v1";

export type BrowserUseTaskStatus = "created" | "running" | "paused" | "finished" | "stopped" | "failed";

export interface BrowserUseTask {
  id: string;
  status: BrowserUseTaskStatus;
  output?: string;
  steps?: { action: string; url?: string; thought?: string }[];
  created_at?: string;
  finished_at?: string;
}

export class BrowserUseProvider implements DataSourceProvider {
  readonly name = "browserUse" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("browserUseApiKey", "BROWSER_USE_API_KEY");
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return { name: this.name, configured, healthy: configured };
  }

  /**
   * Create a new browser task with a natural-language instruction.
   */
  async createTask(task: string): Promise<BrowserUseTask | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return null;

    const response = await fetch(`${BROWSER_USE_BASE}/run-task`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ task }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`BrowserUse error ${response.status}: ${text.slice(0, 200)}`);
    }

    return response.json() as Promise<BrowserUseTask>;
  }

  /**
   * Get the status and output of a running task.
   */
  async getTask(taskId: string): Promise<BrowserUseTask | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return null;

    const response = await fetch(`${BROWSER_USE_BASE}/task/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) return null;
    return response.json() as Promise<BrowserUseTask>;
  }

  /**
   * Stop a running task.
   */
  async stopTask(taskId: string): Promise<void> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return;

    await fetch(`${BROWSER_USE_BASE}/stop-task/${taskId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  }

  /**
   * Run a task and poll until completion (up to maxWaitMs).
   * Returns the final task with output, or null on timeout/failure.
   */
  async runAndWait(task: string, maxWaitMs = 120_000): Promise<BrowserUseTask | null> {
    const created = await this.createTask(task);
    if (!created) return null;

    const start = Date.now();
    let current = created;
    const terminalStates: BrowserUseTaskStatus[] = ["finished", "stopped", "failed"];

    while (!terminalStates.includes(current.status)) {
      if (Date.now() - start > maxWaitMs) {
        await this.stopTask(current.id).catch(() => {});
        break;
      }
      await new Promise((r) => setTimeout(r, 4000));
      const updated = await this.getTask(current.id);
      if (updated) current = updated;
      else break;
    }

    return current;
  }

  /**
   * Use BrowserUse to research a specific URL or web workflow.
   * Example: "Go to sam.gov and find open occupational health contracts. Return titles, agencies, and deadlines."
   */
  async research(instruction: string): Promise<string | null> {
    const result = await this.runAndWait(instruction);
    return result?.output ?? null;
  }
}

export const browserUseProvider = new BrowserUseProvider();
