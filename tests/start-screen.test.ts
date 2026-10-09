// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_KEY, loadRun, saveRun, type LoadResult } from '../src/save';
import { StartScreen } from '../src/ui/StartScreen';
import { makeGame } from './helpers';

function buttons(root: HTMLElement): string[] {
  return [...root.querySelectorAll('button')].map((b) => b.textContent ?? '');
}

function click(root: HTMLElement, label: string): void {
  const button = [...root.querySelectorAll('button')].find((b) => b.textContent === label);
  if (!button) throw new Error(`No "${label}" button (have: ${buttons(root).join(', ')})`);
  button.click();
}

/** Wires the screen the same way main.ts does. */
function mount(load: LoadResult) {
  const root = document.createElement('div');
  document.body.append(root);
  const game = makeGame();
  const screen = new StartScreen(root, load, {
    onContinue: (state) => game.restore(state),
    onNewGame: () => {
      game.newGame();
      saveRun(game.snapshot());
    },
  });
  return { root, game, screen };
}

function savedRun() {
  const game = makeGame();
  game.hireMonster('lair', 'goblin');
  game.startRaid();
  for (let i = 0; i < 100_000 && game.phase === 'Raid'; i++) game.update(100);
  saveRun(game.snapshot());
  return game;
}

beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

afterEach(() => vi.restoreAllMocks());

describe('start screen', () => {
  it('shows only New Game when there is no save', () => {
    const { root } = mount(loadRun());
    expect(buttons(root)).toEqual(['New Game']);
    click(root, 'New Game');
    expect(root.querySelector('.start-screen')).toBeNull();
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();
  });

  it('Continue restores the run into the saved phase', () => {
    const original = savedRun();
    const { root, game } = mount(loadRun());
    expect(buttons(root)).toEqual(['Continue', 'New Game']);
    click(root, 'Continue');
    expect(root.querySelector('.start-screen')).toBeNull();
    expect(game.phase).toBe('Results');
    expect(game.snapshot()).toEqual(original.snapshot());
  });

  it('New Game asks for confirmation and Cancel leaves the save byte-identical', () => {
    savedRun();
    const before = localStorage.getItem(SAVE_KEY);
    const { root, game } = mount(loadRun());
    click(root, 'New Game');
    expect(root.textContent).toContain('will be overwritten');
    expect(buttons(root)).toEqual(['Cancel', 'Start New Game']);
    click(root, 'Cancel');
    expect(localStorage.getItem(SAVE_KEY)).toBe(before);
    expect(buttons(root)).toEqual(['Continue', 'New Game']);
    expect(game.cycle).toBe(0);
  });

  it('confirming New Game starts a fresh run and overwrites the save', () => {
    savedRun();
    const before = localStorage.getItem(SAVE_KEY);
    const { root, game } = mount(loadRun());
    click(root, 'New Game');
    click(root, 'Start New Game');
    expect(root.querySelector('.start-screen')).toBeNull();
    expect(game.phase).toBe('Preparation');
    expect(game.cycle).toBe(0);
    expect(localStorage.getItem(SAVE_KEY)).not.toBe(before);
    const reloaded = loadRun();
    expect(reloaded.status === 'ok' && reloaded.envelope.state.cycle).toBe(0);
  });

  it('shows a message and Start New Game (no Continue) for a corrupt save', () => {
    localStorage.setItem(SAVE_KEY, 'not json');
    const { root } = mount(loadRun());
    expect(root.querySelector('.start-error')?.textContent).toMatch(/damaged/);
    expect(buttons(root)).toEqual(['Start New Game']);
    click(root, 'Start New Game');
    expect(localStorage.getItem('dungeon-company:save:corrupt')).toBe('not json');
  });
});
