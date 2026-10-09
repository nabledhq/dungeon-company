import Phaser from 'phaser';
import { DEFAULT_CONFIG } from './config';
import { registerPlaceholderContent } from './content/placeholders';
import { Game } from './core/game';
import { createRegistries } from './core/registry';
import { DungeonScene } from './scenes/DungeonScene';
import { Hud } from './ui/Hud';
import './style.css';

const registries = createRegistries();
registerPlaceholderContent(registries);

const game = new Game({ registries, config: DEFAULT_CONFIG });
const hud = new Hud(document.getElementById('hud')!, game);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#14110f',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [new DungeonScene(game, hud.insets)],
});
