/**
 * Tests only (`@owl-park/shared/testing/egg-code`): the offline park's egg-code key (OP-260), whose public
 * half is LOCAL_EGG_CODE_PUBLIC_KEY, and a code maker like the portfolio site's. Fine to keep in the
 * repository, since the room server never takes that key; the live key's private half lives only with
 * the portfolio site. Never imported by the park's pages.
 */
import { eggCodeBody, formatEggCode } from './eggCode';

export const LOCAL_EGG_CODE_PRIVATE_JWK: JsonWebKey = {
  kty: 'OKP',
  crv: 'Ed25519',
  d: 'P_UBhSRsu1n739-pJqBTR0YdnqeX03ZVzWvn6dmmHrE',
  x: '_ili8TFx3evauC6V4pG3LCCXi3wCHKHqte9N59mFP9I',
};

/** A fresh code signed with `jwk` (by default the offline park's test key), as the portfolio site makes one. */
export async function makeEggCode(jwk: JsonWebKey = LOCAL_EGG_CODE_PRIVATE_JWK): Promise<string> {
  const body = eggCodeBody((n) => crypto.getRandomValues(new Uint8Array(n)));
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
  return formatEggCode(body, new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, body)));
}
