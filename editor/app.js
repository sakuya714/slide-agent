// slide-kit 編集画面
// 資料（deck.html）は iframe に読み込んで、その DOM を直接いじる。保存時に編集用の目印を全部外して書き戻す。

const $ = (s) => document.querySelector(s);
const KIT_ATTRS = ['data-kit-cur', 'data-kit-sel', 'data-kit-hover', 'contenteditable', 'spellcheck'];
const EDIT_CSS = `
html, body { margin:0 !important; padding:0 !important; gap:0 !important; background:transparent !important; display:block !important; overflow:hidden !important; }
.slide { box-shadow:none !important; }
.slide:not([data-kit-cur]) { display:none !important; }
[data-kit-hover]:not([data-kit-sel]):not([contenteditable]) { outline:1px dashed rgba(77,141,255,.75) !important; outline-offset:2px; }
[data-kit-sel] { outline:2px solid #4d8dff !important; outline-offset:2px; }
section.slide[data-kit-sel] { outline-offset:-2px; }
[contenteditable] { outline:2px solid #e2a43b !important; outline-offset:2px; cursor:text !important; }
a { pointer-events:none; }
`;
const THUMB_CSS = `html,body{margin:0!important;padding:0!important;gap:0!important;background:none!important;display:block!important;overflow:hidden!important}.slide{box-shadow:none!important}`;
const NEW_SLIDE = `<section class="slide">
  <p class="eyebrow">見出しの上の小さい文字</p>
  <h2>新しいスライド</h2>
  <p>本文。ダブルクリックで直せる。</p>
  <aside class="notes"></aside>
</section>`;
const NAMES = { h1: '大見出し', h2: '見出し', h3: '小見出し', p: '段落', li: '箇条書き', ul: '箇条書き', ol: '番号付き', img: '画像', div: '箱', span: '文字', em: '強調', strong: '太字', section: 'スライド', svg: '図', table: '表', small: '小さい文字', br: '改行', a: 'リンク', figure: '図', aside: 'ノート' };

const S = {
  path: null, version: null, doc: null, cur: 0, sel: null, editing: null, editBefore: '',
  undo: [], redo: [], snap: null, dirty: false, saving: false, saveTimer: null, conflict: false,
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
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
let toastTimer;
const toast = (msg) => {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
};
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const setStatus = (cls, text) => { const s = $('#status'); s.className = 'status ' + cls; s.textContent = text; };
const slides = () => (S.doc ? [...S.doc.querySelectorAll('section.slide')] : []);
const curSlide = () => slides()[S.cur];
const cssOf = (e) => S.doc.defaultView.getComputedStyle(e);
const isInlineEl = (e) => ['inline', 'contents'].includes(cssOf(e).display);
const hasBlockKids = (e) => [...e.children].some((c) => !c.matches('br, aside.notes') && !isInlineEl(c));
const typing = () => {
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') || !!S.editing;
};

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
const varsStyle = () => S.doc.querySelector('style[data-kit="vars"]');

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
function restore(snap) {
  S.doc.body.innerHTML = snap.body;
  if (varsStyle()) varsStyle().textContent = snap.vars;
  S.snap = snap;
  S.sel = null; S.editing = null;
  showSlide(Math.min(snap.cur, slides().length - 1), { keepThumbs: true });
  renderThumbs();
  markDirty();
  updateUndoBtns();
}
function undo() { if (!S.undo.length) return; S.redo.push(takeSnap()); restore(S.undo.pop()); }
function redo() { if (!S.redo.length) return; S.undo.push(takeSnap()); restore(S.redo.pop()); }
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
    if (r.status === 409) { showConflict(); setStatus('error', '保存できていない（変更がぶつかった）'); return; }
    S.version = r.version; S.dirty = false; S.conflict = false; hideBanner();
    setStatus('saved', '保存済み');
  } catch (e) {
    setStatus('error', '保存に失敗：' + e.message);
  } finally {
    S.saving = false;
  }
}

