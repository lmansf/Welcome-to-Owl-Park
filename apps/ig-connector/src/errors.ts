/** A refusal or failure a tool reports to the caller as an isError result, never as a JSON-RPC error. */
export class ToolError extends Error {
  override name = 'ToolError';
}

/** Removes the access token (and any access_token=... that slipped through) from text bound for the caller. */
export function redact(text: string, secrets: readonly (string | undefined)[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 8) out = out.split(s).join('[redacted]');
  return out.replace(/access_token=[^&\s"']+/g, 'access_token=[redacted]');
}
