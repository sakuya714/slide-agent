// slide-agent 編集画面
// 資料（deck.html）は iframe に読み込んで、その DOM を直接いじる。保存時に編集用の目印を全部外して書き戻す。
// 画面の作り：上の帯（道具）／左＝スライド／中央＝編集中のスライド／右＝選んだものの書式。資料の一覧はホーム画面。

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const KIT_ATTRS = ['data-kit-cur', 'data-kit-sel', 'data-kit-hover', 'contenteditable', 'spellcheck'];
const EDIT_CSS = `
html, body { margin:0 !important; padding:0 !important; gap:0 !important; background:transparent !important; display:block !important; overflow:hidden !important; }
.slide { box-shadow:none !important; }
.slide:not([data-kit-cur]) { display:none !important; }
[data-kit-hover]:not([data-kit-sel]):not([contenteditable]) { outline:1px dashed rgba(123,155,255,.75) !important; outline-offset:2px; }
[data-kit-sel] { outline:2px solid #5b84ff !important; outline-offset:2px; }
section.slide[data-kit-sel] { outline-offset:-2px; }
[contenteditable] { outline:2px solid #e2a43b !important; outline-offset:2px; cursor:text !important; }
a { pointer-events:none; }
`;
const THUMB_CSS = `html,body{margin:0!important;padding:0!important;gap:0!important;background:none!important;display:block!important;overflow:hidden!important}.slide{box-shadow:none!important}`;
const PRESENT_CSS = `${THUMB_CSS}html,body{background:#000!important}.slide:not([data-p]){display:none!important}`;
const CLIP_TYPE = 'application/x-slide-agent';

// 新しいスライドのレイアウト（PowerPoint の「新しいスライド」にあたる）
const LAYOUTS = [
  ['タイトル', `<section class="slide" data-bg="dark" data-align="center">
  <p class="eyebrow">サブタイトル</p>
  <h1>資料のタイトル</h1>
  <p class="muted">提案者・日付</p>
  <aside class="notes"></aside>
</section>`],
  ['見出しと本文', `<section class="slide">
  <p class="eyebrow">01 ｜ 章の名前</p>
  <h2>このスライドで言いたいこと</h2>
  <p class="lead">本文。ダブルクリックで直せる。</p>
  <aside class="notes"></aside>
</section>`],
  ['箇条書き', `<section class="slide">
  <p class="eyebrow">01 ｜ 章の名前</p>
  <h2>このスライドで言いたいこと</h2>
  <ul>
    <li>1つ目のポイント</li>
    <li>2つ目のポイント</li>
    <li>3つ目のポイント</li>
  </ul>
  <aside class="notes"></aside>
</section>`],
  ['カード3つ', `<section class="slide">
  <p class="eyebrow">01 ｜ 章の名前</p>
  <h2>このスライドで言いたいこと</h2>
  <div class="grid cols-3">
    <div class="card"><h3>1つ目</h3><p>説明を短く。</p></div>
    <div class="card"><h3>2つ目</h3><p>説明を短く。</p></div>
    <div class="card"><h3>3つ目</h3><p>説明を短く。</p></div>
  </div>
  <aside class="notes"></aside>
</section>`],
  ['数字で見せる', `<section class="slide">
  <p class="eyebrow">01 ｜ 章の名前</p>
  <h2>数字が示すこと</h2>
  <div class="grid cols-3">
    <div class="stat"><span class="num">120</span><span class="label">説明</span></div>
    <div class="stat"><span class="num">45%</span><span class="label">説明</span></div>
    <div class="stat"><span class="num">3倍</span><span class="label">説明</span></div>
  </div>
  <aside class="notes"></aside>
</section>`],
  ['左右に分ける', `<section class="slide">
  <div class="split">
    <div>
      <p class="eyebrow">01 ｜ 章の名前</p>
      <h2>左に言いたいこと</h2>
      <p>説明を短く。右の箱は選んで「挿入 → 画像」で写真に替えられる。</p>
    </div>
    <div class="card"><h3>右側</h3><p>補足・図・写真など。</p></div>
  </div>
  <aside class="notes"></aside>
</section>`],
  ['区切り', `<section class="slide" data-bg="dark" data-align="center">
  <p class="eyebrow">第2章</p>
  <h2>章の名前</h2>
  <aside class="notes"></aside>
</section>`],
  ['まとめ', `<section class="slide" data-align="center">
  <p class="eyebrow">まとめ</p>
  <h2>一番伝えたいこと</h2>
  <p class="lead muted">補足を1行で。</p>
  <aside class="notes"></aside>
</section>`],
  ['白紙', `<section class="slide">
  <aside class="notes"></aside>
</section>`],
];

// 挿入できる部品（テーマのクラス）。上の帯の「文字」「カード」のメニュー
const INSERTS = {
  text: [
    ['見出し', '<h2>見出し</h2>'],
    ['小見出し', '<h3>小見出し</h3>'],
    ['本文', '<p>本文</p>'],
    ['箇条書き', '<ul>\n  <li>項目</li>\n  <li>項目</li>\n</ul>'],
    '-',
    ['見出しの上の文字（章の名前など）', '<p class="eyebrow">01 ｜ 章の名前</p>'],
    ['縦線つきの文（言いたいこと）', '<p class="bar">伝えたいこと</p>'],
    ['タグ', '<span class="tag">タグ</span>'],
  ],
  block: [
    ['カード2つ', '<div class="grid cols-2">\n  <div class="card"><h3>1つ目</h3><p>説明</p></div>\n  <div class="card"><h3>2つ目</h3><p>説明</p></div>\n</div>'],
    ['カード3つ', '<div class="grid cols-3">\n  <div class="card"><h3>1つ目</h3><p>説明</p></div>\n  <div class="card"><h3>2つ目</h3><p>説明</p></div>\n  <div class="card"><h3>3つ目</h3><p>説明</p></div>\n</div>'],
    ['数字3つ', '<div class="grid cols-3">\n  <div class="stat"><span class="num">120</span><span class="label">説明</span></div>\n  <div class="stat"><span class="num">45%</span><span class="label">説明</span></div>\n  <div class="stat"><span class="num">3倍</span><span class="label">説明</span></div>\n</div>'],
    '-',
    ['余白（後ろを下に寄せる）', '<div class="spacer"></div>'],
    ['下の帯（資料名・ページ）', '<div class="footer"><span>資料名</span><span>1</span></div>'],
  ],
};

// 画面のアイコン（20×20、線で描く）。HTML 側は data-icon="名前" で入る
const ICONS = {
  undo: '<path d="M7.5 5 3.5 9l4 4M4 9h7.5a4.5 4.5 0 0 1 0 9H9"/>',
  redo: '<path d="m12.5 5 4 4-4 4M16 9H8.5a4.5 4.5 0 0 0 0 9H11"/>',
  plus: '<path d="M10 4.5v11M4.5 10h11"/>',
  copy: '<rect x="7" y="7" width="9.5" height="9.5" rx="1.6"/><path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 4 5v6a1.5 1.5 0 0 0 1.5 1.5H7"/>',
  trash: '<path d="M4 6h12M8 6V4.3h4V6M5.6 6l.7 9.6a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9L14.4 6"/>',
  up: '<path d="M10 15.5v-11M5.5 9 10 4.5 14.5 9"/>',
  down: '<path d="M10 4.5v11M5.5 11 10 15.5 14.5 11"/>',
  text: '<path d="M4.5 5.5V4h11v1.5M10 4v12M7.5 16h5"/>',
  card: '<rect x="3" y="4.5" width="14" height="11" rx="2"/><path d="M6 8.5h5M6 11.5h8"/>',
  image: '<rect x="3" y="4" width="14" height="12" rx="1.6"/><circle cx="7.3" cy="8" r="1.3"/><path d="m3.5 14 4-3.8 3 2.8 2.2-2 3.8 3.5"/>',
  grid: '<rect x="3" y="3.5" width="6" height="5.5" rx="1"/><rect x="11" y="3.5" width="6" height="5.5" rx="1"/><rect x="3" y="11" width="6" height="5.5" rx="1"/><rect x="11" y="11" width="6" height="5.5" rx="1"/>',
  play: '<path d="M6.5 4.5v11l8.5-5.5z" fill="currentColor"/>',
  back: '<path d="M12.5 4.5 7 10l5.5 5.5"/>',
  search: '<circle cx="9" cy="9" r="5"/><path d="m13 13 3.5 3.5"/>',
  folder: '<path d="M3 6.2A1.7 1.7 0 0 1 4.7 4.5h3.1l1.7 1.8h5.8A1.7 1.7 0 0 1 17 8v6.3a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 14.3z"/>',
  stack: '<rect x="3" y="5.5" width="14" height="10" rx="1.6"/><path d="M5.5 3.2h9"/>',
  caret: '<path d="m6.5 8.5 3.5 3.5 3.5-3.5"/>',
};
function icon(name, size = 18) {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="ic ic-${name}" viewBox="0 0 20 20" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return t.content.firstChild;
}

