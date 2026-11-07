// Test de bout en bout de Mytho, sur le serveur compilé, en mode accéléré (MY_FAST=1 : choix de la question en 3 s,
// écriture de 2 s et débat de 1,5 s s'ils sont minutés, 2,5 s par histoire lue ; voir T dans server/room.ts).
// Pas de bots : de vrais clients socket.io jouent tous les sièges.
// Partie 1 : 5 joueurs, à voix haute, sans limite de temps, 3 manches. Gestes interdits refusés sans rien diffuser, une
//   spectatrice arrive en cours de partie, un joueur se déconnecte puis reprend sa session, une session volée est refusée.
//   À chaque manche : d'autres questions puis le choix, les brouillons et les votes changés (en secret : personne d'autre
//   ne reçoit d'état), la lecture dans l'ordre, le vote, les noms posés sur les serviettes, et le compte des points.
// Partie 2 : revanche à 4, par écrit et minutée : la question prise d'office, un brouillon qui compte à la fin du temps,
//   le fil écrit, le vote et les devinettes closes par la minuterie ; puis le Mytho quitte la table avant d'écrire, la
//   manche est annulée ; l'hôte arrête la partie.
// À chaque état reçu par chaque client, on vérifie qu'aucun secret ne fuit (le Mytho, les auteurs, les votes avant leur
// heure), et qu'aucun état n'arrive sans changement visible chez un joueur qui n'a rien fait.
// Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3900 + Math.floor(Math.random() * 900);
const ADDRESS = `http://localhost:${PORT}`;
let over = false;
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), MY_FAST: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
function fail(msg) {
  if (over) return;
  over = true;
  console.error(`✗ ${msg}`);
  server.kill();
  process.exit(1);
}
function check(cond, msg) {
  if (!cond) fail(msg);
}
server.stderr.on('data', (d) => process.stderr.write(d));
server.on('exit', (code) => fail(`le serveur s'est arrêté (code ${code})`));
setTimeout(() => fail('délai dépassé (3 min)'), 180_000).unref();
await new Promise((resolve) => {
  let out = '';
  server.stdout.on('data', (d) => {
    out += d;
    if (out.includes('prêt')) resolve();
  });
});

// ───────────────────────────── Les règles, recopiées pour ne pas dépendre du code testé ────────────────

const P = { found: 2, fooled: 1, accused: 1, author: 1 };
function score(players, mytho, stories, fake, votes, guesses) {
  const d = Object.fromEntries(players.map((id) => [id, 0]));
  const authorOf = Object.fromEntries(stories.map((s) => [s.letter, s.author]));
  for (const [voter, letter] of Object.entries(votes)) {
    if (voter !== mytho) {
      if (letter === fake) d[voter] += P.found;
      else d[mytho] += P.fooled;
    }
    if (letter !== fake) d[authorOf[letter]] += P.accused;
  }
  for (const [guesser, map] of Object.entries(guesses)) for (const [letter, who] of Object.entries(map)) if (authorOf[letter] === who && who !== guesser) d[guesser] += P.author;
  return d;
}

// ───────────────────────────── Les clients ─────────────────────────────

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = { states: 0, refused: 0, drafts: 0, votes: 0, changed: 0, names: 0, lines: 0, rounds: 0, canceled: 0, resumes: 0 };
const ROOM_KEYS = 'code,final,game,hostId,me,phase,players,serverNow,settings';
const GAME_KEYS =
  'authors,choices,chooser,endsAt,fake,lines,lockers,myDone,myGuess,myLetter,myLocked,myText,myVote,mytho,nextChooser,order,question,readers,reading,redrawsLeft,result,round,rounds,scores,seq,stage,stageMs,stories,voters,votes,writers';

