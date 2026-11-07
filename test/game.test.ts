// Le moteur de Mytho : questions, tirages, barème, et des manches complètes, à voix haute ou par écrit.
import { describe, expect, it } from 'vitest';
import { QUESTIONS } from '../shared/content';
import { CHOICES, MAX_STORY, MIN_STORY, type Question } from '../shared/protocol';
import { POINTS, drawChoices, drawMytho, scoreRound } from '../shared/rules';
import { Game } from '../server/game';
import { seeded } from './rng';

const PLAYERS = ['a', 'b', 'c', 'd', 'e'];
const story = (id: string) => `Une histoire bien vraie racontée par ${id}, avec des détails.`;

function game(opts: Partial<{ talk: 'oral' | 'ecrit'; seed: number; away: Set<string> }> = {}): Game {
  const away = opts.away ?? new Set<string>();
  return new Game(PLAYERS, { talk: opts.talk ?? 'oral', spice: 'douces', rounds: 3 }, seeded(opts.seed ?? 1), (id) => away.has(id));
}

/** Fait écrire tout le monde : la manche passe à la lecture (ou au vote). */
function writeAll(g: Game, who = PLAYERS): void {
  for (const id of who) expect(g.write(id, story(id))).toBeUndefined();
  if (g.allWritten) g.closeWrite();
}

describe('les questions', () => {
  it('sont nombreuses, uniques et courtes', () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(200);
    expect(QUESTIONS.filter((q) => q.spicy).length).toBeGreaterThanOrEqual(50);
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
    expect(new Set(QUESTIONS.map((q) => q.text.toLowerCase())).size).toBe(QUESTIONS.length);
    for (const q of QUESTIONS) {
      expect(q.text.length, q.text).toBeLessThanOrEqual(64);
      expect(q.hint.length, q.hint).toBeGreaterThan(8);
      expect(q.hint.length, q.hint).toBeLessThanOrEqual(80);
      // Pas d'espace ordinaire avant une ponctuation haute.
      expect(/ [:;!?»]/.test(q.text + q.hint), q.text).toBe(false);
    }
  });

  it('trois au choix, jamais deux fois dans une partie, et au moins une piquante si on les veut', () => {
    const used = new Set<string>();
    const rng = seeded(7);
    const seen: Question[] = [];
    for (let i = 0; i < 20; i++) {
      const c = drawChoices('douces', used, rng);
      expect(c).toHaveLength(CHOICES);
      expect(c.some((q) => q.spicy)).toBe(false);
      seen.push(...c);
    }
    expect(new Set(seen.map((q) => q.id)).size).toBe(seen.length);
    const used2 = new Set<string>();
    for (let i = 0; i < 30; i++) expect(drawChoices('piquantes', used2, rng).some((q) => q.spicy)).toBe(true);
  });
});

describe('le Mytho', () => {
  it('est tiré au sort, et moins souvent quand on l’a déjà été, sans jamais tomber à zéro', () => {
    const rng = seeded(3);
    const past = new Map([['a', 2]]);
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 6000; i++) counts[drawMytho(['a', 'b', 'c'], past, rng)]++;
    expect(counts.a).toBeGreaterThan(300);
    expect(counts.a).toBeLessThan(counts.b / 2);
    expect(Math.abs(counts.b - counts.c)).toBeLessThan(400);
  });
});

describe('le barème', () => {
  it('compte la fausse trouvée, les voix trompées, les histoires vraies accusées et les auteurs devinés', () => {
    const stories = [
      { letter: 'A', text: 'x', author: 'a' },
      { letter: 'B', text: 'x', author: 'b' },
      { letter: 'C', text: 'x', author: 'c' },
      { letter: 'D', text: 'x', author: 'd' },
    ];
    // d est le Mytho (D). a et b trouvent ; c accuse A ; d (le Mytho) accuse B.
    const votes = { a: 'D', b: 'D', c: 'A', d: 'B' };
    const guesses = { a: { B: 'b', C: 'd', D: 'c' }, c: { A: 'a', B: 'b', D: 'd' }, d: { A: 'b', B: 'a', C: 'c' } };
    const { delta, detail } = scoreRound(['a', 'b', 'c', 'd'], 'd', stories, 'D', votes, guesses);
    expect(delta.a).toBe(POINTS.found + POINTS.accused + POINTS.author);
    expect(delta.b).toBe(POINTS.found + POINTS.accused);
    expect(delta.c).toBe(3 * POINTS.author);
    expect(delta.d).toBe(POINTS.fooled + POINTS.author);
    expect(detail.d.fooled).toBe(1);
    expect(detail.a.found).toBe(true);
    expect(detail.c.found).toBe(false);
    expect(detail.d.found).toBe(null);
  });
});

