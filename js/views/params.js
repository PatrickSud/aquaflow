/* views/params.js — aba Parâmetros, detalhe com gráfico, metas e registro de medição. */

import {
  h, icon, cardHead, row, pill, sheet, toast, field, input, textarea, segmented,
  empty, kv, nowLocal, confirmSheet
} from '../ui.js';
import { push, remove, save } from '../store.js';
import { PARAMS, P, CORE } from '../model.js';
import {
  latest, lastN, series, trend, trendText, statusOf, statusLabel, target, waterQuality,
  fmtNum, fmtDate, relDay, describeTest, nextTestDue, num, chartEvents
} from '../engine.js';
import { lineChart, legend, chartColors } from '../charts.js';
import { paramTile } from './dashboard.js';

/* ================= lista ================= */
export default function params(ctx) {
  const aq = ctx.aq;
  const el = h('div');
  const wq = waterQuality(aq);
  const nt = nextTestDue(aq);

  el.appendChild(h('div', { class: 'card' },
    h('div', { class: 'card-head' },
      h('div', { class: 'badge-ic' }, icon('drop', 'ic ic-sm')),
      h('div', { style: { flex: '1' } },
        h('h2', { text: 'Qualidade da água' }),
        h('div', { style: { fontSize: '13px', color: 'var(--tx-3)' }, text: aq.tests?.length ? `Última medição ${relDay(aq.tests[0].at)}` : 'sem medições' })
      ),
      pill(wq.status, wq.status ? statusLabel(wq.status) : 'Desconhecida')
    )
  ));

  if (nt.due) el.appendChild(h('div', { class: 'alert warn' }, icon('alert', 'ic'),
    h('div', {}, h('div', { class: 'alert-t', text: 'Medição recomendada agora' }),
      h('div', { class: 'alert-d', text: `Cadência atual: a cada ${nt.every} dias.` }))));

  el.appendChild(h('div', { class: 'sec-title', text: 'Principais' }));
  const g1 = h('div', { class: 'pgrid' });
  CORE.forEach((k) => g1.appendChild(paramTile(aq, k, () => ctx.nav('parametros/' + k))));
  el.appendChild(g1);

  el.appendChild(h('div', { class: 'sec-title', text: 'Complementares' }));
  const g2 = h('div', { class: 'pgrid' });
  PARAMS.filter((p) => !p.core).forEach((p) => g2.appendChild(paramTile(aq, p.k, () => ctx.nav('parametros/' + p.k))));
  el.appendChild(g2);

  el.appendChild(h('div', { style: { height: '14px' } }));
  el.appendChild(h('button', { class: 'btn', onclick: () => openTestSheet(aq, ctx.refresh) }, icon('plus', 'ic ic-sm'), 'Registrar medição'));
  el.appendChild(h('div', { style: { height: '9px' } }));
  el.appendChild(h('button', { class: 'btn sec', onclick: () => ctx.nav('parametros/metas') }, icon('sliders', 'ic ic-sm'), 'Parâmetros ideais (metas)'));

  /* histórico de testes */
  if (aq.tests?.length) {
    el.appendChild(h('div', { class: 'sec-title', text: `Histórico (${aq.tests.length} medições)` }));
    const card = h('div', { class: 'card' });
    aq.tests.slice(0, 12).forEach((t) => card.appendChild(row(fmtDate(t.at), describeTest(t) || '—', {
      onClick: () => showTest(aq, t, ctx.refresh)
    })));
    if (aq.tests.length > 12) card.appendChild(row('Ver tudo no histórico', '', { onClick: () => ctx.nav('historico') }));
    el.appendChild(card);
    el.appendChild(h('div', { class: 'note', style: { padding: '0 4px' }, text: 'Nenhuma medição é sobrescrita: todo registro fica guardado com data e hora.' }));
  }

  return { title: 'Parâmetros', actions: [{ icon: 'plus', label: 'Registrar', on: () => openTestSheet(aq, ctx.refresh) }], el };
}