// 秘書（や別の画面）がファイルを直したら反映する
async function poll() {
  if (!S.path || S.saving || document.hidden) return;
  try {
    const r = await api('GET', `/api/stat?path=${encodeURIComponent(S.path)}`);
    if (r.version === S.version) return;
    if (S.dirty || S.editing) { showConflict(); return; }
    await openDeck(S.path, { keepPlace: true, quiet: true });
    toast('ファイルの変更を反映しました');
  } catch { /* 資料が消えたなど。次で再確認 */ }
}
function showConflict() {
  if (S.conflict) return;
  S.conflict = true;
  const b = $('#banner');
  b.replaceChildren(
    el('span', {}, 'この資料が外で変更されました（秘書が直した等）。'),
    el('button', { class: 'primary', onclick: () => { S.conflict = false; hideBanner(); openDeck(S.path, { keepPlace: true }); } }, '外の変更を読み込む'),
    el('button', { onclick: () => { S.conflict = false; hideBanner(); save({ force: true }); } }, 'この画面の内容で上書き'),
  );
  b.hidden = false;
}
function hideBanner() { $('#banner').hidden = true; }

// ---------- 資料を開く ----------
async function openDeck(path, { keepPlace = false, quiet = false } = {}) {
  if (S.dirty && S.path && path !== S.path) await save();
  const d = await api('GET', `/api/deck?path=${encodeURIComponent(path)}`);
  const samePlace = keepPlace && path === S.path ? S.cur : 0;
  S.path = path; S.version = d.version; S.dirty = false; S.conflict = false; S.sel = null; S.editing = null;
  if (!keepPlace) { S.undo = []; S.redo = []; }
  hideBanner();
  history.replaceState(null, '', '#' + enc(path));
  $('#deckName').textContent = path.split('/').pop();
  $('#deckName').title = path;
  setStatus('saved', '保存済み');
  $('#main').hidden = false; $('#empty').hidden = true;
  $('#pdfBtn').disabled = $('#pptxBtn').disabled = false;
  const html = d.html.replace(/<head([^>]*)>/i, (m) => `${m}<base data-kit="base" href="/deck/${enc(path)}/">`);
  await loadFrame(html);
  showSlide(Math.min(samePlace, slides().length - 1), { keepThumbs: true });
  renderThumbs();
  S.snap = takeSnap();
  updateUndoBtns();
  markTree();
  if (!quiet) closeDrawer();
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
function showSlide(i, { keepThumbs = false } = {}) {
  const all = slides();
  if (!all.length) return;
  if (S.editing) endEdit();
  i = Math.max(0, Math.min(i, all.length - 1));
  all.forEach((s) => s.removeAttribute('data-kit-cur'));
  all[i].setAttribute('data-kit-cur', '');
  S.cur = i;
  select(null);
  $('#notes').value = all[i].querySelector('aside.notes')?.textContent.trim() ?? '';
  if (!keepThumbs) markThumbs();
  else markThumbs();
}
function addSlide() {
  const s = curSlide();
  const tmp = S.doc.createElement('div');
  tmp.innerHTML = NEW_SLIDE;
  const n = tmp.firstElementChild;
  s ? s.after(n) : S.doc.body.append(n);
  n.before(S.doc.createTextNode('\n\n'));
  commit({ structural: true });
  showSlide(S.cur + 1);
}
function dupSlide() {
  const s = curSlide(); if (!s) return;
  const c = clean(s.cloneNode(true));
  s.after(c); c.before(S.doc.createTextNode('\n\n'));
  commit({ structural: true });
  showSlide(S.cur + 1);
}
function delSlide() {
  if (slides().length <= 1) { toast('最後の1枚は消せない'); return; }
  const s = curSlide();
  const prev = s.previousSibling;
  if (prev && prev.nodeType === 3 && !prev.textContent.trim()) prev.remove();
  s.remove();
  S.cur = Math.min(S.cur, slides().length - 1);
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

// ---------- サムネイル ----------
function thumbHTML(slide) {
  const head = S.doc.head.cloneNode(true);
  head.querySelectorAll('style[data-kit="edit"]').forEach((e) => e.remove());
  const s = clean(slide.cloneNode(true));
  return `<!doctype html><html><head>${head.innerHTML}<style>${THUMB_CSS}</style></head><body>${s.outerHTML}</body></html>`;
}
function renderThumbs() {
  const box = $('#thumbs');
  box.replaceChildren();
  slides().forEach((s, i) => {
    const f = el('iframe', { tabindex: '-1', loading: 'lazy', 'aria-hidden': 'true' });
    f.srcdoc = thumbHTML(s);
    const t = el('div', { class: 'thumb', draggable: 'true', 'data-i': i },
      el('span', { class: 'num' }, String(i + 1)), el('div', { class: 'box' }, f));
    t.addEventListener('click', () => showSlide(i));
    t.addEventListener('dragstart', (e) => { t.classList.add('dragging'); e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; });
    t.addEventListener('dragend', () => { t.classList.remove('dragging'); clearDrop(); });
    t.addEventListener('dragover', (e) => {
      e.preventDefault(); clearDrop();
      const r = t.getBoundingClientRect();
      t.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    });
    t.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain'));
      const before = t.classList.contains('drop-before');
      clearDrop();
      let to = before ? i : i + 1;
      if (from < to) to -= 1;
      moveSlide(from, Math.min(to, slides().length - 1));
    });
    box.append(t);
  });
  markThumbs();
}
const clearDrop = () => document.querySelectorAll('.drop-before, .drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
function markThumbs() {
  document.querySelectorAll('.thumb').forEach((t) => t.classList.toggle('current', Number(t.dataset.i) === S.cur));
  document.querySelector('.thumb.current')?.scrollIntoView({ block: 'nearest' });
}
const refreshThumb = debounce((i) => {
  const t = document.querySelector(`.thumb[data-i="${i}"] iframe`);
  const s = slides()[i];
  if (t && s) t.srcdoc = thumbHTML(s);
}, 350);

// ---------- 選ぶ・文字を直す ----------
function pick(target) {
  let t = target?.nodeType === 1 ? target : target?.parentElement;
  if (!t || !t.closest) return null;
  const slide = t.closest('section.slide');
  if (!slide) return null;
  return t.closest('aside.notes') ? slide : t;
}
function select(node) {
  S.doc?.querySelectorAll('[data-kit-sel]').forEach((e) => e.removeAttribute('data-kit-sel'));
  S.sel = node;
  if (node) node.setAttribute('data-kit-sel', '');
  renderCrumbs();
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
  select(t);
  t.setAttribute('contenteditable', 'true');
  t.setAttribute('spellcheck', 'false');
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

function bindFrame(doc) {
  doc.addEventListener('mouseover', (e) => {
    doc.querySelectorAll('[data-kit-hover]').forEach((x) => x.removeAttribute('data-kit-hover'));
    const n = pick(e.target);
    if (n) n.setAttribute('data-kit-hover', '');
  });
  doc.addEventListener('mouseleave', () => doc.querySelectorAll('[data-kit-hover]').forEach((x) => x.removeAttribute('data-kit-hover')));
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
  doc.addEventListener('keydown', (e) => {
    if (S.editing) {
      if (e.key === 'Escape') { e.preventDefault(); endEdit(); return; }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); doc.execCommand('insertLineBreak'); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); endEdit(); save(); }
      return;
    }
    onKey(e);
  });
  doc.addEventListener('paste', (e) => {
    if (!S.editing) return;
    e.preventDefault();
    doc.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  doc.addEventListener('focusout', (e) => { if (S.editing && e.target === S.editing) endEdit(); });
  doc.addEventListener('dragstart', (e) => e.preventDefault());
}

function renderCrumbs() {
  const c = $('#crumbs');
  c.replaceChildren();
  if (!S.doc) return;
  if (!S.sel) {
    c.append(el('span', { class: 'hint' }, `スライド ${S.cur + 1} ／ クリックで部品を選ぶ・ダブルクリックで文字を直す・Esc で親へ`));
    return;
  }
  const chain = [];
  for (let n = S.sel; n && n.nodeType === 1; n = n.parentElement) {
    chain.unshift(n);
    if (n.matches('section.slide')) break;
  }
  chain.forEach((n, i) => {
    if (i) c.append(el('span', { class: 'sep' }, '›'));
    const label = n.matches('section.slide') ? `スライド ${S.cur + 1}` : nameOf(n);
    c.append(el('button', { class: i === chain.length - 1 ? 'last' : '', onclick: () => select(n) }, label));
  });
}
function nameOf(n) {
  const tag = n.tagName.toLowerCase();
  const cls = n.classList[0];
  const known = { eyebrow: '小見出し', card: 'カード', stat: '数字', num: '数字', label: 'ラベル', tag: 'タグ', footer: '下の帯', grid: '並び', split: '左右', bar: '帯つき文', lead: 'リード文', photo: '写真', bg: '背景画像', shade: '暗幕', row: '横並び' };
  return (cls && known[cls]) || NAMES[tag] || tag;
}

// ---------- 右パネル ----------
function themeVars() {
  const t = varsStyle()?.textContent ?? '';
  return [...t.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => ({ name: m[1], value: m[2].trim() }));
}
const isColor = (v) => /^#([0-9a-f]{3,8})$|^rgba?\(|^hsla?\(/i.test(v);
const colorVars = () => themeVars().filter((v) => isColor(v.value));
function setVar(name, value) {
  const st = varsStyle(); if (!st) return;
  st.textContent = st.textContent.replace(new RegExp(`(--${name}\\s*:\\s*)([^;]+)(;)`), `$1${value}$3`);
}

function swatchRow(current, onPick, { allowClear = true, clearLabel = '元', transparent = false } = {}) {
  const box = el('div', { class: 'swatches' });
  for (const v of colorVars()) {
    const val = `var(--${v.name})`;
    box.append(el('button', { class: 'sw' + (current === val ? ' on' : ''), title: `${v.name}（${v.value}）`, style: `background:${v.value}`, onclick: () => onPick(val) }));
  }
  if (transparent) box.append(el('button', { class: 'sw clear' + (current === 'transparent' ? ' on' : ''), title: '透明', onclick: () => onPick('transparent') }, '∅'));
  if (allowClear) box.append(el('button', { class: 'link', title: 'テーマの見た目に戻す', onclick: () => onPick('') }, clearLabel === '元' ? '元に戻す' : clearLabel));
  return box;
}
function field(label, ...kids) { return el('div', { class: 'field' }, el('label', {}, label), el('div', {}, ...kids)); }
function seg(options, current, onPick) {
  return el('div', { class: 'seg' }, options.map(([v, label]) => el('button', { class: current === v ? 'on' : '', onclick: () => onPick(v) }, label)));
}
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
  const n = S.sel && !S.sel.matches('section.slide') ? S.sel : null;

  // 要素
  const sec = el('div', { class: 'sec' }, el('h4', {}, '部品', el('span', { class: 'what' }, n ? nameOf(n) : '')));
  if (!n) {
    sec.append(el('p', { class: 'muted-note' }, 'スライドの中の部品をクリックすると、ここで色や大きさを変えられる。'));
  } else {
    const cs = cssOf(n);
    const textish = !n.matches('img, svg, br');
    if (textish) {
      sec.append(field('文字色', swatchRow(n.style.color, (v) => styleChange(n, 'color', v))));
      const size = Math.round(parseFloat(cs.fontSize));
      const inp = el('input', { type: 'number', min: '8', max: '200', value: String(size) });
      inp.addEventListener('change', () => styleChange(n, 'fontSize', inp.value ? `${inp.value}px` : ''));
      sec.append(field('大きさ', el('div', { class: 'num-in' },
        el('button', { onclick: () => styleChange(n, 'fontSize', `${Math.max(8, size - 2)}px`) }, '−'),
        inp,
        el('button', { onclick: () => styleChange(n, 'fontSize', `${size + 2}px`) }, '＋'),
        n.style.fontSize ? el('button', { class: 'reset', title: 'テーマの大きさに戻す', onclick: () => styleChange(n, 'fontSize', '') }, '↺') : null)));
      const bold = parseInt(cs.fontWeight, 10) >= 600;
      sec.append(field('太さ', seg([['400', '標準'], ['700', '太字']], bold ? '700' : '400', (v) => styleChange(n, 'fontWeight', v))));
      const al = cs.textAlign === 'start' ? 'left' : cs.textAlign;
      sec.append(field('揃え', seg([['left', '左'], ['center', '中央'], ['right', '右']], al, (v) => styleChange(n, 'textAlign', v))));
    }
    sec.append(field('背景色', swatchRow(n.style.backgroundColor, (v) => styleChange(n, 'backgroundColor', v), { transparent: true })));
    sec.append(el('div', { class: 'actions' },
      el('button', { onclick: () => { const p = n.parentElement; if (p && !p.matches('body')) select(p.closest('section.slide') === p ? p : p); } }, '親を選ぶ'),
      el('button', { onclick: dupEl }, '複製'),
      el('button', { onclick: delEl }, '削除')));
  }
  box.append(sec);

  // スライド
  if (slide) {
    const dark = slide.getAttribute('data-bg') === 'dark';
    const center = slide.getAttribute('data-align') === 'center';
    const ss = el('div', { class: 'sec' }, el('h4', {}, 'スライド', el('span', { class: 'what' }, `${S.cur + 1} / ${slides().length}`)));
    ss.append(field('地の色', seg([['light', '明るい'], ['dark', '暗い']], dark ? 'dark' : 'light', (v) => {
      v === 'dark' ? slide.setAttribute('data-bg', 'dark') : slide.removeAttribute('data-bg');
      commit(); renderInspector();
    })));
    ss.append(field('縦位置', seg([['top', '上'], ['center', '中央']], center ? 'center' : 'top', (v) => {
      v === 'center' ? slide.setAttribute('data-align', 'center') : slide.removeAttribute('data-align');
      commit(); renderInspector();
    })));
    ss.append(field('背景色', swatchRow(slide.style.backgroundColor, (v) => styleChange(slide, 'backgroundColor', v))));
    box.append(ss);
  }

  // テーマ色
  const ts = el('div', { class: 'sec' }, el('h4', {}, 'テーマ色（資料全体）'));
  const vars = colorVars();
  if (!vars.length) ts.append(el('p', { class: 'muted-note' }, 'この資料にはテーマ色（<style data-kit="vars">）が無い。'));
  const commitVars = debounce(() => commit({ structural: true }), 400);
  for (const v of vars) {
    const hex = toHex(v.value);
    const picker = el('input', { type: 'color', value: hex || '#000000' });
    const text = el('input', { type: 'text', value: v.value, spellcheck: 'false' });
    const apply = (val) => { setVar(v.name, val); commitVars(); };
    picker.addEventListener('input', () => { text.value = picker.value; apply(picker.value); });
    text.addEventListener('change', () => { if (isColor(text.value.trim())) { apply(text.value.trim()); const h = toHex(text.value.trim()); if (h) picker.value = h; } else text.value = v.value; });
    ts.append(el('div', { class: 'var-row' }, picker, el('span', { class: 'vname', title: `--${v.name}` }, v.name), text));
  }
  box.append(ts);
}
function toHex(v) {
  const m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1];
  return '#' + (h.length === 3 ? h.split('').map((c) => c + c).join('') : h).toLowerCase();
}
function dupEl() {
  const n = S.sel; if (!n || n.matches('section.slide')) return;
  const c = clean(n.cloneNode(true));
  n.after(c);
  commit();
  select(c);
}
function delEl() {
  const n = S.sel; if (!n || n.matches('section.slide')) return;
  const p = n.parentElement;
  n.remove();
  commit();
  select(p && !p.matches('body') ? p : null);
  toast('部品を削除（⌘Z で戻せる）');
}

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
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === '\\') { e.preventDefault(); toggleDrawer(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save({ force: false }); return; }
  if (!S.doc || typing()) return;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); S.sel && !S.sel.matches('section.slide') ? dupEl() : dupSlide(); return; }
  if (e.key === 'Escape') {
    if (document.body.classList.contains('drawer-open')) { closeDrawer(); return; }
    if (S.sel) { const p = S.sel.matches('section.slide') ? null : S.sel.parentElement; select(p && p.closest('section.slide') ? p : null); }
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel && !S.sel.matches('section.slide')) { e.preventDefault(); delEl(); return; }
  if (e.key === 'Enter' && S.sel && !S.sel.matches('section.slide')) { e.preventDefault(); startEdit(S.sel); return; }
  if (!S.sel && (e.key === 'ArrowDown' || e.key === 'PageDown')) { e.preventDefault(); showSlide(S.cur + 1); }
  if (!S.sel && (e.key === 'ArrowUp' || e.key === 'PageUp')) { e.preventDefault(); showSlide(S.cur - 1); }
}
window.addEventListener('keydown', onKey);

