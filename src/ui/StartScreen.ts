import type { RunState } from '../core/types';
import type { LoadResult } from '../save/storage';

export interface StartScreenActions {
  /** Restore the saved run. */
  onContinue(state: RunState): void;
  /** Start a fresh run (overwriting any save). */
  onNewGame(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Minimal New Game / Continue overlay shown on page load. Continue only appears
 * when a valid save exists; New Game asks for confirmation before replacing it.
 */
export class StartScreen {
  private readonly overlay = el('div', 'start-screen');
  private readonly card = el('div', 'hud-results-card start-card');

  constructor(
    root: HTMLElement,
    private readonly load: LoadResult,
    private readonly actions: StartScreenActions,
  ) {
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.append(this.card);
    root.append(this.overlay);
    this.showMenu();
  }

  private showMenu(): void {
    const { load } = this;
    const title = el('h2', 'start-title', 'Dungeon Company');
    const nodes: HTMLElement[] = [title];
    const buttons = el('div', 'start-buttons');

    if (load.status === 'ok') {
      const { state, savedAt } = load.envelope;
      nodes.push(el('p', 'hud-results-detail', `Saved run: ${describeRun(state)} • ${formatDate(savedAt)}`));
      const cont = el('button', 'hud-btn hud-start', 'Continue');
      cont.addEventListener('click', () => this.finish(() => this.actions.onContinue(state)));
      const fresh = el('button', 'hud-btn start-secondary', 'New Game');
      fresh.addEventListener('click', () => this.showConfirm(state));
      buttons.append(cont, fresh);
    } else if (load.status === 'corrupt' || load.status === 'incompatible') {
      nodes.push(
        el(
          'p',
          'start-error',
          load.status === 'corrupt'
            ? 'Your saved game is damaged and cannot be loaded.'
            : 'Your saved game is from an incompatible version and cannot be loaded.',
        ),
      );
      buttons.append(this.newGameButton('Start New Game'));
    } else {
      if (load.status === 'unavailable') {
        nodes.push(el('p', 'hud-results-detail', 'Saving is unavailable in this browser. Progress will not be kept.'));
      }
      buttons.append(this.newGameButton('New Game'));
    }
    nodes.push(buttons);
    this.card.replaceChildren(...nodes);
    buttons.querySelector('button')?.focus();
  }

  private showConfirm(state: RunState): void {
    const cancel = el('button', 'hud-btn start-secondary', 'Cancel');
    cancel.addEventListener('click', () => this.showMenu());
    const buttons = el('div', 'start-buttons');
    buttons.append(cancel, this.newGameButton('Start New Game'));
    this.card.replaceChildren(
      el('h2', 'start-title', 'Start a new game?'),
      el('p', 'hud-results-detail', `Your current run (${describeRun(state)}) will be overwritten.`),
      buttons,
    );
    cancel.focus();
  }

  private newGameButton(label: string): HTMLButtonElement {
    const button = el('button', 'hud-btn hud-start', label);
    button.addEventListener('click', () => this.finish(() => this.actions.onNewGame()));
    return button;
  }

  private finish(action: () => void): void {
    this.overlay.remove();
    action();
  }
}

function describeRun(state: RunState): string {
  const raid = state.phase === 'Preparation' ? state.cycle + 1 : state.cycle;
  const where = state.phase === 'Preparation' ? 'preparing' : 'results';
  return `Raid ${raid} (${where}), ${new Intl.NumberFormat('en-US').format(state.gold)} gold`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}
