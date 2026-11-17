// deck.html のチェック。[{slide, level:'error'|'warn', msg, where}] を返す。
(() => {
  const issues = [];
  const px = (v) => parseFloat(v) || 0;
  const label = (el) => {
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
    const cls = el.classList.length ? '.' + [...el.classList].join('.') : '';
    return `<${el.tagName.toLowerCase()}${cls}>` + (t ? `「${t.slice(0, 18)}${t.length > 18 ? '…' : ''}」` : '');
  };
  const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const RASTER = new Set(['svg', 'canvas', 'video', 'iframe', 'table']);

  const slides = [...document.querySelectorAll('section.slide')];
  if (!slides.length) issues.push({ slide: 0, level: 'error', msg: '<section class="slide"> が1枚も無い', where: '' });

  slides.forEach((slide, i) => {
    const n = i + 1;
    const sr = slide.getBoundingClientRect();
    const seen = new Set();
    const push = (level, msg, el) => {
      const key = msg + label(el);
      if (seen.has(key)) return;
      seen.add(key);
      issues.push({ slide: n, level, msg, where: label(el) });
    };
    for (const el of slide.querySelectorAll('*')) {
      if (el.closest('aside.notes, script, style')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();

      if (r.width > 0 && r.height > 0 && !el.matches('.bg, .shade') &&
          (r.left < sr.left - 1 || r.right > sr.right + 1 || r.top < sr.top - 1 || r.bottom > sr.bottom + 1)) {
        // 親がもうはみ出しているなら、親だけ言う
        const p = el.parentElement;
        const pr = p.getBoundingClientRect();
        if (p === slide || !(pr.left < sr.left - 1 || pr.right > sr.right + 1 || pr.top < sr.top - 1 || pr.bottom > sr.bottom + 1)) {
          push('error', 'スライドの外にはみ出している（文字を減らすか小さくする）', el);
        }
      }
      if (hasText(el) && el.scrollWidth > el.clientWidth + 2 && cs.display !== 'inline') {
        push('error', '文字が箱の横からはみ出している', el);
      }
      if (tag === 'img' && (!el.complete || !el.naturalWidth)) {
        push('error', `画像が見つからない: ${el.getAttribute('src')}`, el);
      }
      if (hasText(el) && px(cs.fontSize) < 14) {
        push('warn', `文字が小さい（${px(cs.fontSize)}px。14px 以上に）`, el);
      }
      if (RASTER.has(tag) || cs.transform !== 'none' || cs.filter !== 'none' || /gradient/.test(cs.backgroundImage)) {
        if (!el.closest('svg') || tag === 'svg') push('warn', 'PPTX ではこの部分が画像になる（PowerPoint で文字を直せない）', el);
      }
      const st = el.getAttribute('style') || '';
      if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(st)) {
        push('warn', '色を直書きしている（var(--accent) などテーマ色を使う）', el);
      }
    }
  });
  return issues;
})()
