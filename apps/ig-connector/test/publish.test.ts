import { describe, expect, it } from 'vitest';
import { signApproval } from '../src/approval';
import { POLL_INTERVAL_MS, POLL_LIMIT_MS } from '../src/tools';
import { TOKEN, callTool, env, fakeInstagram, noFetch, prepare, testDeps, type Call, type Reply } from './helpers';

const CAPTION = 'A night in the park #owls';

/** An account with the given recent captions, whose container reports the given statuses in turn. */
function account(statuses: string[], recent: string[] = ['An older post']) {
  let polls = 0;
  return fakeInstagram((c: Call): Reply => {
    if (c.method === 'GET' && c.path === 'me/media') return { body: { data: recent.map((caption, i) => ({ id: String(100 + i), caption, permalink: `https://www.instagram.com/reel/old${i}/` })) } };
    if (c.method === 'POST' && c.path === 'me/media') return { body: { id: '555' } };
    if (c.method === 'GET' && c.path === '555') return { body: { status_code: statuses[Math.min(polls++, statuses.length - 1)], status: 'Error: video too long', id: '555' } };
    if (c.method === 'POST' && c.path === 'me/media_publish') return { body: { id: '9001' } };
    if (c.method === 'GET' && c.path === '9001') return { body: { permalink: 'https://www.instagram.com/reel/abc123/', id: '9001' } };
    return { status: 400, body: { error: { message: `unexpected ${c.method} ${c.path}` } } };
  });
}

describe('prepare_reel', () => {
  it('posts nothing, and summarises exactly what would post', async () => {
    const r = await callTool('prepare_reel', { video_url: 'https://media.example.com/reel.mp4', caption: CAPTION, cover_url: 'https://media.example.com/cover.jpg' }, testDeps(noFetch));
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/Nothing has been posted/);
    expect(r.text).toContain('Video: https://media.example.com/reel.mp4');
    expect(r.text).toContain('Cover: https://media.example.com/cover.jpg');
    expect(r.text).toContain(`Caption (25 characters, 1 hashtags):\n${CAPTION}`);
    expect(r.text).toMatch(/only after Logan explicitly says yes/);
  });

  it('refuses non-https URLs, long captions and too many hashtags', async () => {
    const deps = testDeps(noFetch);
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ video_url: 'http://media.example.com/reel.mp4', caption: 'x' }, /https/],
      [{ video_url: 'ftp://media.example.com/reel.mp4', caption: 'x' }, /https/],
      [{ video_url: 'https://user:pw@media.example.com/reel.mp4', caption: 'x' }, /user name or password/],
      [{ video_url: 'not a url', caption: 'x' }, /not a valid URL/],
      [{ video_url: 'https://media.example.com/r.mp4', caption: 'x', cover_url: 'javascript:alert(1)' }, /cover_url must start with https/],
      [{ video_url: 'https://media.example.com/r.mp4', caption: 'é'.repeat(2201) }, /2201 characters; Instagram allows 2200/],
      [{ video_url: 'https://media.example.com/r.mp4', caption: Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' ') }, /31 hashtags; Instagram allows 30/],
      [{ video_url: 'https://media.example.com/r.mp4', caption: '   ' }, /caption is required/],
      [{ video_url: 'https://media.example.com/r.mp4', caption: 'x', extra: 1 }, /Unknown argument/],
    ];
    for (const [args, msg] of cases) {
      const r = await callTool('prepare_reel', args, deps);
      expect(r.isError, JSON.stringify(args).slice(0, 60)).toBe(true);
      expect(r.text).toMatch(msg);
    }
    expect((await callTool('prepare_reel', { video_url: 'https://media.example.com/r.mp4', caption: '🦉'.repeat(2200) }, deps)).isError).toBe(false);
    expect((await callTool('prepare_reel', { video_url: 'https://media.example.com/r.mp4', caption: Array.from({ length: 30 }, (_, i) => `#t${i}`).join(' ') }, deps)).isError).toBe(false);
  });
});

