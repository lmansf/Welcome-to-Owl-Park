import { describe, expect, it } from 'vitest';
import { parseClientFrame } from './edge';

const look = { body: '#111111', belly: '#222222', accent: '#333333' };

describe('parseClientFrame', () => {
  it('accepts well-formed frames and rounds coordinates', () => {
    expect(parseClientFrame(JSON.stringify({ t: 'hello', v: 2, look, spawn: 'from-grove', pos: { x: 10.4, y: 20.6 } }))).toEqual({ t: 'hello', v: 2, look, spawn: 'from-grove', pos: { x: 10, y: 21 } });
    expect(parseClientFrame(JSON.stringify({ t: 'move', to: { x: 1, y: 2 }, seq: 3 }))).toEqual({ t: 'move', to: { x: 1, y: 2 }, seq: 3 });
    expect(parseClientFrame(JSON.stringify({ t: 'look', look, extra: 1 }))).toEqual({ t: 'look', look });
    expect(parseClientFrame(JSON.stringify({ t: 'bye' }))).toEqual({ t: 'bye' });
  });
  it('rejects anything malformed', () => {
    expect(parseClientFrame('not json')).toBeNull();
    expect(parseClientFrame('[]')).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'hello', v: 1, look }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'hello', v: 2, look: { body: 'red' } }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'hello', v: 2, look, spawn: 'Hoot Hollow' }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'move', to: { x: -5, y: 2 }, seq: 1 }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'move', to: { x: 5, y: 2 }, seq: 1.5 }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'move', to: { x: Infinity, y: 2 }, seq: 1 }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'say', text: 'hi' }))).toBeNull();
    expect(parseClientFrame('x'.repeat(2000))).toBeNull();
  });
});