function client(name, avatar = 'cafe') {
  const socket = io(ADDRESS, { transports: ['websocket'], forceNew: true });
  const c = { name, avatar, socket, view: null, session: null, count: 0, acted: 0, waiters: [] };
  socket.on('state', (v) => {
    if (over) return;
    c.count++;
    stats.states++;
    const prev = c.view;
    c.view = v;
    audit(c, prev, v);
    for (const w of [...c.waiters]) if (w.pred(v)) (c.waiters.splice(c.waiters.indexOf(w), 1), w.resolve(v));
  });
  socket.on('kicked', () => (c.view = null));
  c.call = (event, payload = {}) =>
    new Promise((res) =>
      socket.emit(event, payload, (r) => {
        c.acted = Date.now();
        res(r);
      }),
    );
  c.wait = (pred, what, ms = 8000) =>
    new Promise((resolve) => {
      if (c.view && pred(c.view)) return resolve(c.view);
      const w = { pred, resolve };
      c.waiters.push(w);
      setTimeout(() => {
        if (c.waiters.includes(w)) fail(`${c.name} attend en vain : ${what}`);
      }, ms);
    });
  return c;
}
const connected = (c) => (c.socket.connected ? Promise.resolve() : new Promise((r) => c.socket.once('connect', r)));

/** Ce que le serveur pose sur la serviette : espaces resserrées, insécables avant : ; ! ? » et après «, majuscule au début. */
const typo = (t) => {
  const s = t.replace(/\s+/g, ' ').replace(/[  ]+([:;!?»])/g, ' $1').replace(/«[  ]*/g, '« ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

async function ok(c, event, payload, what) {
  c.acted = Date.now();
  const res = await c.call(event, payload);
  if (!res?.ok) fail(`${c.name} : ${what} refusé (${res?.error})`);
  return res;
}
/** Un geste interdit : refusé, et personne d'autre ne reçoit d'état. */
async function refused(c, event, payload, what, others) {
  const before = others.map((o) => o.count);
  c.acted = Date.now();
  const res = await c.call(event, payload);
  if (res?.ok) fail(`${c.name} : ${what} aurait dû être refusé`);
  stats.refused++;
  await pause(60);
  others.forEach((o, i) => check(o.count === before[i], `${what} : un refus a réveillé ${o.name}`));
}
/** Un geste secret : accepté, et personne d'autre ne reçoit d'état. */
async function secret(c, event, payload, what, others) {
  const before = others.map((o) => o.count);
  await ok(c, event, payload, what);
  await pause(80);
  others.forEach((o, i) => check(o.count === before[i], `${what} : le geste secret a réveillé ${o.name}`));
}

/** Les secrets : le Mytho, les auteurs, les histoires pas encore lues, les votes et la fausse avant leur heure. */
function audit(c, prev, v) {
  check(Object.keys(v).sort().join(',') === ROOM_KEYS, `${c.name} : clés de vue inattendues`);
  const g = v.game;
  if (!g) return;
  check(Object.keys(g).sort().join(',') === GAME_KEYS, `${c.name} : clés de partie inattendues (${Object.keys(g).sort().join(',')})`);
  const where = `${c.name}, manche ${g.round}, ${g.stage}`;
  for (const s of g.stories) check(Object.keys(s).sort().join(',') === 'letter,text', `${where} : une serviette dit son auteur`);
  if (g.stage === 'theme') {
    check(g.question === null && !g.mytho && g.choices?.length === 3, `${where} : choix de question incomplet ou Mytho déjà tiré`);
  } else check(g.choices === null, `${where} : les questions proposées restent visibles`);
  if (g.stage === 'theme' || g.stage === 'write') check(g.stories.length === 0 && g.authors.length === 0 && g.myLetter === null, `${where} : serviettes visibles pendant l'écriture`);
  if (g.stage === 'read') g.stories.forEach((s, i) => check(i <= g.reading ? typeof s.text === 'string' : s.text === null, `${where} : une histoire pas encore lue est visible`));
  if (g.stage !== 'guess' && g.stage !== 'reveal') check(g.votes === null && g.fake === null, `${where} : les votes ou la fausse se voient trop tôt`);
  if (g.stage === 'reveal') {
    check(!g.mytho && g.result && g.result.round === g.round, `${where} : dévoilement sans résultat`);
  } else check(g.result === null, `${where} : résultat avant le dévoilement`);
  if (!g.order.includes(v.me)) check(!g.mytho && g.myText === '' && Object.keys(g.myGuess).length === 0, `${where} : la spectatrice a un rôle`);
  if (g.mytho) check(g.order.includes(v.me), `${where} : Mytho hors de la table`);
  // Un état sans aucun changement visible, à quelqu'un qui n'a rien fait, trahirait un geste secret.
  if (prev && prev.game && Date.now() - c.acted > 250) {
    const strip = (x) => JSON.stringify({ ...x, serverNow: 0 });
    check(strip(prev) !== strip(v), `${c.name} : état diffusé sans changement visible (manche ${g.round}, ${g.stage})`);
  }
}

const viewOf = (cs, id) => cs.find((c) => c.view?.me === id);
const at = (stage, round) => (v) => v.game?.stage === stage && v.game.round === round;
async function all(cs, pred, what) {
  for (const c of cs) await c.wait(pred, what);
}

async function join(c, code) {
  await connected(c);
  const res = await ok(c, 'room:join', { code, name: c.name, avatar: c.avatar }, 'rejoindre');
  c.session = res.data;
  return res.data;
}

const STORY = (c, r) => `Une histoire vraie de ${c.name}, manche ${r} : c’était un mardi, sous la pluie.`;
const FAKE = (c, r) => `Une histoire inventée par ${c.name}, manche ${r} : un dimanche, à la plage.`;

// ───────────────────────────── Une manche à voix haute, sans limite ─────────────────────────────

async function oralRound(seated, watchers, scores, opts = {}) {
  const everyone = [...seated, ...watchers];
  const host = seated[0];
  const round = host.view.game.round;
  await all(everyone, at('theme', round), `le choix de la manche ${round}`);
  const chooser = viewOf(seated, host.view.game.chooser);
  const others = everyone.filter((c) => c !== chooser);
  // Le choix de la question : d'autres questions (publiques), un intrus refusé, puis le choix.
  await refused(others[0], 'game:choose', { index: 0 }, 'un choix par un autre que le meneur', [chooser]);
  const first = chooser.view.game.choices.map((q) => q.id).join();
  await ok(chooser, 'game:choose', { redraw: true }, 'd’autres questions');
  for (const c of everyone) await c.wait((v) => v.game.choices && v.game.choices.map((q) => q.id).join() !== first, 'les nouvelles questions');
  check(chooser.view.game.redrawsLeft === 2, 'les questions encore échangeables sont mal comptées');
  const question = chooser.view.game.choices[1].text;
  await ok(chooser, 'game:choose', { index: 1 }, 'le choix');
  await all(everyone, at('write', round), 'l’écriture');
  for (const c of everyone) check(c.view.game.question?.text === question, `${c.name} ne voit pas la bonne question`);
  const mythos = seated.filter((c) => c.view.game.mytho);
  check(mythos.length === 1, `manche ${round} : ${mythos.length} Mytho au lieu d'un`);
  const mytho = mythos[0];
  // Un brouillon ne réveille personne, pas même son auteur (il tape encore) ; une histoire trop courte est refusée.
  await secret(seated[1], 'game:draft', { text: 'Un brouillon en cours…' }, 'un brouillon', everyone.filter((c) => c !== seated[1]));
  stats.drafts++;
  await refused(seated[2], 'game:write', { text: 'trop court' }, 'une histoire trop courte', everyone.filter((c) => c !== seated[2]));
  for (const w of watchers) await refused(w, 'game:write', { text: 'Une spectatrice qui écrit une histoire.' }, 'une spectatrice qui écrit', []);
  const texts = new Map();
  for (const [k, c] of seated.entries()) {
    const t = c === mytho ? FAKE(c, round) : STORY(c, round);
    texts.set(c.view.me, typo(t));
    await ok(c, 'game:write', { text: t }, 'écrire');
    if (k === 0) {
      // « Modifier » puis réécrire, pendant que les autres écrivent encore.
      await ok(c, 'game:write', { done: false }, 'modifier');
      check(!(await host.wait((v) => !v.game.writers.includes(c.view.me), 'l’histoire repartie en brouillon')).game.writers.includes(c.view.me), 'modifier ne rouvre pas l’histoire');
      await ok(c, 'game:write', { text: t }, 'réécrire');
    }
  }
  // La lecture, dans l'ordre, par les lecteurs tirés au sort.
  const authors = seated.filter((c) => texts.has(c.view.me));
  await all(everyone, (v) => v.game?.round === round && v.game.stage === 'read', 'la lecture');
  let g = host.view.game;
  check(g.stories.length === authors.length && g.stories.map((s) => s.letter).join('') === 'ABCDE'.slice(0, authors.length), 'serviettes mal lettrées');
  check(JSON.stringify(g.authors) === JSON.stringify(g.order.filter((id) => texts.has(id))), 'les auteurs ne sont pas dans l’ordre de la table');
  const stories = [];
  for (let i = 0; i < g.stories.length; i++) {
    const v = await host.wait((x) => x.game.stage === 'read' && x.game.reading === i, `l'histoire ${i}`);
    const reader = viewOf(seated, v.game.readers[i]);
    const text = v.game.stories[i].text;
    const author = authors.find((c) => texts.get(c.view.me) === text);
    check(!!author, `l'histoire ${v.game.stories[i].letter} ne correspond à personne`);
    stories.push({ letter: v.game.stories[i].letter, text, author: author.view.me });
    const intruder = seated.find((c) => c !== reader && c !== host);
    if (i === 0) await refused(intruder, 'game:read', { index: 0 }, 'une lecture par un autre que le lecteur', [host]);
    if (opts.readTimeout && i === g.stories.length - 1) {
      await host.wait((x) => x.game.stage === 'vote', 'la fin de la lecture au temps', 5000);
    } else await ok(i === 1 ? host : reader, 'game:read', { index: i }, 'c’est lu');
  }
  // Un vieux « C'est lu » ne saute pas d'histoire.
  await ok(host, 'game:read', { index: 0 }, 'un « C’est lu » en retard (sans effet)');
  await all(everyone, at('vote', round), 'le vote');
  const fake = stories.find((s) => s.author === mytho.view.me).letter;
  for (const c of seated) check(c.view.game.myLetter === (stories.find((s) => s.author === c.view.me)?.letter ?? null), `${c.name} : mauvaise lettre pour sa serviette`);
  // Les votes : on ne vote pas pour soi ; un vote changé ne réveille personne.
  await refused(mytho, 'game:vote', { letter: fake }, 'un vote pour sa propre histoire', everyone.filter((c) => c !== mytho));
  const votes = {};
  for (const [k, c] of seated.entries()) {
    const own = c.view.game.myLetter;
    const truths = stories.filter((s) => s.letter !== fake && s.letter !== own);
    const letter = c === mytho ? truths[0].letter : k % 2 === 0 ? fake : truths[k % truths.length].letter;
    votes[c.view.me] = letter;
    if (k === 0) {
      await ok(c, 'game:vote', { letter: truths[truths.length - 1].letter }, 'un premier vote');
      await all(everyone, (x) => x.game.voters.includes(c.view.me), 'le premier vote, public');
      await secret(c, 'game:vote', { letter }, 'un vote changé', everyone.filter((o) => o !== c));
      stats.changed++;
    } else await ok(c, 'game:vote', { letter }, 'voter');
    stats.votes++;
  }
  await all(everyone, at('guess', round), 'les devinettes');
  for (const c of everyone) check(c.view.game.fake === fake, `${c.name} ne voit pas la bonne fausse`);
  check(JSON.stringify(host.view.game.votes) === JSON.stringify(Object.fromEntries(host.view.game.order.filter((id) => votes[id]).map((id) => [id, votes[id]]))), 'les votes dévoilés sont faux');
  // Les noms posés : en secret. Un nom posé ailleurs quitte sa première serviette.
  const guesses = {};
  for (const [k, c] of seated.entries()) {
    const mine = c.view.me;
    const theirs = stories.filter((s) => s.author !== mine);
    if (k === 1) {
      await secret(c, 'game:assign', { letter: theirs[0].letter, target: theirs[1].author }, 'un nom posé', everyone.filter((o) => o !== c));
      await ok(c, 'game:assign', { letter: theirs[1].letter, target: theirs[1].author }, 'le même nom, ailleurs');
      check(!(await c.wait((v) => v.game.myGuess[theirs[1].letter] === theirs[1].author, 'son nom déplacé')).game.myGuess[theirs[0].letter], 'le nom n’a pas quitté sa première serviette');
      await refused(c, 'game:assign', { letter: c.view.game.myLetter ?? 'Z', target: theirs[0].author }, 'un nom sur sa propre serviette', []);
      stats.names += 2;
    }
    // Les uns devinent juste, les autres croisent deux noms.
    const map = {};
    theirs.forEach((s, i) => (map[s.letter] = k % 2 === 0 || theirs.length < 2 ? s.author : theirs[(i + 1) % theirs.length].author));
    if (opts.partial === c) delete map[theirs[0].letter];
    for (const [letter, target] of Object.entries(map)) {
      await ok(c, 'game:assign', { letter, target }, 'un nom');
      stats.names++;
    }
    const want = Object.fromEntries(Object.entries(map).sort());
    const got = await c.wait((v) => JSON.stringify(Object.fromEntries(Object.entries(v.game.myGuess).sort())) === JSON.stringify(want), 'ses noms');
    check(!!got, 'noms mal enregistrés');
    guesses[mine] = want;
  }
  const lazy = opts.unlocked ? seated[seated.length - 1] : null;
  if (lazy) {
    // Valider puis se raviser : la table l'attend encore.
    await ok(lazy, 'game:lock', { on: true }, 'valider');
    await ok(lazy, 'game:lock', { on: false }, 'modifier');
  }
  for (const c of seated) if (c !== lazy) await ok(c, 'game:lock', { on: true }, 'valider');
  if (lazy) {
    await refused(lazy, 'game:assign', { letter: 'Z', target: null }, 'une serviette qui n’existe pas', []);
    await refused(seated[1], 'game:hurry', { seq: host.view.game.seq }, 'presser la table sans être l’hôte', [lazy]);
    await ok(host, 'game:hurry', { seq: host.view.game.seq - 1 }, 'presser avec un vieil état (sans effet)');
    await pause(100);
    check(host.view.game.stage === 'guess', 'un vieil appui a clos les devinettes');
    await ok(host, 'game:hurry', { seq: host.view.game.seq }, 'clore les devinettes');
  }
  const v = await host.wait(at('reveal', round), 'le dévoilement');
  const r = v.game.result;
  check(r.canceled === null && r.mytho === mytho.view.me && r.fake === fake, `manche ${round} : mauvais Mytho dévoilé`);
  const flat = (list) => JSON.stringify(list.map((x) => [x.letter, x.text, x.author]).sort());
  check(flat(r.stories) === flat(stories), `manche ${round} : serviettes dévoilées fausses`);
  const delta = score(v.game.order, mytho.view.me, stories, fake, votes, guesses);
  check(JSON.stringify(Object.entries(delta).sort()) === JSON.stringify(Object.entries(r.delta).sort()), `manche ${round} : points faux ${JSON.stringify(r.delta)} au lieu de ${JSON.stringify(delta)}`);
  for (const [id, n] of Object.entries(delta)) scores[id] = (scores[id] ?? 0) + n;
  for (const [id, n] of Object.entries(scores)) check(v.game.scores[id] === n, `manche ${round} : score de ${id} faux`);
  stats.rounds++;
  return v;
}

// ───────────────────────────── Partie 1 ─────────────────────────────

const names = ['Ginette', 'Jean-Pierre', 'Maximilienne', 'Opéra', 'Sam'];
const five = names.map((n, i) => client(n, ['menteur', 'renard', 'hibou', 'licorne', 'micro'][i]));
await connected(five[0]);
const created = await ok(five[0], 'room:create', { name: five[0].name, avatar: 'menteur' }, 'créer');
five[0].session = created.data;
const code = created.data.code;
for (const c of five.slice(1)) await join(c, code);
const host = five[0];
await host.wait((v) => v.players.length === 5, 'cinq joueurs');
await refused(five[1], 'game:start', {}, 'un lancement par un non-hôte', [host]);
await refused(five[1], 'room:settings', { talk: 'ecrit' }, 'un réglage par un non-hôte', [host]);
await ok(host, 'room:settings', { write: 0, debate: 0, rounds: 3, spice: 'piquantes' }, 'les réglages');
await host.wait((v) => v.settings.write === 0 && v.settings.rounds === 3 && v.settings.spice === 'piquantes', 'les réglages');
await ok(host, 'game:start', {}, 'le lancement');
await host.wait((v) => v.phase === 'playing', 'la partie');
check(host.view.game.choices.some((q) => q.spicy), 'pas de question piquante parmi les trois');
await refused(host, 'room:kick', { playerId: five[1].view.me }, 'retirer un joueur en partie', []);

// Une spectatrice arrive.
const spect = client('Spectatrice', 'fantome');
await join(spect, code);
check((await spect.wait((v) => !!v.game, 'la partie')).players.find((p) => p.id === spect.view.me).status === 'spectator', 'la spectatrice est assise');

const scores = {};
let v = await oralRound(five, [spect], scores);
for (let r = 2; r <= 3; r++) {
  // Le meneur suivant lance la manche, après un appui d'un tiers, refusé.
  const next = viewOf(five, v.game.nextChooser);
  check(!!next && next.view.me === v.game.order[r - 1], 'le prochain meneur est mal désigné');
  const intruder = five.find((c) => c !== next && c !== host);
  await refused(intruder, 'game:next', { seq: v.game.seq }, 'une manche suivante lancée par un tiers', [host]);
  await ok(next, 'game:next', { seq: v.game.seq }, 'la manche suivante');
  await ok(host, 'game:next', { seq: v.game.seq }, 'un second appui, sans effet');
  await host.wait((x) => x.game.round === r, `la manche ${r}`);
  check(host.view.game.chooser === next.view.me, 'le meneur de la manche n’est pas le bon');
  if (r === 2) {
    // Une coupure, puis la reprise de session ; une session volée est refusée.
    const c = five.find((x) => x !== host && x !== next);
    const thief = client('Voleur', 'crocodile');
    await connected(thief);
    const stolen = await thief.call('room:join', { code, playerId: c.session.playerId, token: 'faux', resumeOnly: true });
    check(!stolen.ok, 'une session volée est acceptée');
    thief.socket.close();
    c.socket.disconnect();
    await pause(200);
    c.socket.connect();
    await connected(c);
    const back = await ok(c, 'room:join', { code, ...c.session, resumeOnly: true }, 'la reprise');
    check(back.data.playerId === c.session.playerId, 'la reprise donne un autre joueur');
    await c.wait((x) => x.game?.round === r, 'la partie après reprise');
    // Le retour est diffusé à toute la table : on le laisse arriver avant de compter les états.
    await pause(300);
    stats.resumes++;
  }
  v = await oralRound(five, [spect], scores, r === 3 ? { readTimeout: true, unlocked: true, partial: five[2] } : {});
}
await ok(host, 'game:next', { seq: v.game.seq }, 'l’addition');
const fin = await host.wait((x) => x.phase === 'finished', 'la fin');
const best = Math.max(...Object.values(scores));
check(JSON.stringify([...fin.final.winners].sort()) === JSON.stringify(Object.keys(scores).filter((id) => scores[id] === best).sort()), 'mauvais vainqueurs');
for (const p of fin.final.players) check(p.score === scores[p.id], `score final de ${p.name} faux`);
check(fin.final.rounds.length === 3, 'il manque des manches à la fin');
check(fin.final.players.reduce((n, p) => n + p.mythos, 0) === 3, 'les manches de Mytho sont mal comptées');
console.log(`✓ partie 1 : 3 manches à voix haute, scores ${fin.final.players.map((p) => `${p.name} ${p.score}`).join(', ')}`);

// ───────────────────────────── Partie 2 ─────────────────────────────

await ok(host, 'game:restart', {}, 'la revanche');
await host.wait((x) => x.phase === 'lobby', 'le salon');
await ok(spect, 'room:leave', {}, 'la spectatrice qui part');
spect.socket.close();
await ok(five[4], 'room:leave', {}, 'quitter le salon');
const four = five.slice(0, 4);
await host.wait((x) => x.players.filter((p) => p.status !== 'spectator').length === 4, 'quatre joueurs assis');
await ok(host, 'room:settings', { talk: 'ecrit', write: 120, debate: 60, rounds: 3, spice: 'douces' }, 'les réglages écrits');
await ok(host, 'game:start', {}, 'la revanche');
let g = (await host.wait((x) => x.phase === 'playing' && x.game?.round === 1, 'la revanche')).game;
{
  // La question est prise d'office, faute de choix.
  const first = g.choices[0].text;
  check(!g.choices.some((q) => q.spicy), 'une question piquante en mode doux');
  await refused(four[1], 'game:say', { text: 'trop tôt' }, 'une phrase avant le débat', []);
  g = (await host.wait(at('write', 1), 'la question prise d’office', 6000)).game;
  check(g.question.text === first, 'ce n’est pas la première question qui est prise');
  await all(four, at('write', 1), 'l’écriture');
  const mytho = four.find((c) => c.view.game.mytho);
  check(!!mytho, 'pas de Mytho');
  // Trois histoires rendues, un brouillon (pas le Mytho) qui compte à la fin du temps.
  const drafter = four.find((c) => c !== mytho);
  for (const c of four) if (c !== drafter) await ok(c, 'game:write', { text: c === mytho ? FAKE(c, 1) : STORY(c, 1) }, 'écrire');
  await all(four, (x) => x.game.writers.length === 3, 'les trois histoires rendues');
  await secret(drafter, 'game:draft', { text: 'Un brouillon jamais rendu, mais assez long.' }, 'un brouillon', four.filter((c) => c !== drafter));
  stats.drafts++;
  g = (await host.wait(at('vote', 1), 'le vote après le temps d’écriture', 6000)).game;
  check(g.stories.length === 4 && g.stories.some((s) => s.text === 'Un brouillon jamais rendu, mais assez long.'), 'le brouillon n’a pas compté');
  check(g.readers.length === 0, 'une lecture à voix haute en mode écrit');
  // Le fil écrit.
  await ok(four[2], 'game:say', { text: '  La B, c’est louche  ' }, 'une phrase');
  stats.lines++;
  check((await four[0].wait((x) => x.game.lines.length === 1, 'la phrase publique')).game.lines[0].text === 'La B, c’est louche', 'la phrase n’arrive pas propre');
  await ok(four[1], 'game:vote', { letter: g.stories.find((s) => s.letter !== four[1].view.game.myLetter).letter }, 'voter');
  // Le vote puis les devinettes se closent au temps.
  g = (await host.wait(at('guess', 1), 'les devinettes au temps', 6000)).game;
  check(Object.keys(g.votes).length === 1, 'un vote de trop ou de moins');
  await ok(four[3], 'game:say', { text: 'J’en étais sûr !' }, 'une phrase pendant les devinettes');
  const r = (await host.wait(at('reveal', 1), 'le dévoilement au temps', 6000)).game.result;
  check(r.canceled === null && r.mytho === mytho.view.me, 'manche écrite mal dévoilée');
  stats.rounds++;
  g = host.view.game;
}
{
  // Le Mytho de la manche 2 quitte la table avant d'écrire : la manche est annulée.
  await ok(viewOf(four, g.nextChooser), 'game:next', { seq: g.seq }, 'la manche 2');
  const chooser = viewOf(four, (await host.wait(at('theme', 2), 'la manche 2')).game.chooser);
  await ok(chooser, 'game:choose', { index: 2 }, 'le choix');
  await all(four, at('write', 2), 'l’écriture');
  const mytho = four.find((c) => c.view.game.mytho);
  const rest = four.filter((c) => c !== mytho);
  for (const c of rest) await ok(c, 'game:write', { text: STORY(c, 2) }, 'écrire');
  await ok(mytho, 'room:leave', {}, 'le Mytho qui part');
  const after = await rest[0].wait(at('reveal', 2), 'la manche annulée');
  check(after.game.result.canceled === 'mytho' && Object.keys(after.game.result.delta).length === 0, 'la manche sans histoire du Mytho compte');
  stats.canceled++;
  // Si l'hôte est parti, la table passe à quelqu'un d'autre.
  const boss = viewOf(rest, after.players.find((p) => p.isHost).id);
  check(!!boss && boss !== mytho, 'la table n’a plus d’hôte');
  await ok(boss, 'game:end', {}, 'arrêter');
  await boss.wait((x) => x.phase === 'lobby', 'le retour au salon');
}
console.log('✓ partie 2 : écrit, minuteries, brouillon compté, Mytho parti, partie arrêtée');

const h = await fetch(`${ADDRESS}/health`).then((r) => r.json());
check(h.ok && h.questions >= 200 && h.piquantes >= 50, '/health incomplet');
console.log(`✓ ${Object.entries(stats)
  .map(([k, n]) => `${k} ${n}`)
  .join(', ')}`);
over = true;
for (const c of [...five, spect]) c.socket.close();
server.kill();
process.exit(0);