const NAMES = { h1: '大見出し', h2: '見出し', h3: '小見出し', p: '本文', li: '項目', ul: '箇条書き', ol: '番号付き', img: '画像', div: '箱', span: '文字', em: '強調', strong: '太字', b: '太字', section: 'スライド', svg: '図', table: '表', small: '小さい文字', br: '改行', a: 'リンク', figure: '図', aside: 'ノート' };
const CLASS_NAMES = { eyebrow: '見出しの上の文字', card: 'カード', stat: '数字', num: '数字', label: '説明', tag: 'タグ', footer: '下の帯', grid: '並び', split: '左右', bar: '縦線つきの文', lead: 'リード文', photo: '写真', bg: '背景の写真', shade: '写真を暗くする幕', row: '横並び', spacer: '余白' };
const VAR_LABELS = { ink: '文字', paper: '地', paper2: '箱の地', accent: 'アクセント', 'accent-soft': 'アクセント（薄）', muted: '薄い文字', 'muted-on-dark': '薄い文字（暗い地）', dark: '暗い地', dark2: '暗い地の箱', line: '線' };

const S = {
  path: null, version: null, doc: null, cur: 0, sel: null, editing: null, editBefore: '',
  undo: [], redo: [], snap: null, dirty: false, saving: false, saveTimer: null, conflict: false,
  zoom: 'fit', focus: 'stage', issues: null, menu: null, menuAnchor: null, exporting: false,
};

