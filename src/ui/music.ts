// An original arcade loop, composed here as note data and synthesised live with Web Audio.
// No samples, no licensed melodies. Layers fade in and out with the game's intensity:
//   0 = title (bass + arpeggio), 1 = driving (+ drums), 2 = being chased (+ lead + busy hats).

const BPM = 118;
const STEP = 60 / BPM / 4; // sixteenth note
const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// A minor: Am | F | C | G, one bar each.
const BASS_ROOTS = [45, 41, 48, 43];
const CHORDS = [
  [57, 60, 64, 69],
  [53, 57, 60, 65],
  [55, 60, 64, 67],
  [55, 59, 62, 67],
];
const ARP = [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 1, 2, 3];
const BASS_HITS = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0];

// Lead motif: [step within bar, note, length in steps].
const LEAD: [number, number, number][][] = [
  [[0, 76, 2], [3, 74, 1], [4, 72, 2], [8, 69, 3], [12, 72, 2], [14, 74, 2]],
  [[0, 72, 3], [4, 69, 2], [6, 67, 2], [8, 69, 6]],
  [[0, 72, 2], [2, 74, 2], [4, 76, 3], [8, 79, 2], [10, 76, 2], [12, 74, 4]],
  [[0, 74, 2], [2, 72, 2], [4, 71, 3], [8, 74, 4], [12, 71, 2], [14, 67, 2]],
];

export class Music {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private layers!: { drums: GainNode; lead: GainNode; hats: GainNode };
  private noise!: AudioBuffer;
  private step = 0;
  private nextTime = 0;
  private intensity = 0;
  enabled = true;

  unlock() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.11 : 0;
    this.master.connect(ctx.destination);
    const layer = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      return g;
    };
    this.layers = { drums: layer(), lead: layer(), hats: layer() };
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.nextTime = ctx.currentTime + 0.1;
    window.setInterval(() => this.schedule(), 25);
    this.setIntensity(this.intensity);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(on ? 0.11 : 0, this.ctx.currentTime, 0.15);
  }

  /** 0 = title, 1 = driving, 2 = chased. Layers crossfade smoothly. */
  setIntensity(level: number) {
    this.intensity = level;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.layers.drums.gain.setTargetAtTime(level >= 1 ? 1 : 0, t, 0.4);
    this.layers.lead.gain.setTargetAtTime(level >= 2 ? 1 : 0, t, 0.6);
    this.layers.hats.gain.setTargetAtTime(level >= 2 ? 1 : 0, t, 0.3);
  }

  suspend(on: boolean) {
    if (!this.ctx) return;
    if (on) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private schedule() {
    const ctx = this.ctx!;
    if (ctx.state !== 'running') return;
    // Recover gracefully if the tab was backgrounded.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    // Bass.
    if (BASS_HITS[s]) this.tone(midi(BASS_ROOTS[bar] + (s === 14 ? 12 : 0)), t, STEP * 1.6, 'triangle', 0.55, this.master);
    // Arpeggio.
    this.tone(midi(CHORDS[bar][ARP[s]] + 12), t, STEP * 0.9, 'square', 0.12, this.master);
    // Drums.
    if (s === 0 || s === 8 || (s === 10 && bar === 3)) this.kick(t);
    if (s === 4 || s === 12) this.snare(t);
    if (s % 2 === 0) this.hat(t, this.layers.drums, 0.25);
    else this.hat(t, this.layers.hats, 0.18);
    // Lead, only heard when chased.
    for (const [ls, note, len] of LEAD[bar]) if (ls === s) this.tone(midi(note), t, STEP * len * 0.95, 'square', 0.22, this.layers.lead);
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, out: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.layers.drums);
    o.start(t);
    o.stop(t + 0.2);
  }

  private noiseHit(t: number, dur: number, cutoff: number, vol: number, out: AudioNode) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private snare(t: number) {
    this.noiseHit(t, 0.13, 1200, 0.5, this.layers.drums);
    this.tone(190, t, 0.08, 'triangle', 0.3, this.layers.drums);
  }

  private hat(t: number, out: AudioNode, vol: number) {
    this.noiseHit(t, 0.035, 7000, vol, out);
  }
}
