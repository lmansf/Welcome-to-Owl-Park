import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { isParkMessage, type ParkMessage, type PlayerState } from '@owl-park/shared';
import type { ParkTransport, RoomConnection, RoomHandlers } from './transport';

/** Presence re-tracks at most this often, so rapid clicking costs one message, not two. */
const TRACK_THROTTLE_MS = 3000;

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
    const known = new Set<string>();

    const upsert = (state: unknown) => {
      if (!state || typeof state !== 'object') return;
      const s = state as PlayerState;
      if (!s.id || s.id === current.id) return;
      known.add(s.id);
      handlers.onPeerState(s);
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        const all = channel.presenceState<PlayerState>();
        const present = new Set<string>();
        for (const [key, metas] of Object.entries(all)) {
          if (key === current.id) continue;
          present.add(key);
          const latest = metas[metas.length - 1];
          if (latest) upsert(latest);
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
        if (latest) upsert(latest);
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key === current.id) return;
        known.delete(key);
        handlers.onPeerLeave(key);
      })
      .on('broadcast', { event: 'park' }, ({ payload }) => {
        if (!isParkMessage(payload)) return;
        switch (payload.t) {
          case 'move':
            if (payload.id !== current.id) handlers.onPeerMove(payload.id, payload.walk);
            break;
          case 'state':
          case 'hello':
            upsert(payload.state);
            break;
          case 'bye':
            known.delete(payload.id);
            handlers.onPeerLeave(payload.id);
            break;
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

    return {
      send(msg: ParkMessage) {
        void channel.send({ type: 'broadcast', event: 'park', payload: msg });
      },
      track(state: PlayerState) {
        current = state;
        const wait = TRACK_THROTTLE_MS - (Date.now() - lastTrack);
        if (wait <= 0) doTrack();
        else if (!pendingTrack) pendingTrack = setTimeout(doTrack, wait);
      },
      async leave() {
        if (pendingTrack) clearTimeout(pendingTrack);
        try {
          await channel.untrack();
        } finally {
          await client.removeChannel(channel);
        }
      },
    };
  }
}
