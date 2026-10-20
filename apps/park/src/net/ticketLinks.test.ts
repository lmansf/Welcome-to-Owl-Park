import { describe, expect, it } from 'vitest';
import { readTicketLink, shareLink, withoutTicketLink } from './ticketLinks';

const SECRET = 'a'.repeat(21) + '_-' + 'B'.repeat(20);

describe('ticket links', () => {
  it('read a claim or a share secret from the fragment, and nothing else', () => {
    expect(readTicketLink(`#claim=${SECRET}`)).toEqual({ kind: 'claim', secret: SECRET });
    expect(readTicketLink(`#take=${SECRET}`)).toEqual({ kind: 'take', secret: SECRET });
    expect(readTicketLink('#claim=short')).toBeNull();
    expect(readTicketLink(`#claim=${SECRET}!`)).toBeNull();
    expect(readTicketLink('')).toBeNull();
    expect(readTicketLink(`#other=${SECRET}`)).toBeNull();
  });

  it('take the secret out of the address and keep the rest', () => {
    expect(withoutTicketLink(`https://park.example/?room=lobby#claim=${SECRET}`)).toBe('https://park.example/?room=lobby');
    expect(withoutTicketLink(`https://park.example/#take=${SECRET}&x=1`)).toBe('https://park.example/#x=1');
  });

  it('make share links on the park’s own address', () => {
    expect(shareLink('https://park.example/', SECRET)).toBe(`https://park.example/#take=${SECRET}`);
  });
});
