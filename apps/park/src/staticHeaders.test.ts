import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_POLICY } from '@owl-park/shared';

// The static files' own headers (public/_headers): what the asset server sends with every file.
const HEADERS = readFileSync(resolve(import.meta.dirname, '../public/_headers'), 'utf8');

describe('the static files’ headers', () => {
  it('turn off the camera, microphone, location, payments, USB and ad topics, as the Worker’s answers do (OP-246)', () => {
    expect(HEADERS).toContain(`  Permissions-Policy: ${PERMISSIONS_POLICY}\n`);
  });
});
