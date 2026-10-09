import type { Dungeon, RaidResult, Room, RunState } from '../core/types';

/** Bump when the shape of RunState changes, and teach migrate() the old version. */
export const SAVE_VERSION = 1;

export interface SaveEnvelope {
  version: number;
  /** ISO-8601 timestamp of the save. */
  savedAt: string;
  state: RunState;
}

/** Why stored data could not be turned into a run. */
export type SaveErrorKind = 'corrupt' | 'incompatible';

export type DecodeResult =
  | { ok: true; envelope: SaveEnvelope }
  | { ok: false; kind: SaveErrorKind; message: string };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

export function serializeRun(state: RunState, now = new Date()): string {
  const envelope: SaveEnvelope = { version: SAVE_VERSION, savedAt: now.toISOString(), state };
  return JSON.stringify(envelope);
}

/** Parses, migrates and validates a stored string. Never throws. */
export function deserializeRun(raw: string): DecodeResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, kind: 'corrupt', message: 'Save data is not valid JSON' };
  }
  const migrated = migrate(data);
  if (!migrated.ok) return migrated;
  const envelope = migrated.data;
  if (!isStr(envelope.savedAt) || Number.isNaN(Date.parse(envelope.savedAt))) {
    return { ok: false, kind: 'corrupt', message: 'Save data has no valid savedAt timestamp' };
  }
  const problem = validateRunState(envelope.state);
  if (problem) return { ok: false, kind: 'corrupt', message: `Save data is invalid: ${problem}` };
  return { ok: true, envelope: envelope as unknown as SaveEnvelope };
}

/**
 * Upgrades parsed save data to the current version. Only SAVE_VERSION is accepted
 * for now; any other version is rejected as incompatible.
 */
export function migrate(
  data: unknown,
): { ok: true; data: Obj } | { ok: false; kind: SaveErrorKind; message: string } {
  if (!isObj(data) || !('version' in data)) {
    return { ok: false, kind: 'corrupt', message: 'Save data has no version' };
  }
  if (data.version !== SAVE_VERSION) {
    return {
      ok: false,
      kind: 'incompatible',
      message: `Save version ${String(data.version)} is not supported (expected ${SAVE_VERSION})`,
    };
  }
  return { ok: true, data };
}

/** Returns a description of the first problem found, or null when the state is well-formed. */
export function validateRunState(v: unknown): string | null {
  if (!isObj(v)) return 'state is missing';
  if (v.phase !== 'Preparation' && v.phase !== 'Results') return 'phase must be Preparation or Results';
  if (!isNum(v.gold) || v.gold < 0) return 'gold must be a non-negative number';
  if (!isInt(v.cycle) || v.cycle < 0) return 'cycle must be a non-negative integer';
  if (!isInt(v.nextRoomNumber) || v.nextRoomNumber < 1) return 'nextRoomNumber must be a positive integer';
  if (!isStrArray(v.unlocks)) return 'unlocks must be a list of ids';
  const dungeonProblem = validateDungeon(v.dungeon);
  if (dungeonProblem) return dungeonProblem;
  if (v.lastResult !== null && !isRaidResult(v.lastResult)) return 'lastResult is malformed';
  if (v.phase === 'Results' && v.lastResult === null) return 'Results phase needs lastResult';
  return null;
}

function validateDungeon(v: unknown): string | null {
  if (!isObj(v)) return 'dungeon is missing';
  const d = v as Partial<Record<keyof Dungeon, unknown>>;
  if (!Array.isArray(d.rooms) || d.rooms.length === 0) return 'dungeon.rooms must be a non-empty list';
  if (!d.rooms.every(isRoom)) return 'dungeon.rooms contains a malformed room';
  if (
    !Array.isArray(d.connections) ||
    !d.connections.every((c) => Array.isArray(c) && c.length === 2 && c.every(isStr))
  ) {
    return 'dungeon.connections must be a list of id pairs';
  }
  if (!isStr(d.entranceId) || !isStr(d.coreId)) return 'dungeon entrance and core ids are required';
  return null;
}

function isRoom(v: unknown): v is Room {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.typeId) &&
    isInt(v.col) &&
    isInt(v.row) &&
    isStrArray(v.monsterTypeIds) &&
    isStrArray(v.trapTypeIds)
  );
}

function isRaidResult(v: unknown): v is RaidResult {
  return (
    isObj(v) &&
    isInt(v.cycle) &&
    (v.outcome === 'success' || v.outcome === 'failure') &&
    isNum(v.goldDelta) &&
    isNum(v.goldBefore) &&
    isNum(v.goldAfter) &&
    isNum(v.partyStrengthStart) &&
    isNum(v.partyStrengthEnd) &&
    isInt(v.roomsVisited)
  );
}
