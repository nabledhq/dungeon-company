import Phaser from 'phaser';
import { DEFAULT_CONFIG } from './config';
import { registerPlaceholderContent } from './content/placeholders';
import { Game } from './core/game';
import { createRegistries } from './core/registry';
import { loadRun, saveRun } from './save';
import { DungeonScene } from './scenes/DungeonScene';
import { Hud } from './ui/Hud';
import { StartScreen } from './ui/StartScreen';
import './style.css';

const registries = createRegistries();
registerPlaceholderContent(registries);

const game = new Game({ registries, config: DEFAULT_CONFIG });
const hudRoot = document.getElementById('hud')!;
const hud = new Hud(hudRoot, game);

// Reject saves that reference content which is no longer registered, without touching the live game.
const load = loadRun((state) => new Game({ registries, config: DEFAULT_CONFIG }).restore(state));
new StartScreen(hudRoot, load, {
  onContinue: (state) => game.restore(state),
  onNewGame: () => {
    game.newGame();
    saveRun(game.snapshot());
  },
});
// Autosave at checkpoints (build actions, entering Results, leaving Results). Never during a raid.
game.onCheckpoint(saveRun);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#14110f',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [new DungeonScene(game, hud.insets)],
});
