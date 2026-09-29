/**
 * Balance probe: a naive bot that follows the route and ignores the fleet.
 * Run with `npx vite-node scripts/balance.ts`. Not part of the test suite — it's a tuning aid.
 */
import { createGame, updateGame, GAME_RULES } from '../src/core/game';
import { tileCenter } from '../src/core/city';
import { angleDiff, angleOf, sub } from '../src/core/math';

const results: { seed: number; fares: number; expired: number; caught: number; time: number; score: number }[] = [];
for (let seed = 1; seed <= 30; seed++) {
  const g = createGame({ seed });
  let expired = 0, caught = 0;
  const dt = 1 / 60;
  for (let t = 0; t < 300 && g.phase !== 'over'; t += dt) {
    let input = { throttle: 0, steer: 0 };
    if (g.phase === 'playing' && g.route.length > 1) {
      const aim = g.route.length > 2 ? g.route[2] : g.route[1];
      const c = tileCenter(g.map, aim.x, aim.y);
      const d = angleDiff(g.taxi.heading, angleOf(sub(c, g.taxi.pos)));
      input = { throttle: Math.abs(d) > 1.2 ? 0.3 : 1, steer: Math.max(-1, Math.min(1, d * 3)) };
    }
    for (const e of updateGame(g, input, dt)) {
      if (e.type === 'fareExpired') expired++;
      if (e.type === 'caught') caught++;
    }
  }
  results.push({ seed, fares: g.fares, expired, caught, time: Math.round(g.time), score: g.score });
}
const avg = (k: keyof (typeof results)[0]) => (results.reduce((a, r) => a + (r[k] as number), 0) / results.length).toFixed(2);
console.log(`lives=${GAME_RULES.lives}  runs=${results.length}`);
console.log(`avg fares ${avg('fares')}  avg expired ${avg('expired')}  avg caught ${avg('caught')}  avg survival ${avg('time')}s  avg score ${avg('score')}`);
console.log('game overs:', results.filter((r) => r.caught >= GAME_RULES.lives).length);
