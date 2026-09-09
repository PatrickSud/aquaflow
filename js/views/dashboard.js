/* views/dashboard.js — tela "Aquário": o painel que prioriza o que precisa de atenção. */

import { h, icon, cardHead, row, pill, alertBox, empty, toast, sheet } from '../ui.js';
import { photoURL, state, save } from '../store.js';
import { PARAMS, P, CORE, SPEC } from '../model.js';
import {
  waterQuality, statusOf, statusLabel, latest, trend, trendText, cyclingStatus,
  canAddFish, bioload, bioStatus, alerts, nextTestDue, fmtNum, fmtDate, relDay, ageDays, target,
  tpaDue, tpaVerdict, doseDue, sameDay, num, tpaCalc
} from '../engine.js';
import { installBanner, canOfferInstall } from '../pwa.js';
import { openTestSheet } from './params.js';
import { openTPASheet, openDoseSheet, openFeedSheet, openNoteSheet } from './logs.js';

export default function dashboard(ctx) {
  const aq = ctx.aq;
  const el = h('div');

  /* ---- convite de instalação ---- */
  if (canOfferInstall() && !state.settings.installDismissed) {
    const b = installBanner(() => { state.settings.installDismissed = true; save(); b.remove(); });
    if (b) el.appendChild(b);
  }

  /* ---- herói ---- */
  const hero = h('div', { class: 'hero' });
  const img = h('div', { class: 'hero-img' });
  if (aq.photo) {
    photoURL(aq.photo).then((u) => { if (u) { img.innerHTML = ''; img.appendChild(h('img', { src: u, alt: '' })); } });
  } else {
    img.appendChild(h('div', { class: 'ph' }, icon('tank', 'ic'), h('span', { text: 'Toque para adicionar foto' })));
    img.classList.add('press');
    img.onclick = () => ctx.nav('aquarios/editar/' + aq.id);
  }
  hero.appendChild(img);

  const wq = waterQuality(aq);
  const bl = bioload(aq);
  const live = (aq.livestock || []).filter((x) => x.status !== 'obito' && x.status !== 'removido');
  const nFish = live.reduce((s, x) => s + (Number(x.qty) || 0), 0);

  hero.appendChild(h('div', { class: 'hero-info' },
    h('div', { class: 'hero-name' }, h('span', { text: aq.name }), h('span', { style: { width: '9px', height: '9px', borderRadius: '50%', background: aq.color } })),
    h('div', { class: 'hero-meta', text: `${fmtNum(aq.volUtil, 0)} L úteis · ${aq.type === 'doce' ? 'Água doce' : 'Água salgada'}` }),
    h('div', { class: 'hero-stats' },
      h('div', { class: 'hero-stat' }, icon('fish', 'ic ic-sm'), h('div', {}, h('div', { class: 'hs-l', text: 'Fauna' }), h('div', { class: 'hs-v', text: nFish ? `${nFish} animais` : '0 animais' }))),
      h('div', { class: 'hero-stat' }, icon('clock', 'ic ic-sm'), h('div', {}, h('div', { class: 'hs-l', text: 'Idade' }), h('div', { class: 'hs-v', text: `${ageDays(aq)} dias` })))
    ),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '13px', paddingTop: '12px', borderTop: '1px solid var(--line-soft)' } },
      icon('drop', 'ic ic-sm'),
      h('span', { style: { color: 'var(--tx-3)', fontSize: '13.5px', flex: '1' }, text: 'Qualidade da água' }),
      pill(wq.status, wq.status ? statusLabel(wq.status) : 'Desconhecida')
    )
  ));
  el.appendChild(hero);

  /* ---- alertas relevantes ---- */
  const al = alerts(aq).filter((a) => a.s === 'bad' || a.s === 'warn').slice(0, 3);
  const info = alerts(aq).filter((a) => a.s === 'info' || a.s === 'ok').slice(0, 2);
  if (al.length || info.length) {
    el.appendChild(h('div', { class: 'sec-title', text: 'Alertas' }));
    al.forEach((a) => el.appendChild(alertBox(a)));
    info.forEach((a) => el.appendChild(alertBox(a)));
  }

  /* ---- consultor ---- */
  el.appendChild(h('div', { class: 'card press', onclick: () => ctx.nav('consultor') },
    h('div', { class: 'card-head' },
      h('div', { class: 'badge-ic' }, icon('bulb', 'ic ic-sm')),
      h('div', { style: { flex: '1' } },
        h('h2', { text: 'Consultor Aquarista' }),
        h('div', { style: { fontSize: '13px', color: 'var(--tx-3)', marginTop: '1px' }, text: 'Pergunte sobre a água, povoamento, TPA, dosagem…' })
      ),
      h('span', { class: 'chev' }, icon('chev', 'ic ic-sm'))
    )
  ));

  /* ---- parâmetros ---- */
  const pcard = h('div', { class: 'card' });
  pcard.appendChild(cardHead('flask', 'Parâmetros', null,
    h('button', { class: 'tb-btn', 'aria-label': 'Metas', onclick: () => ctx.nav('parametros/metas') }, icon('sliders', 'ic ic-sm'))));
  const grid = h('div', { class: 'pgrid' });
  CORE.forEach((k) => grid.appendChild(paramTile(aq, k, () => ctx.nav('parametros/' + k))));
  pcard.appendChild(h('div', { class: 'card-body' }, grid,
    h('button', { class: 'btn ghost', style: { marginTop: '12px' }, onclick: () => openTestSheet(aq, ctx.refresh) }, icon('plus', 'ic ic-sm'), 'Registrar medição')
  ));
  el.appendChild(pcard);

  /* ---- ciclagem ---- */
  const cyc = cyclingStatus(aq);
  const gate = canAddFish(aq);
  const ccard = h('div', { class: 'card' });
  ccard.appendChild(cardHead('refresh', 'Ciclagem', () => ctx.nav('ciclagem'), h('span', { class: 'chev' }, icon('chev', 'ic ic-sm'))));
  ccard.appendChild(h('div', { class: 'card-body' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' } },
      h('div', { style: { flex: '1' } },
        h('div', { style: { fontSize: '15px', fontWeight: '700' }, text: cyc.label }),
        h('div', { style: { fontSize: '13px', color: 'var(--tx-3)' }, text: `Dia ${cyc.day}${aq.cycling?.done ? ' · concluída' : ''}` })
      ),
      pill(cyc.s, cyc.s ? statusLabel(cyc.s) : 'Sem dados')
    ),
    cyc.desc ? h('div', { class: 'note', style: { marginBottom: '10px' }, text: cyc.desc }) : null,
    h('div', { class: 'alert ' + gate.level, style: { marginBottom: '0' } },
      icon(gate.level === 'ok' ? 'checkCircle' : 'alert', 'ic'),
      h('div', { style: { flex: '1' } },
        h('div', { class: 'alert-t', text: (gate.level === 'ok' ? '🟢 ' : gate.level === 'warn' ? '🟡 ' : '🔴 ') + gate.title }),
        h('div', { class: 'alert-d', text: gate.reasons[0] || '' })
      )
    )
  ));
  el.appendChild(ccard);

  /* ---- tarefas de hoje ---- */
  const todays = todayTasks(aq);
  const doneN = todays.filter((t) => t.done).length;
  const tcard = h('div', { class: 'card' });
  tcard.appendChild(cardHead('clip', `Tarefas de hoje (${doneN}/${todays.length})`, () => ctx.nav('tarefas')));
  if (!todays.length) tcard.appendChild(h('div', { class: 'card-body' }, h('div', { class: 'note', text: 'Nenhuma tarefa ativa. Crie na aba Tarefas.' })));
  else todays.slice(0, 4).forEach((t) => tcard.appendChild(
    row(t.title, t.auto ? 'registrado hoje' : t.skipped ? 'pulada hoje' : (t.time || 'sem horário'), {
      left: h('button', {
        class: 'chk', style: { padding: '0' }, 'aria-label': 'Concluir',
        onclick: (e) => {
          e.stopPropagation();
          if (t.auto) { toast('Já consta pelo registro de hoje'); return; }
          toggleTask(aq, t.id); ctx.refresh();
        }
      }, h('span', { class: 'box', style: t.done ? { background: t.skipped ? 'var(--tx-3)' : 'var(--accent)', borderColor: t.skipped ? 'var(--tx-3)' : 'var(--accent)', color: '#fff' } : {} }, t.done ? icon(t.skipped ? 'clock' : 'check', 'ic ic-sm') : null)),
      right: t.skipped ? pill(null, 'Pulada') : pill(t.done ? 'ok' : null, t.done ? 'Feita' : 'Pendente')
    })
  ));
  el.appendChild(tcard);

  /* ---- fauna / carga ---- */
  const fcard = h('div', { class: 'card' });
  fcard.appendChild(cardHead('fish', 'Fauna e carga biológica', () => ctx.nav('fauna')));
  fcard.appendChild(h('div', { class: 'card-body' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' } },
      h('div', { style: { flex: '1', fontSize: '14.5px' }, text: `${bl.used} de ${bl.capacity} unidades de carga` }),
      pill(bioStatus(bl.pct), bl.pct + '%')
    ),
    h('div', { style: { height: '7px', borderRadius: '4px', background: 'var(--line)', overflow: 'hidden' } },
      h('div', { style: { height: '100%', width: Math.min(100, bl.pct) + '%', background: bl.pct > 100 ? 'var(--bad)' : bl.pct > 80 ? 'var(--warn)' : 'var(--ok)' } })),
    h('div', { class: 'note', style: { marginTop: '8px' }, text: `Estimativa conservadora para ${bl.vol} L úteis. Não substitui observação: comportamento e parâmetros mandam mais que a conta.` })
  ));
  el.appendChild(fcard);

  /* ---- plantas ---- */
  const plcard = h('div', { class: 'card' });
  plcard.appendChild(cardHead('leaf', `Plantas (${(aq.plants || []).length})`, () => ctx.nav('plantas')));
  if (!(aq.plants || []).length) plcard.appendChild(h('div', { class: 'card-body' }, h('div', { class: 'note', text: 'Nenhuma planta registrada.' })));
  else (aq.plants || []).slice(0, 3).forEach((p) => plcard.appendChild(row(`${p.qty}× ${p.species}`, p.loc || '', { right: pill(condStatus(p.cond), condName(p.cond)) })));
  el.appendChild(plcard);

  /* ---- manutenção / próximos ---- */
  const nt = nextTestDue(aq);
  const lastTpa = (aq.tpas || [])[0];
  const tp = tpaDue(aq);
  const dd = doseDue(aq);
  const mcard = h('div', { class: 'card' });
  mcard.appendChild(cardHead('timer', 'Manutenção', () => ctx.nav('tarefas')));
  mcard.appendChild(row('Próxima medição', nt.label, { right: pill(nt.due ? 'warn' : null, nt.due ? 'Agora' : 'Ok'), onClick: () => openTestSheet(aq, ctx.refresh) }));
  mcard.appendChild(row('TPA programada',
    tp.plan.on ? `${tp.plan.every} dias · ${tp.plan.pct}% (${fmtNum(tpaCalc(aq, tp.plan.pct).liters, 1)} L) · ${tp.label}` : 'programa desligado',
    { right: pill(tp.due && tp.plan.on ? 'warn' : null, tp.due && tp.plan.on ? 'Vencida' : 'Ok'), onClick: () => ctx.nav('tarefas') }));
  if (dd.active) mcard.appendChild(row('Stability de hoje', `${dd.label} · ${fmtNum(dd.ml, 1)} mL`, {
    right: pill(dd.done ? 'ok' : 'warn', dd.done ? 'Feito' : 'Pendente'), onClick: () => openDoseSheet(aq, ctx.refresh)
  }));
  mcard.appendChild(row('Última TPA', lastTpa ? `${fmtNum(lastTpa.pct, 0)}% · ${fmtNum(lastTpa.liters, 1)} L · ${relDay(lastTpa.at)}` : 'nenhuma registrada', { onClick: () => ctx.nav('tpa') }));
  mcard.appendChild(row('Última dosagem', (aq.dosings || [])[0] ? `${relDay(aq.dosings[0].at)}` : 'nenhuma registrada', { onClick: () => ctx.nav('dosagens') }));
  el.appendChild(mcard);

  /* ---- diário ---- */
  const dcard = h('div', { class: 'card' });
  dcard.appendChild(cardHead('book', 'Diário', () => ctx.nav('diario')));
  if (!(aq.notes || []).length) {
    dcard.appendChild(h('div', { class: 'card-body' },
      h('div', { class: 'note', style: { textAlign: 'center', marginBottom: '12px' }, text: 'Nenhuma nota registrada' }),
      h('button', { class: 'btn', onclick: () => openNoteSheet(aq, ctx.refresh) }, icon('plus', 'ic ic-sm'), 'Adicionar nota')
    ));
  } else (aq.notes || []).slice(0, 3).forEach((n) => dcard.appendChild(row(n.text.slice(0, 70) + (n.text.length > 70 ? '…' : ''), fmtDate(n.at), { right: n.kind === 'ocorrencia' ? pill('warn', 'Ocorrência') : null })));
  el.appendChild(dcard);

  el.appendChild(h('div', { style: { height: '10px' } }));
  el.appendChild(h('button', { class: 'btn sec', onclick: () => ctx.nav('historico') }, icon('chart', 'ic ic-sm'), 'Histórico e gráficos'));

  return {
    title: aq.name,
    actions: [
      { icon: 'edit', label: 'Editar aquário', on: () => ctx.nav('aquarios/editar/' + aq.id) }
    ],
    el
  };
}

