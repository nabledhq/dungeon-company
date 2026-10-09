# dungeon-company
Instead of playing the hero, you run the dungeon. Hire monsters, build rooms, place traps, manage gold, and defend against increasingly ridiculous adventuring parties. It lends itself extremely well to incremental additions: new monster classes, traps, bosses, room types, spells, hero factions, campaigns, and random events.

## Running, testing and building

Requires Node.js 20.19 or newer.

```sh
npm install
npm run dev        # dev server with hot reload (prints the local URL)
npm test           # Vitest unit tests for the game logic (headless, Node)
npm run typecheck  # tsc --noEmit
npm run build      # type-check, then write static files to dist/
npm run preview    # serve dist/ locally
```

`dist/` is plain static HTML/JS/CSS built for the `/dungeon-company/` sub-path (see
below). Browsers block ES modules on `file://` URLs, so serve the folder (for example
with `npm run preview`) instead of double-clicking `index.html`.

## Play online / Deployment

Play in the browser, no setup needed: **https://nabledhq.github.io/dungeon-company/**

* **Local development**: `npm run dev` starts the dev server at `/` (for example
  `http://localhost:5173/`).
* **Production build**: `npm run build` writes `dist/` with all asset URLs under
  `/dungeon-company/`, the GitHub Pages sub-path. `npm run preview` serves that build
  at `http://localhost:4173/dungeon-company/`.
* **Deployment**: the workflow `.github/workflows/deploy-pages.yml` builds the game and
  deploys `dist/` to GitHub Pages on every push to `main`. You can also run it by hand
  from the Actions tab ("Deploy to GitHub Pages" → Run workflow).
* **One-time maintainer setup**: in the repository, open **Settings → Pages** and set
  **Source** to **GitHub Actions**. Until then the deploy job fails.

## How to play

The game loops through three phases: **Preparation → Raid → Results → Preparation**.

* **Preparation**: look over your dungeon, then press **Start Raid**.
* **Raid**: a party of adventurers walks from the entrance towards your core (the
  treasure room). Each room on the way removes strength from the party. Use pause and
  the 1x/2x/4x buttons to control the simulation. Building is locked during a raid.
* **Results**: the party was wiped out (you earn gold) or it reached the core (you lose
  a share of your gold, but never go below 0). **Continue** returns to Preparation.
  There is no game over.

Camera: drag with the mouse or use the arrow keys/WASD to pan, and the mouse wheel to zoom.

The sidebar categories are placeholders for now. They list the registered content, and
placing it will be added later.

### Saving

The run is saved automatically to `localStorage` (key `dungeon-company:save`) at
checkpoints: after every build action (build, remove, hire, place), on entering Results
and on returning to Preparation. Nothing is saved during a raid, so reloading mid-raid
returns you to the Preparation state just before that raid. On page load a start screen
offers **Continue** (only when a valid save exists) and **New Game**, which asks for
confirmation before overwriting an existing run. Unreadable or incompatible saves are
copied to `dungeon-company:save:corrupt` and the start screen offers a new game instead.
If `localStorage` is unavailable the game still runs, just without persistence.

## Project layout

| Path | Contents |
| --- | --- |
| `src/config.ts` | Every tunable: starter gold and rooms, rewards, loss fraction, party strength, move speed, zoom limits |
| `src/core/` | Pure TypeScript game logic with no Phaser or DOM imports: state and phase machine (`game.ts`), raid simulation (`raid.ts`), registries and extension interfaces (`registry.ts`), dungeon graph (`dungeon.ts`), economy (`economy.ts`) |
| `src/content/placeholders.ts` | Placeholder rooms, monsters, traps, hero party generator and reward hook |
| `src/scenes/DungeonScene.ts` | Phaser scene: renders the dungeon and party, camera pan/zoom, and drives the raid clock |
| `src/ui/Hud.ts`, `src/style.css` | DOM HUD overlaid on the canvas: top bar, sidebar and Results screen |
| `src/ui/StartScreen.ts` | New Game / Continue overlay shown on page load |
| `src/save/` | Versioned save envelope, validation and `migrate()` hook (`schema.ts`), `localStorage` access (`storage.ts`) |
| `tests/` | Vitest unit tests for the core logic |

Every state change goes through `Game` (`src/core/game.ts`). Illegal phase transitions
throw `IllegalTransitionError`, and build actions (`buildRoom`, `removeRoom`,
`hireMonster`, `placeTrap`) throw `BuildLockedError` outside Preparation. In both cases
the state is left unchanged. The raid is a fixed-step simulation (`RaidSimulation.tick(dtMs)`).
`Game.update(realDtMs)` applies pause and speed, and the Phaser scene calls it once per frame.

### Placeholder raid rules

* Party strength = `party.baseStrength + cycle × party.strengthPerCycle`.
* The party takes the shortest path from the entrance to the core. In every room it
  loses that room's defense: the `RoomType` defense plus each monster's strength plus
  each trap's damage.
* If the party's strength reaches 0 before it enters the core, the defense succeeds and
  the configured economy reward hook awards gold.
* If the party reaches the core, the player loses `floor(gold × economy.failureLossFraction)`.

## Extending: registering rooms, monsters, traps and more

Core logic never refers to concrete content. It looks everything up by id in the
registries (`src/core/registry.ts`):

| Registry | Interface | Used for |
| --- | --- | --- |
| `registries.rooms` | `RoomType` | Room defense (`getDefense`), cost, placeholder colour |
| `registries.monsters` | `MonsterType` | Strength a monster removes from the party (`getStrength`) |
| `registries.traps` | `TrapType` | Damage a trap deals to the party (`getDamage`) |
| `registries.partyGenerators` | `HeroPartyGenerator` | Builds the raiding party, selected by `config.party.generatorId` |
| `registries.rewardHooks` | `EconomyRewardHook` | Gold for a successful defense, selected by `config.economy.rewardHookId` |

To add content, register it next to the placeholders in `src/content/placeholders.ts`
(or in a new module called from `src/main.ts`). You don't need to change anything in
`src/core/`:

```ts
import type { Registries } from '../core/registry';

export function registerLavaContent(registries: Registries): void {
  // A new room type. Its hook gets the room, the party as it enters and the cycle.
  registries.rooms.register({
    id: 'lava-pit',
    name: 'Lava Pit',
    description: 'Hot underfoot.',
    cost: 300,
    color: 0xb3361b,
    getDefense: ({ party }) => Math.ceil(party.strength * 0.2),
  });

  // A new monster, available to Game.hireMonster(roomId, 'fire-imp').
  registries.monsters.register({
    id: 'fire-imp',
    name: 'Fire Imp',
    cost: 120,
    getStrength: ({ room }) => (room.typeId === 'lava-pit' ? 12 : 6),
  });

  // A new trap, available to Game.placeTrap(roomId, 'flame-jet').
  registries.traps.register({
    id: 'flame-jet',
    name: 'Flame Jet',
    cost: 90,
    getDamage: ({ cycle }) => 5 + cycle,
  });
}
```

Registered ids can then be used in two places:

* in `config.dungeon.rooms`, as `typeId`, `monsterTypeIds` or `trapTypeIds`;
* in the build actions: `game.buildRoom('lava-pit', col, row, neighbourRoomId)`,
  `game.hireMonster(roomId, 'fire-imp')` and `game.placeTrap(roomId, 'flame-jet')`.

Register hero party generators and reward hooks the same way, then select them by id
in `src/config.ts`. Registering an id twice throws, and so does looking up an unknown id.
