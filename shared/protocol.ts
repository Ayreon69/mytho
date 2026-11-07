// Contrat partagé entre le serveur et le client : réglages, étapes d'une manche, vues de table et constantes.
// Le barème et les tirages sont dans rules.ts, les questions dans content.ts.

/** De 4 à 10 joueurs : chacun raconte une histoire vraie, sauf le Mytho, qui invente la sienne. */
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 10;
/** Une histoire : assez pour un vrai détail, assez court pour être lu à voix haute en quinze secondes. */
export const MIN_STORY = 20;
export const MAX_STORY = 220;
/** Une phrase du fil écrit, pendant le débat. */
export const MAX_LINE = 140;
/** Les questions proposées à celui ou celle qui choisit. */
export const CHOICES = 3;
/** En dessous de trois histoires, la manche n'a plus de sens. */
export const MIN_STORIES = 3;

/** Le temps pour écrire, en secondes ; 0 : sans limite (l'hôte peut ne plus attendre). */
export type WriteSetting = 120 | 180 | 300 | 0;
export const WRITE_TIMERS: readonly WriteSetting[] = [120, 180, 300, 0];
/** Le débat, vote compris ; 0 : sans limite (il s'arrête quand tout le monde a voté). */
export type DebateSetting = 60 | 120 | 180 | 0;
export const DEBATE_TIMERS: readonly DebateSetting[] = [60, 120, 180, 0];
/** Les histoires lues à voix haute, chacune par un joueur (par défaut), ou lues sur l'écran avec un fil écrit. */
export type Talk = 'oral' | 'ecrit';
/** Douces : des souvenirs pour tout le monde. Piquantes : on y ajoute des soirées, des rencards et des bêtises d'ado. */
export type Spice = 'douces' | 'piquantes';
export type RoundsSetting = 3 | 5 | 7;
export const ROUNDS: readonly RoundsSetting[] = [3, 5, 7];

export interface Settings {
  talk: Talk;
  write: WriteSetting;
  debate: DebateSetting;
  rounds: RoundsSetting;
  spice: Spice;
  /** Des conseils pour débutants à chaque étape. */
  tips: boolean;
}

export const AVATARS = ['menteur', 'masque', 'cafe', 'cocktail', 'renard', 'hibou', 'crocodile', 'licorne', 'fantome', 'cowboy', 'pieuvre', 'micro'] as const;
export const EMOTES = ['🤥', '😂', '😱', '🤔', '👏', '🙈'] as const;

export type PlayerStatus = 'lobby' | 'playing' | 'spectator';

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  connected: boolean;
  autopilot: boolean;
  status: PlayerStatus;
  /** Parties gagnées à cette table. */
  wins: number;
}

export interface Question {
  id: string;
  text: string;
  /** Des pistes pour retrouver un souvenir. */
  hint: string;
  spicy?: boolean;
}

/** Une serviette posée sur le comptoir : sa lettre, et son texte une fois lu (null : pas encore lue). */
export interface StoryView {
  letter: string;
  text: string | null;
}

/** Une phrase du fil écrit. */
export interface ChatLine {
  n: number;
  by: string;
  text: string;
}

/**
 * theme : celui ou celle qui mène la manche choisit la question parmi trois.
 * write : chacun écrit ; le Mytho invente.
 * read : à voix haute, chaque histoire est lue par un joueur (mode oral seulement).
 * vote : le débat, et chacun désigne la fausse histoire.
 * guess : la fausse est dévoilée ; chacun devine qui a écrit quoi.
 * reveal : les auteurs se dévoilent, puis le Mytho ; les points tombent.
 */
export type Stage = 'theme' | 'write' | 'read' | 'vote' | 'guess' | 'reveal';

export interface StoryResult {
  letter: string;
  text: string;
  author: string;
}

/** Ce qui a rapporté des points à un joueur pendant la manche. */
export interface Detail {
  /** Il a désigné la fausse histoire (null : pas de vote). */
  found: boolean | null;
  /** Le Mytho : les voix qu'il a trompées. */
  fooled: number;
  /** Une histoire vraie : les voix qui l'ont crue fausse. */
  accused: number;
  /** Les auteurs bien devinés. */
  authors: number;
}

export interface RoundResult {
  round: number;
  question: Question;
  mytho: string;
  stories: StoryResult[];
  /** La lettre de la fausse histoire. */
  fake: string | null;
  /** Le vote de chacun : la lettre désignée. */
  votes: Record<string, string>;
  /** Les devinettes de chacun : lettre → auteur supposé. */
  guesses: Record<string, Record<string, string>>;
  /** Manche annulée : le Mytho n'a rien écrit, ou trop peu d'histoires. */
  canceled: 'mytho' | 'few' | null;
  delta: Record<string, number>;
  detail: Record<string, Detail>;
}

