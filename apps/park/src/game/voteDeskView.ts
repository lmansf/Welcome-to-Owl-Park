/**
 * The vote desk as it is drawn (OP-288; behind `?desk=1`): a wooden board on two legs on the Great
 * Hollow's floor, its rows of realm names with a bar and a percent each, or a line saying nobody has
 * voted yet this month. It stands among the owls with its foot as its depth, like any piece on the floor.
 * Its rules (where it stands, what it says) are voteDesk.ts's.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '@owl-park/shared';
import { FOOT_SHADOW_DEPTH, footShadow } from './bowlView';
import { DESK_WORDS, type DeskState, VOTE_DESK, deskBox, deskLines, deskRows } from './voteDesk';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const INK = '#F6F1E3';
const DARK = '#0C1E36';
/** Each realm's bar, in the colour its doorway's sign glows (RoomScene's DOOR_TINTS). */
const BAR: Readonly<Record<string, number>> = { grove: 0xffb347, market: 0xff2aa1, glass: 0x9fd0ff };
const ROW_TOP = 58;
const ROW_STEP = 22;
/** How tall its legs stand under the board. */
const LEGS = 26;

export class VoteDeskView {
  private readonly box = deskBox();
  private readonly board: Phaser.GameObjects.Graphics;
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private readonly rows: Phaser.GameObjects.Text[] = [];
  private readonly empty: Phaser.GameObjects.Text;
  private month: string | null = null;
  private shares: Record<string, number> | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    const { x, y, w, h } = this.box;
    const foot: Vec2 = VOTE_DESK.at;
    const depth = foot.y;
    footShadow(scene.add.graphics().setDepth(FOOT_SHADOW_DEPTH), foot.x, foot.y, w * 0.9);
    this.board = scene.add.graphics().setDepth(depth);
    // Two legs down to the floor, then the board on them.
    this.board.fillStyle(0x4a3220, 1);
    this.board.fillRect(x + 28, y + h - LEGS - 4, 10, LEGS + 4);
    this.board.fillRect(x + w - 38, y + h - LEGS - 4, 10, LEGS + 4);
    this.board.fillStyle(0x6b4a2e, 1);
    const boardH = h - LEGS;
    this.board.fillRoundedRect(x, y, w, boardH, 12);
    this.board.lineStyle(4, 0x3a2616, 1);
    this.board.strokeRoundedRect(x, y, w, boardH, 12);
    this.board.fillStyle(0x0c1e36, 0.55);
    this.board.fillRoundedRect(x + 10, y + ROW_TOP - 10, w - 20, ROW_STEP * 3 + 12, 8);
    this.bars = scene.add.graphics().setDepth(depth + 0.01);
    const text = (tx: number, ty: number, words: string, size: number, origin: [number, number], bold = true) => {
      const t = scene.add
        .text(tx, ty, words, {
          fontFamily: FONT,
          fontSize: `${size}px`,
          fontStyle: bold ? '700' : '500',
          color: INK,
          stroke: DARK,
          strokeThickness: 3,
          resolution: 2,
        })
        .setOrigin(...origin)
        .setDepth(depth + 0.02);
      this.texts.push(t);
      return t;
    };
    text(x + w / 2, y + 8, DESK_WORDS.title, 19, [0.5, 0]);
    text(x + w / 2, y + 31, DESK_WORDS.sub, 12, [0.5, 0], false);
    for (let i = 0; i < 3; i++) this.rows.push(text(x + 20, y + ROW_TOP + i * ROW_STEP, '', 13, [0, 0.5]));
    this.empty = text(x + w / 2, y + ROW_TOP + ROW_STEP, DESK_WORDS.empty, 14, [0.5, 0.5]);
    text(x + w / 2, y + h - LEGS - 7, DESK_WORDS.call, 11, [0.5, 1], false);
    this.show(null, null);
  }

  /** The month's shares as they now stand (whole percents by realm), or none heard yet. */
  show(month: string | null, shares: Record<string, number> | null): void {
    this.month = month;
    this.shares = shares;
    const rows = deskRows(shares);
    const { x, y, w } = this.box;
    this.bars.clear();
    this.empty.setVisible(rows.length === 0);
    this.rows.forEach((t, i) => {
      const row = rows[i];
      t.setVisible(!!row);
      if (!row) return;
      t.setText(`${row.name}  ${row.pct}%`);
      // A thin bar under each name, its length the realm's share.
      const barX = x + 20;
      const barW = w - 40;
      const barY = y + ROW_TOP + i * ROW_STEP + 9;
      this.bars.fillStyle(0xf6f1e3, 0.15);
      this.bars.fillRect(barX, barY, barW, 4);
      this.bars.fillStyle(BAR[row.realm] ?? 0xf6f1e3, 1);
      this.bars.fillRect(barX, barY, Math.round((barW * row.pct) / 100), 4);
    });
  }

  state(): DeskState {
    return { at: { ...VOTE_DESK.at }, month: this.month, shares: this.shares ? { ...this.shares } : null, lines: deskLines(this.shares) };
  }

  destroy(): void {
    this.board.destroy();
    this.bars.destroy();
    for (const t of this.texts) t.destroy();
    void this.scene;
  }
}
