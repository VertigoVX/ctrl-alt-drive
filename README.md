# Ctrl+Alt+Drive

You're the last human cab in a city of robotaxis. Get every fare there before the self-driving fleet gets you.

A top-down chase game in the spirit of Pac-Man, dressed as a navigation app. Drive a yellow cab through a procedurally generated city, follow the blue route to your passenger, and stay out of the headlights of the self-driving cars patrolling the streets.

**[Play it](https://vertigovx.github.io/ctrl-alt-drive/)**

![Night map: a self-driving car's headlights lock onto the taxi](docs/screenshot-night.png)

<p align="center"><img src="docs/screenshot-day-mobile.png" width="260" alt="Day map on a phone" /></p>

## How to play

| Action | Keys |
|---|---|
| Drive | <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or arrow keys. On a phone, touch and drag anywhere; the cab drives towards your thumb. |
| Start | <kbd>Enter</kbd> on the title screen |
| Pause | <kbd>P</kbd> or <kbd>Esc</kbd> |
| Horn | <kbd>H</kbd>, or the horn button on a phone |
| Cycle map style | <kbd>T</kbd> |
| Sound | <kbd>M</kbd> |

Steering sensitivity can be adjusted from 50% to 150% in **Settings** (title screen or pause menu).

- **Fares.** Pick up at the green pin, drop off at the red one. The meter covers the whole trip, and whatever time is left when you arrive is paid as a bonus. Let it run out and the passenger calls a robotaxi instead.
- **The fleet.** Self-driving cars cruise with their lidar sweeping ahead. The moment one sees you, its headlights flash on and it gives chase. Break its line of sight (buildings block it; water and parks don't) and it searches where it last saw you before giving up.
- **Getting caught** costs you a cab and the passenger. Lose three cabs and the shift is over.
- **Power-ups** appear as keycaps on the road. <kbd>Del</kbd> reboots the whole fleet for a few seconds, and you can ram rebooting cars off the road for points. The lightning key is a Surge: extra top speed for four seconds.
- **Levels.** Every two fares, more cars join the fleet and they get faster.
- **The garage.** Every fare you complete is banked in your wallet, even if the shift ends badly. Spend it on paint jobs, roof lights, horns and map styles (Vintage, Blueprint, Neon Noir). Everything in the garage is cosmetic: nothing you buy makes the game easier. Your wallet and garage are saved in your browser.

Every city is generated from a seed. Add `?seed=12345` to the URL to drive a specific city again, or to challenge a friend on the same map.

## Development

```bash
npm install
npm run dev         # local dev server
npm test            # run the test suite once
npm run test:watch  # TDD loop
npm run coverage    # tests + coverage for src/core
npm run typecheck
npm run build       # production build to dist/
npm run build:single  # one self-contained HTML file in dist-single/
npm run balance     # headless bot playthroughs to sanity-check difficulty
```

Requires Node 20 or newer. Add `?debug` to the URL to expose the live game state as `window.cad` in the console.

### Built test-first

All game logic was written red → green: a failing spec first, then the implementation. The commit history keeps that trail, with `test: …` commits followed by `feat: …` commits. The core has 125 tests at about 98% line coverage.

What makes that practical is a hard split. Everything that decides *what happens* lives in `src/core` as pure, deterministic TypeScript with no DOM access. Randomness comes from a seeded RNG, so a city, a spawn, or an AV's patrol can be reproduced exactly in a test. The renderer and HUD only read game state and draw it.

```
src/
  core/               pure game logic, fully unit-tested
    city.ts           procedural city: street grid, river and bridges, parks, dead-end pruning
    pathfinding.ts    A*, BFS distance fields, turn detection for directions
    vision.ts         line-of-sight ray marching, sight cones, visibility fans
    vehicle.ts        arcade handling: throttle, steering, lane assist, wall sliding
    autonomous.ts     self-driving car state machine
    game.ts           rules: fares, meter, catching, lives, spawner, levels, power-ups
    shop.ts           garage catalogue, wallet, buying/equipping, tamper-safe saves
    settings.ts       player settings (steering sensitivity, sound, map style)
    camera.ts  input.ts  format.ts  math.ts  rng.ts
  render/             canvas renderer, map themes, taxi sprite, garage previews
  ui/                 garage controller, synthesized sound effects
  main.ts             game loop, HUD binding, input wiring
tests/                Vitest specs, one file per core module
scripts/balance.ts    difficulty probe
```

### Design notes

**The city is Pac-Man-legal by construction.** The generator lays a street grid, knocks out random segments to make a maze, cuts a river through it with a few bridges, then repeatedly prunes any road tile with fewer than two exits and keeps only the largest connected network. Tests assert those properties across several seeds: one connected network, no dead ends, water stays in its corridor, at least two bridges.

**Self-driving cars run a small state machine:** patrol → alert → chase → search → patrol, plus rebooting from the power-up. The alert beat, where headlights flicker for 0.4 s before the chase begins, is a deliberate fairness window, so you always get a moment to react. Chasing cars replan with A* a few times a second towards where they last saw you, and keep tracking for 0.8 s after losing sight, so ducking round a corner isn't quite enough on its own.

**What you see is what they see.** Headlight cones are drawn from the same ray-marched line of sight the AI uses. A beam cut off by a building means the car genuinely can't see past it.

**Tuned with a bot.** `npm run balance` plays 30 cities with a bot that follows the route perfectly and ignores the fleet. It averages about four fares and a minute of survival before losing all three cabs, and never runs out the meter. Raw speed isn't enough; you have to evade.

**The garage can't be pay-to-win, by construction.** Shop items carry only an id, a name, a price and a blurb. How each one looks or sounds lives in the render and audio layers, and a test fails if anyone adds a gameplay field to the catalogue. Saves are parsed defensively too: a corrupted or hand-edited save falls back to safe defaults instead of crashing or equipping things you don't own.

**Mobile first-class.** The canvas renders at the device's full pixel density (up to 3×, within a pixel budget) and re-checks its size every frame, so rotating the phone or the browser toolbar sliding away can never leave it stretched. Phones get a closer camera, and the camera frames the taxi in the gap between HUD panels rather than the centre of the screen. On landscape phones the HUD docks down the left side.

**The look borrows a navigation app's grammar:** Apple Maps' day and night palettes, a turn-by-turn banner built from the live route and real street names, a bottom sheet for the fare, and round map controls. The one loud element is the keycap, which appears in the logo, the countdown, and the power-ups on the road.

## Deploying

Pushing to `main` runs the tests and publishes `dist/` to GitHub Pages via `.github/workflows/deploy.yml`. You only need to do one thing: in the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

## License

MIT
