from pathlib import Path

script_path = Path("scripts/restore-ai-fetch.py")
source = script_path.read_text()
old = '''  ["ai_discovery", "aiDiscovery"],
  ["webIntelligence", "aiDiscovery"],
  ["public_portal_providers", "aiDiscovery"],'''
new = '''  ["ai_discovery", "aiDiscovery"],
  ["webIntelligence", "aiDiscovery"],
  ["publicPortalProviders", "aiDiscovery"],
  ["eunaBonfire", "aiDiscovery"],
  ["internationalPublicPortals", "aiDiscovery"],
  ["public_portal_providers", "aiDiscovery"],'''
if source.count(old) != 1:
    raise SystemExit("Unable to patch restoration aliases")
source = source.replace(old, new, 1)
source = source.replace(
    '    Path("scripts/restore-ai-fetch.py"),\n]:',
    '    Path("scripts/restore-ai-fetch.py"),\n    Path("scripts/restore-ai-fetch-v2.py"),\n]:',
    1,
)
exec(compile(source, str(script_path), "exec"))
