/**
 * The playtest's runs: the rooms split over a few test files run side by side (each writes its rooms'
 * reports to out/rooms), then the verdict, which reads them all, reads each course through its acts,
 * and holds the lot against the kid bar and the baseline (baseline.json).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COURSES, ROOMS } from '@owl-park/shared/rooms';
import { KID_BAR, playtestCourse, playtestRoom, sideRooms, type CourseReport, type RoomReport } from './playtest';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = join(ROOT, 'out');
const ROOMS_OUT = join(OUT, 'rooms');

/** How many test files the rooms are split over. */
export const SHARDS = 6;

/** The rooms of shard `k`: dealt out biggest first (by perches) to the lightest shard, so the shards take about as long. */
export function shardRooms(k: number): string[] {
  const ids = sideRooms().sort((a, b) => (ROOMS[b]!.perches?.length ?? 0) - (ROOMS[a]!.perches?.length ?? 0) || a.localeCompare(b));
  const load = Array.from({ length: SHARDS }, () => 0);
  const out: string[][] = Array.from({ length: SHARDS }, () => []);
  for (const id of ids) {
    const i = load.indexOf(Math.min(...load));
    out[i]!.push(id);
    load[i]! += 1 + (ROOMS[id]!.perches?.length ?? 0) ** 2;
  }
  return out[k]!;
}

export function runRoom(id: string): RoomReport {
  const r = playtestRoom(id);
  mkdirSync(ROOMS_OUT, { recursive: true });
  writeFileSync(join(ROOMS_OUT, `${id}.json`), JSON.stringify(r, null, 1));
  return r;
}

/** A finding the check fails on (unless the baseline knows it). */
export interface Finding {
  /** Stable across runs: what the baseline lists. */
  key: string;
  what: string;
}

export interface Verdict {
  kidBar: number;
  rooms: RoomReport[];
  courses: CourseReport[];
  /** Findings the baseline doesn't list: the check fails on these. */
  blockers: Finding[];
  /** Findings the baseline lists: known, shown, not failed on. */
  known: Finding[];
  /** Baseline entries no longer found: fixed, to take out of the baseline. */
  fixed: string[];
  /** Things worth a look that fail nothing (a hard optional hop, a slow room). */
  notes: string[];
  missingRooms: string[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function findings(rooms: readonly RoomReport[], courses: readonly CourseReport[]): Finding[] {
  const out: Finding[] = [];
  for (const r of rooms) {
    for (const s of r.floating) out.push({ key: `floating:${r.room}:${s}`, what: `${r.room}: spawn ${s} stands on nothing` });
    for (const s of r.stuck) out.push({ key: `stuck:${r.room}:${s.surface}`, what: `${r.room}: an owl on ${s.surface} (x ${s.x0} to ${s.x1}, ${Math.round(s.top)} up) can't get to any doorway` });
    for (const t of r.targets) {
      if (t.reachable) continue;
      const what = t.kind === 'door' ? `doorway ${t.id}` : t.kind === 'leaves' ? `leaf pile ${t.id}` : `${t.kind} ${t.id}`;
      out.push({ key: `unreachable:${r.room}:${t.id}`, what: `${r.room}: no way to ${what}${t.required ? ' (the course needs it)' : ''}` });
    }
  }
  for (const c of courses) {
    for (const h of c.underBar) out.push({ key: `bar:${c.course}:${h.room}:${h.from}>${h.to}`, what: `${c.course}: the hop ${h.from} to ${h.to} in ${h.room} lands ${pct(h.rate)} of a kid's tries (bar ${pct(KID_BAR)})` });
  }
  return out;
}

export function readRooms(): { rooms: RoomReport[]; missing: string[] } {
  const want = sideRooms();
  const rooms: RoomReport[] = [];
  const missing: string[] = [];
  for (const id of want) {
    const f = join(ROOMS_OUT, `${id}.json`);
    if (existsSync(f)) rooms.push(JSON.parse(readFileSync(f, 'utf8')) as RoomReport);
    else missing.push(id);
  }
  return { rooms, missing };
}

export function verdict(): Verdict {
  const { rooms, missing } = readRooms();
  const byId = new Map(rooms.map((r) => [r.room, r]));
  const courses = Object.values(COURSES)
    .filter((c) => [...c.acts, ...(c.rooms ?? [])].some((id) => byId.has(id)))
    .map((c) => playtestCourse(c, byId));
  const baseline = new Set<string>((JSON.parse(readFileSync(join(ROOT, 'baseline.json'), 'utf8')) as { known: Array<{ key: string }> }).known.map((k) => k.key));
  const all = findings(rooms, courses);
  const notes: string[] = [];
  for (const r of rooms) {
    for (const t of r.targets) if (!t.required && t.reachable && t.weakest && t.weakest.rate < KID_BAR) notes.push(`${r.room}: ${t.kind} ${t.id} takes a hop a kid lands ${pct(t.weakest.rate)} of the time (${t.weakest.from} to ${t.weakest.to})`);
  }
  const found = new Set(all.map((f) => f.key));
  return {
    kidBar: KID_BAR,
    rooms,
    courses,
    blockers: all.filter((f) => !baseline.has(f.key)),
    known: all.filter((f) => baseline.has(f.key)),
    fixed: [...baseline].filter((k) => !found.has(k)),
    notes,
    missingRooms: missing,
  };
}

export function writeVerdict(v: Verdict): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'sim.json'), JSON.stringify(v, null, 1));
}

/** The room reports already written (for a rerun of the verdict alone). */
export function writtenRooms(): string[] {
  return existsSync(ROOMS_OUT) ? readdirSync(ROOMS_OUT).map((f) => f.replace(/\.json$/, '')) : [];
}
