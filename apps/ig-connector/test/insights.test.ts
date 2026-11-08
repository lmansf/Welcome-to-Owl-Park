import { describe, expect, it } from 'vitest';
import { ACCOUNT_METRICS, REEL_METRICS } from '../src/tools';
import { callTool, fakeInstagram, noFetch, testDeps } from './helpers';

const ok = () => fakeInstagram(() => ({ body: { data: [{ name: 'reach', period: 'day', values: [{ value: 12 }] }] } }));

describe('list_recent_media', () => {
  it('reads the newest posts, 10 by default, at most 50', async () => {
    const ig = ok();
    const deps = testDeps(ig.fetch);
    expect((await callTool('list_recent_media', {}, deps)).isError).toBe(false);
    expect((await callTool('list_recent_media', { limit: 50 }, deps)).isError).toBe(false);
    expect(ig.calls.map((c) => [c.method, c.path, c.params.fields, c.params.limit])).toEqual([
      ['GET', 'me/media', 'id,caption,media_type,media_product_type,permalink,timestamp', '10'],
      ['GET', 'me/media', 'id,caption,media_type,media_product_type,permalink,timestamp', '50'],
    ]);
    for (const limit of [0, 51, 2.5, '10']) expect((await callTool('list_recent_media', { limit }, testDeps(noFetch))).isError).toBe(true);
  });
});

describe('get_media_insights', () => {
  it('asks for the reel metrics by default, or the ones given', async () => {
    const ig = ok();
    const deps = testDeps(ig.fetch);
    const r = await callTool('get_media_insights', { media_id: '17890000000000001' }, deps);
    expect(r.isError).toBe(false);
    expect(JSON.parse(r.text).data[0].name).toBe('reach');
    await callTool('get_media_insights', { media_id: '1', metrics: ['views', 'reach', 'views'] }, deps);
    expect(ig.calls.map((c) => [c.path, c.params.metric])).toEqual([
      ['17890000000000001/insights', REEL_METRICS.join(',')],
      ['1/insights', 'views,reach'],
    ]);
  });

  it('refuses ids that are not digits and metric names outside the allowlist, without calling Instagram', async () => {
    const deps = testDeps(noFetch);
    for (const args of [
      { media_id: 'me' },
      { media_id: '1/../me' },
      { media_id: 123 },
      { media_id: '1', metrics: ['reach&access_token=x'] },
      { media_id: '1', metrics: ['Reach'] },
      { media_id: '1', metrics: [] },
      { media_id: '1', metrics: Array.from({ length: 21 }, (_, i) => `m${'a'.repeat(i)}`) },
    ]) {
      expect((await callTool('get_media_insights', args, deps)).isError, JSON.stringify(args).slice(0, 50)).toBe(true);
    }
  });
});

describe('get_account_insights', () => {
  it('passes validated parameters through', async () => {
    const ig = ok();
    const deps = testDeps(ig.fetch);
    await callTool('get_account_insights', {}, deps);
    await callTool('get_account_insights', { metrics: ['reach'], period: 'days_28', since: 1_790_000_000, until: 1_790_086_400, breakdown: 'follow_type' }, deps);
    expect(ig.calls[0]!.path).toBe('me/insights');
    expect(ig.calls[0]!.params).toMatchObject({ metric: ACCOUNT_METRICS.join(','), period: 'day', metric_type: 'total_value' });
    expect(ig.calls[0]!.params).not.toHaveProperty('breakdown');
    expect(ig.calls[1]!.params).toMatchObject({ metric: 'reach', period: 'days_28', since: '1790000000', until: '1790086400', breakdown: 'follow_type' });
  });

  it('refuses bad periods, times and breakdowns', async () => {
    const deps = testDeps(noFetch);
    for (const args of [
      { period: 'month' },
      { metric_type: 'sum' },
      { since: 'yesterday' },
      { since: 1_790_086_400, until: 1_790_000_000 },
      { breakdown: 'follow-type' },
      { metrics: 'reach,DROP' },
      { other: 1 },
    ]) {
      expect((await callTool('get_account_insights', args, deps)).isError, JSON.stringify(args)).toBe(true);
    }
  });
});
