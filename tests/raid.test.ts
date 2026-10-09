import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../src/config';
import { createStarterDungeon, findPath } from '../src/core/dungeon';
import { RaidSimulation } from '../src/core/raid';
import { GameError } from '../src/core/errors';
import { makeConfig, makeGame, makeRegistries } from './helpers';

// Default starter path: entrance (0) → corridor (3 + spikes 8) → lair (2 + 2×goblin 6) → core.
const PATH_DEFENSE = 11 + 14;

function makeSim(strength: number, edit?: (c: GameConfig) => void) {
  const config = makeConfig(edit);
  const registries = makeRegistries();
  const dungeon = createStarterDungeon(config, registries);
  const party = { members: [{ name: 'A', role: 'Fighter' }, { name: 'B', role: 'Wizard' }], strength };
  return new RaidSimulation({ dungeon, party, cycle: 1, registries, config });
}

function runToEnd(sim: RaidSimulation) {
  for (let i = 0; i < 10_000 && !sim.finished; i++) sim.tick(100);
  return sim;
}

describe('raid simulation outcome', () => {
  it('follows the shortest path from entrance to core', () => {
    const sim = makeSim(1);
    expect(sim.path).toEqual(['entrance', 'corridor', 'lair', 'core']);
  });

  it.each([
    [1, 'success'],
    [PATH_DEFENSE - 1, 'success'],
    [PATH_DEFENSE, 'success'], // strength reaches exactly 0 before the core
    [PATH_DEFENSE + 1, 'failure'],
    [500, 'failure'],
  ] as const)('party strength %i → %s', (strength, outcome) => {
    const sim = runToEnd(makeSim(strength));
    expect(sim.finished).toBe(true);
    expect(sim.outcome).toBe(outcome);
    expect(sim.strength).toBe(Math.max(0, strength - PATH_DEFENSE));
  });

  it('is deterministic', () => {
    const a = runToEnd(makeSim(20));
    const b = runToEnd(makeSim(20));
    expect(a.events).toEqual(b.events);
    expect(a.elapsedMs).toBe(b.elapsedMs);
  });

  it('stops in the room where the party is defeated', () => {
    const sim = runToEnd(makeSim(5));
    expect(sim.currentRoomId).toBe('corridor');
    expect(sim.events.at(-1)).toMatchObject({ type: 'partyDefeated', roomId: 'corridor' });
    expect(sim.progress).toBeCloseTo(1 / 3);
    expect(sim.aliveMembers).toBe(0);
  });

  it('reaches 100% progress when the party gets to the core', () => {
    const sim = runToEnd(makeSim(100));
    expect(sim.progress).toBe(1);
    expect(sim.events.at(-1)).toMatchObject({ type: 'reachedCore', roomId: 'core' });
    expect(sim.roomsVisited).toBe(4);
  });

  it('moves the party gradually between rooms', () => {
    const sim = makeSim(100, (c) => {
      c.raid.roomDwellMs = 0;
      c.raid.moveSpeedRoomsPerSec = 1;
    });
    sim.tick(50); // enters the entrance
    sim.tick(500);
    expect(sim.position).toBeCloseTo(0.5);
    expect(sim.status).toBe('moving');
  });

  it('requires a path from entrance to core', () => {
    const config = makeConfig();
    const registries = makeRegistries();
    const dungeon = createStarterDungeon(config, registries);
    dungeon.connections = dungeon.connections.filter(([a, b]) => !(a === 'lair' && b === 'core'));
    expect(findPath(dungeon)).toBeNull();
    expect(
      () =>
        new RaidSimulation({
          dungeon,
          party: { members: [], strength: 1 },
          cycle: 1,
          registries,
          config,
        }),
    ).toThrow(GameError);
  });
});

describe('raid via the game', () => {
  it('uses party strength = base + cycle × increment', () => {
    const game = makeGame((c) => {
      c.party.baseStrength = 7;
      c.party.strengthPerCycle = 3;
    });
    game.startRaid();
    expect(game.raid?.initialStrength).toBe(10);
    game.raid!.tick(1e9);
    game.update(0);
    game.continueToPreparation();
    game.startRaid();
    expect(game.raid?.initialStrength).toBe(13);
  });

  it('succeeds and fails deterministically for given party strengths', () => {
    const win = makeGame((c) => {
      c.party.baseStrength = PATH_DEFENSE;
      c.party.strengthPerCycle = 0;
    });
    win.startRaid();
    win.update(1e9);
    expect(win.lastResult?.outcome).toBe('success');

    const lose = makeGame((c) => {
      c.party.baseStrength = PATH_DEFENSE + 1;
      c.party.strengthPerCycle = 0;
    });
    lose.startRaid();
    lose.update(1e9);
    expect(lose.lastResult?.outcome).toBe('failure');
  });
});

describe('pause and speed', () => {
  // Strong party and a long dwell so the raid never finishes during these checks.
  const slow = (c: GameConfig) => {
    c.party.baseStrength = 1000;
    c.raid.roomDwellMs = 0;
    c.raid.moveSpeedRoomsPerSec = 0.1;
  };

  it('pause halts simulation progress', () => {
    const game = makeGame(slow);
    game.startRaid();
    game.update(1000);
    const raid = game.raid!;
    const position = raid.position;
    const elapsed = raid.elapsedMs;
    expect(position).toBeGreaterThan(0);

    game.setPaused(true);
    for (let i = 0; i < 100; i++) game.update(1000);
    expect(raid.position).toBe(position);
    expect(raid.elapsedMs).toBe(elapsed);
    expect(raid.events).toHaveLength(1);

    game.togglePause();
    expect(game.paused).toBe(false);
    game.update(1000);
    expect(raid.position).toBeGreaterThan(position);
  });

  it.each([2, 4])('%ix speed advances %i× as far as 1x for equal real dt', (speed) => {
    const base = makeGame(slow);
    base.startRaid();
    base.update(50); // enter the entrance room
    const start = base.raid!.position;
    base.update(2000);
    const baseDistance = base.raid!.position - start;

    const fast = makeGame(slow);
    fast.startRaid();
    fast.update(50);
    fast.setSpeed(speed);
    fast.update(2000);
    const fastDistance = fast.raid!.position - start;

    expect(baseDistance).toBeGreaterThan(0);
    expect(fastDistance).toBeCloseTo(baseDistance * speed, 10);
    expect(fast.raid!.elapsedMs - 50).toBe((base.raid!.elapsedMs - 50) * speed);
  });

  it('pause and speed are only available during Raid', () => {
    const game = makeGame();
    expect(() => game.setSpeed(2)).toThrow(GameError);
    expect(() => game.setPaused(true)).toThrow(GameError);
    game.startRaid();
    expect(() => game.setSpeed(3)).toThrow(/Unsupported speed/);
    game.setSpeed(4);
    expect(game.speed).toBe(4);
  });
});
