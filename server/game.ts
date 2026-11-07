// Moteur d'une partie de Mytho, sans réseau ni minuterie : le choix de la question, l'écriture (le Mytho invente),
// la lecture des serviettes, le vote pour la fausse, les devinettes d'auteurs et le compte de chaque manche.
// La salle (room.ts) décide du rythme et de qui est absent.
import { LETTERS, MAX_LINE, MIN_STORIES, MIN_STORY, cleanStory, cleanText, type ChatLine, type Question, type RoundResult, type Spice, type Stage, type Talk } from '../shared/protocol';
import { drawChoices, drawMytho, scoreRound, shuffle, type Rng } from '../shared/rules';

export { shuffle, type Rng } from '../shared/rules';

/** Un brouillon jamais rendu compte quand même à la fin du temps, s'il a un peu de matière. */
const MIN_DRAFT = 10;
/** Autres questions : trois fois par manche au plus. */
export const MAX_REDRAWS = 3;

interface Story {
  letter: string;
  text: string;
  author: string;
}

export interface GameOptions {
  talk: Talk;
  spice: Spice;
  rounds: number;
}

export class Game {
  /** Les joueurs, dans l'ordre de la table. */
  readonly players: string[];
  readonly opts: GameOptions;
  private readonly rng: Rng;
  /** Un joueur absent depuis trop longtemps : on ne l'attend plus, et il n'est ni Mytho ni meneur. */
  private readonly away: (id: string) => boolean;
  round = 0;
  stage: Stage = 'theme';
  chooser = '';
  choices: Question[] = [];
  redraws = 0;
  question: Question | null = null;
  mytho = '';
  /** Les textes en cours (brouillons ou rendus), et ceux qui ont rendu le leur. */
  texts = new Map<string, string>();
  done = new Set<string>();
  stories: Story[] = [];
  readers: string[] = [];
  reading = -1;
  votes = new Map<string, string>();
  fake: string | null = null;
  guesses = new Map<string, Map<string, string>>();
  locked = new Set<string>();
  lines: ChatLine[] = [];
  scores = new Map<string, number>();
  results: RoundResult[] = [];
  mythoCount = new Map<string, number>();
  private usedQuestions = new Set<string>();
  /** Compteur des changements publics : le numéro d'état n'avance que sur ce que tout le monde voit. */
  pub = 1;

  constructor(players: string[], opts: GameOptions, rng: Rng, away: (id: string) => boolean = () => false) {
    this.players = [...players];
    this.opts = { ...opts };
    this.rng = rng;
    this.away = away;
    for (const id of players) this.scores.set(id, 0);
    this.beginRound();
  }

  get rounds(): number {
    return this.opts.rounds;
  }

  has(id: string): boolean {
    return this.players.includes(id);
  }

  /** Les joueurs qu'on attend encore : assis et présents. */
  get present(): string[] {
    return this.players.filter((id) => !this.away(id));
  }

  /** La dernière manche est dévoilée : il ne reste que le classement. */
  get over(): boolean {
    return this.stage === 'reveal' && this.round >= this.rounds;
  }

  get result(): RoundResult | null {
    return this.stage === 'reveal' ? (this.results[this.results.length - 1] ?? null) : null;
  }

  letterOf(id: string): string | null {
    return this.stories.find((s) => s.author === id)?.letter ?? null;
  }

  /** Les joueurs qui ont une histoire en jeu, dans l'ordre de la table (jamais dans l'ordre des serviettes). */
  get authors(): string[] {
    const set = new Set(this.stories.map((s) => s.author));
    return this.players.filter((id) => set.has(id));
  }

  // ───────────────────────────── La question ─────────────────────────────

  /** Une nouvelle manche : le meneur suivant (le premier présent à partir de son tour) et trois questions. */
  beginRound(): void {
    this.round++;
    this.stage = 'theme';
    const n = this.players.length;
    const start = (this.round - 1) % n;
    const order = Array.from({ length: n }, (_, i) => this.players[(start + i) % n]);
    this.chooser = order.find((id) => !this.away(id)) ?? order[0];
    this.choices = drawChoices(this.opts.spice, this.usedQuestions, this.rng);
    this.redraws = 0;
    this.question = null;
    this.mytho = '';
    this.texts = new Map();
    this.done = new Set();
    this.stories = [];
    this.readers = [];
    this.reading = -1;
    this.votes = new Map();
    this.fake = null;
    this.guesses = new Map();
    this.locked = new Set();
    this.lines = [];
    this.pub++;
  }

  /** Trois autres questions (le meneur seulement). */
  redraw(by: string): string | undefined {
    if (this.stage !== 'theme') return 'La question est déjà choisie.';
    if (by !== this.chooser) return 'C’est au meneur de la manche de choisir.';
    if (this.redraws >= MAX_REDRAWS) return 'Plus d’autres questions pour cette manche : choisis parmi celles-ci.';
    this.redraws++;
    this.choices = drawChoices(this.opts.spice, this.usedQuestions, this.rng);
    this.pub++;
    return undefined;
  }