// ---------- 大きさ合わせ ----------
function fit() {
  const st = $('#stage');
  const w = st.clientWidth - 48, h = st.clientHeight - 40;
  if (w <= 0 || h <= 0) return;
  const k = Math.min(w / 1280, h / 720);
  $('#frameWrap').style.width = `${1280 * k}px`;
  $('#frameWrap').style.height = `${720 * k}px`;
  $('#frame').style.transform = `scale(${k})`;
  $('#zoom').textContent = `${Math.round(k * 100)}%`;
}
new ResizeObserver(fit).observe($('#stage'));

// ---------- サイドバー ----------
function toggleDrawer(open) {
  const b = document.body.classList;
  (open ?? !b.contains('drawer-open')) ? (b.add('drawer-open'), loadTree()) : b.remove('drawer-open');
}
const closeDrawer = () => toggleDrawer(false);
const openSet = () => { try { return new Set(JSON.parse(localStorage.getItem('kit.open') || '[]')); } catch { return new Set(); } };
const saveOpen = (s) => { try { localStorage.setItem('kit.open', JSON.stringify([...s])); } catch { /* 無視 */ } };

async function loadTree() {
  const nav = $('#tree');
  let items;
  try { items = await api('GET', '/api/tree'); } catch (e) { nav.textContent = '一覧を読めない：' + e.message; return; }
  const opened = openSet();
  const build = (list) => el('ul', {}, list.map((it) => {
    if (it.type === 'deck') {
      return el('li', {}, el('button', { class: 'node deck', 'data-path': it.path, onclick: () => openDeck(it.path) },
        el('span', { class: 'caret' }), el('span', { class: 'ico' }, '▤'), it.name));
    }
    const li = el('li', { class: opened.has(it.path) ? 'open' : '' });
    li.append(el('button', { class: 'node', onclick: () => {
      li.classList.toggle('open');
      const s = openSet(); li.classList.contains('open') ? s.add(it.path) : s.delete(it.path); saveOpen(s);
    } }, el('span', { class: 'caret' }, '▶'), it.name), it.children.length ? build(it.children) : el('ul', {}, el('li', { class: 'empty' }, '（空）')));
    return li;
  }));
  nav.replaceChildren(items.length ? build(items) : el('p', { class: 'empty' }, 'slide/ に資料がまだ無い。下の「＋ 新しい資料」で作る。'));
  markTree();
}
function markTree() {
  document.querySelectorAll('#tree .deck').forEach((b) => b.classList.toggle('current', b.dataset.path === S.path));
  // 開いている資料のフォルダは開いておく
  if (S.path) {
    const s = openSet();
    const parts = S.path.split('/');
    for (let i = 1; i < parts.length; i++) s.add(parts.slice(0, i).join('/'));
    saveOpen(s);
  }
}

