// « Essayer une manche » : une vraie petite manche, guidée pas à pas, au comptoir avec trois personnages scénarisés.
// D'abord tu dis la vérité : tu écris, tu écoutes le débat, tu votes, tu signes les serviettes. Puis tu deviens le
// Mytho le temps d'une histoire inventée, et l'addition tombe.
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight, GraduationCap, Hand, Plus, Send, Sparkles, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AVATARS, MAX_STORY, MIN_STORY, type FinalView, type RoundResult, type StoryResult } from '../../../shared/protocol';
import { POINTS, scoreRound, signed } from '../../../shared/rules';
import { sfx } from '../lib/sound';
import { capital, plural, reasons } from '../lib/text';
import { cls, vibrate } from '../lib/util';
import { createRoom } from '../net';
import { Ranking } from '../screens/Final';
import { useStore } from '../store';
import { Avatar, Button, Chalkboard, MarkerScribble, Modal, Napkin, Scene, Signature, tiltOf } from './Ui';

type Step = 'intro' | 'role' | 'write' | 'vote' | 'guess' | 'reveal' | 'liar' | 'liar-result' | 'ranking' | 'lessons';
const STEPS: Step[] = ['intro', 'role', 'write', 'vote', 'guess', 'reveal', 'liar', 'liar-result', 'ranking', 'lessons'];

const ORDER = ['moi', 'leo', 'ines', 'sam'];
const NPC_NAMES: Record<string, string> = { leo: 'Léo', ines: 'Inès', sam: 'Sam' };
const NPC_AVATARS = ['renard', 'licorne', 'cowboy', 'hibou', 'pieuvre'];

// ───────────────────────────── Première manche : tu dis la vérité ─────────────────────────────

const Q1 = { text: 'Ta pire honte au restaurant', hint: 'un plat renversé, une addition qui pique, un serveur appelé « papa »…' };
const MY_EXAMPLE = 'J’ai appelé le serveur « papa » devant toute la table, le soir de mon anniversaire.';
/** A : Léo, B : toi, C : Inès (le Mytho), D : Sam. */
const STORIES1 = (mine: string): StoryResult[] => [
  { letter: 'A', text: 'J’ai renversé un plat de moules entier sur la robe de ma voisine de table.', author: 'leo' },
  { letter: 'B', text: mine, author: 'moi' },
  { letter: 'C', text: 'Le chef est sorti de sa cuisine pour me demander de parler moins fort.', author: 'ines' },
  { letter: 'D', text: 'J’ai payé l’addition de la table d’à côté par erreur : 140 euros.', author: 'sam' },
];
const FAKE1 = 'C';
/** Le débat, tel qu'on l'entendrait autour du comptoir. */
const DEBATE: { by: string; text: string }[] = [
  { by: 'leo', text: 'La C, je n’y crois pas : un chef qui sort de sa cuisine pour ça ?' },
  { by: 'ines', text: 'Moi, c’est la D qui me gêne. 140 euros, c’est bien précis…' },
  { by: 'sam', text: 'Les détails précis, c’est souvent du vrai, non ?' },
  { by: 'ines', text: 'Ou quelqu’un de très fort. Je vote D.' },
];
const NPC_VOTES1: Record<string, string> = { leo: 'C', sam: 'C', ines: 'D' };
const NPC_GUESSES1: Record<string, Record<string, string>> = {
  leo: { B: 'moi', C: 'ines', D: 'sam' },
  sam: { A: 'leo', B: 'ines', C: 'moi' },
  ines: { A: 'sam', B: 'moi', D: 'leo' },
};

// ───────────────────────────── Deuxième manche : tu es le Mytho ─────────────────────────────

