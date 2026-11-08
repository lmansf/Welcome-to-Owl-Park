/**
 * Experiment 8 (OP-132): the collection log's database unreachable. The park runs with its collection
 * log on (OP-107), sent to the stand-in store's /log in place of the owl-park-log function. The log
 * stops answering (HTTP 500) for 20 s while five new owls come into the hub, each a new collection
 * given its starter pack (three rows for the log each, and any present every new owl gets). The
 * grants must not wait on the log; the rows must wait in the collections object's outbox and reach
 * the log once it is back, each once (the outbox tries again 30 s after a failed send, then 60 s,
 * then longer: collectLog.ts LOG_RETRY_MS).
 */
import { STARTER_PACK } from '../lib/shared.mjs';
import { storeFault } from '../lib/store.mjs';

const DOWN_MS = 20_000;
const NEWCOMERS = [400, 401, 402, 403, 404];
const BACK_WITHIN_MS = 150_000;
// Test values for the throwaway park, never a secret: the key the log checks, and the hashes' salt.
const LOG = { key: 'chaos-only-log-key-not-a-secret', salt: 'chaos-only-log-salt-not-a-secret' };

const taken = async (park) => (await fetch(`${park.storeOrigin}/test/log`)).json();
const collectRows = (l) => l.rows.collect ?? 0;

export default {
  n: 8,
  id: 'log-sink-down',
  name: 'The collection log’s database unreachable',
  hypothesis: 'With the collection log down, new owls still get their starter pack at once, and its rows wait in the outbox and reach the log once it is back, each once (OP-107).',
  blastRadius: "The throwaway park's collection log only (sent to the stand-in store in place of the log function), and five new scripted visitors.",
  rollback: 'The log answers again; the outbox empties on its next try.',
  parkVars: ({ storeOrigin }) => ({ PARK_LOG_URL: `${storeOrigin}/log`, FRAUD_SCORE_KEY: LOG.key, FRAUD_HASH_SALT: LOG.salt }),
  pauseChecks: { names: ['journey'], why: "the journey's page is a new owl each time, whose starter pack would add rows to the count" },
  expectLogs: [
    {
      component: 'collections',
      event: 'collect_log_failed',
      question: 'Did the collections object say the log could not be reached?',
      add: 'collect_log_failed with the status or the error (collectLog.ts)',
    },
    {
      component: 'collections',
      event: 'collect_log_retried',
      question: 'Did the outbox try again, and with how many rows waiting?',
      add: 'collect_log_retried with the attempt and the rows waiting (collectLog.ts)',
    },
  ],
  async run(ctx) {
    const before = await taken(ctx.park);
    await storeFault(ctx.park, { op: 'log', mode: 'error', times: 100_000 });
    ctx.state.down = true;
    const downAt = Date.now();
    ctx.note('action', { what: 'the collection log down (HTTP 500)', before });

    // Five new owls, each a new collection given its starter pack as it comes in; each plays its first emote.
    const newcomers = [];
    ctx.state.newcomers = newcomers;
    for (const n of NEWCOMERS) {
      const v = ctx.visitor(n, { comeBack: false });
      newcomers.push(v);
      try {
        await v.join('hub');
        v.emote(STARTER_PACK[0]);
      } catch (e) {
        ctx.note('note', { what: `newcomer ${n} not let in`, why: e.message });
      }
    }
    await ctx.sleep(2_000); // their emotes reach the fleet
    const played = newcomers.filter((v) => v.id && ctx.fleet.visitors.some((f) => (f.heardEmotes.get(v.id) ?? 0) > 0)).length;
    ctx.observe({
      what: 'new owls in with their starter pack while the log was down',
      value: `${played} of ${NEWCOMERS.length} played their first emote`,
      ok: played === NEWCOMERS.length,
      component: 'collections',
      fix: 'grant first and log after: a collectible never waits on the collection log (collectLog.ts, the outbox)',
    });
    await Promise.all(newcomers.map((v) => v.leave()));
    await ctx.sleep(Math.max(0, downAt + DOWN_MS - Date.now()));
    const during = await taken(ctx.park);
    await storeFault(ctx.park, { clear: true });
    ctx.state.down = false;
    const upAt = Date.now();
    ctx.note('action', { what: 'the collection log back', during });
    ctx.observe({
      what: 'the log while it was down',
      value: `${during.refused - before.refused} sends refused, ${collectRows(during) - collectRows(before)} starter rows taken`,
      ok: during.refused > before.refused,
      component: 'collections',
      fix: 'send what is granted at once, and keep it in the outbox when the log refuses it',
    });

    const want = collectRows(before) + NEWCOMERS.length * STARTER_PACK.length;
    let after = during;
    while (Date.now() - upAt < BACK_WITHIN_MS && collectRows(after) < want && !ctx.signal.aborted) {
      await ctx.sleep(2_000);
      after = await taken(ctx.park);
    }
    const tookS = Math.round((Date.now() - upAt) / 1000);
    ctx.observe({
      what: 'the starter-pack rows once the log was back',
      value: `${collectRows(after) - collectRows(before)} new owls' rows taken (at least the ${NEWCOMERS.length * STARTER_PACK.length} of their starter packs), ${tookS} s after it came back; ${after.twice - before.twice} rows sent twice`,
      ok: collectRows(after) >= want && after.twice === before.twice,
      component: 'collections',
      fix: 'send what waited in the outbox on the next try once the log is back, each row once (collectLog.ts round)',
    });
  },
  async rollback(ctx) {
    if (ctx.state.down) await storeFault(ctx.park, { clear: true });
    await Promise.all((ctx.state.newcomers ?? []).map((v) => v.leave()));
  },
};
