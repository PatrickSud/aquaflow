/* views/cycling.js — módulo de ciclagem: fase, evidências, gráfico e linha do tempo. */

import { h, icon, cardHead, row, pill, kv, empty, confirmSheet, toast, field, input, sheet } from '../ui.js';
import { save } from '../store.js';
import { P } from '../model.js';
import {
  cyclingStatus, canAddFish, latest, trend, trendText, series, timeline,
  fmtNum, fmtDate, relDay, statusOf, statusLabel, nextTestDue, stabilityDose, ageDays
} from '../engine.js';
import { lineChart, legend, chartColors } from '../charts.js';
import { openTestSheet } from './params.js';
import { openDoseSheet } from './logs.js';

const PHASES = [
  { n: 1, t: 'Amônia acumulando', d: 'A fonte de amônia alimenta as primeiras bactérias. A amônia sobe e o nitrito ainda está em 0.' },
  { n: 2, t: 'Nitrito presente', d: 'As bactérias que consomem amônia produzem nitrito. Momento mais tóxico — nenhum peixe entra.' },
  { n: 3, t: 'Nitrito caindo', d: 'O segundo grupo de bactérias se estabelece e converte nitrito em nitrato.' },
  { n: 4, t: 'Ciclo concluído', d: 'Amônia e nitrito estáveis em 0, confirmados em medições repetidas ao longo de dias.' }
];

