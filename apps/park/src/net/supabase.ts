import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { isParkMessage, isPlayerState, type ParkMessage, type PlayerState } from '@owl-park/shared';
import type { ParkTransport, RoomConnection, RoomHandlers } from './transport';

/** Presence re-tracks at most this often, so rapid clicking costs one message, not two. */
const TRACK_THROTTLE_MS = 3000;
/** Moves go out at most this often; a faster tap replaces the pending one (last tap wins). */
const MOVE_MIN_INTERVAL_MS = 250;
/** Untrusted roster: ignore new ids beyond this (above the largest room cap). */
const MAX_PEERS = 128;

/**
 * Internet multiplayer on Supabase Realtime, with no server code of our own:
 *  - Presence: who is in the room and their last tracked state (join/leave/sync).
 *  - Broadcast: `move` messages the moment an owl starts walking.
 * One channel per room, named `room:<id>`. Public channels for v1 presence.
 */
export class SupabaseTransport implements ParkTransport {
  readonly kind = 'supabase' as const;
  private readonly client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }

  async join(roomId: string, self: PlayerState, handlers: RoomHandlers): Promise<RoomConnection> {
    handlers.onStatus('connecting');
    const channel: RealtimeChannel = this.client.channel(`room:${roomId}`, {
      config: { presence: { key: self.id }, broadcast: { self: false, ack: false } },
    });
    const client = this.client;
    let current = self;
    let lastTrack = 0;
    let pendingTrack: ReturnType<typeof setTimeout> | null = null;
    let lastMove = 0;
    let pendingMove: { msg: ParkMessage; timer: ReturnType<typeof setTimeout> } | null = null;
    /** Presence keys of the peers in the room: the only ids a broadcast may speak for. */
    const known = new Set<string>();

    /** Presence payloads must describe the key they were tracked under. */
    const upsert = (key: string, state: unknown) => {
      if (key === current.id || !isPlayerState(state) || state.id !== key) return;
      if (!known.has(key) && known.size >= MAX_PEERS) return;
      known.add(key);
      handlers.onPeerState(state);
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        const all = channel.presenceState<PlayerState>();
        const present = new Set<string>();
        for (const [key, metas] of Object.entries(all)) {
          if (key === current.id) continue;
          present.add(key);
          const latest = metas[metas.length - 1];
          if (latest) upsert(key, latest);
        }
        for (const id of known) {
          if (!present.has(id)) {
            known.delete(id);
            handlers.onPeerLeave(id);
          }
        }
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (key === current.id) return;
        const latest = newPresences[newPresences.length - 1];
        if (latest) upsert(key, latest);
      })
      .on('presence', { event: 'leave' }, ({ key, currentPresences }) => {
        // A re-track shows up as a leave of the old meta while the key still has metas: not a departure.
        if (key === current.id || (currentPresences?.length ?? 0) > 0) return;
        known.delete(key);
        handlers.onPeerLeave(key);
      })
      .on('broadcast', { event: 'park' }, ({ payload }) => {
        // Broadcasts may only refresh owls the presence roster already lists; the roster is the truth.
        if (!isParkMessage(payload)) return;
        switch (payload.t) {
          case 'move':
            if (known.has(payload.id)) handlers.onPeerMove(payload.id, payload.walk);
            break;
          case 'state':
            if (known.has(payload.state.id)) handlers.onPeerState(payload.state);
            break;
          case 'emote':
            if (known.has(payload.id)) handlers.onPeerEmote?.(payload.id, payload.e);
            break;
          case 'say':
            if (known.has(payload.id)) handlers.onPeerSay?.(payload.id, payload.n);
            break;
          case 'hello':
          case 'bye':
            break; // never sent by this transport; presence join/leave is the roster
        }
      });

    const doTrack = () => {
      lastTrack = Date.now();
      pendingTrack = null;
      void channel.track(current);
    };

    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          handlers.onStatus('online');
          doTrack();
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          handlers.onStatus('offline');
          resolve();
        } else if (status === 'CLOSED') {
          handlers.onStatus('offline');
        }
      });
    });

    const sendNow = (msg: ParkMessage) => {
      lastMove = msg.t === 'move' ? Date.now() : lastMove;
      void channel.send({ type: 'broadcast', event: 'park', payload: msg });
    };

    return {
      send(msg: ParkMessage) {
        if (msg.t !== 'move') return sendNow(msg);
        const wait = MOVE_MIN_INTERVAL_MS - (Date.now() - lastMove);
        if (wait <= 0 && !pendingMove) return sendNow(msg);
        if (pendingMove) clearTimeout(pendingMove.timer);
        pendingMove = {
          msg,
          timer: setTimeout(() => {
            const m = pendingMove?.msg;
            pendingMove = null;
            if (m) sendNow(m);
          }, Math.max(wait, 0)),
        };
      },
      track(state: PlayerState) {
        current = state;
        const wait = TRACK_THROTTLE_MS - (Date.now() - lastTrack);
        if (wait <= 0) doTrack();
        else if (!pendingTrack) pendingTrack = setTimeout(doTrack, wait);
      },
      async leave() {
        if (pendingTrack) clearTimeout(pendingTrack);
        if (pendingMove) clearTimeout(pendingMove.timer);
        // Only a joined channel can deliver the untrack; otherwise phoenix buffers the push and settles
        // it on its 10 s timeout, which would hold the door fade on black. Leaving drops our presence anyway.
        if (channel.state === 'joined') await channel.untrack({ timeout: 1000 });
        await client.removeChannel(channel);
      },
    };
  }
}
