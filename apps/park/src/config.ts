/**
 * Runtime configuration. Everything here is public: it ships in the browser bundle.
 * Query-string overrides exist for tests and demos (e.g. ?transport=local&room=grove).
 */
export type TransportKind = 'local' | 'supabase';

export interface ParkConfig {
  transport: TransportKind;
  supabaseUrl: string;
  supabaseAnonKey: string;
  shopUrl: string;
  /** Starting room id and spawn, from the query string. */
  room: string;
  spawn: string | undefined;
  /** Fixed player id for tests; otherwise a per-tab id is generated. */
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
  const requested = q.get('transport');
  const canSupabase = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
  const transport: TransportKind = requested === 'local' ? 'local' : requested === 'supabase' && canSupabase ? 'supabase' : canSupabase ? 'supabase' : 'local';
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return {
    transport,
    supabaseUrl,
    supabaseAnonKey,
    shopUrl: ((env.VITE_SHOP_URL as string | undefined) ?? '').trim(),
    room: q.get('room') ?? 'hub',
    spawn: q.get('spawn') ?? undefined,
    id: q.get('id') ?? undefined,
    look: q.get('look') ?? undefined,
    debug: q.get('debug') === '1',
    pixelRatio: Math.min(2, Math.max(1, dpr)),
  };
}