// ---------- 小物 ----------
const api = async (method, url, body) => {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 409) throw new Error(data.detail || `${r.status}`);
  return Array.isArray(data) ? data : { status: r.status, ...data };
};
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
let toastTimer;
function toast(msg, { ms = 2400, actions = [] } = {}) {
  const t = $('#toast');
  t.replaceChildren(...[].concat(msg).map((m) => (m.nodeType ? m : el('span', {}, m))), ...actions);
  t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const setStatus = (cls, text) => { const s = $('#status'); s.className = 'status ' + cls; s.textContent = text; };
const slides = () => (S.doc ? $$('section.slide', S.doc) : []);
const curSlide = () => slides()[S.cur];
const cssOf = (e) => S.doc.defaultView.getComputedStyle(e);
const isInlineEl = (e) => ['inline', 'contents'].includes(cssOf(e).display);
const hasBlockKids = (e) => [...e.children].some((c) => !c.matches('br, aside.notes') && !isInlineEl(c));
const isSlide = (n) => n?.matches?.('section.slide');
const dialogOpen = () => $('#dlg').open;
const typing = () => {
  const a = document.activeElement;
  return (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) || !!S.editing;
};
const ago = (t) => {
  const s = Date.now() / 1000 - t;
  if (s < 60) return 'たった今';
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}日前`;
  const d = new Date(t * 1000);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 無視 */ } },
};
// 資料の文書の中で HTML から要素を作る
function fromHTML(html) {
  const t = S.doc.createElement('template');
  t.innerHTML = html.trim();
  return [...t.content.children];
}

// ---------- 書き出し用にきれいにする ----------
function clean(root) {
  root.querySelectorAll('style[data-kit="edit"], base[data-kit="base"]').forEach((e) => e.remove());
  const sel = KIT_ATTRS.map((a) => `[${a}]`).join(',');
  [root, ...root.querySelectorAll(sel)].forEach((e) => KIT_ATTRS.forEach((a) => e.removeAttribute?.(a)));
  return root;
}
function serialize() {
  const html = clean(S.doc.documentElement.cloneNode(true)).outerHTML;
  return '<!doctype html>\n' + html + '\n';
}
const varsStyle = () => S.doc?.querySelector('style[data-kit="vars"]');

// ---------- 元に戻す ----------
function takeSnap() {
  const body = clean(S.doc.body.cloneNode(true)).innerHTML;
  return { body, vars: varsStyle()?.textContent ?? '', cur: S.cur };
}
function commit({ structural = false } = {}) {
  if (!S.doc) return;
  const snap = takeSnap();
  if (S.snap && snap.body === S.snap.body && snap.vars === S.snap.vars) return;
  if (S.snap) S.undo.push(S.snap);
  if (S.undo.length > 200) S.undo.shift();
  S.redo = [];
  S.snap = snap;
  markDirty();
  if (structural) renderThumbs(); else refreshThumb(S.cur);
  updateUndoBtns();
}
// at：戻したあとに見せるスライド（取り消した変更があったスライド）
function restore(snap, at = snap.cur) {
  S.doc.body.innerHTML = snap.body;
  if (varsStyle()) varsStyle().textContent = snap.vars;
  S.snap = { ...snap, cur: at };
  S.sel = null; S.editing = null;
  showSlide(Math.min(at, slides().length - 1));
  renderThumbs();
  markDirty();
  updateUndoBtns();
}
function undo() {
  if (S.editing) endEdit();
  if (!S.undo.length) return;
  const at = S.snap?.cur ?? S.cur;
  S.redo.push({ ...takeSnap(), cur: at });
  restore(S.undo.pop(), at);
}
function redo() {
  if (S.editing) endEdit();
  if (!S.redo.length) return;
  const next = S.redo.pop();
  S.undo.push(takeSnap());
  restore(next, next.cur);
}
function updateUndoBtns() { $('#undoBtn').disabled = !S.undo.length; $('#redoBtn').disabled = !S.redo.length; }

// ---------- 保存 ----------
function markDirty() {
  S.dirty = true;
  setStatus('dirty', '未保存');
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(save, 1000);
}
async function save({ force = false } = {}) {
  clearTimeout(S.saveTimer);
  if (!S.path || !S.doc || S.saving || (!S.dirty && !force)) return;
  if (S.conflict && !force) return;
  S.saving = true;
  setStatus('saving', '保存中…');
  try {
    const r = await api('PUT', '/api/deck', { path: S.path, html: serialize(), base: S.version, force });
    if (r.status === 409) { showConflict(); setStatus('error', '保存できていない'); return; }
    S.version = r.version; S.dirty = false; S.conflict = false; hideBanner();
    setStatus('saved', '保存済み');
  } catch (e) {
    setStatus('error', '保存に失敗：' + e.message);
  } finally {
    S.saving = false;
  }
}

// AI（や別の画面）がファイルを直したら反映する
async function poll() {
  if (!S.path || S.saving || document.hidden || P.on) return;
  try {
    const r = await api('GET', `/api/stat?path=${encodeURIComponent(S.path)}`);
    if (r.version === S.version) return;
    if (S.dirty || S.editing) { showConflict(); return; }
    await openDeck(S.path, { keepPlace: true });
    toast('ファイルの変更を反映しました');
  } catch { /* 資料が消えたなど。次で再確認 */ }
}
function showConflict() {
  if (S.conflict) return;
  S.conflict = true;
  const b = $('#banner');
  b.replaceChildren(
    el('span', {}, 'この資料が外で変更されました（AI が直した等）。'),
    el('button', { class: 'primary', onclick: () => { S.conflict = false; hideBanner(); openDeck(S.path, { keepPlace: true }); } }, '外の変更を読み込む'),
    el('button', { onclick: () => { S.conflict = false; hideBanner(); save({ force: true }); } }, 'この画面の内容で上書き'),
  );
  b.hidden = false;
}
function hideBanner() { $('#banner').hidden = true; }

// ---------- ホーム（資料の一覧） ----------
let HOME = [];          // 資料の一覧（平ら）
let FOLDERS = [];       // フォルダの階層
async function showHome() {
  if (S.editing) endEdit();
  if (S.dirty) await save();
  closeMenu();
  S.path = null; S.doc = null; S.sel = null; S.issues = null;
  $('#frame').removeAttribute('srcdoc');
  document.body.classList.add('mode-home');
  document.body.classList.remove('view-grid');
  $('#main').hidden = true; $('#home').hidden = false;
  document.title = 'Slide Agent';
  history.replaceState(null, '', location.pathname);
  hideBanner();
  try {
    const tree = await api('GET', '/api/tree');
    HOME = flatten(tree);
    FOLDERS = tree;
  } catch (e) { $('#homeBody').textContent = '一覧を読めない：' + e.message; return; }
  renderHome();
}
function flatten(items, out = []) {
  for (const it of items) {
    if (it.type === 'deck') out.push({ ...it, folder: it.path.split('/').slice(0, -1).join('/') });
    else flatten(it.children, out);
  }
  return out;
}
const countIn = (folder) => HOME.filter((d) => !folder || d.folder === folder || d.folder.startsWith(folder + '/')).length;
// 選んでいるフォルダ（'' は「すべて」）。次に開いたときも同じフォルダから
const homeFolder = () => {
  const f = store.get('kit.folder', '');
  return f && countIn(f) ? f : '';
};
function renderHome() {
  renderHomeNav();
  const q = $('#homeSearch').value.trim().toLowerCase();
  const f = homeFolder();
  const body = $('#homeBody');
  if (!HOME.length) {
    body.replaceChildren(el('div', { class: 'home-empty' },
      el('p', {}, 'まだ資料が無い。Claude Code に「〇〇の資料作って」と頼むか、右上の「新しい資料」から作る。')));
    return;
  }
  // 検索は全部のフォルダから。そうでなければ選んだフォルダ（中のフォルダも含む）
  const list = HOME.filter((d) => (q ? d.path.toLowerCase().includes(q) : !f || d.folder === f || d.folder.startsWith(f + '/')))
    .sort((a, b) => b.mtime - a.mtime);
  const title = q ? [el('span', {}, `「${$('#homeSearch').value.trim()}」の検索結果`)]
    : f ? f.split('/').flatMap((p, i, arr) => [i ? el('span', { class: 'sep' }, '›') : null,
      el('button', { class: 'crumb', onclick: () => { store.set('kit.folder', arr.slice(0, i + 1).join('/')); renderHome(); } }, p)])
      : [el('span', {}, 'すべての資料')];
  body.replaceChildren(
    el('div', { class: 'home-title' }, el('h2', {}, ...title), el('span', { class: 'count' }, `${list.length} 件`)),
    list.length ? el('div', { class: 'home-grid' }, list.map((d) => deckCard(d, q || d.folder !== f ? d.folder : ''))) : el('p', { class: 'home-none' }, '見つからない'));
}
function renderHomeNav() {
  const f = homeFolder();
  const q = $('#homeSearch').value.trim();
  const row = (label, path, depth, n) => el('button', {
    class: 'nav-row' + (!q && path === f ? ' on' : ''), style: `--depth:${depth}`, title: path || 'すべての資料',
    onclick: () => { store.set('kit.folder', path); $('#homeSearch').value = ''; renderHome(); },
  }, el('span', { class: 'nav-ic' }, icon(path ? 'folder' : 'stack', 16)), el('span', { class: 'nav-name' }, label), el('span', { class: 'nav-n' }, String(n)));
  const rows = [row('すべての資料', '', 0, HOME.length)];
  const walk = (items, depth) => {
    for (const it of items) {
      if (it.type !== 'folder') continue;
      rows.push(row(it.name, it.path, depth, countIn(it.path)));
      walk(it.children, depth + 1);
    }
  };
  walk(FOLDERS, 0);
  $('#homeNav').replaceChildren(el('div', { class: 'nav-head' }, 'フォルダ'), ...rows);
}
function deckCard(d, where = '') {
  const f = el('iframe', { loading: 'lazy', tabindex: '-1', 'aria-hidden': 'true', src: `/deck/${enc(d.path)}/deck.html` });
  f.addEventListener('load', () => {
    try {
      const doc = f.contentDocument;
      const st = doc.createElement('style');
      st.textContent = `${THUMB_CSS} .slide ~ .slide{display:none!important}`;
      doc.head.append(st);
      f.classList.add('ready');
    } catch { /* 読めなくても名前は出る */ }
  });
  const box = el('div', { class: 'dthumb' }, f);
  new ResizeObserver(() => { f.style.transform = `scale(${box.clientWidth / 1280})`; }).observe(box);
  return el('button', { class: 'deck-card', title: d.path, onclick: () => openDeck(d.path) },
    box, el('div', { class: 'dname' }, d.name), el('div', { class: 'dmeta' }, [where.split('/').join(' › '), ago(d.mtime)].filter(Boolean).join('　')));
}
function newDeckDialog() {
  const folders = [];
  const walk = (items) => items.forEach((it) => { if (it.type === 'folder') { folders.push(it.path); walk(it.children); } });
  walk(FOLDERS);
  const folder = el('input', { list: 'folderList', placeholder: '例：営業　（/ で区切ると深くできる）', autocomplete: 'off', value: homeFolder() });
  const name = el('input', { placeholder: '例：〇〇社_提案', autocomplete: 'off' });
  const err = el('span', { class: 'dlg-err' });
  const go = async () => {
    const p = [folder.value.trim(), name.value.trim()].filter(Boolean).join('/');
    if (!name.value.trim()) { err.textContent = '資料名を入れて'; return; }
    try {
      const r = await api('POST', '/api/new', { path: p });
      closeDialog();
      await openDeck(r.path);
      toast('作りました');
    } catch (e) { err.textContent = '作れない：' + e.message; }
  };
  openDialog({
    title: '新しい資料',
    body: [el('div', { class: 'form' }, el('label', {}, 'フォルダ'), folder, el('label', {}, '資料名'), name),
      el('datalist', { id: 'folderList' }, folders.map((f) => el('option', { value: f })))],
    foot: [err, el('button', { onclick: closeDialog }, 'やめる'), el('button', { class: 'primary', onclick: go }, '作る')],
    onEnter: go,
  });
  name.focus();
}

// ---------- 資料を開く ----------
async function openDeck(path, { keepPlace = false } = {}) {
  if (S.dirty && S.path && path !== S.path) await save();
  const d = await api('GET', `/api/deck?path=${encodeURIComponent(path)}`);
  const samePlace = keepPlace && path === S.path ? S.cur : 0;
  if (!(keepPlace && path === S.path)) { S.undo = []; S.redo = []; S.issues = null; S.zoom = 'fit'; }
  S.path = path; S.version = d.version; S.dirty = false; S.conflict = false; S.sel = null; S.editing = null;
  hideBanner();
  history.replaceState(null, '', '#' + enc(path));
  const parts = path.split('/');
  $('#deckName').textContent = parts.pop();
  $('#deckFolder').textContent = parts.join(' / ');
  $('#deckName').title = path;
  document.title = `${$('#deckName').textContent} — Slide Agent`;
  setStatus('saved', '保存済み');
  document.body.classList.remove('mode-home');
  $('#main').hidden = false; $('#home').hidden = true;
  const html = d.html.replace(/<head([^>]*)>/i, (m) => `${m}<base data-kit="base" href="/deck/${enc(path)}/">`);
  await loadFrame(html);
  showSlide(Math.min(samePlace, slides().length - 1));
  renderThumbs();
  S.snap = takeSnap();
  updateUndoBtns();
  renderCheckBadge();
  if (document.body.classList.contains('view-grid')) renderSorter();
}

function loadFrame(html) {
  return new Promise((resolve) => {
    const f = $('#frame');
    f.onload = () => {
      S.doc = f.contentDocument;
      const st = S.doc.createElement('style');
      st.setAttribute('data-kit', 'edit');
      st.textContent = EDIT_CSS;
      S.doc.head.append(st);
      bindFrame(S.doc);
      fit();
      resolve();
    };
    f.srcdoc = html;
  });
}

// ---------- スライド ----------
function showSlide(i) {
  const all = slides();
  if (!all.length) return;
  if (S.editing) endEdit();
  i = Math.max(0, Math.min(i, all.length - 1));
  all.forEach((s) => s.removeAttribute('data-kit-cur'));
  all[i].setAttribute('data-kit-cur', '');
  S.cur = i;
  select(null);
  $('#notes').value = all[i].querySelector('aside.notes')?.textContent.trim() ?? '';
  markThumbs();
}
function insertSlide(html, at = S.cur + 1) {
  const [n] = fromHTML(html);
  if (!n || !isSlide(n)) return;
  const all = slides();
  if (all[at]) all[at].before(n, S.doc.createTextNode('\n\n'));
  else if (all.length) all[all.length - 1].after(S.doc.createTextNode('\n\n'), n);
  else S.doc.body.append(n);
  commit({ structural: true });
  showSlide(slides().indexOf(n));
}
function dupSlide(i = S.cur) {
  const s = slides()[i]; if (!s) return;
  const c = clean(s.cloneNode(true));
  s.after(S.doc.createTextNode('\n\n'), c);
  commit({ structural: true });
  showSlide(i + 1);
}
function delSlide(i = S.cur) {
  if (slides().length <= 1) { toast('最後の1枚は消せない'); return; }
  const s = slides()[i];
  const prev = s.previousSibling;
  if (prev && prev.nodeType === 3 && !prev.textContent.trim()) prev.remove();
  s.remove();
  S.cur = Math.min(i, slides().length - 1);
  commit({ structural: true });
  showSlide(S.cur);
  toast('スライドを削除（⌘Z で戻せる）');
}
function moveSlide(from, to) {
  const all = slides();
  if (from === to || from < 0 || to < 0 || from >= all.length || to >= all.length) return;
  const node = all[from];
  if (to > from) all[to].after(node); else all[to].before(node);
  S.cur = to;
  commit({ structural: true });
  showSlide(to);
}

// ---------- サムネイル（左の列と一覧表示で共通） ----------
function thumbHTML(slide) {
  const head = S.doc.head.cloneNode(true);
  head.querySelectorAll('style[data-kit="edit"]').forEach((e) => e.remove());
  const s = clean(slide.cloneNode(true));
  return `<!doctype html><html><head>${head.innerHTML}<style>${THUMB_CSS}</style></head><body>${s.outerHTML}</body></html>`;
}
function makeThumb(s, i, { onOpen }) {
  const f = el('iframe', { tabindex: '-1', loading: 'lazy', 'aria-hidden': 'true' });
  f.srcdoc = thumbHTML(s);
  const box = el('div', { class: 'box' }, f);
  const t = el('div', { class: 'thumb', draggable: 'true', 'data-i': i }, el('span', { class: 'num' }, String(i + 1)), box);
  const lv = slideIssueLevel(i);
  if (lv) box.append(el('span', { class: 'dot ' + lv }));
  t.addEventListener('click', () => onOpen(i));
  t.addEventListener('contextmenu', (e) => { e.preventDefault(); if (i !== S.cur) showSlide(i); S.focus = 'thumbs'; openMenu(null, slideMenu(i), { x: e.clientX, y: e.clientY }); });
  t.addEventListener('dragstart', (e) => { t.classList.add('dragging'); e.dataTransfer.setData('text/x-slide-index', String(i)); e.dataTransfer.effectAllowed = 'move'; });
  t.addEventListener('dragend', () => { t.classList.remove('dragging'); clearDrop(); });
  t.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('text/x-slide-index')) return;
    e.preventDefault(); clearDrop();
    const r = t.getBoundingClientRect();
    const horiz = !!t.closest('#sorter');
    const before = horiz ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
    t.classList.add(before ? 'drop-before' : 'drop-after');
  });
  t.addEventListener('drop', (e) => {
    const raw = e.dataTransfer.getData('text/x-slide-index');
    if (raw === '') return;
    e.preventDefault();
    const from = Number(raw);
    const before = t.classList.contains('drop-before');
    clearDrop();
    let to = before ? i : i + 1;
    if (from < to) to -= 1;
    moveSlide(from, Math.min(to, slides().length - 1));
    if (document.body.classList.contains('view-grid')) renderSorter();
  });
  return t;
}
function renderThumbs() {
  const all = slides();
  $('#thumbs').replaceChildren(...all.map((s, i) => makeThumb(s, i, { onOpen: (j) => { S.focus = 'thumbs'; showSlide(j); $('#thumbs').focus({ preventScroll: true }); } })));
  markThumbs();
}
const clearDrop = () => $$('.drop-before, .drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
function markThumbs() {
  const n = slides().length;
  $('#slideCount').textContent = n ? `${S.cur + 1} / ${n}` : '';
  $('#slideDelBtn').disabled = n <= 1;
  $$('#thumbs .thumb, #sorter .thumb').forEach((t) => t.classList.toggle('current', Number(t.dataset.i) === S.cur));
  $$('.thumb.current').forEach((t) => t.scrollIntoView({ block: 'nearest' }));
}
const refreshThumb = debounce((i) => {
  const t = $(`#thumbs .thumb[data-i="${i}"] iframe`);
  const s = slides()[i];
  if (t && s) t.srcdoc = thumbHTML(s);
}, 350);