  /** La question est choisie (null : à la place d'un meneur absent ou trop lent, la première). */
  choose(by: string | null, index: unknown): string | undefined {
    if (this.stage !== 'theme') return 'La question est déjà choisie.';
    if (by !== null && by !== this.chooser) return 'C’est au meneur de la manche de choisir.';
    const i = by === null ? 0 : (index as number);
    if (!Number.isInteger(i) || i < 0 || i >= this.choices.length) return 'Cette question n’existe pas.';
    this.question = this.choices[i];
    this.choices = [];
    this.stage = 'write';
    const candidates = this.present.length ? this.present : this.players;
    this.mytho = drawMytho(candidates, this.mythoCount, this.rng);
    this.pub++;
    return undefined;
  }

  // ───────────────────────────── L'écriture ─────────────────────────────

  /** Un brouillon, gardé au chaud au cas où le temps finirait avant « C'est écrit ». Personne d'autre n'en sait rien. */
  draft(by: string, text: unknown): string | undefined {
    if (this.stage !== 'write') return 'Ce n’est plus le moment d’écrire.';
    if (!this.has(by)) return 'Tu regardes la partie : tu joueras à la prochaine.';
    if (this.done.has(by)) return undefined;
    this.texts.set(by, cleanStory(text));
    return undefined;
  }

  write(by: string, text: unknown): string | undefined {
    if (this.stage !== 'write') return 'Ce n’est plus le moment d’écrire.';
    if (!this.has(by)) return 'Tu regardes la partie : tu joueras à la prochaine.';
    const t = cleanStory(text);
    if (t.length < MIN_STORY) return `Raconte un peu plus : ${MIN_STORY} signes au moins.`;
    this.texts.set(by, t);
    if (!this.done.has(by)) {
      this.done.add(by);
      this.pub++;
    }
    return undefined;
  }

  /** « Modifier » : l'histoire repart en brouillon. */
  unwrite(by: string): string | undefined {
    if (this.stage !== 'write') return 'Ce n’est plus le moment d’écrire.';
    if (!this.done.has(by)) return undefined;
    this.done.delete(by);
    this.pub++;
    return undefined;
  }

  get allWritten(): boolean {
    return this.present.every((id) => this.done.has(id));
  }

  /** Fin de l'écriture : les serviettes sont mélangées et reçoivent une lettre. */
  closeWrite(): void {
    if (this.stage !== 'write') return;
    const stories: Omit<Story, 'letter'>[] = [];
    for (const id of this.players) {
      const t = this.texts.get(id) ?? '';
      if (this.done.has(id) ? t.length >= MIN_STORY : t.length >= MIN_DRAFT) stories.push({ author: id, text: t });
    }
    if (!stories.some((s) => s.author === this.mytho)) return this.cancel('mytho');
    if (stories.length < MIN_STORIES) return this.cancel('few');
    this.stories = shuffle(stories, this.rng).map((s, i) => ({ ...s, letter: LETTERS[i] }));
    const readers = shuffle(this.players, this.rng);
    this.readers = this.stories.map((_, i) => readers[i % readers.length]);
    if (this.opts.talk === 'oral') {
      this.stage = 'read';
      this.reading = 0;
    } else this.stage = 'vote';
    this.pub++;
  }

  // ───────────────────────────── La lecture ─────────────────────────────

  /** « C'est lu » : le lecteur (ou l'hôte, ou le temps) passe à l'histoire suivante. */
  read(by: string | null, index: unknown, force = false): string | undefined {
    if (this.stage !== 'read') return 'Ce n’est pas le moment de lire.';
    if (index !== this.reading) return 'Cette histoire est déjà lue.';
    if (by !== null && !force && by !== this.readers[this.reading]) return 'C’est à quelqu’un d’autre de lire celle-ci.';
    this.reading++;
    if (this.reading >= this.stories.length) {
      this.reading = -1;
      this.stage = 'vote';
    }
    this.pub++;
    return undefined;
  }

  get reader(): string | null {
    return this.stage === 'read' ? (this.readers[this.reading] ?? null) : null;
  }

  // ───────────────────────────── Le vote ─────────────────────────────

  vote(by: string, letter: unknown): string | undefined {
    if (this.stage !== 'vote') return 'Ce n’est pas le moment de voter.';
    if (!this.has(by)) return 'Tu regardes la partie : tu joueras à la prochaine.';
    const story = this.stories.find((s) => s.letter === letter);
    if (!story) return 'Cette histoire n’existe pas.';
    if (story.author === by) return 'C’est ton histoire : désigne celle d’un autre.';
    const first = !this.votes.has(by);
    this.votes.set(by, story.letter);
    if (first) this.pub++;
    return undefined;
  }

