import type { RunState } from '../core/types';
import { deserializeRun, serializeRun, type SaveEnvelope, type SaveErrorKind } from './schema';

export const SAVE_KEY = 'dungeon-company:save';
/** Unreadable save data is copied here before anything can overwrite it. */
export const CORRUPT_SAVE_KEY = 'dungeon-company:save:corrupt';

export type LoadResult =
  | { status: 'ok'; envelope: SaveEnvelope }
  /** No save stored. */
  | { status: 'empty' }
  /** localStorage cannot be used; the game runs without persistence. */
  | { status: 'unavailable' }
  | { status: SaveErrorKind; message: string };

/** localStorage, or null when it is missing or access throws (e.g. blocked by privacy settings). */
function getStorage(): Storage | null {
  try {
    const storage = globalThis.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

/** Writes a save checkpoint. Returns false (after a console.warn) if it could not be stored. */
export function saveRun(state: RunState): boolean {
  const storage = getStorage();
  if (!storage) {
    console.warn('Dungeon Company: localStorage is unavailable, the run will not be saved');
    return false;
  }
  try {
    storage.setItem(SAVE_KEY, serializeRun(state));
    return true;
  } catch (err) {
    console.warn('Dungeon Company: could not save the run', err);
    return false;
  }
}

/**
 * Reads the stored run. Never throws. Corrupt or incompatible data is copied to
 * CORRUPT_SAVE_KEY and reported in the result; the original key is left as it was.
 * `check` may throw to reject a well-formed state that cannot be restored (for
 * example one referencing content that is no longer registered).
 */
export function loadRun(check?: (state: RunState) => void): LoadResult {
  const storage = getStorage();
  if (!storage) {
    console.warn('Dungeon Company: localStorage is unavailable, saves are disabled');
    return { status: 'unavailable' };
  }
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch (err) {
    console.warn('Dungeon Company: could not read the save', err);
    return { status: 'unavailable' };
  }
  if (raw === null) return { status: 'empty' };
  const decoded = deserializeRun(raw);
  if (!decoded.ok) {
    preserveCorrupt(raw);
    return { status: decoded.kind, message: decoded.message };
  }
  try {
    check?.(decoded.envelope.state);
  } catch (err) {
    preserveCorrupt(raw);
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'incompatible', message: `Save cannot be restored: ${message}` };
  }
  return { status: 'ok', envelope: decoded.envelope };
}

/** Copies unusable save data aside so it survives the next save. Never throws. */
export function preserveCorrupt(raw: string): void {
  try {
    getStorage()?.setItem(CORRUPT_SAVE_KEY, raw);
  } catch (err) {
    console.warn('Dungeon Company: could not back up the unreadable save', err);
  }
}
