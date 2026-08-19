import {
  getProviderBudgetSnapshot,
  type ProviderBudgetSnapshot,
} from "./providerBudget";

export type ProviderRenewalClass =
  | "hourly"
  | "daily"
  | "monthly"
  | "metered"
  | "emergency";

export interface DiscoveryQuotaPolicy {
  provider: string;
  renewal: ProviderRenewalClass;
  priority: number;
  purpose: "discovery" | "enrichment" | "judge";
  note: string;
}

/**
 * Ordering is intentionally about quota economics, not exact vendor allowances.
 * Exact numeric request/credit limits remain deployment configuration in
 * providerBudget.ts. Lower priority values are spent first.
 */
export const DISCOVERY_QUOTA_POLICIES: readonly DiscoveryQuotaPolicy[] = [
  {
    provider: "keenable",
    renewal: "hourly",
    priority: 5,
    purpose: "discovery",
    note: "Keyless web search/fetch by default; optional API key only lifts rate limits.",
  },
  {
    provider: "you",
    renewal: "daily",
    priority: 10,
    purpose: "discovery",
    note: "Daily-renewing search capacity; separate accounts fail over independently.",
  },
  {
    provider: "browserbase",
    renewal: "monthly",
    priority: 20,
    purpose: "discovery",
    note: "Monthly free search/fetch capacity; separate accounts are sticky failover pools.",
  },
  {
    provider: "parallel",
    renewal: "monthly",
    priority: 24,
    purpose: "discovery",
    note: "Monthly renewable search credits.",
  },
  {
    provider: "exa",
    renewal: "monthly",
    priority: 26,
    purpose: "discovery",
    note: "Monthly renewable credits; three separate account pools.",
  },
  {
    provider: "firecrawl",
    renewal: "monthly",
    priority: 28,
    purpose: "discovery",
    note: "Monthly renewable credits; preserve for search/scrape fallback.",
  },
  {
    provider: "langsearch",
    renewal: "metered",
    priority: 40,
    purpose: "discovery",
    note: "Four independent configured accounts with durable slot cooldowns.",
  },
  {
    provider: "linkup",
    renewal: "metered",
    priority: 42,
    purpose: "discovery",
    note: "Configured search fallback; exact allowance remains deployment-configured.",
  },
  {
    provider: "socrata",
    renewal: "metered",
    priority: 50,
    purpose: "discovery",
    note: "Structured public-data procurement discovery fallback.",
  },
  {
    provider: "websearch",
    renewal: "emergency",
    priority: 60,
    purpose: "discovery",
    note: "Broad final discovery fallback.",
  },
  {
    provider: "jina",
    renewal: "hourly",
    priority: 5,
    purpose: "enrichment",
    note: "Keyless Reader first; configured key raises Reader rate limits.",
  },
  {
    provider: "microlink",
    renewal: "daily",
    priority: 90,
    purpose: "enrichment",
    note: "Tiny daily free allowance; final page-extraction fallback only.",
  },
] as const;

const POLICY_BY_PROVIDER = new Map(
  DISCOVERY_QUOTA_POLICIES.map((policy) => [policy.provider, policy] as const),
);

export function discoveryQuotaPolicy(
  provider: string,
): DiscoveryQuotaPolicy | null {
  return POLICY_BY_PROVIDER.get(provider) ?? null;
}

function usefulness(snapshot: ProviderBudgetSnapshot): number {
  const attempts = Math.max(1, snapshot.successes + snapshot.failures);
  const successRate = snapshot.successes / attempts;
  const yieldPerSuccess =
    snapshot.successes > 0 ? snapshot.usefulResults / snapshot.successes : 0;
  const quotaPenalty =
    snapshot.lastOutcome === "quota" ||
    snapshot.lastOutcome === "rate_limited" ||
    snapshot.lastOutcome === "budget_exhausted"
      ? 100
      : 0;
  return successRate * 40 + Math.min(40, yieldPerSuccess) - quotaPenalty;
}

function sortByPolicyAndUsefulness<T extends {
  index: number;
  policy: DiscoveryQuotaPolicy | null;
  snapshot: ProviderBudgetSnapshot;
}>(rows: T[]): T[] {
  return rows.slice().sort((left, right) => {
    const leftPriority = left.policy?.priority ?? 55;
    const rightPriority = right.policy?.priority ?? 55;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    const utilityDelta = usefulness(right.snapshot) - usefulness(left.snapshot);
    if (utilityDelta !== 0) return utilityDelta;
    return left.index - right.index;
  });
}

/**
 * Spend policy for autonomous discovery:
 * - use every available hourly/daily renewable source first;
 * - spend at most one monthly pool in the same run;
 * - metered sources participate only when no hourly/daily/monthly source is
 *   available;
 * - emergency search participates only when every higher class is unavailable.
 *
 * The monthly slot is chosen by observed usefulness, with declared priority as
 * the stable tie-breaker. This preserves cross-provider coverage without burning
 * Exa, Parallel, Firecrawl, Browserbase, and the renewable sources together on
 * every Fetch Intelligence run.
 */
export async function selectQuotaAwareDiscoveryProviders(
  providers: readonly string[],
  maxProviders: number,
): Promise<string[]> {
  if (maxProviders <= 0) return [];
  const rows = (
    await Promise.all(
      providers.map(async (provider, index) => ({
        provider,
        index,
        policy: discoveryQuotaPolicy(provider),
        snapshot: await getProviderBudgetSnapshot(provider),
      })),
    )
  ).filter(({ snapshot }) => snapshot.available);

  const renewable = sortByPolicyAndUsefulness(
    rows.filter(({ policy }) =>
      policy?.renewal === "hourly" || policy?.renewal === "daily",
    ),
  );
  const monthly = rows
    .filter(({ policy }) => policy?.renewal === "monthly")
    .sort((left, right) => {
      const utilityDelta = usefulness(right.snapshot) - usefulness(left.snapshot);
      if (utilityDelta !== 0) return utilityDelta;
      const priorityDelta = (left.policy?.priority ?? 55) - (right.policy?.priority ?? 55);
      if (priorityDelta !== 0) return priorityDelta;
      return left.index - right.index;
    });
  const metered = sortByPolicyAndUsefulness(
    rows.filter(({ policy }) => policy?.renewal === "metered"),
  );
  const emergency = sortByPolicyAndUsefulness(
    rows.filter(({ policy }) => policy?.renewal === "emergency" || !policy),
  );

  const selected = renewable.slice(0, maxProviders);
  if (selected.length < maxProviders && monthly.length > 0) {
    selected.push(monthly[0]!);
  }

  if (selected.length === 0 && metered.length > 0) {
    selected.push(...metered.slice(0, maxProviders));
  }
  if (selected.length === 0 && emergency.length > 0) {
    selected.push(...emergency.slice(0, maxProviders));
  }

  return selected.slice(0, maxProviders).map(({ provider }) => provider);
}
