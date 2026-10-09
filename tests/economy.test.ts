import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../src/config';
import { failureLoss } from '../src/core/economy';
import { makeGame, runRaidToEnd } from './helpers';

const winning = (c: GameConfig) => {
  c.party.baseStrength = 1;
  c.party.strengthPerCycle = 0;
};
const losing = (c: GameConfig) => {
  c.party.baseStrength = 10_000;
  c.party.strengthPerCycle = 0;
};

describe('gold after Results', () => {
  it('awards the reward hook amount on success', () => {
    const game = makeGame((c) => {
      winning(c);
      c.economy.starterGold = 1000;
      c.economy.baseReward = 250;
      c.economy.rewardPerCycle = 50;
    });
    game.startRaid();
    runRaidToEnd(game);
    expect(game.lastResult).toMatchObject({
      outcome: 'success',
      goldBefore: 1000,
      goldDelta: 300,
      goldAfter: 1300,
    });
    expect(game.gold).toBe(1300);
    game.continueToPreparation();
    expect(game.gold).toBe(1300);
  });

  it('removes floor(gold × lossFraction) on failure', () => {
    const game = makeGame((c) => {
      losing(c);
      c.economy.starterGold = 999;
      c.economy.failureLossFraction = 0.25;
    });
    game.startRaid();
    runRaidToEnd(game);
    expect(game.lastResult).toMatchObject({
      outcome: 'failure',
      goldBefore: 999,
      goldDelta: -249,
      goldAfter: 750,
    });
    expect(game.gold).toBe(750);
  });

  it('never drops gold below zero', () => {
    for (const fraction of [0, 0.5, 1, 2]) {
      const game = makeGame((c) => {
        losing(c);
        c.economy.starterGold = 3;
        c.economy.failureLossFraction = fraction;
      });
      for (let i = 0; i < 5; i++) {
        game.startRaid();
        runRaidToEnd(game);
        expect(game.gold).toBeGreaterThanOrEqual(0);
        game.continueToPreparation();
      }
    }
    const broke = makeGame((c) => {
      losing(c);
      c.economy.starterGold = 0;
    });
    broke.startRaid();
    runRaidToEnd(broke);
    expect(broke.gold).toBe(0);
    expect(broke.lastResult?.goldDelta).toBe(0);
  });

  it('failureLoss is floored and bounded', () => {
    expect(failureLoss(10, 0.25)).toBe(2);
    expect(failureLoss(0, 0.5)).toBe(0);
    expect(failureLoss(10, 5)).toBe(10);
    expect(failureLoss(-5, 0.5)).toBe(0);
  });

  it('looks up the reward hook by id from config', () => {
    const game = makeGame((c) => {
      winning(c);
      c.economy.rewardHookId = 'flat-7';
    });
    game.registries.rewardHooks.register({ id: 'flat-7', name: 'Flat', computeReward: () => 7 });
    const gold = game.gold;
    game.startRaid();
    runRaidToEnd(game);
    expect(game.gold).toBe(gold + 7);
  });
});
