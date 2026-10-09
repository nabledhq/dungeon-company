import Phaser from 'phaser';
import { getRoom } from '../core/dungeon';
import type { Game } from '../core/game';
import type { RaidSimulation } from '../core/raid';
import type { Room } from '../core/types';

/** Pixel layout of the placeholder top-down dungeon. */
const CELL = 260;
const ROOM_W = 196;
const ROOM_H = 150;
const MAX_FRAME_MS = 100;

const ROLE_COLORS: Record<string, number> = {
  Fighter: 0x6fa8dc,
  Wizard: 0x8e7cc3,
  Rogue: 0x93c47d,
  Cleric: 0xf1e3a0,
};

export interface ViewportInsets {
  top: number;
  left: number;
}

interface RoomView {
  container: Phaser.GameObjects.Container;
  floor: Phaser.GameObjects.Rectangle;
  flash: Phaser.GameObjects.Rectangle;
}

/**
 * Renders the dungeon and the raiding party. Reads game state only; the sole
 * mutation it performs is driving the raid clock via game.update(dt).
 */
export class DungeonScene extends Phaser.Scene {
  private readonly game_: Game;
  private readonly getInsets: () => ViewportInsets;

  private renderedVersion = -1;
  private corridors!: Phaser.GameObjects.Graphics;
  private roomLayer!: Phaser.GameObjects.Container;
  private partyLayer!: Phaser.GameObjects.Container;
  private roomViews = new Map<string, RoomView>();

  private trackedRaid: RaidSimulation | null = null;
  private partyMarkers: Phaser.GameObjects.Arc[] = [];
  private shownMembers = 0;
  private processedEvents = 0;

  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

  constructor(game: Game, getInsets: () => ViewportInsets) {
    super('dungeon');
    this.game_ = game;
    this.getInsets = getInsets;
  }

  create(): void {
    this.corridors = this.add.graphics();
    this.roomLayer = this.add.container();
    this.partyLayer = this.add.container();
    this.setupInput();
    this.redrawDungeon();
    this.centerCamera();
  }

  update(_time: number, delta: number): void {
    this.game_.update(Math.min(delta, MAX_FRAME_MS));
    if (this.renderedVersion !== this.game_.dungeonVersion) this.redrawDungeon();
    this.updateParty();
    this.updateKeyboardPan(delta);
  }

  // ---- Camera / input ------------------------------------------------------

