/**
 * Runtime configuration. Everything here is public: it ships in the browser bundle.
 * Query-string overrides exist for tests and demos (e.g. ?transport=local&room=grove).
 */
export type TransportKind = 'local' | 'supabase' | 'edge';

export interface ParkConfig {
  transport: TransportKind;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Base URL of the room server; empty means same origin as the page. */
  edgeUrl: string;
  shopUrl: string;
  /** Starting room id and spawn, from the query string. */
  room: string;
  spawn: string | undefined;
  /** Fixed player id for tests; otherwise a fresh id is generated per page load. */
  id: string | undefined;
  /** "body,belly,accent" hex colours for tests. */
  look: string | undefined;
  debug: boolean;
  /** Draw at devicePixelRatio for crisp phones (capped). */
  pixelRatio: number;
}

export function readConfig(): ParkConfig {
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  const env = import.meta.env;
  const supabaseUrl = (env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
  const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';
  const requested = q.get('transport') ?? (env.VITE_TRANSPORT as string | undefined)?.trim();
  const edgeUrl = ((env.VITE_EDGE_URL as string | undefined) ?? '').trim();
  const canSupabase = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
  let transport: TransportKind;
  if (requested === 'local') transport = 'local';
  else if (requested === 'edge') transport = 'edge';
  else if (requested === 'supabase' && canSupabase) transport = 'supabase';
  else if (edgeUrl) transport = 'edge';
  else if (canSupabase) transport = 'supabase';
  else transport = 'local';
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return {
    transport,
    supabaseUrl,
    supabaseAnonKey,
    edgeUrl,
    shopUrl: ((env.VITE_SHOP_URL as string | undefined) ?? '').trim(),
    room: q.get('room') ?? 'hub',
    spawn: q.get('spawn') ?? undefined,
    id: q.get('id') ?? undefined,
    look: q.get('look') ?? undefined,
    debug: q.get('debug') === '1',
    pixelRatio: Math.min(2, Math.max(1, dpr)),
  };
}
