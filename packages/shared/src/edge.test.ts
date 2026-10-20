import { describe, expect, it } from 'vitest';
import { EDGE_PROTOCOL_VERSION as V, parseClientFrame } from './edge';

const look = { body: '#111111', belly: '#222222', accent: '#333333' };

describe('parseClientFrame', () => {
  it('accepts well-formed frames and rounds coordinates', () => {
    expect(parseClientFrame(JSON.stringify({ t: 'hello', v: V, look, spawn: 'from-grove', pos: { x: 10.4, y: 20.6 } }))).toEqual({ t: 'hello', v: V, look, spawn: 'from-grove', pos: { x: 10, y: 21 } });
    expect(parseClientFrame(JSON.stringify({ t: 'move', to: { x: 1, y: 2 }, seq: 3 }))).toEqual({ t: 'move', to: { x: 1, y: 2 }, seq: 3 });
    expect(parseClientFrame(JSON.stringify({ t: 'look', look, extra: 1 }))).toEqual({ t: 'look', look });
    expect(parseClientFrame(JSON.stringify({ t: 'bye' }))).toEqual({ t: 'bye' });
  });

  it('accepts positions anywhere in a room wider than one screen', () => {
    expect(parseClientFrame(JSON.stringify({ t: 'move', to: { x: 4700, y: 1500 }, seq: 2 }))).toEqual({ t: 'move', to: { x: 4700, y: 1500 }, seq: 2 });
  });

  it('accepts activity frames, a note only with an emote', () => {
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'light', r: 4 }))).toEqual({ t: 'act', a: 'light', r: 4 });
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'cast', e: 'hoot', r: 5 }))).toEqual({ t: 'act', a: 'cast', r: 5 });
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'note', e: 'hoot', r: 6 }))).toEqual({ t: 'act', a: 'note', e: 'hoot', r: 6 });
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'note', r: 6 }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'note', e: 'sing', r: 6 }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'fly', r: 7 }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'tasks' }))).toBeNull();
  });
  it('rejects anything malformed', () => {
    expect(parseClientFrame('not json')).toBeNull();
    expect(parseClientFrame('[]')).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'hello', v: V - 1, look }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'hello', v: V, look: { body: 'red' } }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'hello', v: V, look, spawn: 'Not A Spawn' }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'move', to: { x: -5, y: 2 }, seq: 1 }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'move', to: { x: 5, y: 2 }, seq: 1.5 }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'move', to: { x: Infinity, y: 2 }, seq: 1 }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'move', to: { x: 6401, y: 2 }, seq: 1 }))).toBeNull(); // past the biggest room
    expect(parseClientFrame(JSON.stringify({ t: 'say', text: 'hi' }))).toBeNull();
    expect(parseClientFrame('x'.repeat(2000))).toBeNull();
  });
});
