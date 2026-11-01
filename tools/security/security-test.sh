#!/usr/bin/env bash
# The park's security checks from the outside (OP-151): what a stranger's browser or script meets at
# the park's address. Each check matches what the Worker on main does, and names the file that does
# it; when the Worker changes, the check changes with it.
#
#   PARK_URL=https://<the park's address> tools/security/security-test.sh
#
# PARK_URL is the park's base address (an https address, or http://localhost:8787 for `pnpm dev:edge`).
# Nothing here names the park's host: the repository is public. Prints PASS, FAIL or SKIP per check,
# then a count; exits 1 on any FAIL, 2 when it cannot start.
#
# What a run costs the park, by design small (well under 50 requests, about 16): two page loads, the
# script bundle, one browser-style policy report (logged once as a csp_violation line that names
# https://example.invalid: expected, see docs/SECURITY.md), one guest pass (one page load's worth: it
# writes the owl's account row, apps/edge/src/accountBook.ts `stand`), and a dozen refused API calls
# that touch no Durable Object. Nothing is stored: the feedback calls are refused before any note is kept.
#
# RATE_CHECK=1 adds the rate-limit burst (up to RATE_MAX calls, default 70, one at a time, stopping at
# the first 429). It is off by default: the nightly run must not spend the free plan's daily requests.
#
# Testing the live park needs the owner's written authorisation (docs/SECURITY.md).
set -euo pipefail

if [ -z "${PARK_URL:-}" ]; then
  echo "security-test: set PARK_URL to the park's base address (https://..., or http://localhost:8787)." >&2
  exit 2
fi
case "$PARK_URL" in
  https://* | http://localhost* | http://127.0.0.1* | 'http://[::1]'*) ;;
  *)
    echo "security-test: PARK_URL must be an https address (or http on localhost)." >&2
    exit 2
    ;;
esac
command -v curl > /dev/null || { echo "security-test: curl is needed." >&2; exit 2; }

BASE="${PARK_URL%/}"
ORIGIN="$(printf '%s' "$BASE" | sed -E 's#^(https?://[^/]+).*#\1#')"
HOSTPORT="${ORIGIN#*://}"
HOSTNAME_ONLY="$(printf '%s' "$HOSTPORT" | sed -E 's#^\[([^]]*)\].*#[\1]#; s#^([^:[]*):.*#\1#')"
LOCAL=0
case "$HOSTNAME_ONLY" in localhost | 127.0.0.1 | '[::1]') LOCAL=1 ;; esac
SCHEME="${ORIGIN%%://*}"
WS_SCHEME=wss
[ "$SCHEME" = https ] || WS_SCHEME=ws
RATE_MAX="${RATE_MAX:-70}"
UA='owl-park-security-test (tools/security/security-test.sh)'

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

REQUESTS=0
PASSES=0
FAILS=0
SKIPS=0

pass() { printf 'PASS  %s\n' "$1"; PASSES=$((PASSES + 1)); }
fail() {
  printf 'FAIL  %s\n' "$1"
  if [ -n "${2:-}" ]; then printf '      %s\n' "$2"; fi
  FAILS=$((FAILS + 1))
}
skip() { printf 'SKIP  %s (%s)\n' "$1" "$2"; SKIPS=$((SKIPS + 1)); }

# fetch NAME URL [curl args...]: one request; the answer's status, headers and body land in $WORK/NAME.*.
# A failed connection is status 000, never an exit: every check still reports.
fetch() {
  local name="$1" url="$2"
  shift 2
  REQUESTS=$((REQUESTS + 1))
  : > "$WORK/$name.head"
  : > "$WORK/$name.body"
  if ! curl -sS --max-time 30 -A "$UA" -o "$WORK/$name.body" -D "$WORK/$name.head" -w '%{http_code}' "$@" "$url" > "$WORK/$name.code" 2> "$WORK/$name.err"; then
    echo 000 > "$WORK/$name.code"
  fi
}
code() { cat "$WORK/$1.code"; }
body() { cat "$WORK/$1.body"; }
# header NAME Header-Name: the header's value (the last one given), without its line ending.
header() {
  local want
  want="$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')"
  tr -d '\r' < "$WORK/$1.head" | awk -v want="$want" '
    { i = index($0, ":"); if (i > 0 && tolower(substr($0, 1, i - 1)) == want) { v = substr($0, i + 1); sub(/^[ \t]+/, "", v); found = v } }
    END { printf "%s", found }'
}
# A short account of an answer for a FAIL line: its status and the start of its body.
seen() { printf 'status %s, body: %s' "$(code "$1")" "$(head -c 160 "$WORK/$1.body" | tr -d '\r\n')"; }