  private setupInput(): void {
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({
      up: K.UP,
      down: K.DOWN,
      left: K.LEFT,
      right: K.RIGHT,
      w: K.W,
      a: K.A,
      s: K.S,
      d: K.D,
    }) as typeof this.keys;

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });

    this.input.on(
      'wheel',
      (p: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
        const cam = this.cameras.main;
        const { zoomMin, zoomMax, zoomStep } = this.game_.config.camera;
        const next = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 1 - zoomStep : 1 + zoomStep), zoomMin, zoomMax);
        if (next === cam.zoom) return;
        // Keep the world point under the cursor fixed while zooming.
        const before = cam.getWorldPoint(p.x, p.y);
        cam.setZoom(next);
        cam.preRender();
        const after = cam.getWorldPoint(p.x, p.y);
        cam.scrollX += before.x - after.x;
        cam.scrollY += before.y - after.y;
      },
    );

    this.scale.on('resize', () => this.centerCamera());
  }

  private updateKeyboardPan(delta: number): void {
    const k = this.keys;
    const dx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const dy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    if (!dx && !dy) return;
    const cam = this.cameras.main;
    const step = (this.game_.config.camera.panSpeed * delta) / 1000 / cam.zoom;
    cam.scrollX += dx * step;
    cam.scrollY += dy * step;
  }

  /** Centre the dungeon in the part of the canvas not covered by the HUD. */
  private centerCamera(): void {
    const rooms = this.game_.dungeon.rooms;
    if (rooms.length === 0) return;
    const xs = rooms.map((r) => r.col * CELL);
    const ys = rooms.map((r) => r.row * CELL);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const cam = this.cameras.main;
    const insets = this.getInsets();
    const widthNeeded = Math.max(...xs) - Math.min(...xs) + CELL;
    const heightNeeded = Math.max(...ys) - Math.min(...ys) + CELL;
    const { zoomMin, zoomMax } = this.game_.config.camera;
    const fit = Math.min(
      (cam.width - insets.left) / widthNeeded,
      (cam.height - insets.top) / heightNeeded,
      1,
    );
    cam.setZoom(Phaser.Math.Clamp(fit, zoomMin, zoomMax));
    cam.centerOn(cx - insets.left / 2 / cam.zoom, cy - insets.top / 2 / cam.zoom);
  }

  // ---- Dungeon -------------------------------------------------------------

  private redrawDungeon(): void {
    const { dungeon, registries } = this.game_;
    this.renderedVersion = this.game_.dungeonVersion;
    this.roomLayer.removeAll(true);
    this.roomViews.clear();

    const g = this.corridors.clear();
    for (const [a, b] of dungeon.connections) {
      const ra = getRoom(dungeon, a);
      const rb = getRoom(dungeon, b);
      g.lineStyle(34, 0x2a2420, 1);
      g.lineBetween(ra.col * CELL, ra.row * CELL, rb.col * CELL, rb.row * CELL);
      g.lineStyle(22, 0x4a3f36, 1);
      g.lineBetween(ra.col * CELL, ra.row * CELL, rb.col * CELL, rb.row * CELL);
    }

    for (const room of dungeon.rooms) {
      const type = registries.rooms.get(room.typeId);
      const isEntrance = room.id === dungeon.entranceId;
      const isCore = room.id === dungeon.coreId;
      const c = this.add.container(room.col * CELL, room.row * CELL);

      const wall = this.add.rectangle(0, 0, ROOM_W + 14, ROOM_H + 14, 0x2b2622).setStrokeStyle(2, 0x111111);
      const floor = this.add
        .rectangle(0, 0, ROOM_W, ROOM_H, type.color)
        .setStrokeStyle(3, isCore ? 0xf2c14e : isEntrance ? 0x7fd18b : 0x1b1714);
      const tiles = this.add.graphics();
      tiles.lineStyle(1, 0x000000, 0.18);
      for (let x = -ROOM_W / 2 + 28; x < ROOM_W / 2; x += 28) tiles.lineBetween(x, -ROOM_H / 2, x, ROOM_H / 2);
      for (let y = -ROOM_H / 2 + 28; y < ROOM_H / 2; y += 28) tiles.lineBetween(-ROOM_W / 2, y, ROOM_W / 2, y);

      const label = this.add
        .text(0, -ROOM_H / 2 - 4, type.name.toUpperCase(), {
          fontFamily: 'Georgia, serif',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#f4e9d0',
          backgroundColor: '#1c1815',
          padding: { x: 8, y: 4 },
        })
        .setOrigin(0.5, 0.5);

      const items: Phaser.GameObjects.GameObject[] = [wall, floor, tiles, label];
      if (isEntrance || isCore) {
        items.push(
          this.add
            .text(0, ROOM_H / 2 - 16, isCore ? '★ CORE' : '▶ ENTRANCE', {
              fontFamily: 'sans-serif',
              fontSize: '12px',
              fontStyle: 'bold',
              color: isCore ? '#f2c14e' : '#7fd18b',
            })
            .setOrigin(0.5),
        );
      }
      items.push(...this.drawOccupants(room));

      const flash = this.add.rectangle(0, 0, ROOM_W, ROOM_H, 0xff3b30, 0);
      items.push(flash);
      c.add(items);
      this.roomLayer.add(c);
      this.roomViews.set(room.id, { container: c, floor, flash });
    }
  }

  /** Monsters as red circles, traps as grey spikes, with names underneath. */
  private drawOccupants(room: Room): Phaser.GameObjects.GameObject[] {
    const { registries } = this.game_;
    const out: Phaser.GameObjects.GameObject[] = [];
    const total = room.monsterTypeIds.length + room.trapTypeIds.length;
    const spacing = 34;
    let x = -((total - 1) * spacing) / 2;
    for (let i = 0; i < room.trapTypeIds.length; i++) {
      out.push(this.add.triangle(x, 6, 0, 22, 11, 0, 22, 22, 0xb7b7b7).setStrokeStyle(2, 0x333333));
      x += spacing;
    }
    for (let i = 0; i < room.monsterTypeIds.length; i++) {
      out.push(this.add.circle(x, 6, 12, 0xc0392b).setStrokeStyle(2, 0x3b0d08));
      x += spacing;
    }
    if (total > 0) {
      const names = [
        ...room.trapTypeIds.map((id) => registries.traps.get(id).name),
        ...room.monsterTypeIds.map((id) => registries.monsters.get(id).name),
      ];
      const summary = [...new Set(names)]
        .map((n) => {
          const count = names.filter((m) => m === n).length;
          return count > 1 ? `${n} ×${count}` : n;
        })
        .join(', ');
      out.push(
        this.add
          .text(0, 34, summary, { fontFamily: 'sans-serif', fontSize: '12px', color: '#f4e9d0' })
          .setOrigin(0.5),
      );
    }
    return out;
  }

  // ---- Party ---------------------------------------------------------------

  private updateParty(): void {
    const raid = this.game_.raid;
    if (raid !== this.trackedRaid) this.resetParty(raid);
    if (!raid) return;

    this.playNewEvents(raid);

    const alive = raid.aliveMembers;
    while (this.shownMembers > alive) {
      const marker = this.partyMarkers[--this.shownMembers];
      this.tweens.add({ targets: marker, alpha: 0, scale: 0.2, duration: 400 });
    }

    const { x, y } = this.partyPosition(raid);
    const t = this.time.now / 1000;
    const moving = raid.status === 'moving' && !this.game_.paused;
    this.partyMarkers.forEach((m, i) => {
      const angle = (i / this.partyMarkers.length) * Math.PI * 2;
      const r = this.partyMarkers.length > 1 ? 18 : 0;
      const bob = moving ? Math.sin(t * 10 + i) * 3 : 0;
      const jitter = raid.status === 'fighting' && !this.game_.paused ? Math.sin(t * 25 + i * 2) * 3 : 0;
      m.setPosition(x + Math.cos(angle) * r + jitter, y + Math.sin(angle) * r + bob);
    });
  }

  private resetParty(raid: RaidSimulation | null): void {
    this.partyLayer.removeAll(true);
    this.partyMarkers = [];
    this.trackedRaid = raid;
    this.processedEvents = 0;
    this.shownMembers = 0;
    if (!raid) return;
    this.partyMarkers = raid.party.members.map((member) =>
      this.add.circle(0, 0, 10, ROLE_COLORS[member.role] ?? 0xffffff).setStrokeStyle(3, 0x101010),
    );
    this.shownMembers = this.partyMarkers.length;
    this.partyLayer.add(this.partyMarkers);
  }

  /** Interpolates between the centres of the rooms on the path. */
  private partyPosition(raid: RaidSimulation): { x: number; y: number } {
    const { dungeon } = this.game_;
    const i = Math.min(Math.floor(raid.position), raid.path.length - 1);
    const frac = raid.position - i;
    const a = getRoom(dungeon, raid.path[i]);
    const b = getRoom(dungeon, raid.path[Math.min(i + 1, raid.path.length - 1)]);
    return {
      x: Phaser.Math.Linear(a.col, b.col, frac) * CELL,
      y: Phaser.Math.Linear(a.row, b.row, frac) * CELL,
    };
  }

  private playNewEvents(raid: RaidSimulation): void {
    while (this.processedEvents < raid.events.length) {
      const event = raid.events[this.processedEvents++];
      const view = this.roomViews.get(event.roomId);
      if (!view) continue;
      if (event.type === 'encounter' && event.damage > 0) {
        this.tweens.add({ targets: view.flash, fillAlpha: { from: 0.45, to: 0 }, duration: 500 });
        this.floatText(view.container.x, view.container.y - 30, `-${event.damage}`, '#ff6b5e');
      } else if (event.type === 'partyDefeated') {
        this.floatText(view.container.x, view.container.y - 50, 'Party defeated!', '#7fd18b');
      } else if (event.type === 'reachedCore') {
        this.tweens.add({ targets: view.flash, fillAlpha: { from: 0.6, to: 0 }, duration: 900 });
        this.floatText(view.container.x, view.container.y - 50, 'Core breached!', '#ff6b5e');
      }
    }
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const label = this.add
      .text(x, y, text, {
        fontFamily: 'Georgia, serif',
        fontSize: '22px',
        fontStyle: 'bold',
        color,
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: label,
      y: y - 40,
      alpha: 0,
      duration: 1200,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }
}
