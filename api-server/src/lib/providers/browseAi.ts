/**
 * Browse AI Provider
 *
 * Role: No-code web scraping via pre-configured robots. Each robot is a
 * scraping task you define on the Browse AI dashboard targeting a specific
 * website or workflow. The API triggers robot runs and retrieves extracted data.
 *
 * API docs: https://docs.browse.ai/docs/api
 * API key format: <userId>:<apiKey>  (the full string is used as Bearer token)
 */

import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const BROWSE_AI_BASE = "https://api.browse.ai/v2";

export interface BrowseAiTask {
  id: string;
  status: "pending" | "running" | "successful" | "failed";
  robotId: string;
  capturedTexts?: Record<string, string>;
  capturedScreenshots?: Record<string, string>;
  capturedList?: { columns: Record<string, string> }[];
  startedAt?: string;
  finishedAt?: string;
}

export interface BrowseAiRobotRun {
  id: string;
  status: string;
  robotId: string;
  tasks: BrowseAiTask[];
}

export class BrowseAiProvider implements DataSourceProvider {
  readonly name = "browseAi" as const;

  private async getCredentials(): Promise<{ apiKey: string; robotId?: string } | null> {
    const apiKey = await resolveCredential("browseAiApiKey", "BROWSE_AI_API_KEY");
    if (!apiKey) return null;
    const robotId = await resolveCredential("browseAiRobotId", "BROWSE_AI_ROBOT_ID");
    return { apiKey, robotId: robotId ?? undefined };
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getCredentials());
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return { name: this.name, configured, healthy: configured };
  }

  /**
   * Run a robot and return the task result.
   * inputParameters can override the robot's default inputs (e.g. search term, URL).
   */
  async runRobot(
    robotId: string,
    inputParameters?: Record<string, string>
  ): Promise<BrowseAiTask | null> {
    const creds = await this.getCredentials();
    if (!creds) return null;

    const body: Record<string, unknown> = {};
    if (inputParameters) body["inputParameters"] = inputParameters;

    const response = await fetch(`${BROWSE_AI_BASE}/robots/${robotId}/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Browse AI error ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as { result?: { task?: BrowseAiTask } };
    return data.result?.task ?? null;
  }

  /**
   * Get the result of a previously run task.
   */
  async getTask(robotId: string, taskId: string): Promise<BrowseAiTask | null> {
    const creds = await this.getCredentials();
    if (!creds) return null;

    const response = await fetch(`${BROWSE_AI_BASE}/robots/${robotId}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { result?: { task?: BrowseAiTask } };
    return data.result?.task ?? null;
  }

  /**
   * List recent tasks for a robot.
   */
  async listTasks(robotId: string, page = 1): Promise<BrowseAiTask[]> {
    const creds = await this.getCredentials();
    if (!creds) return [];

    const response = await fetch(
      `${BROWSE_AI_BASE}/robots/${robotId}/tasks?page=${page}`,
      { headers: { Authorization: `Bearer ${creds.apiKey}` } }
    );

    if (!response.ok) return [];

    const data = (await response.json()) as { result?: { tasks?: BrowseAiTask[] } };
    return data.result?.tasks ?? [];
  }

  /**
   * Run the default configured robot and wait for completion (polls up to 60s).
   */
  async runDefaultRobot(
    inputParameters?: Record<string, string>
  ): Promise<BrowseAiTask | null> {
    const creds = await this.getCredentials();
    if (!creds?.robotId) return null;

    const task = await this.runRobot(creds.robotId, inputParameters);
    if (!task) return null;

    // Poll for completion
    const start = Date.now();
    let current = task;

    while (current.status === "pending" || current.status === "running") {
      if (Date.now() - start > 60_000) break;
      await new Promise((r) => setTimeout(r, 3000));
      const updated = await this.getTask(creds.robotId, current.id);
      if (updated) current = updated;
      else break;
    }

    return current;
  }
}

export const browseAiProvider = new BrowseAiProvider();
