import { describe, expect, it } from 'vitest';
import { GameError } from '../src/core/errors';
import { createRegistries, type RoomType } from '../src/core/registry';
import { makeGame, makeRegistries, runRaidToEnd } from './helpers';

describe('registries', () => {
  it('register, look up and list by id', () => {
    const r = createRegistries();
    const room: RoomType = {
      id: 'x',
      name: 'X',
      description: '',
      cost: 0,
      color: 0,
      getDefense: () => 0,
    };
    r.rooms.register(room);
    expect(r.rooms.get('x')).toBe(room);
    expect(r.rooms.has('x')).toBe(true);
    expect(r.rooms.list()).toEqual([room]);
    expect(() => r.rooms.register(room)).toThrow(GameError);
    expect(() => r.rooms.get('nope')).toThrow(/Unknown room type "nope"/);
  });

  it('placeholder content registers at least one of each extension type', () => {
    const r = makeRegistries();
    expect(r.rooms.list().length).toBeGreaterThan(0);
    expect(r.monsters.list().length).toBeGreaterThan(0);
    expect(r.traps.list().length).toBeGreaterThan(0);
    expect(r.partyGenerators.list().length).toBeGreaterThan(0);
    expect(r.rewardHooks.list().length).toBeGreaterThan(0);
  });

  it('a newly registered room type is usable in a dungeon without core changes', () => {
    const registries = makeRegistries();
    const seen: number[] = [];
    registries.rooms.register({
      id: 'lava-pit',
      name: 'Lava Pit',
      description: 'Hot.',
      cost: 10,
      color: 0xff4400,
      getDefense: (ctx) => {
        seen.push(ctx.party.strength);
        return 1000;
      },
    });

    // Usable as a starter room from config...
    const game = makeGame((c) => {
      c.party.baseStrength = 500;
      c.party.strengthPerCycle = 0;
      c.dungeon.rooms.find((r) => r.id === 'corridor')!.typeId = 'lava-pit';
    }, registries);
    expect(game.dungeon.rooms.find((r) => r.id === 'corridor')?.typeId).toBe('lava-pit');

    // ...and buildable through the normal build action.
    const built = game.buildRoom('lava-pit', 0, 0, 'entrance');
    expect(built.typeId).toBe('lava-pit');

    game.startRaid();
    expect(game.raid?.path).toEqual(['entrance', 'corridor', 'lair', 'core']);
    runRaidToEnd(game);
    // The hook was called once with the party's strength as it entered the room.
    expect(seen).toEqual([500]);
    expect(game.lastResult?.outcome).toBe('success');
  });

  it('newly registered monster, trap and party generator are used through their hooks', () => {
    const registries = makeRegistries();
    registries.monsters.register({ id: 'ogre', name: 'Ogre', cost: 1, getStrength: () => 400 });
    registries.traps.register({ id: 'pit', name: 'Pit', cost: 1, getDamage: () => 100 });
    registries.partyGenerators.register({
      id: 'fixed',
      name: 'Fixed',
      generate: () => ({ members: [{ name: 'Solo', role: 'Fighter' }], strength: 524 }),
    });
    const game = makeGame((c) => (c.party.generatorId = 'fixed'), registries);
    game.hireMonster('corridor', 'ogre');
    game.placeTrap('corridor', 'pit');
    game.startRaid();
    expect(game.raid?.party.members).toHaveLength(1);
    runRaidToEnd(game);
    // corridor: 3 + spikes 8 + pit 100 + ogre 400 = 511; lair 14 → 524 - 525 < 0
    expect(game.lastResult?.outcome).toBe('success');
    expect(game.lastResult?.partyStrengthEnd).toBe(0);
  });
});
