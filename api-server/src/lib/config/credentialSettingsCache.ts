export interface CredentialSettingsCache {
  get(): Promise<ReadonlyMap<string, string>>;
  invalidate(): void;
}

/**
 * Small read-through cache used for credential fallbacks stored in the shared
 * settings table. Provider status checks fan out concurrently; with the
 * production DB pool intentionally capped at one connection, issuing one SQL
 * query per credential serializes the entire request. This cache coalesces the
 * concurrent reads onto one snapshot without changing env-first precedence.
 */
export function createCredentialSettingsCache(
  loader: () => Promise<ReadonlyMap<string, string>>,
  ttlMs = 5_000,
  now: () => number = Date.now,
): CredentialSettingsCache {
  let snapshot: ReadonlyMap<string, string> | null = null;
  let expiresAt = 0;
  let inFlight: Promise<ReadonlyMap<string, string>> | null = null;
  let generation = 0;

  return {
    async get(): Promise<ReadonlyMap<string, string>> {
      if (snapshot && now() < expiresAt) return snapshot;
      if (inFlight) return inFlight;

      const observedGeneration = generation;
      const request = loader().then((loaded) => {
        if (generation === observedGeneration) {
          snapshot = loaded;
          expiresAt = now() + ttlMs;
        }
        return loaded;
      });

      inFlight = request;
      try {
        return await request;
      } finally {
        if (inFlight === request) inFlight = null;
      }
    },

    invalidate(): void {
      generation += 1;
      snapshot = null;
      expiresAt = 0;
      inFlight = null;
    },
  };
}
