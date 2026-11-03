'use strict';
// Mimiq front end.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const BOTS = {
  public: {
    name: 'ECHO', desc: 'Public bot: everyone teaches it',
    hello: "🦜 Hi, I'm Echo! I copy whatever people teach me, and everyone shares my brain. Ask me anything. If I don't know it, you get to teach me!",
  },
  private: {
    name: 'VAULT', desc: 'Private bot: only you can see it',
    hello: "🔒 I'm Vault, your private bot. Only you can see what you teach me. Great for reminders, secrets and inside jokes.",
  },
  friend: {
    name: 'CHORUS', desc: 'Friend bot: shared with your friends',
    hello: "👥 I'm Chorus! You and your friends share my brain. Add friends with their friend code in the Friends tab.",
  },
};
const TIME_WORDS = /\b(today|tonight|tomorrow|yesterday|now|right now|currently|current|latest|newest|recent|weather|forecast|temperature|scores?|prices?|cost|stocks?|news|time|date|this (week|month|year)|live|trending|who won|updates?|schedule)\b/i;
const URL_RE = /https?:\/\/[^\s<>"']+[^\s<>"'.,!?;:)\]]/g;

const AVATAR_SVG = {
  hex: '<svg viewBox="0 0 100 100"><circle class="spin-slow" cx="50" cy="50" r="44" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="14 9"/><path d="M27 66 V34 L50 56 L73 34 V66" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle class="pulse" cx="50" cy="76" r="4" fill="currentColor"/></svg>',
  orb: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="3" opacity=".5"/><circle class="pulse" cx="50" cy="50" r="22" fill="currentColor" opacity=".8"/><g class="spin"><ellipse cx="50" cy="50" rx="46" ry="14" fill="none" stroke="currentColor" stroke-width="2"/></g></svg>',
  eye: '<svg viewBox="0 0 100 100"><path d="M6 50 Q50 6 94 50 Q50 94 6 50Z" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="50" cy="50" r="17" fill="currentColor" opacity=".35"/><circle class="pulse" cx="50" cy="50" r="8" fill="currentColor"/></svg>',
  cube: '<svg viewBox="0 0 100 100"><g class="spin-slow"><polygon points="50,10 86,30 86,70 50,90 14,70 14,30" fill="none" stroke="currentColor" stroke-width="3"/><polyline points="14,30 50,50 86,30" fill="none" stroke="currentColor" stroke-width="3"/><line x1="50" y1="50" x2="50" y2="90" stroke="currentColor" stroke-width="3"/></g><circle class="pulse" cx="50" cy="50" r="6" fill="currentColor"/></svg>',
  star: '<svg viewBox="0 0 100 100"><polygon class="spin-slow" points="50,6 61,38 95,38 67,58 78,92 50,72 22,92 33,58 5,38 39,38" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle class="pulse" cx="50" cy="52" r="9" fill="currentColor"/></svg>',
  crown: '<svg viewBox="0 0 100 100"><path d="M14 70 L20 28 L38 48 L50 16 L62 48 L80 28 L86 70 Z" fill="currentColor" fill-opacity=".3" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><rect x="14" y="76" width="72" height="8" rx="3" fill="currentColor"/><circle class="pulse" cx="50" cy="55" r="7" fill="currentColor"/></svg>',
};
const THEME_SWATCH = {
  cyan: 'linear-gradient(135deg,#22e4ff,#8b5cff)',
  magenta: 'linear-gradient(135deg,#ff3df2,#6a5cff)',
  lime: 'linear-gradient(135deg,#a6ff3d,#22e4ff)',
  gold: 'linear-gradient(135deg,#ffc23d,#ff6a3d)',
  plasma: 'conic-gradient(#ff3d3d,#ffc23d,#a6ff3d,#22e4ff,#8b5cff,#ff3df2,#ff3d3d)',
};

const state = {
  me: null,
  bot: 'public',
  busy: false,
  side: 'bounties',
  board: 'weekly',
  started: false,
};

// ---------- small helpers ----------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'svg') node.innerHTML = value; // only our own SVG strings above
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

// Text with clickable links. Never uses innerHTML, so taught answers can't inject code.
function richText(text) {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    frag.append(text.slice(last, m.index));
    frag.append(el('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer' }, m[0]));
    last = m.index + m[0].length;
  }
  frag.append(text.slice(last));
  return frag;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---------- Supabase ----------