// 一覧表示（PowerPoint の「スライド一覧」）
function toggleGrid(on = !document.body.classList.contains('view-grid')) {
  if (S.editing) endEdit();
  document.body.classList.toggle('view-grid', on);
  $('#viewBtn').classList.toggle('on', on);
  if (on) renderSorter(); else { $('#sorter').replaceChildren(); fit(); }
}
function renderSorter() {
  const box = $('#sorter');
  box.replaceChildren(...slides().map((s, i) => makeThumb(s, i, { onOpen: (j) => { toggleGrid(false); showSlide(j); } })));
  box.querySelector(`.thumb[data-i="${S.cur}"]`)?.classList.add('current');
}

function slideMenu(i) {
  const n = slides().length;
  return [
    { label: '新しいスライドを下に', run: () => openLayoutMenu(null, i + 1) },
    { label: '複製', hint: '⌘D', run: () => dupSlide(i) },
    { label: 'コピー', hint: '⌘C', run: () => copyNodes([slides()[i]]) },
    '-',
    { label: '上へ移動', hint: '⌥↑', disabled: i === 0, run: () => moveSlide(i, i - 1) },
    { label: '下へ移動', hint: '⌥↓', disabled: i === n - 1, run: () => moveSlide(i, i + 1) },
    '-',
    { label: 'ここから発表', run: () => startPresent(i) },
    { label: 'スライドの HTML を編集…', run: () => editHTML(slides()[i]) },
    '-',
    { label: '削除', hint: '⌫', disabled: n <= 1, run: () => delSlide(i) },
  ];
}

// ---------- 選ぶ・文字を直す ----------
function pick(target) {
  const t = target?.nodeType === 1 ? target : target?.parentElement;
  if (!t || !t.closest) return null;
  const slide = t.closest('section.slide');
  if (!slide) return null;
  // 背景の写真と暗くする幕はスライドの一部として扱う（右パネルはスライドの設定になる）
  return t.closest('aside.notes, img.bg, .shade') ? slide : t;
}
function select(node) {
  S.doc?.querySelectorAll('[data-kit-sel]').forEach((e) => e.removeAttribute('data-kit-sel'));
  S.sel = node;
  if (node) node.setAttribute('data-kit-sel', '');
  renderInspector();
}
function textTarget(node) {
  let e = node;
  const slide = e.closest('section.slide');
  while (e && e !== slide && isInlineEl(e) && e.parentElement !== slide) e = e.parentElement;
  return e;
}
function startEdit(node) {
  if (!node || node.matches('section.slide, img, svg, svg *')) return;
  const t = textTarget(node);
  if (hasBlockKids(t)) { toast('中の部品をダブルクリックして直す'); return; }
  if (S.editing) endEdit();
  S.editing = t; S.editBefore = t.innerHTML;
  t.setAttribute('contenteditable', 'true');
  t.setAttribute('spellcheck', 'false');
  select(t);
  t.focus();
}
function endEdit() {
  const t = S.editing;
  if (!t) return;
  S.editing = null;
  t.removeAttribute('contenteditable');
  t.removeAttribute('spellcheck');
  S.doc.getSelection()?.removeAllRanges();
  if (t.innerHTML !== S.editBefore) commit();
  renderInspector();
}
// 文字の一部を太字・強調にする（もう一度押すと外す）
function wrapInline(tag) {
  if (!S.editing) return;
  const sel = S.doc.getSelection();
  if (!sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  const base = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
  const anc = base.closest(tag === 'strong' ? 'strong, b' : 'em, i');
  if (anc && anc !== S.editing && S.editing.contains(anc)) {
    anc.replaceWith(...anc.childNodes);
    return;
  }
  if (r.collapsed) { toast('先に文字を選ぶ'); return; }
  const w = S.doc.createElement(tag);
  w.append(r.extractContents());
  r.insertNode(w);
  sel.removeAllRanges();
  const nr = S.doc.createRange(); nr.selectNodeContents(w); sel.addRange(nr);
}

function bindFrame(doc) {
  doc.addEventListener('mouseover', (e) => {
    doc.querySelectorAll('[data-kit-hover]').forEach((x) => x.removeAttribute('data-kit-hover'));
    const n = pick(e.target);
    if (n) n.setAttribute('data-kit-hover', '');
  });
  doc.addEventListener('mouseleave', () => doc.querySelectorAll('[data-kit-hover]').forEach((x) => x.removeAttribute('data-kit-hover')));
  doc.addEventListener('mousedown', () => { closeMenu(); S.focus = 'stage'; });
  doc.addEventListener('click', (e) => {
    if (S.editing && S.editing.contains(e.target)) return;
    e.preventDefault();
    if (S.editing) endEdit();
    select(pick(e.target));
  });
  doc.addEventListener('dblclick', (e) => {
    const n = pick(e.target);
    if (n) startEdit(n);
  });
  doc.addEventListener('contextmenu', (e) => {
    if (S.editing) return;
    e.preventDefault();
    const n = pick(e.target);
    select(n);
    const r = $('#frame').getBoundingClientRect();
    const k = r.width / 1280;
    openMenu(null, n && !isSlide(n) ? elementMenu(n) : slideMenu(S.cur), { x: r.left + e.clientX * k, y: r.top + e.clientY * k });
  });
  doc.addEventListener('keydown', (e) => {
    if (S.editing) {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') { e.preventDefault(); endEdit(); return; }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); doc.execCommand('insertLineBreak'); return; }
      if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); wrapInline('strong'); return; }
      if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); wrapInline('em'); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); endEdit(); save(); }
      return;
    }
    onKey(e);
  });
  doc.addEventListener('paste', (e) => {
    if (S.editing) {
      e.preventDefault();
      doc.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      return;
    }
    onPaste(e);
  });
  doc.addEventListener('copy', onCopy);
  doc.addEventListener('cut', onCut);
  doc.addEventListener('focusout', (e) => { if (S.editing && e.target === S.editing) endEdit(); });
  doc.addEventListener('dragstart', (e) => e.preventDefault());
  // 画像ファイルを落とす：画像の上なら差し替え、それ以外なら足す
  doc.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; $('#stage').classList.add('drop'); } });
  doc.addEventListener('dragleave', () => $('#stage').classList.remove('drop'));
  doc.addEventListener('drop', (e) => {
    $('#stage').classList.remove('drop');
    if (!hasFiles(e)) return;
    e.preventDefault();
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
    if (!f) { toast('画像ファイルだけ置ける'); return; }
    const t = pick(e.target);
    placeImage(f, t && !isSlide(t) ? t : null);
  });
}
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

