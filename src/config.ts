/**
 * All gameplay tunables live here. Logic modules receive a GameConfig instead of
 * importing these values directly, so tests can pass their own overrides.
 */

export interface StarterRoomConfig {
  id: string;
  /** Id of a RoomType registered in the room registry. */
  typeId: string;
  /** Grid column / row. The renderer turns these into pixels. */
  col: number;
  row: number;
  monsterTypeIds?: string[];
  trapTypeIds?: string[];
}

export interface GameConfig {
  economy: {
    starterGold: number;
    /** Gold awarded by the placeholder reward hook for a successful defense. */
    baseReward: number;
    /** Extra reward per cycle for the placeholder reward hook. */
    rewardPerCycle: number;
    /** On a failed defense the player loses floor(gold * failureLossFraction). */
    failureLossFraction: number;
    /** Id of the EconomyRewardHook used to compute success rewards. */
    rewardHookId: string;
  };
  dungeon: {
    rooms: StarterRoomConfig[];
    /** Undirected connections between starter room ids. */
    connections: Array<[string, string]>;
    entranceId: string;
    coreId: string;
  };
  party: {
    /** Id of the HeroPartyGenerator used to create raiding parties. */
    generatorId: string;
    /** Party strength = baseStrength + cycle * strengthPerCycle. */
    baseStrength: number;
    strengthPerCycle: number;
    baseSize: number;
    /** One extra adventurer every N cycles. */
    extraMemberEveryCycles: number;
    maxSize: number;
  };
  raid: {
    /** Party movement speed in rooms per second of simulation time. */
    moveSpeedRoomsPerSec: number;
    /** Time the party spends fighting in each room, in simulation ms. */
    roomDwellMs: number;
    /** Fixed simulation step in ms. tick(dt) runs floor(accumulated / stepMs) steps. */
    stepMs: number;
    /** Speed multipliers offered in the HUD. */
    speedOptions: number[];
  };
  camera: {
    zoomMin: number;
    zoomMax: number;
    zoomStep: number;
    /** Keyboard pan speed in screen pixels per second. */
    panSpeed: number;
  };
}

export const DEFAULT_CONFIG: GameConfig = {
  economy: {
    starterGold: 1000,
    baseReward: 250,
    rewardPerCycle: 50,
    failureLossFraction: 0.25,
    rewardHookId: 'base-reward',
  },
  dungeon: {
    rooms: [
      { id: 'entrance', typeId: 'entrance', col: 0, row: 1 },
      { id: 'corridor', typeId: 'trap-corridor', col: 1, row: 1, trapTypeIds: ['spikes'] },
      { id: 'lair', typeId: 'lair', col: 2, row: 1, monsterTypeIds: ['goblin', 'goblin'] },
      { id: 'barracks', typeId: 'barracks', col: 2, row: 0, monsterTypeIds: ['skeleton'] },
      { id: 'core', typeId: 'treasure-room', col: 3, row: 1 },
    ],
    connections: [
      ['entrance', 'corridor'],
      ['corridor', 'lair'],
      ['lair', 'barracks'],
      ['lair', 'core'],
    ],
    entranceId: 'entrance',
    coreId: 'core',
  },
  party: {
    generatorId: 'basic-party',
    baseStrength: 5,
    strengthPerCycle: 9,
    baseSize: 3,
    extraMemberEveryCycles: 2,
    maxSize: 6,
  },
  raid: {
    moveSpeedRoomsPerSec: 0.6,
    roomDwellMs: 900,
    stepMs: 50,
    speedOptions: [1, 2, 4],
  },
  camera: {
    zoomMin: 0.5,
    zoomMax: 2,
    zoomStep: 0.1,
    panSpeed: 600,
  },
};
