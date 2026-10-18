# Art generator (stage 1 of the art pipeline)

`generate.mjs` turns the job list in `prompts.mjs` into raw image candidates from an image
model, caches them, and keeps a provenance log. A second stage (`post.py`, Python + Pillow) turns
a chosen candidate into the files `apps/park/src/game/art.ts` loads. Nothing here touches git or
`apps/park/public/art/`; the raw output lives in the gitignored `work/art/`.

Requirements: Node 22.18 or newer for the generator (built-ins only, no install step;
`pnpm art:geometry` imports the TypeScript room data and relies on Node's type stripping, which
is on by default from 22.18 and passed explicitly by the script), and Python 3.11 or newer with
Pillow 12 and numpy for the finish stage (`python3 -m pip install pillow numpy`; a venv is fine).

## Running it

```bash
pnpm art:generate --dry-run                          # every request, redacted, no calls (mock provider)
pnpm art:generate                                    # mock provider: synthetic PNGs, offline, free
pnpm art:geometry                                    # work/art/geometry.json for the post stage's layout guides

ARK_API_KEY=... pnpm art:generate --provider ark --only tree-master --variants 6 --dry-run
ARK_API_KEY=... pnpm art:generate --provider ark --only tree-master --variants 6 --max-spend 1
FAL_KEY=...     pnpm art:generate --provider fal --only hub --variants 4

node tools/art/generate.mjs list hub                 # candidates: hash, seed, size, bytes, selected
node tools/art/generate.mjs select hub <hash16|latest>   # marks the winner for the post stage (SELECTED)
node tools/art/generate.mjs cost --provider ark      # what a run would cost before running it
```

Providers:

- `mock` (default): no network. Draws deterministic PNGs per job kind with a flat key-colour
  backdrop for keyed assets, so the whole chain, including the post stage, runs in a sandbox and
  in tests. Identical request, identical bytes.
- `ark`: BytePlus ModelArk (international) or Volcengine Ark (China) images API, Seedream models.
  Needs `ARK_API_KEY`.
- `fal`: fal.ai queue API for the same models. Needs `FAL_KEY`.

Cost: a few cents per image (defaults assume $0.03; edit `DEFAULTS.prices` in `prompts.mjs`).
The whole default job list is 36 images, so a full real run is about a dollar; `--max-spend`
(default $5) refuses to start a run that would cost more, and the cache means reruns cost nothing.
Start a provider with one cheap job and `--variants 1`; the API field names below are documented
defaults, not verified facts, so check the first response.

Secrets come from the environment only and are never printed or written. You may keep them in
`tools/art/.local/.env` (gitignored) and `source` it in your shell; the tool never reads it.

## Flags

| Flag | Meaning |
| --- | --- |
| `--provider mock\|ark\|fal` | default `ART_PROVIDER`, else `mock` |
| `--only k1,k2` | job keys to run; globs allowed (`owl-*`, `*-fg`) |
| `--variants N` | seeds `seed .. seed+N-1` for each job, overriding the job's own count |
| `--seed S` | override every job's base seed |
| `--dry-run` | print each request (secrets as `***`), the cache path, hit/miss and cost; make no calls; exit 0 |
| `--out <dir>` (alias `--work`) | work directory, default `ART_WORK_DIR` or `work/art` |
| `--now <ISO-8601>` | the timestamp written into sidecars and the log (default `ART_NOW`, else the clock) |
| `--concurrency N` | parallel requests, default 2 |
| `--fail-fast` | stop after the first failed job |
| `--force` | ignore the cache and regenerate |
| `--max-spend <usd>` | refuse to start when the uncached jobs would cost more (default 5) |
| `--require-refs` | treat every reference slot as required |
| `--prompts <file.mjs>` | an alternative job list |

Exit code 1 when any job failed or the list is invalid, 2 for usage errors.

## Environment

Resolution order: flag, then environment, then `DEFAULTS` in `prompts.mjs`, then built-in.

