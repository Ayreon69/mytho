// Les mots de la table : noms, durées, et ce qu'une manche a rapporté à chacun.
import type { DebateSetting, RoundResult, WriteSetting } from '../../../shared/protocol';
import { POINTS, de, listing, plural, signed } from '../../../shared/rules';

export { de, listing, plural, signed };

/** Le nom d'un joueur tel qu'on le lit dans une phrase ; « toi » pour soi. */
export function nameOf(players: { id: string; name: string }[], me: string, id: string | undefined | null, self = true): string {
  if (!id) return '?';
  if (self && id === me) return 'toi';
  return players.find((p) => p.id === id)?.name ?? '?';
}

/** Le sujet d'une phrase et son verbe : « Léo a voté », « Tu as voté ». */
export function who(name: string, il: string, tu: string): string {
  return name === 'toi' ? `Tu ${tu}` : `${capital(name)} ${il}`;
}

export function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const WRITE_LABEL: Record<WriteSetting, string> = { 120: '2 min', 180: '3 min', 300: '5 min', 0: 'Sans limite' };
export const WRITE_SUB: Record<WriteSetting, string> = { 120: 'rapide', 180: 'conseillé', 300: 'tranquille', 0: 'on attend tout le monde' };
export const DEBATE_LABEL: Record<DebateSetting, string> = { 60: '1 min', 120: '2 min', 180: '3 min', 0: 'Sans limite' };
export const DEBATE_SUB: Record<DebateSetting, string> = { 60: 'vite fait', 120: 'conseillé', 180: 'on a le temps', 0: 'jusqu’au dernier vote' };

/** Pourquoi un joueur marque ce qu'il marque dans une manche, une raison par ligne. */
export function reasons(r: RoundResult, id: string): { text: string; pts: number }[] {
  const d = r.detail[id];
  if (!d) return [];
  const out: { text: string; pts: number }[] = [];
  const mytho = r.mytho === id;
  if (!mytho && d.found === true) out.push({ text: 'Fausse histoire trouvée', pts: POINTS.found });
  if (!mytho && d.found === false) out.push({ text: 'Fausse histoire ratée', pts: 0 });
  if (mytho && d.fooled) out.push({ text: `${plural(d.fooled, 'voix trompée', 'voix trompées')}`, pts: d.fooled * POINTS.fooled });
  if (mytho && !d.fooled) out.push({ text: 'Personne n’a été dupe', pts: 0 });
  if (!mytho && d.accused) out.push({ text: `Ton histoire vraie a semé le doute (${plural(d.accused, 'voix', 'voix')})`, pts: d.accused * POINTS.accused });
  if (d.authors) out.push({ text: `${plural(d.authors, 'auteur deviné', 'auteurs devinés')}`, pts: d.authors * POINTS.author });
  return out;
}

/** Une manche annulée, en une phrase. */
export function canceledLine(r: RoundResult): string {
  return r.canceled === 'mytho' ? 'Le Mytho n’a rien écrit à temps : la manche ne compte pas.' : 'Moins de trois histoires sur le comptoir : la manche ne compte pas.';
}
