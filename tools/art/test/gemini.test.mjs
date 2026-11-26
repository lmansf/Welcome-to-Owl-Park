// The Gemini provider: request shape, response parsing, model selection and the revise turn.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';

import * as G from '../generate.mjs';
import * as P from '../prompts.mjs';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'owl-art-gemini-'));
test.after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));
const tinyPng = () => G.encodePng({ width: 2, height: 2, channels: 3, data: new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9]) });
const sink = () => { const c = []; return { stream: new Writable({ write(x, _e, cb) { c.push(String(x)); cb(); } }), text: () => c.join('') }; };
const cfgFor = (env = {}, flags = {}) => G.resolveConfig({ provider: 'gemini', out: path.join(tmpRoot, 'w'), ...flags }, { GEMINI_API_KEY: 'k', ...env }, P.DEFAULTS);

test('gemini picks its own model family and refuses a Seedream one', () => {
  assert.equal(cfgFor().model, G.DEFAULT_GEMINI_MODEL);
  assert.equal(cfgFor().gemini.model, 'gemini-3-pro-image-preview');
  assert.equal(cfgFor({}, { model: 'gemini-2.5-flash-image' }).gemini.model, 'gemini-2.5-flash-image');
  assert.throws(() => cfgFor({}, { model: 'seedream-v4' }), /needs a Gemini model/);
  assert.throws(() => G.resolveConfig({ provider: 'fal', model: 'gemini-3-pro-image' }, {}, P.DEFAULTS), /only with --provider gemini/);
  // The Seedream default in prompts.mjs never leaks into a fal-less family.
  assert.equal(G.resolveConfig({ provider: 'fal' }, {}, P.DEFAULTS).model, P.DEFAULTS.model ?? G.DEFAULT_MODEL);
});

test('aspect ratio and size tier follow the job size', () => {
  assert.equal(G.geminiAspect(1600, 900), '16:9');
  assert.equal(G.geminiAspect(200, 240), '4:5');
  assert.equal(G.geminiAspect(512, 512), '1:1');
  assert.equal(G.geminiAspect(960, 1280), '3:4');
  assert.equal(G.geminiTier(400, 480, ['1K', '2K', '4K']), '1K');
  assert.equal(G.geminiTier(3200, 1800, ['1K', '2K', '4K']), '4K');
  assert.equal(G.geminiTier(9000, 10, ['1K', '2K']), '2K');
  assert.equal(G.geminiTier(3200, 1800, []), null);
});

test('the request carries the formula prompt, inline refs as tokens, no negative prompt and a redacted key', () => {
  const cfg = cfgFor();
  const ref = { ref: 'refs/x.png', status: 'ok', token: 'sha256:abc', mime: 'image/png' };
  const job = { key: 'hub', prompt: 'seedream text', gemini_prompt: 'formula text', negative: 'no owls', width: 1600, height: 900, seed: 7 };
  const req = G.PROVIDERS.gemini.buildRequest(job, cfg, [ref]);
  assert.equal(req.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent');
  assert.deepEqual(req.body.contents[0].parts, [{ text: 'formula text' }, { inlineData: { mimeType: 'image/png', data: 'sha256:abc' } }]);
  assert.deepEqual(req.body.generationConfig, { responseModalities: ['IMAGE'], seed: 7, imageConfig: { aspectRatio: '16:9', imageSize: '2K' } });
  assert.doesNotMatch(JSON.stringify(req.body), /no owls/);
  assert.equal(G.redactHeaders(req.headers)['x-goog-api-key'], '***');
  // Without a gemini_prompt the job's own prompt is sent.
  assert.equal(G.PROVIDERS.gemini.buildRequest({ ...job, gemini_prompt: undefined }, cfg, []).body.contents[0].parts[0].text, 'seedream text');
  // Refs go as bare base64; a hosted URL cannot.
  const bytes = tinyPng();
  assert.equal(G.refValue({ bytes, mime: 'image/png' }, 'base64'), bytes.toString('base64'));
  assert.throws(() => G.refValue({ ref: 'u', url: 'https://x/y.png' }, 'base64'), /local files only/);
});

test('a response image is decoded with its thought signature; a refusal names its reason', () => {
  const png = tinyPng();
  const r = G.parseGeminiResponse({ candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: png.toString('base64') }, thoughtSignature: 'sig' }] } }], responseId: 'r1' });
  assert.deepEqual([r.format, r.width, r.height, r.providerMeta.thought_signature, r.providerMeta.request_id], ['png', 2, 2, 'sig', 'r1']);
  assert.throws(() => G.parseGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } }), /no image \(SAFETY\)/);
  assert.throws(() => G.parseGeminiResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'I cannot' }] } }] }), /STOP\): I cannot/);
});