/* ---------- helpers exportados ---------- */

/** Ações de registro rápido, usadas no botão + flutuante. */
export function quickActions(aq, ctx) {
  return [
    ['flask', 'Teste de água', () => openTestSheet(aq, ctx.refresh)],
    ['drop', 'TPA', () => openTPASheet(aq, ctx.refresh)],
    ['box', 'Dosagem', () => openDoseSheet(aq, ctx.refresh)],
    ['food', 'Alimentação', () => openFeedSheet(aq, ctx.refresh)],
    ['fish', 'Peixe', () => ctx.nav('fauna/nova')],
    ['leaf', 'Planta', () => ctx.nav('plantas/nova')],
    ['book', 'Nota', () => openNoteSheet(aq, ctx.refresh)],
    ['alert', 'Ocorrência', () => openNoteSheet(aq, ctx.refresh, 'ocorrencia')]
  ].map(([icon, label, on]) => ({ icon, label, on }));
}

export function paramTile(aq, k, onClick) {
  const def = P[k];
  const l = latest(aq, k);
  const s = l ? statusOf(aq, k, l.v) : null;
  const tr = trend(aq, k);
  const tg = target(aq, k);
  const t = h('button', { class: 'ptile', onclick: onClick });
  t.appendChild(h('div', { class: 'pt-n', text: def.n }));
  if (l) {
    t.appendChild(h('div', { class: 'pt-v' }, h('span', { text: fmtNum(l.v, def.dec) }), def.u ? h('span', { class: 'u', text: def.u }) : null));
    t.appendChild(h('div', { class: 'pt-f' },
      h('span', { class: 'dot', style: { width: '7px', height: '7px', borderRadius: '50%', background: s === 'ok' ? 'var(--ok)' : s === 'warn' ? 'var(--warn)' : 'var(--bad)' } }),
      h('span', { class: tr ? (tr.dir === 'up' ? 'trend-up' : tr.dir === 'down' ? 'trend-dn' : 'trend-eq') : '', text: tr ? ' ' + (tr.dir === 'flat' ? 'estável' : tr.dir === 'up' ? 'subindo' : 'caindo') : relDay(l.at) })
    ));
  } else {
    t.appendChild(h('div', { class: 'pt-v empty', text: '—' }));
    t.appendChild(h('div', { class: 'pt-f', text: `alvo ${fmtNum(tg.min, def.dec)}–${fmtNum(tg.max, def.dec)}` }));
  }
  return t;
}