  get allVoted(): boolean {
    return this.present.every((id) => this.votes.has(id));
  }

  /** Fin du débat : la fausse histoire est dévoilée, avec les votes de chacun. */
  closeVote(): void {
    if (this.stage !== 'vote') return;
    this.fake = this.letterOf(this.mytho);
    this.stage = 'guess';
    this.pub++;
  }

  // ───────────────────────────── Les auteurs ─────────────────────────────

  /** Un nom posé sur une serviette (ou retiré, avec null). Un nom déjà posé ailleurs y est repris. */
  assign(by: string, letter: unknown, target: unknown): string | undefined {
    if (this.stage !== 'guess') return 'Ce n’est pas le moment de deviner.';
    if (!this.has(by)) return 'Tu regardes la partie : tu joueras à la prochaine.';
    if (this.locked.has(by)) return 'Tu as validé : touche « Modifier » pour changer.';
    const story = this.stories.find((s) => s.letter === letter);
    if (!story) return 'Cette histoire n’existe pas.';
    if (story.author === by) return 'Celle-ci, tu sais qui l’a écrite.';
    const map = this.guesses.get(by) ?? new Map<string, string>();
    if (target === null) {
      map.delete(story.letter);
    } else {
      if (typeof target !== 'string' || target === by || !this.authors.includes(target)) return 'Ce nom ne va pas ici.';
      for (const [l, who] of map) if (who === target) map.delete(l);
      map.set(story.letter, target);
    }
    this.guesses.set(by, map);
    return undefined;
  }

  lock(by: string, on: unknown): string | undefined {
    if (this.stage !== 'guess') return 'Ce n’est pas le moment de deviner.';
    if (!this.has(by)) return 'Tu regardes la partie : tu joueras à la prochaine.';
    const want = on !== false;
    if (want === this.locked.has(by)) return undefined;
    if (want) this.locked.add(by);
    else this.locked.delete(by);
    this.pub++;
    return undefined;
  }

  get allLocked(): boolean {
    return this.present.every((id) => this.locked.has(id));
  }

  /** Fin des devinettes : les auteurs se dévoilent, les points tombent. */
  closeGuess(): void {
    if (this.stage !== 'guess') return;
    const stories = this.stories.map((s) => ({ ...s }));
    const votes = Object.fromEntries(this.votes);
    const guesses = Object.fromEntries([...this.guesses].map(([id, m]) => [id, Object.fromEntries(m)]));
    const { delta, detail } = scoreRound(this.players, this.mytho, stories, this.fake!, votes, guesses);
    for (const [id, n] of Object.entries(delta)) this.scores.set(id, (this.scores.get(id) ?? 0) + n);
    this.mythoCount.set(this.mytho, (this.mythoCount.get(this.mytho) ?? 0) + 1);
    this.results.push({ round: this.round, question: { ...this.question! }, mytho: this.mytho, stories, fake: this.fake, votes, guesses, canceled: null, delta, detail });
    this.stage = 'reveal';
    this.pub++;
  }

  /** La manche ne compte pas : le Mytho n'a rien écrit à temps, ou trop peu d'histoires. */
  private cancel(kind: 'mytho' | 'few'): void {
    this.results.push({
      round: this.round,
      question: { ...this.question! },
      mytho: this.mytho,
      stories: [],
      fake: null,
      votes: {},
      guesses: {},
      canceled: kind,
      delta: {},
      detail: {},
    });
    this.stage = 'reveal';
    this.pub++;
  }

  // ───────────────────────────── Le fil écrit ─────────────────────────────

  say(by: string, text: unknown): string | undefined {
    if (this.opts.talk !== 'ecrit') return 'Le débat se fait à voix haute.';
    if (this.stage !== 'vote' && this.stage !== 'guess' && this.stage !== 'reveal') return 'Le fil s’ouvre avec le débat.';
    if (!this.has(by)) return 'Tu regardes la partie : tu joueras à la prochaine.';
    const t = cleanText(text, MAX_LINE);
    if (!t) return 'Message vide.';
    if (this.lines.length >= 120) return 'Le fil est plein pour cette manche.';
    this.lines.push({ n: this.lines.length + 1, by, text: t });
    this.pub++;
    return undefined;
  }

  // ───────────────────────────── La suite ─────────────────────────────

  /** Le meneur de la manche suivante (s'il y en a une), pour le bouton « Manche suivante ». */
  get nextChooser(): string | null {
    if (this.round >= this.rounds) return null;
    const n = this.players.length;
    const start = this.round % n;
    const order = Array.from({ length: n }, (_, i) => this.players[(start + i) % n]);
    return order.find((id) => !this.away(id)) ?? order[0];
  }

  next(): boolean {
    if (this.stage !== 'reveal' || this.round >= this.rounds) return false;
    this.beginRound();
    return true;
  }
}
