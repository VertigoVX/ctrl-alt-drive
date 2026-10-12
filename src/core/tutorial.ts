import { createAutonomous, type Autonomous } from './autonomous';
import { worldToTile } from './city';
import type { GameEvent, GameState } from './game';
import { TUTORIAL_PASSENGER } from './passengers';

export { TUTORIAL_PASSENGER };

// The guided first fare. Pure: main.ts feeds it game events and shows `message` in a coach card.

export type TutorialStep = 'pickup' | 'deliver' | 'robotaxi' | 'spotted' | 'escaped' | 'caught' | 'finish' | 'done';

export interface Tutorial {
  step: TutorialStep;
  message: string;
  finished: boolean;
  touch: boolean;
  pickedUpAt: number;
  spawnedAt: number | null;
}

export interface TutorialContext {
  /** Seconds since the shift started. */
  time: number;
  touch: boolean;
}

/** Seconds after the pickup before the robotaxi appears. */
const ROBOTAXI_DELAY = 2.5;
/** If the robotaxi hasn't noticed the cab by now, move on. */
const ROBOTAXI_PATIENCE = 12;

const controls = (touch: boolean) => (touch ? 'Point your thumb where you want to go.' : 'Drive with the arrow keys or WASD.');

// Kept to two or three lines on a phone: the card sits over the map you need to see.
const MESSAGES: Record<TutorialStep, (t: Tutorial) => string> = {
  pickup: (t) => `Follow the blue line to ${TUTORIAL_PASSENGER} at the green pin. ${controls(t.touch)}`,
  deliver: () => `${TUTORIAL_PASSENGER} is in. Follow the line to the red pin. The meter is paused.`,
  robotaxi: () => 'Robotaxi ahead: the car with the blue roof sensor. Its headlights come on when it sees you.',
  spotted: () => 'It has seen you. Turn a corner to break its line of sight.',
  escaped: () => 'You lost it. Now finish the fare.',
  caught: () => 'Caught. In a real shift that costs a cab. Finish the fare.',
  finish: () => 'Finish the fare at the red pin.',
  done: () => 'Fare paid.',
};

function go(t: Tutorial, step: TutorialStep) {
  t.step = step;
  t.message = MESSAGES[step](t);
  if (step === 'done') t.finished = true;
}

export function createTutorial(ctx: TutorialContext): Tutorial {
  const t: Tutorial = { step: 'pickup', message: '', finished: false, touch: ctx.touch, pickedUpAt: 0, spawnedAt: null };
  go(t, 'pickup');
  return t;
}

export interface TutorialActions {
  /** Place the one tutorial robotaxi now (see placeTutorialRobotaxi). */
  spawnRobotaxi: boolean;
}

export function stepTutorial(t: Tutorial, events: GameEvent[], ctx: TutorialContext): TutorialActions {
  const actions: TutorialActions = { spawnRobotaxi: false };
  if (t.finished) return actions;
  for (const e of events) {
    if (e.type === 'pickup' && t.step === 'pickup') {
      t.pickedUpAt = ctx.time;
      go(t, 'deliver');
    } else if (e.type === 'dropoff' && t.step !== 'pickup') {
      go(t, 'done');
      return actions;
    } else if (e.type === 'spotted' && (t.step === 'robotaxi' || t.step === 'escaped')) {
      go(t, 'spotted');
    } else if (e.type === 'escaped' && t.step === 'spotted') {
      go(t, 'escaped');
    } else if (e.type === 'tutorialCaught' && t.step !== 'pickup') {
      go(t, 'caught');
    }
  }
  if (t.step === 'deliver' && t.spawnedAt === null && ctx.time - t.pickedUpAt >= ROBOTAXI_DELAY) {
    t.spawnedAt = ctx.time;
    actions.spawnRobotaxi = true;
    go(t, 'robotaxi');
  } else if (t.step === 'robotaxi' && t.spawnedAt !== null && ctx.time - t.spawnedAt >= ROBOTAXI_PATIENCE) {
    go(t, 'finish');
  }
  return actions;
}

/**
 * Put the tutorial's robotaxi on the cab's route, about 6 tiles ahead, heading back along the route
 * towards the cab so the player gets a clear look at its headlights and a chance to dodge.
 */
export function placeTutorialRobotaxi(g: GameState): Autonomous | null {
  const route = g.route;
  if (route.length < 3) return null;
  const here = worldToTile(g.map, g.taxi.pos);
  const start = route.findIndex((p) => p.x === here.x && p.y === here.y);
  const from = start === -1 ? 0 : start;
  const i = Math.min(route.length - 1, from + 6);
  if (i - from < 4) return null;
  const tile = route[i];
  const toward = route[i - 1];
  const av = createAutonomous(g.nextAvId++, g.map, tile, Math.atan2(toward.y - tile.y, toward.x - tile.x));
  av.next = { ...toward };
  // Fully visible straight away, rather than fading in like a normal spawn.
  av.age = 1;
  g.avs.push(av);
  return av;
}
