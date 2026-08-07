const TRANSIENT_DATABASE_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "57P01",
  "57P02",
  "57P03",
  "53300",
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
]);

const TRANSIENT_DATABASE_MESSAGE =
  /connection (?:terminated|closed|reset)|connect .*timed out|timeout expired|network is unreachable|server closed the connection|remaining connection slots|database system is starting up|cannot connect now/i;

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  cause?: unknown;
  errors?: unknown;
}

function errorLike(value: unknown): ErrorLike | undefined {
  return value && typeof value === "object" ? (value as ErrorLike) : undefined;
}

/**
 * Detects retryable Postgres/network failures, including AggregateError trees
 * produced when Node attempts multiple Neon IPv4/IPv6 addresses.
 */
export function isTransientDatabaseError(
  value: unknown,
  seen = new Set<unknown>(),
): boolean {
  if (!value || seen.has(value)) return false;
  seen.add(value);

  const error = errorLike(value);
  if (!error) return false;

  if (
    typeof error.code === "string" &&
    TRANSIENT_DATABASE_CODES.has(error.code.toUpperCase())
  ) {
    return true;
  }
  if (
    typeof error.message === "string" &&
    TRANSIENT_DATABASE_MESSAGE.test(error.message)
  ) {
    return true;
  }
  if (isTransientDatabaseError(error.cause, seen)) return true;
  if (Array.isArray(error.errors)) {
    return error.errors.some((nested) => isTransientDatabaseError(nested, seen));
  }
  return false;
}

export interface DatabaseRetryOptions {
  attempts?: number;
  delaysMs?: readonly number[];
  signal?: AbortSignal;
  onRetry?: (details: {
    label: string;
    attempt: number;
    delayMs: number;
    error: unknown;
  }) => void;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("Database retry operation aborted");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  const boundedDelay = Math.max(0, delayMs);
  if (boundedDelay === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, boundedDelay);
    timer.unref?.();
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal ? abortReason(signal) : new Error("Database retry operation aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Retries only failures classified as transient. Programming errors, invalid
 * SQL, constraint violations, and permanent authentication errors fail fast.
 * A parent cancellation interrupts both future attempts and retry backoff.
 */
export async function withTransientDatabaseRetry<T>(
  label: string,
  operation: () => Promise<T>,
  options: DatabaseRetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 3));
  const delaysMs = options.delaysMs ?? [250, 1_000];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    throwIfAborted(options.signal);
    try {
      const value = await operation();
      throwIfAborted(options.signal);
      return value;
    } catch (error) {
      if (options.signal?.aborted) throw abortReason(options.signal);
      if (attempt >= attempts || !isTransientDatabaseError(error)) throw error;
      const delayMs = delaysMs[Math.min(attempt - 1, delaysMs.length - 1)] ?? 0;
      options.onRetry?.({ label, attempt, delayMs, error });
      await wait(delayMs, options.signal);
    }
  }

  throw new Error(`${label} exhausted database retry attempts`);
}