/* ================= detalhe de um parâmetro ================= */
export function paramDetail(ctx, k) {
  const aq = ctx.aq;
  const def = P[k];
  if (!def) return { title: 'Parâmetro', el: h('div', {}, empty('info', 'Parâmetro não encontrado.')), back: true };

  const el = h('div');
  const l = latest(aq, k);
  const hist = lastN(aq, k, 60);
  const tg = target(aq, k);
  const s = l ? statusOf(aq, k, l.v) : null;
  const tr = trend(aq, k);

  el.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-pad', style: { textAlign: 'center' } },
    h('div', { style: { fontSize: '13px', color: 'var(--tx-3)' }, text: def.n }),
    h('div', { style: { fontSize: '40px', fontWeight: '700', letterSpacing: '-1px', lineHeight: '1.15', margin: '4px 0' } },
      h('span', { text: l ? fmtNum(l.v, def.dec) : '—' }),
      def.u ? h('span', { style: { fontSize: '16px', color: 'var(--tx-3)', marginLeft: '4px' }, text: def.u }) : null),
    l ? pill(s, statusLabel(s)) : pill(null, 'Sem dados'),
    l ? h('div', { class: 'note', style: { marginTop: '9px' }, text: `Medido em ${fmtDate(l.at)} (${relDay(l.at)})` }) : null
  )));

  const stats = h('div', { class: 'card' }, h('div', { class: 'card-pad' },
    kv('Meta definida', `${fmtNum(tg.min, def.dec)} – ${fmtNum(tg.max, def.dec)} ${def.u}`),
    kv('Valor anterior', hist[1] ? `${fmtNum(hist[1].v, def.dec)} ${def.u} (${relDay(hist[1].at)})` : '—'),
    kv('Tendência', tr ? trendText(k, tr) : 'precisa de 2 medições'),
    kv('Maior registrado', hist.length ? `${fmtNum(Math.max(...hist.map((x) => x.v)), def.dec)} ${def.u}` : '—'),
    kv('Menor registrado', hist.length ? `${fmtNum(Math.min(...hist.map((x) => x.v)), def.dec)} ${def.u}` : '—'),
    kv('Total de medições', String(hist.length))
  ));
  el.appendChild(stats);

  const ser = series(aq, k);
  if (ser.length >= 2) {
    const ev = chartEvents(aq);
    const events = [
      ...ev.tpas.map((e) => Object.assign({ color: chartColors[5] }, e)),
      ...ev.doses.map((e) => Object.assign({ color: chartColors[4] }, e))
    ];
    const card = h('div', { class: 'card' });
    card.appendChild(cardHead('chart', 'Evolução', null));
    const cv = h('canvas', { class: 'chart' });
    const legendItems = [{ label: def.n, color: chartColors[0] }];
    if (ev.tpas.length) legendItems.push({ label: 'TPA', color: chartColors[5] });
    if (ev.doses.length) legendItems.push({ label: 'Dosagem', color: chartColors[4] });
    card.appendChild(h('div', { class: 'card-body' }, h('div', { class: 'chart-wrap' }, cv),
      (ev.tpas.length || ev.doses.length) ? legend(legendItems) : null,
      h('div', { class: 'note', style: { marginTop: '6px' }, text: 'A faixa verde é a meta que você definiu.' })));
    el.appendChild(card);
    requestAnimationFrame(() => lineChart(cv, [{ data: ser, fill: true }], { band: [tg.min, tg.max], zeroFloor: k === 'ph' || k === 'temp' ? false : true, events }));
  } else {
    el.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-pad' },
      h('div', { class: 'note', text: 'O gráfico aparece a partir de 2 medições deste parâmetro.' }))));
  }

  if (hist.length) {
    el.appendChild(h('div', { class: 'sec-title', text: 'Todas as medições' }));
    const c = h('div', { class: 'card' });
    hist.forEach((x) => c.appendChild(row(`${fmtNum(x.v, def.dec)} ${def.u}`, fmtDate(x.at), { right: pill(statusOf(aq, k, x.v), statusLabel(statusOf(aq, k, x.v))) })));
    el.appendChild(c);
  }

  el.appendChild(h('div', { style: { height: '12px' } }));
  el.appendChild(h('button', { class: 'btn', onclick: () => openTestSheet(aq, ctx.refresh, k) }, icon('plus', 'ic ic-sm'), 'Registrar ' + def.n));

  return { title: def.n, back: true, el };
}