describe('publish_reel refuses without a good approval, and sends nothing', () => {
  it('without, malformed, badly signed or expired', async () => {
    const ig = fakeInstagram(() => ({ body: {} }));
    const deps = testDeps(ig.fetch);
    const good = await prepare(deps);
    const [payload] = good.split('.');
    const expired = (await signApproval({ video_url: 'https://media.example.com/reel.mp4', caption: CAPTION, cover_url: null }, env.APPROVAL_KEY!, Math.floor(deps.now() / 1000) - 2 * 86_400)).approval_id;
    for (const [args, msg] of [
      [{}, /missing/],
      [{ approval_id: 'garbage' }, /malformed/],
      [{ approval_id: `${payload}.AAAA` }, /malformed/],
      [{ approval_id: `${payload}.${'A'.repeat(43)}` }, /not validly signed/],
      [{ approval_id: expired }, /expired/],
    ] as const) {
      const r = await callTool('publish_reel', args, deps);
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/Refused, nothing was sent to Instagram/);
      expect(r.text).toMatch(msg);
    }
    expect(ig.calls).toEqual([]);
  });

  it('when the approval key is not set', async () => {
    const r = await callTool('publish_reel', { approval_id: 'a.b' }, testDeps(noFetch), { IG_ACCESS_TOKEN: TOKEN, CONNECTOR_KEY: env.CONNECTOR_KEY! });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/APPROVAL_KEY/);
  });
});