// 選んでいる部品の場所（スライド › カード › 見出し）。押すとその親を選べる
function crumbs(n) {
  const chain = [];
  for (let x = n.parentElement; x && x.nodeType === 1; x = x.parentElement) {
    chain.unshift(x);
    if (isSlide(x)) break;
  }
  const c = el('div', { class: 'crumbs' });
  chain.forEach((x) => c.append(
    el('button', { title: 'この親を選ぶ（Esc）', onclick: () => select(x) }, isSlide(x) ? `スライド ${S.cur + 1}` : nameOf(x)),
    el('span', { class: 'sep' }, '›')));
  return c;
}
function nameOf(n) {
  const tag = n.tagName.toLowerCase();
  const cls = [...n.classList].find((c) => CLASS_NAMES[c]);
  return (cls && CLASS_NAMES[cls]) || NAMES[tag] || tag;
}

// ---------- 部品を足す・動かす ----------
// 選んでいる部品のすぐ後ろに足す。選んでいなければスライドの最後（下の帯より前）に足す
function insertEls(nodes, near = S.sel) {
  const slide = curSlide();
  if (!slide || !nodes.length) return;
  let ref = near && !isSlide(near) ? textTarget(near) : null;
  if (ref && ref.matches('li')) ref = ref.parentElement;
  if (ref && !isSlide(ref)) {
    ref.after(...nodes);
  } else {
    const tail = [...slide.children].find((c) => c.matches('.footer, aside.notes'));
    tail ? tail.before(...nodes) : slide.append(...nodes);
  }
  commit();
  select(nodes[nodes.length - 1]);
}
function insertPart(html) {
  if (S.editing) endEdit();
  insertEls(fromHTML(html));
}
function moveEl(dir) {
  const n = S.sel; if (!n || isSlide(n)) return;
  if (dir < 0) {
    const p = n.previousElementSibling;
    if (!p) return;
    p.before(n);
  } else {
    const x = n.nextElementSibling;
    if (!x || x.matches('aside.notes')) return;
    x.after(n);
  }
  commit();
  select(n);
}
function dupEl() {
  const n = S.sel; if (!n || isSlide(n)) return;
  const c = clean(n.cloneNode(true));
  n.after(c);
  commit();
  select(c);
}
function delEl() {
  const n = S.sel; if (!n || isSlide(n)) return;
  const p = n.parentElement;
  n.remove();
  commit();
  select(p && p.closest('section.slide') ? p : null);
  toast('部品を削除（⌘Z で戻せる）');
}
function elementMenu(n) {
  return [
    { label: '文字を直す', hint: 'Enter', disabled: n.matches('img, svg'), run: () => startEdit(n) },
    { label: '複製', hint: '⌘D', run: dupEl },
    { label: 'コピー', hint: '⌘C', run: () => copyNodes([n]) },
    { label: '切り取り', hint: '⌘X', run: () => { copyNodes([n]); delEl(); } },
    '-',
    { label: '前へ', hint: '⌥↑', disabled: !n.previousElementSibling, run: () => moveEl(-1) },
    { label: '後ろへ', hint: '⌥↓', disabled: !n.nextElementSibling || n.nextElementSibling.matches('aside.notes'), run: () => moveEl(1) },
    '-',
    ...(n.matches('img') ? [{ label: '画像を差し替え…', run: () => pickImage(n) }] : []),
    { label: 'HTML を編集…', run: () => editHTML(n) },
    '-',
    { label: '削除', hint: '⌫', run: delEl },
  ];
}

// ---------- コピー・貼り付け（部品・スライド。別の資料にも貼れる） ----------
let CLIP = null;
function copyNodes(nodes) {
  CLIP = nodes.map((n) => clean(n.cloneNode(true)).outerHTML).join('\n');
  try { navigator.clipboard.writeText(CLIP); } catch { /* 画面の中だけで使う */ }
  toast(isSlide(nodes[0]) ? 'スライドをコピー' : '部品をコピー');
}
function copyTarget() {
  if (S.sel && !isSlide(S.sel)) return S.sel;
  if (!S.sel && S.focus === 'thumbs') return curSlide();
  if (S.sel && isSlide(S.sel)) return S.sel;
  return null;
}
function onCopy(e) {
  if (typing() || !S.doc) return;
  const n = copyTarget(); if (!n) return;
  e.preventDefault();
  const html = clean(n.cloneNode(true)).outerHTML;
  CLIP = html;
  e.clipboardData.setData(CLIP_TYPE, html);
  e.clipboardData.setData('text/plain', html);
  toast(isSlide(n) ? 'スライドをコピー' : '部品をコピー');
}
function onCut(e) {
  if (typing() || !S.doc) return;
  const n = copyTarget(); if (!n) return;
  onCopy(e);
  isSlide(n) ? delSlide() : delEl();
}
function onPaste(e) {
  if (typing() || !S.doc) return;
  const img = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
  if (img) { e.preventDefault(); placeImage(img, S.sel && !isSlide(S.sel) ? S.sel : null); return; }
  const txt = e.clipboardData?.getData('text/plain') || '';
  const html = e.clipboardData?.getData(CLIP_TYPE) || (CLIP && txt === CLIP ? CLIP : '');
  if (html) { e.preventDefault(); pasteHTML(html); return; }
  if (txt.trim()) {
    // ほかから持ってきた文字は本文として足す
    e.preventDefault();
    const p = S.doc.createElement('p');
    txt.trim().split(/\r?\n/).forEach((line, i) => { if (i) p.append(S.doc.createElement('br')); p.append(line); });
    insertEls([p]);
  }
}
function pasteHTML(html) {
  const nodes = fromHTML(html);
  if (!nodes.length) return;
  if (nodes.every(isSlide)) {
    let at = S.cur + 1;
    for (const n of nodes) insertSlide(n.outerHTML, at++);
    return;
  }
  insertEls(nodes.filter((n) => !isSlide(n)));
}

// ---------- 画像 ----------
let imageTarget = null;
function pickImage(replace = null) {
  imageTarget = replace;
  $('#filePick').value = '';
  $('#filePick').click();
}
$('#filePick').addEventListener('change', () => {
  const f = $('#filePick').files[0];
  if (f) placeImage(f, imageTarget);
});
async function uploadImage(file) {
  const name = file.name && file.name !== 'image.png' ? file.name : `image-${Date.now()}.${(file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg')}`;
  const r = await fetch(`/api/asset?path=${encodeURIComponent(S.path)}&name=${encodeURIComponent(name)}`, { method: 'POST', body: file });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || r.status);
  return d.src;
}
// near が画像なら差し替え、それ以外の部品ならその後ろに足す
async function placeImage(file, near = null) {
  if (!S.path) return;
  if (S.editing) endEdit();
  try {
    toast('画像を取り込み中…');
    const src = await uploadImage(file);
    if (near && near.matches('img')) {
      near.setAttribute('src', src);
      commit();
      select(near);
    } else {
      const [img] = fromHTML(`<img class="photo" src="${src}" alt="" style="flex: 1; min-height: 0;">`);
      insertEls([img], near);
    }
    toast(`画像を置いた（${src}）`);
  } catch (e) { toast('画像を置けない：' + e.message); }
}

// ---------- 右パネル（選んだものに合わせて中身が変わる） ----------
function themeVars() {
  const t = varsStyle()?.textContent ?? '';
  return [...t.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => ({ name: m[1], value: m[2].trim() }));
}
const isColor = (v) => /^#([0-9a-f]{3,8})$|^rgba?\(|^hsla?\(/i.test(v);
const colorVars = () => themeVars().filter((v) => isColor(v.value));
const varLabel = (name) => VAR_LABELS[name] || name;
function setVar(name, value) {
  const st = varsStyle(); if (!st) return;
  st.textContent = st.textContent.replace(new RegExp(`(--${name}\\s*:\\s*)([^;]+)(;)`), `$1${value}$3`);
}
function swatchRow(current, onPick, { transparent = false } = {}) {
  const box = el('div', { class: 'swatches' });
  for (const v of colorVars()) {
    const val = `var(--${v.name})`;
    box.append(el('button', { class: 'sw' + (current === val ? ' on' : ''), title: varLabel(v.name), style: `background:${v.value}`, onclick: () => onPick(val) }));
  }
  if (transparent) box.append(el('button', { class: 'sw clear' + (current === 'transparent' ? ' on' : ''), title: '透明', onclick: () => onPick('transparent') }, '∅'));
  return box;
}
// 色は見本が多いので、ラベルを上に置いて横幅いっぱいに並べる（戻すときは ⌘Z）
function colorField(label, current, onPick, opts) {
  return el('div', { class: 'field stack' }, el('label', {}, label), swatchRow(current, onPick, opts));
}
function field(label, ...kids) { return el('div', { class: 'field' }, el('label', {}, label), el('div', {}, ...kids)); }
function seg(options, current, onPick) {
  return el('div', { class: 'seg' }, options.map(([v, label]) => el('button', { class: current === v ? 'on' : '', onclick: () => onPick(v) }, label)));
}
function sec(title, ...kids) { return el('div', { class: 'sec' }, el('h4', {}, title), ...kids); }
function styleChange(node, prop, value) {
  node.style[prop] = value;
  if (!node.getAttribute('style')) node.removeAttribute('style');
  commit();
  renderInspector();
}

function renderInspector() {
  const box = $('#inspector');
  box.replaceChildren();
  if (!S.doc) return;
  const slide = curSlide();
  const n = S.sel && !isSlide(S.sel) ? S.sel : null;
  if (n) box.append(...elementPanel(n));
  else if (slide) box.append(...slidePanel(slide));
  // 文字を直している間はボタンを押してもフォーカスを奪わない（選んだ文字が消えないように）
  box.querySelectorAll('button').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));
}

