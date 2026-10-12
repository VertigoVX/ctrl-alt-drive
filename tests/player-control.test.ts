import { describe, it, expect } from 'vitest';
import { createGame, updateGame, GAME_RULES } from '../src/core/game';
import { CITIES } from '../src/core/cities';
import { nextTurn } from '../src/core/pathfinding';
import { angleDiff } from '../src/core/math';

const dt = 1 / 60;

/**
 * The route line is a suggestion. Evading the fleet means taking other streets, so the game loop
 * must never steer the cab towards the route on the player's behalf. (An Oct 9 change did, and
 * forced every player round the route's next turn.)
 */
describe('the player is always in control of the steering', () => {
  it('steering away from the route near its turn turns the cab the player’s way, in every city', () => {
    let tested = 0;
    for (const [i, city] of CITIES.entries()) {
      for (let seed = 1; seed <= 6; seed++) {
        const g = createGame({ seed: seed * 10 + i, city });
        for (let t = 0; t < GAME_RULES.countdown + 0.05; t += dt) updateGame(g, { throttle: 0, steer: 0 }, dt);
        g.avs = [];
        g.invulnerable = 1e9;
        // Walk the cab along its route, a tile at a time, until the route's next turn is 3 tiles off.
        let found = false;
        for (let step = 0; step < 60 && g.job.stage === 'pickup'; step++) {
          g.routeTimer = 0; // keep the route fresh after each hop
          updateGame(g, { throttle: 0, steer: 0 }, dt);
          const turn = nextTurn(g.route);
          if (turn.kind !== 'arrive' && turn.tilesAway === 3) {
            found = true;
            break;
          }
          if (g.route.length < 2) break;
          const [a, b] = g.route;
          g.taxi.pos = { x: (b.x + 0.5) * g.map.tileSize, y: (b.y + 0.5) * g.map.tileSize };
          g.taxi.heading = Math.atan2(b.y - a.y, b.x - a.x);
        }
        if (!found) continue;
        const turn = nextTurn(g.route);
        g.taxi.speed = 200;
        const away = turn.kind === 'left' ? 1 : -1;
        const h0 = g.taxi.heading;
        updateGame(g, { throttle: 1, steer: away }, dt);
        expect(Math.sign(angleDiff(h0, g.taxi.heading)), `${city.id} seed ${seed}`).toBe(away);
        tested++;
        break;
      }
    }
    expect(tested).toBe(CITIES.length); // the situation was actually exercised in every city
  });

  it('a cab with no steering input goes straight, even three tiles before a route turn', () => {
    const g = createGame({ seed: 4, city: CITIES[0] });
    for (let t = 0; t < GAME_RULES.countdown + 0.05; t += dt) updateGame(g, { throttle: 0, steer: 0 }, dt);
    g.avs = [];
    g.taxi.heading = Math.round(g.taxi.heading / (Math.PI / 2)) * (Math.PI / 2);
    g.taxi.speed = 200;
    const h0 = g.taxi.heading;
    updateGame(g, { throttle: 1, steer: 0 }, dt);
    expect(Math.abs(angleDiff(h0, g.taxi.heading))).toBeLessThan(1e-6);
  });
});
