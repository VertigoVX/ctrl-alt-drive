// Tiny synthesized sound effects: no assets to load, nothing to license.
type Note = [freq: number, start: number, dur: number];

export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      this.ctx = null;
    }
  }

  private play(notes: Note[], type: OscillatorType = 'sine', gain = 0.08) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [freq, start, dur] of notes) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, now + start);
      g.gain.linearRampToValueAtTime(gain, now + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    }
  }

  tick() { this.play([[660, 0, 0.12]], 'triangle', 0.06); }
  go() { this.play([[880, 0, 0.25], [1320, 0.05, 0.3]], 'triangle', 0.07); }
  pickup() { this.play([[523, 0, 0.14], [784, 0.08, 0.22]], 'sine', 0.09); }
  dropoff() { this.play([[784, 0, 0.12], [988, 0.08, 0.12], [1319, 0.16, 0.3]], 'triangle', 0.08); }
  spotted() { this.play([[740, 0, 0.09], [988, 0.1, 0.09], [740, 0.2, 0.09]], 'square', 0.035); }
  escaped() { this.play([[392, 0, 0.1], [587, 0.07, 0.18]], 'sine', 0.06); }
  powerup() { this.play([[523, 0, 0.1], [659, 0.06, 0.1], [784, 0.12, 0.1], [1047, 0.18, 0.25]], 'triangle', 0.07); }
  recycled() { this.play([[220, 0, 0.15], [165, 0.08, 0.25]], 'sawtooth', 0.05); }
  caught() { this.play([[392, 0, 0.18], [311, 0.15, 0.18], [233, 0.3, 0.4]], 'sawtooth', 0.06); }
  /** Cosmetic horns from the garage. Each is a short synthesized phrase. */
  horn(kind: string) {
    switch (kind) {
      case 'horn-twotone':
        this.play([[587, 0, 0.26], [440, 0.26, 0.3]], 'square', 0.05);
        break;
      case 'horn-bell':
        this.play([[2093, 0, 0.35], [2637, 0, 0.3], [2093, 0.16, 0.45], [2637, 0.16, 0.4]], 'sine', 0.05);
        break;
      case 'horn-chiptune':
        this.play([[659, 0, 0.08], [784, 0.08, 0.08], [988, 0.16, 0.08], [1319, 0.24, 0.18]], 'square', 0.045);
        break;
      case 'horn-air':
        this.play([[233, 0, 0.75], [277, 0, 0.75], [349, 0, 0.75]], 'sawtooth', 0.045);
        break;
      default:
        this.play([[415, 0, 0.3], [523, 0, 0.3]], 'square', 0.045);
    }
  }

  expired() { this.play([[330, 0, 0.2], [262, 0.15, 0.3]], 'triangle', 0.06); }
}
