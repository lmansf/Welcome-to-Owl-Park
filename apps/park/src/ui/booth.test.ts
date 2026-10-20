import { describe, expect, it } from 'vitest';
import { boothText } from './booth';

describe('the ticket booth window', () => {
  it('before tickets sell: coming soon, and the turnstiles let everyone in', () => {
    const t = boothText({ ticketsUrl: null, gate: 'open', admitted: true });
    expect(t.buy).toBe(false);
    expect(t.say).toContain('coming soon');
  });

  it('offers the store once its ticket page is set', () => {
    expect(boothText({ ticketsUrl: 'https://store.example/collections/tickets', gate: 'open', admitted: true }).buy).toBe(true);
    expect(boothText({ ticketsUrl: 'https://store.example/collections/tickets', gate: 'ticket', admitted: false })).toEqual({
      say: 'The park is open to ticket-holders. Get your ticket here, then walk through the turnstiles.',
      buy: true,
    });
  });

  it('tells a ticket-holder to go on through', () => {
    expect(boothText({ ticketsUrl: null, gate: 'ticket', admitted: true }).say).toContain('Walk through the turnstiles');
  });
});
