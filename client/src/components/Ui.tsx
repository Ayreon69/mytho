// Briques d'interface communes : boutons, fenêtres, pastilles, sélecteurs, le logo, le décor du bistrot (le mur
// lie-de-vin, le comptoir en zinc, l'addition), les avatars, l'ardoise, la serviette en papier, le coup de marqueur
// rouge du Mytho, la signature au stylo bille et la barre de temps.
import { X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { breakable, cls, useTick } from '../lib/util';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'soft';
  icon?: ReactNode;
}

export function Button({ variant = 'default', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, className)} {...rest}>
      {icon}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

/** Le titre, en lettres d'enseigne, souligné d'un coup de marqueur rouge. */
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={cls('logo', `logo-${size}`)} role="img" aria-label="Mytho">
      <span className="logo-text" aria-hidden>
        Mytho
      </span>
      <svg className="logo-swash" viewBox="0 0 120 16" aria-hidden preserveAspectRatio="none">
        <path d="M3 11c22-6 52-9 84-7 10 1 20 2 30 5" />
      </svg>
    </div>
  );
}

/** mur : le mur lie-de-vin du bistrot (accueil). zinc : le comptoir (salon, partie). addition : la note de fin. */
export type Mood = 'mur' | 'zinc' | 'addition';

export function Scene({ mood = 'zinc', children, className }: { mood?: Mood; children: ReactNode; className?: string }) {
  return (
    <div className={cls('scene', `mood-${mood}`, className)}>
      <div className="backdrop" aria-hidden>
        <div className="lamp" />
        <div className="grain" />
      </div>
      <div className="scene-body">{children}</div>
    </div>
  );
}

export function Pill({ tone, children, className }: { tone?: 'brass' | 'ink' | 'soft' | 'red' | 'blue' | 'green'; children: ReactNode; className?: string }) {
  return <span className={cls('pill', tone && `pill-${tone}`, className)}>{children}</span>;
}

interface SegmentedOption<T> {
  value: T;
  label: string;
  sub?: string;
  disabled?: boolean;
}

export function Segmented<T extends string | number | boolean>({ options, value, onChange, disabled, label }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled || o.disabled}
          className={cls('seg', o.value === value && 'is-on')}
          onClick={() => onChange(o.value)}
        >
          <b>{o.label}</b>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label, sub, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={cls('toggle', on && 'is-on')} disabled={disabled} onClick={() => onChange(!on)}>
      <span className="toggle-text">
        <b>{label}</b>
        {sub && <small>{sub}</small>}
      </span>
      <span className="toggle-track" aria-hidden>
        <span className="toggle-knob" />
      </span>
    </button>
  );
}

/** Les fenêtres ouvertes, de la plus ancienne à la plus récente : Échap ne ferme que celle du dessus. */
const openModals: object[] = [];

/** Une fenêtre, rendue à la racine du document pour ne dépendre d'aucun parent. */
export function Modal({ open, onClose, title, children, wide, footer, className }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const me = {};
    openModals.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openModals[openModals.length - 1] === me) close.current();
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => box.current?.querySelector<HTMLElement>('[data-autofocus], .modal-head button')?.focus({ preventScroll: true }), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      openModals.splice(openModals.indexOf(me), 1);
      window.clearTimeout(t);
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div ref={box} className={cls('modal', wide && 'is-wide', className)} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export const AVATAR_EMOJI: Record<string, string> = {
  menteur: '🤥',
  masque: '🎭',
  cafe: '☕',
  cocktail: '🍹',
  renard: '🦊',
  hibou: '🦉',
  crocodile: '🐊',
  licorne: '🦄',
  fantome: '👻',
  cowboy: '🤠',
  pieuvre: '🐙',
  micro: '🎤',
};

export const AVATAR_LABELS: Record<string, string> = {
  menteur: 'Nez qui s’allonge',
  masque: 'Masques de théâtre',
  cafe: 'Petit noir',
  cocktail: 'Cocktail',
  renard: 'Renard',
  hibou: 'Hibou',
  crocodile: 'Crocodile',
  licorne: 'Licorne',
  fantome: 'Fantôme',
  cowboy: 'Cow-boy',
  pieuvre: 'Pieuvre',
  micro: 'Micro',
};

export function Avatar({ avatar, className }: { avatar: string; className?: string }) {
  return (
    <span className={cls('avatar', className)} aria-hidden>
      {AVATAR_EMOJI[avatar] ?? '☕'}
    </span>
  );
}

/**
 * Un nom en morceaux qui ne se coupent pas (« Marie- », « Antoinette ») : la ligne passe d'abord entre eux. Seul un
 * morceau trop long se coupe en dedans, entre deux syllabes. Un petit numéro (« Léo 2 ») reste collé au mot d'avant.
 */
