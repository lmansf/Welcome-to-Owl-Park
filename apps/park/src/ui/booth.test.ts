import { describe, expect, it } from 'vitest';
import { boothText } from './booth';

describe('the ticket booth window', () => {
  it('before tickets sell: coming soon, and the turnstiles let everyone in', () => {
    const t = boothText({ ticketsUrl: null, gate: 'open', admitted: true });
    expect(t.buy).toBe(false);
    expect(t.say).toContain('coming soon');
  });

  it('sells once the gate takes tickets: the opening switch opens the sale and closes the gate together', () => {
    const url = 'https://store.example/collections/tickets';
    // The store's page can be set ahead: the booth says coming soon until the switch flips.
    expect(boothText({ ticketsUrl: url, gate: 'open', admitted: true })).toEqual({
      say: 'Tickets and passes are coming soon. Until then the turnstiles let everyone through, so go on in and explore.',
      buy: false,
    });
    expect(boothText({ ticketsUrl: url, gate: 'ticket', admitted: false })).toEqual({
      say: 'The park is open to ticket-holders. Get your ticket here, then walk through the turnstiles.',
      buy: true,
    });
    expect(boothText({ ticketsUrl: url, gate: 'ticket', admitted: true }).buy).toBe(true);
  });

  it('tells a ticket-holder to go on through', () => {
    expect(boothText({ ticketsUrl: null, gate: 'ticket', admitted: true }).say).toContain('Walk through the turnstiles');
    // A ticket in the wallet counts before the gate has scanned it, whichever way the gate is set.
    const wallet = [{ id: 'OWL-7K3Q-PX9M', kind: 'day' as const, status: 'unused' as const, msLeft: 1, firstScan: null, validFrom: null, validUntil: null, voteToday: 'none' as const }];
    expect(boothText({ ticketsUrl: null, gate: 'ticket', admitted: false, wallet }).say).toContain('Your ticket is ready');
    expect(boothText({ ticketsUrl: null, gate: 'open', admitted: true, wallet }).say).toContain('Your ticket is ready');
    expect(boothText({ ticketsUrl: null, gate: 'ticket', admitted: false, wallet: [{ ...wallet[0]!, status: 'used' }] }).say).toContain('open to ticket-holders');
  });
});
