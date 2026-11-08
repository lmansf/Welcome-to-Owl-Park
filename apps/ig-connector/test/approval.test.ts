import { describe, expect, it } from 'vitest';
import { APPROVAL_TTL_S, canonicalJson, signApproval, verifyApproval, type ReelPlan } from '../src/approval';

const KEY = 'approval-key-for-tests-0123456789';
const NOW = 1_800_000_000;
const plan: ReelPlan = { video_url: 'https://media.example.com/reel.mp4', caption: 'Night owls 🦉 #owls', cover_url: null };
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('approval ids', () => {
  it('sign and verify round trip, for 24 hours', async () => {
    const { approval_id, exp } = await signApproval(plan, KEY, NOW);
    expect(exp).toBe(NOW + APPROVAL_TTL_S);
    expect(approval_id).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(await verifyApproval(approval_id, KEY, NOW + 10)).toEqual({ ok: true, plan, exp });
    const [payload] = approval_id.split('.');
    expect(payload).toBe(b64(canonicalJson(plan, exp)));
  });

  it('refuses an expired id', async () => {
    const { approval_id, exp } = await signApproval(plan, KEY, NOW);
    const r = await verifyApproval(approval_id, KEY, exp);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.reason).toMatch(/expired/);
  });

  it('refuses a tampered payload, a tampered signature and another key', async () => {
    const { approval_id, exp } = await signApproval(plan, KEY, NOW);
    const [, sig] = approval_id.split('.');
    const forged = `${b64(canonicalJson({ ...plan, caption: 'Something else' }, exp))}.${sig}`;
    expect(await verifyApproval(forged, KEY, NOW)).toMatchObject({ ok: false, reason: expect.stringMatching(/not validly signed/) });
    const longer = `${b64(canonicalJson(plan, exp + 86_400 * 365))}.${sig}`;
    expect((await verifyApproval(longer, KEY, NOW)).ok).toBe(false);
    const flipped = approval_id.slice(0, -2) + (approval_id.endsWith('A') ? 'B' : 'A') + approval_id.slice(-1);
    expect((await verifyApproval(flipped, KEY, NOW)).ok).toBe(false);
    expect(await verifyApproval(approval_id, 'another-key-entirely-0123456789', NOW)).toMatchObject({ ok: false });
  });

  it('refuses missing and malformed ids', async () => {
    for (const bad of [undefined, '', 42, 'nodot', 'a.b.c', 'has space.x', `${'a'.repeat(20000)}.b`, 'e30.c2ln']) {
      const r = await verifyApproval(bad, KEY, NOW);
      expect(r.ok, String(bad).slice(0, 20)).toBe(false);
    }
    expect(await verifyApproval(undefined, KEY, NOW)).toMatchObject({ reason: expect.stringMatching(/missing/) });
  });
});