export interface GameView {
  /** La manche en cours (1 pour la première) et le nombre total. */
  round: number;
  rounds: number;
  /** Les joueurs, dans l'ordre de la table. */
  order: string[];
  stage: Stage;
  /** Fin de l'étape en cours (heure du serveur) ; 0 : pas de limite. */
  endsAt: number;
  stageMs: number;
  /** Celui ou celle qui choisit la question de la manche. */
  chooser: string;
  /** Les questions proposées, pendant le choix, et combien de fois on peut encore en demander d'autres. */
  choices: Question[] | null;
  redrawsLeft: number;
  question: Question | null;
  /** Je suis le Mytho de cette manche : à moi seul, jusqu'au dévoilement. */
  mytho: boolean;
  /** Mon histoire (brouillon ou envoyée), et si je l'ai rendue. */
  myText: string;
  myDone: boolean;
  /** Ceux qui ont fini d'écrire. */
  writers: string[];
  /** Les serviettes, à partir de la lecture. */
  stories: StoryView[];
  /** La lettre de ma propre histoire. */
  myLetter: string | null;
  /** Les joueurs qui ont une histoire en jeu (ceux qui ont écrit à temps). */
  authors: string[];
  /** Le lecteur de chaque histoire (à voix haute) et l'histoire lue en ce moment (−1 : aucune). */
  readers: string[];
  reading: number;
  /** Mon vote, et ceux qui ont voté. */
  myVote: string | null;
  voters: string[];
  /** Après le vote : la fausse histoire et les votes de chacun. */
  fake: string | null;
  votes: Record<string, string> | null;
  /** Mes devinettes (lettre → joueur), si je les ai validées, et ceux qui ont validé. */
  myGuess: Record<string, string>;
  myLocked: boolean;
  lockers: string[];
  /** Le fil écrit. */
  lines: ChatLine[];
  /** Les points de chacun, comme sur l'ardoise du bar. */
  scores: Record<string, number>;
  result: RoundResult | null;
  /** Au dévoilement : qui choisira la question de la manche suivante (null après la dernière). */
  nextChooser: string | null;
  /** Numéro de l'état, tiré de ce qui est public : un geste envoyé pour un état passé est ignoré. */
  seq: number;
}

export interface FinalPlayer {
  id: string;
  name: string;
  avatar: string;
  score: number;
  /** Fausses histoires trouvées, voix trompées comme Mytho, voix récoltées par une histoire vraie, auteurs devinés. */
  found: number;
  fooled: number;
  accused: number;
  authors: number;
  /** Manches jouées comme Mytho. */
  mythos: number;
  rank: number;
  winner: boolean;
  wins: number;
}

export interface FinalView {
  players: FinalPlayer[];
  rounds: RoundResult[];
  winners: string[];
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  players: PlayerView[];
  game: GameView | null;
  final: FinalView | null;
  serverNow: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;

export function isWrite(x: unknown): x is WriteSetting {
  return typeof x === 'number' && (WRITE_TIMERS as readonly number[]).includes(x);
}
export function isDebate(x: unknown): x is DebateSetting {
  return typeof x === 'number' && (DEBATE_TIMERS as readonly number[]).includes(x);
}
export function isRounds(x: unknown): x is RoundsSetting {
  return typeof x === 'number' && (ROUNDS as readonly number[]).includes(x);
}

/** Un texte reçu du réseau, nettoyé : sans caractères de contrôle ni chevrons, espaces resserrés. */
export function cleanText(x: unknown, max: number): string {
  if (typeof x !== 'string') return '';
  // Les espaces insécables restent (et s'ajoutent avant : ; ! ? » et après «) : la ponctuation ne part jamais seule à la ligne.
  return x
    .replace(/[\u0000-\u001f<>]/g, ' ')
    .replace(/[^\S  ]+/g, ' ')
    .replace(/[  ]+/g, ' ')
    .replace(/[  ]+([:;!?»])/g, ' $1')
    .replace(/«[  ]*/g, '« ')
    .trim()
    .slice(0, max);
}

/** Une histoire telle qu'elle sera posée sur la serviette : nettoyée, avec une majuscule au début. */
export function cleanStory(x: unknown): string {
  const t = cleanText(x, MAX_STORY);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const LETTERS = 'ABCDEFGHIJ';
