// Sons synthétisés (Web Audio), aucun fichier à charger : la clochette du comptoir, la serviette froissée, le stylo bille,
// les verres qui trinquent pour un vote, le couinement du marqueur rouge et un petit air d’accordéon pour finir.
import { useStore } from '../store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().prefs.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number; attack?: number; vibrato?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
  if (opts.vibrato) {
    const lfo = a.createOscillator();
    const lg = a.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.value = opts.vibrato;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.1, t0 + (opts.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; type?: BiquadFilterType; q?: number; fade?: number; sweep?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buffer = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const data = buffer.getChannelData(0);
  const fade = opts.fade ?? 2;
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** fade;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freq ?? 2400, t0);
  if (opts.sweep) filter.frequency.exponentialRampToValueAtTime(opts.sweep, t0 + dur);
  if (opts.q) filter.Q.value = opts.q;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  /** Toucher un bouton. */
  tap: () => noise(0.03, { gain: 0.12, freq: 2600, q: 3, fade: 6 }),
  /** Une serviette qu'on froisse : d'autres questions. */
  paper: () => noise(0.28, { gain: 0.16, freq: 4200, q: 0.7, fade: 1.6 }),
  /** La clochette du comptoir : la manche commence, on écrit. */
  bell: () => {
    tone(1568, 0.9, { type: 'sine', gain: 0.05 });
    tone(2349.3, 0.7, { type: 'sine', gain: 0.025, delay: 0.005 });
    tone(3136, 0.4, { type: 'sine', gain: 0.012, delay: 0.01 });
  },
  /** Le stylo bille sur le papier : une histoire rendue, un nom posé. */
  pen: () => {
    noise(0.07, { gain: 0.16, freq: 5200, q: 2, fade: 3 });
    noise(0.06, { gain: 0.12, freq: 4600, q: 2, fade: 3, delay: 0.09 });
  },
  /** Deux verres qui trinquent : un vote. */
  glass: () => {
    tone(2637, 0.5, { type: 'sine', gain: 0.04 });
    tone(3520, 0.35, { type: 'sine', gain: 0.02, delay: 0.003 });
    tone(2793, 0.4, { type: 'sine', gain: 0.025, delay: 0.06 });
  },
  /** Le marqueur rouge qui couine : la fausse histoire est démasquée. */
  marker: () => {
    noise(0.22, { gain: 0.22, freq: 2400, q: 6, fade: 0.6, sweep: 3600 });
    noise(0.18, { gain: 0.2, freq: 3000, q: 6, fade: 0.6, sweep: 2200, delay: 0.24 });
  },
  /** Le rôle se dévoile : le même froissement pour tout le monde, pour ne rien trahir aux voisins. */
  secret: () => {
    noise(0.2, { gain: 0.14, freq: 3800, q: 0.8, fade: 1.8 });
    tone(659.25, 0.3, { type: 'triangle', gain: 0.03, delay: 0.12 });
  },
  /** Un tic, les dernières secondes. */
  tick: () => noise(0.02, { gain: 0.08, freq: 3600, q: 4, fade: 8 }),
  /** Le temps est écoulé : deux notes douces. */
  time: () => {
    tone(784, 0.25, { type: 'sine', gain: 0.05 });
    tone(523.25, 0.45, { type: 'sine', gain: 0.05, delay: 0.18 });
  },
  /** Une signature apparaît. */
  sign: (i = 0) => noise(0.12, { gain: 0.1, freq: 4400 + i * 120, q: 2.5, fade: 2.4 }),
  /** Les points de la manche. */
  coin: (i = 0) => {
    tone(988 + i * 120, 0.09, { type: 'square', gain: 0.022 });
    tone(1318.5 + i * 160, 0.22, { type: 'square', gain: 0.022, delay: 0.08 });
  },
  /** Fin de partie : un petit air d'accordéon, ou trois notes qui traînent. */
  fanfare: (good: boolean) => {
    const notes = good ? [587.33, 739.99, 880, 739.99, 987.77, 880, 1174.66] : [440, 415.3, 392, 329.63];
    const gaps = good ? [0, 0.16, 0.32, 0.52, 0.68, 0.84, 1.04] : [0, 0.24, 0.48, 0.76];
    notes.forEach((f, i) => tone(f, good ? 0.32 : 0.55, { type: 'sawtooth', gain: 0.018, delay: gaps[i], attack: 0.03, vibrato: 6 }));
    notes.forEach((f, i) => tone(f * 1.003, good ? 0.32 : 0.55, { type: 'sawtooth', gain: 0.014, delay: gaps[i], attack: 0.03, vibrato: 6 }));
    notes.forEach((f, i) => tone(f / 2, good ? 0.32 : 0.55, { type: 'triangle', gain: 0.03, delay: gaps[i] }));
  },
};
