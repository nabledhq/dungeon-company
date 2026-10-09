import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunState } from '../src/core/types';
import {
  CORRUPT_SAVE_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  deserializeRun,
  loadRun,
  migrate,
  saveRun,
  serializeRun,
} from '../src/save';
import { makeGame, runRaidToEnd } from './helpers';
import { MemoryStorage } from './storage-helpers';

/** A run with several rooms, monsters and traps, gold, raid > 1 and an unlock entry. */
function buildRun() {
  const game = makeGame((c) => {
    c.economy.starterGold = 5000;
  });
  const lair = game.buildRoom('lair', 1, 0, 'corridor');
  const corridor = game.buildRoom('trap-corridor', 1, 2, 'corridor');
  game.hireMonster(lair.id, 'goblin');
  game.hireMonster(lair.id, 'goblin');
  game.hireMonster(corridor.id, 'goblin');
  game.placeTrap(corridor.id, 'spikes');
  game.placeTrap(lair.id, 'spikes');
  for (let i = 0; i < 2; i++) {
    game.startRaid();
    runRaidToEnd(game);
    game.continueToPreparation();
  }
  game.unlocks.push('room:lair');
  return game;
}

function stubStorage(): MemoryStorage {
  const storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  return storage;
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('serialization', () => {
  it('round-trips a non-trivial run to a deeply equal state', () => {
    const game = buildRun();
    const state = game.snapshot();
    expect(state.dungeon.rooms.length).toBeGreaterThan(3);
    expect(state.dungeon.rooms.flatMap((r) => r.monsterTypeIds).length).toBeGreaterThan(1);
    expect(state.dungeon.rooms.flatMap((r) => r.trapTypeIds).length).toBeGreaterThan(1);
    expect(state.cycle).toBeGreaterThan(1);
    expect(state.unlocks.length).toBeGreaterThan(0);

    const decoded = deserializeRun(serializeRun(state));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.envelope.state).toEqual(state);

    const restored = makeGame();
    restored.restore(decoded.envelope.state);
    expect(restored.snapshot()).toEqual(state);
    const lair = state.dungeon.rooms.find((r) => r.col === 1 && r.row === 0)!;
    expect(restored.gold).toBe(game.gold);
    expect(restored.cycle).toBe(game.cycle);
    // The room id counter is restored, so new rooms do not collide with saved ones.
    const next = restored.buildRoom('lair', 0, 0, lair.id);
    expect(state.dungeon.rooms.some((r) => r.id === next.id)).toBe(false);
  });

  it('round-trips a Results checkpoint including the raid summary', () => {
    const game = makeGame();
    game.startRaid();
    runRaidToEnd(game);
    const state = game.snapshot();
    expect(state.phase).toBe('Results');
    const decoded = deserializeRun(serializeRun(state));
    if (!decoded.ok) throw new Error(decoded.message);
    const restored = makeGame();
    restored.restore(decoded.envelope.state);
    expect(restored.phase).toBe('Results');
    expect(restored.lastResult).toEqual(game.lastResult);
    restored.continueToPreparation();
    expect(restored.phase).toBe('Preparation');
  });

  it('stores an envelope with numeric version and ISO savedAt', () => {
    const storage = stubStorage();
    expect(saveRun(buildRun().snapshot())).toBe(true);
    const envelope = JSON.parse(storage.getItem(SAVE_KEY)!);
    expect(typeof envelope.version).toBe('number');
    expect(envelope.version).toBe(SAVE_VERSION);
    expect(typeof envelope.savedAt).toBe('string');
    expect(new Date(envelope.savedAt).toISOString()).toBe(envelope.savedAt);
    expect(Object.keys(envelope).sort()).toEqual(['savedAt', 'state', 'version']);
  });

  it('snapshot is refused during a raid', () => {
    const game = makeGame();
    game.startRaid();
    expect(() => game.snapshot()).toThrow();
  });
});

