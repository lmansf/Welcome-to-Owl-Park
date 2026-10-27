import { isParkMessage, type ParkMessage, type PlayerState } from '@owl-park/shared';
import type { ParkTransport, RoomConnection, RoomHandlers } from './transport';

const HEARTBEAT_MS = 4000;
const EXPIRE_MS = 12000;

/**
 * Zero-backend multiplayer between tabs of the same browser via BroadcastChannel.
 * Used for local development, demos on one device, and the end-to-end tests.
 */
export class LocalTransport implements ParkTransport {
  readonly kind = 'local' as const;

  async join(roomId: string, self: PlayerState, handlers: RoomHandlers): Promise<RoomConnection> {
    if (typeof BroadcastChannel === 'undefined') {
      handlers.onStatus('offline');
      return { send() {}, track() {}, async leave() {} };
    }
    const channel = new BroadcastChannel(`owl-park:room:${roomId}`);
    const lastSeen = new Map<string, number>();
    let current = self;

    const post = (msg: ParkMessage) => channel.postMessage(msg);

    channel.onmessage = (ev: MessageEvent<unknown>) => {
      const msg = ev.data;
      if (!isParkMessage(msg)) return;
      switch (msg.t) {
        case 'hello':
          if (msg.state.id === current.id) return;
          lastSeen.set(msg.state.id, Date.now());
          handlers.onPeerState(msg.state);
          // Introduce ourselves to the newcomer.
          post({ t: 'state', state: current });
          break;
        case 'state':
          if (msg.state.id === current.id) return;
          lastSeen.set(msg.state.id, Date.now());
          handlers.onPeerState(msg.state);
          break;
        case 'move':
          if (msg.id === current.id) return;
          lastSeen.set(msg.id, Date.now());
          handlers.onPeerMove(msg.id, msg.walk);
          break;
        case 'bye':
          if (msg.id === current.id) return;
          lastSeen.delete(msg.id);
          handlers.onPeerLeave(msg.id);
          break;
        case 'emote':
          if (msg.id === current.id) return;
          lastSeen.set(msg.id, Date.now());
          handlers.onPeerEmote?.(msg.id, msg.e);
          break;
        case 'say':
          if (msg.id === current.id) return;
          lastSeen.set(msg.id, Date.now());
          handlers.onPeerSay?.(msg.id, msg.n);
          break;
        case 'rest':
          if (msg.id === current.id) return;
          lastSeen.set(msg.id, Date.now());
          handlers.onPeerRest?.(msg.id, msg.asleep);
          break;
      }
    };

    const timer = setInterval(() => {
      post({ t: 'state', state: current });
      const now = Date.now();
      for (const [id, seen] of lastSeen) {
        if (now - seen > EXPIRE_MS) {
          lastSeen.delete(id);
          handlers.onPeerLeave(id);
        }
      }
    }, HEARTBEAT_MS);

    const onHide = () => post({ t: 'bye', id: current.id });
    window.addEventListener('pagehide', onHide);

    handlers.onStatus('online');
    post({ t: 'hello', state: current });

    return {
      send(msg) {
        post(msg);
      },
      track(state) {
        current = state;
      },
      async leave() {
        clearInterval(timer);
        window.removeEventListener('pagehide', onHide);
        post({ t: 'bye', id: current.id });
        channel.close();
      },
    };
  }
}
