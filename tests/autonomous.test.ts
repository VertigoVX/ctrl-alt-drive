import { describe, it, expect } from 'vitest';
import { createAutonomous, updateAutonomous, DEFAULT_AV_TUNING, headlightsOn, type Autonomous } from '../src/core/autonomous';
import { Tile, type CityMap, tileCenter, worldToTile, isDrivable, tileAt } from '../src/core/city';
import { createRng } from '../src/core/rng';
import { dist } from '../src/core/math';

function makeMap(rows: string[]): CityMap {
  const legend: Record<string, Tile> = { '#': Tile.Building, '.': Tile.Road };
  return {
    width: rows[0].length, height: rows.length, tileSize: 64, seed: 0,
    tiles: rows.join('').split('').map((c) => legend[c]),
    roadRows: [], roadCols: [], rowNames: new Map(), colNames: new Map(), buildings: [],
  };
}

// A loop road around a solid block, plus a cross street.
const map = makeMap([
  '##############',
  '#............#',
  '#.####.#####.#',
  '#.####.#####.#',
  '#............#',
  '##############',
]);

const tick = 1 / 60;
function step(av: Autonomous, taxi: { x: number; y: number }, seconds: number, seed = 1) {
  const rng = createRng(seed);
  for (let t = 0; t < seconds; t += tick) updateAutonomous(av, { map, taxi, dt: tick, rng, tuning: DEFAULT_AV_TUNING });
}
// Somewhere the car can never see: tucked behind the block, far away.
const hidden = tileCenter(map, 12, 4);

describe('self-driving car behaviour', () => {
  it('starts patrolling with headlights off', () => {
    const av = createAutonomous(1, map, { x: 1, y: 1 }, 0);
    expect(av.state).toBe('patrol');
    expect(headlightsOn(av)).toBe(false);
  });

  it('patrols along roads without U-turning at junctions', () => {
    const av = createAutonomous(1, map, { x: 3, y: 1 }, 0);
    const visited: string[] = [];
    const rng = createRng(5);
    for (let t = 0; t < 20; t += tick) {
      updateAutonomous(av, { map, taxi: { x: -9999, y: -9999 }, dt: tick, rng, tuning: DEFAULT_AV_TUNING });
      const tt = worldToTile(map, av.pos);
      expect(isDrivable(tileAt(map, tt.x, tt.y))).toBe(true);
      const k = `${av.tile.x},${av.tile.y}`;
      if (visited[visited.length - 1] !== k) visited.push(k);
    }
    expect(visited.length).toBeGreaterThan(10);
    for (let i = 2; i < visited.length; i++) expect(visited[i]).not.toBe(visited[i - 2]);
  });

  it('flashes its headlights (alert) when it spots the taxi, then gives chase', () => {
    const av = createAutonomous(1, map, { x: 1, y: 1 }, 0); // facing east down the top street
    const taxi = tileCenter(map, 5, 1);
    step(av, taxi, 0.05);
    expect(av.state).toBe('alert');
    expect(headlightsOn(av)).toBe(true);
    step(av, taxi, DEFAULT_AV_TUNING.alertTime + 0.1);
    expect(av.state).toBe('chase');
  });

  it('closes the distance while chasing, faster than it patrols', () => {
    expect(DEFAULT_AV_TUNING.chaseSpeed).toBeGreaterThan(DEFAULT_AV_TUNING.patrolSpeed);
    const av = createAutonomous(1, map, { x: 1, y: 1 }, 0);
    const taxi = tileCenter(map, 9, 1);
    step(av, taxi, 0.6);
    const before = dist(av.pos, taxi);
    step(av, taxi, 1);
    expect(dist(av.pos, taxi)).toBeLessThan(before - 100);
  });

  it('cannot see through buildings', () => {
    const av = createAutonomous(1, map, { x: 1, y: 1 }, Math.PI / 2); // facing south along the west street
    step(av, tileCenter(map, 3, 4), 0.02); // taxi is around the corner behind the block's edge? no — it is in the open
    const blocked = createAutonomous(2, map, { x: 3, y: 1 }, Math.PI / 2);
    step(blocked, tileCenter(map, 3, 4), 0.3); // straight south of it, but the block is in between
    expect(blocked.state).toBe('patrol');
  });

  it('switches to searching the last known position once the taxi breaks line of sight', () => {
    const av = createAutonomous(1, map, { x: 1, y: 1 }, 0);
    step(av, tileCenter(map, 5, 1), 0.6);
    expect(av.state).toBe('chase');
    step(av, hidden, DEFAULT_AV_TUNING.memory + 0.1);
    expect(av.state).toBe('search');
    expect(headlightsOn(av)).toBe(false);
    expect(av.lastSeen).not.toBeNull();
  });

  it('gives up and patrols again after searching for a while', () => {
    const av = createAutonomous(1, map, { x: 1, y: 1 }, 0);
    step(av, tileCenter(map, 5, 1), 0.6);
    step(av, hidden, DEFAULT_AV_TUNING.memory + DEFAULT_AV_TUNING.searchTime + 0.5);
    expect(av.state).toBe('patrol');
  });

  it('stands still and sees nothing while rebooting, then resumes patrol', () => {
    const av = createAutonomous(1, map, { x: 1, y: 1 }, 0);
    av.state = 'rebooting';
    av.stateTime = 0;
    const start = { ...av.pos };
    step(av, tileCenter(map, 3, 1), 1);
    expect(av.pos).toEqual(start);
    expect(av.state).toBe('rebooting');
    step(av, tileCenter(map, 3, 1), DEFAULT_AV_TUNING.rebootTime);
    expect(av.state).not.toBe('rebooting');
  });

  it('scales its speed with difficulty', () => {
    const slow = createAutonomous(1, map, { x: 1, y: 1 }, 0);
    const fast = createAutonomous(2, map, { x: 1, y: 1 }, 0);
    fast.speedScale = 1.3;
    const rng = createRng(1);
    for (let t = 0; t < 0.5; t += tick) {
      updateAutonomous(slow, { map, taxi: hidden, dt: tick, rng, tuning: DEFAULT_AV_TUNING });
      updateAutonomous(fast, { map, taxi: hidden, dt: tick, rng, tuning: DEFAULT_AV_TUNING });
    }
    const s0 = tileCenter(map, 1, 1);
    expect(dist(fast.pos, s0)).toBeGreaterThan(dist(slow.pos, s0));
  });
});
