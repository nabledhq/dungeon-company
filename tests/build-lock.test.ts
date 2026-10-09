import { describe, expect, it } from 'vitest';
import { BuildLockedError, GameError } from '../src/core/errors';
import { makeGame, runRaidToEnd, snapshot } from './helpers';

describe('build actions', () => {
  it('are allowed in Preparation and cost gold', () => {
    const game = makeGame();
    const gold = game.gold;
    const room = game.buildRoom('lair', 1, 0, 'corridor');
    expect(game.dungeon.rooms).toContain(room);
    expect(game.dungeon.connections).toContainEqual(['corridor', room.id]);
    game.hireMonster(room.id, 'goblin');
    game.placeTrap(room.id, 'spikes');
    expect(room.monsterTypeIds).toEqual(['goblin']);
    expect(room.trapTypeIds).toEqual(['spikes']);
    const r = game.registries;
    expect(game.gold).toBe(
      gold - r.rooms.get('lair').cost - r.monsters.get('goblin').cost - r.traps.get('spikes').cost,
    );
    game.removeRoom(room.id);
    expect(game.dungeon.rooms.find((x) => x.id === room.id)).toBeUndefined();
  });

  it('are rejected during Raid even when called directly, leaving state unchanged', () => {
    const game = makeGame();
    game.startRaid();
    game.update(300);
    const before = snapshot(game);

    const actions: Array<() => unknown> = [
      () => game.buildRoom('lair', 1, 0, 'corridor'),
      () => game.removeRoom('barracks'),
      () => game.hireMonster('lair', 'goblin'),
      () => game.placeTrap('corridor', 'spikes'),
    ];
    for (const action of actions) {
      expect(action).toThrow(BuildLockedError);
    }
    expect(game.buildLocked).toBe(true);
    expect(snapshot(game)).toEqual(before);
  });

  it('are rejected on the Results screen too and unlocked again in Preparation', () => {
    const game = makeGame();
    game.startRaid();
    runRaidToEnd(game);
    expect(() => game.hireMonster('lair', 'goblin')).toThrow(BuildLockedError);
    game.continueToPreparation();
    expect(game.buildLocked).toBe(false);
    expect(() => game.hireMonster('lair', 'goblin')).not.toThrow();
  });

  it('validate placement, gold and path connectivity', () => {
    const game = makeGame((c) => (c.economy.starterGold = 120));
    const before = snapshot(game);
    expect(() => game.buildRoom('lair', 1, 1, 'entrance')).toThrow(GameError); // occupied
    expect(() => game.buildRoom('lair', 5, 5, 'entrance')).toThrow(GameError); // not adjacent
    expect(() => game.buildRoom('lair', 0, 0, 'entrance')).toThrow(/Not enough gold/);
    expect(() => game.removeRoom('core')).toThrow(GameError);
    expect(() => game.removeRoom('lair')).toThrow(/disconnect/);
    expect(() => game.hireMonster('lair', 'dragon')).toThrow(/Unknown monster type/);
    expect(snapshot(game)).toEqual(before);
  });
});
