import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config';
import { GameError, IllegalTransitionError } from '../src/core/errors';
import { makeGame, runRaidToEnd, snapshot } from './helpers';

describe('new game', () => {
  it('starts in Preparation with starter gold and rooms from config', () => {
    const game = makeGame();
    expect(game.phase).toBe('Preparation');
    expect(game.cycle).toBe(0);
    expect(game.gold).toBe(DEFAULT_CONFIG.economy.starterGold);
    expect(game.dungeon.rooms).toHaveLength(DEFAULT_CONFIG.dungeon.rooms.length);
    expect(game.dungeon.rooms.length).toBeGreaterThanOrEqual(3);
    expect(game.dungeon.entranceId).toBe(DEFAULT_CONFIG.dungeon.entranceId);
    expect(game.dungeon.coreId).toBe(DEFAULT_CONFIG.dungeon.coreId);
  });

  it('follows config overrides', () => {
    const game = makeGame((c) => {
      c.economy.starterGold = 77;
      c.dungeon.rooms = [
        { id: 'a', typeId: 'entrance', col: 0, row: 0 },
        { id: 'b', typeId: 'lair', col: 1, row: 0 },
        { id: 'c', typeId: 'treasure-room', col: 2, row: 0 },
      ];
      c.dungeon.connections = [
        ['a', 'b'],
        ['b', 'c'],
      ];
      c.dungeon.entranceId = 'a';
      c.dungeon.coreId = 'c';
    });
    expect(game.gold).toBe(77);
    expect(game.dungeon.rooms.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('newGame() resets state', () => {
    const game = makeGame();
    game.hireMonster('lair', 'goblin');
    game.startRaid();
    game.newGame();
    expect(game.phase).toBe('Preparation');
    expect(game.cycle).toBe(0);
    expect(game.gold).toBe(DEFAULT_CONFIG.economy.starterGold);
    expect(game.raid).toBeNull();
  });
});

describe('phase machine', () => {
  it('cycles Preparation → Raid → Results → Preparation', () => {
    const game = makeGame();
    expect(game.canTransitionTo('Raid')).toBe(true);
    game.startRaid();
    expect(game.phase).toBe('Raid');
    expect(game.raid).not.toBeNull();

    runRaidToEnd(game);
    expect(game.phase).toBe('Results');
    expect(game.lastResult).not.toBeNull();

    game.continueToPreparation();
    expect(game.phase).toBe('Preparation');
    expect(game.raid).toBeNull();
  });

  it('rejects Start Raid during Raid and leaves state unchanged', () => {
    const game = makeGame();
    game.startRaid();
    game.update(500);
    const before = snapshot(game);
    expect(() => game.startRaid()).toThrow(IllegalTransitionError);
    expect(snapshot(game)).toEqual(before);
  });

  it('rejects Start Raid during Results and leaves state unchanged', () => {
    const game = makeGame();
    game.startRaid();
    runRaidToEnd(game);
    const before = snapshot(game);
    expect(() => game.startRaid()).toThrow(IllegalTransitionError);
    expect(snapshot(game)).toEqual(before);
  });

  it('rejects every other illegal transition without changing state', () => {
    const game = makeGame();
    let before = snapshot(game);
    expect(() => game.continueToPreparation()).toThrow(IllegalTransitionError);
    expect(() => game.finishRaid()).toThrow(IllegalTransitionError);
    expect(snapshot(game)).toEqual(before);

    game.startRaid();
    before = snapshot(game);
    expect(() => game.continueToPreparation()).toThrow(IllegalTransitionError);
    expect(snapshot(game)).toEqual(before);

    runRaidToEnd(game);
    before = snapshot(game);
    expect(() => game.finishRaid()).toThrow(IllegalTransitionError);
    expect(snapshot(game)).toEqual(before);
  });

  it('reports the attempted transition on the typed error', () => {
    const game = makeGame();
    try {
      game.continueToPreparation();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalTransitionError);
      expect(err).toBeInstanceOf(GameError);
      expect((err as IllegalTransitionError).code).toBe('ILLEGAL_TRANSITION');
      expect((err as IllegalTransitionError).from).toBe('Preparation');
      expect((err as IllegalTransitionError).to).toBe('Preparation');
    }
  });

  it('does not finish a raid that is still in progress', () => {
    const game = makeGame();
    game.startRaid();
    const before = snapshot(game);
    expect(() => game.finishRaid()).toThrow(GameError);
    expect(snapshot(game)).toEqual(before);
  });

  it('increments the cycle counter once per raid started', () => {
    const game = makeGame();
    for (let i = 1; i <= 4; i++) {
      game.startRaid();
      expect(game.cycle).toBe(i);
      expect(game.raid?.cycle).toBe(i);
      runRaidToEnd(game);
      expect(game.cycle).toBe(i);
      expect(game.lastResult?.cycle).toBe(i);
      game.continueToPreparation();
      expect(game.cycle).toBe(i);
    }
  });

  it('notifies listeners on change', () => {
    const game = makeGame();
    let calls = 0;
    const off = game.onChange(() => calls++);
    game.startRaid();
    expect(calls).toBe(1);
    off();
    game.update(100);
    expect(calls).toBe(1);
  });
});
