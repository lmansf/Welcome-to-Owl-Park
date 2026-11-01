/**
 * The connector's settings. All three are secrets, set with `wrangler secret put` (README.md) and never
 * written in wrangler.jsonc, so `wrangler types` does not know them: they are declared here, as optional.
 */
export interface IgEnv extends Cloudflare.Env {
  /** The Instagram account's long-lived access token (Instagram API with Instagram Login), 60 days. */
  IG_ACCESS_TOKEN?: string;
  /** The secret path segment: the MCP endpoint is /mcp/<CONNECTOR_KEY>. 24+ characters, or every path is 404. */
  CONNECTOR_KEY?: string;
  /** Signs the approval ids that prepare_reel hands out and publish_reel checks. */
  APPROVAL_KEY?: string;
}

/** What the tools reach the world through, so tests can stand in for Instagram and the clock. */
export interface Deps {
  fetch: typeof fetch;
  /** Milliseconds since the epoch. */
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export const liveDeps: Deps = {
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
