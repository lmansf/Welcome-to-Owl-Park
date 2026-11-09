/**
 * Every path the Worker answers (OP-201), grouped as the files that answer them. The Worker looks a
 * path up here (`router.ts`) after the front door and the rate limits; a path no route matches is a
 * static asset. Each handler answers its own methods, OPTIONS included.
 */
import { RIBBON_WORDS } from '@owl-park/shared';
import { capacityPage } from '../capacityPage';
import { feedbackPage } from '../feedbackPage';
import { gatePage } from '../gatePage';
import { CSP_REPORT_PATH } from '../guard';
import { openingPage } from '../openingPage';
import { account } from './account';
import { adminCapacity, adminClimb, adminCollectLog, adminGate, adminGrant, adminKeeper, adminOpening, adminPing, adminRestart, adminStore, adminTickets } from './admin';
import { clientError } from './clientErrors';
import { collection, nest, nestGift } from './collection';
import { adminFeedback, feedback } from './feedback';
import { closed, line, notice } from './line';
import { adminMasks, masks } from './masks';
import { counts, healthRoute, socket } from './rooms';
import type { Route } from './router';
import { storeWebhookRoute } from './store';
import { tickets } from './tickets';
import { cspReport, entry, guestPass, travel } from './visit';
import { vote } from './vote';

export const ROUTES: readonly Route[] = [
  // ---- A visit: what the page's policy blocked (OP-140), its pass, the front gate, the map's places ----
  { path: CSP_REPORT_PATH, handle: cspReport },
  { path: '/api/client-error', handle: clientError },
  { path: '/api/pass', handle: guestPass },
  { path: '/api/entry', handle: entry },
  { path: '/api/travel', handle: travel },

  // ---- The keepers' routes (the admin key, or for the painter a keeper's token) and their pages ----
  { path: '/api/admin/ping', handle: adminPing },
  { path: '/api/admin/keeper', handle: adminKeeper },
  { prefix: '/api/admin/masks/', handle: adminMasks },
  { prefix: '/api/masks/', handle: masks },
  { path: '/api/admin/grant', handle: adminGrant },
  { path: '/api/admin/climb', handle: adminClimb },
  { path: '/api/admin/collect-log', handle: adminCollectLog },
  { path: '/api/admin/store', handle: adminStore },
  { path: '/api/admin/tickets', handle: adminTickets },
  { path: '/api/admin/feedback', handle: adminFeedback },
  { path: '/admin/feedback', handle: () => feedbackPage() },
  { path: '/api/admin/opening', handle: adminOpening },
  { path: '/admin/opening', handle: () => openingPage() },
  { path: '/api/admin/gate', handle: adminGate },
  { path: '/admin/gate', handle: () => gatePage() },
  { path: '/api/admin/restart', handle: adminRestart },
  { path: '/api/admin/capacity', handle: adminCapacity },
  { path: '/admin/capacity', handle: () => capacityPage(RIBBON_WORDS) },

  // ---- Accounts (OP-139) and feedback ----
  { prefix: '/api/account/', handle: account },
  { path: '/api/feedback', handle: feedback },
  // The thanks ladder's state and the page card's close (OP-272).
  { path: '/api/feedback/reward', handle: feedback },
  { path: '/api/feedback/close', handle: feedback },

  // ---- Busy nights (OP-075), and closed for setup (OP-233) ----
  { path: '/api/line', handle: line },
  { path: '/api/notice', handle: notice },
  { path: '/api/closed', handle: closed },

  // ---- The store's webhooks and tickets (C35) ----
  { path: '/api/store/webhook', handle: storeWebhookRoute },
  { path: '/api/tickets', handle: tickets },
  { prefix: '/api/tickets/', handle: tickets },

  // ---- The collection, the shop and the nests ----
  { path: '/api/collection', handle: collection },
  { path: '/api/shop', handle: collection },
  { path: '/api/shop/buy', handle: collection },
  { path: '/api/shop/gift', handle: collection },
  { path: '/api/nest', handle: nest },
  { path: '/api/nest/gift', handle: nestGift },

  // ---- The Realm Vote ----
  { prefix: '/api/vote', handle: vote },

  // ---- The rooms ----
  { path: '/api/health', handle: healthRoute },
  { path: '/api/counts', handle: counts },
  { prefix: '/ws/', handle: socket },
];
