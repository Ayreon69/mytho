// Les règles, consultables partout : le déroulé d'une manche, le barème, les cas particuliers et des astuces.
import { GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { MAX_STORY, MIN_STORIES } from '../../../shared/protocol';
import { cls } from '../lib/util';
import { Scale } from '../screens/Lobby';
import { useStore } from '../store';
import { Button, Modal } from './Ui';

type Tab = 'jeu' | 'points' | 'astuces';

const STEPS: { title: string; text: string }[] = [
  {
    title: 'La question',
    text: 'À chaque manche, quelqu’un choisit la question parmi trois : « Ta pire honte au restaurant », « Un cadeau complètement raté »… Ce rôle tourne autour de la table.',
  },
  {
    title: 'Le Mytho',
    text: 'L’appli tire alors au sort, en secret, le Mytho de la manche. On touche son écran pour découvrir son rôle, à l’abri des regards.',
  },
  {
    title: 'Écrire',
    text: `Tout le monde écrit une vraie anecdote sur la question, en une ou deux phrases (${MAX_STORY} signes au plus). Le Mytho invente la sienne, aussi crédible que possible.`,
  },
  {
    title: 'Sur le comptoir',
    text: 'Les histoires sont mélangées et posées sans nom, sur des serviettes marquées A, B, C… À voix haute, chacune est lue par quelqu’un de la table, tiré au sort.',
  },
  {
    title: 'Le débat et le vote',
    text: 'On débat, on pose des questions, on a le droit de bluffer (« c’est la mienne » ne prouve rien). Puis on touche la serviette qu’on croit fausse. Impossible de voter pour la sienne.',
  },
  {
    title: 'Qui a écrit quoi ?',
    text: 'La fausse est démasquée au marqueur rouge, et les votes de chaque personne apparaissent. On place alors un nom sur chaque autre serviette : qui a écrit quoi, et qui est le Mytho.',
  },
  {
    title: 'Les signatures',
    text: 'Les auteurs signent leur serviette, le Mytho en dernier, et les points tombent. Après la dernière manche, l’addition : le plus de points l’emporte.',
  },
];

const TIPS: [string, string][] = [
  ['Première partie', 'Fais la manche d’essai : trois minutes. Garde 3 minutes d’écriture, 2 minutes de débat et les conseils pour débutants.'],
  ['Écrire vrai', 'Un détail précis (un lieu, une heure, un objet) rend une histoire crédible. Évite celui qui te désignerait tout de suite.'],
  ['Le Mytho', 'Invente quelque chose qui pourrait t’arriver, aussi banal que les vraies. Une histoire trop belle se repère vite.'],
  ['Le débat', 'Posez des questions précises à toute la table : « C’était en quelle année, la C ? ». Le Mytho doit improviser, et tout le monde peut faire semblant.'],
  ['Les noms', 'Commence par les serviettes dont tu es sûr ou sûre, puis place le reste. Un nom posé sur une autre serviette quitte la première.'],
  ['À distance', 'En vocal (Discord, visio), gardez le mode « Lues à voix haute ». Sans vocal, choisissez « Sur l’écran » : le débat se fait par écrit, dans l’appli.'],
];

export function RulesBody({ initial = 'jeu' }: { initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <div className="rules">
      <div className="tabs" role="tablist">
        {(
          [
            ['jeu', 'Le jeu'],
            ['points', 'Les points'],
            ['astuces', 'Astuces'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={cls('tab', tab === id && 'is-on')} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'jeu' && (
        <ol className="rule-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="rule-n">{i + 1}</span>
              <div>
                <h4>{s.title}</h4>
                <p>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {tab === 'points' && (
        <div className="rule-points">
          <Scale />
          <p className="small">
            Le Mytho ne peut pas voter pour sa propre histoire&nbsp;: son vote tombe sur une histoire vraie, et rapporte un point à son auteur. Le Mytho devine les auteurs comme tout le monde. Les points ne descendent jamais.
          </p>
          <p className="small muted">
            Le Mytho est tiré au sort à chaque manche, parmi les joueurs présents&nbsp;: on peut l’être deux fois de suite, mais c’est plus rare. Si le Mytho n’a rien écrit à temps, ou s’il reste moins de {MIN_STORIES} histoires, la manche ne compte pas. Quelqu’un qui perd la connexion n’est plus attendu après 20 secondes.
          </p>
        </div>
      )}
      {tab === 'astuces' && (
        <ul className="tips-list">
          {TIPS.map(([t, d]) => (
            <li key={t}>
              <b>{t}</b>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  const setTutorial = useStore((s) => s.setTutorialOpen);
  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Les règles de Mytho"
      wide
      footer={
        <Button icon={<GraduationCap size={18} />} onClick={() => (setOpen(false), setTutorial(true))}>
          Essayer une manche (3 minutes)
        </Button>
      }
    >
      <RulesBody />
    </Modal>
  );
}
