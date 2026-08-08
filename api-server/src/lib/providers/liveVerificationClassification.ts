import type { ProviderFetchResult } from "./types";

export const LIVE_VERIFICATION_STATUSES = [
  "PASS",
  "HEALTHY_EMPTY",
  "BLOCKED_CHALLENGE",
  "BAD_ENDPOINT",
  "PARSER_FAILURE",
  "REQUEST_FAILURE",
] as const;

export type LiveVerificationStatus =
  (typeof LIVE_VERIFICATION_STATUSES)[number];

/**
 * Shared live-source failure taxonomy. A source is only considered structurally
 * broken when its endpoint or parser is demonstrably bad. Browser/session gates
 * and transient request failures remain visible diagnostics but are not parser
 * failures.
 */
export function classifyLiveVerificationResult(
  result: Pick<ProviderFetchResult, "records" | "errors">,
): LiveVerificationStatus {
  if (result.records.length > 0) return "PASS";
  if (result.errors.length === 0) return "HEALTHY_EMPTY";

  const errors = result.errors.join(" ").toLowerCase();
  if (
    /captcha|browser\/login challenge|access denied|verify you are human|checking your browser|http 401|http 403|requires you to login/.test(
      errors,
    )
  ) {
    return "BLOCKED_CHALLENGE";
  }
  if (
    /application requested is not found|no server is available to handle this request|service unavailable/.test(
      errors,
    )
  ) {
    return "REQUEST_FAILURE";
  }
  if (
    /http 404|http 410|enotfound|eai_again|invalid url|name or service not known|no such host|redirected outside/.test(
      errors,
    )
  ) {
    return "BAD_ENDPOINT";
  }
  if (
    /no recognizable|no parseable|failed to parse|parser|parse error|dedicated provider is not registered/.test(
      errors,
    )
  ) {
    return "PARSER_FAILURE";
  }
  return "REQUEST_FAILURE";
}

export function isFatalLiveVerificationStatus(
  status: LiveVerificationStatus,
): boolean {
  return status === "BAD_ENDPOINT" || status === "PARSER_FAILURE";
}
