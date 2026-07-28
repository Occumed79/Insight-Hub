import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
} from "./types";
import { composeAbortSignal } from "./abortSignals";

const DEFAULT_ADAPTER_TIMEOUT_MS = 20_000;

function normalizedReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function abortReason(
  signal: AbortSignal,
  sourceId: string,
  timeoutMs: number,
): Error {
  const reason = signal.reason;
  if (reason instanceof DOMException && reason.name === "TimeoutError") {
    return new Error(`${sourceId} timed out after ${timeoutMs}ms`);
  }
  if (reason instanceof Error) return reason;
  return new Error(`${sourceId} was cancelled`);
}

/**
 * Executes one adapter behind an explicit Promise.race deadline. The composed
 * signal asks cooperative clients to stop; the separate timer lets the caller
 * continue even when a broken adapter ignores AbortSignal entirely.
 */
export async function runAdapterWithDeadline(
  sourceId: string,
  provider: DataSourceProvider,
  options: FetchOptions,
  timeoutMs = DEFAULT_ADAPTER_TIMEOUT_MS,
): Promise<ProviderFetchResult> {
  const boundedTimeout = Math.max(1_000, Math.floor(timeoutMs));
  const composed = composeAbortSignal(boundedTimeout, options.signal);
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

  const adapterPromise = Promise.resolve().then(() =>
    provider.fetch({
      ...options,
      signal: composed.signal,
      onProgress: undefined,
    }),
  );
  // A timed-out adapter may settle after the aggregate has already moved on.
  adapterPromise.catch(() => undefined);

  const deadline = new Promise<never>((_resolve, reject) => {
    // This timer intentionally remains referenced. It is the mechanism that
    // releases the caller when an adapter returns a never-settling promise.
    deadlineTimer = setTimeout(() => {
      reject(new Error(`${sourceId} timed out after ${boundedTimeout}ms`));
    }, boundedTimeout + 250);
  });

  try {
    return await Promise.race([adapterPromise, deadline]);
  } catch (error) {
    if (composed.signal.aborted) {
      throw abortReason(composed.signal, sourceId, boundedTimeout);
    }
    throw new Error(`${sourceId}: ${normalizedReason(error)}`);
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    composed.cleanup();
  }
}
