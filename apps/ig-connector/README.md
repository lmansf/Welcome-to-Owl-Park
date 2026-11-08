# Instagram connector (OP-168)

A small MCP server, run as its own Cloudflare Worker, that claude.ai uses as a custom connector to
publish approved reels to the park's Instagram account and to read Insights. It talks only to
Instagram's official API (Instagram API with Instagram Login, `graph.instagram.com`); it scrapes
nothing. The API version is one constant, `GRAPH_VERSION` in `src/graph.ts` (now `v23.0`).

## Tools

| Tool | What it does |
| --- | --- |
| `prepare_reel(video_url, caption, cover_url?)` | Checks the reel (https URLs only, caption up to 2,200 characters and 30 hashtags) and returns a plain summary of exactly what would post plus an `approval_id`. Posts nothing, calls nothing at Instagram. |
| `publish_reel(approval_id, container_id?)` | The only write. Refuses, sending nothing, when the `approval_id` is missing, malformed, altered or expired, or when one of the 10 newest posts already has the identical caption. Otherwise creates the reel container, waits for Instagram to process it (up to about 40 s), publishes it and returns the media id and permalink. If Instagram is still processing, it returns `{"state":"processing","container_id":...}`: call again with the same `approval_id` and that `container_id`. |
| `list_recent_media(limit?)` | The newest posts (10 by default, at most 50). |
| `get_media_insights(media_id, metrics?)` | Insights for one post. Default metrics for reels: views, reach, saved, shares, comments, likes, total_interactions. |
| `get_account_insights(metrics?, period?, metric_type?, since?, until?, breakdown?)` | Account Insights, passed through with validation. A follower vs non-follower split (`breakdown: "follow_type"`) is whatever Instagram returns for that metric; nothing more is promised. |

## The guardrail

Posting is two steps. `prepare_reel` shows exactly what would post; `publish_reel` posts only with
the `approval_id` it returned. The `approval_id` is a stateless signed token (HMAC-SHA256 with
`APPROVAL_KEY` over the video URL, caption, cover URL and an expiry 24 hours out), so it cannot be
altered to post something else. By standing rule, every reel still needs Logan's explicit yes in
chat before `publish_reel` is called, and the tool's description says so to Claude.

## How claude.ai reaches it, and the risk

claude.ai custom connectors without OAuth reach a server by its URL alone, so the secret path segment
is the authentication: the endpoint is `https://<worker>.workers.dev/mcp/<CONNECTOR_KEY>`, and any
other path or key is a bare 404. Anyone who has that URL can call every tool: read the posts and
Insights, and, since `prepare_reel` is on the same URL, prepare and then publish a reel. The approval
token keeps Claude from posting anything Logan has not seen; it does not protect against someone
holding the URL. Treat the URL like a password, and if it leaks, set a new `CONNECTOR_KEY` (and update
the connector in claude.ai). The Worker's request logs are switched off because they would record the
URL; the code logs nothing, and no answer or error carries the access token.

## Setup (Logan)

1. In the Instagram app, switch the account to a Professional account (Creator or Business):
   Settings, Account type and tools, Switch to professional account.
2. At developers.facebook.com, create an app with the Instagram use case and set up the
   **Instagram API with Instagram Login**. Add the permissions `instagram_business_basic`,
   `instagram_business_content_publish` and `instagram_business_manage_insights`. Leave the app in
   development mode: it is for this one account only, so no App Review is needed. Add the account
   under the app's Instagram testers (or "Add account" in the API setup) and accept the invitation in
   Instagram.
3. Generate a long-lived access token for the account (the API setup page's "Generate token"). If you
   only have a short-lived one, exchange it:
   `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=<app secret>&access_token=<short token>`.
4. Set the three secrets (each command asks for the value; nothing is written to a file):
   ```sh
   pnpm --filter @owl-park/ig-connector exec wrangler secret put IG_ACCESS_TOKEN
   pnpm --filter @owl-park/ig-connector exec wrangler secret put CONNECTOR_KEY   # e.g. openssl rand -hex 32
   pnpm --filter @owl-park/ig-connector exec wrangler secret put APPROVAL_KEY    # e.g. openssl rand -hex 32
   ```
   `CONNECTOR_KEY` must be at least 24 characters, or every path stays 404. A new `APPROVAL_KEY`
   voids every approval id issued before it.
5. Deploy: `pnpm deploy:ig` (or `pnpm --filter @owl-park/ig-connector run deploy`).
6. In claude.ai, Settings, Connectors, add a custom connector with the URL
   `https://owl-park-ig-connector.<your subdomain>.workers.dev/mcp/<CONNECTOR_KEY>`.

## Token refresh

The long-lived token lasts 60 days. Refresh it before then (it must be at least a day old and still
valid):

```
GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=<current token>
```

The answer holds a new token, good for another 60 days; set it again with
`wrangler secret put IG_ACCESS_TOKEN` as in step 4. Keep a reminder every 50 days.

## Videos

Instagram fetches the video itself, so it must sit at a public https URL while it is published.
Instagram's reel specs: MP4 or MOV, 9:16, and up to 90 seconds for a reel also shared to the feed.
Where the cut reel is hosted is a separate step still to settle (for example a public storage
bucket, with the file deleted after publishing).

## Development

`pnpm --filter @owl-park/ig-connector dev`, `typecheck` and `test` (Vitest, with Instagram and the
clock stood in for; no test reaches the network). The root `pnpm check` includes this package.

## Check on the first live test

- `v23.0` is accepted on `graph.instagram.com` (change `GRAPH_VERSION` if not).
- POST parameters, the token included, are sent as a form body rather than a query string; Graph APIs
  take both, but confirm container creation and `media_publish` work this way.
- The reel metric names (`views`, `reach`, `saved`, `shares`, `comments`, `likes`,
  `total_interactions`) are all accepted for reels; Instagram has renamed and retired metrics before.
- The account defaults (`reach`, `views`, `accounts_engaged`, `total_interactions` with
  `metric_type=total_value`, `period=day`) are accepted, and which metrics take
  `breakdown=follow_type`. Some account Insights need a minimum follower count.
- The 90-second limit for feed-shared reels, and whether `share_to_feed=true` is honoured.
- Whether claude.ai waits the roughly 40 seconds `publish_reel` may take; if it times out first,
  lower `POLL_LIMIT_MS` in `src/tools.ts`.
- That the token from the API setup page is already long-lived (60 days).