export default function cycling(ctx) {
  const aq = ctx.aq;
  const c = cyclingStatus(aq);
  const gate = canAddFish(aq);
  const el = h('div');

  /* cabeçalho */
  el.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-pad', style: { textAlign: 'center' } },
    h('div', { style: { fontSize: '13px', color: 'var(--tx-3)' }, text: `Dia ${c.day} da ciclagem` }),
    h('div', { style: { fontSize: '20px', fontWeight: '700', margin: '4px 0 8px' }, text: c.label }),
    pill(c.s, c.s ? statusLabel(c.s) : 'Sem dados'),
    c.desc ? h('div', { class: 'note', style: { marginTop: '10px' }, text: c.desc }) : null
  )));

  /* fases */
  const fcard = h('div', { class: 'card' });
  fcard.appendChild(cardHead('refresh', 'Fases', null));
  PHASES.forEach((p) => {
    const cur = p.n === c.phase;
    const past = p.n < c.phase;
    fcard.appendChild(h('div', { class: 'card-row' },
      h('div', { style: { width: '28px', height: '28px', borderRadius: '50%', flex: '0 0 auto', display: 'grid', placeItems: 'center', fontSize: '13px', fontWeight: '700', background: cur ? 'var(--accent)' : past ? 'rgba(48,209,88,.2)' : 'var(--card-2)', color: cur ? '#fff' : past ? 'var(--ok)' : 'var(--tx-3)' } },
        past ? icon('check', 'ic ic-sm') : String(p.n)),
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title', text: p.t, style: cur ? { color: 'var(--accent)' } : {} }),
        h('div', { style: { fontSize: '12.5px', color: 'var(--tx-3)', marginTop: '2px' }, text: p.d }))
    ));
  });
  el.appendChild(fcard);

  /* evidência */
  const ecard = h('div', { class: 'card' });
  ecard.appendChild(cardHead('shield', 'Evidência de conclusão', null));
  const eb = h('div', { class: 'card-body' });
  eb.appendChild(kv('Medições consecutivas em 0/0', `${c.zeros.count} de 3`));
  eb.appendChild(kv('Intervalo coberto', `${c.zeros.spanDays} de 5 dias`));
  eb.appendChild(kv('Pico registrado no app', c.sawPeak ? 'sim' : 'não'));
  eb.appendChild(h('div', { class: 'note', style: { marginTop: '9px' }, text: 'O app só considera o ciclo concluído com amônia 0 e nitrito 0 em pelo menos 3 medições ao longo de 5 dias ou mais. Uma leitura isolada nunca confirma estabilidade.' }));
  const bar = (v, max) => h('div', { style: { height: '6px', borderRadius: '3px', background: 'var(--line)', overflow: 'hidden', marginTop: '6px' } },
    h('div', { style: { height: '100%', width: Math.min(100, (v / max) * 100) + '%', background: v >= max ? 'var(--ok)' : 'var(--warn)' } }));
  eb.appendChild(bar(c.zeros.count, 3));
  eb.appendChild(bar(c.zeros.spanDays, 5));
  ecard.appendChild(eb);
  el.appendChild(ecard);

  /* portão */
  el.appendChild(h('div', { class: 'alert ' + gate.level }, icon(gate.level === 'ok' ? 'checkCircle' : 'alert', 'ic'),
    h('div', { style: { flex: '1' } },
      h('div', { class: 'alert-t', text: (gate.level === 'ok' ? '🟢 ' : gate.level === 'warn' ? '🟡 ' : '🔴 ') + gate.title }),
      h('div', { class: 'alert-d' },
        ...gate.reasons.map((r) => h('div', { style: { marginTop: '3px' }, text: '• ' + r })),
        gate.next.length ? h('div', { style: { marginTop: '8px', fontWeight: '600' }, text: 'Próximos passos:' }) : null,
        ...gate.next.map((n) => h('div', { style: { marginTop: '2px' }, text: '→ ' + n })),
        h('div', { style: { marginTop: '9px', fontStyle: 'italic' }, text: gate.question })))));

  /* gráfico do ciclo */
  const sN = series(aq, 'nh3'), sI = series(aq, 'no2'), sA = series(aq, 'no3');
  const gcard = h('div', { class: 'card' });
  gcard.appendChild(cardHead('chart', 'Curva do ciclo', null));
  const cv = h('canvas', { class: 'chart' });
  gcard.appendChild(h('div', { class: 'card-body' }, h('div', { class: 'chart-wrap' }, cv),
    legend([{ label: 'Amônia', color: chartColors[0] }, { label: 'Nitrito', color: chartColors[1] }, { label: 'Nitrato', color: chartColors[3] }])));
  el.appendChild(gcard);
  requestAnimationFrame(() => lineChart(cv, [
    { data: sN, color: chartColors[0] }, { data: sI, color: chartColors[1] }, { data: sA, color: chartColors[3] }
  ], { height: 190 }));

  /* parâmetros do ciclo */
  const pcard = h('div', { class: 'card' });
  pcard.appendChild(cardHead('flask', 'Leituras atuais', () => openTestSheet(aq, ctx.refresh)));
  ['nh3', 'no2', 'no3', 'ph', 'temp'].forEach((k) => {
    const l = latest(aq, k), def = P[k], tr = trend(aq, k);
    pcard.appendChild(row(def.n, l ? `${fmtDate(l.at)}${tr ? ' · ' + trendText(k, tr) : ''}` : 'sem registro', {
      right: l ? h('div', { style: { textAlign: 'right' } },
        h('div', { style: { fontWeight: '700' }, text: `${fmtNum(l.v, def.dec)} ${def.u}` }),
        pill(statusOf(aq, k, l.v), statusLabel(statusOf(aq, k, l.v)))) : pill(null, '—')
    }));
  });
  el.appendChild(pcard);

  /* protocolo */
  const prot = aq.protocols || {};
  const scard = h('div', { class: 'card' });
  scard.appendChild(cardHead('box', 'Protocolo de bactérias', () => openProtocol(aq, ctx.refresh)));
  const sb = h('div', { class: 'card-body' });
  sb.appendChild(kv('Stability por dia', prot.stabilityMl ? `${prot.stabilityMl} mL` : '—'));
  sb.appendChild(kv('Duração', prot.stabilityDays ? `${prot.stabilityDays} dias` : '—'));
  sb.appendChild(kv('Referência do rótulo', `${fmtNum(stabilityDose(aq).ml, 1)} mL para ${fmtNum(aq.volUtil, 0)} L`));
  const applied = (aq.dosings || []).filter((d) => d.prod === 'stability').length;
  sb.appendChild(kv('Aplicações registradas', String(applied)));
  sb.appendChild(h('div', { class: 'note', style: { marginTop: '8px' }, text: 'Aplique sobre as mídias biológicas do filtro. O app nunca duplica uma dose que você registrou manualmente.' }));
  sb.appendChild(h('button', { class: 'btn ghost', style: { marginTop: '8px' }, onclick: () => openDoseSheet(aq, ctx.refresh) }, icon('plus', 'ic ic-sm'), 'Registrar aplicação'));
  scard.appendChild(sb);
  el.appendChild(scard);

  /* ações */
  el.appendChild(h('div', { style: { height: '6px' } }));
  el.appendChild(h('button', { class: 'btn', onclick: () => openTestSheet(aq, ctx.refresh) }, icon('plus', 'ic ic-sm'), 'Registrar medição'));

  if (!aq.cycling?.done) {
    el.appendChild(h('div', { style: { height: '9px' } }));
    el.appendChild(h('button', {
      class: 'btn sec', disabled: !c.done, onclick: () => confirmSheet({
        title: 'Marcar ciclo como concluído?',
        message: `Evidência: ${c.zeros.count} medições em 0/0 ao longo de ${c.zeros.spanDays} dias. Após isso, a cadência de testes passa a semanal (ou a cada 3–4 dias com fauna nova).`,
        confirmText: 'Concluir ciclo',
        onConfirm: () => { aq.cycling.done = true; aq.cycling.doneAt = new Date().toISOString(); aq.cycling.phase = 4; save({ immediate: true }); toast('Ciclo concluído', 'ok'); ctx.refresh(); }
      })
    }, c.done ? 'Marcar ciclo como concluído' : 'Ainda sem evidência para concluir'));
  } else {
    el.appendChild(h('div', { class: 'alert ok', style: { marginTop: '12px' } }, icon('checkCircle', 'ic'),
      h('div', {}, h('div', { class: 'alert-t', text: 'Ciclo concluído' }), h('div', { class: 'alert-d', text: `Registrado em ${fmtDate(aq.cycling.doneAt)}.` }))));
  }

  /* linha do tempo */
  const tl = timeline(aq);
  if (tl.length) {
    el.appendChild(h('div', { class: 'sec-title', text: 'Linha do tempo' }));
    const c2 = h('div', { class: 'card' }, h('div', { class: 'card-pad' }, tlEl(tl.slice(0, 14))));
    el.appendChild(c2);
    if (tl.length > 14) el.appendChild(h('button', { class: 'btn ghost', onclick: () => ctx.nav('historico') }, 'Ver linha do tempo completa'));
  }

  return { title: 'Ciclagem', back: true, el };
}

