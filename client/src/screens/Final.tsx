// La fin : l'addition du bistrot, qui s'imprime ligne à ligne du dernier au premier, puis « Tournée générale ! ».
// Ensuite les distinctions, les histoires inventées de la soirée, manche par manche, et les victoires de la soirée.
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { Crown, LogOut, RotateCcw, Trophy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FinalPlayer, FinalView, RoomView } from '../../../shared/protocol';
import { Avatar, Button, Logo, NameParts, Napkin, Scene } from '../components/Ui';
import { sfx } from '../lib/sound';
import { capital, listing, plural } from '../lib/text';
import { cls, reducedMotion } from '../lib/util';
import { leaveRoom, send } from '../net';

/** Le dévoilement : une ligne de l'addition après l'autre, du bas vers le haut, puis le vainqueur. */
function useCountdown(n: number): [number, () => void] {
  const [shown, setShown] = useState(() => (reducedMotion() ? n + 1 : 0));
  useEffect(() => {
    if (shown > n) return;
    const t = window.setTimeout(() => setShown((s) => s + 1), shown === n ? 1100 : 520);
    return () => window.clearTimeout(t);
  }, [shown, n]);
  return [shown, () => setShown(n + 1)];
}

function winnerTitle(final: FinalView, me: string, name: (id: string) => string): string {
  const w = final.winners;
  if (w.length > 3) return `${w.length} ex æquo l’emportent !`;
  if (w.length === 1 && w[0] === me) return 'Tu l’emportes !';
  const who = capital(listing(w.map((id) => name(id))));
  if (w.includes(me)) return `${who}, vous l’emportez !`;
  return `${who} ${w.length > 1 ? 'l’emportent' : 'l’emporte'} !`;
}

type Award = { title: string; who: string[]; text: string };

/** Les distinctions de la partie : le meilleur flair, le plus beau baratin, l'histoire vraie la plus suspecte… */
export function awards(final: FinalView): Award[] {
  const best = (key: 'found' | 'fooled' | 'accused' | 'authors') => {
    const top = Math.max(...final.players.map((p) => p[key]));
    const who = final.players.filter((p) => p[key] === top).map((p) => p.id);
    // Une distinction partagée par plus de la moitié de la table ne distingue personne.
    return top > 0 && who.length * 2 <= final.players.length ? { top, who } : null;
  };
  const out: Award[] = [];
  const f = best('found');
  if (f) out.push({ title: 'Nez fin', who: f.who, text: plural(f.top, 'fausse histoire trouvée', 'fausses histoires trouvées') });
  const b = best('fooled');
  if (b) out.push({ title: 'Baratin d’or', who: b.who, text: plural(b.top, 'voix trompée', 'voix trompées') });
  const a = best('accused');
  if (a) out.push({ title: 'Trop beau pour être vrai', who: a.who, text: `${plural(a.top, 'voix', 'voix')} contre des histoires pourtant vraies` });
  const g = best('authors');
  if (g) out.push({ title: 'Physionomiste', who: g.who, text: plural(g.top, 'auteur deviné', 'auteurs devinés') });
  return out;
}

function Row({ p, me, visible, crowned }: { p: FinalPlayer; me: string; visible: boolean; crowned: boolean }) {
  return (
    <motion.li className={cls('bill-row', p.id === me && 'is-me', crowned && p.winner && 'is-winner')} initial={false} animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : -8 }}>
      <span className="bill-rank">{p.rank}</span>
      <Avatar avatar={p.avatar} className="bill-row-avatar" />
      <span className="bill-name">
        <b>{p.id === me ? 'Toi' : <NameParts name={p.name} />}</b>
        <small>
          {p.found ? plural(p.found, 'fausse trouvée', 'fausses trouvées') : 'aucune fausse trouvée'}
          {p.fooled ? ` · ${plural(p.fooled, 'voix trompée', 'voix trompées')}` : ''}
          {p.authors ? ` · ${plural(p.authors, 'auteur deviné', 'auteurs devinés')}` : ''}
        </small>
      </span>
      <span className="bill-dots" aria-hidden />
      {crowned && p.winner && <Crown size={16} className="bill-crown" aria-label="vainqueur" />}
      <b className="bill-pts">{p.score}</b>
    </motion.li>
  );
}