| Variable | Default | Notes |
| --- | --- | --- |
| `ART_PROVIDER` | `mock` | |
| `ART_WORK_DIR` | `work/art` | |
| `ART_NOW` | clock | sidecars record `now_source: flag\|env\|clock` |
| `ART_HTTP_RETRIES` | `5` | network errors, 408, 425, 429, 5xx; 1 s × 2ⁿ ±20 %, `Retry-After` honoured |
| `ART_HTTP_TIMEOUT_MS` | `120000` | per request |
| `ART_CONCURRENCY` | `2` | |
| `ART_MAX_SPEND` | `5` | USD |
| `OWL_PARK_FORBIDDEN`, `ART_FORBIDDEN_WORDS` | unset | comma-separated private word list (see below) |
| `ART_FORBIDDEN_WORDS_FILE` | `tools/art/.local/forbidden-words.txt` | one entry per line, `#` comments |
| `ARK_API_KEY` | unset | required for `ark` |
| `ARK_BASE_URL` | `https://ark.ap-southeast.bytepluses.com` | Volcengine: `https://ark.cn-beijing.volces.com` |
| `ARK_IMAGES_PATH` | `/api/v3/images/generations` | |
| `SEEDREAM_MODEL` | `seedream-4-0-250828` | Volcengine `doubao-seedream-4-0-250828`; 4.5 ids differ |
| `ARK_RESPONSE_FORMAT` | `url` | or `b64_json` |
| `ARK_SIZE_MODE` | `wxh` | `preset` sends `1K`/`2K`/`4K` by the larger side, or `ARK_SIZE_PRESET` |
| `ARK_REF_MODE` | `data` | `url` requires `https://` refs you host |
| `ARK_IMAGE_FIELD` | `image` | reference-image field (array) |
| `ARK_WATERMARK` | `false` | |
| `ARK_SEQUENTIAL` | `disabled` | `sequential_image_generation` |
| `ARK_NEGATIVE_FIELD` | unset | when set, `NEGATIVE_PROMPT` is sent in that field |
| `ARK_EXTRA_JSON` | `{}` | merged into the body last, e.g. `{"output_format":"png"}` |
| `FAL_KEY` | unset | required for `fal` |
| `FAL_ENDPOINT` | `https://queue.fal.run/fal-ai/bytedance/seedream/v4/text-to-image` | |
| `FAL_EDIT_ENDPOINT` | `https://queue.fal.run/fal-ai/bytedance/seedream/v4/edit` | used when a job has references |
| `FAL_REF_FIELD` | `image_urls` | |
| `FAL_REF_MODE` | `data` | as for ARK |
| `FAL_POLL_MS` | `2000` | status polling interval |
| `FAL_TIMEOUT_MS` | `300000` | queue wait limit |
| `FAL_SAFETY` | `true` | `enable_safety_checker` |
| `FAL_NEGATIVE_FIELD` | unset | as for ARK |
| `FAL_EXTRA_JSON` | `{}` | merged into the body last |

Per-job overrides for one provider go under `providers: { ark: {...}, fal: {...} }` in the job
and are merged before `*_EXTRA_JSON`.

The numeric variables (`ART_HTTP_RETRIES`, `ART_HTTP_TIMEOUT_MS`, `ART_CONCURRENCY`,
`FAL_POLL_MS`, `FAL_TIMEOUT_MS`: non-negative integers; `ART_MAX_SPEND`: a non-negative number)
are validated exactly like the flags: anything else is a usage error (exit 2) naming the variable.

## The job list (`prompts.mjs`)

Everything the art director edits is in one data file: the hub brief, the three realm `STYLE`
blocks, the `PROMPTS` (one per key), the `NEGATIVE_PROMPT`, and `JOBS` with kind, realm,
generation size, base seed, variant count, key colour, owl region colours and reference slots.
Keys are validated against `config/assets.json` (mirrored from `art.ts`, guarded by a test) plus
the helper keys `tree-master`, `owl-master` and `owl-blink-src`.