function iconBtn(name, title, run, { disabled = false, danger = false } = {}) {
  return el('button', { class: 'icon' + (danger ? ' danger' : ''), title, disabled, onclick: run }, icon(name));
}
function elementPanel(n) {
  const out = [];
  const last = !n.nextElementSibling || n.nextElementSibling.matches('aside.notes');
  out.push(el('div', { class: 'ins-head' },
    crumbs(n),
    el('div', { class: 'ins-title' }, el('span', {}, nameOf(n)),
      el('div', { class: 'ins-actions' },
        iconBtn('up', '前へ（⌥↑）', () => moveEl(-1), { disabled: !n.previousElementSibling }),
        iconBtn('down', '後ろへ（⌥↓）', () => moveEl(1), { disabled: last }),
        iconBtn('copy', '複製（⌘D）', dupEl),
        iconBtn('trash', '削除（⌫）', delEl, { danger: true })))));

  if (S.editing) {
    out.push(sec('書式（選んだ文字）',
      el('div', { class: 'fmt' },
        el('button', { title: '⌘B', onclick: () => wrapInline('strong') }, el('b', {}, '太字')),
        el('button', { title: '⌘I（アクセント色になる）', onclick: () => wrapInline('em') }, '強調'))));
  }

  const cs = cssOf(n);
  if (n.matches('img')) {
    const fitMode = cs.objectFit === 'contain' ? 'contain' : 'cover';
    out.push(sec('画像',
      field('合わせ方', seg([['cover', '切り抜く'], ['contain', '全体を見せる']], fitMode, (v) => styleChange(n, 'objectFit', v === 'cover' ? '' : v))),
      el('div', { class: 'fmt' }, el('button', { title: 'ファイルをこの画像の上にドラッグしても差し替えられる', onclick: () => pickImage(n) }, '画像を差し替え…'))));
  } else if (!n.matches('svg, br') && n.textContent.trim()) {
    const size = Math.round(parseFloat(cs.fontSize));
    const inp = el('input', { type: 'number', min: '8', max: '200', value: String(size) });
    inp.addEventListener('change', () => styleChange(n, 'fontSize', inp.value ? `${inp.value}px` : ''));
    const bold = parseInt(cs.fontWeight, 10) >= 600;
    const al = cs.textAlign === 'start' ? 'left' : cs.textAlign;
    out.push(sec('文字',
      colorField('色', n.style.color, (v) => styleChange(n, 'color', v)),
      field('大きさ', el('div', { class: 'num-in' },
        el('button', { onclick: () => styleChange(n, 'fontSize', `${Math.max(8, size - 2)}px`) }, '−'),
        inp,
        el('button', { onclick: () => styleChange(n, 'fontSize', `${size + 2}px`) }, '＋'))),
      field('太さ', seg([['400', '標準'], ['700', '太字']], bold ? '700' : '400', (v) => styleChange(n, 'fontWeight', v))),
      field('揃え', seg([['left', '左'], ['center', '中央'], ['right', '右']], al, (v) => styleChange(n, 'textAlign', v)))));
  }
  out.push(sec('箱', colorField('背景色', n.style.backgroundColor, (v) => styleChange(n, 'backgroundColor', v), { transparent: true })));
  return out;
}

function slidePanel(slide) {
  const out = [];
  const dark = slide.getAttribute('data-bg') === 'dark';
  const center = slide.getAttribute('data-align') === 'center';
  out.push(el('div', { class: 'ins-head slim' }, el('div', { class: 'ins-title' }, el('span', {}, `スライド ${S.cur + 1}`))));
  out.push(sec('背景',
    field('地', seg([['light', '明るい'], ['dark', '暗い']], dark ? 'dark' : 'light', (v) => {
      v === 'dark' ? slide.setAttribute('data-bg', 'dark') : slide.removeAttribute('data-bg');
      commit(); renderInspector();
    })),
    colorField('色', slide.style.backgroundColor, (v) => styleChange(slide, 'backgroundColor', v))));
  out.push(sec('中身',
    field('縦の位置', seg([['top', '上から'], ['center', '中央']], center ? 'center' : 'top', (v) => {
      v === 'center' ? slide.setAttribute('data-align', 'center') : slide.removeAttribute('data-align');
      commit(); renderInspector();
    }))));
  const bg = slide.querySelector(':scope > img.bg');
  if (bg) out.push(sec('背景の写真', el('div', { class: 'fmt' }, el('button', { onclick: () => pickImage(bg) }, '写真を差し替え…'))));
  out.push(el('div', { class: 'ins-foot' }, el('button', { class: 'link', onclick: themeDialog }, '資料全体の色…')));
  return out;
}

// ---------- ダイアログ ----------
function openDialog({ title, sub, body = [], foot = [], wide = false, onEnter = null, onClose = null }) {
  const d = $('#dlg');
  d.className = wide ? 'wide' : '';
  d.replaceChildren(
    el('div', { class: 'dlg-head' }, title),
    sub ? el('p', { class: 'dlg-sub' }, sub) : null,
    el('div', { class: 'dlg-body' }, ...body),
    foot.length ? el('div', { class: 'dlg-foot' }, ...foot) : null,
  );
  d.onkeydown = (e) => {
    if (e.key === 'Enter' && onEnter && e.target.tagName === 'INPUT' && !e.isComposing) { e.preventDefault(); onEnter(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onEnter) { e.preventDefault(); onEnter(); }
  };
  d.onclose = () => { onClose?.(); };
  d.showModal();
}
function closeDialog() { $('#dlg').close(); }

// 部品・スライドの HTML を直接直す
function editHTML(node) {
  if (S.editing) endEdit();
  const ta = el('textarea', { class: 'code', spellcheck: 'false' });
  ta.value = clean(node.cloneNode(true)).outerHTML;
  const err = el('span', { class: 'dlg-err' });
  const slideMode = isSlide(node);
  const apply = () => {
    const nodes = fromHTML(ta.value);
    if (nodes.length !== 1) { err.textContent = 'いちばん外側の要素は1つにして'; return; }
    if (slideMode && !isSlide(nodes[0])) { err.textContent = '<section class="slide"> で囲んで'; return; }
    if (!slideMode && isSlide(nodes[0])) { err.textContent = '部品の中にスライドは入れられない'; return; }
    node.replaceWith(nodes[0]);
    closeDialog();
    if (slideMode) { commit({ structural: true }); showSlide(S.cur); }
    else { commit(); select(nodes[0]); }
  };
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); }
  });
  openDialog({
    title: slideMode ? `スライド ${S.cur + 1} の HTML` : `${nameOf(node)} の HTML`,
    sub: '使える部品とクラスは CLAUDE.md の「deck.html の書き方」。⌘Enter で反映。',
    body: [ta], wide: true, onEnter: apply,
    foot: [err, el('button', { onclick: closeDialog }, 'やめる'), el('button', { class: 'primary', onclick: apply }, '反映')],
  });
  ta.focus(); ta.setSelectionRange(0, 0);
}

// 資料全体の色（めったに触らないので、その他メニューの中）
function themeDialog() {
  const vars = colorVars();
  const before = varsStyle()?.textContent ?? '';
  const commitVars = debounce(() => commit({ structural: true }), 300);
  const rows = vars.map((v) => {
    const hex = toHex(v.value);
    const picker = el('input', { type: 'color', value: hex || '#000000' });
    const text = el('input', { type: 'text', value: v.value, spellcheck: 'false' });
    const apply = (val) => { setVar(v.name, val); commitVars(); };
    picker.addEventListener('input', () => { text.value = picker.value; apply(picker.value); });
    text.addEventListener('change', () => {
      const val = text.value.trim();
      if (isColor(val)) { apply(val); const h = toHex(val); if (h) picker.value = h; } else text.value = v.value;
    });
    return el('div', { class: 'var-row' }, picker, el('span', { class: 'vname' }, varLabel(v.name), el('small', {}, `--${v.name}`)), text);
  });
  openDialog({
    title: 'テーマ色（資料全体）',
    sub: 'ここで変えると、その色を使っている部分が全スライドで変わる。部品ひとつの色は右のパネルで変える。',
    body: rows.length ? rows : [el('p', { class: 'muted-note' }, 'この資料にはテーマ色（<style data-kit="vars">）が無い。')],
    foot: [
      el('button', { onclick: () => { if (varsStyle()) { varsStyle().textContent = before; commit({ structural: true }); } closeDialog(); } }, '元に戻して閉じる'),
      el('button', { class: 'primary', onclick: closeDialog }, '閉じる')],
  });
}
function toHex(v) {
  const m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1];
  return '#' + (h.length === 3 ? h.split('').map((c) => c + c).join('') : h).toLowerCase();
}

