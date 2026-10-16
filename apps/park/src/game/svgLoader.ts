import type Phaser from 'phaser';

/**
 * Fetch an SVG, validate it, rasterize it at exactly (w, h) and register it as a texture.
 * Returns false (and registers nothing) when the file is missing, is not SVG (dev servers
 * answer unknown paths with index.html), or fails to parse, so callers can substitute a
 * placeholder instead of crashing the loader.
 */
export async function loadSvgTexture(scene: Phaser.Scene, key: string, url: string, w: number, h: number): Promise<boolean> {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return false;
    const text = await res.text();
    if (!/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(text)) return false;
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) return false;
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('preserveAspectRatio', 'none');
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image(w, h);
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error(`could not decode ${url}`));
        el.src = objectUrl;
      });
      if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
      return true;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return false;
  }
}