Reference slots (`refs`) point at `refs/<file>` (committed anchors in `tools/art/refs/`, 1024 px
and 200 KB at most, chosen by the art director), `@guide:<room>` (the post stage's layout guide),
`@final:<key>` (a published PNG) or `@raw:<key>` (another job's SELECTED candidate). Slots marked
`optional` are skipped with a notice until the file exists, which is why the first runs work
before any anchor is chosen; a job marked `optional` (the blink edit) is skipped when its required
reference is missing. References travel as data URLs by default (2 MB each at most, 14 per
request) or as hosted URLs with `*_REF_MODE=url`.

The intended order: `tree-master` first (pick a winner, save it as `refs/tree-master.png`), then
the rooms, then `pnpm art:geometry` and the post stage's guides, publish a room, then its overlay
and set piece with the published room as a style reference, then `owl-master`, `select` it, then
`owl-blink-src`.

## Output contract (read by the post stage)

```
work/art/raw/<key>/<hash16>.png|jpg   the raw candidate
work/art/raw/<key>/<hash16>.json      its sidecar
work/art/raw/<key>/SELECTED           the hash16 of the chosen candidate (written by `select`)
work/art/log.jsonl                    one line per attempt (ok | cached | failed)
work/art/geometry.json                rooms, doors, spawns, anchors, closed signs, assets table
```

`hash16` is the first 16 hex digits of `sha256(provider + "\n" + model + "\n" + canonical JSON of
the request body)` with every reference replaced by `sha256:<hex of its bytes>`, so the same
request from any machine lands on the same file, and a job whose sidecar exists is a cache hit.

Sidecar fields: `schema`, `key`, `kind`, `realm`, `provider`, `model`, `hash16`, `prompt_sha256`,
`seed`, `seed_returned`, `size`, `width`, `height`, `format`, `key_colour`, `refs` (`ref`,
`sha256`), `source_url` (the provider's result URL with its query string and fragment removed:
presigned URLs carry credentials and signatures there, and the sidecar ends up in the committed
provenance file), `generated_at`, `now_source`, `cost_estimate_usd`, `provider_meta` (size,
usage, request_id only); owl jobs add `regions` (the flat fills of body, belly and accent) and
`derives` (the five layer keys). No prompt text is stored, only its hash.

Log lines carry only `ts, key, provider, model, prompt_sha256, seed, size, hash16, status,
source_url, error, human_edits`; the free-text fields (`error`, `human_edits`) are scrubbed of
the user name, home directory and host name (the fixed fields such as `key` are left alone, so a
login such as `owl` cannot corrupt `robot-owl`), absolute paths are rejected in every field, and
`--dry-run` writes nothing.

## The private forbidden-word list

This repository is public, so the list of words that must never appear (internal realm names,
people, employers, other games) is private too. Put it in `tools/art/.local/forbidden-words.txt`
(gitignored), or pass `OWL_PARK_FORBIDDEN="a,b"` / `ART_FORBIDDEN_WORDS_FILE=...`. Entries match
case-insensitively as substrings; prefix one with `=` for whole-word matching. With a list
configured the job list, the blocks and every log line are checked and a match stops the run;
matches are printed to stderr only. Without a list the check is a no-op and says so.

## Tests

```bash
node --test "tools/art/**/*.test.mjs"    # or: pnpm art:test
```

Covers the PNG encoder (header and pixels parsed back), the mock provider (deterministic, keyed
borders, requested size), the job list (every generated key in `art.ts` has a job, `assets.json`
matches `art.ts`, prompts are the approved defaults), the cache key, both HTTP providers against a
stubbed `fetch` (request shapes, b64/url responses, queue polling, retry and backoff), the CLI
(`--dry-run` redaction, `--max-spend`, variants, `select`, `geometry` and its Node-version
guard, the validation of numeric environment settings), the stripping of presigned result URLs,
the mock overlay's empty lower half, and the forbidden-word check and log writer.