export function NameParts({ name }: { name: string }) {
  const words = name.trim().split(/\s+/);
  const glued = words.reduce<string[]>((acc, w) => {
    if (acc.length && w.length <= 2) acc[acc.length - 1] += ` ${w}`;
    else acc.push(w);
    return acc;
  }, []);
  const parts = glued.flatMap((w, i) => [...(i ? [' '] : []), ...w.split(/(?<=-)/)]);
  return (
    <>
      {parts.map((p, i) =>
        p === ' ' ? (
          ' '
        ) : (
          <span key={i} className="name-part">
            {breakable(p)}
          </span>
        ),
      )}
    </>
  );
}

/** L'ardoise du bistrot, où s'écrit la question de la manche. */
export function Chalkboard({ eyebrow, title, hint, children, className }: { eyebrow?: string; title: ReactNode; hint?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={cls('chalkboard', className)}>
      <div className="chalk-surface">
        {eyebrow && <span className="chalk-eyebrow">{eyebrow}</span>}
        <h2 className="chalk-title">{title}</h2>
        {hint && <p className="chalk-hint">{hint}</p>}
        {children}
      </div>
    </section>
  );
}

/** Une serviette en papier posée sur le zinc : sa lettre dans un coin, l'histoire écrite à la main. */
export function Napkin({
  letter,
  text,
  className,
  onClick,
  pressed,
  label,
  children,
  tilt = 0,
  disabled,
}: {
  letter?: string;
  text: ReactNode;
  className?: string;
  onClick?: () => void;
  pressed?: boolean;
  label?: string;
  children?: ReactNode;
  tilt?: number;
  disabled?: boolean;
}) {
  const body = (
    <>
      <span className="napkin-emboss" aria-hidden />
      {letter && (
        <span className="napkin-letter" aria-hidden>
          {letter}
        </span>
      )}
      <span className="napkin-text">{text}</span>
      {children}
    </>
  );
  const style = tilt ? ({ '--tilt': `${tilt}deg` } as CSSProperties) : undefined;
  const c = cls('napkin', onClick && 'is-button', pressed && 'is-picked', className);
  return onClick ? (
    <button type="button" className={c} style={style} onClick={onClick} aria-pressed={pressed} aria-label={label} disabled={disabled}>
      {body}
    </button>
  ) : (
    <div className={c} style={style} aria-label={label}>
      {body}
    </div>
  );
}

/** Une petite inclinaison stable pour chaque lettre : les serviettes ne sont jamais posées bien droites. */
export function tiltOf(letter: string): number {
  const n = letter.charCodeAt(0) - 64;
  return [-1.6, 1.2, -0.6, 1.8, -1.2, 0.7, -1.9, 1.4, -0.4, 1][(n - 1 + 10) % 10];
}

/** Le Mytho démasqué : un cercle rageur au marqueur rouge autour de la serviette, puis le mot, griffonné. */
export function MarkerScribble({ delay = 0, label = 'Mytho !', className }: { delay?: number; label?: string; className?: string }) {
  const style = { '--d': `${delay}s` } as CSSProperties;
  return (
    <span className={cls('scribble', className)} style={style} aria-hidden>
      <svg viewBox="0 0 200 120" preserveAspectRatio="none" className="scribble-loop">
        <path pathLength={1} d="M30 22C70 4 150 6 182 28s10 66-36 80-120 8-136-24S20 30 64 16" />
      </svg>
      <span className="scribble-word">{label}</span>
    </span>
  );
}

/** Un nom signé au stylo bille, qui s'écrit de gauche à droite. */
export function Signature({ name, delay = 0, className, tone = 'blue' }: { name: string; delay?: number; className?: string; tone?: 'blue' | 'red' }) {
  const style = { '--d': `${delay}s` } as CSSProperties;
  return (
    <span className={cls('signature', `is-${tone}`, className)} style={style}>
      <span className="signature-name">{name}</span>
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="signature-flourish" aria-hidden>
        <path pathLength={1} d="M2 6c18-5 32 3 48-1s30-4 48 0" />
      </svg>
    </span>
  );
}

/** Le temps qui reste, en une barre qui se vide (rien si pas de limite). */
export function TimeBar({ endsAt, total, className }: { endsAt: number; total: number; className?: string }) {
  const now = useTick(200);
  if (!endsAt || total <= 0) return null;
  const left = Math.max(0, Math.min(1, (endsAt - now) / total));
  return (
    <div className={cls('timebar', left < 0.2 && 'is-low', className)} aria-hidden>
      <span style={{ transform: `scaleX(${left})` }} />
    </div>
  );
}
