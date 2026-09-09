/* ui.js — helpers de DOM, folhas (bottom sheets), toasts e componentes de formulário. */

export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  add(e, kids);
  return e;
}
function add(e, kids) {
  for (const k of kids.flat(4)) {
    if (k === null || k === undefined || k === false) continue;
    e.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const frag = (...kids) => { const f = document.createDocumentFragment(); add(f, kids); return f; };
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- ícones ---------------- */
const PATHS = {
  back: 'M15 5l-7 7 7 7',
  chev: 'M9 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.6 2 2 0 1 1 14 4.6a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z',
  flask: 'M9 3h6M10 3v6.2L5.5 17.4A2.5 2.5 0 0 0 7.7 21h8.6a2.5 2.5 0 0 0 2.2-3.6L14 9.2V3',
  tank: 'M4 8h16v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8zM8 8V6a4 4 0 0 1 8 0v2M9 14h4',
  fish: 'M3 12c4-6 12-6 16 0-4 6-12 6-16 0zM19 12l2-3v6l-2-3zM8 11h.01',
  leaf: 'M11 20A7 7 0 0 1 4 13V8a4 4 0 0 1 4-4h5a7 7 0 0 1 7 7 9 9 0 0 1-9 9zM12 12l-5 8',
  clip: 'M8 4h8a2 2 0 0 1 2 2v14H6V6a2 2 0 0 1 2-2zM9 3h6v3H9zM9 12l2 2 4-4',
  book: 'M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2V5zM8 7h7M8 11h7',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  drop: 'M12 3s6 6.5 6 10.5A6 6 0 0 1 6 13.5C6 9.5 12 3 12 3z',
  alert: 'M12 8v5M12 17h.01M10.3 3.9 2.6 17.3A2 2 0 0 0 4.3 20.3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  check: 'M5 13l4 4L19 7',
  checkCircle: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.1l-3-3',
  info: 'M12 16v-4M12 8h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  bulb: 'M12 3a7 7 0 0 1 7 7c0 2.6-1.4 4-2.5 5.2-.6.7-.9 1.3-.9 2.1v.7h-7v-.7c0-.8-.3-1.4-.9-2.1C6.4 14 5 12.6 5 10a7 7 0 0 1 7-7zM10 21h4',
  cam: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  x: 'M18 6 6 18M6 6l12 12',
  edit: 'M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  down: 'M12 3v14M6 13l6 6 6-6M4 21h16',
  up: 'M12 21V7M6 11l6-6 6 6M4 3h16',
  share: 'M8.6 13.5 15.4 17M15.4 7 8.6 10.5M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  cal: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  box: 'M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  shrimp: 'M20 8c-6 0-9 3-9 3s-3-1-5 1c-2 2-1 5 1 6s5 0 6-2M14 6c1.5 0 2.5 1 2.5 1M6 14h.01',
  snail: 'M15 19H6a4 4 0 0 1 0-8 5 5 0 1 1 5 5V9M4 8 2 6',
  food: 'M6 3v8a3 3 0 0 0 6 0V3M9 11v10M17 3c-1.5 2-2 4-2 6s1 3 1 3v9',
  light: 'M9 18h6M10 22h4M12 2v3M4.9 6.3l2.1 2.1M19.1 6.3 17 8.4M6 13a6 6 0 1 1 12 0c0 2.5-1.5 3.5-2 5H8c-.5-1.5-2-2.5-2-5z',
  timer: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 10v4l3 2M9 2h6'
};
export function icon(name, cls = 'ic') {
  const p = PATHS[name] || PATHS.info;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  p.split(' M').forEach((seg, i) => {
    const pe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pe.setAttribute('d', (i ? 'M' : '') + seg);
    svg.appendChild(pe);
  });
  return svg;
}

/* ---------------- toast ---------------- */
export function toast(msg, kind = '') {
  const r = $('#toast-root');
  const t = h('div', { class: 'toast ' + kind, text: msg });
  r.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .25s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 260); }, 2400);
}

/* ---------------- bottom sheet ---------------- */
let openSheets = 0;
export function sheet({ title, body, actions, onClose, big }) {
  const root = $('#modal-root');
  const bd = h('div', { class: 'backdrop' });
  const sh = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });

  const close = (v) => {
    bd.classList.remove('in'); sh.classList.remove('in');
    setTimeout(() => { bd.remove(); sh.remove(); openSheets--; if (!openSheets) document.body.style.overflow = ''; }, 240);
    onClose?.(v);
  };

  sh.appendChild(h('div', { class: 'sheet-grab' }));
  if (title) {
    sh.appendChild(h('div', { class: 'sheet-head' },
      h('h3', { text: title }),
      h('button', { class: 'sheet-x', 'aria-label': 'Fechar', onclick: () => close() }, icon('x', 'ic ic-sm'))
    ));
  }
  const bodyEl = h('div', { class: 'sheet-body' });
  if (big) sh.style.minHeight = '60vh';
  sh.appendChild(bodyEl);
  if (typeof body === 'function') body(bodyEl, close); else if (body) bodyEl.appendChild(body);
  if (actions) sh.appendChild(actions(close));

  root.appendChild(bd); root.appendChild(sh);
  openSheets++; document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => { bd.classList.add('in'); sh.classList.add('in'); });
  bd.addEventListener('click', () => close());
  return { close, el: sh, body: bodyEl };
}

