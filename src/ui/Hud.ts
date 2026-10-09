import type { Game } from '../core/game';
import type { Identified } from '../core/registry';
import type { ViewportInsets } from '../scenes/DungeonScene';

type Category = 'rooms' | 'traps' | 'monsters' | 'decorations' | 'utilities' | 'remove';

const CATEGORIES: Array<{ id: Category; label: string; icon: string }> = [
  { id: 'rooms', label: 'Rooms', icon: '▦' },
  { id: 'traps', label: 'Traps', icon: '⚠' },
  { id: 'monsters', label: 'Monsters', icon: '☠' },
  { id: 'decorations', label: 'Decorations', icon: '✦' },
  { id: 'utilities', label: 'Utilities', icon: '⚙' },
  { id: 'remove', label: 'Remove', icon: '✕' },
];

const fmt = new Intl.NumberFormat('en-US');

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

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/**
 * DOM overlay: top bar, left build sidebar, stub category panel and the Results
 * screen. Re-renders from game state on every game change.
 */
export class Hud {
  private readonly topBar = el('header', 'hud-top');
  private readonly sidebar = el('nav', 'hud-sidebar');
  private readonly panel = el('section', 'hud-panel');
  private readonly results = el('div', 'hud-results');

  private readonly phaseBanner = el('div', 'hud-phase');
  private readonly phaseTitle = el('div', 'hud-phase-title');
  private readonly phaseSubtitle = el('div', 'hud-phase-sub');
  private readonly goldValue = el('span', 'hud-stat-value');
  private readonly raidValue = el('span', 'hud-stat-value');
  private readonly raidSub = el('span', 'hud-stat-sub');

  private readonly prepGroup = el('div', 'hud-group hud-prep');
  private readonly startButton = el('button', 'hud-btn hud-start', '⚔ Start Raid');

  private readonly raidGroup = el('div', 'hud-group hud-raid');
  private readonly progressFill = el('div', 'hud-progress-fill');
  private readonly progressLabel = el('div', 'hud-progress-label');
  private readonly adventurersValue = el('span', 'hud-stat-value');
  private readonly pauseButton = el('button', 'hud-btn hud-pause');
  private readonly speedButtons = new Map<number, HTMLButtonElement>();

  private readonly categoryButtons = new Map<Category, HTMLButtonElement>();
  private openCategory: Category | null = null;

  private readonly resultsTitle = el('h2');
  private readonly resultsGold = el('div', 'hud-results-gold');
  private readonly resultsDetail = el('p', 'hud-results-detail');
  private readonly continueButton = el('button', 'hud-btn hud-start', 'Continue');

  constructor(
    private readonly root: HTMLElement,
    private readonly game: Game,
  ) {
    this.buildTopBar();
    this.buildSidebar();
    this.buildResults();
    this.panel.hidden = true;
    root.append(this.topBar, this.sidebar, this.panel, this.results);
    game.onChange(() => this.render());
    this.render();
  }

  /** Screen area covered by the HUD, so the scene can centre the dungeon in the rest. */
  readonly insets = (): ViewportInsets => ({
    top: this.topBar.getBoundingClientRect().bottom,
    left: this.sidebar.getBoundingClientRect().right,
  });

  private buildTopBar(): void {
    const logo = el('div', 'hud-logo');
    logo.append(el('span', '', 'Dungeon'), el('span', '', 'Company'));

    this.phaseBanner.append(el('div', 'hud-phase-icon'), this.phaseTitle, this.phaseSubtitle);

    const gold = el('div', 'hud-stat hud-gold');
    gold.title = 'Gold';
    gold.append(el('span', 'hud-stat-icon', '🪙'), this.goldValue);

    const raid = el('div', 'hud-stat hud-cycle');
    const raidText = el('div', 'hud-stat-text');
    raidText.append(this.raidValue, this.raidSub);
    raid.append(el('span', 'hud-stat-icon', '💀'), raidText);

    this.prepGroup.append(
      el('div', 'hud-hint', 'Prepare your dungeon, then start the next raid.'),
      this.startButton,
    );
    this.startButton.addEventListener('click', () => this.act(() => this.game.startRaid()));

    const progress = el('div', 'hud-progress');
    const track = el('div', 'hud-progress-track');
    track.append(this.progressFill);
    progress.append(track, this.progressLabel);

    const adventurers = el('div', 'hud-stat hud-adventurers');
    const advText = el('div', 'hud-stat-text');
    advText.append(this.adventurersValue, el('span', 'hud-stat-sub', 'Adventurers'));
    adventurers.append(el('span', 'hud-stat-icon', '👥'), advText);

    this.pauseButton.addEventListener('click', () => this.act(() => this.game.togglePause()));

    const speeds = el('div', 'hud-speeds');
    for (const speed of this.game.config.raid.speedOptions) {
      const button = el('button', 'hud-btn hud-speed', `${speed}x`);
      button.addEventListener('click', () => this.act(() => this.game.setSpeed(speed)));
      this.speedButtons.set(speed, button);
      speeds.append(button);
    }
    this.raidGroup.append(progress, adventurers, this.pauseButton, speeds);

    this.topBar.append(logo, this.phaseBanner, gold, raid, this.prepGroup, this.raidGroup);
  }

  private buildSidebar(): void {
    for (const cat of CATEGORIES) {
      const button = el('button', 'hud-cat');
      button.dataset.category = cat.id;
      button.append(
        el('span', 'hud-cat-icon', cat.icon),
        el('span', 'hud-cat-label', cat.label),
        el('span', 'hud-cat-lock', '🔒'),
      );
      button.addEventListener('click', () => {
        this.openCategory = this.openCategory === cat.id ? null : cat.id;
        this.render();
      });
      this.categoryButtons.set(cat.id, button);
      this.sidebar.append(button);
    }
  }