export function tlEl(items) {
  const w = h('div', { class: 'tl' });
  items.forEach((e) => w.appendChild(h('div', { class: 'tl-item ' + (e.s || '') },
    h('div', { class: 'tl-d', text: `Dia ${e.day} · ${fmtDate(e.at)}` }),
    h('div', { class: 'tl-t', text: e.t }),
    e.d ? h('div', { class: 'tl-s', text: e.d }) : null
  )));
  return w;
}

function openProtocol(aq, refresh) {
  const d = Object.assign({ stabilityMl: 6, stabilityDays: 7, filterSwapDay: 35 }, aq.protocols || {});
  return sheet({
    title: 'Protocolo',
    body: (b) => {
      b.appendChild(field('Stability por dia (mL)', input({ type: 'number', step: '0.5', value: String(d.stabilityMl), oninput: (e) => { d.stabilityMl = Number(e.target.value); } }), `Referência do rótulo para ${aq.volUtil} L: ${fmtNum(stabilityDose(aq).ml, 1)} mL.`));
      b.appendChild(field('Duração do protocolo (dias)', input({ type: 'number', value: String(d.stabilityDays), oninput: (e) => { d.stabilityDays = Number(e.target.value); } })));
      b.appendChild(field('Rever filtragem mecânica no dia', input({ type: 'number', value: String(d.filterSwapDay), oninput: (e) => { d.filterSwapDay = Number(e.target.value); } }), 'Quando o app deve lembrar de retirar o refil mecânico saturado, preservando as mídias biológicas.'));
      b.appendChild(h('div', { class: 'alert bad', style: { marginTop: '6px' } }, icon('shield', 'ic'),
        h('div', {}, h('div', { class: 'alert-t', text: 'Regra fixa' }), h('div', { class: 'alert-d', text: 'O app nunca recomenda substituir por completo as mídias biológicas em manutenção normal.' }))));
    },
    actions: (close) => h('button', { class: 'btn', text: 'Salvar', onclick: () => { aq.protocols = d; save({ immediate: true }); close(); toast('Protocolo salvo', 'ok'); refresh?.(); } })
  });
}
