/**
 * Tiny event bus between the services and the sync manager. Dependency-free so services (and their node
 * tests) can emit without pulling in supabase-js.
 *   'activity' — a lesson / review / checkpoint just finished: sync soon.
 *   'pulled'   — a pull applied rows locally: screens may want to refresh.
 */
export type SyncEvent = 'activity' | 'pulled';

type Listener = () => void;
const listeners: Record<SyncEvent, Set<Listener>> = { activity: new Set(), pulled: new Set() };

export const syncEvents = {
  emit(event: SyncEvent): void {
    for (const l of listeners[event]) {
      try { l(); } catch (e) { console.warn('[sync] listener failed', e); }
    }
  },
  on(event: SyncEvent, listener: Listener): () => void {
    listeners[event].add(listener);
    return () => listeners[event].delete(listener);
  },
};
