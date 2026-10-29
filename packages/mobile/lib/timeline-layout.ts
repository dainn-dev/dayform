import { minutes } from "./planner";
import type { Task } from "./planner";

export type LanePlacement = { lane: number; lanes: number };

type Block = { id: string; start: number; end: number };

/**
 * Assigns side-by-side lanes to timeline blocks. Blocks are grouped into clusters of
 * transitively overlapping blocks; every block in a cluster shares the cluster's lane count.
 * Each block occupies at least `minVisualMinutes` so short tasks that render taller than
 * their duration do not visually collide with the next one.
 */
export function layoutLanes(
  tasks: Pick<Task, "id" | "start" | "duration">[],
  minVisualMinutes: number,
): Record<string, LanePlacement> {
  const blocks: Block[] = tasks
    .filter(t => t.start !== null)
    .map(t => {
      const start = minutes(t.start as string);
      return { id: t.id, start, end: start + Math.max(t.duration, minVisualMinutes) };
    })
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

  const result: Record<string, LanePlacement> = {};
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const member of cluster) result[member.id] = { lane: member.lane, lanes: laneEnds.length };
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const block of blocks) {
    if (cluster.length > 0 && block.start >= clusterEnd) flush();
    const free = laneEnds.findIndex(end => end <= block.start);
    const lane = free === -1 ? laneEnds.length : free;
    laneEnds[lane] = block.end;
    cluster.push({ id: block.id, lane });
    clusterEnd = Math.max(clusterEnd, block.end);
  }
  flush();

  return result;
}
