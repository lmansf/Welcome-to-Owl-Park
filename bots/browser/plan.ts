/** One room as the browser walk reads it from out/plan.json (written by playtest/plan.plan.ts). */
export interface PlanRoom {
  id: string;
  side: boolean;
  ground: number;
  size: { w: number; h: number };
  spawns: Record<string, { x: number; y: number }>;
  doors: Array<{ id: string; x: number; y: number; w: number; h: number; top: number; to: string | null }>;
  /** Where an owl may stand on the plan: the floor's polygons, and each ledge's (with its lowest top). */
  floor: Array<Array<{ x: number; y: number }>>;
  ledges: Array<{ id: string; low: number; area: Array<{ x: number; y: number }> }>;
  keeperOnly: boolean;
}
