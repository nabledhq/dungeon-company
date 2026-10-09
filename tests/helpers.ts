import { DEFAULT_CONFIG, type GameConfig } from '../src/config';
import { registerPlaceholderContent } from '../src/content/placeholders';
import { Game } from '../src/core/game';
import { createRegistries, type Registries } from '../src/core/registry';

/** Deep-cloned default config with optional overrides applied by the callback. */
export function makeConfig(edit?: (c: GameConfig) => void): GameConfig {
  const config = structuredClone(DEFAULT_CONFIG);
  edit?.(config);
  return config;
}

export function makeRegistries(): Registries {
  const registries = createRegistries();
  registerPlaceholderContent(registries);
  return registries;
}

/** Deterministic PRNG (mulberry32). */
export function seeded(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeGame(edit?: (c: GameConfig) => void, registries = makeRegistries()): Game {
  return new Game({ config: makeConfig(edit), registries, random: seeded(42) });
}

/** Ticks the game until it leaves Raid (or a safety limit is hit). */
export function runRaidToEnd(game: Game, dtMs = 100): void {
  for (let i = 0; i < 100_000 && game.phase === 'Raid'; i++) game.update(dtMs);
  if (game.phase === 'Raid') throw new Error('Raid did not finish');
}

/** Snapshot of all observable state, for "state unchanged" assertions. */
export function snapshot(game: Game) {
  return structuredClone({
    phase: game.phase,
    gold: game.gold,
    cycle: game.cycle,
    dungeon: game.dungeon,
    dungeonVersion: game.dungeonVersion,
    lastResult: game.lastResult,
    paused: game.paused,
    speed: game.speed,
    raid: game.raid
      ? { position: game.raid.position, strength: game.raid.strength, elapsed: game.raid.elapsedMs }
      : null,
  });
}
