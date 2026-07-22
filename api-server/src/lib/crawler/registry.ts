import type { PortalSpider, SpiderConfig, SpiderKind } from "./types";

const configs = new Map<string, SpiderConfig>();
const spiders = new Map<SpiderKind, PortalSpider>();

export function registerSpider(spider: PortalSpider): void {
  spiders.set(spider.kind, spider);
}

export function registerSpiderConfig(config: SpiderConfig): void {
  if (!config.id.trim()) throw new Error("Spider config id is required");
  if (!config.sourceId.trim()) throw new Error("Spider sourceId is required");
  if (config.startUrls.length === 0)
    throw new Error(`Spider ${config.id} must declare at least one start URL`);
  if (config.allowedHosts.length === 0)
    throw new Error(`Spider ${config.id} must declare allowed hosts`);
  configs.set(config.id, config);
}

export function unregisterSpiderConfig(id: string): void {
  configs.delete(id);
}

export function getSpiderConfig(id: string): SpiderConfig | undefined {
  return configs.get(id);
}

export function getSpider(kind: SpiderKind): PortalSpider | undefined {
  return spiders.get(kind);
}

export function listSpiderConfigs(): SpiderConfig[] {
  return Array.from(configs.values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

export function listSpiderKinds(): SpiderKind[] {
  return Array.from(spiders.keys()).sort();
}

export function resolveSpiderConfig(
  config: SpiderConfig,
  seen = new Set<string>(),
): SpiderConfig {
  if (config.kind !== "portal_family") return config;
  if (seen.has(config.id))
    throw new Error(`Portal-family spider cycle detected at ${config.id}`);
  seen.add(config.id);
  const delegate = configs.get(config.delegateSpiderId);
  if (!delegate)
    throw new Error(
      `Portal-family spider ${config.id} references missing delegate ${config.delegateSpiderId}`,
    );
  return resolveSpiderConfig(delegate, seen);
}

export function resetSpiderRegistryForTests(): void {
  configs.clear();
  spiders.clear();
}
