import { DEFAULT_CONFIG, type GameConfig } from '../config';
import { createStarterDungeon, findPath, getRoom } from './dungeon';
import { raidGoldDelta } from './economy';
import { BuildLockedError, GameError, IllegalTransitionError } from './errors';
import { RaidSimulation } from './raid';
import type { Registries } from './registry';
import type { Dungeon, Phase, RaidResult, Room } from './types';

/** The only legal transitions: Preparation → Raid → Results → Preparation. */
const NEXT_PHASE: Record<Phase, Phase> = {
  Preparation: 'Raid',
  Raid: 'Results',
  Results: 'Preparation',
};

export interface GameOptions {
  registries: Registries;
  config?: GameConfig;
  /** Float in [0, 1). Defaults to Math.random; pass a seeded function in tests. */
  random?: () => number;
}

export type GameListener = (game: Game) => void;

/**
 * Owns all game state and enforces the phase machine and the build lock.
 * Every mutation goes through a method here; invalid calls throw a GameError
 * before touching any state.
 */
export class Game {
  readonly config: GameConfig;
  readonly registries: Registries;

  phase: Phase = 'Preparation';
  gold = 0;
  /** Number of raids started so far. The raid in progress (or just finished) is raid #cycle. */
  cycle = 0;
  dungeon!: Dungeon;
  /** Incremented on every dungeon change so renderers know when to redraw. */
  dungeonVersion = 0;
  raid: RaidSimulation | null = null;
  lastResult: RaidResult | null = null;
  paused = false;
  speed = 1;

  private readonly random: () => number;
  private readonly listeners = new Set<GameListener>();
  private nextRoomNumber = 1;

  constructor(options: GameOptions) {
    this.registries = options.registries;
    this.config = options.config ?? DEFAULT_CONFIG;
    this.random = options.random ?? Math.random;
    this.newGame();
  }

  /** Resets to a fresh starter dungeon and starter gold from config. */
  newGame(): void {
    this.dungeon = createStarterDungeon(this.config, this.registries);
    this.phase = 'Preparation';
    this.gold = this.config.economy.starterGold;
    this.cycle = 0;
    this.raid = null;
    this.lastResult = null;
    this.paused = false;
    this.speed = this.config.raid.speedOptions[0] ?? 1;
    this.nextRoomNumber = 1;
    this.dungeonVersion++;
    this.emit();
  }