# Bodies of the refusals checked together at the end: short codes only.
ERROR_ANSWERS=''
# Every /api/* answer whose Cache-Control is checked at the end.
API_ANSWERS=''

echo "Owl Park security checks against $ORIGIN"
echo

# ---- The page: its headers (apps/edge/src/guard.ts `guardedPage`, `finished`; apps/edge/src/page.ts) ----

fetch page1 "$BASE/"
fetch page2 "$BASE/"
if [ "$(code page1)" = 200 ] && header page1 Content-Type | grep -qi 'text/html'; then
  pass 'the page answers 200 with HTML'
else
  fail 'the page answers 200 with HTML' "$(seen page1)"
fi

# guard.ts `parkPolicy` and `newNonce`: script-src is 'self' and a fresh 128-bit nonce in hex, nothing else.
CSP1="$(header page1 Content-Security-Policy)"
CSP2="$(header page2 Content-Security-Policy)"
NONCE1="$(printf '%s' "$CSP1" | sed -nE "s/.*script-src 'self' 'nonce-([0-9a-f]{32})'(;.*)?$/\1/p")"
NONCE2="$(printf '%s' "$CSP2" | sed -nE "s/.*script-src 'self' 'nonce-([0-9a-f]{32})'(;.*)?$/\1/p")"
csp_missing=''
for d in "default-src 'self'" "script-src 'self' 'nonce-$NONCE1'" "style-src 'self' 'unsafe-inline'" "img-src 'self' data: blob:" \
  "object-src 'none'" "base-uri 'none'" "form-action 'self'" "frame-ancestors 'none'" \
  'report-uri /api/csp-report'; do
  printf '%s;' "$CSP1" | grep -qF "$d;" || csp_missing="$csp_missing [$d]"
done
# connect-src names the host the Worker was asked at; `wrangler dev` asks it as localhost:8787
# (wrangler.jsonc dev.host), so on this machine any local host is taken.
if [ "$LOCAL" = 1 ]; then
  printf '%s;' "$CSP1" | grep -qE "connect-src 'self' ws://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?;" || csp_missing="$csp_missing [connect-src 'self' ws://<this machine>]"
else
  printf '%s;' "$CSP1" | grep -qF "connect-src 'self' $WS_SCHEME://$HOSTPORT;" || csp_missing="$csp_missing [connect-src 'self' $WS_SCHEME://$HOSTPORT]"
fi
if [ -n "$NONCE1" ] && [ -z "$csp_missing" ] && ! printf '%s' "$CSP1" | grep -q 'unsafe-eval'; then
  pass 'Content-Security-Policy: own scripts and a nonce only, own host to talk to, no framing, no plugins, no base'
else
  fail 'Content-Security-Policy: own scripts and a nonce only, own host to talk to, no framing, no plugins, no base' "policy: ${CSP1:-<none>}; missing:${csp_missing:- the nonce}"
fi

# guard.ts `guardedPage`: a new nonce on every load.
if [ -n "$NONCE1" ] && [ -n "$NONCE2" ] && [ "$NONCE1" != "$NONCE2" ]; then
  pass 'the policy nonce changes with every load'
else
  fail 'the policy nonce changes with every load' "first: ${NONCE1:-<none>}, second: ${NONCE2:-<none>}"
fi

# guard.ts `withNonce`: every script tag on the page carries the header's nonce (the two inline ones and the bundle's).
scripts="$({ grep -oiE '<script[ >]' "$WORK/page1.body" || true; } | wc -l | tr -d ' ')"
nonced="$({ grep -oE "<script nonce=\"$NONCE1\"" "$WORK/page1.body" || true; } | wc -l | tr -d ' ')"
if [ -n "$NONCE1" ] && [ "$scripts" -gt 0 ] && [ "$scripts" = "$nonced" ]; then
  pass "every script tag on the page carries the policy's nonce ($scripts)"
else
  fail "every script tag on the page carries the policy's nonce" "$scripts script tags, $nonced with the nonce"