describe('migrate', () => {
  it('accepts only the current version', () => {
    expect(migrate({ version: SAVE_VERSION }).ok).toBe(true);
    expect(migrate({ version: SAVE_VERSION + 1 })).toMatchObject({ ok: false, kind: 'incompatible' });
    expect(migrate({ version: '1' })).toMatchObject({ ok: false, kind: 'incompatible' });
    expect(migrate({})).toMatchObject({ ok: false, kind: 'corrupt' });
  });
});

describe('loading', () => {
  it('returns empty when nothing is stored and ok for a valid save', () => {
    stubStorage();
    expect(loadRun()).toEqual({ status: 'empty' });
    const state = buildRun().snapshot();
    saveRun(state);
    const result = loadRun();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.envelope.state).toEqual(state);
  });

  const valid = (): Record<string, unknown> =>
    JSON.parse(serializeRun(buildRun().snapshot())) as Record<string, unknown>;

  const cases: Array<[string, () => string, string]> = [
    ['malformed JSON', () => '{"version": 1, "state": {', 'corrupt'],
    [
      'missing version',
      () => {
        const data = valid();
        delete data.version;
        return JSON.stringify(data);
      },
      'corrupt',
    ],
    ['unknown version', () => JSON.stringify({ ...valid(), version: 999 }), 'incompatible'],
    [
      'missing required fields',
      () => {
        const data = valid();
        const state = data.state as Partial<RunState>;
        delete state.gold;
        return JSON.stringify(data);
      },
      'corrupt',
    ],
    [
      'wrong-typed required fields',
      () => {
        const data = valid();
        (data.state as Record<string, unknown>).dungeon = { rooms: 'nope' };
        return JSON.stringify(data);
      },
      'corrupt',
    ],
    ['a saved Raid phase', () => {
      const data = valid();
      (data.state as Record<string, unknown>).phase = 'Raid';
      return JSON.stringify(data);
    }, 'corrupt'],
  ];

  for (const [name, makeRaw, status] of cases) {
    it(`handles ${name} without throwing and backs up the raw data`, () => {
      const storage = stubStorage();
      const raw = makeRaw();
      storage.setItem(SAVE_KEY, raw);
      let result: ReturnType<typeof loadRun> | undefined;
      expect(() => (result = loadRun())).not.toThrow();
      expect(result?.status).toBe(status);
      expect(storage.getItem(CORRUPT_SAVE_KEY)).toBe(raw);
      expect(storage.getItem(SAVE_KEY)).toBe(raw);
    });
  }

  it('treats a save rejected by the restore check as incompatible', () => {
    const storage = stubStorage();
    const data = valid();
    (data.state as RunState).dungeon.rooms[0].typeId = 'removed-room-type';
    const raw = JSON.stringify(data);
    storage.setItem(SAVE_KEY, raw);
    const result = loadRun((state) => makeGame().restore(state));
    expect(result.status).toBe('incompatible');
    expect(storage.getItem(CORRUPT_SAVE_KEY)).toBe(raw);
  });
});

describe('storage errors', () => {
  it('does not throw when setItem throws (e.g. quota exceeded)', () => {
    const storage = stubStorage();
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    let ok: boolean | undefined;
    expect(() => (ok = saveRun(makeGame().snapshot()))).not.toThrow();
    expect(ok).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it('does not throw when the localStorage getter throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Access denied', 'SecurityError');
      },
    });
    expect(() => saveRun(makeGame().snapshot())).not.toThrow();
    expect(saveRun(makeGame().snapshot())).toBe(false);
    expect(() => loadRun()).not.toThrow();
    expect(loadRun()).toEqual({ status: 'unavailable' });
    expect(console.warn).toHaveBeenCalled();
  });

  it('does not throw when localStorage is undefined', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => saveRun(makeGame().snapshot())).not.toThrow();
    expect(loadRun()).toEqual({ status: 'unavailable' });
  });

  it('does not throw when getItem throws', () => {
    const storage = stubStorage();
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(loadRun()).toEqual({ status: 'unavailable' });
  });
});