  private buildResults(): void {
    const card = el('div', 'hud-results-card');
    card.append(this.resultsTitle, this.resultsGold, this.resultsDetail, this.continueButton);
    this.results.append(card);
    this.continueButton.addEventListener('click', () =>
      this.act(() => this.game.continueToPreparation()),
    );
  }

  /** UI controls are disabled when an action is not allowed; this is a safety net. */
  private act(action: () => void): void {
    try {
      action();
    } catch (err) {
      console.warn(err);
    }
  }

  private render(): void {
    const { game } = this;
    const phase = game.phase;
    const inRaid = phase === 'Raid';
    const banner = inRaid
      ? { title: 'Raid', sub: 'Defend your dungeon', cls: 'raid' }
      : { title: 'Preparation', sub: 'Build • Hire • Plan • Defend', cls: 'prep' };
    if (phase === 'Results') Object.assign(banner, { title: 'Results', sub: 'Raid report', cls: 'results' });
    this.root.dataset.phase = phase;
    this.phaseBanner.dataset.variant = banner.cls;
    setText(this.phaseTitle, banner.title);
    setText(this.phaseSubtitle, banner.sub);
    setText(this.goldValue, fmt.format(game.gold));
    setText(this.raidValue, `Raid ${phase === 'Preparation' ? game.cycle + 1 : game.cycle}`);
    setText(this.raidSub, phase === 'Preparation' ? 'Up next' : inRaid ? 'In progress' : 'Finished');

    this.prepGroup.hidden = phase !== 'Preparation';
    this.startButton.disabled = !game.canTransitionTo('Raid');

    this.raidGroup.hidden = !inRaid;
    const raid = game.raid;
    if (inRaid && raid) {
      const pct = Math.round(raid.progress * 100);
      this.progressFill.style.width = `${pct}%`;
      setText(this.progressLabel, `Adventurers progress: ${pct}%`);
      setText(this.adventurersValue, `${raid.aliveMembers}/${raid.party.members.length}`);
      setText(this.pauseButton, game.paused ? '▶' : '❚❚');
      this.pauseButton.title = game.paused ? 'Resume' : 'Pause';
      this.pauseButton.setAttribute('aria-label', this.pauseButton.title);
      this.pauseButton.classList.toggle('active', game.paused);
    }
    for (const [speed, button] of this.speedButtons) {
      button.disabled = !inRaid;
      button.classList.toggle('active', inRaid && game.speed === speed);
      button.setAttribute('aria-pressed', String(inRaid && game.speed === speed));
    }
    this.pauseButton.disabled = !inRaid;

    const locked = game.buildLocked;
    if (locked) this.openCategory = null;
    for (const [id, button] of this.categoryButtons) {
      button.disabled = locked;
      button.classList.toggle('locked', locked);
      button.classList.toggle('active', this.openCategory === id);
      button.title = locked ? 'Building is locked during a raid' : '';
    }
    this.renderPanel();
    this.renderResults();
  }

  private renderPanel(): void {
    const cat = CATEGORIES.find((c) => c.id === this.openCategory);
    this.panel.hidden = !cat;
    if (!cat) return;
    const { registries } = this.game;
    const entries: Array<Identified & { cost: number }> =
      cat.id === 'rooms'
        ? registries.rooms.list()
        : cat.id === 'traps'
          ? registries.traps.list()
          : cat.id === 'monsters'
            ? registries.monsters.list()
            : [];
    const key = `${cat.id}:${entries.length}`;
    if (this.panel.dataset.key === key) return;
    this.panel.dataset.key = key;

    const close = el('button', 'hud-panel-close', '×');
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => {
      this.openCategory = null;
      this.render();
    });
    const header = el('div', 'hud-panel-header');
    header.append(el('h3', '', cat.label), close);

    const body = el('div', 'hud-panel-body');
    if (entries.length > 0) {
      const list = el('ul', 'hud-panel-list');
      for (const entry of entries) {
        const item = el('li');
        item.append(el('span', '', entry.name), el('span', 'hud-panel-cost', `🪙 ${fmt.format(entry.cost)}`));
        list.append(item);
      }
      body.append(list);
    }
    body.append(el('p', 'hud-panel-note', 'Placement is coming in a later update.'));
    this.panel.replaceChildren(header, body);
  }

  private renderResults(): void {
    const result = this.game.lastResult;
    const show = this.game.phase === 'Results' && result !== null;
    this.results.hidden = !show;
    if (!show) return;
    const success = result.outcome === 'success';
    this.results.dataset.outcome = result.outcome;
    setText(this.resultsTitle, success ? 'Dungeon Defended!' : 'Dungeon Breached!');
    setText(
      this.resultsGold,
      success
        ? `+${fmt.format(result.goldDelta)} gold earned`
        : `${fmt.format(Math.abs(result.goldDelta))} gold lost`,
    );
    setText(
      this.resultsDetail,
      success
        ? `Raid ${result.cycle}: the party was wiped out after ${result.roomsVisited} room${result.roomsVisited === 1 ? '' : 's'}. Gold: ${fmt.format(result.goldBefore)} → ${fmt.format(result.goldAfter)}.`
        : `Raid ${result.cycle}: the party reached your core with ${result.partyStrengthEnd} strength left. Gold: ${fmt.format(result.goldBefore)} → ${fmt.format(result.goldAfter)}.`,
    );
  }
}
