/**
 * The shareable quiz result (OP-392, Dec 1 plan D8): `/owl/<nature>`, one page for each of the five owls
 * the Which owl are you quiz gives (packages/shared/src/owlShare.ts). It shows the owl's name, a true
 * fact about it and a way into the park, and carries the park's share picture for link previews. It is
 * the same page for everyone, holds nothing personal, and has no script. An address naming no owl goes
 * to the park's front page.
 */
import { OWL_SHARE_WORDS as W, natureOfSharePath, owlSharePath, owlWithArticle, type NatureDef } from '@owl-park/shared';
import { guardedPage } from './guard';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#0C1E36;color:#F6F1E3;font:17px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center}
main{max-width:560px;width:100%;padding:32px 20px 40px;text-align:center}
img{width:100%;height:auto;border-radius:18px;border:1px solid rgba(246,241,227,.18);margin:0 0 20px}
.ask{margin:0;color:#FFD36A;font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:14px}
h1{margin:6px 0 14px;font-size:38px;line-height:1.15;color:#FFD36A}
p{margin:0 0 14px}
.play{display:inline-block;margin:10px 0 8px;padding:14px 30px;border-radius:999px;background:#C9A227;color:#0C1E36;font-weight:800;font-size:18px;text-decoration:none}
.play:focus-visible{outline:3px solid #F6F1E3;outline-offset:3px}
.free{font-size:14px;opacity:.8}
`;

/** The page for one owl, as HTML; `origin` is the park's own (https://exploreowlpark.com). */
export function owlPageHtml(def: NatureDef, origin: string): string {
  const url = `${origin}${owlSharePath(def.id)}`;
  const image = `${origin}/og-image.jpg`;
  const title = W.pageTitle(def);
  const description = `${W.ask} This one is ${owlWithArticle(def)}. ${def.fact}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/png" href="/favicon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Owl Park">
<meta property="og:title" content="${esc(`${W.ask} ${def.title}`)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The Owl Park mascot, a great horned owl, beside the moonlit hollow inside the park's ancient tree.">
<meta name="twitter:card" content="summary_large_image">
<style>${STYLE}</style>
</head>
<body>
<main>
<img src="/og-image.webp" width="1200" height="630" alt="The moonlit hollow inside Owl Park's ancient tree, with the park's great horned owl.">
<p class="ask">${esc(W.ask)}</p>
<h1 data-owl="${esc(def.id)}">${esc(def.title)}</h1>
<p>${esc(def.fact)}</p>
<p>${esc(def.enjoy)}</p>
<a class="play" href="/">${esc(W.play)}</a>
<p class="free">${esc(W.free)}</p>
</main>
</body>
</html>
`;
}

/** `/owl/<nature>`: that owl's page, under the park's own page policy; any other owl goes to the front page. */
export async function owlPage(url: URL): Promise<Response> {
  const def = natureOfSharePath(url.pathname);
  if (!def) return new Response(null, { status: 302, headers: { Location: '/' } });
  const page = new Response(owlPageHtml(def, url.origin), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
  return guardedPage(page, url);
}