function shortcutsDialog() {
  const rows = [
    ['編集'],
    ['文字を直す', 'ダブルクリック / Enter'], ['直し終わる・親を選ぶ', 'Esc'],
    ['太字 ・ 強調（文字を直している間）', '⌘B ・ ⌘I'], ['元に戻す ・ やり直し', '⌘Z ・ ⇧⌘Z'],
    ['複製', '⌘D'], ['コピー ・ 切り取り ・ 貼り付け', '⌘C ・ ⌘X ・ ⌘V'],
    ['削除', '⌫'], ['前へ ・ 後ろへ（スライドなら上・下）', '⌥↑ ・ ⌥↓'],
    ['画像を置く', 'ドラッグ / ⌘V'], ['保存（自動でもされる）', '⌘S'],
    ['移動・表示'],
    ['前・次のスライド（何も選んでいないとき）', '↑ ↓'], ['スライド一覧', '⌘G'],
    ['資料の一覧（ホーム）', '⌘O'], ['このショートカット一覧', '⌘/'],
    ['発表'],
    ['このスライドから ・ 最初から', '⌘Enter ・ ⇧⌘Enter'], ['次 ・ 前', '→ Space ・ ←'],
    ['発表者表示（ノート・次のスライド・時間）', 'N'], ['黒い画面', 'B'], ['終わる', 'Esc'],
  ];
  openDialog({
    title: 'ショートカット',
    body: [el('div', { class: 'keys' }, rows.map((r) => (r.length === 1 ? el('h5', {}, r[0]) : el('div', {}, el('span', {}, r[0]), el('span', {}, r[1])))))],
    foot: [el('button', { class: 'primary', onclick: closeDialog }, '閉じる')],
  });
}

// ---------- メニュー ----------
function openMenu(anchor, items, { x, y, cls = '' } = {}) {
  const same = anchor && S.menuAnchor === anchor;
  closeMenu();
  if (same) return;
  const m = el('div', { class: 'menu ' + cls, role: 'menu' });
  for (const it of items) {
    if (it === '-') m.append(el('div', { class: 'menu-sep' }));
    else if (it.header) m.append(el('div', { class: 'menu-head' }, it.header));
    else if (it.node) m.append(it.node);
    else {
      m.append(el('button', {
        class: 'menu-item' + (it.on ? ' on' : ''), disabled: !!it.disabled, role: 'menuitem',
        onclick: () => { closeMenu(); it.run(); },
      }, el('span', { class: 'mi-label' }, it.label), it.hint ? el('span', { class: 'mi-hint' }, it.hint) : null));
    }
  }
  document.body.append(m);
  const r = anchor ? anchor.getBoundingClientRect() : { left: x, right: x, bottom: y, top: y };
  let left = r.left, top = r.bottom + 4;
  if (left + m.offsetWidth > innerWidth - 8) left = Math.max(8, (anchor ? r.right : x) - m.offsetWidth);
  if (top + m.offsetHeight > innerHeight - 8) top = Math.max(8, innerHeight - 8 - m.offsetHeight);
  m.style.left = `${left}px`; m.style.top = `${top}px`;
  S.menu = m; S.menuAnchor = anchor;
  anchor?.classList.add('open');
}
function closeMenu() {
  S.menu?.remove();
  S.menuAnchor?.classList.remove('open');
  S.menu = null; S.menuAnchor = null;
}
document.addEventListener('mousedown', (e) => {
  if (S.menu && !S.menu.contains(e.target) && !(S.menuAnchor && S.menuAnchor.contains(e.target))) closeMenu();
}, true);

function openLayoutMenu(anchor, at = S.cur + 1) {
  if (S.editing) endEdit();
  const m = [{ header: 'レイアウト' }];
  for (const [name, html] of LAYOUTS) {
    const f = el('iframe', { tabindex: '-1', 'aria-hidden': 'true' });
    f.srcdoc = thumbHTML(fromHTML(html)[0]);
    m.push({ node: el('button', { class: 'layout-item', onclick: () => { closeMenu(); insertSlide(html, at); } }, el('div', { class: 'lt' }, f), name) });
  }
  if (anchor) openMenu(anchor, m, { cls: 'layouts' });
  else {
    const r = $('#thumbs').getBoundingClientRect();
    openMenu(null, m, { x: r.right + 4, y: r.top + 40, cls: 'layouts' });
  }
}
function insertMenu(kind) {
  return INSERTS[kind].map((it) => (it === '-' ? it : { label: it[0], run: () => insertPart(it[1]) }));
}
function zoomMenu() {
  const z = [['fit', '画面に合わせる'], [0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.5, '150%']];
  return z.map(([v, label]) => ({ label, on: S.zoom === v, run: () => { S.zoom = v; fit(); } }));
}
function exportMenu() {
  return [
    { label: 'PDF', run: () => doExport('pdf') },
    { label: 'PowerPoint（PPTX）', run: () => doExport('pptx') },
  ];
}

// ---------- チェック ----------
async function runCheck() {
  if (!S.path) return;
  if (S.editing) endEdit();
  if (S.dirty) await save();
  const b = $('#checkBtn');
  b.disabled = true;
  const label = b.firstChild.textContent;
  b.firstChild.textContent = 'チェック中…';
  try {
    const r = await api('POST', '/api/check', { path: S.path });
    S.issues = r.issues;
    renderCheckBadge();
    renderThumbs();
    if (document.body.classList.contains('view-grid')) renderSorter();
    renderInspector();
    showCheckMenu();
  } catch (e) {
    toast('チェックできない：' + e.message);
  } finally {
    b.firstChild.textContent = label;
    b.disabled = false;
  }
}
function slideIssueLevel(i) {
  const l = (S.issues || []).filter((x) => x.slide === i + 1);
  return l.some((x) => x.level === 'error') ? 'err' : l.length ? 'warn' : '';
}
function renderCheckBadge() {
  const bd = $('#checkBadge');
  if (!S.issues) { bd.hidden = true; return; }
  const errs = S.issues.filter((x) => x.level === 'error').length;
  bd.hidden = false;
  bd.className = 'badge ' + (errs ? 'err' : S.issues.length ? 'warn' : '');
  bd.textContent = errs || S.issues.length || '✓';
}
function showCheckMenu() {
  const list = S.issues || [];
  const errs = list.filter((x) => x.level === 'error').length;
  const items = [{ node: el('div', { class: 'menu-head' }, el('span', {}, `エラー ${errs} ・ 注意 ${list.length - errs}`), el('span', {}, 'エラーは書き出す前に直す')) }];
  if (!list.length) items.push({ node: el('div', { class: 'check-ok' }, '✓ 問題なし。そのまま書き出せる。') });
  for (const x of list) {
    items.push({ node: el('button', { class: 'check-item ' + x.level, onclick: () => { closeMenu(); if (x.slide) { toggleGrid(false); showSlide(x.slide - 1); } } },
      `${x.slide}枚目　${x.msg}`, el('span', { class: 'where' }, x.where)) });
  }
  openMenu(null, items, { x: $('#checkBtn').getBoundingClientRect().right, y: 48, cls: 'check-pop' });
  S.menuAnchor = $('#checkBtn'); $('#checkBtn').classList.add('open');
}

// ---------- 書き出し ----------
async function doExport(kind) {
  if (!S.path || S.exporting) return;
  if (S.editing) endEdit();
  if (S.dirty) await save();
  if (S.conflict) { toast('先に「外で変更された」を解決して'); return; }
  const name = kind === 'pdf' ? 'PDF' : 'PPTX';
  const b = $('#exportBtn');
  S.exporting = true; b.disabled = true; b.firstChild.textContent = `${name} を書き出し中…`;
  toast(`${name} を書き出し中…（数秒かかる）`, { ms: 60000 });
  try {
    const r = await api('POST', '/api/export', { path: S.path, kind });
    const extra = r.raster ? `・画像になった部分 ${r.raster}` : '';
    toast([`✔ ${name}（${r.slides}枚${extra}）`, el('span', { class: 'sub' }, `private/${r.rel}`)], {
      ms: 9000,
      actions: [
        el('button', { class: 'small primary', onclick: () => api('POST', '/api/reveal', { out: r.out, open: true }) }, '開く'),
        el('button', { class: 'small', onclick: () => api('POST', '/api/reveal', { out: r.out }) }, 'Finder で表示'),
      ],
    });
  } catch (e) {
    toast('✖ ' + e.message, { ms: 8000 });
  } finally {
    S.exporting = false; b.disabled = false; b.firstChild.textContent = '書き出し';
  }
}

