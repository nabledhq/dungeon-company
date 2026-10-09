import type { GameConfig } from '../config';
import { GameError } from './errors';
import { findPath, getRoom, roomDefense } from './dungeon';
import type { Registries } from './registry';
import type { Dungeon, HeroParty, RaidOutcome } from './types';

export type RaidStatus = 'moving' | 'fighting' | 'finished';

export type RaidEvent =
  | { type: 'encounter'; roomId: string; damage: number; strengthAfter: number; atMs: number }
  | { type: 'partyDefeated'; roomId: string; atMs: number }
  | { type: 'reachedCore'; roomId: string; atMs: number };

export interface RaidSimulationOptions {
  dungeon: Dungeon;
  party: HeroParty;
  cycle: number;
  registries: Registries;
  config: GameConfig;
}

/**
 * Real-time raid walk. The party starts in the entrance, fights in every room on the
 * shortest path (room defense is subtracted from party strength), and walks on to
 * the next room. The defense succeeds if party strength hits 0 before the party
 * enters the core room; it fails if the party reaches the core.
 *
 * Time only advances through tick(dtMs), in fixed steps of config.raid.stepMs.
 * Pause and speed are applied by the caller (see Game.update).
 */
export class RaidSimulation {
  readonly path: readonly string[];
  readonly party: HeroParty;
  readonly initialStrength: number;
  readonly cycle: number;

  /** Party position along the path in rooms: 0 = entrance, path.length - 1 = core. */
  position = 0;
  strength: number;
  status: RaidStatus = 'moving';
  outcome: RaidOutcome | null = null;
  roomsVisited = 0;
  /** Simulation time consumed so far, in ms. */
  elapsedMs = 0;
  readonly events: RaidEvent[] = [];

  private nextRoomIndex = 0;
  private dwellRemainingMs = 0;
  private accumulatorMs = 0;
  private readonly dungeon: Dungeon;
  private readonly registries: Registries;
  private readonly config: GameConfig;

  constructor(options: RaidSimulationOptions) {
    const path = findPath(options.dungeon);
    if (!path) throw new GameError('INVALID_ACTION', 'No path from entrance to core');
    this.path = path;
    this.dungeon = options.dungeon;
    this.registries = options.registries;
    this.config = options.config;
    this.cycle = options.cycle;
    this.party = { members: [...options.party.members], strength: options.party.strength };
    this.initialStrength = options.party.strength;
    this.strength = options.party.strength;
  }

  get finished(): boolean {
    return this.status === 'finished';
  }

  /** Party progress through the path, 0..1. */
  get progress(): number {
    const segments = this.path.length - 1;
    return segments <= 0 ? 1 : this.position / segments;
  }

  /** Adventurers still standing, proportional to remaining strength. */
  get aliveMembers(): number {
    if (this.strength <= 0 || this.initialStrength <= 0) return 0;
    return Math.ceil((this.party.members.length * this.strength) / this.initialStrength);
  }

  /** Room the party is currently in or walking out of. */
  get currentRoomId(): string {
    return this.path[Math.floor(this.position)];
  }

  /** Advance the simulation by dtMs of simulation time. */
  tick(dtMs: number): void {
    if (this.finished || !(dtMs > 0)) return;
    const step = this.config.raid.stepMs;
    this.accumulatorMs += dtMs;
    while (this.accumulatorMs >= step && !this.finished) {
      this.accumulatorMs -= step;
      this.step(step);
    }
  }

  private step(dt: number): void {
    this.elapsedMs += dt;
    if (this.status === 'fighting') {
      this.dwellRemainingMs -= dt;
      if (this.dwellRemainingMs <= 0) this.leaveRoom();
      return;
    }
    if (this.position < this.nextRoomIndex) {
      const delta = (this.config.raid.moveSpeedRoomsPerSec * dt) / 1000;
      this.position = Math.min(this.nextRoomIndex, this.position + delta);
    }
    if (this.position >= this.nextRoomIndex) this.enterRoom(this.nextRoomIndex);
  }

  private enterRoom(index: number): void {
    this.position = index;
    this.roomsVisited += 1;
    const roomId = this.path[index];
    if (index === this.path.length - 1) {
      this.events.push({ type: 'reachedCore', roomId, atMs: this.elapsedMs });
      this.finish('failure');
      return;
    }
    const room = getRoom(this.dungeon, roomId);
    const damage = roomDefense(this.registries, {
      room,
      party: { members: this.party.members, strength: this.strength },
      cycle: this.cycle,
    });
    this.strength = Math.max(0, this.strength - damage);
    this.events.push({
      type: 'encounter',
      roomId,
      damage,
      strengthAfter: this.strength,
      atMs: this.elapsedMs,
    });
    this.nextRoomIndex = index + 1;
    this.status = 'fighting';
    this.dwellRemainingMs = this.config.raid.roomDwellMs;
    if (this.dwellRemainingMs <= 0) this.leaveRoom();
  }

  private leaveRoom(): void {
    if (this.strength <= 0) {
      this.events.push({ type: 'partyDefeated', roomId: this.currentRoomId, atMs: this.elapsedMs });
      this.finish('success');
      return;
    }
    this.status = 'moving';
  }

  private finish(outcome: RaidOutcome): void {
    this.status = 'finished';
    this.outcome = outcome;
  }
}