const Q2 = { text: 'Un cadeau complètement raté', hint: 'un pull qui gratte, un objet en double, un cadeau qui ne t’allait pas du tout…' };
const LIAR_EXAMPLE = 'Pour mes 18 ans, mon oncle m’a offert un aspirateur. Il était très fier de lui.';
const STORIES2 = (mine: string): StoryResult[] => [
  { letter: 'A', text: 'Ma tante m’a tricoté un pull à mon prénom… mal orthographié.', author: 'sam' },
  { letter: 'B', text: 'Pour mes 30 ans, on m’a offert un saut en parachute. J’ai le vertige.', author: 'leo' },
  { letter: 'C', text: mine, author: 'moi' },
  { letter: 'D', text: 'J’ai offert à ma belle-mère le même parfum que l’année d’avant.', author: 'ines' },
];
const FAKE2 = 'C';
const VOTES2: Record<string, string> = { moi: 'D', leo: 'D', sam: 'C', ines: 'B' };

const MOOD: Record<Step, 'mur' | 'zinc' | 'addition'> = {
  intro: 'mur',
  role: 'zinc',
  write: 'zinc',
  vote: 'zinc',
  guess: 'zinc',
  reveal: 'zinc',
  liar: 'zinc',
  'liar-result': 'zinc',
  ranking: 'addition',
  lessons: 'addition',
};

export function Tutorial() {
  const open = useStore((s) => s.tutorialOpen);
  if (!open) return null;
  return createPortal(<TutorialRun />, document.body);
}

/** Le petit éditeur d'histoire de la manche d'essai, avec un exemple tout prêt. */
function Writer({ placeholder, example, onDone }: { placeholder: string; example: string; onDone: (t: string) => void }) {
  const [text, setText] = useState('');
  const short = MIN_STORY - text.trim().length;
  return (
    <section className="composer">
      <label className="napkin napkin-field">
        <span className="napkin-emboss" aria-hidden />
        <span className="sr-only">Ton histoire</span>
        <textarea className="napkin-input" value={text} maxLength={MAX_STORY} rows={4} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
        <span className={cls('napkin-count', short > 0 && 'is-short')}>{short > 0 && text ? `encore ${short} signe${short > 1 ? 's' : ''}` : ''}</span>
      </label>
      <div className="tuto-write-actions">
        <Button variant="ghost" icon={<Sparkles size={16} />} onClick={() => setText(example)}>
          Écrire un exemple pour moi
        </Button>
        <Button
          variant="primary"
          className="btn-lg"
          icon={<Send size={18} />}
          disabled={short > 0}
          onClick={() => {
            sfx.pen();
            vibrate(15);
            onDone(text.trim().charAt(0).toUpperCase() + text.trim().slice(1));
          }}
        >
          C’est écrit
        </Button>
      </div>
    </section>
  );
}

