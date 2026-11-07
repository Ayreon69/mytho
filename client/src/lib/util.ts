import { useEffect, useState } from 'react';
import { serverNow } from '../store';

export function cls(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * Pour les boutons de jeu qu'on touche à la souris : ils ne gardent pas le focus. Sinon, Entrée (« miser ») les
 * réactionnerait : un ticket de plus, ou un cube de plus dans la même colonne. Au clavier (Tab), ils le prennent comme avant.
 */
export const noMouseFocus = { onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault() };

export function plural(n: number, word: string): string {
  return `${n} ${word}${Math.abs(n) > 1 ? 's' : ''}`;
}

/** Force un rendu régulier (comptes à rebours, effacement des indices). */
export function useTick(ms = 250): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function secondsLeft(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function shareUrl(code: string): string {
  return `${window.location.origin}/t/${code}`;
}

export function vibrate(pattern: number | number[]): void {
  try {
    // Le navigateur refuse de vibrer tant que le joueur n'a rien touché dans la page.
    if (navigator.userActivation?.hasBeenActive === false) return;
    navigator.vibrate?.(pattern);
  } catch {
    /* non supporté */
  }
}

/** L'utilisateur a demandé moins d'animations. */
export function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const VOWELS = 'aeiouyàâäéèêëîïôöùûüÿœæ';
const isVowel = (ch: string | undefined) => !!ch && VOWELS.includes(ch.toLowerCase());
const isConsonant = (ch: string | undefined) => !!ch && /\p{L}/u.test(ch) && !isVowel(ch);
/** Deux consonnes qu'on ne sépare pas en français : ch, ph, th, gn, qu, gu, et une consonne suivie de l ou r (bl, tr…). */
const together = (a: string, b: string) => /^(ch|ph|th|gn|qu|gu|[bcdfgkptv][lr])$/i.test(a + b);

/**
 * Un mot de 9 lettres ou plus reçoit des césures conditionnelles (U+00AD) entre ses syllabes, jamais à moins de
 * 3 lettres d'un bord : « Maximi-lienne », « Bartholo-meus », « Constantino-ple », plutôt que « Maximilie-nne ».
 * Le navigateur n'en garde qu'une, avec son tiret, et seulement si le mot ne tient pas sur la ligne
 * (voir `NameParts`, qui met chaque morceau du nom dans sa propre boîte).
 */
export function breakable(word: string): string {
  return word.replace(/[^\s-]{9,}/g, (w) => {
    const c = [...w];
    return c
      .map((ch, i) => {
        if (i < 3 || i > c.length - 3) return ch;
        const [a, d] = [c[i - 1], c[i + 1]];
        const cut =
          (isVowel(a) && isConsonant(ch) && isVowel(d)) || // Maxi-milienne
          (isConsonant(a) && isConsonant(ch) && isVowel(d) && !together(a, ch)) || // Char-lotte, Cons-tantinople
          ((isVowel(a) || isConsonant(a)) && isConsonant(ch) && isConsonant(d) && together(ch, d) && isVowel(c[i + 2])); // Christo-phe, Bar-tholomeus
        return cut ? `\u00ad${ch}` : ch;
      })
      .join('');
  });
}
