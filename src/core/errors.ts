import type { Phase } from './types';

export type GameErrorCode =
  | 'ILLEGAL_TRANSITION'
  | 'BUILD_LOCKED'
  | 'RAID_CONTROL_UNAVAILABLE'
  | 'INVALID_ACTION'
  | 'UNKNOWN_ID'
  | 'DUPLICATE_ID';

/** Base class for every error thrown deliberately by the core logic. */
export class GameError extends Error {
  readonly code: GameErrorCode;

  constructor(code: GameErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/** Thrown when a phase transition is not allowed from the current phase. */
export class IllegalTransitionError extends GameError {
  readonly from: Phase;
  readonly to: Phase;

  constructor(from: Phase, to: Phase) {
    super('ILLEGAL_TRANSITION', `Cannot go from ${from} to ${to}`);
    this.from = from;
    this.to = to;
  }
}

/** Thrown when a build/hire/configure/remove action is attempted outside Preparation. */
export class BuildLockedError extends GameError {
  readonly phase: Phase;

  constructor(action: string, phase: Phase) {
    super('BUILD_LOCKED', `"${action}" is only allowed during Preparation (current phase: ${phase})`);
    this.phase = phase;
  }
}