function TutorialRun() {
  const setOpen = useStore((s) => s.setTutorialOpen);
  const profile = useStore((s) => s.profile);
  const inRoom = useStore((s) => !!s.view);
  const [step, setStep] = useState<Step>('intro');
  const [roleOpen, setRoleOpen] = useState(false);
  const [mine1, setMine1] = useState('');
  const [heard, setHeard] = useState(0);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [guess, setGuess] = useState<Record<string, string>>({});
  const [slot, setSlot] = useState<string | null>(null);
  const [liarOpen, setLiarOpen] = useState(false);
  const [mine2, setMine2] = useState('');
  const [ranked, setRanked] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const idx = STEPS.indexOf(step);
  const me = { name: profile.name.trim() || 'Toi', avatar: profile.avatar };
  const avatars = useMemo(() => {
    const free = [...NPC_AVATARS, ...AVATARS].filter((a, i, all) => a !== me.avatar && all.indexOf(a) === i);
    return { leo: free[0], ines: free[1], sam: free[2], moi: me.avatar } as Record<string, string>;
  }, [me.avatar]);
  const name = (id: string) => (id === 'moi' ? 'toi' : NPC_NAMES[id]);
  const close = () => setOpen(false);
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, idx + 1)]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !slot) close();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [step]);
  // Le débat défile, une réplique après l'autre.
  useEffect(() => {
    if (step !== 'vote' || heard >= DEBATE.length) return;
    const t = window.setTimeout(() => setHeard((h) => h + 1), heard === 0 ? 700 : 1900);
    return () => window.clearTimeout(t);
  }, [step, heard]);
  useEffect(() => {
    if (step === 'guess') window.setTimeout(() => sfx.marker(), 400);
    if (step === 'role' || step === 'liar') sfx.bell();
  }, [step]);

  const stories1 = useMemo(() => STORIES1(mine1 || MY_EXAMPLE), [mine1]);
  const stories2 = useMemo(() => STORIES2(mine2 || LIAR_EXAMPLE), [mine2]);
  const votes1 = { ...NPC_VOTES1, ...(myVote ? { moi: myVote } : {}) };
  const round1 = useMemo<RoundResult>(() => {
    const guesses = { ...NPC_GUESSES1, moi: guess };
    const { delta, detail } = scoreRound(ORDER, 'ines', stories1, FAKE1, votes1, guesses);
    return { round: 1, question: { id: 'q1', ...Q1 }, mytho: 'ines', stories: stories1, fake: FAKE1, votes: votes1, guesses, canceled: null, delta, detail };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories1, myVote, guess]);
  const round2 = useMemo<RoundResult>(() => {
    const { delta, detail } = scoreRound(ORDER, 'moi', stories2, FAKE2, VOTES2, {});
    return { round: 2, question: { id: 'q2', ...Q2 }, mytho: 'moi', stories: stories2, fake: FAKE2, votes: VOTES2, guesses: {}, canceled: null, delta, detail };
  }, [stories2]);
  const final = useMemo<FinalView>(() => {
    const score = (id: string) => (round1.delta[id] ?? 0) + (round2.delta[id] ?? 0);
    const sum = (id: string, k: 'fooled' | 'accused' | 'authors') => (round1.detail[id]?.[k] ?? 0) + (round2.detail[id]?.[k] ?? 0);
    const found = (id: string) => [round1, round2].filter((r) => r.detail[id]?.found === true).length;
    const sorted = [...ORDER].sort((a, b) => score(b) - score(a));
    const best = score(sorted[0]);
    return {
      winners: sorted.filter((id) => score(id) === best),
      rounds: [round1, round2],
      players: sorted.map((id) => ({
        id,
        name: id === 'moi' ? me.name : NPC_NAMES[id],
        avatar: avatars[id],
        score: score(id),
        found: found(id),
        fooled: sum(id, 'fooled'),
        accused: sum(id, 'accused'),
        authors: sum(id, 'authors'),
        mythos: id === 'ines' || id === 'moi' ? 1 : 0,
        rank: 1 + sorted.filter((x) => score(x) > score(id)).length,
        winner: score(id) === best,
        wins: 0,
      })),
    };
  }, [round1, round2, avatars, me.name]);

  const assign = (letter: string, who: string | null) => {
    setGuess((g) => {
      const out: Record<string, string> = {};
      for (const [l, w] of Object.entries(g)) if (l !== letter && w !== who) out[l] = w;
      if (who) out[letter] = who;
      return out;
    });
    sfx.pen();
    setSlot(null);
  };
  const missing = stories1.filter((s) => s.author !== 'moi' && !guess[s.letter]).length;

  const chip = (letter: string, votes: Record<string, string>) => {
    const by = ORDER.filter((id) => votes[id] === letter);
    if (!by.length) return null;
    return (
      <span className="vote-chips">
        {by.map((id) => (
          <Avatar key={id} avatar={avatars[id]} className="vote-chip" />
        ))}
      </span>
    );
  };

  let content: ReactNode = null;
  let action: ReactNode = null;

  if (step === 'intro') {
    content = (
      <div className="tuto-intro">
        <span className="tuto-badge">
          <GraduationCap size={18} aria-hidden /> Manche d’essai
        </span>
        <h2>Bienvenue au comptoir</h2>
        <p>
          Trois habitués t’attendent&nbsp;: <b>Léo</b>, <b>Inès</b> et <b>Sam</b>. À chaque manche, tout le monde raconte une histoire vraie… sauf le Mytho, qui invente la sienne.
        </p>
        <div className="tuto-cast">
          {ORDER.map((id) => (
            <span key={id} className="tuto-person">
              <Avatar avatar={avatars[id]} className="tuto-avatar" />
              {id === 'moi' ? me.name : NPC_NAMES[id]}
            </span>
          ))}
        </div>
        <p className="small muted">Deux manches, trois minutes. Rien n’est enregistré.</p>
      </div>
    );
    action = (
      <Button variant="primary" className="btn-lg btn-wide" icon={<ChevronRight size={20} />} onClick={next}>
        C’est parti
      </Button>
    );
  } else if (step === 'role') {
    content = (
      <>
        <Chalkboard eyebrow="La question" title={`${Q1.text}…`} hint={Q1.hint} />
        <p className="tuto-say">Léo a choisi la question. L’appli vient de tirer le Mytho au sort, en secret. Déplie ta serviette pour découvrir ton rôle.</p>
        {roleOpen ? (
          <motion.section className="role-card is-open is-true" initial={{ rotateX: -70, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }}>
            <span className="role-emoji" aria-hidden>
              🤞
            </span>
            <div className="role-text">
              <b className="role-title">Tu dis la vérité</b>
              <span>Raconte une vraie anecdote. Quelqu’un, à cette table, va inventer la sienne…</span>
            </div>
          </motion.section>
        ) : (
          <button
            type="button"
            className="role-card is-closed"
            onClick={() => {
              setRoleOpen(true);
              sfx.secret();
              vibrate(20);
            }}
          >
            <span className="role-fold" aria-hidden />
            <b>Touche pour voir ton rôle</b>
            <small>À une vraie table, cache bien ton écran.</small>
          </button>
        )}
      </>
    );
    action = roleOpen && (
      <Button variant="primary" className="btn-lg btn-wide" icon={<ChevronRight size={20} />} onClick={next}>
        Écrire mon histoire
      </Button>
    );
  } else if (step === 'write') {
    content = (
      <>
        <Chalkboard eyebrow="La question" title={`${Q1.text}…`} hint={Q1.hint} className="is-small" />
        <p className="tuto-say">Écris un vrai souvenir, en une ou deux phrases, avec un détail concret. Pas d’idée&nbsp;? Prends l’exemple.</p>
        <Writer
          placeholder="Ton histoire, en une ou deux phrases…"
          example={MY_EXAMPLE}
          onDone={(t) => {
            setMine1(t);
            next();
          }}
        />
      </>
    );
  } else if (step === 'vote') {
    content = (
      <>
        <Chalkboard eyebrow="La question" title={`${Q1.text}…`} className="is-small" />
        <p className="tuto-say">
          Les quatre histoires sont mélangées et lues à voix haute. Ta serviette est la <b>B</b>. Écoute le débat, puis touche celle que tu crois fausse.
        </p>
        <ol className="napkin-grid">
          {stories1.map((s) => {
            const own = s.author === 'moi';
            return (
              <li key={s.letter}>
                <Napkin letter={s.letter} text={s.text} tilt={tiltOf(s.letter)} className={cls(own && 'is-mine')} onClick={own ? undefined : () => (setMyVote(s.letter), sfx.glass())} pressed={myVote === s.letter}>
                  {own && <span className="napkin-tag">La tienne</span>}
                  {myVote === s.letter && (
                    <span className="napkin-vote">
                      <Hand size={14} aria-hidden /> Fausse&nbsp;?
                    </span>
                  )}
                </Napkin>
              </li>
            );
          })}
        </ol>
        <ol className="tuto-debate" aria-live="polite">
          <AnimatePresence initial={false}>
            {DEBATE.slice(0, heard).map((l, i) => (
              <motion.li key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Avatar avatar={avatars[l.by]} className="chat-avatar" />
                <span>
                  <b>{NPC_NAMES[l.by]}</b> {l.text}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </>
    );
    action = (
      <Button variant="primary" className="btn-lg btn-wide" icon={<Check size={18} />} disabled={!myVote} onClick={next}>
        {myVote ? `Je vote pour la ${myVote}` : 'Touche une serviette'}
      </Button>
    );
  } else if (step === 'guess') {
    content = (
      <>
        <p className="tuto-say">
          La fausse était la <b>C</b>
          {myVote === FAKE1 ? <>&nbsp;: bien vu, {signed(POINTS.found)}&nbsp;!</> : <>. Tu disais la {myVote}&nbsp;: raté, mais ça arrive.</>} Les votes de toute la table sont visibles. Place maintenant un nom sur chaque autre serviette, et sur la fausse, celui du Mytho.
        </p>
        <p className="tuto-hint">
          <Sparkles size={14} aria-hidden /> Indice&nbsp;: le Mytho ne peut pas voter pour sa propre histoire. Léo et Sam ont voté C…
        </p>
        <ol className="napkin-grid">
          {stories1.map((s) => {
            const own = s.author === 'moi';
            const g = guess[s.letter];
            return (
              <li key={s.letter}>
                <Napkin letter={s.letter} text={s.text} tilt={tiltOf(s.letter)} className={cls(own && 'is-mine', s.letter === FAKE1 && 'is-fake')}>
                  {s.letter === FAKE1 && <MarkerScribble delay={0.2} />}
                  {chip(s.letter, votes1)}
                  {own ? (
                    <span className="napkin-tag">La tienne</span>
                  ) : (
                    <button type="button" className={cls('sign-slot', g && 'is-filled', s.letter === FAKE1 && 'is-fake')} onClick={() => setSlot(s.letter)}>
                      {g ? (
                        <>
                          <Avatar avatar={avatars[g]} className="slot-avatar" />
                          <span className="slot-name">{NPC_NAMES[g]}</span>
                        </>
                      ) : (
                        <>
                          <UserRound size={15} aria-hidden /> {s.letter === FAKE1 ? 'Le Mytho ?' : 'Qui ?'}
                        </>
                      )}
                    </button>
                  )}
                </Napkin>
              </li>
            );
          })}
        </ol>
        <Modal open={!!slot} onClose={() => setSlot(null)} title={slot === FAKE1 ? `La ${slot}, c’est le Mytho. Qui ?` : `Qui a écrit la ${slot} ?`} className="sheet">
          <ul className="name-list">
            {['leo', 'ines', 'sam'].map((id) => {
              const elsewhere = Object.entries(guess).find(([l, w]) => w === id && l !== slot)?.[0];
              return (
                <li key={id}>
                  <button type="button" className={cls('name-opt', slot && guess[slot] === id && 'is-on')} onClick={() => slot && assign(slot, id)}>
                    <Avatar avatar={avatars[id]} className="name-avatar" />
                    <span className="name-label">{NPC_NAMES[id]}</span>
                    {elsewhere && <small className="name-where">déjà sur la {elsewhere}</small>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Modal>
      </>
    );
    action = (
      <Button variant="primary" className="btn-lg btn-wide" icon={<Check size={18} />} disabled={missing > 0} onClick={next}>
        {missing > 0 ? `Encore ${plural(missing, 'serviette')} à signer` : 'Valider mes réponses'}
      </Button>
    );
  } else if (step === 'reveal') {
    const mine = reasons(round1, 'moi');
    content = (
      <>
        <p className="tuto-say">Les auteurs signent leur serviette, le Mytho en dernier. C’était Inès&nbsp;!</p>
        <ol className="napkin-grid">
          {stories1.map((s, i) => {
            const delay = s.letter === FAKE1 ? 0.4 + 3 * 0.5 : 0.4 + (i > 2 ? 2 : i) * 0.5;
            const g = guess[s.letter];
            return (
              <li key={s.letter}>
                <Napkin letter={s.letter} text={s.text} tilt={tiltOf(s.letter)} className={cls(s.author === 'moi' && 'is-mine', s.letter === FAKE1 && 'is-fake')}>
                  {s.letter === FAKE1 && <MarkerScribble delay={0} />}
                  {chip(s.letter, votes1)}
                  <Signature name={s.author === 'moi' ? 'toi' : NPC_NAMES[s.author]} delay={delay} tone={s.letter === FAKE1 ? 'red' : 'blue'} className="napkin-signature" />
                  {s.author !== 'moi' && (
                    <motion.span className={cls('guess-mark', g === s.author ? 'is-right' : 'is-wrong')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.3 }}>
                      {g === s.author ? <Check size={13} strokeWidth={3} aria-label="bien deviné" /> : `tu disais ${NPC_NAMES[g] ?? '?'}`}
                    </motion.span>
                  )}
                </Napkin>
              </li>
            );
          })}
        </ol>
        <motion.section className="round-bill" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.6 }}>
          <ul className="bill-lines" aria-label="Ta manche">
            {mine.map((l) => (
              <li key={l.text}>
                <span>{l.text}</span>
                <b>{signed(l.pts)}</b>
              </li>
            ))}
            <li className="bill-total">
              <span>Ta manche</span>
              <b>{signed(round1.delta.moi)}</b>
            </li>
          </ul>
          <p className="small muted">
            Inès, le Mytho, marque {signed(POINTS.fooled)} par voix trompée&nbsp;: {round1.detail.ines.fooled ? plural(round1.detail.ines.fooled, 'voix', 'voix') : 'aucune'} cette fois. Sam marque {signed(POINTS.accused)} par voix contre son histoire vraie.
          </p>
        </motion.section>
      </>
    );
    action = (
      <Button variant="primary" className="btn-lg btn-wide" icon={<ChevronRight size={20} />} onClick={next}>
        Manche 2&nbsp;: à toi de mentir
      </Button>
    );
  } else if (step === 'liar') {
    content = (
      <>
        <Chalkboard eyebrow="Manche 2" title={`${Q2.text}…`} hint={Q2.hint} />
        {liarOpen ? (
          <>
            <motion.section className="role-card is-open is-mytho" initial={{ rotateX: -70, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }}>
              <span className="role-emoji" aria-hidden>
                🤥
              </span>
              <div className="role-text">
                <b className="role-title">Tu es le Mytho</b>
                <span>Invente une histoire crédible. Tout le monde raconte du vrai&nbsp;: fonds-toi dans la masse.</span>
              </div>
            </motion.section>
            <p className="tuto-say">Invente un cadeau raté qui pourrait t’arriver, aussi banal que les vrais. Une histoire trop belle se repère vite.</p>
            <Writer
              placeholder="Ton histoire inventée, mais crédible…"
              example={LIAR_EXAMPLE}
              onDone={(t) => {
                setMine2(t);
                next();
              }}
            />
          </>
        ) : (
          <button
            type="button"
            className="role-card is-closed"
            onClick={() => {
              setLiarOpen(true);
              sfx.secret();
              vibrate(20);
            }}
          >
            <span className="role-fold" aria-hidden />
            <b>Touche pour voir ton rôle</b>
            <small>Le Mytho change à chaque manche…</small>
          </button>
        )}
      </>
    );
  } else if (step === 'liar-result') {
    content = (
      <>
        <p className="tuto-say">
          Le débat a eu lieu, tout le monde a voté. Léo et Inès se sont fait avoir&nbsp;: <b>{signed(2 * POINTS.fooled)}</b> pour toi. Sam, en revanche, a vu clair dans ton jeu.
        </p>
        <ol className="napkin-grid">
          {stories2.map((s) => (
            <li key={s.letter}>
              <Napkin letter={s.letter} text={s.text} tilt={tiltOf(s.letter)} className={cls(s.author === 'moi' && 'is-mine', s.letter === FAKE2 && 'is-fake')}>
                {s.letter === FAKE2 && <MarkerScribble delay={0.3} />}
                {chip(s.letter, VOTES2)}
                <Signature name={s.author === 'moi' ? 'toi' : NPC_NAMES[s.author]} delay={0.9} tone={s.letter === FAKE2 ? 'red' : 'blue'} className="napkin-signature" />
              </Napkin>
            </li>
          ))}
        </ol>
        <p className="small muted center">Le Mytho vote aussi, pour une histoire vraie&nbsp;: ici la D, ce qui rapporte un point à Inès. Puis vient «&nbsp;Qui a écrit quoi&nbsp;?&nbsp;», comme à la première manche.</p>
      </>
    );
    action = (
      <Button variant="primary" className="btn-lg btn-wide" icon={<ChevronRight size={20} />} onClick={next}>
        Voir l’addition
      </Button>
    );
  } else if (step === 'ranking') {
    content = <Ranking final={final} me="moi" name={(id) => (id === 'moi' ? 'toi' : capital(name(id)))} onDone={() => setRanked(true)} />;
    action = ranked && (
      <Button variant="primary" className="btn-lg btn-wide" icon={<ChevronRight size={20} />} onClick={next}>
        Ce qu’il faut retenir
      </Button>
    );
  } else {
    content = (
      <div className="tuto-lessons">
        <h2>À toi de jouer pour de vrai</h2>
        <ul>
          <li>
            <b>{signed(POINTS.found)}</b> pour qui trouve la fausse histoire.
          </li>
          <li>
            <b>{signed(POINTS.fooled)}</b> au Mytho par voix trompée.
          </li>
          <li>
            <b>{signed(POINTS.accused)}</b> à l’auteur d’une histoire vraie, par voix qui la croit fausse.
          </li>
          <li>
            <b>{signed(POINTS.author)}</b> par auteur bien deviné, le Mytho compris.
          </li>
        </ul>
        <p className="small muted">À une vraie table, les histoires sont lues à voix haute par quelqu’un tiré au sort, et le débat se fait de vive voix. Bluffer est permis.</p>
      </div>
    );
    action = (
      <div className="tuto-end">
        {!inRoom && (
          <Button
            variant="primary"
            className="btn-lg btn-wide"
            icon={<Plus size={20} />}
            onClick={async () => {
              if (!profile.name.trim()) {
                close();
                useStore.getState().showToast('Choisis un pseudo, puis crée ta table.', 'info');
                window.setTimeout(() => document.getElementById('pseudo')?.focus(), 50);
                return;
              }
              if (await createRoom()) close();
            }}
          >
            Créer une table
          </Button>
        )}
        <Button variant={inRoom ? 'primary' : 'ghost'} className={cls(inRoom && 'btn-lg btn-wide')} onClick={close}>
          {inRoom ? 'Retour à la table' : 'Fermer'}
        </Button>
      </div>
    );
  }

  return (
    <div className="tutorial" role="dialog" aria-modal="true" aria-label="Essayer une manche">
      <Scene mood={MOOD[step]} className="tuto-scene">
        <header className="tuto-top">
          <span className="tuto-progress" aria-label={`Étape ${idx + 1} sur ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <span key={s} className={cls('tuto-dot', i <= idx && 'is-on')} />
            ))}
          </span>
          <button type="button" className="icon-btn" aria-label="Fermer la manche d’essai" onClick={close}>
            <X size={20} />
          </button>
        </header>
        <div ref={body} className="tuto-body">
          <AnimatePresence mode="wait">
            <motion.div key={step} className="tuto-step" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              {content}
            </motion.div>
          </AnimatePresence>
        </div>
        {action && <div className="actionbar tuto-actions">{action}</div>}
      </Scene>
    </div>
  );
}