const CONFIG = window.HIVE_CONFIG || {};
const configured = /^https:\/\/.+/.test(CONFIG.supabaseUrl || '') && !/YOUR-/.test(CONFIG.supabaseUrl + CONFIG.supabaseAnonKey);
const sb = configured ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey) : null;
const usernameToEmail = username => `${username.toLowerCase()}@${CONFIG.emailDomain || 'players.example.com'}`;

// Calls one of the hive_* database functions. They return { error, code, ... } for
// expected problems (like "vote first"), and raise for everything else.
async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    const err = new Error(error.message || 'Something went wrong');
    err.data = {};
    if (/sign in|JWT/i.test(error.message) && state.started) location.reload();
    throw err;
  }
  if (data && data.error) {
    const err = new Error(data.error);
    err.data = data;
    throw err;
  }
  return data;
}

function toast(message, kind = '') {
  const node = el('div', { class: `toast ${kind}` }, message);
  $('#toasts').append(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 300);
  }, 3600);
}

// ---------- sound ----------
let audioCtx;
function sfx(kind) {
  if (!state.me?.user.sound) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const notes = {
      send: [660], receive: [520, 780], vote: [440, 560], learn: [523, 659, 784],
      achieve: [784, 988, 1175], level: [523, 659, 784, 1047, 1319], error: [200, 160],
    }[kind] || [600];
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const t = audioCtx.currentTime + i * 0.09;
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch { /* sound is optional */ }
}

// ---------- confetti ----------
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = $('#confetti');
  const ctx = canvas.getContext('2d');
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const styles = getComputedStyle(document.body);
  const colors = [styles.getPropertyValue('--accent'), styles.getPropertyValue('--accent-2'), '#ffc94d', '#ffffff'];
  const parts = Array.from({ length: 160 }, () => ({
    x: innerWidth / 2, y: innerHeight / 3,
    vx: (Math.random() - 0.5) * 16, vy: Math.random() * -14 - 4,
    size: 5 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  (function frame(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos(i * Math.PI / 3) * p.size, Math.sin(i * Math.PI / 3) * p.size);
      ctx.fill();
      ctx.restore();
    }
    if (now - start < 3200) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  })(start);
}

// ---------- modal ----------
function openModal(content) {
  $('#modal-card').replaceChildren(content);
  $('#modal').hidden = false;
}
function closeModal() {
  $('#modal').hidden = true;
}
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ---------- rewards ----------
function floatXp(amount) {
  const anchor = $('.level-chip').getBoundingClientRect();
  const node = el('div', { class: 'xp-float' }, `+${amount} XP`);
  node.style.left = `${anchor.left + anchor.width / 2 - 30}px`;
  node.style.top = `${anchor.bottom + 4}px`;
  document.body.append(node);
  setTimeout(() => node.remove(), 1500);
}

function showEvents(ev) {
  if (!ev) return;
  if (ev.streak) toast(ev.streak > 1 ? `🔥 Day ${ev.streak} streak! Keep coming back!` : '🔥 Daily bonus! Come back tomorrow to start a streak.', 'streak');
  if (ev.bountyClaimed) toast('🎯 Bounty claimed! Double XP!', 'achievement');
  if (ev.xp) floatXp(ev.xp);
  for (const a of ev.achievements || []) {
    toast(`${a.icon} Achievement unlocked: ${a.name}!`, 'achievement');
    sfx('achieve');
  }
  if (ev.levelUp) showLevelUp(ev.levelUp, ev.unlocks || []);
  if (ev.xp || ev.levelUp || ev.achievements?.length) refreshMe();
}

function showLevelUp(level, unlocks) {
  sfx('level');
  confetti();
  openModal(el('div', { class: 'levelup' },
    el('h3', {}, 'LEVEL UP!'),
    el('div', { class: 'big-level' }, level),
    el('p', { class: 'muted' }, 'Mimiq just got smarter. Keep teaching!'),
    unlocks.length ? el('ul', {}, unlocks.map(u => el('li', {}, `🔓 New ${u.kind}: ${u.name}`))) : null,
    el('button', { class: 'btn primary', type: 'button', onclick: closeModal }, "LET'S GO"),
  ));
}

