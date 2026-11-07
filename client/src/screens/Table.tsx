// La partie, au comptoir : on choisit la question, chacun écrit (le Mytho invente), les serviettes sont lues à voix
// haute, on débat et on vote pour la fausse, puis on devine qui a écrit quoi ; enfin les signatures se dévoilent.
// En haut, le bandeau dit toujours ce qu'on attend, de qui, et le temps qui reste.
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Check, Eye, EyeOff, FastForward, Hand, LogOut, Menu, Pencil, RefreshCw, Send, Square, Undo2, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EMOTES, MAX_LINE, MAX_STORY, MIN_STORY, type GameView, type RoomView, type StoryView } from '../../../shared/protocol';
import { Avatar, Button, Chalkboard, Logo, MarkerScribble, Modal, Napkin, Scene, Signature, TimeBar, Toggle, tiltOf } from '../components/Ui';
import { sfx } from '../lib/sound';
import { canceledLine, capital, clock, nameOf, plural, reasons, signed } from '../lib/text';
import { cls, noMouseFocus, secondsLeft, useTick, vibrate } from '../lib/util';
import { call, leaveRoom, send, socket } from '../net';
import { useStore } from '../store';

const STAGE_NAME = { theme: 'La question', write: 'L’écriture', read: 'La lecture', vote: 'Le vote', guess: 'Qui a écrit quoi ?', reveal: 'Le dévoilement' } as const;

/** Raccourcis pour parler des joueurs de cette table. */
function useNames(view: RoomView) {
  return useMemo(() => {
    const name = (id: string | null | undefined, self = true) => nameOf(view.players, view.me, id, self);
    const player = (id: string | null | undefined) => view.players.find((p) => p.id === id);
    return { name, player };
  }, [view.players, view.me]);
}

/** « Manche 2/5 · Le vote » ; sur un petit écran, le mot « Manche » s'efface. */
function StageChip({ g }: { g: GameView }) {
  return (
    <span className="stage-chip" aria-label={`Manche ${g.round} sur ${g.rounds}, ${STAGE_NAME[g.stage]}`}>
      <span className="chip-manche">Manche </span>
      {g.round}/{g.rounds}
    </span>
  );
}

function TopBar({ view, onMenu }: { view: RoomView; onMenu: () => void }) {
  const g = view.game!;
  return (
    <header className="topbar">
      <Logo size="sm" />
      <StageChip g={g} />
      <button type="button" className="icon-btn menu-btn" aria-label="Menu" onClick={onMenu}>
        <Menu size={20} />
      </button>
    </header>
  );
}

/** Ce que l'hôte peut presser : on n'attend plus personne pour cette étape. */
function hurryLabel(g: GameView): string | null {
  if (g.stage === 'theme') return 'Prendre la première question';
  if (g.stage === 'write') return 'Ne plus attendre les histoires';
  if (g.stage === 'vote') return 'Clore le vote';
  if (g.stage === 'guess') return 'Clore les devinettes';
  return null;
}

function GameMenu({ view, open, onClose }: { view: RoomView; open: boolean; onClose: () => void }) {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRules = useStore((s) => s.setRulesOpen);
  const isHost = view.hostId === view.me;
  const g = view.game!;
  const hurry = hurryLabel(g);
  return (
    <Modal open={open} onClose={onClose} title="Menu">
      <div className="menu-list">
        <Scores view={view} title="L’ardoise des scores" />
        <Button icon={<BookOpen size={18} />} onClick={() => (onClose(), setRules(true))}>
          Les règles
        </Button>
        <Toggle on={prefs.sound} onChange={(sound) => setPrefs({ sound })} label="Sons et vibrations" />
        {isHost && hurry && (
          <Button icon={<FastForward size={16} />} onClick={() => (onClose(), void send('game:hurry', { seq: g.seq }))}>
            {hurry}
          </Button>
        )}
        {isHost && (
          <Button variant="danger" icon={<Square size={16} />} onClick={() => (onClose(), void send('game:end'))}>
            Arrêter la partie (retour au salon)
          </Button>
        )}
        <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
          Quitter la table
        </Button>
      </div>
    </Modal>
  );
}

function Tip({ children }: { children: ReactNode }) {
  const tips = useStore((s) => s.view?.settings.tips);
  if (!tips) return null;
  return (
    <motion.p className="tip" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <span className="tip-mark" aria-hidden>
        ✶
      </span>
      <span>{children}</span>
    </motion.p>
  );
}