  onChange(listener: GameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  canTransitionTo(to: Phase): boolean {
    return NEXT_PHASE[this.phase] === to;
  }

  get buildLocked(): boolean {
    return this.phase !== 'Preparation';
  }

  // ---- Phase machine -------------------------------------------------------

  /** Preparation → Raid. Increments the cycle and spawns the raiding party. */
  startRaid(): void {
    this.assertTransition('Raid');
    const cycle = this.cycle + 1;
    const generator = this.registries.partyGenerators.get(this.config.party.generatorId);
    const party = generator.generate({ cycle, config: this.config, random: this.random });
    const raid = new RaidSimulation({
      dungeon: this.dungeon,
      party,
      cycle,
      registries: this.registries,
      config: this.config,
    });
    this.cycle = cycle;
    this.raid = raid;
    this.lastResult = null;
    this.paused = false;
    this.phase = 'Raid';
    this.emit();
  }

  /**
   * Advances the raid by real elapsed time. Applies pause and the speed multiplier,
   * and moves to Results once the simulation has finished. No-op outside Raid.
   */
  update(realDtMs: number): void {
    if (this.phase !== 'Raid' || !this.raid) return;
    if (!this.paused) this.raid.tick(realDtMs * this.speed);
    if (this.raid.finished) this.finishRaid();
    else this.emit();
  }

  /** Raid → Results. Only possible once the raid simulation has finished. */
  finishRaid(): void {
    this.assertTransition('Results');
    const raid = this.raid;
    if (!raid?.finished || !raid.outcome) {
      throw new GameError('INVALID_ACTION', 'The raid is still in progress');
    }
    const goldBefore = this.gold;
    const delta = raidGoldDelta(
      raid.outcome,
      this.config,
      this.registries.rewardHooks.get(this.config.economy.rewardHookId),
      {
        cycle: raid.cycle,
        config: this.config,
        gold: goldBefore,
        partyStrengthStart: raid.initialStrength,
        roomsVisited: raid.roomsVisited,
      },
    );
    this.gold = Math.max(0, goldBefore + delta);
    this.lastResult = {
      cycle: raid.cycle,
      outcome: raid.outcome,
      goldDelta: this.gold - goldBefore,
      goldBefore,
      goldAfter: this.gold,
      partyStrengthStart: raid.initialStrength,
      partyStrengthEnd: raid.strength,
      roomsVisited: raid.roomsVisited,
    };
    this.paused = false;
    this.phase = 'Results';
    this.emit();
  }

  /** Results → Preparation. */
  continueToPreparation(): void {
    this.assertTransition('Preparation');
    this.raid = null;
    this.phase = 'Preparation';
    this.emit();
  }

  // ---- Raid controls -------------------------------------------------------

  setPaused(paused: boolean): void {
    this.assertRaidControl();
    this.paused = paused;
    this.emit();
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  setSpeed(speed: number): void {
    this.assertRaidControl();
    if (!this.config.raid.speedOptions.includes(speed)) {
      throw new GameError('INVALID_ACTION', `Unsupported speed ${speed}x`);
    }
    this.speed = speed;
    this.emit();
  }

  // ---- Build actions (Preparation only) ------------------------------------

  /** Builds a room of a registered type at a free grid cell next to an existing room. */
  buildRoom(typeId: string, col: number, row: number, connectToId: string): Room {
    this.assertBuildAllowed('buildRoom');
    const type = this.registries.rooms.get(typeId);
    const neighbour = getRoom(this.dungeon, connectToId);
    if (this.dungeon.rooms.some((r) => r.col === col && r.row === row)) {
      throw new GameError('INVALID_ACTION', `Cell ${col},${row} is already occupied`);
    }
    if (Math.abs(neighbour.col - col) + Math.abs(neighbour.row - row) !== 1) {
      throw new GameError('INVALID_ACTION', 'New rooms must be built next to the room they connect to');
    }
    this.spend(type.cost);
    let id = `room-${this.nextRoomNumber++}`;
    while (this.dungeon.rooms.some((r) => r.id === id)) id = `room-${this.nextRoomNumber++}`;
    const room: Room = { id, typeId, col, row, monsterTypeIds: [], trapTypeIds: [] };
    this.dungeon.rooms.push(room);
    this.dungeon.connections.push([connectToId, id]);
    this.dungeonChanged();
    return room;
  }

  /** Removes a room. The entrance and core cannot be removed, nor rooms whose removal cuts the path. */
  removeRoom(roomId: string): void {
    this.assertBuildAllowed('removeRoom');
    getRoom(this.dungeon, roomId);
    if (roomId === this.dungeon.entranceId || roomId === this.dungeon.coreId) {
      throw new GameError('INVALID_ACTION', 'The entrance and core rooms cannot be removed');
    }
    const next: Dungeon = {
      ...this.dungeon,
      rooms: this.dungeon.rooms.filter((r) => r.id !== roomId),
      connections: this.dungeon.connections.filter(([a, b]) => a !== roomId && b !== roomId),
    };
    if (!findPath(next)) {
      throw new GameError('INVALID_ACTION', 'Removing this room would disconnect the entrance from the core');
    }
    this.dungeon = next;
    this.dungeonChanged();
  }

  /** Hires a monster of a registered type and assigns it to a room. */
  hireMonster(roomId: string, monsterTypeId: string): void {
    this.assertBuildAllowed('hireMonster');
    const room = getRoom(this.dungeon, roomId);
    const type = this.registries.monsters.get(monsterTypeId);
    this.spend(type.cost);
    room.monsterTypeIds.push(monsterTypeId);
    this.dungeonChanged();
  }

  /** Places a trap of a registered type in a room. */
  placeTrap(roomId: string, trapTypeId: string): void {
    this.assertBuildAllowed('placeTrap');
    const room = getRoom(this.dungeon, roomId);
    const type = this.registries.traps.get(trapTypeId);
    this.spend(type.cost);
    room.trapTypeIds.push(trapTypeId);
    this.dungeonChanged();
  }

  // ---- Internals -----------------------------------------------------------

  private assertTransition(to: Phase): void {
    if (!this.canTransitionTo(to)) throw new IllegalTransitionError(this.phase, to);
  }

  private assertBuildAllowed(action: string): void {
    if (this.buildLocked) throw new BuildLockedError(action, this.phase);
  }

  private assertRaidControl(): void {
    if (this.phase !== 'Raid') {
      throw new GameError('RAID_CONTROL_UNAVAILABLE', 'Pause and speed are only available during a raid');
    }
  }

  private spend(cost: number): void {
    if (cost > this.gold) {
      throw new GameError('INVALID_ACTION', `Not enough gold (need ${cost}, have ${this.gold})`);
    }
    this.gold -= cost;
  }

  private dungeonChanged(): void {
    this.dungeonVersion++;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this);
  }
}