test('generate posts once and needs a key', async () => {
  const png = tinyPng();
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: png.toString('base64') } }] } }] }), { status: 200 }); };
  const cfg = cfgFor();
  const ref = { ref: 'refs/x.png', status: 'ok', token: 'sha256:t', bytes: png, mime: 'image/png' };
  const req = G.PROVIDERS.gemini.buildRequest({ key: 'hub', prompt: 'p', width: 1600, height: 900, seed: 1 }, cfg, [ref]);
  const out = await G.PROVIDERS.gemini.generate(req, { cfg, refs: [ref], http: { retries: 0, fetchImpl } });
  assert.equal(out.width, 2);
  assert.equal(calls.length, 1);
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.contents[0].parts[1].inlineData.data, png.toString('base64'));
  await assert.rejects(G.PROVIDERS.gemini.generate(req, { cfg: cfgFor({ GEMINI_API_KEY: '' }), refs: [], http: {} }), /GEMINI_API_KEY is not set/);
});

test('revise continues a Gemini conversation, or edits other art in one turn', () => {
  const cfg = cfgFor();
  const image = { bytes: tinyPng(), mime: 'image/png' };
  const job = { key: 'hub', prompt: 'p', gemini_prompt: 'original', width: 1600, height: 900, seed: 3 };
  const turn = G.reviseRequest({ job, cfg, refs: [], image, adjustment: 'Keep everything identical, but dim the lanterns.', signature: 'sig' });
  const c = turn.req.body.contents;
  assert.deepEqual(c.map((x) => x.role), ['user', 'model', 'user']);
  assert.equal(c[0].parts[0].text, 'original');
  assert.equal(c[1].parts[0].thoughtSignature, 'sig');
  assert.equal(c[2].parts[0].text, 'Keep everything identical, but dim the lanterns.');
  const one = G.reviseRequest({ job, cfg, refs: [], image, adjustment: 'Make the sky darker.' });
  assert.equal(one.req.body.contents.length, 1);
  assert.equal(one.req.body.contents[0].parts[0].text, 'Image 1 is the current game asset. Make the sky darker.');
  assert.equal(one.req.body.contents[0].parts[1].inlineData.data, one.refs[0].token);
});

test('revise --dry-run on published art spends nothing', async () => {
  const o = sink(); const e = sink();
  const code = await G.main(['revise', 'hub', 'final', 'Keep', 'it', 'identical,', 'but', 'darken', 'the', 'sky.', '--provider', 'gemini', '--dry-run', '--out', path.join(tmpRoot, 'rv')], { env: { GEMINI_API_KEY: 'k' }, stdout: o.stream, stderr: e.stream, fetchImpl: () => { throw new Error('no calls'); } });
  assert.equal(code, 0, e.text());
  assert.match(o.text(), /one-turn edit/);
  assert.match(o.text(), /Image 1 is the current game asset\. Keep it identical, but darken the sky\./);
  assert.ok(!fs.existsSync(path.join(tmpRoot, 'rv', 'raw')));
  const bad = await G.main(['revise', 'hub', 'final', 'x', '--provider', 'fal'], { env: {}, stdout: o.stream, stderr: e.stream });
  assert.equal(bad, 2);
});
