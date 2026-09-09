/* views/history.js — gráficos comparativos, linha do tempo completa e lista de medições. */

import { h, icon, cardHead, row, pill, segmented, empty, kv, download, toast } from '../ui.js';
import { PARAMS, P, CORE } from '../model.js';
import {
  series, latest, trend, trendText, statusOf, statusLabel, timeline, describeTest,
  fmtNum, fmtDate, relDay, target, num, chartEvents
} from '../engine.js';
import { lineChart, legend, chartColors } from '../charts.js';
import { tlEl } from './cycling.js';

export default function history(ctx) {
  const aq = ctx.aq;
  const el = h('div');
  let range = 30;
  let mode = 'ciclo';

  if (!(aq.tests || []).length) {
    el.appendChild(h('div', { class: 'card' }, empty('chart', 'Nenhuma medição registrada ainda. Os gráficos aparecem a partir da segunda medição de um mesmo parâmetro.')));
    return { title: 'Histórico', back: true, el };
  }

  /* controles */
  const ctrl = h('div', { style: { marginBottom: '12px' } });
  const chartCard = h('div', { class: 'card' });
  const redraw = () => {
    chartCard.innerHTML = '';
    const sets = mode === 'ciclo'
      ? [{ k: 'nh3', c: 0 }, { k: 'no2', c: 1 }, { k: 'no3', c: 3 }]
      : mode === 'ph' ? [{ k: 'ph', c: 4 }] : [{ k: 'temp', c: 2 }];
    const data = sets.map((s) => ({ data: series(aq, s.k, range), color: chartColors[s.c], fill: sets.length === 1 }));
    chartCard.appendChild(cardHead('chart', mode === 'ciclo' ? 'Amônia · Nitrito · Nitrato' : mode === 'ph' ? 'pH' : 'Temperatura', null));
    const cv = h('canvas', { class: 'chart' });
    const tg = sets.length === 1 ? target(aq, sets[0].k) : null;
    const ev = chartEvents(aq, range);
    const events = [
      ...ev.tpas.map((e) => Object.assign({ color: chartColors[5] }, e)),
      ...ev.doses.map((e) => Object.assign({ color: chartColors[4] }, e))
    ];
    const legendItems = sets.map((s) => ({ label: P[s.k].n, color: chartColors[s.c] }));
    if (ev.tpas.length) legendItems.push({ label: 'TPA', color: chartColors[5] });
    if (ev.doses.length) legendItems.push({ label: 'Dosagem', color: chartColors[4] });
    chartCard.appendChild(h('div', { class: 'card-body' },
      h('div', { class: 'chart-wrap' }, cv),
      legend(legendItems)));
    requestAnimationFrame(() => lineChart(cv, data, {
      height: 200,
      band: tg ? [tg.min, tg.max] : null,
      zeroFloor: !(mode === 'ph' || mode === 'temp'),
      events
    }));
  };

  ctrl.appendChild(segmented([{ v: 'ciclo', n: 'Ciclo' }, { v: 'ph', n: 'pH' }, { v: 'temp', n: 'Temp.' }], mode, (v) => { mode = v; redraw(); }));
  ctrl.appendChild(h('div', { style: { height: '9px' } }));
  ctrl.appendChild(segmented([{ v: 7, n: '7 dias' }, { v: 30, n: '30 dias' }, { v: 90, n: '90 dias' }, { v: 0, n: 'Tudo' }], range, (v) => { range = v; redraw(); }));
  el.appendChild(ctrl);
  el.appendChild(chartCard);
  redraw();

  /* resumo por parâmetro */
  el.appendChild(h('div', { class: 'sec-title', text: 'Resumo por parâmetro' }));
  const sum = h('div', { class: 'card' });
  PARAMS.forEach((p) => {
    const s = series(aq, p.k);
    if (!s.length) return;
    const l = latest(aq, p.k);
    const tr = trend(aq, p.k);
    const vs = s.map((x) => x.v);
    sum.appendChild(row(p.n,
      `min ${fmtNum(Math.min(...vs), p.dec)} · máx ${fmtNum(Math.max(...vs), p.dec)} · ${s.length} medições · ${relDay(l.at)}`,
      {
        right: h('div', { style: { textAlign: 'right' } },
          h('div', { style: { fontWeight: '700' }, text: `${fmtNum(l.v, p.dec)} ${p.u}` }),
          h('div', { style: { fontSize: '11.5px', color: 'var(--tx-3)' }, text: tr ? trendText(p.k, tr) : '—' })),
        onClick: () => ctx.nav('parametros/' + p.k)
      }));
  });
  el.appendChild(sum);

  /* linha do tempo */
  const tl = timeline(aq);
  el.appendChild(h('div', { class: 'sec-title', text: 'Linha do tempo' }));
  el.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-pad' }, tlEl(tl))));

  /* todas as medições */
  el.appendChild(h('div', { class: 'sec-title', text: `Todas as medições (${aq.tests.length})` }));
  const tc = h('div', { class: 'card' });
  aq.tests.forEach((t) => tc.appendChild(row(fmtDate(t.at), describeTest(t) || '—', { right: t.method ? h('span', { style: { fontSize: '11.5px', color: 'var(--tx-3)' }, text: t.method }) : null })));
  el.appendChild(tc);

  el.appendChild(h('button', {
    class: 'btn sec', onclick: () => {
      const cols = ['data', ...PARAMS.map((p) => p.k), 'teste', 'observacao'];
      const rows = [cols.join(';')];
      [...aq.tests].reverse().forEach((t) => {
        rows.push([fmtDate(t.at), ...PARAMS.map((p) => (num(t[p.k]) ?? '')), t.method || '', (t.notes || '').replace(/[;\n]/g, ' ')].join(';'));
      });
      download(`aquaflow-medicoes-${new Date().toISOString().slice(0, 10)}.csv`, '\uFEFF' + rows.join('\n'), 'text/csv');
      toast('Planilha exportada', 'ok');
    }
  }, icon('down', 'ic ic-sm'), 'Exportar medições (CSV)'));

  return { title: 'Histórico', back: true, el };
}
