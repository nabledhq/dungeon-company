import type { GameConfig } from '../config';
import { GameError } from './errors';
import type { EncounterContext, Registries } from './registry';
import type { Dungeon, Room } from './types';

/** Builds the starter dungeon described in config. All ids are validated against the registries. */
export function createStarterDungeon(config: GameConfig, registries: Registries): Dungeon {
  const spec = config.dungeon;
  const rooms: Room[] = spec.rooms.map((r) => {
    registries.rooms.get(r.typeId);
    r.monsterTypeIds?.forEach((id) => registries.monsters.get(id));
    r.trapTypeIds?.forEach((id) => registries.traps.get(id));
    return {
      id: r.id,
      typeId: r.typeId,
      col: r.col,
      row: r.row,
      monsterTypeIds: [...(r.monsterTypeIds ?? [])],
      trapTypeIds: [...(r.trapTypeIds ?? [])],
    };
  });
  const dungeon: Dungeon = {
    rooms,
    connections: spec.connections.map(([a, b]) => [a, b]),
    entranceId: spec.entranceId,
    coreId: spec.coreId,
  };
  for (const [a, b] of dungeon.connections) {
    getRoom(dungeon, a);
    getRoom(dungeon, b);
  }
  if (!findPath(dungeon)) {
    throw new GameError('INVALID_ACTION', 'Starter dungeon has no path from entrance to core');
  }
  return dungeon;
}

export function getRoom(dungeon: Dungeon, id: string): Room {
  const room = dungeon.rooms.find((r) => r.id === id);
  if (!room) throw new GameError('UNKNOWN_ID', `Unknown room "${id}"`);
  return room;
}

export function neighbours(dungeon: Dungeon, id: string): string[] {
  const out: string[] = [];
  for (const [a, b] of dungeon.connections) {
    if (a === id) out.push(b);
    else if (b === id) out.push(a);
  }
  return out;
}

/** Shortest path (room ids) from entrance to core, or null when they are not connected. */
export function findPath(dungeon: Dungeon): string[] | null {
  const start = dungeon.entranceId;
  const goal = dungeon.coreId;
  const prev = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === goal) {
      const path: string[] = [];
      for (let id: string | null = goal; id !== null; id = prev.get(id) ?? null) path.unshift(id);
      return path;
    }
    for (const next of neighbours(dungeon, current)) {
      if (!prev.has(next)) {
        prev.set(next, current);
        queue.push(next);
      }
    }
  }
  return null;
}

/** Total strength a room removes from the party: room type + monsters + traps, via their hooks. */
export function roomDefense(registries: Registries, ctx: EncounterContext): number {
  const { room } = ctx;
  let total = registries.rooms.get(room.typeId).getDefense(ctx);
  for (const id of room.monsterTypeIds) total += registries.monsters.get(id).getStrength(ctx);
  for (const id of room.trapTypeIds) total += registries.traps.get(id).getDamage(ctx);
  return Math.max(0, total);
}
