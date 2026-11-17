// deck.html を描画した状態から、スライドごとに「何が・どこに・どんな見た目で」あるかを読み取る。
// 結果は export/pptx.py が PowerPoint の部品に置き直す。
// 返す形：[{bg, notes, items:[{type:'text'|'shape'|'image'|'raster', z, order, x, y, w, h, ...}]}]
(() => {
  const rootCS = getComputedStyle(document.documentElement);
  const unq = (s) => (s || '').trim().replace(/^["']|["']$/g, '');
  const FONT_SANS = unq(rootCS.getPropertyValue('--pptx-font-sans')) || 'Yu Gothic';
  const FONT_SERIF = unq(rootCS.getPropertyValue('--pptx-font-serif')) || 'Yu Mincho';

  const color = (c, mul = 1) => {
    const m = (c || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    const a = (p.length > 3 ? p[3] : 1) * mul;
    return a < 0.01 ? null : { r: p[0], g: p[1], b: p[2], a };
  };
  const px = (v) => parseFloat(v) || 0;
  const isSerif = (ff) => {
    const first = (ff || '').split(',')[0];
    return /mincho|明朝|serif/i.test(first) && !/sans/i.test(first);
  };
  const shown = (cs) => cs.display !== 'none' && cs.visibility !== 'hidden' && px(cs.opacity) > 0.01;
  const INLINE = new Set(['inline', 'contents']);
  const RASTER_TAGS = new Set(['svg', 'canvas', 'video', 'iframe', 'table', 'object', 'math']);
  const PPTX_IMG = /\.(png|jpe?g|gif|bmp|tiff?|webp)(\?|#|$)/i;

  let rasterSeq = 0;
  const result = [];

  document.querySelectorAll('section.slide').forEach((slide) => {
    const sr = slide.getBoundingClientRect();
    const items = [];
    let order = 0;
    const rel = (r) => ({ x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height });
    const add = (item, z) => items.push(Object.assign(item, { z, order: order++ }));

    const raster = (el, mode, z, r) => {
      const id = String(++rasterSeq);
      el.setAttribute(mode === 'bg' ? 'data-kit-raster-bg' : 'data-kit-raster', id);
      add(Object.assign({ type: 'raster', id, mode, why: el.tagName.toLowerCase() }, r), z);
    };

    // 文字の見た目（1つの文字の塊）
    const runStyle = (el, op) => {
      const cs = getComputedStyle(el);
      const deco = cs.textDecorationLine || '';
      return {
        font: isSerif(cs.fontFamily) ? FONT_SERIF : FONT_SANS,
        size: px(cs.fontSize),
        bold: parseInt(cs.fontWeight, 10) >= 600,
        italic: cs.fontStyle === 'italic',
        color: color(cs.color, op),
        underline: deco.includes('underline'),
        strike: deco.includes('line-through'),
        spacing: px(cs.letterSpacing),
      };
    };

    // ノードの並び → 段落（<br> で区切る）と文字の塊
    const toParas = (nodes, op) => {
      const paras = [[]];
      const visit = (n) => {
        if (n.nodeType === 3) {
          const parent = n.parentElement;
          const pre = /pre/.test(getComputedStyle(parent).whiteSpace);
          let t = n.textContent;
          if (!pre) t = t.replace(/\s+/g, ' ');
          if (t) paras[paras.length - 1].push(Object.assign({ text: t }, runStyle(parent, op)));
        } else if (n.nodeType === 1) {
          if (n.tagName === 'BR') { paras.push([]); return; }
          const cs = getComputedStyle(n);
          if (!shown(cs) || n.matches('aside.notes, script, style')) return;
          n.childNodes.forEach(visit);
        }
      };
      nodes.forEach(visit);
      // 段落の頭と終わりの空白を落とす（CSS と同じ）
      for (const p of paras) {
        while (p.length && !(p[0].text = p[0].text.replace(/^\s+/, ''))) p.shift();
        while (p.length && !(p[p.length - 1].text = p[p.length - 1].text.replace(/\s+$/, ''))) p.pop();
      }
      return paras;
    };

    const textItem = (blockEl, nodes, r, op) => {
      const cs = getComputedStyle(blockEl);
      const paras = toParas(nodes, op);
      if (!paras.some((p) => p.some((run) => run.text.trim()))) return null;
      const size = px(cs.fontSize);
      const lh = cs.lineHeight === 'normal' ? size * 1.2 : px(cs.lineHeight);
      let align = cs.textAlign;
      if (align === 'start' || align === '-webkit-auto') align = 'left';
      if (align === 'end') align = 'right';
      let valign = 'top';
      if (cs.display.includes('flex')) {
        const col = cs.flexDirection.startsWith('column');
        if ((col ? cs.justifyContent : cs.alignItems) === 'center') valign = 'middle';
      }
      const item = {
        type: 'text', ...r, paras, align, valign, lineHeight: lh,
        pad: {
          t: px(cs.paddingTop) + px(cs.borderTopWidth), r: px(cs.paddingRight) + px(cs.borderRightWidth),
          b: px(cs.paddingBottom) + px(cs.borderBottomWidth), l: px(cs.paddingLeft) + px(cs.borderLeftWidth),
        },
        singleLine: r.h < lh * 1.5 + px(cs.paddingTop) + px(cs.paddingBottom),
      };
      // 箇条書き：記号は ul/ol の左の余白にぶら下げる
      if (blockEl.tagName === 'LI' && getComputedStyle(blockEl).display === 'list-item') {
        const list = blockEl.parentElement;
        const indent = blockEl.getBoundingClientRect().left - list.getBoundingClientRect().left;
        const mk = getComputedStyle(blockEl, '::marker');
        item.bullet = {
          kind: list.tagName === 'OL' ? 'num' : 'char',
          n: [...list.children].filter((c) => c.tagName === 'LI').indexOf(blockEl) + (list.start || 1),
          indent, color: color(mk.color, op),
        };
        item.x -= indent; item.w += indent;
      }
      return item;
    };

    const walk = (el, z, op) => {
      const cs = getComputedStyle(el);
      if (!shown(cs) || el.matches('aside.notes, script, style, template')) return;
      if (cs.position !== 'static' && cs.zIndex !== 'auto') z = parseInt(cs.zIndex, 10);
      op *= px(cs.opacity);
      const b = el.getBoundingClientRect();
      const r = rel(b);
      const tag = el.tagName.toLowerCase();
      if (r.w < 0.5 || r.h < 0.5) {
        if (cs.display !== 'contents') return;
      }

      // そのまま変換できないもの → その部分を画像にする
      const radius = px(cs.borderTopLeftRadius);
      const complex = RASTER_TAGS.has(tag) || el instanceof SVGElement || cs.transform !== 'none' ||
        cs.filter !== 'none' || cs.clipPath !== 'none' || cs.mixBlendMode !== 'normal' ||
        (tag === 'img' && (radius > 0 || !el.currentSrc.startsWith('file:') || !PPTX_IMG.test(el.currentSrc)));
      if (complex) { raster(el, 'full', z, r); return; }

      if (tag === 'img') {
        if (!el.naturalWidth) return;
        add({ type: 'image', ...r, src: el.currentSrc, fit: cs.objectFit, pos: cs.objectPosition,
              nw: el.naturalWidth, nh: el.naturalHeight, alpha: op }, z);
        return;
      }

      // 箱（背景・枠線・角丸）
      const bgImg = cs.backgroundImage;
      if (bgImg && bgImg !== 'none') {
        const url = bgImg.match(/^url\("?(.*?)"?\)$/);
        if (url && url[1].startsWith('file:') && PPTX_IMG.test(url[1])) {
          add({ type: 'image', ...r, src: url[1], fit: cs.backgroundSize === 'contain' ? 'contain' : 'cover',
                pos: cs.backgroundPosition, nw: 0, nh: 0, alpha: op }, z);
        } else {
          raster(el, 'bg', z, r);
        }
      }
      const fill = color(cs.backgroundColor, op);
      const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({
        w: cs[`border${s}Style`] === 'none' ? 0 : px(cs[`border${s}Width`]), c: color(cs[`border${s}Color`], op),
      }));
      const same = sides.every((s) => s.w === sides[0].w && JSON.stringify(s.c) === JSON.stringify(sides[0].c));
      if (fill || (same && sides[0].w > 0 && sides[0].c)) {
        const round = Math.min(radius, r.w / 2, r.h / 2);
        add({ type: 'shape', ...r, fill, radius: round,
              ellipse: radius >= Math.min(r.w, r.h) / 2 - 0.5 && Math.abs(r.w - r.h) < 1,
              line: same && sides[0].w > 0 && sides[0].c ? { w: sides[0].w, c: sides[0].c } : null }, z);
      }
      if (!same) {
        const [t, rt, bt, l] = sides;
        if (t.w && t.c) add({ type: 'shape', x: r.x, y: r.y, w: r.w, h: t.w, fill: t.c, radius: 0 }, z);
        if (bt.w && bt.c) add({ type: 'shape', x: r.x, y: r.y + r.h - bt.w, w: r.w, h: bt.w, fill: bt.c, radius: 0 }, z);
        if (l.w && l.c) add({ type: 'shape', x: r.x, y: r.y, w: l.w, h: r.h, fill: l.c, radius: 0 }, z);
        if (rt.w && rt.c) add({ type: 'shape', x: r.x + r.w - rt.w, y: r.y, w: rt.w, h: r.h, fill: rt.c, radius: 0 }, z);
      }

      // 文字：子が全部インラインなら、この部品で1つのテキストボックス
      const kids = [...el.childNodes];
      const blockKid = (n) => n.nodeType === 1 && !n.matches('br, aside.notes, script, style') &&
        !INLINE.has(getComputedStyle(n).display);
      if (!kids.some(blockKid)) {
        const t = textItem(el, kids, r, op);
        if (t) add(t, z);
        return;
      }
      // 文字と箱が混ざっている：インラインの続きごとにテキストボックスにする
      let group = [];
      const flush = () => {
        if (!group.length) return;
        const range = document.createRange();
        range.setStartBefore(group[0]); range.setEndAfter(group[group.length - 1]);
        const gr = rel(range.getBoundingClientRect());
        if (gr.w > 0 && gr.h > 0) {
          const t = textItem(el, group, gr, op);
          if (t) { t.pad = { t: 0, r: 0, b: 0, l: 0 }; add(t, z); }
        }
        group = [];
      };
      for (const n of kids) {
        if (blockKid(n)) { flush(); walk(n, z, op); }
        else if (n.nodeType === 3 || n.nodeType === 1) group.push(n);
      }
      flush();
    };

    // スライドの背景
    const scs = getComputedStyle(slide);
    if (scs.backgroundImage && scs.backgroundImage !== 'none') raster(slide, 'bg', -1e9, { x: 0, y: 0, w: sr.width, h: sr.height });
    slide.childNodes.forEach((n) => {
      if (n.nodeType === 1) walk(n, 0, 1);
    });
    // スライド直下の文字（ふつうは無い）
    const loose = [...slide.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (loose.length) {
      const range = document.createRange();
      range.setStartBefore(loose[0]); range.setEndAfter(loose[loose.length - 1]);
      const t = textItem(slide, loose, rel(range.getBoundingClientRect()), 1);
      if (t) add(t, 0);
    }

    result.push({
      bg: color(scs.backgroundColor),
      top: sr.top + window.scrollY,
      notes: (slide.querySelector('aside.notes')?.textContent || '').trim(),
      items,
    });
  });
  return result;
})()
