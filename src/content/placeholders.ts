import type { Registries } from '../core/registry';

/**
 * Placeholder content for the core loop. Real catalogs will be added by later
 * features by calling register() on the same registries.
 */

const ROLES = ['Fighter', 'Wizard', 'Rogue', 'Cleric'];
const NAMES = ['Brom', 'Elsa', 'Fenwick', 'Ilse', 'Jory', 'Mira', 'Osric', 'Tamsin', 'Wendel', 'Yara'];

export function registerPlaceholderContent(registries: Registries): void {
  const { rooms, monsters, traps, partyGenerators, rewardHooks } = registries;

  rooms.register({
    id: 'entrance',
    name: 'Entrance',
    description: 'Where adventurers enter the dungeon.',
    cost: 0,
    color: 0x3f6b4a,
    getDefense: () => 0,
  });
  rooms.register({
    id: 'trap-corridor',
    name: 'Trap Corridor',
    description: 'A narrow hallway made for traps.',
    cost: 150,
    color: 0x5b5f6b,
    getDefense: () => 3,
  });
  rooms.register({
    id: 'lair',
    name: 'Lair',
    description: 'Monsters rest here between raids.',
    cost: 200,
    color: 0x6b4a3f,
    getDefense: () => 2,
  });
  rooms.register({
    id: 'barracks',
    name: 'Barracks',
    description: 'Houses your garrison.',
    cost: 250,
    color: 0x5a3f6b,
    getDefense: () => 2,
  });
  rooms.register({
    id: 'treasure-room',
    name: 'Treasure Room',
    description: 'The dungeon core. Protect it at all costs.',
    cost: 0,
    color: 0x8a6d1f,
    getDefense: () => 0,
  });

  monsters.register({ id: 'goblin', name: 'Goblin', cost: 100, getStrength: () => 6 });
  monsters.register({ id: 'skeleton', name: 'Skeleton', cost: 150, getStrength: () => 8 });

  traps.register({ id: 'spikes', name: 'Spikes', cost: 80, getDamage: () => 8 });

  partyGenerators.register({
    id: 'basic-party',
    name: 'Basic Party',
    generate: ({ cycle, config, random }) => {
      const p = config.party;
      const extra = Math.floor(Math.max(0, cycle - 1) / p.extraMemberEveryCycles);
      const size = Math.min(p.maxSize, p.baseSize + extra);
      const members = Array.from({ length: size }, (_, i) => ({
        name: NAMES[Math.floor(random() * NAMES.length)],
        role: ROLES[i % ROLES.length],
      }));
      return { members, strength: p.baseStrength + cycle * p.strengthPerCycle };
    },
  });

  rewardHooks.register({
    id: 'base-reward',
    name: 'Base Reward',
    computeReward: ({ cycle, config }) =>
      config.economy.baseReward + cycle * config.economy.rewardPerCycle,
  });
}