fi

# guard.ts `guardedPage`.
v="$(header page1 X-Frame-Options)"
if [ "$v" = DENY ]; then pass 'X-Frame-Options: DENY'; else fail 'X-Frame-Options: DENY' "got: ${v:-<none>}"; fi
v="$(header page1 Referrer-Policy)"
if [ "$v" = strict-origin-when-cross-origin ]; then pass 'Referrer-Policy: strict-origin-when-cross-origin'; else fail 'Referrer-Policy: strict-origin-when-cross-origin' "got: ${v:-<none>}"; fi

# guard.ts `finished`: nosniff on every answer.
v="$(header page1 X-Content-Type-Options)"
if [ "$v" = nosniff ]; then pass 'X-Content-Type-Options: nosniff'; else fail 'X-Content-Type-Options: nosniff' "got: ${v:-<none>}"; fi

# guard.ts `HSTS` and `finished`: a year, this hostname only (no includeSubDomains, no preload), https only.
v="$(header page1 Strict-Transport-Security)"
if [ "$LOCAL" = 1 ]; then
  if [ -z "$v" ]; then pass 'no Strict-Transport-Security over http on this machine'; else fail 'no Strict-Transport-Security over http on this machine' "got: $v"; fi
elif [ "$v" = 'max-age=31536000' ]; then
  pass 'Strict-Transport-Security: max-age=31536000 (no subdomains, no preload)'
else
  fail 'Strict-Transport-Security: max-age=31536000 (no subdomains, no preload)' "got: ${v:-<none>}"
fi

# page.ts `uncachedPage` and guard.ts `guardedPage`: the page is never kept, and has no ETag.
v="$(header page1 Cache-Control)"
etag="$(header page1 ETag)"
if [ "$v" = no-store ] && [ -z "$etag" ]; then pass 'the page: Cache-Control no-store, no ETag'; else fail 'the page: Cache-Control no-store, no ETag' "Cache-Control: ${v:-<none>}, ETag: ${etag:-<none>}"; fi

# guard.ts `frontDoor`: the page asked for over http is sent to https (301); the edge's own
# "Always Use HTTPS" would answer the same way before the Worker, so a 308 is taken too.
if [ "$LOCAL" = 1 ]; then
  skip 'the page over http is sent to https' 'http is allowed on this machine'
else
  fetch plain "http://$HOSTPORT/"
  loc="$(header plain Location)"
  case "$(code plain)" in
    301 | 308) case "$loc" in "https://$HOSTPORT/"*) pass 'the page over http is sent to https' ;; *) fail 'the page over http is sent to https' "Location: ${loc:-<none>}" ;; esac ;;
    *) fail 'the page over http is sent to https' "$(seen plain)" ;;
  esac
fi

# ---- The policy's report endpoint (index.ts, CSP_REPORT_PATH; guard.ts `violationOf`, REPORT_BODY_MAX) ----

report="{\"csp-report\":{\"document-uri\":\"$ORIGIN/\",\"effective-directive\":\"script-src-elem\",\"blocked-uri\":\"https://example.invalid/security-test.js\"}}"
fetch report "$BASE/api/csp-report" -X POST -H 'Content-Type: application/csp-report' --data-binary "$report"
if [ "$(code report)" = 204 ]; then pass 'a browser policy report is taken: 204'; else fail 'a browser policy report is taken: 204' "$(seen report)"; fi

# A report past REPORT_BODY_MAX (8,192 bytes) is refused unread: 413.
{ printf '{"csp-report":{"x":"'; head -c 9216 /dev/zero | tr '\0' a; printf '"}}'; } > "$WORK/report-big.json"
fetch reportbig "$BASE/api/csp-report" -X POST -H 'Content-Type: application/csp-report' --data-binary "@$WORK/report-big.json"
if [ "$(code reportbig)" = 413 ]; then pass 'a 9 kB policy report is refused: 413'; else fail 'a 9 kB policy report is refused: 413' "$(seen reportbig)"; fi
ERROR_ANSWERS="$ERROR_ANSWERS reportbig"
API_ANSWERS="$API_ANSWERS reportbig"

# ---- The script bundle, named in the page (Vite's build; apps/park/public/_headers) ----