describe('publish_reel', () => {
  it('creates the container, polls until FINISHED, publishes and returns the permalink', async () => {
    const ig = account(['IN_PROGRESS', 'IN_PROGRESS', 'FINISHED']);
    const deps = testDeps(ig.fetch);
    const id = await prepare(deps, { video_url: 'https://media.example.com/reel.mp4', caption: CAPTION, cover_url: 'https://media.example.com/cover.jpg' });
    const r = await callTool('publish_reel', { approval_id: id }, deps);
    expect(r.isError).toBe(false);
    expect(JSON.parse(r.text)).toMatchObject({ state: 'published', media_id: '9001', permalink: 'https://www.instagram.com/reel/abc123/' });
    expect(ig.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET me/media', 'POST me/media', 'GET 555', 'GET 555', 'GET 555', 'POST me/media_publish', 'GET 9001']);
    const create = ig.calls[1]!;
    expect(create.params).toEqual({ media_type: 'REELS', video_url: 'https://media.example.com/reel.mp4', caption: CAPTION, cover_url: 'https://media.example.com/cover.jpg', share_to_feed: 'true', access_token: TOKEN });
    expect(create.url).not.toContain(TOKEN); // a POST carries the token in its body only
    expect(ig.calls[0]!.params.limit).toBe('10');
    expect(ig.calls[2]!.params.fields).toBe('status_code,status');
    expect(ig.calls[5]!.params).toEqual({ creation_id: '555', access_token: TOKEN });
    expect(ig.calls[6]!.params.fields).toBe('permalink');
    expect(deps.sleeps).toEqual([POLL_INTERVAL_MS, POLL_INTERVAL_MS]);
  });

  it('leaves out cover_url when the reel has none', async () => {
    const ig = account(['FINISHED']);
    const deps = testDeps(ig.fetch);
    await callTool('publish_reel', { approval_id: await prepare(deps) }, deps);
    expect(ig.calls[1]!.params).not.toHaveProperty('cover_url');
  });

  it('returns processing at the time limit, then resumes with container_id without a new container', async () => {
    const ig = account(['IN_PROGRESS']);
    const deps = testDeps(ig.fetch);
    const id = await prepare(deps);
    const first = await callTool('publish_reel', { approval_id: id }, deps);
    expect(first.isError).toBe(false);
    expect(JSON.parse(first.text)).toMatchObject({ state: 'processing', container_id: '555' });
    const waited = deps.sleeps.reduce((a, b) => a + b, 0);
    expect(waited).toBeLessThanOrEqual(POLL_LIMIT_MS);
    expect(waited).toBeGreaterThan(POLL_LIMIT_MS - 2 * POLL_INTERVAL_MS);
    expect(ig.calls.filter((c) => c.path === 'me/media_publish')).toEqual([]);

    const resumed = fakeInstagram((c) => (c.path === '555' ? { body: { status_code: 'FINISHED' } } : c.path === 'me/media_publish' ? { body: { id: '9001' } } : c.path === '9001' ? { body: { permalink: 'https://www.instagram.com/reel/abc123/' } } : { body: { data: [] } }));
    const second = await callTool('publish_reel', { approval_id: id, container_id: '555' }, testDeps(resumed.fetch));
    expect(JSON.parse(second.text)).toMatchObject({ state: 'published', media_id: '9001' });
    expect(resumed.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET me/media', 'GET 555', 'POST me/media_publish', 'GET 9001']);
  });

  it('refuses a container_id that is not digits', async () => {
    const ig = account(['FINISHED']);
    const deps = testDeps(ig.fetch);
    const r = await callTool('publish_reel', { approval_id: await prepare(deps), container_id: '../me/media' }, deps);
    expect(r.isError).toBe(true);
    expect(ig.calls).toEqual([]);
  });

  it('reports ERROR and EXPIRED containers as errors and publishes nothing', async () => {
    for (const status of ['ERROR', 'EXPIRED']) {
      const ig = account(['IN_PROGRESS', status]);
      const deps = testDeps(ig.fetch);
      const r = await callTool('publish_reel', { approval_id: await prepare(deps) }, deps);
      expect(r.isError).toBe(true);
      expect(r.text).toContain(`container 555 is ${status}`);
      expect(ig.calls.some((c) => c.path === 'me/media_publish')).toBe(false);
    }
  });

  it('refuses when a recent post has the identical caption, before creating a container', async () => {
    const ig = account(['FINISHED'], ['Something else', `  ${CAPTION}\n`]);
    const deps = testDeps(ig.fetch);
    const r = await callTool('publish_reel', { approval_id: await prepare(deps) }, deps);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/already on the account \(https:\/\/www\.instagram\.com\/reel\/old1\/\)/);
    expect(ig.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET me/media']);
  });

  it('says the reel is live even when the permalink read fails', async () => {
    const ig = fakeInstagram((c) =>
      c.path === 'me/media' && c.method === 'GET' ? { body: { data: [] } } : c.path === 'me/media' ? { body: { id: '555' } } : c.path === '555' ? { body: { status_code: 'FINISHED' } } : c.path === 'me/media_publish' ? { body: { id: '9001' } } : { status: 500, body: { error: { message: 'boom' } } },
    );
    const deps = testDeps(ig.fetch);
    const r = await callTool('publish_reel', { approval_id: await prepare(deps) }, deps);
    expect(r.isError).toBe(false);
    expect(JSON.parse(r.text)).toMatchObject({ state: 'published', media_id: '9001', permalink: null });
  });
});

describe('the access token never comes back', () => {
  it('not in an Instagram error that quotes it, nor in a network error that quotes the URL', async () => {
    const echo = fakeInstagram((c) => ({ status: 400, body: { error: { message: `Invalid OAuth access token - Cannot parse access token: ${c.params.access_token}`, code: 190 } } }));
    const deps = testDeps(echo.fetch);
    const answers = [
      await callTool('list_recent_media', {}, deps),
      await callTool('get_media_insights', { media_id: '1' }, deps),
      await callTool('get_account_insights', {}, deps),
      await callTool('publish_reel', { approval_id: await prepare(deps) }, deps),
    ];
    for (const a of answers) {
      expect(a.isError).toBe(true);
      expect(a.text).toMatch(/Instagram refused: Invalid OAuth access token/);
      expect(a.raw).not.toContain(TOKEN);
    }
    const throwing = (async (input: RequestInfo | URL) => {
      throw new Error(`fetch failed for ${String(input)}`);
    }) as typeof fetch;
    const tdeps = testDeps(throwing);
    for (const a of [await callTool('list_recent_media', {}, tdeps), await callTool('publish_reel', { approval_id: await prepare(tdeps) }, tdeps)]) {
      expect(a.isError).toBe(true);
      expect(a.text).toMatch(/Could not reach Instagram/);
      expect(a.raw).not.toContain(TOKEN);
    }
  });

  it('a missing token is reported plainly', async () => {
    const r = await callTool('list_recent_media', {}, testDeps(noFetch), { CONNECTOR_KEY: env.CONNECTOR_KEY!, APPROVAL_KEY: env.APPROVAL_KEY! });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/IG_ACCESS_TOKEN is not set/);
  });
});
