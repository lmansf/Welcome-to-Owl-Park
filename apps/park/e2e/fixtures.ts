import { test as base, expect, type BrowserContext } from '@playwright/test';

/**
 * The browser tests' `test` (OP-140): every test fails on a Content Security Policy violation. The
 * room server's pages carry the park's policy (apps/edge/src/guard.ts), so a source the park needs and
 * the policy leaves out shows here as a failed test, not on a visitor's screen. Every browser context a
 * test opens is watched: the test's own, and those it makes with `browser.newContext`.
 */
export const test = base.extend<{ policyWatch: void }>({
  policyWatch: [
    async ({ context, browser }, use) => {
      const blocked: string[] = [];
      const watch = (c: BrowserContext) =>
        c.on('console', (m) => {
          if (m.type() === 'error' && m.text().includes('Content Security Policy')) blocked.push(m.text());
        });
      watch(context);
      const made = browser.newContext.bind(browser);
      browser.newContext = async (options) => {
        const c = await made(options);
        watch(c);
        return c;
      };
      try {
        await use();
      } finally {
        browser.newContext = made;
      }
      expect(blocked, 'what the page’s policy blocked').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
