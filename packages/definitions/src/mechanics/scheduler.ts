/** One deterministic clock for mechanical events. Priorities order simultaneous effects. */
export const eventPriority = {
  expire: 0,
  round: 1,
  activation: 2,
  emission: 3,
  impact: 4,
  collection: 5
} as const;
export function createMechanicsScheduler(maxEvents = 100000) {
  let now = 0;
  let sequence = 0;
  let executed = 0;
  const queue: {
    at: number;
    priority: number;
    order: number;
    run: () => void;
    cancelled: boolean;
  }[] = [];
  return {
    get now() {
      return now;
    },
    get nextTime(): number | null {
      const next = Math.min(...queue.filter((event) => !event.cancelled).map((event) => event.at));
      return next === Infinity ? null : next;
    },
    schedule(at: number, priority: number, run: () => void) {
      if (!Number.isFinite(at) || at < now || !Number.isFinite(priority))
        throw new Error('Cannot schedule an invalid time or an event in the past.');
      if (queue.length >= maxEvents) throw new Error('Mechanical event queue budget exceeded.');
      const event = { at, priority, order: sequence++, run, cancelled: false };
      queue.push(event);
      return () => {
        event.cancelled = true;
        const index = queue.indexOf(event);
        if (index >= 0) queue.splice(index, 1);
      };
    },
    advance(until: number, inclusive = false) {
      if (!Number.isFinite(until) || until < now)
        throw new Error('Cannot reverse the mechanical clock.');
      while (true) {
        queue.sort((a, b) => a.at - b.at || a.priority - b.priority || a.order - b.order);
        const event = queue[0];
        if (!event || event.at > until || (!inclusive && event.at === until)) break;
        queue.shift();
        if (event.cancelled) continue;
        if (++executed > maxEvents) throw new Error('Mechanical event execution budget exceeded.');
        now = event.at;
        event.run();
      }
      now = until;
    }
  };
}
export type MechanicsScheduler = ReturnType<typeof createMechanicsScheduler>;