export function menuSheet(title, items) {
  return sheet({
    title,
    body: (b, close) => {
      const list = h('div', { class: 'sheet-list' });
      items.forEach((it) => {
        if (!it) return;
        list.appendChild(h('button', { class: it.danger ? 'del' : '', onclick: () => { close(); setTimeout(() => it.on?.(), 120); } },
          icon(it.icon || 'chev', 'ic'), h('span', { text: it.label })));
      });
      b.appendChild(list);
    }
  });
}

export function confirmSheet({ title, message, confirmText = 'Confirmar', danger = false, onConfirm }) {
  return sheet({
    title,
    body: (b) => b.appendChild(h('p', { class: 'note', style: { fontSize: '14.5px', color: 'var(--tx-2)', margin: '4px 0 16px' }, text: message })),
    actions: (close) => h('div', { class: 'btn-row', style: { paddingTop: '4px' } },
      h('button', { class: 'btn sec', text: 'Cancelar', onclick: () => close() }),
      h('button', { class: 'btn ' + (danger ? 'danger' : ''), text: confirmText, onclick: () => { close(); setTimeout(() => onConfirm?.(), 120); } })
    )
  });
}

/* ---------------- menu do botão + flutuante ---------------- */
export function fabMenu(items, onClose) {
  const root = $('#modal-root');
  const bd = h('div', { class: 'fab-backdrop' });
  const menu = h('div', { class: 'fab-menu', role: 'menu' });
  const close = () => {
    bd.classList.remove('in'); menu.classList.remove('in');
    setTimeout(() => { bd.remove(); menu.remove(); onClose?.(); }, 180);
  };
  items.forEach((it) => {
    if (!it) return;
    menu.appendChild(h('button', { onclick: () => { close(); setTimeout(() => it.on?.(), 120); } },
      h('span', { class: 'fab-item-ic' }, icon(it.icon || 'plus', 'ic ic-sm')),
      h('span', { text: it.label })));
  });
  root.appendChild(bd); root.appendChild(menu);
  requestAnimationFrame(() => { bd.classList.add('in'); menu.classList.add('in'); });
  bd.addEventListener('click', close);
  return { close };
}

/* ---------------- campos ---------------- */
export function field(label, control, hint, opt) {
  return h('div', { class: 'f' },
    label ? h('div', { class: 'f-label' }, label, opt ? h('span', { class: 'opt', text: ' (opcional)' }) : null) : null,
    control,
    hint ? h('div', { class: 'f-hint', text: hint }) : null
  );
}

export function input(attrs = {}) { return h('input', Object.assign({ class: 'inp' }, attrs)); }
export function textarea(attrs = {}) { return h('textarea', Object.assign({ class: 'inp' }, attrs)); }
export function select(options, attrs = {}) {
  const s = h('select', Object.assign({ class: 'inp' }, attrs));
  options.forEach((o) => s.appendChild(h('option', { value: o.v, selected: o.sel || false }, o.n)));
  return s;
}

export function stepper(value, { min = 0, max = 9999, step = 1, onChange } = {}) {
  let v = Number(value) || 0;
  const inp = h('input', { type: 'number', value: String(v), inputmode: 'decimal' });
  const set = (nv) => {
    v = Math.min(max, Math.max(min, Math.round(nv * 1000) / 1000));
    inp.value = String(v); onChange?.(v);
  };
  inp.addEventListener('input', () => { const n = Number(inp.value); if (Number.isFinite(n)) { v = n; onChange?.(n); } });
  inp.addEventListener('blur', () => set(Number(inp.value) || min));
  const el = h('div', { class: 'stepper' },
    h('button', { type: 'button', 'aria-label': 'Diminuir', onclick: () => set(v - step) }, '−'),
    inp,
    h('button', { type: 'button', 'aria-label': 'Aumentar', onclick: () => set(v + step) }, '+')
  );
  el.get = () => v;
  return el;
}

export function segmented(options, value, onChange, cls = '') {
  const wrap = h('div', { class: 'seg ' + cls });
  let cur = value;
  options.forEach((o) => {
    const b = h('button', { type: 'button', 'data-v': o.v, 'aria-pressed': String(o.v === cur) },
      o.icon ? icon(o.icon, 'ic ic-sm') : null, h('span', { text: o.n }));
    b.addEventListener('click', () => {
      cur = o.v;
      [...wrap.children].forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.v === String(cur))));
      onChange?.(cur);
    });
    wrap.appendChild(b);
  });
  wrap.get = () => cur;
  return wrap;
}

