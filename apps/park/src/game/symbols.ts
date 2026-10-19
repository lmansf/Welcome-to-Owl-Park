/**
 * Small white shapes for collectible effects, emote bursts and HUD icons: drawn once on a
 * canvas, then tinted. No letters anywhere (an emote's "zz" is bubbles, a surprise is a bar
 * and a dot), so nothing here needs translating or reviewing as text.
 */
import Phaser from 'phaser';

export type SymbolName =
  | 'dot'
  | 'star4'
  | 'star5'
  | 'heart'
  | 'note'
  | 'flake'
  | 'leaf'
  | 'petal'
  | 'ring'
  | 'bolt'
  | 'flame'
  | 'square'
  | 'crescent'
  | 'diamond'
  | 'triangle'
  | 'puff'
  | 'bang'
  | 'spark'
  | 'bubble'
  | 'ask'
  | 'feather'
  | 'fallen'
  | 'acorn'
  | 'gear'
  | 'gem';

const S = 32;
const TAU = Math.PI * 2;

function draw(ctx: CanvasRenderingContext2D, name: SymbolName): void {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const c = S / 2;
  ctx.beginPath();
  switch (name) {
    case 'dot':
      ctx.arc(c, c, 10, 0, TAU);
      ctx.fill();
      break;
    case 'star4':
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const r = i % 2 ? 4 : 15;
        ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 'star5':
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 ? 6 : 14;
        ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 'heart':
      ctx.moveTo(c, 27);
      ctx.bezierCurveTo(1, 16, 6, 3, c, 10);
      ctx.bezierCurveTo(26, 3, 31, 16, c, 27);
      ctx.fill();
      break;
    case 'note':
      ctx.ellipse(11, 23, 6, 4.5, -0.4, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.moveTo(16, 22);
      ctx.lineTo(16, 5);
      ctx.quadraticCurveTo(24, 8, 26, 14);
      ctx.stroke();
      break;
    case 'flake':
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        ctx.moveTo(c + Math.cos(a) * 13, c + Math.sin(a) * 13);
        ctx.lineTo(c - Math.cos(a) * 13, c - Math.sin(a) * 13);
      }
      ctx.stroke();
      break;
    case 'leaf':
      ctx.ellipse(c, c, 13, 6, -0.6, 0, TAU);
      ctx.fill();
      break;
    case 'petal':
      ctx.moveTo(c, 4);
      ctx.quadraticCurveTo(28, 18, c, 28);
      ctx.quadraticCurveTo(4, 18, c, 4);
      ctx.fill();
      break;
    case 'ring':
      ctx.lineWidth = 3;
      ctx.arc(c, c, 11, 0, TAU);
      ctx.stroke();
      break;
    case 'bubble':
      ctx.lineWidth = 2;
      ctx.arc(c, c, 10, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c - 4, c - 4, 2.5, 0, TAU);
      ctx.fill();
      break;
    case 'bolt':
      for (const [x, y] of [[19, 2], [8, 17], [15, 17], [11, 30], [25, 12], [17, 12], [22, 2]]) ctx.lineTo(x!, y!);
      ctx.closePath();
      ctx.fill();
      break;
    case 'flame':
      ctx.moveTo(c, 2);
      ctx.bezierCurveTo(28, 14, 26, 30, c, 30);
      ctx.bezierCurveTo(6, 30, 4, 14, c, 2);
      ctx.fill();
      break;
    case 'square':
      ctx.rect(9, 9, 14, 14);
      ctx.fill();
      break;
    case 'crescent':
      ctx.arc(c, c, 12, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(c + 6, c - 4, 10, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    case 'diamond':
      ctx.moveTo(c, 3);
      ctx.lineTo(28, c);
      ctx.lineTo(c, 29);
      ctx.lineTo(4, c);
      ctx.closePath();
      ctx.fill();
      break;
    case 'triangle':
      ctx.moveTo(c, 4);
      ctx.lineTo(28, 27);
      ctx.lineTo(4, 27);
      ctx.closePath();
      ctx.fill();
      break;
    case 'puff':
      ctx.arc(11, 19, 8, 0, TAU);
      ctx.arc(20, 14, 9, 0, TAU);
      ctx.arc(22, 22, 7, 0, TAU);
      ctx.fill();
      break;
    case 'bang':
      ctx.rect(13, 3, 6, 18);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(c, 27, 3.5, 0, TAU);
      ctx.fill();
      break;
    case 'spark':
      ctx.lineWidth = 3;
      ctx.moveTo(c, 3);
      ctx.lineTo(c, 29);
      ctx.stroke();
      break;
    case 'ask':
      // A hook and a dot: something to hand back.
      ctx.lineWidth = 5;
      ctx.arc(c, 10, 7, Math.PI, Math.PI * 2.5);
      ctx.lineTo(c, 21);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c, 27, 3.5, 0, TAU);
      ctx.fill();
      break;
    case 'feather':
      // A vane leaning right, split by its shaft, with a notch; the bare quill below.
      ctx.moveTo(5, 28);
      ctx.bezierCurveTo(6, 16, 15, 6, 28, 3);
      ctx.bezierCurveTo(27, 15, 18, 24, 7, 27);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(5, 29);
      ctx.quadraticCurveTo(15, 18, 28, 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(9, 15);
      ctx.lineTo(14, 17.5);
      ctx.lineTo(10, 19.5);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(2.5, 31);
      ctx.lineTo(7, 26);
      ctx.stroke();
      break;
    case 'fallen':
      // A pointed leaf with its midrib.
      ctx.moveTo(3, c);
      ctx.quadraticCurveTo(c, 3, 29, c);
      ctx.quadraticCurveTo(c, 29, 3, c);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(6, c);
      ctx.lineTo(27, c);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      break;
    case 'acorn':
      // The nut, the cap over it (a thin gap between) and the stem.
      ctx.ellipse(c, 20, 8, 9.5, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(c, 14, 11, 7, 0, Math.PI, TAU);
      ctx.fill();
      ctx.fillRect(c - 1.5, 3, 3, 5);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(4, 14, 24, 1.6);
      ctx.globalCompositeOperation = 'source-over';
      break;
    case 'gear':
      ctx.arc(c, c, 10, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.translate(c, c);
        ctx.rotate((i * Math.PI) / 4);
        ctx.fillRect(-3, -15, 6, 7);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(c, c, 4, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    case 'gem':
      // A smooth moonstone with a crescent of light across it.
      ctx.ellipse(c, c, 11, 13, 0, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c + 3, c + 2, 8, Math.PI * 1.05, Math.PI * 1.55);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      break;
  }
}

const canvases = new Map<SymbolName, HTMLCanvasElement>();

/** The 32 x 32 white canvas of a symbol (cached). */
export function symbolCanvas(name: SymbolName): HTMLCanvasElement {
  let c = canvases.get(name);
  if (!c) {
    c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d');
    if (ctx) draw(ctx, name);
    canvases.set(name, c);
  }
  return c;
}

/** The Phaser texture key for a symbol, creating it on first use. */
export function symbolTexture(scene: Phaser.Scene, name: SymbolName): string {
  const key = `sym-${name}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, symbolCanvas(name));
  return key;
}
