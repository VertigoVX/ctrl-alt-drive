import { streetNameAt, type CityMap, type Point } from './city';
import { nextTurn, type TurnKind } from './pathfinding';

/** One map tile is roughly half a short city block. */
export const METRES_PER_TILE = 50;

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatDistance(tiles: number): string {
  const m = tiles * METRES_PER_TILE;
  if (m < 20) return 'Now';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export interface Directions {
  icon: TurnKind;
  distance: string;
  instruction: string;
}

export function describeDirections(map: CityMap, route: Point[]): Directions {
  const turn = nextTurn(route);
  if (turn.kind === 'arrive') {
    const last = route[route.length - 1];
    return { icon: 'arrive', distance: formatDistance(turn.tilesAway), instruction: `Arrive on ${streetNameAt(map, last.x, last.y)}` };
  }
  const i = route.findIndex((p) => p.x === turn.at.x && p.y === turn.at.y);
  const after = route[i + 1];
  const street = streetNameAt(map, after.x, after.y);
  return {
    icon: turn.kind,
    distance: formatDistance(turn.tilesAway),
    instruction: `Turn ${turn.kind} onto ${street}`,
  };
}