/** Tarefas que valem HOJE, já resolvidas por fase do aquário e por cadência. */
export function todayTasks(aq) {
  const wd = new Date().getDay();
  const dom = new Date().getDate();
  const nt = nextTestDue(aq);
  const tp = tpaDue(aq);
  const cyc = cyclingStatus(aq);
  const dd = doseDue(aq);
  const hasFish = (aq.livestock || []).some((x) => x.status !== 'obito' && x.status !== 'removido');

  return (aq.tasks || []).filter((t) => {
    if (!t.on) return false;
    // tarefas que só fazem sentido em certa fase
    if (t.fase === 'ciclagem') {
      if (cyc.done) return false;
      if (t.prod === 'stability' && !dd.active) return false;
    }
    if (t.fase === 'povoado' && !hasFish) return false;

    if (t.freq === 'diaria') return true;
    if (t.freq === 'cadencia') return nt.due;          // acompanha a fase do aquário
    if (t.freq === 'tpa') return tp.due;               // vence pelo programa de TPA
    if (t.freq === 'semanal') return wd === (t.weekday ?? 6);
    if (t.freq === 'mensal') return dom === (t.monthday ?? 1);
    return t.freq === 'unica';
  }).map((t) => {
    const auto = autoDone(aq, t);
    const skipped = !auto && manualSkipped(aq, t);
    return Object.assign({}, t, { done: auto || manualDone(aq, t), auto, skipped });
  });
}

