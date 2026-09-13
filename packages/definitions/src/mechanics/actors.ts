import { eventPriority, type MechanicsScheduler } from './scheduler.js';
export interface ActorInstance<T> {
  id: string;
  templateId: string;
  parentId: string;
  expireWithParent: boolean;
  createdAt: number;
  expiresAt: number | null;
  value: T;
}
/** Owns identity and expiration. Game adapters decide what a subordinate actor attacks. */
export function createActorRuntime<T>(
  clock: MechanicsScheduler,
  expired: (actor: ActorInstance<T>) => void
) {
  const actors = new Map<string, ActorInstance<T>>();
  const expirations = new Map<string, () => void>();
  let serial = 0;
  const remove = (id: string) => {
    const actor = actors.get(id);
    if (!actor) return false;
    actors.delete(id);
    expirations.get(id)?.();
    expirations.delete(id);
    for (const child of [...actors.values()])
      if (child.parentId === id && child.expireWithParent) remove(child.id);
    expired(actor);
    return true;
  };
  return {
    spawn(
      parentId: string,
      templateId: string,
      lifetimeSeconds: number,
      value: T,
      expireWithParent = true
    ) {
      if (!parentId || !templateId || !Number.isFinite(lifetimeSeconds) || lifetimeSeconds < 0)
        throw new Error('Invalid actor lifecycle.');
      if (actors.size >= 256) throw new Error('Actor budget exceeded.');
      const actor: ActorInstance<T> = {
        id: `${parentId}/${templateId}/${serial++}`,
        parentId,
        templateId,
        expireWithParent,
        createdAt: clock.now,
        expiresAt: lifetimeSeconds ? clock.now + lifetimeSeconds : null,
        value
      };
      if (actor.expiresAt !== null)
        expirations.set(
          actor.id,
          clock.schedule(actor.expiresAt, eventPriority.expire, () => remove(actor.id))
        );
      actors.set(actor.id, actor);
      return actor;
    },
    has(id: string) {
      return actors.has(id);
    },
    remove,
    removeChildren(parentId: string) {
      for (const actor of [...actors.values()])
        if (actor.parentId === parentId && actor.expireWithParent) remove(actor.id);
    },
    snapshot() {
      return structuredClone([...actors.values()]);
    }
  };
}