describe('une manche', () => {
  it('se joue de la question au dévoilement, à voix haute', () => {
    const g = game();
    expect(g.stage).toBe('theme');
    expect(g.chooser).toBe('a');
    expect(g.choices).toHaveLength(3);
    expect(g.choose('b', 0)).toBeTruthy();
    expect(g.redraw('a')).toBeUndefined();
    expect(g.choose('a', 1)).toBeUndefined();
    expect(g.stage).toBe('write');
    expect(PLAYERS).toContain(g.mytho);
    expect(g.write('a', 'trop court')).toMatch(/signes/);
    expect(g.write('a', 'x'.repeat(MAX_STORY + 50))).toBeUndefined();
    expect(g.texts.get('a')).toHaveLength(MAX_STORY);
    writeAll(g);
    expect(g.stage).toBe('read');
    expect(g.stories.map((s) => s.letter)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(new Set(g.stories.map((s) => s.author)).size).toBe(5);
    expect(g.authors).toEqual(PLAYERS);
    // Le lecteur (ou l'hôte) passe à la suivante ; un vieil index est refusé.
    const wrong = PLAYERS.find((id) => id !== g.reader)!;
    expect(g.read(wrong, 0)).toBeTruthy();
    expect(g.read(g.reader, 0)).toBeUndefined();
    expect(g.read(g.reader, 0)).toBeTruthy();
    for (let i = 1; i < 5; i++) expect(g.read(null, i)).toBeUndefined();
    expect(g.stage).toBe('vote');
    const fake = g.letterOf(g.mytho)!;
    for (const id of PLAYERS) {
      const own = g.letterOf(id)!;
      expect(g.vote(id, own)).toMatch(/ton histoire/);
      expect(g.vote(id, id === g.mytho ? (own === 'A' ? 'B' : 'A') : fake)).toBeUndefined();
    }
    expect(g.allVoted).toBe(true);
    g.closeVote();
    expect(g.stage).toBe('guess');
    expect(g.fake).toBe(fake);
    // Chacun devine juste ; un nom posé deux fois quitte sa première serviette.
    for (const id of PLAYERS) {
      for (const s of g.stories) if (s.author !== id) expect(g.assign(id, s.letter, s.author)).toBeUndefined();
      expect(g.assign(id, g.letterOf(id), 'a')).toMatch(/tu sais/);
    }
    const other = g.stories.find((s) => s.author !== 'a' && s.author !== 'b')!;
    const bLetter = g.letterOf('b')!;
    expect(g.assign('a', other.letter, 'b')).toBeUndefined();
    expect(g.guesses.get('a')!.get(bLetter)).toBeUndefined();
    expect(g.assign('a', bLetter, 'b')).toBeUndefined();
    expect(g.assign('a', other.letter, other.author)).toBeUndefined();
    for (const id of PLAYERS) expect(g.lock(id, true)).toBeUndefined();
    expect(g.assign('a', other.letter, null)).toMatch(/validé/);
    expect(g.allLocked).toBe(true);
    g.closeGuess();
    expect(g.stage).toBe('reveal');
    const r = g.result!;
    expect(r.canceled).toBe(null);
    for (const id of PLAYERS) {
      if (id === g.mytho) expect(r.delta[id]).toBe(4 * POINTS.author);
      else expect(r.delta[id]).toBe(POINTS.found + 4 * POINTS.author + (r.votes[g.mytho] === g.letterOf(id) ? POINTS.accused : 0));
    }
    expect(g.mythoCount.get(g.mytho)).toBe(1);
    expect(g.next()).toBe(true);
    expect(g.round).toBe(2);
    expect(g.chooser).toBe('b');
  });

  it('par écrit, saute la lecture et ouvre le fil', () => {
    const g = game({ talk: 'ecrit' });
    g.choose('a', 0);
    expect(g.say('a', 'trop tôt')).toBeTruthy();
    writeAll(g);
    expect(g.stage).toBe('vote');
    expect(g.say('b', '  Celle de la C est louche  ')).toBeUndefined();
    expect(g.lines).toEqual([{ n: 1, by: 'b', text: 'Celle de la C est louche' }]);
  });

  it('garde un brouillon à la fin du temps, et l’oublie s’il est trop maigre', () => {
    const g = game();
    g.choose('a', 0);
    writeAll(
      g,
      PLAYERS.filter((id) => id !== 'b' && id !== 'c'),
    );
    expect(g.stage).toBe('write');
    g.draft('b', 'Un brouillon jamais rendu');
    g.draft('c', 'trop peu');
    g.closeWrite();
    if (g.mytho === 'c') expect(g.result?.canceled).toBe('mytho');
    else {
      expect(g.authors).toEqual(['a', 'b', 'd', 'e']);
      expect(g.stories.find((s) => s.author === 'b')!.text).toBe('Un brouillon jamais rendu');
    }
  });

  it('est annulée si le Mytho n’a rien écrit, ou s’il reste moins de trois histoires', () => {
    for (let seed = 1; seed < 6; seed++) {
      const g = game({ seed });
      g.choose('a', 0);
      writeAll(
        g,
        PLAYERS.filter((id) => id !== g.mytho),
      );
      g.closeWrite();
      expect(g.result?.canceled).toBe('mytho');
      expect(g.result?.delta).toEqual({});
    }
    const g = game();
    g.choose('a', 0);
    const two = [g.mytho, ...PLAYERS.filter((id) => id !== g.mytho).slice(0, 1)];
    writeAll(g, two);
    g.closeWrite();
    expect(g.result?.canceled).toBe('few');
  });

  it('n’attend pas les absents : ni meneur, ni Mytho, ni votes', () => {
    const away = new Set(['a', 'c']);
    for (let seed = 1; seed < 12; seed++) {
      const g = game({ seed, away });
      expect(g.chooser).toBe('b');
      g.choose('b', 0);
      expect(['b', 'd', 'e']).toContain(g.mytho);
      writeAll(g, ['b', 'd', 'e']);
      expect(g.stage).toBe('read');
      expect(g.authors).toEqual(['b', 'd', 'e']);
    }
  });

  it('n’accepte que des noms d’auteurs et des lettres existantes', () => {
    const g = game({ talk: 'ecrit' });
    g.choose('a', 0);
    // Quelqu'un d'autre que le Mytho n'écrit rien.
    const silent = PLAYERS.find((id) => id !== g.mytho)!;
    writeAll(
      g,
      PLAYERS.filter((id) => id !== silent),
    );
    g.closeWrite();
    expect(g.stage).toBe('vote');
    for (const id of PLAYERS) expect(g.vote(id, g.stories.find((s) => s.author !== id)!.letter)).toBeUndefined();
    g.closeVote();
    const s = g.stories.find((x) => x.author !== silent)!;
    const writer = s.author;
    expect(g.assign(writer, g.letterOf(writer)!, silent)).toMatch(/tu sais/);
    expect(g.assign(writer, 'Z', silent)).toMatch(/existe/);
    // Qui n'a rien écrit ne va sur aucune serviette, mais devine quand même.
    const another = g.stories.find((x) => x.author !== writer)!;
    expect(g.assign(writer, another.letter, silent)).toMatch(/nom/);
    expect(g.assign(silent, s.letter, s.author)).toBeUndefined();
    expect(MIN_STORY).toBeGreaterThan(10);
  });
});
