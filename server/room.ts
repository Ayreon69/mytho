// Une table de Mytho : salon, manches, rythme des étapes, pilote automatique et vue de chacun.
// Personne ne doit savoir qui est le Mytho ni qui a écrit quoi avant le dévoilement : un brouillon, un vote changé ou
// un nom posé sur une serviette ne sont renvoyés qu'à leur auteur, et le numéro d'état ne bouge pas.
import crypto from 'node:crypto';
import { AVATARS, MAX_PLAYERS, MIN_PLAYERS, isDebate, isRounds, isWrite, type FinalPlayer, type FinalView, type GameView, type PlayerStatus, type RoomView, type Settings } from '../shared/protocol';
import { Game, MAX_REDRAWS, shuffle } from './game';

const MAX_MEMBERS = 20;
/** Délai laissé à un joueur déconnecté avant que le pilote automatique ne prenne le relais. */
const GRACE_MS = 20_000;
/** Mode accéléré pour les tests locaux (MY_FAST=1). */
const FAST = process.env.MY_FAST === '1';
const T = {
  /** Le meneur choisit la question ; au-delà, la première est prise. */
  theme: FAST ? 3_000 : 45_000,
  /** L'écriture et le débat en mode accéléré (sinon, les réglages de l'hôte). */
  fastWrite: 2_000,
  fastDebate: 1_500,
  /** Une histoire lue à voix haute : au-delà, on passe à la suivante. */
  read: FAST ? 2_500 : 60_000,
  /** Les devinettes : une base, plus un peu par serviette. */
  guessBase: FAST ? 1_500 : 40_000,
  guessPer: FAST ? 100 : 10_000,
};
const STAGE_INDEX = { theme: 0, write: 1, read: 2, vote: 3, guess: 4, reveal: 5 } as const;
const DEFAULT_SETTINGS: Settings = { talk: 'oral', write: 180, debate: 120, rounds: 5, spice: 'douces', tips: true };

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
}

