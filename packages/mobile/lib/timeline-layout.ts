import { minutes } from "./planner";
import type { Task } from "./planner";

/** `visualMinutes` is how much of the day the block is drawn over; the block's height must not exceed it. */
export type LanePlacement = { lane: number; lanes: number; visualMinutes: number };

type Block = { id: string; start: number; end: number; visualMinutes: number };

/**
 * Assigns side-by-side lanes to timeline blocks. Blocks are grouped into clusters of
 * transitively overlapping blocks; every block in a cluster shares the cluster's lane count.
 * Each block occupies at least `minVisualMinutes` so short tasks that render taller than
 * their duration do not visually collide with the next one, except that a task which does not
 * really overlap the next one is only stretched up to that one's start (but not below
 * `floorVisualMinutes`), so back-to-back tasks stay in one lane instead of looking like a clash.
 */
export function layoutLanes(
  tasks: Pick<Task, "id" | "start" | "duration">[],
  minVisualMinutes: number,
  floorVisualMinutes: number = minVisualMinutes,
): Record<string, LanePlacement> {
  const starts = tasks.filter(t => t.start !== null).map(t => minutes(t.start as string));
  const blocks: Block[] = tasks
    .filter(t => t.start !== null)
    .map(t => {
      const start = minutes(t.start as string);
      const realEnd = start + t.duration;
      const nextStart = Math.min(Infinity, ...starts.filter(s => s >= realEnd && s > start));
      const stretch = Math.min(minVisualMinutes, Math.max(nextStart - start, floorVisualMinutes));
      const visualMinutes = Math.max(t.duration, stretch);
      return { id: t.id, start, end: start + visualMinutes, visualMinutes };
    })
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

  const result: Record<string, LanePlacement> = {};
  let cluster: { id: string; lane: number; visualMinutes: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const member of cluster) result[member.id] = { lane: member.lane, lanes: laneEnds.length, visualMinutes: member.visualMinutes };
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const block of blocks) {
    if (cluster.length > 0 && block.start >= clusterEnd) flush();
    const free = laneEnds.findIndex(end => end <= block.start);
    const lane = free === -1 ? laneEnds.length : free;
    laneEnds[lane] = block.end;
    cluster.push({ id: block.id, lane, visualMinutes: block.visualMinutes });
    clusterEnd = Math.max(clusterEnd, block.end);
  }
  flush();

  return result;
}
