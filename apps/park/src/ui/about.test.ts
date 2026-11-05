import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABOUT_WORDS, CONTACT_LINES, DAY_TICKET_PRICE, KEEPER, OUTSIDE_MENTIONS, PLAYER_QUOTES, STILLS, aboutParts, faq, grownUpParts, presenceLine, ticketLine, WHAT_IT_IS } from './about';
// @ts-expect-error: a plain script, no types
import { INDEXNOW_KEY, indexNowBody, sitemapUrls } from '../../../../tools/indexnow.mjs';

const page = (path: string) => readFileSync(join(__dirname, '../../public', path), 'utf8').replace(/\s+/g, ' ');

describe('what the park is, said plainly (the site audit)', () => {
  it('says the tickets in one line, with the price only once the owner sets one', () => {
    expect(ticketLine(null)).toBe('Guests play free and keep nothing they win; ticketed owls keep everything.');
    expect(ticketLine('$2')).toBe('Day Ticket: $2 for today. Guests play free and keep nothing they win; ticketed owls keep everything.');
  });

  it('counts the owls in the park in plain words, and says nothing it does not know', () => {
    expect(presenceLine(null)).toBeNull();
    expect(presenceLine(Number.NaN)).toBeNull();
    expect(presenceLine(-1)).toBeNull();
    expect(presenceLine(0)).toBe('Nobody is in the park right now, so you would have it to yourself.');
    expect(presenceLine(1)).toBe('1 owl in the park right now, so you would have the place almost to yourself.');
    expect(presenceLine(14)).toBe('14 owls in the park right now.');
  });

  it('makes nothing up: the price, the keepers, the pictures and the quotes wait for the owner', () => {
    expect(DAY_TICKET_PRICE).toBeNull();
    expect(KEEPER).toBeNull();
    expect(STILLS).toEqual([]);
    expect(PLAYER_QUOTES).toEqual([]);
    expect(OUTSIDE_MENTIONS).toEqual([]);
    const headings = [...aboutParts(), ...grownUpParts()].map((p) => p.heading);
    expect(headings).not.toContain('Who keeps the park');
    expect(headings).not.toContain('What owls say');
  });

  it('answers the questions grown-ups ask, with the price and the keeper only once the owner sets them (the second audit)', () => {
    const questions = faq().map((f) => f.q);
    expect(questions).toContain('Can I get a refund?');
    expect(questions).not.toContain('Who keeps the park?');
    expect(faq().find((f) => f.q === 'What does a Day Ticket cost?')?.a).not.toMatch(/\$/);
    expect(faq('$2').find((f) => f.q === 'What does a Day Ticket cost?')?.a).toBe('A Day Ticket is $2. Your ticket’s time starts at the turnstiles.');
    const named = faq(null, { name: 'A keeper', line: 'One line.' });
    expect(named.find((f) => f.q === 'Who keeps the park?')?.a).toBe('A keeper. One line.');
  });

  it('marks the About page’s questions up for search engines, word for word', () => {
    const raw = readFileSync(join(__dirname, '../../public/about/index.html'), 'utf8');
    const ld = JSON.parse(raw.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]!);
    expect(ld['@type']).toBe('FAQPage');
    expect(ld.mainEntity.map((e: { name: string; acceptedAnswer: { text: string } }) => ({ q: e.name, a: e.acceptedAnswer.text }))).toEqual(faq());
  });

  it('keeps the About page for search engines in step with the screens in the park', () => {
    const about = page('about/index.html');
    expect(about).toContain(ABOUT_WORDS.lead);
    expect(about).toContain(ABOUT_WORDS.grownUpsTitle);
    for (const p of [...aboutParts(), ...grownUpParts()]) {
      expect(about, p.heading).toContain(p.heading);
      // The park's screen says "at exploreowlpark.com/changelog" (no link in the park); the page links it.
      for (const line of p.lines) if (!line.includes('changelog')) expect(about, line).toContain(line);
    }
  });

  it('lists the About page and the changelog in the sitemap, and the sitemap in robots.txt', () => {
    const sitemap = page('sitemap.xml');
    for (const path of ['/', '/about/', '/chatroom-worlds/', '/changelog/']) expect(sitemap).toContain(`<loc>https://exploreowlpark.com${path}</loc>`);
    expect(page('robots.txt')).toContain('Sitemap: https://exploreowlpark.com/sitemap.xml');
  });

  it('gives every page a real lastmod, robots.txt the audit’s minimum, and IndexNow its key file (the SEO audit)', () => {
    const sitemap = page('sitemap.xml');
    const urls = sitemapUrls(sitemap);
    expect(urls.length).toBe(4);
    expect([...sitemap.matchAll(/<lastmod>(\d{4}-\d\d-\d\d)<\/lastmod>/g)].length).toBe(urls.length);
    const robots = page('robots.txt');
    expect(robots).toContain('User-agent: * Allow: /');
    expect(readFileSync(join(__dirname, `../../public/${INDEXNOW_KEY}.txt`), 'utf8')).toBe(INDEXNOW_KEY);
    expect(indexNowBody(urls)).toEqual({ host: 'exploreowlpark.com', key: INDEXNOW_KEY, keyLocation: `https://exploreowlpark.com/${INDEXNOW_KEY}.txt`, urlList: urls });
  });

  it('opens with "Owl Park is", names the site as one Organization, and links Contact on every page (the SEO audit)', () => {
    expect(WHAT_IT_IS.startsWith('Owl Park is ')).toBe(true);
    expect(faq()[0]).toEqual({ q: 'What is Owl Park?', a: WHAT_IT_IS });
    expect(aboutParts().find((p) => p.heading === 'Contact')?.lines).toEqual(CONTACT_LINES);
    const home = readFileSync(join(__dirname, '../../index.html'), 'utf8').replace(/\s+/g, ' ');
    expect(home).toContain('<p>Owl Park is a cozy park you visit in your browser');
    for (const html of [home, page('about/index.html'), page('changelog/index.html'), page('chatroom-worlds/index.html')]) {
      expect(html).toContain('"@type": "Organization", "@id": "https://exploreowlpark.com/#org", "name": "Owl Park"');
      expect(html).toContain('href="/about/#contact"');
      expect(html.match(/<h1[\s>]/g)?.length).toBe(1);
    }
    expect(page('about/index.html')).toContain('<h2 id="contact">Contact</h2>');
  });

  it('dates every change on the changelog, newest first', () => {
    const dates = [...page('changelog/index.html').matchAll(/<time datetime="(\d{4}-\d\d-\d\d)">/g)].map((m) => m[1]!);
    expect(dates.length).toBeGreaterThan(5);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
