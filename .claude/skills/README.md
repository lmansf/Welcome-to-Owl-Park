# Cloudflare agent skills (vendored)

These folders are copied from https://github.com/cloudflare/skills (Apache-2.0, see LICENSE.cloudflare-skills),
commit `86505e44f87d801aa1864a3c4109e9a8ae5c409f` (2026-10-15). Claude Code loads them automatically for this repository; the
Cloudflare MCP server they refer to is declared in the repository's `.mcp.json`.

Refresh them with `tools/cloudflare-skills.sh` (edit its SKILLS list to add one).
Do not edit the skill folders by hand; changes are overwritten on the next refresh.
Other folders here (for example `owl-park-elephant/`, the project's EGM context loader) are
the project's own; this script leaves them alone.

- `wrangler/`
- `workers-best-practices/`
- `durable-objects/`
- `cf-cli/`
- `workers-profiling/`
- `web-perf/`