/* ================= metas ================= */
export function paramTargets(ctx) {
  const aq = ctx.aq;
  const el = h('div');
  el.appendChild(h('div', { class: 'alert info' }, icon('info', 'ic'),
    h('div', {}, h('div', { class: 'alert-t', text: 'Parâmetros ideais' }),
      h('div', { class: 'alert-d', text: 'Estes valores são a referência que o app usa para classificar 🟢 normal, 🟡 atenção e 🔴 crítico. Amônia e nitrito ficam travados em 0 como máximo de segurança para liberar peixes.' }))));

  const draft = JSON.parse(JSON.stringify(aq.targets || {}));

  PARAMS.forEach((p) => {
    const t = draft[p.k] || (draft[p.k] = { min: p.min, max: p.max });
    const card = h('div', { class: 'card' }, h('div', { class: 'card-pad' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '11px' } },
        h('div', { class: 'badge-ic' }, icon('flask', 'ic ic-sm')),
        h('div', {}, h('div', { style: { fontWeight: '700', fontSize: '15px' }, text: p.n }),
          h('div', { style: { fontSize: '12px', color: 'var(--tx-3)' }, text: `${p.u || 'sem unidade'} · faixa possível ${p.lim[0]}–${p.lim[1]}` }))),
      h('div', { class: 'grid2' },
        h('div', {}, h('div', { style: { fontSize: '12.5px', color: 'var(--tx-3)', marginBottom: '5px' }, text: 'Mín' }),
          input({ type: 'number', step: String(p.step), value: String(t.min ?? ''), oninput: (e) => { t.min = num(e.target.value); } })),
        h('div', {}, h('div', { style: { fontSize: '12.5px', color: 'var(--tx-3)', marginBottom: '5px' }, text: 'Máx' }),
          input({ type: 'number', step: String(p.step), value: String(t.max ?? ''), disabled: p.crit && p.k !== 'no3', oninput: (e) => { t.max = num(e.target.value); } }))
      ),
      p.crit && p.k !== 'no3' ? h('div', { class: 'f-hint', text: 'Travado: qualquer valor acima de 0 bloqueia a introdução de peixes.' }) : null
    ));
    el.appendChild(card);
  });

  el.appendChild(h('button', {
    class: 'btn', onclick: () => {
      aq.targets = draft; save({ immediate: true }); toast('Metas salvas', 'ok'); ctx.back();
    }
  }, 'Salvar'));

  return { title: 'Parâmetros ideais', back: true, el };
}