$('#menuBtn').onclick = () => toggleDrawer();
$('#closeDrawer').onclick = closeDrawer;
$('#scrim').onclick = closeDrawer;
$('#undoBtn').onclick = undo;
$('#redoBtn').onclick = redo;
$('#addSlide').onclick = addSlide;
$('#dupSlide').onclick = dupSlide;
$('#delSlide').onclick = delSlide;

// 新しい資料
$('#newBtn').onclick = () => { $('#newBtn').hidden = true; $('#newForm').hidden = false; $('#newPath').focus(); };
$('#newCancel').onclick = () => { $('#newForm').hidden = true; $('#newBtn').hidden = false; };
$('#newForm').onsubmit = async (e) => {
  e.preventDefault();
  const p = $('#newPath').value.trim();
  if (!p) return;
  try {
    const r = await api('POST', '/api/new', { path: p });
    $('#newPath').value = '';
    $('#newCancel').onclick();
    const s = openSet(); const parts = r.path.split('/');
    for (let i = 1; i < parts.length; i++) s.add(parts.slice(0, i).join('/'));
    saveOpen(s);
    await loadTree();
    await openDeck(r.path);
    toast('作りました');
  } catch (err) { toast('作れない：' + err.message); }
};

// 書き出し
async function doExport(kind) {
  if (!S.path) return;
  const msg = $('#exportMsg');
  const btns = [$('#pdfBtn'), $('#pptxBtn')];
  if (S.editing) endEdit();
  if (S.dirty) await save();
  if (S.conflict) { msg.textContent = '先に「変更がぶつかった」を解決して'; return; }
  btns.forEach((b) => (b.disabled = true));
  msg.textContent = `${kind.toUpperCase()} を書き出し中…`;
  try {
    const r = await api('POST', '/api/export', { path: S.path, kind });
    const extra = r.raster ? `・画像になった部分 ${r.raster}` : '';
    msg.replaceChildren(
      el('div', {}, `✔ ${kind.toUpperCase()}（${r.slides}枚${extra}）`),
      el('div', { class: 'muted-note' }, `slide/${r.rel}`),
      el('button', { class: 'small', onclick: () => api('POST', '/api/reveal', { out: r.out }) }, 'Finder で表示'),
    );
  } catch (e) {
    msg.textContent = '✖ ' + e.message;
  } finally {
    btns.forEach((b) => (b.disabled = !S.path));
  }
}
$('#pdfBtn').onclick = () => doExport('pdf');
$('#pptxBtn').onclick = () => doExport('pptx');

// ---------- 起動 ----------
window.addEventListener('beforeunload', (e) => { if (S.dirty) { save(); e.preventDefault(); } });
setInterval(poll, 2000);
(async () => {
  const p = decodeURIComponent(location.hash.slice(1));
  if (p) {
    try { await openDeck(p); return; } catch { toast('資料が見つからない：' + p); }
  }
  toggleDrawer(true);
})();
