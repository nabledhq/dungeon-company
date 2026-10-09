import type { GameConfig } from '../config';
import { GameError } from './errors';
import type { HeroParty, Room } from './types';

/** Anything stored in a registry is addressed by a unique string id. */
export interface Identified {
  readonly id: string;
  readonly name: string;
}

/** Generic id → definition lookup. Core logic only ever resolves content through these. */
export class Registry<T extends Identified> {
  private readonly items = new Map<string, T>();

  constructor(readonly kind: string) {}

  register(item: T): T {
    if (this.items.has(item.id)) {
      throw new GameError('DUPLICATE_ID', `${this.kind} "${item.id}" is already registered`);
    }
    this.items.set(item.id, item);
    return item;
  }

  get(id: string): T {
    const item = this.items.get(id);
    if (!item) throw new GameError('UNKNOWN_ID', `Unknown ${this.kind} "${id}"`);
    return item;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  list(): T[] {
    return [...this.items.values()];
  }
}

/** Passed to room/monster/trap hooks when the party fights in a room. */
export interface EncounterContext {
  room: Room;
  /** The party as it enters the room (strength before this room's defense). */
  party: Readonly<HeroParty>;
  cycle: number;
}

export interface RoomType extends Identified {
  description: string;
  cost: number;
  /** Placeholder fill colour (0xRRGGBB) used by the renderer. */
  color: number;
  /** Strength the room itself removes from the party. */
  getDefense(ctx: EncounterContext): number;
}

export interface MonsterType extends Identified {
  cost: number;
  /** Strength this monster removes from the party in the room it guards. */
  getStrength(ctx: EncounterContext): number;
}

export interface TrapType extends Identified {
  cost: number;
  /** Strength this trap removes from the party in the room it is placed in. */
  getDamage(ctx: EncounterContext): number;
}

export interface PartyGenerationContext {
  cycle: number;
  config: GameConfig;
  /** Returns a float in [0, 1). Deterministic in tests. */
  random: () => number;
}

export interface HeroPartyGenerator extends Identified {
  generate(ctx: PartyGenerationContext): HeroParty;
}

export interface RewardContext {
  cycle: number;
  config: GameConfig;
  gold: number;
  partyStrengthStart: number;
  roomsVisited: number;
}

/** Computes the gold awarded for a successful defense. */
export interface EconomyRewardHook extends Identified {
  computeReward(ctx: RewardContext): number;
}

export interface Registries {
  rooms: Registry<RoomType>;
  monsters: Registry<MonsterType>;
  traps: Registry<TrapType>;
  partyGenerators: Registry<HeroPartyGenerator>;
  rewardHooks: Registry<EconomyRewardHook>;
}

export function createRegistries(): Registries {
  return {
    rooms: new Registry<RoomType>('room type'),
    monsters: new Registry<MonsterType>('monster type'),
    traps: new Registry<TrapType>('trap type'),
    partyGenerators: new Registry<HeroPartyGenerator>('hero party generator'),
    rewardHooks: new Registry<EconomyRewardHook>('economy reward hook'),
  };
}
