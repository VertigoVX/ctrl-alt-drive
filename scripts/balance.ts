/**
 * Balance probe: a naive bot that follows the route and ignores the fleet.
 * Run with `npx vite-node scripts/balance.ts`. Not part of the test suite — it's a tuning aid.
 */
import { createGame, updateGame } from '../src/core/game';
import { CITIES } from '../src/core/cities';
import { MODES, MODE_IDS } from '../src/core/modes';
import { tileCenter } from '../src/core/city';
import { angleDiff, angleOf, sub } from '../src/core/math';
import { nextTurn } from '../src/core/pathfinding';

for (const mode of MODE_IDS) {
const results: { seed: number; fares: number; expired: number; caught: number; time: number; score: number; crashes: number }[] = [];
for (let seed = 1; seed <= 32; seed++) {
  const g = createGame({ seed, mode, city: CITIES[seed % CITIES.length] });
  let expired = 0, caught = 0, crashes = 0;
  const dt = 1 / 60;
  for (let t = 0; t < 300 && g.phase !== 'over'; t += dt) {
    let input = { throttle: 0, steer: 0 };
    if (g.phase === 'playing' && g.route.length > 1) {
      // A competent driver: aims a tile or two ahead, and brakes before corners.
      const aim = g.route.length > 2 ? g.route[2] : g.route[1];
      const c = tileCenter(g.map, aim.x, aim.y);
      const d = angleDiff(g.taxi.heading, angleOf(sub(c, g.taxi.pos)));
      const turn = nextTurn(g.route);
      const cornerSoon = turn.kind !== 'arrive' && turn.tilesAway <= 2;
      const tooFast = g.taxi.speed > (cornerSoon ? 130 : 400);
      input = { throttle: tooFast ? -0.6 : Math.abs(d) > 1.2 ? 0.3 : 1, steer: Math.max(-1, Math.min(1, d * 3)) };
    }
    for (const e of updateGame(g, input, dt)) {
      if (e.type === 'fareExpired') expired++;
      if (e.type === 'caught' || e.type === 'wrecked') caught++;
      if (e.type === 'damage') crashes++;
    }
  }
  results.push({ seed, fares: g.fares, expired, caught, time: Math.round(g.time), score: g.score, crashes });
}
const avg = (k: keyof (typeof results)[0]) => (results.reduce((a, r) => a + (r[k] as number), 0) / results.length).toFixed(2);
console.log(`${MODES[mode].name.padEnd(8)} fares ${avg('fares')}  expired ${avg('expired')}  cabs lost ${avg('caught')}  survival ${avg('time')}s  earned $${avg('score')}  crashes ${avg('crashes')}`);
}
