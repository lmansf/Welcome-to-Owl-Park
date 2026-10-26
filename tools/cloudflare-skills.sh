#!/usr/bin/env bash
# Vendors the Cloudflare agent skills this repository uses into .claude/skills/ (project scope),
# the same layout `wrangler --install-skills` writes for Claude Code, so every agent session on
# this repo gets current Wrangler, Workers and Durable Objects guidance without a plugin install.
#
# Usage:  tools/cloudflare-skills.sh [path-to-a-clone-of-github.com/cloudflare/skills]
# Without an argument the script makes a fresh shallow clone (needs network access).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/.claude/skills"
REPO="https://github.com/cloudflare/skills"
# Add a name here to vendor another skill; see the upstream README for the full list.
SKILLS=(wrangler workers-best-practices durable-objects cf-cli workers-profiling web-perf)

SRC="${1:-}"
TMP=""
if [[ -z "$SRC" ]]; then
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  git clone --quiet --depth 1 "$REPO" "$TMP/skills"
  SRC="$TMP/skills"
fi
[[ -f "$SRC/LICENSE" && -d "$SRC/skills" ]] || { echo "not a cloudflare/skills checkout: $SRC" >&2; exit 1; }
SHA="$(git -C "$SRC" rev-parse HEAD)"
DATE="$(git -C "$SRC" log -1 --format=%cs)"

mkdir -p "$DEST"
for name in "${SKILLS[@]}"; do
  [[ -f "$SRC/skills/$name/SKILL.md" ]] || { echo "missing upstream skill: $name" >&2; exit 1; }
  rm -rf "${DEST:?}/$name"
  cp -R "$SRC/skills/$name" "$DEST/$name"
done
cp "$SRC/LICENSE" "$DEST/LICENSE.cloudflare-skills"

{
  echo "# Cloudflare agent skills (vendored)"
  echo
  echo "These folders are copied from $REPO (Apache-2.0, see LICENSE.cloudflare-skills),"
  echo "commit \`$SHA\` ($DATE). Claude Code loads them automatically for this repository; the"
  echo "Cloudflare MCP server they refer to is declared in the repository's \`.mcp.json\`."
  echo
  echo "Refresh them with \`tools/cloudflare-skills.sh\` (edit its SKILLS list to add one)."
  echo "Do not edit the skill folders by hand; changes are overwritten on the next refresh."
  echo "Other folders here (for example \`owl-park-elephant/\`, the project's EGM context loader) are"
  echo "the project's own; this script leaves them alone."
  echo
  for name in "${SKILLS[@]}"; do echo "- \`$name/\`"; done
} > "$DEST/README.md"

echo "vendored ${#SKILLS[@]} skills from $REPO@${SHA:0:12} into ${DEST#$ROOT/}"