/** À qui renvoyer l'état après un changement : toute la table (null), ou seulement certains (une liste, vide : personne). */
export type Scope = string[] | null;

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function rnd(): number {
  return crypto.randomInt(1_000_000) / 1_000_000;
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { ...DEFAULT_SETTINGS };
  players: Player[] = [];
  game: Game | null = null;
  final: FinalView | null = null;
  wins = new Map<string, number>();
  /** La fin de l'étape en cours (0 : sans limite) et sa durée totale. */
  stageEndsAt = 0;
  stageMs = 0;
  lastActive = Date.now();
  onChange: () => void = () => {};
  /** Envoie sa vue à un seul joueur (un vote changé, un refus : rien ne change chez les autres). */
  onPrivate: (playerId: string) => void = () => {};

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | undefined | null): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => p.connected).length;
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      // « Maximilienne-Zoé » en double devient « Maximilienne 2 », sans trait d'union ni espace pendants.
      const candidate = `${name.slice(0, 13).replace(/[\s\-'’.]+$/u, '')} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    if (this.phase === 'lobby' && this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const p: Player = {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      sockets: new Set(),
      connected: false,
      disconnectedAt: Date.now(),
      left: false,
      status: this.phase === 'lobby' ? 'lobby' : 'spectator',
    };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return 'Seul l’hôte peut retirer un joueur.';
    if (this.phase !== 'lobby') return 'On ne peut retirer un joueur que dans le salon.';
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    // En partie, sa place reste à la table : son histoire reste en jeu, et on ne l'attend plus.
    if (this.phase === 'lobby' || p.status === 'spectator') this.players = this.players.filter((x) => x.id !== id);
    else p.left = true;
    if (this.hostId === id) this.transferHost();
    this.advance();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.left && p.connected) ?? this.players.find((p) => !p.left);
    this.hostId = next?.id ?? '';
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    p.left = false;
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  isAuto(p: Player): boolean {
    return p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  /** Un joueur qu'on n'attend plus : parti, ou déconnecté depuis plus de 20 secondes. */
  private away = (id: string): boolean => {
    const p = this.get(id);
    return !p || this.isAuto(p);
  };

  updateSettings(by: string, payload: Record<string, unknown>): string | { only: string[] } | undefined {
    if (by !== this.hostId) return 'Seul l’hôte peut changer les réglages.';
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    const s = this.settings;
    const before = JSON.stringify(s);
    if (payload.talk === 'oral' || payload.talk === 'ecrit') s.talk = payload.talk;
    if (isWrite(payload.write)) s.write = payload.write;
    if (isDebate(payload.debate)) s.debate = payload.debate;
    if (isRounds(payload.rounds)) s.rounds = payload.rounds;
    if (payload.spice === 'douces' || payload.spice === 'piquantes') s.spice = payload.spice;
    if (typeof payload.tips === 'boolean') s.tips = payload.tips;
    // Rien n'a changé : inutile de réveiller toute la table.
    return JSON.stringify(s) === before ? { only: [by] } : undefined;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  start(by: string): string | undefined {
    if (by !== this.hostId) return 'Seul l’hôte peut lancer la partie.';
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    if (seated.length < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs.`;
    const order = shuffle(
      seated.map((p) => p.id),
      rnd,
    );
    for (const p of seated) p.status = 'playing';
    const spectators = this.players.filter((p) => p.status === 'spectator');
    this.players = [...order.map((id) => this.get(id)!), ...spectators];
    this.game = new Game(order, { talk: this.settings.talk, spice: this.settings.spice, rounds: this.settings.rounds }, rnd, this.away);
    this.phase = 'playing';
    this.final = null;
    this.beginStage(Date.now());
    return undefined;
  }

  restart(by: string): string | { only: string[] } | undefined {
    if (by !== this.hostId) return 'Seul l’hôte peut relancer une partie.';
    if (this.phase === 'lobby') return { only: [by] };
    this.clearTimer();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
    }
    this.phase = 'lobby';
    this.game = null;
    this.final = null;
    this.stageEndsAt = 0;
    return undefined;
  }

  endEarly(by: string): string | { only: string[] } | undefined {
    if (by !== this.hostId) return 'Seul l’hôte peut arrêter la partie.';
    if (this.phase !== 'playing') return { only: [by] };
    return this.restart(by);
  }

  private playing(by: string): Game | string {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return 'Aucune partie n’est en cours.';
    if (!g.has(by)) return 'Tu regardes la partie : tu joueras à la prochaine.';
    return g;
  }

  private stageLength(g: Game): number {
    switch (g.stage) {
      case 'theme':
        return T.theme;
      case 'write':
        return this.settings.write === 0 ? 0 : FAST ? T.fastWrite : this.settings.write * 1000;
      case 'read':
        return T.read;
      case 'vote':
        return this.settings.debate === 0 ? 0 : FAST ? T.fastDebate : this.settings.debate * 1000;
      case 'guess':
        return this.settings.debate === 0 ? 0 : T.guessBase + T.guessPer * g.stories.length;
      default:
        return 0;
    }
  }

  /** Une étape commence : sa minuterie avec. */
  private beginStage(now: number): void {
    const g = this.game;
    if (!g) return;
    this.stageMs = this.stageLength(g);
    this.stageEndsAt = this.stageMs ? now + this.stageMs : 0;
  }

  /**
   * Fait avancer la table tant qu'il n'y a plus personne à attendre : tout le monde a écrit, voté ou validé, ou le
   * lecteur de l'histoire en cours est absent. Chaque étape franchie relance sa minuterie.
   */
  private advance(): void {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return;
    for (let guard = 0; guard < 40; guard++) {
      const stage = g.stage;
      const reading = g.reading;
      if (stage === 'theme' && this.away(g.chooser)) g.choose(null, 0);
      else if (stage === 'write' && g.allWritten) g.closeWrite();
      else if (stage === 'read' && g.reader && this.away(g.reader)) g.read(null, g.reading);
      else if (stage === 'vote' && g.allVoted) g.closeVote();
      else if (stage === 'guess' && g.allLocked) g.closeGuess();
      if (g.stage === stage && g.reading === reading) return;
      this.beginStage(Date.now());
    }
  }

  /** Un geste qui ne change que la vue de son auteur ne réveille personne d'autre. */
  private scoped(g: Game, by: string, before: number, err: string | undefined): string | { only: string[] } | undefined {
    if (err) return err;
    if (g.pub === before) return { only: [by] };
    this.advance();
    return undefined;
  }

  choose(by: string, payload: Record<string, unknown>): string | { only: string[] } | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    const before = g.pub;
    const err = payload.redraw === true ? g.redraw(by) : g.choose(by, payload.index);
    if (!err) this.beginStage(Date.now());
    return this.scoped(g, by, before, err);
  }

  draft(by: string, payload: Record<string, unknown>): string | { only: string[] } {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    // Un brouillon reste entre son auteur et l'appli : personne ne reçoit d'état, pas même lui (il tape encore).
    return g.draft(by, payload.text) ?? { only: [] };
  }

  write(by: string, payload: Record<string, unknown>): string | { only: string[] } | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    const before = g.pub;
    return this.scoped(g, by, before, payload.done === false ? g.unwrite(by) : g.write(by, payload.text));
  }

  read(by: string, payload: Record<string, unknown>): string | { only: string[] } | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    const before = g.pub;
    // Deux appuis presque ensemble (le lecteur et l'hôte) ne sautent pas deux histoires : l'index le dit. Un appui
    // arrivé juste après la fin de la lecture (le temps, ou l'autre appui) n'est pas une erreur non plus.
    if (g.stage !== 'read' || payload.index !== g.reading) return { only: [by] };
    const err = g.read(by, payload.index, by === this.hostId);
    if (!err) this.beginStage(Date.now());
    return this.scoped(g, by, before, err);
  }

  vote(by: string, payload: Record<string, unknown>): string | { only: string[] } | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    const before = g.pub;
    return this.scoped(g, by, before, g.vote(by, payload.letter));
  }

  assign(by: string, payload: Record<string, unknown>): string | { only: string[] } | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    const before = g.pub;
    return this.scoped(g, by, before, g.assign(by, payload.letter, payload.target ?? null));
  }

  lock(by: string, payload: Record<string, unknown>): string | { only: string[] } | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    const before = g.pub;
    return this.scoped(g, by, before, g.lock(by, payload.on));
  }

  say(by: string, payload: Record<string, unknown>): string | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    return g.say(by, payload.text);
  }

  /** L'hôte n'attend plus : l'écriture, le débat ou les devinettes s'arrêtent tout de suite. */
  hurry(by: string, payload: Record<string, unknown>): string | { only: string[] } | undefined {
    if (by !== this.hostId) return 'Seul l’hôte peut presser la table.';
    const g = this.game;
    if (this.phase !== 'playing' || !g) return 'Aucune partie n’est en cours.';
    if (payload.seq !== undefined && payload.seq !== this.seqOf(g)) return { only: [by] };
    if (g.stage === 'write') g.closeWrite();
    else if (g.stage === 'vote') g.closeVote();
    else if (g.stage === 'guess') g.closeGuess();
    else if (g.stage === 'theme') g.choose(null, 0);
    else return { only: [by] };
    this.beginStage(Date.now());
    this.advance();
    return undefined;
  }

  /** La manche suivante (l'hôte ou son prochain meneur), ou le classement après la dernière. */
  next(by: string, payload: Record<string, unknown> = {}): string | { only: string[] } | undefined {
    const g = this.playing(by);
    if (typeof g === 'string') return g;
    if (g.stage !== 'reveal') return { only: [by] };
    // Deux appuis presque ensemble (l'hôte et le prochain meneur) ne sautent pas une manche.
    if (payload.seq !== undefined && payload.seq !== this.seqOf(g)) return { only: [by] };
    if (by !== this.hostId && by !== g.nextChooser) return 'L’hôte ou le meneur de la prochaine manche lance la suite.';
    if (g.over) {
      this.finishGame();
      return undefined;
    }
    g.next();
    this.beginStage(Date.now());
    this.advance();
    return undefined;
  }

  private finishGame(): void {
    const g = this.game;
    if (!g) return;
    const ids = g.players;
    const best = Math.max(...ids.map((id) => g.scores.get(id) ?? 0));
    const winners = ids.filter((id) => (g.scores.get(id) ?? 0) === best);
    for (const id of winners) this.wins.set(id, (this.wins.get(id) ?? 0) + 1);
    const stats = (id: string) => {
      const s = { found: 0, fooled: 0, accused: 0, authors: 0, mythos: 0 };
      for (const r of g.results) {
        if (r.canceled) continue;
        const d = r.detail[id];
        if (!d) continue;
        if (d.found) s.found++;
        s.fooled += d.fooled;
        s.accused += d.accused;
        s.authors += d.authors;
        if (r.mytho === id) s.mythos++;
      }
      return s;
    };
    const sorted = [...ids].sort((a, b) => (g.scores.get(b) ?? 0) - (g.scores.get(a) ?? 0));
    const players: FinalPlayer[] = sorted.map((id) => {
      const p = this.get(id);
      const score = g.scores.get(id) ?? 0;
      return {
        id,
        name: p?.name ?? '?',
        avatar: p?.avatar ?? AVATARS[0],
        score,
        ...stats(id),
        rank: 1 + sorted.filter((x) => (g.scores.get(x) ?? 0) > score).length,
        winner: winners.includes(id),
        wins: this.wins.get(id) ?? 0,
      };
    });
    this.final = { players, rounds: g.results.map((r) => structuredClone(r)), winners };
    this.phase = 'finished';
    this.stageEndsAt = 0;
    this.clearTimer();
  }

  // ───────────────────────────── Minuteries ─────────────────────────────

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À appeler après chaque changement : planifie la prochaine échéance puis diffuse l'état, à tous ou seulement à certains. */
  commit(scope: Scope = null): void {
    this.reschedule();
    if (scope) for (const id of scope) this.onPrivate(id);
    else {
      this.lastAutoKey = this.autoKey();
      this.onChange();
    }
  }

  /** La prochaine échéance : la fin de l'étape, ou le moment où un joueur attendu passe au pilote automatique. */
  private dueAt(): number {
    const g = this.game;
    if (this.phase !== 'playing' || !g || g.stage === 'reveal') return Infinity;
    let due = this.stageEndsAt || Infinity;
    for (const id of g.players) {
      const p = this.get(id);
      if (!p || p.left) continue;
      if (!p.connected && Date.now() - p.disconnectedAt < GRACE_MS) due = Math.min(due, p.disconnectedAt + GRACE_MS);
    }
    return due;
  }

  private reschedule(): void {
    this.clearTimer();
    const due = this.dueAt();
    if (!Number.isFinite(due)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      // Une minuterie peut sonner une milliseconde trop tôt : on se rendort, sinon on diffuserait un état inchangé à toute la table.
      if (Date.now() < due) {
        this.reschedule();
        return;
      }
      let scope: Scope = [];
      try {
        scope = this.tick();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
        scope = null;
      }
      this.commit(scope);
    }, Math.max(0, Math.min(due - Date.now(), 2_147_000_000)));
  }

  /** Fait avancer la table ; renvoie à qui l'état a changé. */
  tick(): Scope {
    const g = this.game;
    if (this.phase !== 'playing' || !g || g.stage === 'reveal') return [];
    const now = Date.now();
    const before = g.pub;
    if (this.stageEndsAt && now >= this.stageEndsAt) {
      if (g.stage === 'theme') g.choose(null, 0);
      else if (g.stage === 'write') g.closeWrite();
      else if (g.stage === 'read') g.read(null, g.reading);
      else if (g.stage === 'vote') g.closeVote();
      else if (g.stage === 'guess') g.closeGuess();
      this.beginStage(now);
    }
    // Un joueur vient de passer au pilote automatique : on ne l'attend plus.
    this.advance();
    // Rien de public n'a bougé : seul un passage au pilote automatique (son voyant) mérite alors une diffusion.
    return g.pub === before && this.autoKey() === this.lastAutoKey ? [] : null;
  }

  /** Les joueurs au pilote automatique, tels que la dernière diffusion à toute la table les a montrés. */
  private lastAutoKey = '';
  private autoKey(): string {
    return this.players
      .filter((p) => p.status === 'playing' && this.isAuto(p))
      .map((p) => p.id)
      .join(',');
  }

  dispose(): void {
    this.clearTimer();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  /** Le numéro d'état, tiré de ce que tout le monde voit : la manche, l'étape et les changements publics. */
  seqOf(g: Game): number {
    return g.pub * 8 + STAGE_INDEX[g.stage];
  }

  private gameView(g: Game, viewerId: string): GameView {
    const seated = g.has(viewerId);
    const live = g.stage !== 'reveal';
    const afterWrite = g.stage === 'read' || g.stage === 'vote' || g.stage === 'guess' || g.stage === 'reveal';
    const afterVote = g.stage === 'guess' || g.stage === 'reveal';
    const inTable = (set: Set<string> | Map<string, unknown>) => g.players.filter((id) => set.has(id));
    return {
      round: g.round,
      rounds: g.rounds,
      order: [...g.players],
      stage: g.stage,
      endsAt: live ? this.stageEndsAt : 0,
      stageMs: this.stageMs,
      chooser: g.chooser,
      choices: g.stage === 'theme' ? g.choices.map((q) => ({ ...q })) : null,
      redrawsLeft: g.stage === 'theme' ? MAX_REDRAWS - g.redraws : 0,
      question: g.question ? { ...g.question } : null,
      mytho: seated && live && g.stage !== 'theme' && g.mytho === viewerId,
      myText: seated ? (g.texts.get(viewerId) ?? '') : '',
      myDone: g.done.has(viewerId),
      writers: g.stage === 'write' ? inTable(g.done) : [],
      stories: afterWrite && live ? g.stories.map((s, i) => ({ letter: s.letter, text: g.stage !== 'read' || i <= g.reading ? s.text : null })) : afterWrite ? g.stories.map((s) => ({ letter: s.letter, text: s.text })) : [],
      myLetter: afterWrite ? g.letterOf(viewerId) : null,
      authors: afterWrite ? g.authors : [],
      readers: g.stage === 'read' ? [...g.readers] : [],
      reading: g.stage === 'read' ? g.reading : -1,
      myVote: g.votes.get(viewerId) ?? null,
      voters: g.stage === 'vote' ? inTable(g.votes) : [],
      fake: afterVote ? g.fake : null,
      votes: afterVote ? Object.fromEntries(g.players.filter((id) => g.votes.has(id)).map((id) => [id, g.votes.get(id)!])) : null,
      myGuess: Object.fromEntries(g.guesses.get(viewerId) ?? []),
      myLocked: g.locked.has(viewerId),
      lockers: g.stage === 'guess' ? inTable(g.locked) : [],
      lines: this.settings.talk === 'ecrit' ? g.lines.map((l) => ({ ...l })) : [],
      scores: Object.fromEntries(g.scores),
      result: g.result ? structuredClone(g.result) : null,
      nextChooser: g.stage === 'reveal' && !g.over ? g.nextChooser : null,
      seq: this.seqOf(g),
    };
  }

  viewFor(viewerId: string): RoomView {
    const g = this.phase === 'playing' ? this.game : null;
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings },
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isHost: p.id === this.hostId,
        connected: p.connected,
        autopilot: p.status === 'playing' && this.isAuto(p),
        status: p.status,
        wins: this.wins.get(p.id) ?? 0,
      })),
      game: g ? this.gameView(g, viewerId) : null,
      final: this.final,
      serverNow: Date.now(),
    };
  }
}