// ---------- account ----------
let authMode = 'signin';
function setAuthMode(mode) {
  authMode = mode;
  $$('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  $('#auth-submit').textContent = mode === 'signin' ? 'Enter Mimiq234' : 'Join Mimiq234';
  $('#auth-pass').autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
  $('#auth-error').textContent = '';
}
$$('.auth-tab').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.mode)));

$('#auth-form').addEventListener('submit', async e => {
  e.preventDefault();
  const button = $('#auth-submit');
  button.disabled = true;
  $('#auth-error').textContent = '';
  const username = $('#auth-user').value.trim();
  const password = $('#auth-pass').value;
  try {
    if (authMode === 'signup') {
      const problem = await rpc('hive_check_username', { p_username: username });
      if (problem) throw new Error(problem);
      const { data, error } = await sb.auth.signUp({ email: usernameToEmail(username), password, options: { data: { username } } });
      if (error) throw new Error(/registered/i.test(error.message) ? 'That username is already taken' : error.message);
      if (!data.session) throw new Error('Almost there! In Supabase, turn OFF "Confirm email" (README step 3), then sign in.');
    } else {
      const { error } = await sb.auth.signInWithPassword({ email: usernameToEmail(username), password });
      if (error) throw new Error(/invalid login/i.test(error.message) ? 'Wrong username or password' : error.message);
    }
    $('#auth-pass').value = '';
    await boot();
  } catch (err) {
    $('#auth-error').textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut().catch(() => {});
  location.reload();
});

$('#sound-btn').addEventListener('click', async () => {
  const sound = !state.me.user.sound;
  state.me.user.sound = sound;
  $('#sound-btn').textContent = sound ? '🔊' : '🔇';
  await rpc('hive_set_prefs', { p_sound: sound }).catch(err => toast(err.message, 'error'));
  sfx('vote');
  if (state.side === 'style') renderSide();
});

const loadMe = () => rpc('hive_me', { p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || null });

async function refreshMe() {
  state.me = await loadMe();
  applyMe();
  if (state.side === 'badges' || state.side === 'style') renderSide();
}

function applyMe() {
  const { user, counts } = state.me;
  document.body.dataset.theme = user.theme;
  $('#me-name').textContent = user.username;
  $('#me-level').textContent = user.level;
  $('#me-streak').textContent = user.streak;
  $('#me-xp').textContent = `${user.xp} / ${user.levelNext} XP`;
  $('#me-xpfill').style.width = `${Math.min(100, ((user.xp - user.levelFloor) / (user.levelNext - user.levelFloor)) * 100)}%`;
  $('#sound-btn').textContent = user.sound ? '🔊' : '🔇';
  $('#bot-avatar').innerHTML = AVATAR_SVG[user.avatar] || AVATAR_SVG.hex;
  $('#bot-count').textContent = counts[state.bot];
}

function showAuth() {
  $('#app').hidden = true;
  $('#auth').hidden = false;
  $('#auth-user').focus();
}

async function boot() {
  if (!sb) {
    $('#auth').hidden = false;
    $('#auth-form').hidden = true;
    $('.auth-tabs').hidden = true;
    $('#auth-error').textContent = '';
    $('.tagline').textContent = '⚙️ Almost ready! Put your Supabase URL and anon key in public/config.js (README step 4), then reload.';
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showAuth();
  try {
    state.me = await loadMe();
  } catch (err) {
    if (/sign in/i.test(err.message)) {
      await sb.auth.signOut().catch(() => {});
      return showAuth();
    }
    if (/hive_me|schema cache|does not exist/i.test(err.message)) {
      toast('⚙️ The database isn\'t set up yet. Run supabase/schema.sql (README step 2).', 'error');
    } else {
      toast(err.message, 'error');
    }
    return showAuth();
  }
  state.started = true;
  $('#auth').hidden = true;
  $('#app').hidden = false;
  applyMe();
  for (const bot of Object.keys(BOTS)) {
    const box = chatBox(bot);
    if (!box.children.length) addBotMsg(bot, BOTS[bot].hello);
  }
  selectBot(state.bot);
  renderSide();
  showEvents(state.me.events);
}

// ---------- chat ----------
const chatBox = bot => $(`.messages[data-bot="${bot}"]`);

function scrollDown(bot) {
  const box = chatBox(bot);
  box.scrollTop = box.scrollHeight;
}

function selectBot(bot) {
  state.bot = bot;
  $('#chat-panel').dataset.bot = bot;
  $$('.bot-tab').forEach(b => b.classList.toggle('active', b.dataset.bot === bot));
  $$('.messages').forEach(m => { m.hidden = m.dataset.bot !== bot; });
  $('#bot-name').textContent = BOTS[bot].name;
  $('#bot-desc').textContent = BOTS[bot].desc;
  if (state.me) $('#bot-count').textContent = state.me.counts[bot];
  updateComposer();
  scrollDown(bot);
}
$$('.bot-tab').forEach(b => b.addEventListener('click', () => selectBot(b.dataset.bot)));

function changeCount(bot, delta) {
  state.me.counts[bot] = Math.max(0, state.me.counts[bot] + delta);
  if (bot === state.bot) $('#bot-count').textContent = state.me.counts[bot];
}

function updateComposer() {
  $('#prompt').disabled = state.busy;
  $('#send-btn').disabled = state.busy;
  $('#random-btn').disabled = state.busy;
  $('#prompt').placeholder = `Ask ${BOTS[state.bot].name} anything…`;
}

function botShell(bot, extraClass = '') {
  const node = el('div', { class: 'msg bot' },
    el('div', { class: 'mini-avatar', svg: AVATAR_SVG[state.me?.user.avatar] || AVATAR_SVG.hex }),
    el('div', { class: `bubble ${extraClass}` }));
  chatBox(bot).append(node);
  scrollDown(bot);
  return node;
}

function addUserMsg(bot, text) {
  chatBox(bot).append(el('div', { class: 'msg user' }, el('div', { class: 'bubble' }, text)));
  scrollDown(bot);
}

function addBotMsg(bot, text, kind = '') {
  const node = botShell(bot, kind);
  $('.bubble', node).append(richText(text));
  scrollDown(bot);
  return node;
}

function addTyping(bot) {
  const node = botShell(bot);
  $('.bubble', node).append(el('span', { class: 'typing' }, el('i'), el('i'), el('i')));
  return node;
}

async function send(rawText) {
  const bot = state.bot;
  const text = rawText.trim();
  if (!text || state.busy) return;
  addUserMsg(bot, text);
  $('#prompt').value = '';
  state.busy = true;
  updateComposer();
  sfx('send');
  const typing = addTyping(bot);
  try {
    const [res] = await Promise.all([rpc('hive_ask', { p_bot: bot, p_prompt: text }), sleep(400 + Math.random() * 400)]);
    typing.remove();
    if (res.type === 'answer') {
      addAnswerMsg(bot, res.answer);
      sfx('receive');
    } else if (res.type === 'unknown') {
      addUnknownMsg(bot, res.prompt, res);
    } else {
      addBotMsg(bot, res.text, res.type === 'blocked' ? 'blocked' : '');
      sfx(res.type === 'blocked' ? 'error' : 'receive');
    }
  } catch (err) {
    typing.remove();
    addBotMsg(bot, `⚠️ ${err.message}`, 'blocked');
  } finally {
    state.busy = false;
    updateComposer();
    $('#prompt').focus();
  }
}

$('#composer').addEventListener('submit', e => {
  e.preventDefault();
  send($('#prompt').value);
});

$('#random-btn').addEventListener('click', async () => {
  try {
    const { prompt } = await rpc('hive_random', { p_bot: state.bot });
    if (prompt) send(prompt);
    else toast('🤷 Nothing has been taught to this bot yet. Be the first!');
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ---------- answers ----------
function addAnswerMsg(bot, answer, opts = {}) {
  const node = botShell(bot, 'wide');
  node.dataset.answerId = answer.id;
  node._answer = answer;
  node._note = opts.note;
  renderAnswer(node);
  scrollDown(bot);
  return node;
}

function renderAnswer(node) {
  const a = node._answer;
  const bubble = $('.bubble', node);
  const meta = [`🦜 taught by @${a.author || 'someone'}`, `used ${a.uses}×`];
  if (a.editor) meta.push(`✏️ edited by @${a.editor}`);
  bubble.replaceChildren(...[
    node._note ? el('p', { class: 'note' }, node._note) : null,
    el('div', { class: 'answer-text' }, richText(a.text)),
    el('div', { class: 'answer-meta' },
      meta.map(m => el('span', {}, m)),
      a.best ? el('span', { class: 'badge-best' }, '⭐ Top answer') : null),
    el('div', { class: 'answer-actions' },
      el('button', { class: `vote up ${a.myVote === 1 ? 'on' : ''}`, type: 'button', title: 'Good answer', onclick: () => castVote(node, 1) }, '👍', el('span', {}, a.up)),
      el('button', { class: `vote down ${a.myVote === -1 ? 'on' : ''}`, type: 'button', title: 'Bad answer', onclick: () => castVote(node, -1) }, '👎', el('span', {}, a.down)),
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn small ghost', type: 'button', onclick: () => startEdit(node) }, '✏️ Change answer'),
      el('button', { class: 'btn small ghost', type: 'button', title: 'Answer history', onclick: () => openHistory(a) }, '🕘')),
    a.down > a.up ? el('div', { class: 'risk' }, '⚠️ People aren’t sure about this answer. Too many 👎 and it gets voted out!') : null,
  ].filter(Boolean));
}

function answerNodes(id) {
  return $$(`.msg[data-answer-id="${id}"]`);
}

function updateAnswer(answer) {
  for (const node of answerNodes(answer.id)) {
    if (node.classList.contains('deleted')) continue;
    node._answer = answer;
    if (!node.classList.contains('editing')) renderAnswer(node);
  }
}

function markDeleted(answer) {
  for (const node of answerNodes(answer.id)) {
    if (node.classList.contains('deleted')) continue;
    node.classList.add('deleted');
    node.classList.remove('editing');
    const bubble = $('.bubble', node);
    bubble.replaceChildren(
      el('div', { class: 'answer-text' }, richText(answer.text)),
      el('div', { class: 'voted-out' }, '🗑️ Voted out by players',
        el('button', {
          class: 'btn small', type: 'button',
          onclick: () => addUnknownMsg(answer.bot, answer.prompt, { intro: `Teach me a better answer for “${answer.prompt}”:` }),
        }, 'Teach a better answer')),
    );
  }
}

async function castVote(node, value) {
  const a = node._answer;
  try {
    const res = await rpc('hive_vote', { p_answer_id: a.id, p_value: value });
    sfx('vote');
    if (res.deleted) {
      markDeleted(a);
      changeCount(a.bot, -1);
      toast('🗑️ That answer got voted out!');
    } else {
      updateAnswer(res.answer);
    }
    showEvents(res.events);
  } catch (err) {
    if (err.data?.code === 'gone') markDeleted(a);
    toast(err.message, 'error');
  }
}

function startEdit(node) {
  const a = node._answer;
  node.classList.add('editing');
  $('.bubble', node).replaceChildren(teachBox({
    prompt: a.prompt,
    initial: a.text,
    title: `✏️ Change the answer for “${a.prompt}”`,
    note: 'Changing an answer resets its votes to 0. The old version is saved in the history.',
    submitLabel: 'Save change',
    onSubmit: async text => {
      const res = await rpc('hive_change_answer', { p_answer_id: a.id, p_answer: text });
      node.classList.remove('editing');
      updateAnswer(res.answer);
      toast('✏️ Answer updated!');
      sfx('learn');
      showEvents(res.events);
    },
    onCancel: () => {
      node.classList.remove('editing');
      renderAnswer(node);
    },
  }));
}

async function openHistory(answer) {
  try {
    const { history } = await rpc('hive_history', { p_answer_id: answer.id });
    const current = answerNodes(answer.id)[0]?._answer || answer;
    openModal(el('div', {},
      el('h3', {}, '🕘 Answer history'),
      el('p', { class: 'muted' }, `“${answer.prompt}”`),
      el('div', { class: 'hist current' }, el('span', { class: 'hist-label' }, 'Current answer'), richText(current.text)),
      history.length
        ? history.map(h => el('div', { class: 'hist' },
          el('span', { class: 'hist-label' }, `Replaced by @${h.by} · ${timeAgo(h.at)}`),
          richText(h.text),
          el('div', {}, el('button', {
            class: 'btn small ghost', type: 'button',
            onclick: async () => {
              try {
                const res = await rpc('hive_restore', { p_answer_id: answer.id, p_history_id: h.id });
                updateAnswer(res.answer);
                closeModal();
                toast('↩️ Old answer restored');
              } catch (err) {
                toast(err.message, 'error');
              }
            },
          }, '↩️ Restore this'))))
        : el('p', { class: 'muted' }, 'No changes yet. This is the original answer.'),
      el('div', { class: 'teach-row' }, el('button', { class: 'btn small', type: 'button', onclick: closeModal }, 'Close')),
    ));
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------- teaching ----------
function tipBanner(prompt, textarea) {
  const timeSensitive = TIME_WORDS.test(prompt);
  const tip = el('div', { class: `tip ${timeSensitive ? 'hot' : ''}` });
  const update = () => {
    const hasLink = /https?:\/\/\S+/i.test(textarea.value);
    tip.classList.toggle('ok', hasLink);
    tip.textContent = hasLink
      ? '✅ Nice! You added a link so people can always check the latest info.'
      : timeSensitive
        ? '💡 Tip: This sounds like something that changes over time. Add a link (like https://…) so the answer never goes out of date!'
        : '💡 Tip: If the answer changes over time (weather, scores, prices, news…), add a link so people can check the latest info!';
  };
  textarea.addEventListener('input', update);
  update();
  return tip;
}

function teachBox({ prompt, initial = '', title, note, bounty, submitLabel, cancelLabel = 'Cancel', onSubmit, onCancel }) {
  const textarea = el('textarea', { maxlength: 1000, placeholder: 'Type how the bot should reply…', rows: 3 });
  textarea.value = initial;
  const error = el('div', { class: 'teach-error', role: 'alert' });
  const submit = el('button', { class: 'btn primary small', type: 'submit' }, submitLabel);
  const form = el('form', { class: 'teach' },
    tipBanner(prompt, textarea),
    title ? el('p', { class: 'unknown-title' }, title) : null,
    bounty ? el('span', { class: 'bounty-tag' }, '🎯 BOUNTY · 2× XP') : null,
    textarea,
    note ? el('div', { class: 'teach-note' }, note) : null,
    error,
    el('div', { class: 'teach-row' },
      el('button', { class: 'btn small ghost', type: 'button', onclick: onCancel }, cancelLabel),
      submit),
  );
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = textarea.value.trim();
    if (!text) {
      error.textContent = 'Type an answer first!';
      return;
    }
    submit.disabled = true;
    error.textContent = '';
    try {
      await onSubmit(text);
    } catch (err) {
      error.textContent = err.message;
      sfx('error');
    } finally {
      submit.disabled = false;
    }
  });
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit();
  });
  setTimeout(() => textarea.focus(), 50);
  return form;
}

function addUnknownMsg(bot, prompt, { suggestions = [], bounty = false, intro } = {}) {
  const node = botShell(bot, 'wide');
  const bubble = $('.bubble', node);
  bubble.append(...[
    el('p', { class: 'unknown-title' }, intro || 'Hmm… I don’t know this prompt, how should I reply?'),
    suggestions.length ? el('div', { class: 'suggest' }, 'Did you mean:',
      suggestions.map(s => el('button', { class: 'chip', type: 'button', onclick: () => send(s.prompt) }, s.prompt))) : null,
    teachBox({
      prompt,
      bounty,
      submitLabel: 'Teach the bot',
      cancelLabel: 'Skip',
      onSubmit: async text => {
        try {
          const res = await rpc('hive_teach', { p_bot: bot, p_prompt: prompt, p_answer: text });
          bubble.replaceChildren(el('p', {}, `✅ Learned! Next time someone asks “${prompt}”, I’ll say that.`));
          changeCount(bot, 1);
          sfx('learn');
          showEvents(res.events);
          if (state.side === 'bounties') renderSide();
        } catch (err) {
          if (err.data?.code !== 'already_taught') throw err;
          bubble.replaceChildren(el('p', {}, '😮 Someone taught me that while you were typing! Here’s their answer:'));
          addAnswerMsg(bot, err.data.answer);
        }
      },
      onCancel: () => bubble.replaceChildren(el('p', { class: 'muted' }, 'Okay, skipped! Ask me something else.')),
    }),
  ].filter(Boolean));
  scrollDown(bot);
  sfx('receive');
}

// ---------- side panel ----------
$$('.side-tabs button').forEach(b => b.addEventListener('click', () => {
  state.side = b.dataset.side;
  renderSide();
}));

async function renderSide() {
  $$('.side-tabs button').forEach(b => b.classList.toggle('active', b.dataset.side === state.side));
  const body = $('#side-body');
  const panel = state.side;
  try {
    const content = await ({ bounties: bountiesPanel, ranks: ranksPanel, friends: friendsPanel, badges: badgesPanel, style: stylePanel })[panel]();
    if (state.side === panel) body.replaceChildren(content);
  } catch (err) {
    body.replaceChildren(el('p', { class: 'empty' }, `⚠️ ${err.message}`));
  }
}

async function bountiesPanel() {
  const { bounties } = await rpc('hive_bounties');
  return el('div', {},
    el('h3', {}, 'BOUNTY BOARD'),
    el('p', { class: 'side-intro' }, 'Questions people asked the public bot that nobody has taught yet. Teach one for 2× XP!'),
    bounties.length
      ? el('ul', { class: 'list' }, bounties.map(b => el('li', { class: 'row' },
        el('div', { class: 'row-main' },
          el('span', { class: 'row-title' }, b.prompt),
          el('span', { class: 'row-sub' }, `asked ${b.asks}× ${b.mine ? '· you asked this one' : '· 🎯 2× XP'}`)),
        el('button', { class: 'btn small', type: 'button', onclick: () => teachBounty(b) }, 'Teach'))))
      : el('p', { class: 'empty' }, '🧠 No bounties! Mimiq knows everything people have asked… for now.'),
  );
}

function teachBounty(bounty) {
  selectBot('public');
  addUnknownMsg('public', bounty.prompt, { bounty: !bounty.mine, intro: `🎯 Bounty: “${bounty.prompt}”. How should I reply?` });
  if (innerWidth <= 980) $('#chat-panel').scrollIntoView({ behavior: 'smooth' });
}

async function ranksPanel() {
  const data = await rpc('hive_leaderboard');
  const rows = state.board === 'weekly' ? data.weekly : data.allTime;
  const medal = i => ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
  const segButton = (id, label) => el('button', {
    type: 'button', class: state.board === id ? 'active' : '',
    onclick: () => { state.board = id; renderSide(); },
  }, label);
  return el('div', {},
    el('h3', {}, 'TOP TEACHERS'),
    el('div', { class: 'seg' }, segButton('weekly', 'This week'), segButton('allTime', 'All time')),
    rows.length
      ? el('ul', { class: 'list' }, rows.map((r, i) => el('li', { class: `row ${r.me ? 'me' : ''}` },
        el('span', { class: 'rank' }, medal(i)),
        el('div', { class: 'row-main' },
          el('span', { class: 'row-title' }, `@${r.username}${r.me ? ' (you)' : ''}`),
          el('span', { class: 'row-sub' }, `Level ${r.level}`)),
        el('span', { class: 'score' }, `${r.score} XP`))))
      : el('p', { class: 'empty' }, 'No XP earned this week yet. Grab the #1 spot!'),
  );
}

async function friendsPanel() {
  const { friends } = await rpc('hive_friends');
  const code = state.me.user.friendCode;
  const input = el('input', { placeholder: 'MIMIQ-XXXXX', maxlength: 13, 'aria-label': "Friend's code" });
  const form = el('form', { class: 'add-friend' }, input, el('button', { class: 'btn small', type: 'submit' }, 'Add'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const res = await rpc('hive_add_friend', { p_code: input.value });
      toast(`🤝 You and @${res.friend} are now friends!`);
      showEvents(res.events);
      await refreshMe();
      renderSide();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  return el('div', {},
    el('div', { class: 'code-card' },
      el('div', { class: 'muted' }, 'Your friend code'),
      el('div', { class: 'code' }, code),
      el('button', {
        class: 'btn small', type: 'button',
        onclick: () => navigator.clipboard?.writeText(code).then(() => toast('📋 Friend code copied!'), () => toast(code)),
      }, '📋 Copy code')),
    el('h3', {}, 'ADD A FRIEND'),
    form,
    el('h3', {}, `FRIENDS (${friends.length})`),
    friends.length
      ? el('ul', { class: 'list' }, friends.map(f => el('li', { class: 'row' },
        el('div', { class: 'row-main' },
          el('span', { class: 'row-title' }, `@${f.username}`),
          el('span', { class: 'row-sub' }, `Level ${f.level} · 🔥 ${f.streak}`)),
        el('button', {
          class: 'btn small danger', type: 'button', title: 'Remove friend',
          onclick: async () => {
            if (!confirm(`Remove @${f.username} from your friends?`)) return;
            await rpc('hive_remove_friend', { p_friend: f.id }).catch(err => toast(err.message, 'error'));
            await refreshMe();
            renderSide();
          },
        }, '✕'))))
      : el('p', { class: 'empty' }, 'No friends yet. Share your code so friends can add you, and you all get a shared Chorus bot!'),
  );
}

function badgesPanel() {
  const { achievements, stats } = state.me;
  const earned = achievements.filter(a => a.earned).length;
  const stat = (n, label) => el('div', { class: 'stat' }, el('b', {}, n), el('small', {}, label));
  return el('div', {},
    el('div', { class: 'stat-grid' },
      stat(stats.taught, 'taught'), stat(stats.bounties, 'bounties'), stat(stats.votesCast, 'votes'), stat(stats.changes, 'fixes')),
    el('h3', {}, `ACHIEVEMENTS ${earned}/${achievements.length}`),
    el('p', { class: 'side-intro' }, 'Each achievement gives +25 XP.'),
    el('div', { class: 'badges' }, achievements.map(a => el('div', { class: `badge ${a.earned ? 'earned' : 'locked'}` },
      el('span', { class: 'ico' }, a.earned ? a.icon : '🔒'),
      el('b', {}, a.name),
      el('small', {}, a.desc)))),
  );
}

function stylePanel() {
  const { user, themes, avatars } = state.me;
  const choose = async (field, id) => {
    try {
      await rpc('hive_set_prefs', { [`p_${field}`]: id });
      await refreshMe();
      renderSide();
      sfx('vote');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  const lockLabel = item => (user.level < item.level ? `🔒 LV ${item.level}` : item.name);
  return el('div', {},
    el('h3', {}, 'COLOR THEME'),
    el('div', { class: 'picker' }, themes.map(t => el('button', {
      class: `pick ${user.theme === t.id ? 'active' : ''}`, type: 'button',
      disabled: user.level < t.level, onclick: () => choose('theme', t.id),
    }, el('span', { class: 'swatch', style: `background:${THEME_SWATCH[t.id]}` }), lockLabel(t)))),
    el('h3', {}, 'BOT AVATAR'),
    el('div', { class: 'picker' }, avatars.map(a => el('button', {
      class: `pick ${user.avatar === a.id ? 'active' : ''}`, type: 'button',
      disabled: user.level < a.level, onclick: () => choose('avatar', a.id),
    }, el('span', { class: 'avatar-pick', svg: AVATAR_SVG[a.id] }), lockLabel(a)))),
    el('div', { class: 'toggle-row' },
      el('span', {}, user.sound ? '🔊 Sound effects on' : '🔇 Sound effects off'),
      el('button', { class: 'btn small', type: 'button', onclick: () => $('#sound-btn').click() }, user.sound ? 'Turn off' : 'Turn on')),
  );
}

// ---------- start ----------
$$('[data-logo]').forEach(n => { n.innerHTML = AVATAR_SVG.hex; });
boot();