export function colorPicker(value, onChange) {
  const colors = ['#1a7ff0', '#12a37a', '#e0392b', '#f2d024', '#a02bb5', '#f08a1a'];
  const wrap = h('div', { class: 'swatches' });
  let cur = value || colors[0];
  colors.forEach((c) => {
    const b = h('button', { type: 'button', class: 'sw', style: { background: c }, 'data-v': c, 'aria-pressed': String(c === cur), 'aria-label': 'Cor ' + c },
      c === cur ? icon('check', 'ic ic-sm') : null);
    b.addEventListener('click', () => {
      cur = c; onChange?.(c);
      [...wrap.children].forEach((x) => { x.setAttribute('aria-pressed', String(x.dataset.v === cur)); x.innerHTML = ''; if (x.dataset.v === cur) x.appendChild(icon('check', 'ic ic-sm')); });
    });
    wrap.appendChild(b);
  });
  wrap.get = () => cur;
  return wrap;
}

export function switchBtn(on, onChange) {
  const b = h('button', { type: 'button', class: 'switch', 'aria-pressed': String(!!on), role: 'switch' });
  b.addEventListener('click', () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(v)); onChange?.(v); });
  return b;
}

/** Seletor de foto com compressão. onPick(blob|null) */
export function photoPicker(currentURL, onPick) {
  const box = h('label', { class: 'photo-pick' });
  const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  const render = (url) => {
    box.innerHTML = '';
    box.appendChild(inp);
    if (url) box.appendChild(h('img', { src: url, alt: '' }));
    else box.appendChild(h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' } },
      icon('cam', 'ic'), h('span', { text: 'Toque para adicionar foto', style: { fontSize: '13px' } })));
  };
  inp.addEventListener('change', async () => {
    const f = inp.files?.[0];
    if (!f) return;
    const { compressImage } = await import('./store.js');
    const b = await compressImage(f);
    render(URL.createObjectURL(b));
    onPick?.(b);
  });
  render(currentURL);
  return box;
}

/* ---------------- blocos ---------------- */
export function pill(status, label) {
  const cls = status === 'ok' ? 'ok' : status === 'warn' ? 'warn' : status === 'bad' ? 'bad' : status === 'info' ? 'info' : '';
  return h('span', { class: 'pill ' + cls }, h('i', { class: 'dot' }), h('span', { text: label }));
}

export function alertBox(a) {
  const ic = a.s === 'ok' ? 'checkCircle' : a.s === 'bad' ? 'alert' : a.s === 'warn' ? 'alert' : 'info';
  return h('div', { class: 'alert ' + (a.s || 'info') },
    icon(ic, 'ic'),
    h('div', { style: { flex: '1', minWidth: '0' } },
      h('div', { class: 'alert-t', text: a.t }),
      a.d ? h('div', { class: 'alert-d', text: a.d }) : null
    )
  );
}

export function cardHead(iconName, title, onClick, right) {
  return h('div', { class: 'card-head' + (onClick ? ' press' : ''), onclick: onClick },
    h('div', { class: 'badge-ic' }, icon(iconName, 'ic ic-sm')),
    h('h2', { text: title }),
    right || (onClick ? h('span', { class: 'chev' }, icon('chev', 'ic ic-sm')) : null)
  );
}

export function row(title, sub, opts = {}) {
  return h('div', { class: 'card-row' + (opts.onClick ? ' press' : ''), onclick: opts.onClick },
    opts.left || null,
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title', text: title }),
      sub ? h('div', { class: 'row-sub' }, sub instanceof Node ? sub : h('span', { text: sub })) : null
    ),
    opts.right || (opts.onClick ? h('span', { class: 'chev' }, icon('chev', 'ic ic-sm')) : null)
  );
}

export function empty(iconName, text, btn) {
  return h('div', { class: 'empty' }, icon(iconName, 'ic'), h('p', { text }), btn || null);
}

export function kv(k, v) { return h('div', { class: 'kv' }, h('span', { text: k }), h('span', v instanceof Node ? v : { text: String(v) })); }

/** Markdown mínimo e seguro (usado nas respostas do Consultor). */
export function mdToHTML(src) {
  const lines = String(src || '').split('\n');
  let out = '', inList = false;
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:)!?]|$)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  for (let ln of lines) {
    const li = ln.match(/^\s*[-*•]\s+(.*)$/);
    if (li) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${inline(li[1])}</li>`; continue; }
    if (inList) { out += '</ul>'; inList = false; }
    const hd = ln.match(/^\s*(#{1,4})\s+(.*)$/);
    if (hd) { out += `<h4>${inline(hd[2])}</h4>`; continue; }
    if (!ln.trim()) continue;
    out += `<p>${inline(ln)}</p>`;
  }
  if (inList) out += '</ul>';
  return out;
}

export function download(name, text, type = 'application/json') {
  const b = new Blob([text], { type });
  const u = URL.createObjectURL(b);
  const a = h('a', { href: u, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}

export const nowLocal = () => {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const todayLocal = () => nowLocal().slice(0, 10);
