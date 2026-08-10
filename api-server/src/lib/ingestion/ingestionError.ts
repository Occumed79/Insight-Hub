/** Return the actionable driver cause without exposing a generated SQL dump. */
export function conciseIngestionError(value: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = value;
  while (current != null && !seen.has(current) && messages.length < 3) {
    seen.add(current);
    const message =
      current instanceof Error ? current.message : String(current);
    if (message.trim()) messages.push(message);
    current =
      typeof current === "object" && "cause" in current
        ? (current as { cause?: unknown }).cause
        : null;
  }
  const driverMessage = messages.find(
    (message) =>
      !/^Failed query:\s*(insert|update|select|delete)/i.test(message),
  );
  const message = driverMessage ?? messages[0] ?? "Unknown provider error";
  return (
    message.replace(/\s+/g, " ").trim().slice(0, 500) ||
    "Unknown provider error"
  );
}
