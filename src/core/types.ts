/** Plain data describing the game. No Phaser or DOM imports allowed in src/core. */

export type Phase = 'Preparation' | 'Raid' | 'Results';

export interface Room {
  id: string;
  /** Id of a registered RoomType. */
  typeId: string;
  col: number;
  row: number;
  /** Ids of registered MonsterTypes assigned to this room (duplicates allowed). */
  monsterTypeIds: string[];
  /** Ids of registered TrapTypes placed in this room (duplicates allowed). */
  trapTypeIds: string[];
}

export interface Dungeon {
  rooms: Room[];
  /** Undirected connections between room ids. */
  connections: Array<[string, string]>;
  entranceId: string;
  coreId: string;
}

export interface Adventurer {
  name: string;
  /** Free-form class label, e.g. "Fighter". */
  role: string;
}

export interface HeroParty {
  members: Adventurer[];
  strength: number;
}

export type RaidOutcome = 'success' | 'failure';

export interface RaidResult {
  cycle: number;
  /** "success" means the dungeon was defended. */
  outcome: RaidOutcome;
  /** Positive on success (reward), negative on failure (loss), never below -goldBefore. */
  goldDelta: number;
  goldBefore: number;
  goldAfter: number;
  partyStrengthStart: number;
  partyStrengthEnd: number;
  roomsVisited: number;
}
