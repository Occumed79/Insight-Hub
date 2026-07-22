export function composeAbortSignal(
  timeoutMs: number,
  parentSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(
      new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError"),
    );
  }, timeoutMs);

  const abortFromParent = () => {
    controller.abort(
      parentSignal?.reason ?? new DOMException("Request cancelled", "AbortError"),
    );
  };

  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}
