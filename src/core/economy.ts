import type { GameConfig } from '../config';
import type { EconomyRewardHook, RewardContext } from './registry';
import type { RaidOutcome } from './types';

/** Gold lost on a failed defense: floor(gold * fraction), never more than the gold held. */
export function failureLoss(gold: number, fraction: number): number {
  const loss = Math.floor(Math.max(0, gold) * Math.min(1, Math.max(0, fraction)));
  return Math.min(Math.max(0, gold), loss);
}

/** Signed gold change for a raid outcome. The resulting gold is never negative. */
export function raidGoldDelta(
  outcome: RaidOutcome,
  config: GameConfig,
  rewardHook: EconomyRewardHook,
  ctx: RewardContext,
): number {
  if (outcome === 'success') return Math.max(0, Math.floor(rewardHook.computeReward(ctx)));
  return -failureLoss(ctx.gold, config.economy.failureLossFraction);
}
