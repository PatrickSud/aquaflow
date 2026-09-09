/* charts.js — gráfico de linha em canvas, sem dependências (funciona offline). */

const COLORS = ['#1a7ff0', '#ff453a', '#ffd60a', '#30d158', '#bf5af2', '#5ac8fa'];

export function lineChart(canvas, datasets, opts = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cssW = canvas.clientWidth || canvas.parentElement?.clientWidth || 320;
  const cssH = opts.height || 170;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = cssH + 'px';
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, cssW, cssH);

  const sets = datasets.filter((d) => d.data && d.data.length);
  const padL = 38, padR = 10, padT = 10, padB = 22;
  const W = cssW - padL - padR, H = cssH - padT - padB;

  if (!sets.length) {
    c.fillStyle = '#6f6f78'; c.font = '13px -apple-system,system-ui,sans-serif'; c.textAlign = 'center';
    c.fillText('Sem dados suficientes para o gráfico', cssW / 2, cssH / 2);
    return;
  }

  let tMin = Infinity, tMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  sets.forEach((d) => d.data.forEach((p) => {
    tMin = Math.min(tMin, p.t); tMax = Math.max(tMax, p.t);
    vMin = Math.min(vMin, p.v); vMax = Math.max(vMax, p.v);
  }));
  if (opts.min !== undefined) vMin = Math.min(vMin, opts.min);
  if (opts.max !== undefined) vMax = Math.max(vMax, opts.max);
  if (tMax === tMin) { tMax = tMin + 1; }
  if (vMax === vMin) { vMax = vMin + (Math.abs(vMin) * 0.2 || 1); vMin = Math.max(0, vMin - (Math.abs(vMin) * 0.2 || 1)); }
  const pad = (vMax - vMin) * 0.12;
  vMax += pad; vMin = Math.max(opts.zeroFloor === false ? vMin - pad : 0, vMin - pad);

  const X = (t) => padL + ((t - tMin) / (tMax - tMin)) * W;
  const Y = (v) => padT + H - ((v - vMin) / (vMax - vMin)) * H;

  // faixa alvo
  if (opts.band && Number.isFinite(opts.band[0]) && Number.isFinite(opts.band[1])) {
    const y1 = Y(Math.min(opts.band[1], vMax)), y2 = Y(Math.max(opts.band[0], vMin));
    c.fillStyle = 'rgba(48,209,88,.09)';
    c.fillRect(padL, Math.min(y1, y2), W, Math.abs(y2 - y1) || 1);
  }

  // grade + eixo Y
  c.strokeStyle = '#232326'; c.lineWidth = 1;
  c.fillStyle = '#6f6f78'; c.font = '10.5px -apple-system,system-ui,sans-serif'; c.textAlign = 'right'; c.textBaseline = 'middle';
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const v = vMin + ((vMax - vMin) * i) / steps;
    const y = Y(v);
    c.beginPath(); c.moveTo(padL, y); c.lineTo(padL + W, y); c.stroke();
    c.fillText(fmtAxis(v), padL - 6, y);
  }

  // eixo X (datas)
  c.textAlign = 'center'; c.textBaseline = 'top';
  const nx = Math.min(4, Math.max(2, Math.floor(W / 74)));
  for (let i = 0; i <= nx; i++) {
    const t = tMin + ((tMax - tMin) * i) / nx;
    const d = new Date(t);
    c.fillText(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, X(t), padT + H + 6);
  }

  // marcadores de eventos (ex.: TPA, dosagem) — linha vertical fina na data do evento
  if (Array.isArray(opts.events) && opts.events.length) {
    c.save();
    c.setLineDash([3, 3]);
    c.lineWidth = 1.2;
    opts.events.forEach((e) => {
      if (e.t == null || e.t < tMin || e.t > tMax) return;
      c.strokeStyle = e.color || '#8e8e93';
      const x = X(e.t);
      c.beginPath(); c.moveTo(x, padT); c.lineTo(x, padT + H); c.stroke();
    });
    c.restore();
    opts.events.forEach((e) => {
      if (e.t == null || e.t < tMin || e.t > tMax) return;
      c.fillStyle = e.color || '#8e8e93';
      c.beginPath(); c.arc(X(e.t), padT, 3, 0, 7); c.fill();
    });
  }

  // séries
  sets.forEach((d, i) => {
    const col = d.color || COLORS[i % COLORS.length];
    c.strokeStyle = col; c.lineWidth = 2; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath();
    d.data.forEach((p, j) => { const x = X(p.t), y = Y(p.v); j ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.stroke();
    if (d.fill) {
      const g = c.createLinearGradient(0, padT, 0, padT + H);
      g.addColorStop(0, col + '38'); g.addColorStop(1, col + '00');
      c.lineTo(X(d.data[d.data.length - 1].t), padT + H);
      c.lineTo(X(d.data[0].t), padT + H);
      c.closePath(); c.fillStyle = g; c.fill();
    }
    c.fillStyle = col;
    d.data.forEach((p) => { c.beginPath(); c.arc(X(p.t), Y(p.v), d.data.length > 30 ? 1.6 : 2.8, 0, 7); c.fill(); });
  });
}

function fmtAxis(v) {
  const a = Math.abs(v);
  if (a >= 100) return String(Math.round(v));
  if (a >= 10) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1).replace('.', ',');
  return v.toFixed(2).replace('.', ',');
}

export function legend(items) {
  const el = document.createElement('div');
  el.className = 'legend';
  items.forEach((it, i) => {
    const s = document.createElement('span');
    s.innerHTML = `<i style="background:${it.color || COLORS[i % COLORS.length]}"></i>`;
    s.appendChild(document.createTextNode(it.label));
    el.appendChild(s);
  });
  return el;
}

export const chartColors = COLORS;