/** L'ardoise des scores, à la craie. */
function Scores({ view, title, delta }: { view: RoomView; title?: string; delta?: Record<string, number> }) {
  const g = view.game!;
  const { player } = useNames(view);
  const ids = [...new Set(g.order)].sort((a, b) => (g.scores[b] ?? 0) - (g.scores[a] ?? 0));
  return (
    <section className="scores" aria-label={title ?? 'Les scores'}>
      {title && <h4 className="scores-title">{title}</h4>}
      <ol className="scores-list">
        {ids.map((id, i) => {
          const p = player(id);
          const d = delta?.[id];
          return (
            <li key={id} className={cls('score-row', id === view.me && 'is-me', p?.autopilot && 'is-away')}>
              <Avatar avatar={p?.avatar ?? 'cafe'} className="score-avatar" />
              <span className="score-name">{id === view.me ? 'Toi' : (p?.name ?? '?')}</span>
              {d !== undefined && d !== 0 && (
                <motion.span className={cls('score-delta', d > 0 ? 'is-up' : 'is-down')} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.4 + i * 0.05 }}>
                  {signed(d)}
                </motion.span>
              )}
              <b className="score-pts">{g.scores[id] ?? 0}</b>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Emotes({ disabled }: { disabled?: boolean }) {
  const [last, setLast] = useState(0);
  return (
    <div className="emote-bar" role="group" aria-label="Réactions">
      {EMOTES.map((e) => (
        <button
          key={e}
          type="button"
          className="emote-btn"
          disabled={disabled}
          {...noMouseFocus}
          onClick={() => {
            if (Date.now() - last < 1000) return;
            setLast(Date.now());
            socket.emit('emote', { emoji: e });
          }}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/** Les réactions de la table : une bulle par réaction, avec le nom. */
function EmoteStream({ view }: { view: RoomView }) {
  const emotes = useStore((s) => s.emotes);
  const { name } = useNames(view);
  return (
    <div className="emote-stream" aria-live="polite">
      <AnimatePresence>
        {emotes.slice(-4).map((e) => (
          <motion.span key={e.id} className="emote-pop" initial={{ y: 12, opacity: 0, scale: 0.7 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -10 }}>
            <span className="emote-emoji">{e.emoji}</span> {e.playerId === view.me ? 'Toi' : name(e.playerId)}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Une rangée d'avatars : qui a fini, qui a voté, qui a validé. Les absents sont grisés. */
function Seats({ view, ids, done, label }: { view: RoomView; ids: string[]; done: string[]; label: string }) {
  const { player } = useNames(view);
  return (
    <div className="seats" role="list" aria-label={label}>
      {ids.map((id) => {
        const p = player(id);
        const ok = done.includes(id);
        return (
          <span key={id} role="listitem" className={cls('seat', ok && 'is-done', p?.autopilot && 'is-away')} title={`${id === view.me ? 'Toi' : (p?.name ?? '?')}${ok ? ' (c’est fait)' : ''}`}>
            <Avatar avatar={p?.avatar ?? 'cafe'} className="seat-avatar" />
            {ok && (
              <span className="seat-check" aria-hidden>
                <Check size={11} strokeWidth={3.5} />
              </span>
            )}
            <span className="seat-name">{id === view.me ? 'Toi' : (p?.name ?? '?')}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Le bandeau du haut : ce qu'on attend, de qui, et l'horloge. */
function StatusBand({ view }: { view: RoomView }) {
  const g = view.game!;
  const { name, player } = useNames(view);
  const now = useTick(250);
  const left = g.endsAt ? secondsLeft(g.endsAt, now) : null;
  const last = useRef(-1);
  useEffect(() => {
    if (left === null || left === last.current) return;
    last.current = left;
    if (left > 0 && left <= 5 && (g.stage === 'write' || g.stage === 'vote' || g.stage === 'guess')) sfx.tick();
  }, [left, g.stage]);
  const seated = g.order.includes(view.me);
  let avatar: string | null = null;
  let label: string = STAGE_NAME[g.stage];
  let main = '';
  if (g.stage === 'theme') {
    avatar = player(g.chooser)?.avatar ?? null;
    label = 'La question';
    main = g.chooser === view.me ? 'À toi de la choisir' : `${capital(name(g.chooser))} la choisit`;
  } else if (g.stage === 'write') main = !seated ? 'Les histoires s’écrivent' : g.myDone ? 'On attend les autres' : 'Écris ton histoire';
  else if (g.stage === 'read') {
    const reader = g.readers[g.reading];
    avatar = player(reader)?.avatar ?? null;
    label = `Histoire ${g.stories[g.reading]?.letter ?? ''}`;
    main = reader === view.me ? 'À toi de la lire' : `${capital(name(reader))} la lit`;
  } else if (g.stage === 'vote') main = !seated ? 'La table vote' : g.myVote ? 'Tu peux changer d’avis' : 'Laquelle est fausse ?';
  else if (g.stage === 'guess') main = !seated ? 'La table devine' : g.myLocked ? 'C’est validé' : 'Signe chaque serviette';
  else main = g.result?.canceled ? 'Manche annulée' : 'Les signatures';
  return (
    <section className={cls('status-band', `is-${g.stage}`)}>
      {avatar && <Avatar avatar={avatar} className="band-avatar" />}
      <div className="band-text">
        <span className="band-label">{label}</span>
        <b className="band-main">{main}</b>
      </div>
      {left !== null && (
        <span className={cls('band-clock', left <= 10 && 'is-low')} aria-label={`${left} secondes`}>
          {clock(left)}
        </span>
      )}
      <TimeBar endsAt={g.endsAt} total={g.stageMs} className="band-time" />
    </section>
  );
}

/** La question de la manche, à la craie. */
function Question({ g, small }: { g: GameView; small?: boolean }) {
  if (!g.question) return null;
  return <Chalkboard className={cls(small && 'is-small')} eyebrow={`Manche ${g.round}`} title={`${g.question.text}…`} hint={small ? undefined : g.question.hint} />;
}

// ───────────────────────────── La question ─────────────────────────────

function Theme({ view }: { view: RoomView }) {
  const g = view.game!;
  const { name } = useNames(view);
  const mine = g.chooser === view.me;
  const [busy, setBusy] = useState(false);
  const pick = async (index: number) => {
    if (!mine || busy) return;
    setBusy(true);
    sfx.tap();
    await send('game:choose', { index });
    setBusy(false);
  };
  return (
    <div className="stage theme">
      <section className="choices">
        <span className="eyebrow">{mine ? 'Choisis la question de la manche' : `Les questions proposées à ${name(g.chooser)}`}</span>
        <ol className="choice-list">
          {(g.choices ?? []).map((q, i) => (
            <motion.li key={q.id} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.08 }}>
              <button type="button" className={cls('choice', q.spicy && 'is-spicy')} disabled={!mine || busy} onClick={() => void pick(i)}>
                <b className="choice-text">{q.text}…</b>
                <small className="choice-hint">{q.hint}</small>
                {q.spicy && <span className="choice-spice">Piquante</span>}
              </button>
            </motion.li>
          ))}
        </ol>
        {mine && g.redrawsLeft > 0 && (
          <button type="button" className="link redraw-link" {...noMouseFocus} onClick={() => (sfx.paper(), void send('game:choose', { redraw: true }))}>
            <RefreshCw size={14} aria-hidden /> Trois autres questions
          </button>
        )}
      </section>
      <Tip>{mine ? 'Choisis une question où chacun aura un souvenir à raconter. Personne ne sait encore qui sera le Mytho, pas même toi.' : 'Dès que la question est choisie, un Mytho est tiré au sort en secret. Ce sera peut-être toi.'}</Tip>
      <Scores view={view} title="L’ardoise des scores" />
    </div>
  );
}

// ───────────────────────────── L'écriture ─────────────────────────────

/** Le rôle, caché derrière une serviette pliée : on la déplie d'un geste, à l'abri des regards. */
function RoleCard({ g, open, onToggle }: { g: GameView; open: boolean; onToggle: () => void }) {
  if (!open)
    return (
      <button type="button" className="role-card is-closed" onClick={onToggle}>
        <span className="role-fold" aria-hidden />
        <b>Touche pour voir ton rôle</b>
        <small>Cache bien ton écran.</small>
      </button>
    );
  return (
    <motion.section className={cls('role-card is-open', g.mytho ? 'is-mytho' : 'is-true')} initial={{ rotateX: -70, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 20 }}>
      <span className="role-emoji" aria-hidden>
        {g.mytho ? '🤥' : '🤞'}
      </span>
      <div className="role-text">
        <b className="role-title">{g.mytho ? 'Tu es le Mytho' : 'Tu dis la vérité'}</b>
        <span>{g.mytho ? 'Invente une histoire qui pourrait t’arriver, avec un détail précis. Évite le trop spectaculaire.' : 'Raconte une vraie anecdote, avec un détail précis. Quelqu’un, à cette table, invente la sienne.'}</span>
      </div>
      <button type="button" className="link role-hide" onClick={onToggle}>
        <EyeOff size={14} aria-hidden /> Cacher
      </button>
    </motion.section>
  );
}

function Composer({ g }: { g: GameView }) {
  const [text, setText] = useState(g.myText);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef(0);
  const sent = useRef(g.myText);
  // Le brouillon part en douce vers le serveur : si le temps finit, il compte quand même.
  useEffect(() => {
    if (g.myDone || text === sent.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      sent.current = text;
      void call('game:draft', { text });
    }, 700);
    return () => window.clearTimeout(timer.current);
  }, [text, g.myDone]);
  useEffect(() => {
    if (!g.myDone) window.setTimeout(() => area.current?.focus({ preventScroll: true }), 60);
  }, [g.myDone]);
  const len = text.trim().length;
  const short = MIN_STORY - len;
  const submit = async () => {
    if (busy || short > 0) return;
    setBusy(true);
    window.clearTimeout(timer.current);
    sent.current = text;
    if (await send('game:write', { text })) {
      sfx.pen();
      vibrate(15);
    }
    setBusy(false);
  };
  if (g.myDone)
    return (
      <section className="composer is-done">
        <Napkin text={g.myText} className="my-napkin" tilt={-1}>
          <span className="napkin-stamp">
            <Check size={14} aria-hidden /> Rendue
          </span>
        </Napkin>
        <Button variant="ghost" icon={<Pencil size={16} />} onClick={() => void send('game:write', { done: false })}>
          Modifier mon histoire
        </Button>
      </section>
    );
  return (
    <section className="composer">
      <label className="napkin napkin-field">
        <span className="napkin-emboss" aria-hidden />
        <span className="sr-only">Ton histoire</span>
        <textarea
          ref={area}
          className="napkin-input"
          value={text}
          maxLength={MAX_STORY}
          rows={4}
          placeholder="Ton histoire, en une ou deux phrases…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit();
          }}
        />
        <span className={cls('napkin-count', short > 0 && 'is-short', MAX_STORY - text.length < 30 && 'is-near')} aria-live="polite">
          {short > 0 ? `encore ${short} signe${short > 1 ? 's' : ''}` : MAX_STORY - text.length < 30 ? `${MAX_STORY - text.length} signes restants` : ''}
        </span>
      </label>
      <div className="actionbar">
        <Button variant="primary" className="btn-lg btn-wide" icon={<Send size={18} />} disabled={short > 0 || busy} onClick={() => void submit()}>
          C’est écrit
        </Button>
      </div>
    </section>
  );
}

function Write({ view }: { view: RoomView }) {
  const g = view.game!;
  const seated = g.order.includes(view.me);
  const [open, setOpen] = useState(false);
  // Une fois le rôle vu, la serviette d'écriture reste là, même si on replie le rôle.
  const [seen, setSeen] = useState(g.myDone || g.myText.length > 0);
  const toggle = () => {
    if (!open) {
      // Le même son et la même vibration pour tout le monde : à une vraie table, l'oreille du voisin écoute.
      sfx.secret();
      vibrate(20);
      setSeen(true);
    }
    setOpen(!open);
  };
  return (
    <div className="stage write">
      <Question g={g} />
      {seated ? (
        <>
          <RoleCard g={g} open={open} onToggle={toggle} />
          {seen ? <Composer g={g} /> : <p className="small muted center">Ton rôle s’affiche une fois la serviette dépliée. Puis tu écris.</p>}
          {/* Le même conseil pour tous les rôles : l'écran du voisin ne doit rien trahir. */}
          <Tip>Une ou deux phrases, avec un détail concret (un lieu, un objet, une heure). Pas de prénom qui te trahirait&nbsp;: c’est aux autres de deviner qui a écrit quoi.</Tip>
        </>
      ) : (
        <p className="panel center spectator-wait">
          <Eye size={16} aria-hidden /> Tu regardes la partie&nbsp;: les histoires s’écrivent en secret.
        </p>
      )}
      <section className="waiting-for">
        <span className="eyebrow">Ont rendu leur histoire</span>
        <Seats view={view} ids={g.order} done={g.writers} label="Ont rendu leur histoire" />
      </section>
    </div>
  );
}

// ───────────────────────────── La lecture ─────────────────────────────

function Read({ view }: { view: RoomView }) {
  const g = view.game!;
  const { name } = useNames(view);
  const isHost = view.hostId === view.me;
  const story = g.stories[g.reading];
  const reader = g.readers[g.reading];
  const mine = reader === view.me;
  const [busy, setBusy] = useState(false);
  const done = async () => {
    if (busy) return;
    setBusy(true);
    sfx.paper();
    await send('game:read', { index: g.reading });
    setBusy(false);
  };
  return (
    <div className="stage read">
      <Question g={g} small />
      <AnimatePresence mode="wait">
        {story && (
          <motion.div key={story.letter} className="read-focus" initial={{ y: 30, opacity: 0, rotate: 4 }} animate={{ y: 0, opacity: 1, rotate: 0 }} exit={{ x: -60, opacity: 0, rotate: -6 }} transition={{ type: 'spring', stiffness: 200, damping: 22 }}>
            <Napkin letter={story.letter} text={story.text ?? ''} className="napkin-big" tilt={tiltOf(story.letter)} />
            <p className="read-who">
              {mine ? (
                <>
                  <b>Lis-la à voix haute</b>, sans rien trahir&nbsp;: même si c’est la tienne.
                </>
              ) : (
                <>
                  {capital(name(reader))} lit l’histoire <b>{story.letter}</b>. Écoute bien.
                </>
              )}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {(mine || isHost) && (
        <div className="actionbar">
          <Button variant={mine ? 'primary' : 'default'} className="btn-lg btn-wide" icon={<Check size={18} />} disabled={busy} onClick={() => void done()}>
            {mine ? 'C’est lu' : `C’est lu (pour ${name(reader)})`}
          </Button>
        </div>
      )}
      <StoryGrid g={g} view={view} dim />
      <Tip>Chaque histoire est lue par quelqu’un de la table, tiré au sort. Ensuite, on débat et on vote.</Tip>
    </div>
  );
}

/** Toutes les serviettes posées sur le comptoir ; celles pas encore lues restent pliées. */
function StoryGrid({ view, g, dim, render }: { view: RoomView; g: GameView; dim?: boolean; render?: (s: StoryView, i: number) => ReactNode }) {
  return (
    <ol className={cls('napkin-grid', dim && 'is-dim')} aria-label="Les histoires">
      {g.stories.map((s, i) => (
        <li key={s.letter}>
          {render ? (
            render(s, i)
          ) : s.text === null ? (
            <span className="napkin-folded" aria-label={`Histoire ${s.letter}, pas encore lue`}>
              {s.letter}
            </span>
          ) : (
            <Napkin letter={s.letter} text={s.text} tilt={tiltOf(s.letter)} className={cls(g.reading === i && 'is-current', s.letter === g.myLetter && 'is-mine')} />
          )}
        </li>
      ))}
    </ol>
  );
}

// ───────────────────────────── Le fil écrit ─────────────────────────────

function Chat({ view }: { view: RoomView }) {
  const g = view.game!;
  const { name, player } = useNames(view);
  const seated = g.order.includes(view.me);
  const [draft, setDraft] = useState('');
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [g.lines.length]);
  const submit = async () => {
    const t = draft.trim();
    if (!t) return;
    if (await send('game:say', { text: t })) setDraft('');
  };
  return (
    <section className="panel chat" aria-label="Le débat écrit">
      <span className="eyebrow">Le débat</span>
      {g.lines.length ? (
        <ol ref={list} className="chat-lines">
          <AnimatePresence initial={false}>
            {g.lines.map((l) => (
              <motion.li key={l.n} className={cls(l.by === view.me && 'is-me')} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Avatar avatar={player(l.by)?.avatar ?? 'cafe'} className="chat-avatar" />
                <span>
                  <b>{l.by === view.me ? 'Toi' : capital(name(l.by))}</b> {l.text}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      ) : (
        <p className="feed-empty">Posez vos questions ici&nbsp;: «&nbsp;C’était où, la B&nbsp;?&nbsp;»</p>
      )}
      {seated && (
        <form
          className="chatbox"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input className="input" value={draft} maxLength={MAX_LINE} placeholder="Ta question, ton soupçon…" aria-label="Ton message" onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="icon-btn send-btn" aria-label="Envoyer" disabled={!draft.trim()}>
            <Send size={18} />
          </button>
        </form>
      )}
    </section>
  );
}

// ───────────────────────────── Le vote ─────────────────────────────

function Vote({ view }: { view: RoomView }) {
  const g = view.game!;
  const seated = g.order.includes(view.me);
  const written = view.settings.talk === 'ecrit';
  const [busy, setBusy] = useState(false);
  const vote = async (letter: string) => {
    if (busy || letter === g.myLetter || letter === g.myVote) return;
    setBusy(true);
    if (await send('game:vote', { letter })) {
      sfx.glass();
      vibrate(15);
    }
    setBusy(false);
  };
  return (
    <div className="stage vote">
      <Question g={g} small />
      {seated && (
        <p className="vote-ask">
          {g.myVote ? (
            <>
              Ton vote&nbsp;: <b>l’histoire {g.myVote}</b>. Touche une autre serviette pour changer d’avis.
            </>
          ) : (
            <>
              Débattez, puis <b>touche la serviette</b> qui sent le mensonge.
            </>
          )}
        </p>
      )}
      <StoryGrid
        view={view}
        g={g}
        render={(s) => {
          const own = s.letter === g.myLetter;
          const picked = s.letter === g.myVote;
          return (
            <Napkin
              letter={s.letter}
              text={s.text ?? ''}
              tilt={tiltOf(s.letter)}
              className={cls(own && 'is-mine')}
              onClick={seated && !own ? () => void vote(s.letter) : undefined}
              pressed={picked}
              label={own ? `Histoire ${s.letter}, la tienne` : `Histoire ${s.letter}${picked ? ', ton vote' : ''} : ${s.text ?? ''}`}
            >
              {own && <span className="napkin-tag">La tienne</span>}
              {picked && (
                <motion.span className="napkin-vote" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: -8 }} transition={{ type: 'spring', stiffness: 380, damping: 16 }}>
                  <Hand size={14} aria-hidden /> Fausse&nbsp;?
                </motion.span>
              )}
            </Napkin>
          );
        }}
      />
      {written && <Chat view={view} />}
      <Tip>
        {written ? 'Interrogez-vous dans le fil' : 'Posez des questions à voix haute'}&nbsp;: «&nbsp;C’était quand&nbsp;?&nbsp;», «&nbsp;Avec qui&nbsp;?&nbsp;». Le Mytho doit improviser. Et si c’est toi, vote pour une histoire vraie qui te paraît louche&nbsp;: chaque voix trompée te rapporte un point.
      </Tip>
      <section className="waiting-for">
        <span className="eyebrow">Ont voté</span>
        <Seats view={view} ids={g.order} done={g.voters} label="Ont voté" />
      </section>
      <Emotes disabled={!seated} />
    </div>
  );
}

// ───────────────────────────── Qui a écrit quoi ─────────────────────────────

/** Les votes posés sur une serviette : les avatars de ceux qui l'ont crue fausse. */
function VoteChips({ view, votes, letter }: { view: RoomView; votes: Record<string, string> | null; letter: string }) {
  const { player } = useNames(view);
  const by = Object.entries(votes ?? {})
    .filter(([, l]) => l === letter)
    .map(([id]) => id);
  if (!by.length) return null;
  return (
    <span className="vote-chips" aria-label={`${by.length} vote${by.length > 1 ? 's' : ''}`}>
      {by.map((id) => (
        <Avatar key={id} avatar={player(id)?.avatar ?? 'cafe'} className="vote-chip" />
      ))}
    </span>
  );
}

function NamePicker({ view, letter, onClose }: { view: RoomView; letter: string | null; onClose: () => void }) {
  const g = view.game!;
  const { player } = useNames(view);
  const pool = g.authors.filter((id) => id !== view.me);
  const current = letter ? g.myGuess[letter] : undefined;
  const fake = letter === g.fake;
  const pick = (target: string | null) => {
    if (!letter) return;
    onClose();
    sfx.pen();
    void send('game:assign', { letter, target });
  };
  return (
    <Modal open={!!letter} onClose={onClose} title={fake ? `La ${letter}, c’est le Mytho. Qui ?` : `Qui a écrit la ${letter} ?`} className="sheet">
      <ul className="name-list">
        {pool.map((id) => {
          const p = player(id);
          const elsewhere = Object.entries(g.myGuess).find(([l, who]) => who === id && l !== letter)?.[0];
          return (
            <li key={id}>
              <button type="button" className={cls('name-opt', current === id && 'is-on')} onClick={() => pick(id)}>
                <Avatar avatar={p?.avatar ?? 'cafe'} className="name-avatar" />
                <span className="name-label">{p?.name ?? '?'}</span>
                {elsewhere && <small className="name-where">déjà sur la {elsewhere}</small>}
                {current === id && <Check size={18} aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
      {current && (
        <Button variant="ghost" icon={<X size={16} />} onClick={() => pick(null)}>
          Effacer ce nom
        </Button>
      )}
    </Modal>
  );
}

function Guess({ view }: { view: RoomView }) {
  const g = view.game!;
  const { player } = useNames(view);
  const seated = g.order.includes(view.me);
  const written = view.settings.talk === 'ecrit';
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scribbled = useRef(false);
  useEffect(() => {
    if (scribbled.current) return;
    scribbled.current = true;
    window.setTimeout(() => sfx.marker(), 500);
  }, []);
  const others = g.stories.filter((s) => s.letter !== g.myLetter);
  const filled = others.filter((s) => g.myGuess[s.letter]).length;
  const lock = async (on: boolean) => {
    if (busy) return;
    setBusy(true);
    if (await send('game:lock', { on })) {
      if (on) sfx.pen();
    }
    setBusy(false);
  };
  const myVoteRight = g.myVote && g.myVote === g.fake;
  return (
    <div className="stage guess">
      <Question g={g} small />
      <p className="guess-head">
        La fausse histoire était la <b>{g.fake}</b>.{' '}
        {seated && g.myVote && (myVoteRight ? <span className="ok">Bien vu&nbsp;!</span> : <span className="ko">Tu disais la {g.myVote}.</span>)}
      </p>
      <StoryGrid
        view={view}
        g={g}
        render={(s) => {
          const own = s.letter === g.myLetter;
          const fake = s.letter === g.fake;
          const guess = g.myGuess[s.letter];
          const p = player(guess);
          return (
            <Napkin letter={s.letter} text={s.text ?? ''} tilt={tiltOf(s.letter)} className={cls(own && 'is-mine', fake && 'is-fake')}>
              {fake && <MarkerScribble delay={0.3} />}
              <VoteChips view={view} votes={g.votes} letter={s.letter} />
              {own ? (
                <span className="napkin-tag">La tienne</span>
              ) : seated ? (
                <button type="button" className={cls('sign-slot', guess && 'is-filled', fake && 'is-fake')} disabled={g.myLocked} onClick={() => setSlot(s.letter)} aria-label={`${fake ? 'Qui est le Mytho' : `Qui a écrit la ${s.letter}`} ? ${p ? p.name : 'personne pour l’instant'}`}>
                  {p ? (
                    <>
                      <Avatar avatar={p.avatar} className="slot-avatar" />
                      <span className={cls('slot-name', p.name.length > 11 && 'is-long')}>{p.name}</span>
                    </>
                  ) : (
                    <>
                      <UserRound size={15} aria-hidden /> {fake ? 'Le Mytho ?' : 'Qui ?'}
                    </>
                  )}
                </button>
              ) : null}
            </Napkin>
          );
        }}
      />
      {written && <Chat view={view} />}
      <Tip>Chaque nom bien placé rapporte un point, y compris celui du Mytho sur la fausse. Un nom posé ailleurs quitte sa première serviette.</Tip>
      {seated && (
        <div className="actionbar">
          {g.myLocked ? (
            <Button className="btn-lg btn-wide" icon={<Undo2 size={18} />} disabled={busy} onClick={() => void lock(false)}>
              Modifier mes réponses
            </Button>
          ) : (
            <Button variant="primary" className="btn-lg btn-wide" icon={<Check size={18} />} disabled={busy} onClick={() => void lock(true)}>
              {filled < others.length ? 'Valider (il reste des serviettes)' : 'Valider mes réponses'}
            </Button>
          )}
        </div>
      )}
      <section className="waiting-for">
        <span className="eyebrow">Ont validé</span>
        <Seats view={view} ids={g.order} done={g.lockers} label="Ont validé" />
      </section>
      <NamePicker view={view} letter={slot} onClose={() => setSlot(null)} />
    </div>
  );
}

// ───────────────────────────── Le dévoilement ─────────────────────────────

const SIGN_GAP = 0.55;

function Reveal({ view }: { view: RoomView }) {
  const g = view.game!;
  const r = g.result!;
  const { name, player } = useNames(view);
  const isHost = view.hostId === view.me;
  const last = g.round >= g.rounds;
  const canNext = isHost || g.nextChooser === view.me;
  const seated = g.order.includes(view.me);
  // Les signatures, la fausse en dernier.
  const order = useMemo(() => {
    const truths = r.stories.filter((s) => s.letter !== r.fake);
    const fake = r.stories.filter((s) => s.letter === r.fake);
    return [...truths, ...fake].map((s) => s.letter);
  }, [r]);
  const scoreAt = 0.6 + order.length * SIGN_GAP + 0.5;
  const [scored, setScored] = useState(false);
  useEffect(() => {
    if (r.canceled) {
      setScored(true);
      return;
    }
    const ts = order.map((_, i) => window.setTimeout(() => (i === order.length - 1 ? sfx.marker() : sfx.sign(i)), (0.6 + i * SIGN_GAP) * 1000));
    ts.push(
      window.setTimeout(() => {
        setScored(true);
        if ((r.delta[view.me] ?? 0) > 0) sfx.coin(0);
      }, scoreAt * 1000),
    );
    return () => ts.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.round]);
  const myGuess = r.guesses[view.me] ?? {};
  const mine = reasons(r, view.me);
  const mytho = player(r.mytho);
  return (
    <div className="stage reveal">
      <Question g={g} small />
      {r.canceled ? (
        <p className="panel center">{canceledLine(r)}</p>
      ) : (
        <>
          <p className="reveal-head">
            {r.mytho === view.me ? (
              <>
                Tu étais le Mytho. {r.detail[view.me]?.fooled ? `Tu as trompé ${plural(r.detail[view.me].fooled, 'voix', 'voix')}.` : 'Personne ne s’est laissé prendre…'}
              </>
            ) : (
              <>Les auteurs signent leur serviette…</>
            )}
          </p>
          <ol className="napkin-grid">
            {r.stories.map((s) => {
              const i = order.indexOf(s.letter);
              const delay = 0.6 + i * SIGN_GAP;
              const fake = s.letter === r.fake;
              const guessed = myGuess[s.letter];
              const right = guessed === s.author;
              return (
                <li key={s.letter}>
                  <Napkin letter={s.letter} text={s.text} tilt={tiltOf(s.letter)} className={cls(fake && 'is-fake', s.author === view.me && 'is-mine')}>
                    {fake && <MarkerScribble delay={0} />}
                    <VoteChips view={view} votes={r.votes} letter={s.letter} />
                    <Signature name={s.author === view.me ? 'toi' : (player(s.author)?.name ?? '?')} delay={delay} tone={fake ? 'red' : 'blue'} className="napkin-signature" />
                    {seated && s.author !== view.me && (
                      <motion.span className={cls('guess-mark', guessed ? (right ? 'is-right' : 'is-wrong') : 'is-empty')} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: delay + 0.35 }}>
                        {guessed ? (right ? <Check size={13} strokeWidth={3} aria-label="bien deviné" /> : `tu disais ${name(guessed, false)}`) : 'pas de nom'}
                      </motion.span>
                    )}
                  </Napkin>
                </li>
              );
            })}
          </ol>
          <AnimatePresence>
            {scored && (
              <motion.section className="round-bill" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                <p className="bill-mytho">
                  <Avatar avatar={mytho?.avatar ?? 'menteur'} className="bill-avatar" /> Le Mytho&nbsp;: <b>{r.mytho === view.me ? 'toi' : (mytho?.name ?? '?')}</b>
                </p>
                {seated && (
                  <ul className="bill-lines" aria-label="Ta manche">
                    {mine.map((l) => (
                      <li key={l.text}>
                        <span>{l.text}</span>
                        <b>{signed(l.pts)}</b>
                      </li>
                    ))}
                    <li className="bill-total">
                      <span>Ta manche</span>
                      <b>{signed(r.delta[view.me] ?? 0)}</b>
                    </li>
                  </ul>
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </>
      )}
      {scored && <Scores view={view} title="L’ardoise des scores" delta={r.delta} />}
      <div className="actionbar">
        {canNext ? (
          <Button variant="primary" className="btn-lg btn-wide" icon={<FastForward size={18} />} onClick={() => void send('game:next', { seq: g.seq })}>
            {last ? 'Voir l’addition' : g.nextChooser === view.me ? 'Manche suivante (tu choisis)' : 'Manche suivante'}
          </Button>
        ) : (
          <p className="waiting" role="status">
            <span className="spinner" /> {last ? 'L’addition arrive…' : `${capital(name(g.nextChooser))} lancera la manche suivante.`}
          </p>
        )}
      </div>
      <Emotes disabled={!seated} />
    </div>
  );
}

// ───────────────────────────── L'écran de partie ─────────────────────────────

/** Les sons des grands moments : la clochette quand on écrit, le temps écoulé. */
function useStageSounds(g: GameView) {
  const prev = useRef(`${g.round}:${g.stage}`);
  useEffect(() => {
    const key = `${g.round}:${g.stage}`;
    if (key === prev.current) return;
    prev.current = key;
    if (g.stage === 'write') {
      sfx.bell();
      vibrate([30, 50, 30]);
    }
    if (g.stage === 'vote' || g.stage === 'reveal') sfx.time();
  }, [g.round, g.stage]);
}

export function Table({ view }: { view: RoomView }) {
  const g = view.game!;
  const { name } = useNames(view);
  const [menu, setMenu] = useState(false);
  useStageSounds(g);
  const chooserAway = g.stage === 'theme' && g.chooser !== view.me && view.players.find((p) => p.id === g.chooser)?.autopilot;
  return (
    <Scene mood="zinc" className="table-screen">
      <TopBar view={view} onMenu={() => setMenu(true)} />
      <StatusBand view={view} />
      {chooserAway && (
        <p className="away-band" role="status">
          {capital(name(g.chooser))} a perdu la connexion&nbsp;: la première question sera prise d’office.
        </p>
      )}
      <main className="table-main">
        <AnimatePresence mode="wait">
          <motion.div key={`${g.round}:${g.stage}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            {g.stage === 'theme' && <Theme view={view} />}
            {g.stage === 'write' && <Write view={view} />}
            {g.stage === 'read' && <Read view={view} />}
            {g.stage === 'vote' && <Vote view={view} />}
            {g.stage === 'guess' && <Guess view={view} />}
            {g.stage === 'reveal' && g.result && <Reveal view={view} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <EmoteStream view={view} />
      <GameMenu view={view} open={menu} onClose={() => setMenu(false)} />
      {!g.order.includes(view.me) && (
        <p className="spectator-note">
          <Eye size={14} aria-hidden /> Tu regardes la partie en spectateur&nbsp;: le Mytho reste secret.
        </p>
      )}
    </Scene>
  );
}
