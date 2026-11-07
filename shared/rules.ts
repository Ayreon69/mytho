// Les règles de Mytho : le barème, le tirage des questions et du Mytho, le compte d'une manche et quelques mots de liaison.
import { QUESTIONS } from './content';
import { CHOICES, type Detail, type Question, type Spice, type StoryResult } from './protocol';

/** Le barème. */
export const POINTS = {
  /** Trouver la fausse histoire. */
  found: 2,
  /** Au Mytho : par voix qui se trompe. */
  fooled: 1,
  /** À l'auteur d'une histoire vraie : par voix qui la croit fausse. */
  accused: 1,
  /** Par auteur bien deviné, le Mytho compris. */
  author: 1,
} as const;

/** Un hasard injectable : rng() donne un nombre de 0 (compris) à 1 (exclu). */
export type Rng = () => number;

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Trois questions pas encore sorties dans cette partie. En mode piquant, au moins une piquante parmi elles.
 * S'il n'en reste plus assez, on reprend celles déjà vues.
 */
export function drawChoices(spice: Spice, used: Set<string>, rng: Rng): Question[] {
  const pool = QUESTIONS.filter((q) => spice === 'piquantes' || !q.spicy);
  let fresh = pool.filter((q) => !used.has(q.id));
  if (fresh.length < CHOICES) fresh = pool;
  let picked = shuffle(fresh, rng).slice(0, CHOICES);
  if (spice === 'piquantes' && !picked.some((q) => q.spicy)) {
    const spicy = shuffle(
      fresh.filter((q) => q.spicy),
      rng,
    )[0];
    if (spicy) picked = [spicy, ...picked.slice(1)];
    picked = shuffle(picked, rng);
  }
  for (const q of picked) used.add(q.id);
  return picked;
}

/**
 * Le Mytho de la manche, tiré au sort parmi les joueurs présents. Plus on l'a déjà été, moins on a de chances de
 * l'être encore, sans jamais tomber à zéro : personne ne peut deviner le Mytho de la dernière manche par élimination.
 */
export function drawMytho(candidates: string[], past: Map<string, number>, rng: Rng): string {
  const weights = candidates.map((id) => 1 / (1 + 2 * (past.get(id) ?? 0)));
  let x = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) {
    x -= weights[i];
    if (x < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/** Les points d'une manche, et le détail de chacun. */
export function scoreRound(
  players: string[],
  mytho: string,
  stories: StoryResult[],
  fake: string,
  votes: Record<string, string>,
  guesses: Record<string, Record<string, string>>,
): { delta: Record<string, number>; detail: Record<string, Detail> } {
  const delta: Record<string, number> = {};
  const detail: Record<string, Detail> = {};
  for (const id of players) {
    delta[id] = 0;
    detail[id] = { found: null, fooled: 0, accused: 0, authors: 0 };
  }
  const authorOf = new Map(stories.map((s) => [s.letter, s.author]));
  for (const [voter, letter] of Object.entries(votes)) {
    if (!(voter in delta)) continue;
    const target = authorOf.get(letter);
    if (!target) continue;
    if (voter !== mytho) {
      detail[voter].found = letter === fake;
      if (letter === fake) delta[voter] += POINTS.found;
      else if (mytho in delta) {
        delta[mytho] += POINTS.fooled;
        detail[mytho].fooled++;
      }
    }
    if (letter !== fake && target in delta) {
      delta[target] += POINTS.accused;
      detail[target].accused++;
    }
  }
  for (const [guesser, map] of Object.entries(guesses)) {
    if (!(guesser in delta)) continue;
    for (const [letter, who] of Object.entries(map)) {
      if (authorOf.get(letter) === who && who !== guesser) {
        delta[guesser] += POINTS.author;
        detail[guesser].authors++;
      }
    }
  }
  return { delta, detail };
}

export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${Math.abs(n) > 1 ? many : word}`;
}

/** « A », « A et B », « A, B et C ». */
export function listing(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

/** « de Léo », « d’Opéra » : élision devant une voyelle ou un h. */
export function de(name: string): string {
  return /^[aeiouyhàâäéèêëîïôöùûü]/i.test(name) ? `d’${name}` : `de ${name}`;
}

/** Des points signés : « +4 », « −1 », « 0 ». */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
}
