/**
 * Runtime configuration. Everything here is public: it ships in the browser bundle.
 * Query-string overrides exist for tests and demos (e.g. ?transport=local&room=grove).
 */
import { PHONE_ROOM_BUDGET } from './game/artFiles';

export type TransportKind = 'local' | 'supabase' | 'edge';

export interface ParkConfig {
  transport: TransportKind;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Base URL of the room server; empty means same origin as the page. */
  edgeUrl: string;
  shopUrl: string;
  /** The store's ticket page; empty until tickets go on sale (the booth then says they are coming). */
  ticketsUrl: string;
  /**
   * The home screen comes first (OP-065), and Play goes on to the owl's own nest (OP-105); an
   * address that names a room (tests, the art preview) or says `home=0` goes straight into the park.
   */
  home: boolean;
  /** Where an address that goes straight in starts, from the query string: the lobby unless it names a room. */
  room: string;
  spawn: string | undefined;
  /** Fixed player id for tests; otherwise a fresh id is generated per page load. */
  id: string | undefined;
  /** "body,belly,accent" hex colours for tests. */
  look: string | undefined;
  /** Local mode only: a fixed collector id (tests share or separate collections with it). */
  collector: string | undefined;
  /** Local mode only: the home time zone to use instead of the device's (tests). */
  tz: string | undefined;
  debug: boolean;
  /** Draw at devicePixelRatio for crisp phones (capped). */
  pixelRatio: number;
  /** Max texture pixels per room pixel for rooms and big set pieces (GPU memory cap). */
  artScaleMax: number;
  /** Decoded bytes one room's big art may take; a wide room that would pass it at 2x loads its 1x copies. */
  roomArtBudget: number;
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
    ticketsUrl: ((env.VITE_TICKETS_URL as string | undefined) ?? '').trim(),
    home: !q.has('room') && q.get('home') !== '0',
    room: q.get('room') ?? 'lobby',
    spawn: q.get('spawn') ?? undefined,
    id: q.get('id') ?? undefined,
    look: q.get('look') ?? undefined,
    collector: q.get('collector') ?? undefined,
    tz: q.get('tz') ?? undefined,
    debug: q.get('debug') === '1',
    pixelRatio: Math.min(2, Math.max(1, dpr)),
    artScaleMax: Math.min(2, Math.max(1, Number(env.VITE_ART_SCALE_MAX) || 1.5)),
    // Phones and tablets (a coarse pointer) keep what a one-screen room costs today; computers get three times that.
    roomArtBudget: (Number(env.VITE_ROOM_ART_BUDGET_MB) * 1024 * 1024) || PHONE_ROOM_BUDGET * (globalThis.matchMedia?.('(pointer: coarse)').matches ? 1 : 3),
  };
}
