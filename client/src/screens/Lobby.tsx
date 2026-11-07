// Salon : inviter (code, lien, QR), les joueurs, le déroulé de la partie, le barème et les réglages : histoires lues à
// voix haute ou sur l'écran, temps d'écriture et de débat, nombre de manches, questions douces ou piquantes, conseils.
import { motion } from 'framer-motion';
import { BookOpen, Check, Copy, Crown, GraduationCap, LogOut, Play, QrCode, Share2, Trophy, UserX } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { DEBATE_TIMERS, MAX_PLAYERS, MIN_PLAYERS, ROUNDS, WRITE_TIMERS, type DebateSetting, type PlayerView, type RoomView, type RoundsSetting, type Settings, type Spice, type Talk, type WriteSetting } from '../../../shared/protocol';
import { POINTS } from '../../../shared/rules';
import { Avatar, Button, Logo, Modal, Pill, Scene, Segmented, Toggle } from '../components/Ui';
import { DEBATE_LABEL, DEBATE_SUB, WRITE_LABEL, WRITE_SUB, signed } from '../lib/text';
import { cls, shareUrl } from '../lib/util';
import { leaveRoom, send } from '../net';
import { useStore } from '../store';

function PlayerRow({ view, p, i, isHost }: { view: RoomView; p: PlayerView; i: number; isHost: boolean }) {
  return (
    <motion.li className={cls('player-row', p.id === view.me && 'is-me')} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.03 }}>
      <Avatar avatar={p.avatar} className="player-avatar" />
      <span className="player-name">
        {p.name}
        {p.id === view.me && <span className="muted"> (toi)</span>}
      </span>
      <span className="player-tags">
        {p.wins > 0 && (
          <Pill tone="brass">
            <Trophy size={12} aria-hidden /> {p.wins}
          </Pill>
        )}
        {p.isHost && (
          <Pill tone="ink">
            <Crown size={12} aria-hidden /> Hôte
          </Pill>
        )}
        {!p.connected && <Pill>Hors ligne</Pill>}
      </span>
      {isHost && p.id !== view.me && (
        <button type="button" className="icon-btn" aria-label={`Retirer ${p.name}`} onClick={() => void send('room:kick', { playerId: p.id })}>
          <UserX size={18} />
        </button>
      )}
    </motion.li>
  );
}

/** Le barème, écrit à la craie sur l'ardoise du bar. */
export function Scale() {
  return (
    <ul className="scale">
      <li>
        <b>{signed(POINTS.found)}</b>
        <span>
          <em>Trouver la fausse histoire</em> à chaque joueur qui la désigne
        </span>
      </li>
      <li>
        <b>{signed(POINTS.fooled)}</b>
        <span>
          <em>au Mytho</em> par voix trompée
        </span>
      </li>
      <li>
        <b>{signed(POINTS.accused)}</b>
        <span>
          <em>à l’auteur d’une histoire vraie</em> par voix qui la croit fausse
        </span>
      </li>
      <li>
        <b>{signed(POINTS.author)}</b>
        <span>
          <em>par auteur deviné</em> le Mytho compris
        </span>
      </li>
    </ul>
  );
}

/** Une estimation de la durée : le choix, l'écriture, la lecture, le débat, les devinettes et le dévoilement. */
function minutesFor(s: Settings, n: number): number {
  const players = Math.max(n, MIN_PLAYERS);
  const round = 30 + (s.write || 180) + (s.talk === 'oral' ? players * 20 : 0) + (s.debate || 120) + 40 + 10 * players + 30;
  return Math.max(10, Math.round((round * s.rounds) / 60 / 5) * 5);
}