/** L'addition et sa révélation, réutilisées par la manche d'essai. */
export function Ranking({ final, me, name, onDone, code }: { final: FinalView; me: string; name: (id: string) => string; onDone?: () => void; code?: string }) {
  const n = final.players.length;
  const [shown, skip] = useCountdown(n);
  const crowned = shown > n;
  const done = useRef(onDone);
  done.current = onDone;
  const mine = final.players.find((p) => p.id === me);
  useEffect(() => {
    if (shown > 0 && shown <= n) sfx.tap();
    if (shown === n + 1) {
      done.current?.();
      sfx.glass();
      window.setTimeout(() => sfx.fanfare(!mine || mine.winner), 250);
      if ((!mine || mine.winner) && !reducedMotion()) void confetti({ particleCount: 140, spread: 95, origin: { y: 0.25 }, colors: ['#e2322a', '#6d1d22', '#c8a04c', '#fffaf0', '#2b4c9b'], disableForReducedMotion: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  return (
    <section className="bill" onClick={skip}>
      <header className="bill-head">
        <span className="bill-shop">Au Comptoir du Mytho</span>
        <span className="bill-meta">
          {code ? `Table ${code} · ` : ''}
          {today}
        </span>
        <span className="bill-title">L’addition</span>
      </header>
      <ol className="bill-list">
        {final.players.map((p, i) => (
          <Row key={p.id} p={p} me={me} visible={shown >= n - i} crowned={crowned} />
        ))}
      </ol>
      <div className="bill-foot">
        {crowned ? (
          <motion.div className="bill-verdict" initial={{ scale: 1.6, opacity: 0, rotate: -10 }} animate={{ scale: 1, opacity: 1, rotate: -3 }} transition={{ type: 'spring', stiffness: 320, damping: 17 }}>
            <span className="bill-cheers">Tournée générale&nbsp;!</span>
            <b>{winnerTitle(final, me, name)}</b>
          </motion.div>
        ) : (
          <p className="bill-wait">L’addition s’imprime…</p>
        )}
        {crowned && mine && <p className="bill-me">{mine.winner ? 'Bravo, tu gagnes la partie !' : `Tu finis ${mine.rank === 1 ? '1ʳᵉ' : `${mine.rank}ᵉ`}, avec ${plural(mine.score, 'point')}.`}</p>}
      </div>
    </section>
  );
}

/** Les histoires inventées de la soirée, et sur demande les vraies. */
function Stories({ final, name }: { final: FinalView; name: (id: string) => string }) {
  return (
    <section className="reveal-section">
      <h3>Les histoires de la soirée</h3>
      <ol className="night">
        {final.rounds.map((r) => {
          const fake = r.stories.find((s) => s.letter === r.fake);
          const fooled = r.detail[r.mytho]?.fooled ?? 0;
          return (
            <li key={r.round} className="night-row">
              <span className="night-head">
                <b>Manche {r.round}</b> · {r.question.text}…
              </span>
              {r.canceled || !fake ? (
                <span className="muted small">Manche annulée.</span>
              ) : (
                <>
                  <Napkin text={fake.text} className="is-fake night-napkin" tilt={-1}>
                    <span className="night-by">
                      Inventée par <b>{capital(name(r.mytho))}</b>
                      {fooled ? ` · ${plural(fooled, 'voix trompée', 'voix trompées')}` : ' · personne n’y a cru'}
                    </span>
                  </Napkin>
                  <details className="night-true">
                    <summary>Les {plural(r.stories.length - 1, 'histoire vraie', 'histoires vraies')}</summary>
                    <ul>
                      {r.stories
                        .filter((s) => s.letter !== r.fake)
                        .map((s) => (
                          <li key={s.letter}>
                            «&nbsp;{s.text}&nbsp;» <span className="muted">· {capital(name(s.author))}</span>
                          </li>
                        ))}
                    </ul>
                  </details>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function Final({ view }: { view: RoomView }) {
  const final = view.final!;
  const isHost = view.hostId === view.me;
  const host = view.players.find((p) => p.id === view.hostId);
  const ranking = [...view.players].filter((p) => p.status !== 'spectator').sort((a, b) => b.wins - a.wins);
  const name = (id: string) => (id === view.me ? 'toi' : (final.players.find((p) => p.id === id)?.name ?? view.players.find((p) => p.id === id)?.name ?? '?'));
  // Les victoires de la soirée trahiraient le vainqueur : elles attendent la fin du dévoilement.
  const [revealed, setRevealed] = useState(false);
  const list = awards(final);
  return (
    <Scene mood="addition" className="final-screen">
      <header className="topbar">
        <Logo size="sm" />
        <span className="stage-chip final-chip">Fin de la partie</span>
        <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
          Quitter
        </Button>
      </header>
      <main className="final-main">
        <Ranking final={final} me={view.me} name={name} onDone={() => setRevealed(true)} code={view.code} />
        {revealed && (
          <>
            {list.length > 0 && (
              <section className="reveal-section">
                <h3>Distinctions</h3>
                <ul className="awards">
                  {list.map((a) => (
                    <li key={a.title}>
                      <span className="award-title">{a.title}</span>
                      <span>
                        <b>{capital(listing(a.who.map((id) => name(id))))}</b> · {a.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <Stories final={final} name={name} />
            {ranking.some((p) => p.wins > 0) && (
              <section className="reveal-section">
                <h3>Victoires de la soirée</h3>
                <ol className="wins-list">
                  {ranking.map((p) => (
                    <li key={p.id} className={cls(p.id === view.me && 'is-me')}>
                      <Avatar avatar={p.avatar} />
                      <span className="wins-name">{p.id === view.me ? 'Toi' : p.name}</span>
                      <b>
                        <Trophy size={14} aria-hidden /> {p.wins}
                      </b>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </main>
      <div className="actionbar final-actions">
        {isHost ? (
          <Button variant="primary" className="btn-lg" icon={<RotateCcw size={20} />} onClick={() => void send('game:restart')}>
            Revanche
          </Button>
        ) : (
          <p className="waiting" role="status">
            <span className="spinner" /> {host?.name ?? 'L’hôte'} peut relancer une partie.
          </p>
        )}
      </div>
    </Scene>
  );
}
