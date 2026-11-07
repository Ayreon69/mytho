// Accueil : l'enseigne sur le mur du bistrot, l'ardoise et ses serviettes (dont une, chaque fois, finit entourée au
// marqueur rouge), la manche d'essai bien en vue, puis pseudo et avatar, créer ou rejoindre une table, et les règles.
// Pas de bots : il faut de vraies histoires.
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, GraduationCap, House, LogIn, MessageSquare, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATARS } from '../../../shared/protocol';
import { AVATAR_EMOJI, AVATAR_LABELS, Button, Logo, MarkerScribble, Napkin, Scene } from '../components/Ui';
import { cls, reducedMotion } from '../lib/util';
import { codeFromUrl, createRoom, joinRoom } from '../net';
import { useStore } from '../store';

/** Une question, trois serviettes, et la fausse. */
const HERO: { q: string; stories: string[]; fake: number }[] = [
  {
    q: 'Ta pire honte au restaurant',
    stories: ['J’ai appelé le serveur « papa » devant toute la table.', 'J’ai renversé un plat de moules sur ma voisine.', 'Le chef est sorti me demander de parler moins fort.'],
    fake: 2,
  },
  {
    q: 'Une rencontre improbable',
    stories: ['Ma prof de maths m’a servi un mojito à Ibiza.', 'J’ai pris l’ascenseur avec un ministre en peignoir.', 'Mon voisin de train était mon futur patron.'],
    fake: 1,
  },
  {
    q: 'Ton plus beau fou rire',
    stories: ['En plein oral du bac, devant tout le jury.', 'Coincé dans un ascenseur, pendant deux heures.', 'À un mariage, quand le marié a raté sa chaise.'],
    fake: 0,
  },
];

function Hero() {
  const still = reducedMotion();
  const [k, setK] = useState(0);
  useEffect(() => {
    if (still) return;
    const t = window.setInterval(() => setK((x) => (x + 1) % HERO.length), 5200);
    return () => window.clearInterval(t);
  }, [still]);
  const h = HERO[k];
  return (
    <div className="hero" aria-hidden>
      <div className="hero-board">
        <span className="chalk-eyebrow">La question du soir</span>
        <AnimatePresence mode="wait">
          <motion.span key={h.q} className="hero-q" initial={{ opacity: 0, filter: 'blur(3px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}>
            {h.q}…
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="hero-napkins">
        <AnimatePresence mode="wait">
          <motion.div key={k} className="hero-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.3 }}>
            {h.stories.map((s, i) => (
              <motion.div key={i} className={cls('hero-napkin', `hero-napkin-${i}`)} initial={{ y: 18, opacity: 0, rotate: 0 }} animate={{ y: 0, opacity: 1, rotate: [-4, 3, -2][i] }} transition={{ delay: 0.15 + i * 0.12, type: 'spring', stiffness: 220, damping: 20 }}>
                <Napkin letter={'ABC'[i]} text={s}>
                  {i === h.fake && <MarkerScribble delay={still ? 0 : 1.6} />}
                </Napkin>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function Home() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const setTutorialOpen = useStore((s) => s.setTutorialOpen);
  const conn = useStore((s) => s.conn);
  const [invited, setInvited] = useState(codeFromUrl);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setInvited(codeFromUrl());
    window.addEventListener('my:url', sync);
    return () => window.removeEventListener('my:url', sync);
  }, []);
  const nameOk = profile.name.trim().length > 0;

  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    if (!nameOk) {
      useStore.getState().showToast('Choisis d’abord un pseudo.', 'info');
      document.getElementById('pseudo')?.focus();
      return;
    }
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);

  return (
    <Scene mood="mur" className="home">
      <nav className="home-links">
        <a className="all-games" href="https://akhis-games.onrender.com">
          <House size={16} aria-hidden /> Tous les jeux
        </a>
        <a className="all-games" href="https://akhis-games.onrender.com/feedback.html?jeu=mytho">
          <MessageSquare size={16} aria-hidden /> Feedback
        </a>
      </nav>
      <header className="home-hero">
        <motion.div initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6 }}>
          <Logo size="lg" />
        </motion.div>
        <p className="tagline">
          Chacun raconte <b>une vraie anecdote</b>. Sauf le Mytho, qui invente la sienne… Trouvez la fausse, puis devinez qui a écrit quoi.
        </p>
        <Hero />
      </header>

      <motion.button type="button" className="learn-card" onClick={() => setTutorialOpen(true)} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1, duration: 0.45 }}>
        <span className="learn-icon">
          <GraduationCap size={26} aria-hidden />
        </span>
        <span className="learn-text">
          <b>Jamais joué&nbsp;? Essaie une manche</b>
          <small>Avec Léo, Inès et Sam&nbsp;: tu écris, tu votes, tu devines. Trois minutes.</small>
        </span>
      </motion.button>

      <motion.section className="panel home-panel" initial={{ y: 26, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.18, duration: 0.45 }}>
        {invited && (
          <div className="invite-banner">
            Invitation à la table <b>{invited}</b>&nbsp;: choisis ton pseudo et entre&nbsp;!
          </div>
        )}
        <label className="field-label" htmlFor="pseudo">
          Ton pseudo
        </label>
        <input
          id="pseudo"
          className="input input-lg"
          placeholder="Ex. Camille"
          value={profile.name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(e) => setProfile({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && invited) void run('join', () => joinRoom(invited));
          }}
        />
        <span className="field-label" id="avatar-label">
          Ton avatar
        </span>
        <div className="avatar-picker" role="radiogroup" aria-labelledby="avatar-label">
          {AVATARS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={profile.avatar === a} aria-label={AVATAR_LABELS[a]} className={cls('avatar-opt', profile.avatar === a && 'is-on')} onClick={() => setProfile({ avatar: a })}>
              {AVATAR_EMOJI[a]}
            </button>
          ))}
        </div>

        {invited ? (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<LogIn size={20} />} disabled={!!busy} onClick={() => run('join', () => joinRoom(invited))}>
              {busy === 'join' ? 'Connexion…' : `Rejoindre la table ${invited}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                window.history.replaceState(null, '', '/');
                setInvited(null);
              }}
            >
              Créer ma propre table à la place
            </Button>
          </div>
        ) : (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<Plus size={20} />} disabled={!!busy} onClick={() => run('create', () => createRoom())}>
              {busy === 'create' ? 'Création…' : 'Créer une table'}
            </Button>
            <div className="join-row">
              <input
                className="input code-input"
                placeholder="CODE"
                value={cleanCode}
                maxLength={4}
                aria-label="Code de la table"
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cleanCode.length === 4) void run('join', () => joinRoom(cleanCode));
                }}
              />
              <Button icon={<LogIn size={18} />} disabled={cleanCode.length !== 4 || !!busy} onClick={() => run('join', () => joinRoom(cleanCode))}>
                Rejoindre
              </Button>
            </div>
            <p className="small muted no-bots">Un jeu de vraies histoires&nbsp;: pas de bots, il faut au moins 4 personnes, autour d’une table ou en vocal.</p>
          </div>
        )}
        <Button variant="ghost" className="rules-link" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Les règles
        </Button>
        {conn !== 'online' && (
          <p className="wake-note" role="status">
            <span className="spinner" /> Réveil du serveur… (jusqu’à une minute la première fois)
          </p>
        )}
      </motion.section>

      <footer className="home-foot">De 4 à 10 joueurs, en 20 à 45 minutes. Une création maison d’Akhis Games.</footer>
    </Scene>
  );
}