// ---------- 発表 ----------
const P = { on: false, i: 0, total: 0, presenter: false, t0: 0, timer: null, hintTimer: null };
function presentHTML() {
  return serialize().replace(/<head([^>]*)>/i, (m) => `${m}<base href="/deck/${enc(S.path)}/"><style>${PRESENT_CSS}</style>`);
}
function loadPresentFrame(f, html) {
  return new Promise((res) => { f.onload = res; f.srcdoc = html; });
}
async function startPresent(from = S.cur) {
  if (!S.doc) return;
  if (S.editing) endEdit();
  closeMenu();
  const html = presentHTML();
  P.on = true; P.i = from; P.total = slides().length; P.t0 = Date.now();
  P.presenter = store.get('kit.presenter', false);
  const box = $('#present');
  box.hidden = false;
  box.classList.toggle('presenter', P.presenter);
  box.classList.remove('black');
  // 全画面はクリック直後でないと許されないので、読み込みより先に頼む
  const fs = box.requestFullscreen().catch(() => { /* 全画面にできなくても続ける */ });
  await Promise.all([loadPresentFrame($('#pCur'), html), loadPresentFrame($('#pNext'), html), fs]);
  pGo(from);
  clearInterval(P.timer);
  P.timer = setInterval(pTick, 500); pTick();
  const hint = $('#pHint');
  hint.classList.remove('gone'); clearTimeout(P.hintTimer); P.hintTimer = setTimeout(() => hint.classList.add('gone'), 3500);
}
function stopPresent() {
  if (!P.on) return;
  P.on = false;
  clearInterval(P.timer);
  $('#present').hidden = true;
  $('#pCur').removeAttribute('srcdoc'); $('#pNext').removeAttribute('srcdoc');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  showSlide(P.i);
}
function pShow(f, i) {
  const all = $$('section.slide', f.contentDocument);
  all.forEach((s, j) => (j === i ? s.setAttribute('data-p', '') : s.removeAttribute('data-p')));
}
function pGo(i) {
  P.i = Math.max(0, Math.min(i, P.total - 1));
  $('#present').classList.remove('black');
  pShow($('#pCur'), P.i);
  pShow($('#pNext'), P.i + 1);
  $('#pEnd').hidden = P.i + 1 < P.total;
  $('#pCount').textContent = `${P.i + 1} / ${P.total}`;
  $('#pNotes').textContent = slides()[P.i]?.querySelector('aside.notes')?.textContent.trim() ?? '';
  pFit();
}
function pTick() {
  const s = Math.floor((Date.now() - P.t0) / 1000);
  $('#pTimer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const d = new Date();
  $('#pClock').textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function pFitBox(box, iframe, w, h) {
  const k = Math.min(w / 1280, h / 720);
  box.style.width = `${1280 * k}px`; box.style.height = `${720 * k}px`;
  iframe.style.transform = `scale(${k})`;
}
function pFit() {
  if (!P.on) return;
  const main = $('#pMain');
  const pad = P.presenter ? 56 : 0;
  pFitBox($('#pCurBox'), $('#pCur'), main.clientWidth - pad, main.clientHeight - pad);
  pFitBox($('#pNextBox'), $('#pNext'), 332, 186.75);
}
new ResizeObserver(pFit).observe($('#pMain'));
function presentKey(e) {
  const k = e.key;
  e.preventDefault();
  if (k === 'Escape') { stopPresent(); return; }
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) pGo(P.i + 1);
  else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) pGo(P.i - 1);
  else if (k === 'Home') pGo(0);
  else if (k === 'End') pGo(P.total - 1);
  else if (k.toLowerCase() === 'n') {
    P.presenter = !P.presenter; store.set('kit.presenter', P.presenter);
    $('#present').classList.toggle('presenter', P.presenter);
    requestAnimationFrame(pFit);
  } else if (k.toLowerCase() === 'b' || k === '.') $('#present').classList.toggle('black');
}
$('#pMain').addEventListener('click', () => pGo(P.i + 1));
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && P.on) stopPresent(); });

// ---------- ノート ----------
const commitNotes = debounce(() => commit(), 600);
$('#notes').addEventListener('input', () => {
  const s = curSlide(); if (!s) return;
  let a = s.querySelector('aside.notes');
  if (!a) { a = S.doc.createElement('aside'); a.className = 'notes'; s.append(a); }
  a.textContent = $('#notes').value;
  commitNotes();
});

// ---------- キー操作 ----------
function onKey(e) {
  if (P.on) { presentKey(e); return; }
  if (dialogOpen()) return;
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (mod && (key === 'o' || e.key === '\\')) { e.preventDefault(); showHome(); return; }
  if (!S.doc) return;
  if (mod && key === 's') { e.preventDefault(); save(); return; }
  if (mod && e.key === 'Enter') { e.preventDefault(); startPresent(e.shiftKey ? 0 : S.cur); return; }
  if (mod && e.key === '/') { e.preventDefault(); shortcutsDialog(); return; }
  if (typing()) return;
  if (e.key === 'Escape' && S.menu) { closeMenu(); return; }
  if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && key === 'y') { e.preventDefault(); redo(); return; }
  if (mod && key === 'g') { e.preventDefault(); toggleGrid(); return; }
  const elSel = S.sel && !isSlide(S.sel);
  if (mod && key === 'd') { e.preventDefault(); elSel ? dupEl() : dupSlide(); return; }
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    const d = e.key === 'ArrowUp' ? -1 : 1;
    elSel ? moveEl(d) : moveSlide(S.cur, S.cur + d);
    return;
  }
  if (e.key === 'Escape') {
    if (document.body.classList.contains('view-grid')) { toggleGrid(false); return; }
    if (S.sel) { const p = isSlide(S.sel) ? null : S.sel.parentElement; select(p && p.closest('section.slide') ? p : null); }
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (elSel) { e.preventDefault(); delEl(); }
    else if (S.focus === 'thumbs' || document.body.classList.contains('view-grid')) { e.preventDefault(); delSlide(); if (document.body.classList.contains('view-grid')) renderSorter(); }
    return;
  }
  if (e.key === 'Enter' && elSel) { e.preventDefault(); startEdit(S.sel); return; }
  if (e.key === 'Enter' && document.body.classList.contains('view-grid')) { e.preventDefault(); toggleGrid(false); return; }
  if (!elSel && (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'ArrowRight' && S.focus === 'thumbs')) { e.preventDefault(); showSlide(S.cur + 1); }
  if (!elSel && (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'ArrowLeft' && S.focus === 'thumbs')) { e.preventDefault(); showSlide(S.cur - 1); }
}
window.addEventListener('keydown', onKey);
document.addEventListener('copy', onCopy);
document.addEventListener('cut', onCut);
document.addEventListener('paste', onPaste);
// ファイルを画面に落としても、ブラウザがそのファイルを開かないようにする
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  if (!S.doc || !e.target.closest?.('#center')) return;
  const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
  if (f) placeImage(f, S.sel && !isSlide(S.sel) ? S.sel : null);
});
$('#stage').addEventListener('mousedown', (e) => { if (e.target === $('#stage')) { S.focus = 'stage'; if (S.editing) endEdit(); select(null); } });

// ---------- 大きさ合わせ ----------
function fit() {
  const st = $('#stage');
  const w = st.clientWidth - 48, h = st.clientHeight - 32;
  if (w <= 0 || h <= 0) return;
  const kfit = Math.min(w / 1280, h / 720);
  const k = S.zoom === 'fit' ? kfit : S.zoom;
  $('#frameWrap').style.width = `${1280 * k}px`;
  $('#frameWrap').style.height = `${720 * k}px`;
  $('#frame').style.transform = `scale(${k})`;
  $('#zoomLabel').textContent = `${Math.round(k * 100)}%`;
  $('#notes').style.width = `${Math.min(1280 * k, w)}px`;   // ノートの幅をスライドにそろえる
}
new ResizeObserver(fit).observe($('#stage'));

// ---------- 上の帯のボタン ----------
$('#homeBtn').onclick = showHome;
$('#undoBtn').onclick = undo;
$('#redoBtn').onclick = redo;
$('#textBtn').onclick = (e) => openMenu(e.currentTarget, insertMenu('text'));
$('#blockBtn').onclick = (e) => openMenu(e.currentTarget, insertMenu('block'));
$('#imageBtn').onclick = () => pickImage(S.sel?.matches?.('img') ? S.sel : null);
$('#slideAddBtn').onclick = (e) => openLayoutMenu(e.currentTarget);
$('#slideDupBtn').onclick = () => dupSlide();
$('#slideDelBtn').onclick = () => delSlide();
$('#viewBtn').onclick = () => toggleGrid();
$('#zoomBtn').onclick = (e) => openMenu(e.currentTarget, zoomMenu());
$('#checkBtn').onclick = () => (S.menuAnchor === $('#checkBtn') ? closeMenu() : runCheck());
$('#presentBtn').onclick = () => startPresent(S.cur);
$('#exportBtn').onclick = (e) => openMenu(e.currentTarget, exportMenu());
$('#newDeckBtn').onclick = newDeckDialog;
$('#homeSearch').addEventListener('input', renderHome);
$('#homeSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) $('#homeBody .deck-card')?.click(); });
$('#thumbs').addEventListener('focus', () => { S.focus = 'thumbs'; });

// ---------- 起動 ----------
$$('[data-icon]').forEach((b) => b.prepend(icon(b.dataset.icon, b.classList.contains('icon') ? 18 : 16)));
$$('.has-menu').forEach((b) => b.append(icon('caret', 14)));
window.addEventListener('beforeunload', (e) => { if (S.dirty) { save(); e.preventDefault(); } });
setInterval(poll, 2000);
window.addEventListener('hashchange', () => {
  const p = decodeURIComponent(location.hash.slice(1));
  if (p && p !== S.path) openDeck(p).catch(() => toast('資料が見つからない：' + p));
});
(async () => {
  const p = decodeURIComponent(location.hash.slice(1));
  if (p) {
    try { await openDeck(p); return; } catch { toast('資料が見つからない：' + p); }
  }
  showHome();
})();