/* ================= registrar medição ================= */
export function openTestSheet(aq, refresh, focusKey) {
  const vals = {};
  const order = focusKey ? [focusKey, ...PARAMS.map((p) => p.k).filter((k) => k !== focusKey)] : PARAMS.map((p) => p.k);
  let at = nowLocal();
  let notes = '';
  let method = 'Labcon (gotas)';
  let showAll = !!focusKey;

  return sheet({
    title: 'Registrar medição',
    big: true,
    body: (b, close) => {
      const render = () => {
        b.innerHTML = '';
        b.appendChild(field('Data e hora', input({ type: 'datetime-local', value: at, oninput: (e) => { at = e.target.value; } })));

        if (aq.tests?.length) {
          b.appendChild(h('button', {
            class: 'btn ghost', style: { marginBottom: '14px' },
            onclick: () => {
              const last = aq.tests[0];
              PARAMS.forEach((p) => { if (num(last[p.k]) !== null) vals[p.k] = String(last[p.k]); });
              if (last.method) method = last.method;
              showAll = true;
              render();
              toast('Valores da última medição preenchidos — revise antes de salvar');
            }
          }, icon('refresh', 'ic ic-sm'), `Repetir última medição (${relDay(aq.tests[0].at)})`));
        }

        const keys = showAll ? order : CORE;
        const wrap = h('div');
        keys.forEach((k) => {
          const p = P[k];
          const tg = target(aq, k);
          const last = latest(aq, k);
          wrap.appendChild(field(
            h('span', {}, p.n, h('span', { style: { color: 'var(--tx-3)', fontWeight: '400' }, text: p.u ? `  (${p.u})` : '' })),
            input({
              type: 'number', step: String(p.step), inputmode: 'decimal',
              placeholder: last ? `anterior: ${fmtNum(last.v, p.dec)}` : `alvo ${fmtNum(tg.min, p.dec)}–${fmtNum(tg.max, p.dec)}`,
              value: vals[k] ?? '',
              oninput: (e) => { vals[k] = e.target.value; }
            }),
            null, true
          ));
        });
        b.appendChild(wrap);

        if (!showAll) b.appendChild(h('button', {
          class: 'btn ghost', style: { marginBottom: '14px' },
          onclick: () => { showAll = true; render(); }
        }, icon('plus', 'ic ic-sm'), 'Mostrar todos os parâmetros'));

        b.appendChild(field('Teste utilizado', input({ value: method, oninput: (e) => { method = e.target.value; } }), 'Ex.: Labcon gotas, fita, sonda digital.'));
        b.appendChild(field('Observação', textarea({ placeholder: 'Ex.: água levemente turva após a manutenção', oninput: (e) => { notes = e.target.value; } }), null, true));
        b.appendChild(h('div', { class: 'note', style: { marginBottom: '10px' }, text: 'Deixe em branco o que você não mediu. O app nunca preenche valor que você não informou.' }));
      };
      render();
    },
    actions: (close) => h('div', { class: 'btn-row', style: { paddingTop: '6px' } },
      h('button', { class: 'btn sec', text: 'Cancelar', onclick: () => close() }),
      h('button', {
        class: 'btn', text: 'Salvar', onclick: () => {
          const rec = { at: new Date(at).toISOString(), method, notes };
          let n = 0;
          PARAMS.forEach((p) => { const v = num(vals[p.k]); if (v !== null) { rec[p.k] = v; n++; } });
          if (!n) { toast('Informe pelo menos um valor', 'bad'); return; }
          push('tests', rec);
          close();
          toast(`Medição registrada (${n} parâmetro${n > 1 ? 's' : ''})`, 'ok');
          refresh?.();
        }
      })
    )
  });
}

function showTest(aq, t, refresh) {
  return sheet({
    title: fmtDate(t.at),
    body: (b) => {
      const c = h('div');
      PARAMS.forEach((p) => {
        const v = num(t[p.k]);
        if (v === null) return;
        c.appendChild(kv(p.n, h('span', {}, h('span', { text: `${fmtNum(v, p.dec)} ${p.u} ` }), pill(statusOf(aq, p.k, v), statusLabel(statusOf(aq, p.k, v))))));
      });
      if (t.method) c.appendChild(kv('Teste', t.method));
      if (t.notes) c.appendChild(kv('Observação', t.notes));
      b.appendChild(c);
    },
    actions: (close) => h('button', {
      class: 'btn danger', style: { marginTop: '14px' }, onclick: () => {
        close();
        setTimeout(() => confirmSheet({
          title: 'Excluir esta medição?',
          message: 'O histórico é a base das análises. Só exclua se o registro estiver errado.',
          confirmText: 'Excluir', danger: true,
          onConfirm: async () => { await remove('tests', t.id); toast('Medição excluída'); refresh?.(); }
        }), 150);
      }
    }, icon('trash', 'ic ic-sm'), 'Excluir medição')
  });
}