export function Lobby({ view }: { view: RoomView }) {
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const setTutorialOpen = useStore((s) => s.setTutorialOpen);
  const isHost = view.hostId === view.me;
  const seated = view.players.filter((p) => p.status !== 'spectator');
  const spectators = view.players.filter((p) => p.status === 'spectator');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const url = shareUrl(view.code);
  const host = view.players.find((p) => p.id === view.hostId);
  const s = view.settings;
  const n = seated.length;
  const blocked = n < MIN_PLAYERS ? `Il faut au moins ${MIN_PLAYERS} joueurs` : null;

  const set = (patch: Partial<Settings>) => void send('room:settings', patch as Record<string, unknown>);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      useStore.getState().showToast(`Lien : ${url}`, 'info');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Mytho', text: `Viens jouer à Mytho avec moi (table ${view.code}) !`, url });
      } catch {
        /* partage annulé */
      }
    } else void copy();
  };

  return (
    <Scene mood="zinc" className="lobby-screen">
      <div className="lobby">
        <header className="topbar lobby-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <motion.section className="code-panel" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <span className="eyebrow">Code de la table</span>
          <div className="big-code" aria-label={`Code ${view.code.split('').join(' ')}`}>
            {view.code.split('').map((c, i) => (
              <motion.span key={i} initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.07, type: 'spring', stiffness: 240, damping: 16 }}>
                {c}
              </motion.span>
            ))}
          </div>
          <div className="share-row">
            <Button variant="primary" icon={<Share2 size={18} />} onClick={share}>
              Inviter
            </Button>
            <Button icon={copied ? <Check size={18} /> : <Copy size={18} />} onClick={copy} title="Copier le lien de la table">
              {copied ? 'Copié !' : 'Copier le lien'}
            </Button>
          </div>
          <button type="button" className="icon-btn qr-btn" onClick={() => setQr(true)} aria-label="Afficher le QR code" title="QR code">
            <QrCode size={20} aria-hidden />
          </button>
        </motion.section>

        <div className="lobby-grid">
          <section className="panel">
            <div className="panel-head">
              <h3>
                Les habitués <span className="muted">{n}/{MAX_PLAYERS}</span>
              </h3>
            </div>
            <ul className="player-list">
              {seated.map((p, i) => (
                <PlayerRow key={p.id} view={view} p={p} i={i} isHost={isHost} />
              ))}
              {Array.from({ length: Math.max(0, MIN_PLAYERS - n) }, (_, i) => (
                <li key={`empty${i}`} className="player-row is-empty">
                  <span className="player-ghost">?</span>
                  <span className="player-name muted">Une chaise libre…</span>
                </li>
              ))}
            </ul>
            {spectators.length > 0 && <p className="muted small">Spectateurs&nbsp;: {spectators.map((p) => p.name).join(', ')}</p>}
            <p className="muted small lobby-note">De 4 à 10 joueurs, autour d’une table ou en vocal (Discord, visio). L’appli garde les secrets, mélange les histoires et compte les points.</p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>La partie</h3>
            </div>
            <p className="small">
              {s.rounds} manches. À chaque manche, une question perso, et un Mytho tiré au sort en secret&nbsp;: tout le monde écrit une histoire vraie, sauf le Mytho, qui invente la sienne. Environ {minutesFor(s, n)} minutes{n < MIN_PLAYERS ? ' à 4' : ''}.
            </p>
            <Scale />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Réglages</h3>
            </div>
            <span className="field-label">Les histoires</span>
            <Segmented<Talk>
              label="Les histoires"
              value={s.talk}
              disabled={!isHost}
              onChange={(talk) => set({ talk })}
              options={[
                { value: 'oral', label: 'Lues à voix haute', sub: 'à table ou en vocal' },
                { value: 'ecrit', label: 'Sur l’écran', sub: 'débat écrit dans l’appli' },
              ]}
            />
            <span className="field-label">Temps pour écrire</span>
            <Segmented<WriteSetting> label="Temps pour écrire" value={s.write} disabled={!isHost} onChange={(write) => set({ write })} options={WRITE_TIMERS.map((t) => ({ value: t, label: WRITE_LABEL[t], sub: WRITE_SUB[t] }))} />
            <span className="field-label">Le débat</span>
            <Segmented<DebateSetting> label="Le débat" value={s.debate} disabled={!isHost} onChange={(debate) => set({ debate })} options={DEBATE_TIMERS.map((t) => ({ value: t, label: DEBATE_LABEL[t], sub: DEBATE_SUB[t] }))} />
            <span className="field-label">Manches</span>
            <Segmented<RoundsSetting> label="Manches" value={s.rounds} disabled={!isHost} onChange={(rounds) => set({ rounds })} options={ROUNDS.map((r) => ({ value: r, label: `${r} manches`, sub: r === 3 ? 'apéro' : r === 5 ? 'conseillé' : 'longue soirée' }))} />
            <span className="field-label">Les questions</span>
            <Segmented<Spice>
              label="Les questions"
              value={s.spice}
              disabled={!isHost}
              onChange={(spice) => set({ spice })}
              options={[
                { value: 'douces', label: 'Douces', sub: 'pour toutes les tables' },
                { value: 'piquantes', label: 'Piquantes', sub: 'soirées, rencards, bêtises' },
              ]}
            />
            <Toggle on={s.tips} disabled={!isHost} onChange={(tips) => set({ tips })} label="Conseils pour débutants" sub="à chaque étape de la partie" />
          </section>
        </div>

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<Play size={20} />} disabled={!!blocked} onClick={() => void send('game:start')}>
              {blocked ?? `Lancer la partie (${n} joueurs)`}
            </Button>
          ) : (
            <div className="waiting" role="status">
              <span className="spinner" /> En attente que {host?.name ?? 'l’hôte'} lance la partie…
            </div>
          )}
          <div className="lobby-help">
            <Button variant="ghost" icon={<GraduationCap size={18} />} onClick={() => setTutorialOpen(true)}>
              Essayer une manche
            </Button>
            <Button variant="ghost" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
              Les règles
            </Button>
          </div>
        </div>

        <Modal open={qr} onClose={() => setQr(false)} title={`Table ${view.code}`}>
          <div className="qr-box">
            <QRCodeSVG value={url} size={220} bgColor="#fffaf0" fgColor="#3a0f13" level="M" includeMargin />
            <p className="muted small">Scanne pour rejoindre la table directement.</p>
            <code className="url-code">{url}</code>
          </div>
        </Modal>
      </div>
    </Scene>
  );
}