function manualDone(aq, t) {
  return (aq.taskLog || []).some((l) => l.taskId === t.id && sameDay(l.at));
}

function manualSkipped(aq, t) {
  return (aq.taskLog || []).some((l) => l.taskId === t.id && sameDay(l.at) && l.skipped);
}

/** Marca sozinha quando o registro correspondente já entrou hoje — sem trabalho dobrado. */
export function autoDone(aq, t) {
  if (!t.action) return false;
  if (t.action === 'test') {
    return (aq.tests || []).some((x) => sameDay(x.at) &&
      (!t.params || !t.params.length || t.params.every((k) => num(x[k]) !== null)));
  }
  if (t.action === 'dose') {
    return (aq.dosings || []).some((d) => sameDay(d.at) && (!t.prod || d.prod === t.prod));
  }
  if (t.action === 'tpa') return (aq.tpas || []).some((x) => sameDay(x.at));
  if (t.action === 'feed') return (aq.feedings || []).some((x) => sameDay(x.at));
  return false;
}

export function toggleTask(aq, taskId) {
  const today = new Date().toDateString();
  aq.taskLog = aq.taskLog || [];
  const i = aq.taskLog.findIndex((l) => l.taskId === taskId && new Date(l.at).toDateString() === today);
  if (i >= 0) aq.taskLog.splice(i, 1);
  else aq.taskLog.unshift({ taskId, at: new Date().toISOString() });
  if (aq.taskLog.length > 800) aq.taskLog.length = 800;
  save();
}

/** Marca a ocorrência de hoje como pulada, sem desativar a recorrência da tarefa. */
export function skipTask(aq, taskId) {
  const today = new Date().toDateString();
  aq.taskLog = aq.taskLog || [];
  const i = aq.taskLog.findIndex((l) => l.taskId === taskId && new Date(l.at).toDateString() === today);
  if (i >= 0) aq.taskLog.splice(i, 1);
  aq.taskLog.unshift({ taskId, at: new Date().toISOString(), skipped: true });
  if (aq.taskLog.length > 800) aq.taskLog.length = 800;
  save();
}

export const condName = (c) => ({ adapt: 'Em adaptação', ok: 'Saudável', melt: 'Melt', poda: 'Precisa poda', ruim: 'Deteriorando' }[c] || c);
export const condStatus = (c) => ({ adapt: 'warn', ok: 'ok', melt: 'warn', poda: 'warn', ruim: 'bad' }[c] || null);
