import { describe, expect, it } from 'vitest';
import type { RunState } from '../src/core/types';
import { makeGame, runRaidToEnd } from './helpers';

function recordCheckpoints() {
  const game = makeGame((c) => {
    c.economy.starterGold = 5000;
  });
  const saved: RunState[] = [];
  game.onCheckpoint((state) => saved.push(state));
  return { game, saved };
}

describe('autosave checkpoints', () => {
  it('fire after each committed Preparation change', () => {
    const { game, saved } = recordCheckpoints();
    const room = game.buildRoom('lair', 1, 0, 'corridor');
    expect(saved).toHaveLength(1);
    expect(saved[0].dungeon.rooms.some((r) => r.id === room.id)).toBe(true);
    game.hireMonster(room.id, 'goblin');
    expect(saved).toHaveLength(2);
    game.placeTrap(room.id, 'spikes');
    expect(saved).toHaveLength(3);
    game.removeRoom(room.id);
    expect(saved).toHaveLength(4);
    expect(saved.at(-1)).toEqual(game.snapshot());
  });

  it('do not fire for rejected actions', () => {
    const { game, saved } = recordCheckpoints();
    expect(() => game.buildRoom('lair', 1, 1, 'corridor')).toThrow();
    expect(saved).toHaveLength(0);
  });

  it('never fire during a raid, then fire on entering and leaving Results', () => {
    const { game, saved } = recordCheckpoints();
    game.startRaid();
    for (let i = 0; i < 100_000 && game.phase === 'Raid'; i++) {
      game.update(16);
      if (game.phase === 'Raid') expect(saved).toHaveLength(0);
    }
    expect(game.phase).toBe('Results');
    expect(saved).toHaveLength(1);
    expect(saved[0].phase).toBe('Results');
    expect(saved[0].lastResult).toEqual(game.lastResult);

    game.continueToPreparation();
    expect(saved).toHaveLength(2);
    expect(saved[1].phase).toBe('Preparation');
    expect(saved[1].cycle).toBe(1);
  });

  it('the latest checkpoint before a raid is the pre-raid Preparation state', () => {
    const { game, saved } = recordCheckpoints();
    game.hireMonster('lair', 'goblin');
    const beforeRaid = game.snapshot();
    game.startRaid();
    game.update(500);
    // A refresh now would restore the last checkpoint: the state just before the raid.
    expect(saved.at(-1)).toEqual(beforeRaid);
    const restored = makeGame();
    restored.restore(saved.at(-1)!);
    expect(restored.phase).toBe('Preparation');
    expect(restored.cycle).toBe(0);
    expect(restored.raid).toBeNull();
  });

  it('restore leaves the run untouched when the state references unknown content', () => {
    const game = makeGame();
    runRaidToEnd((game.startRaid(), game));
    game.continueToPreparation();
    const before = game.snapshot();
    const bad = structuredClone(before);
    bad.dungeon.rooms[0].monsterTypeIds.push('dragon-that-does-not-exist');
    expect(() => game.restore(bad)).toThrow();
    expect(game.snapshot()).toEqual(before);
  });
});