BUNDLE="$(grep -oE 'src="/assets/[^"]+\.js"' "$WORK/page1.body" | head -n 1 | sed -E 's/^src="//; s/"$//' || true)"
if [ -z "$BUNDLE" ]; then
  fail 'the script bundle named in the page answers 200 as JavaScript, nosniff' 'the page names no /assets/*.js script'
else
  fetch bundle "$ORIGIN$BUNDLE"
  ct="$(header bundle Content-Type)"
  ns="$(header bundle X-Content-Type-Options)"
  if [ "$(code bundle)" = 200 ] && printf '%s' "$ct" | grep -qi javascript && [ "$ns" = nosniff ]; then
    pass "the script bundle named in the page answers 200 as JavaScript, nosniff ($BUNDLE)"
  else
    fail 'the script bundle named in the page answers 200 as JavaScript, nosniff' "$BUNDLE: status $(code bundle), Content-Type ${ct:-<none>}, X-Content-Type-Options ${ns:-<none>}"
  fi
fi

# ---- Refused without a pass (index.ts: the tickets and Realm Vote routes check the pass first) ----

fetch scan "$BASE/api/tickets/scan" -X POST -H 'Content-Type: application/json' --data-binary '{}'
if [ "$(code scan)" = 401 ] && [ "$(body scan)" = '{"error":"bad-pass"}' ]; then pass '/api/tickets/scan without a pass: 401 {"error":"bad-pass"}'; else fail '/api/tickets/scan without a pass: 401 {"error":"bad-pass"}' "$(seen scan)"; fi

fetch vote "$BASE/api/vote" -X POST -H 'Content-Type: application/json' --data-binary '{"realm":"hub"}'
if [ "$(code vote)" = 401 ] && [ "$(body vote)" = '{"error":"bad-pass"}' ]; then pass '/api/vote without a pass: 401 {"error":"bad-pass"}'; else fail '/api/vote without a pass: 401 {"error":"bad-pass"}' "$(seen vote)"; fi
ERROR_ANSWERS="$ERROR_ANSWERS scan vote"
API_ANSWERS="$API_ANSWERS scan vote"

# index.ts `isAdmin` is asked only on the keepers' routes (/api/admin/*, /api/vote/tally, /api/vote/close):
# a key sent anywhere else changes nothing. A made-up key, so nothing here is the keepers' own.
fakekey="security-test-$(date +%s)-not-a-key"
fetch scankey "$BASE/api/tickets/scan" -X POST -H 'Content-Type: application/json' -H "X-Admin-Key: $fakekey" --data-binary '{}'
if [ "$(code scankey)" = 401 ] && [ "$(body scankey)" = '{"error":"bad-pass"}' ]; then pass 'X-Admin-Key on a visitor route opens nothing: /api/tickets/scan still 401'; else fail 'X-Admin-Key on a visitor route opens nothing: /api/tickets/scan still 401' "$(seen scankey)"; fi
ERROR_ANSWERS="$ERROR_ANSWERS scankey"
API_ANSWERS="$API_ANSWERS scankey"

# ---- Another site's page (guard.ts `frontDoor`, `originAllowed`, `finished`) ----

fetch xorigin "$BASE/api/pass" -H 'Origin: https://example.invalid'
xacao="$(header xorigin Access-Control-Allow-Origin)"
if [ "$(code xorigin)" = 403 ] && [ "$(body xorigin)" = '{"error":"origin"}' ] && [ -z "$xacao" ]; then
  pass 'a call from another site (Origin https://example.invalid): 403 {"error":"origin"}, no Access-Control-Allow-Origin'
else
  fail 'a call from another site (Origin https://example.invalid): 403 {"error":"origin"}, no Access-Control-Allow-Origin' "$(seen xorigin); Access-Control-Allow-Origin: ${xacao:-<none>}"
fi

fetch xpre "$BASE/api/feedback" -X OPTIONS -H 'Origin: https://example.invalid' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type, authorization'
xacao="$(header xpre Access-Control-Allow-Origin)"
if [ "$(code xpre)" = 403 ] && [ -z "$xacao" ]; then
  pass "another site's preflight: 403, no Access-Control-Allow-Origin"
else
  fail "another site's preflight: 403, no Access-Control-Allow-Origin" "$(seen xpre); Access-Control-Allow-Origin: ${xacao:-<none>}"
fi
ERROR_ANSWERS="$ERROR_ANSWERS xorigin xpre"
API_ANSWERS="$API_ANSWERS xorigin xpre"

# ---- The park's own page: CORS by name (index.ts `CORS`; guard.ts `finished`) ----
# The list is one constant for every route, the keepers' X-Admin-Key included (docs/SECURITY.md).

ALLOW_HEADERS='Content-Type, Authorization, X-Admin-Key, X-Collector, X-Keeper-Token'
ALLOW_METHODS='GET, POST, OPTIONS'
fetch ownpre "$BASE/api/feedback" -X OPTIONS -H "Origin: $ORIGIN" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type, authorization'
acao="$(header ownpre Access-Control-Allow-Origin)"
ah="$(header ownpre Access-Control-Allow-Headers)"
am="$(header ownpre Access-Control-Allow-Methods)"
vary="$(header ownpre Vary)"
if [ "$(code ownpre)" = 200 ] && [ "$acao" = "$ORIGIN" ] && printf '%s' "$vary" | grep -qi origin; then
  pass "the park's own page is granted by name, never *: Access-Control-Allow-Origin $ORIGIN, Vary Origin"
else
  fail "the park's own page is granted by name, never *" "$(seen ownpre); Access-Control-Allow-Origin: ${acao:-<none>}; Vary: ${vary:-<none>}"
fi
if [ "$ah" = "$ALLOW_HEADERS" ] && [ "$am" = "$ALLOW_METHODS" ]; then
  pass "the CORS lists match index.ts: headers [$ALLOW_HEADERS], methods [$ALLOW_METHODS]"
else
  fail 'the CORS lists match index.ts' "Allow-Headers: ${ah:-<none>}; Allow-Methods: ${am:-<none>}"
fi
API_ANSWERS="$API_ANSWERS ownpre"

# ---- Body limits on /api/feedback (index.ts FEEDBACK_BODY_MAX, 16,384 bytes) ----
# The pass is checked before the body, so without one both answers are 401; one guest pass reaches
# the limit (index.ts /api/pass). Neither body is a note: nothing is kept (parseFeedback refuses it).

fetch guest "$BASE/api/pass"
TOKEN="$(sed -nE 's/.*"pass":"([^"]+)".*/\1/p' "$WORK/guest.body" | head -n 1 || true)"
API_ANSWERS="$API_ANSWERS guest"
if [ "$(code guest)" != 200 ] || [ -z "$TOKEN" ]; then
  fail 'a guest pass is issued (needed for the feedback limits)' "status $(code guest)"
  fail 'a 10 kB feedback body: 400 {"error":"bad request"}' 'no pass to send it with'
  fail 'a 2 MB feedback body: 413 {"error":"too large"}' 'no pass to send it with'
else
  { printf '["'; head -c 10240 /dev/zero | tr '\0' a; printf '"]'; } > "$WORK/fb-10k.json"
  { printf '["'; head -c 2097152 /dev/zero | tr '\0' a; printf '"]'; } > "$WORK/fb-2m.json"
  fetch fb10k "$BASE/api/feedback" -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" --data-binary "@$WORK/fb-10k.json"
  if [ "$(code fb10k)" = 400 ] && [ "$(body fb10k)" = '{"error":"bad request"}' ]; then
    pass 'a 10 kB feedback body (under the limit, not a note): 400 {"error":"bad request"}'
  else
    fail 'a 10 kB feedback body (under the limit, not a note): 400 {"error":"bad request"}' "$(seen fb10k)"
  fi
  fetch fb2m "$BASE/api/feedback" -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" --data-binary "@$WORK/fb-2m.json"
  if [ "$(code fb2m)" = 413 ] && [ "$(body fb2m)" = '{"error":"too large"}' ]; then
    pass 'a 2 MB feedback body: 413 {"error":"too large"}, refused unread'
  else
    fail 'a 2 MB feedback body: 413 {"error":"too large"}, refused unread' "$(seen fb2m)"
  fi
  for n in fb10k fb2m; do case "$(code "$n")" in 5*) fail "the $n answer is never a 5xx" "$(seen "$n")" ;; esac; done
  ERROR_ANSWERS="$ERROR_ANSWERS fb10k fb2m"
  API_ANSWERS="$API_ANSWERS fb10k fb2m"
fi

# ---- An API path the Worker does not have (index.ts falls through to the static files: 404) ----

fetch unknown "$BASE/api/security-test-no-such-route"
if [ "$(code unknown)" = 404 ]; then pass 'an unknown /api/ path: 404'; else fail 'an unknown /api/ path: 404' "$(seen unknown)"; fi

# ---- Every refusal is a short code: no stack, no file path (index.ts `json`; guard.ts `refusal`) ----

bad=''
for n in $ERROR_ANSWERS unknown; do
  b="$(body "$n")"
  [ -z "$b" ] && [ "$n" = unknown ] && continue
  if ! printf '%s' "$b" | grep -qE '^\{"error":"[a-z][a-z -]{0,30}"\}$'; then bad="$bad $n"; continue; fi
  if printf '%s' "$b" | grep -qiE '\.(ts|js|mjs)\b|/src/|node_modules|file://|[[:space:]]at [^ ]+ \(|stack|Error:'; then bad="$bad $n"; fi
done
if [ -z "$bad" ]; then
  pass 'every refusal body is a short code, with no stack trace or file path'
else
  fail 'every refusal body is a short code, with no stack trace or file path' "not short codes:$bad ($(for n in $bad; do printf '%s=%s ' "$n" "$(head -c 80 "$WORK/$n.body" | tr -d '\r\n')"; done))"
fi

# ---- No API answer may be kept (index.ts `CORS` carries Cache-Control: no-store; guard.ts `refusal` too) ----
# Not asked of /api/csp-report's 204 (no body, and the code sets no Cache-Control on it) or of the
# unknown path's 404 (the static files answer it): see docs/SECURITY.md.

bad=''
for n in $API_ANSWERS; do
  [ "$(header "$n" Cache-Control)" = no-store ] || bad="$bad $n($(header "$n" Cache-Control))"
done
if [ -z "$bad" ]; then pass "Cache-Control: no-store on every /api/ answer asked ($(printf '%s' "$API_ANSWERS" | wc -w | tr -d ' '))"; else fail 'Cache-Control: no-store on every /api/ answer asked' "without it:$bad"; fi

# ---- No database address or key in anything the park sent (OP-150; tools/security/bundle-check.mjs) ----

bad=''
for f in "$WORK"/*.body "$WORK"/*.head; do
  [ -e "$f" ] || continue
  if grep -qiE 'supabase|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|sb_(publishable|secret)_[A-Za-z0-9_-]{10,}' "$f"; then
    bad="$bad $(basename "$f")"
  fi
done
if [ "$(code page1)" != 200 ]; then
  skip 'no database address or key in any page, bundle, header or answer' 'the page did not answer'
elif [ -z "$bad" ]; then pass 'no database address or key in any page, bundle, header or answer'; else fail 'no database address or key in any page, bundle, header or answer' "found in:$bad (the text is not printed)"; fi

# ---- Rate limits (apps/edge/src/limits.ts, OP-142): opt in with RATE_CHECK=1 ----
# /api/vote without a pass counts against API_LIMITS.refused: 60 a minute per address, then 429 with
# Retry-After. The counts live in each copy of the Worker's memory, so a burst that lands on several
# copies may see no 429: a FAIL here is worth one re-run before it is a finding.

if [ "${RATE_CHECK:-0}" = 1 ]; then
  got=''
  i=0
  while [ "$i" -lt "$RATE_MAX" ]; do
    i=$((i + 1))
    fetch burst "$BASE/api/vote" -X POST -H 'Content-Type: application/json' --data-binary '{}'
    if [ "$(code burst)" = 429 ]; then got="$i"; break; fi
    case "$(code burst)" in 401) ;; *) break ;; esac
  done
  retry="$(header burst Retry-After)"
  if [ -n "$got" ] && [ -n "$retry" ] && [ "$(body burst)" = '{"error":"too-many"}' ]; then
    pass "a burst on /api/vote is stopped: 429 {\"error\":\"too-many\"} with Retry-After $retry, at call $got"
  else
    fail "a burst on /api/vote is stopped with 429 within $RATE_MAX calls" "last after $i calls: $(seen burst)"
  fi
else
  skip 'rate limit burst on /api/vote' 'set RATE_CHECK=1 to run it'
fi

echo
echo "$PASSES passed, $FAILS failed, $SKIPS skipped; $REQUESTS requests."
[ "$FAILS" = 0 ]
