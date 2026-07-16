from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def update(path: str, transform):
    target = ROOT / path
    original = target.read_text()
    changed = transform(original)
    if changed == original:
        raise SystemExit(f"No changes applied to {path}")
    target.write_text(changed)


def replace_once(text: str, old: str, new: str, path: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    return text.replace(old, new, 1)


update(
    "api-server/src/routes/rfp-sources.ts",
    lambda text: replace_once(
        text,
        'from "../lib/providers/statePortals";',
        'from "../lib/providers/publicPortalDiscovery";',
        "api-server/src/routes/rfp-sources.ts",
    ),
)


def fix_provider_index(text: str) -> str:
    return replace_once(
        text,
        'export * from "./publicPortalProviders";\n',
        'export * from "./publicPortalProviders";\nexport * from "./publicPortalDiscovery";\n',
        "api-server/src/lib/providers/index.ts",
    )


update("api-server/src/lib/providers/index.ts", fix_provider_index)


def fix_public_portal_provider(text: str) -> str:
    old = '''        if (index >= items.length) return;
        await worker(items[index], index);'''
    new = '''        if (index >= items.length) return;
        const item = items[index];
        if (item === undefined) return;
        await worker(item, index);'''
    return replace_once(text, old, new, "api-server/src/lib/providers/publicPortalProviders/index.ts")


update("api-server/src/lib/providers/publicPortalProviders/index.ts", fix_public_portal_provider)


def fix_discovery_key(text: str) -> str:
    return replace_once(
        text,
        'return `${parsed.hostname.replace(/^www\\./, "")}${parsed.pathname.replace(/\\/$/, "")}`.toLowerCase();',
        'return `${parsed.hostname.replace(/^www\\./, "")}${parsed.pathname.replace(/\\/$/, "")}${parsed.search}`.toLowerCase();',
        "api-server/src/lib/providers/publicPortalDiscovery.ts",
    )


update("api-server/src/lib/providers/publicPortalDiscovery.ts", fix_discovery_key)


def fix_international_types(text: str) -> str:
    text = replace_once(
        text,
        'const INTERNATIONAL_PORTAL_IDS = new Set(\n  INTERNATIONAL_PORTAL_GROUPS.flatMap((group) => group.portalIds),\n);',
        'const INTERNATIONAL_PORTAL_IDS = new Set<string>(\n  INTERNATIONAL_PORTAL_GROUPS.flatMap((group) => [...group.portalIds]),\n);',
        "api-server/src/lib/providers/internationalPublicPortals.ts",
    )
    text = replace_once(
        text,
        'INTERNATIONAL_PORTAL_IDS.has(portal.id as never)',
        'INTERNATIONAL_PORTAL_IDS.has(portal.id)',
        "api-server/src/lib/providers/internationalPublicPortals.ts",
    )
    text = replace_once(
        text,
        'group.portalIds.includes(portalId as never)',
        '[...group.portalIds].includes(portalId)',
        "api-server/src/lib/providers/internationalPublicPortals.ts",
    )
    return text


update("api-server/src/lib/providers/internationalPublicPortals.ts", fix_international_types)


def fix_render(text: str) -> str:
    anchor = '''      - key: INGESTION_PROVIDERS
        value: samGov,publicPortalProviders,eunaBonfire,internationalPublicPortals
'''
    addition = '''      - key: INGESTION_PROVIDERS
        value: samGov,publicPortalProviders,eunaBonfire,internationalPublicPortals
      - key: PUBLIC_PORTAL_CONCURRENCY
        value: "4"
      - key: PUBLIC_PORTAL_SOURCE_TIMEOUT_MS
        value: "25000"
      - key: PUBLIC_PORTAL_RUN_TIMEOUT_MS
        value: "90000"
'''
    return replace_once(text, anchor, addition, "render.yaml")


update("render.yaml", fix_render)


def fix_opportunity_route(text: str) -> str:
    old = '''    if (source) {
      conditions.push(ilike(opportunitiesTable.providerName, source));
    }'''
    new = '''    if (source) {
      if (source === "publicPortalProviders") {
        conditions.push(
          or(
            ilike(opportunitiesTable.providerName, "publicPortalProviders"),
            ilike(opportunitiesTable.providerName, "statePortals"),
          )!,
        );
      } else {
        conditions.push(ilike(opportunitiesTable.providerName, source));
      }
    }'''
    return replace_once(text, old, new, "api-server/src/routes/opportunities.ts")


update("api-server/src/routes/opportunities.ts", fix_opportunity_route)


def fix_source_badges(text: str) -> str:
    pattern = re.compile(
        r'  const getSourceBadge = \(source: string \| null \| undefined, name: string \| null \| undefined\) => \{.*?\n  \};\n\n  const getOpportunityUrl',
        re.S,
    )
    replacement = '''  const getSourceBadge = (source: string | null | undefined, name: string | null | undefined) => {
    const rawName = name || source || "manual";
    const providerMeta: Record<string, { label: string; classes: string }> = {
      samGov: { label: "SAM.gov", classes: "bg-amber-500/10 text-amber-300 border-amber-500/20" },
      sam_gov: { label: "SAM.gov", classes: "bg-amber-500/10 text-amber-300 border-amber-500/20" },
      publicPortalProviders: { label: "U.S. Public Portals", classes: "bg-blue-500/10 text-blue-300 border-blue-500/20" },
      statePortals: { label: "U.S. Public Portals", classes: "bg-blue-500/10 text-blue-300 border-blue-500/20" },
      eunaBonfire: { label: "Euna Supplier Network", classes: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20" },
      internationalPublicPortals: { label: "International Portals", classes: "bg-violet-500/10 text-violet-300 border-violet-500/20" },
      serper: { label: "Serper", classes: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" },
      tavily: { label: "Tavily", classes: "bg-pink-500/10 text-pink-300 border-pink-500/20" },
      exa: { label: "Exa", classes: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20" },
      tango: { label: "Tango", classes: "bg-orange-500/10 text-orange-300 border-orange-500/20" },
      bidnet: { label: "BidNet", classes: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20" },
      csv_import: { label: "CSV Import", classes: "bg-white/5 text-muted-foreground border-white/10" },
      manual: { label: "Manual", classes: "bg-white/5 text-muted-foreground border-white/10" },
    };
    const meta = providerMeta[rawName] ?? {
      label: rawName.charAt(0).toUpperCase() + rawName.slice(1),
      classes: "bg-white/5 text-muted-foreground border-white/10",
    };
    return <Badge variant="outline" className={`font-normal ${meta.classes}`}>{meta.label}</Badge>;
  };

  const getOpportunityUrl'''
    changed, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        raise SystemExit("Could not replace getSourceBadge")
    return changed


update("intel-suite/src/pages/portal/opportunities.tsx", fix_source_badges)

print("Architecture cleanup details finalized.")
