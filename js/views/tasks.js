/* views/tasks.js — rotina de manutenção: checklists, dosagens, medições e TPA programada.
   Princípio: o calendário LEMBRA, os parâmetros DECIDEM. Nenhuma tarefa manda
   trocar água ou dosar por prazo vencido sem antes olhar os dados. */

import {
  h, icon, cardHead, row, pill, sheet, toast, field, input, textarea, select, segmented,
  empty, switchBtn, confirmSheet, menuSheet, kv, stepper
} from '../ui.js';
import { save, uid, touch, remove } from '../store.js';
import { TASK_TPL, FREQ, CORE, P, PRODUCTS } from '../model.js';
import {
  fmtDate, fmtNum, relDay, nextTestDue, tpaDue, tpaVerdict, tpaSteps, doseDue, tpaCalc
} from '../engine.js';
import { todayTasks, toggleTask, skipTask } from './dashboard.js';
import { openTPASheet, openDoseSheet, openFeedSheet } from './logs.js';
import { openTestSheet } from './params.js';

export default function tasks(ctx) {
  const aq = ctx.aq;
  const el = h('div');
  const hoje = todayTasks(aq);
  const feitas = hoje.filter((t) => t.done).length;
  const nt = nextTestDue(aq);
  const tp = tpaDue(aq);
  const dd = doseDue(aq);

  /* ---- progresso do dia ---- */
  el.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-pad' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
      h('div', { style: { flex: '1' } },
        h('div', { style: { fontSize: '15px', fontWeight: '700' }, text: `Hoje: ${feitas} de ${hoje.length}` }),
        h('div', { style: { fontSize: '13px', color: 'var(--tx-3)' }, text: new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) })),
      pill(hoje.length && feitas === hoje.length ? 'ok' : feitas ? 'warn' : null,
        hoje.length && feitas === hoje.length ? 'Completo' : 'Em andamento')),
    h('div', { style: { height: '7px', borderRadius: '4px', background: 'var(--line)', overflow: 'hidden', marginTop: '11px' } },
      h('div', { style: { height: '100%', width: (hoje.length ? (feitas / hoje.length) * 100 : 0) + '%', background: 'var(--ok)', transition: 'width .2s' } }))
  )));

  if (!(aq.tasks || []).length) {
    el.appendChild(h('div', { class: 'card' }, empty('clip', 'Nenhuma tarefa cadastrada.',
      h('button', { class: 'btn', onclick: () => { seed(aq); ctx.refresh(); } }, 'Usar rotina padrão'))));
    return { title: 'Tarefas', el };
  }

  /* ---- rotinas que o app acompanha sozinho ---- */
  el.appendChild(h('div', { class: 'sec-title', text: 'Rotinas acompanhadas' }));
  const rot = h('div', { class: 'card' });

  rot.appendChild(row('Medição de parâmetros',
    `${nt.label} · a cada ${nt.every} dias nesta fase${aq.tests?.length ? ' · última ' + relDay(aq.tests[0].at) : ''}`, {
    left: icon('flask', 'ic'),
    right: pill(nt.due ? 'warn' : 'ok', nt.due ? 'Agora' : 'Em dia'),
    onClick: () => openTestSheet(aq, ctx.refresh)
  }));

  if (dd.active) {
    rot.appendChild(row('Stability (protocolo de bactérias)',
      `${dd.label} · ${fmtNum(dd.ml, 1)} mL sobre as mídias do filtro`, {
      left: icon('box', 'ic'),
      right: pill(dd.done ? 'ok' : 'warn', dd.done ? 'Feito' : 'Pendente'),
      onClick: () => openDoseSheet(aq, ctx.refresh)
    }));
  }

  const verd = tpaVerdict(aq);
  rot.appendChild(row('TPA programada',
    `${tp.plan.on ? `a cada ${tp.plan.every} dias · ${tp.plan.pct}% = ${fmtNum(tpaCalc(aq, tp.plan.pct).liters, 1)} L` : 'programa desligado'}${tp.lastAt ? ' · última ' + relDay(tp.lastAt) : ''}`, {
    left: icon('drop', 'ic'),
    right: pill(tp.due ? 'warn' : 'ok', tp.label),
    onClick: () => openTPAGuide(aq, ctx)
  }));
  rot.appendChild(row('Configurar programa de TPA', 'frequência e porcentagem padrão', {
    left: icon('sliders', 'ic'), onClick: () => openTPAPlan(aq, ctx.refresh)
  }));
  el.appendChild(rot);

  if (tp.due && tp.plan.on) {
    el.appendChild(h('div', { class: 'alert ' + (verd.level === 'ok' ? 'warn' : 'info') },
      icon(verd.level === 'ok' ? 'alert' : 'info', 'ic'),
      h('div', { style: { flex: '1' } },
        h('div', { class: 'alert-t', text: 'TPA programada venceu — veredito pelos seus dados: ' + verd.title }),
        h('div', { class: 'alert-d', text: verd.reasons[0] || '' }),
        h('button', { class: 'btn sm', style: { marginTop: '10px' }, onclick: () => openTPAGuide(aq, ctx) }, 'Ver quando e como fazer'))));
  }

  /* ---- tarefas de hoje ---- */
  if (hoje.length) {
    el.appendChild(h('div', { class: 'sec-title', text: 'Tarefas de hoje' }));
    const c = h('div', { class: 'card' });
    hoje.forEach((t) => c.appendChild(taskRow(aq, t, ctx)));
    el.appendChild(c);
  }

  /* ---- todas, agrupadas por frequência ---- */
  ['diaria', 'cadencia', 'tpa', 'semanal', 'mensal', 'unica'].forEach((f) => {
    const list = (aq.tasks || []).filter((t) => t.freq === f);
    if (!list.length) return;
    el.appendChild(h('div', { class: 'sec-title', text: FREQ[f] || f }));
    const c = h('div', { class: 'card' });
    list.forEach((t) => c.appendChild(h('div', { class: 'card-row' },
      // a linha inteira abre a edição; o interruptor e o menu ficam de fora do toque
      h('button', {
        class: 'row-main press',
        style: { textAlign: 'left', display: 'block', padding: '0' },
        onclick: () => taskSheet(aq, ctx.refresh, t)
      },
        h('div', { class: 'row-title', text: t.title, style: t.on ? {} : { color: 'var(--tx-3)' } }),
        h('div', { class: 'row-sub' },
          t.action ? h('span', { style: { color: 'var(--accent)', display: 'inline-flex', marginRight: '5px' } }, icon(actIcon(t.action), 'ic ic-sm')) : null,
          h('span', { text: subLabel(t, aq) }))),
      switchBtn(t.on, (v) => { t.on = v; touch(t); save(); }),
      h('button', {
        class: 'tb-btn', style: { width: '30px', height: '30px' }, 'aria-label': 'Opções',
        onclick: () => menuSheet(t.title, [
          { icon: 'edit', label: 'Editar tarefa', on: () => taskSheet(aq, ctx.refresh, t) },
          t.how ? { icon: 'info', label: 'Como fazer', on: () => openHow(t) } : null,
          { icon: t.on ? 'x' : 'check', label: t.on ? 'Desativar' : 'Ativar', on: () => { t.on = !t.on; touch(t); save(); ctx.refresh(); } },
          {
            icon: 'trash', label: 'Excluir tarefa', danger: true, on: () => confirmSheet({
              title: 'Excluir tarefa?',
              message: `"${t.title}" sai da rotina. O histórico de conclusões dela continua no aquário.`,
              confirmText: 'Excluir', danger: true,
              onConfirm: async () => { await remove('tasks', t.id); toast('Tarefa excluída'); ctx.refresh(); }
            })
          }
        ])
      }, icon('sliders', 'ic ic-sm'))
    )));
    el.appendChild(c);
  });

  el.appendChild(h('div', { style: { height: '12px' } }));
  el.appendChild(h('button', { class: 'btn', onclick: () => taskSheet(aq, ctx.refresh) }, icon('plus', 'ic ic-sm'), 'Nova tarefa'));
  el.appendChild(h('div', { style: { height: '9px' } }));
  el.appendChild(h('button', {
    class: 'btn sec', onclick: () => confirmSheet({
      title: 'Restaurar rotina padrão?',
      message: 'As tarefas do modelo que faltarem serão adicionadas, já com orientação e ação vinculada. As que já existem recebem a orientação sem perder o que você configurou.',
      confirmText: 'Restaurar', onConfirm: () => { seed(aq, true); ctx.refresh(); }
    })
  }, icon('refresh', 'ic ic-sm'), 'Restaurar rotina padrão'));

  const log = (aq.taskLog || []).slice(0, 12);
  if (log.length) {
    el.appendChild(h('div', { class: 'sec-title', text: 'Últimas conclusões e pulos' }));
    const c = h('div', { class: 'card' });
    log.forEach((l) => {
      const t = (aq.tasks || []).find((x) => x.id === l.taskId);
      c.appendChild(row(t?.title || 'Tarefa removida', fmtDate(l.at), { right: l.skipped ? pill(null, 'Pulada') : pill('ok', 'Feita') }));
    });
    el.appendChild(c);
  }

  return { title: 'Tarefas', actions: [{ icon: 'plus', label: 'Nova', on: () => taskSheet(aq, ctx.refresh) }], el };
}

/* ---------------- linha de tarefa do dia ---------------- */
function taskRow(aq, t, ctx) {
  const lab = h('div', { class: 'chk' });

  lab.appendChild(h('button', {
    style: {
      width: '24px', height: '24px', borderRadius: '7px', flex: '0 0 auto',
      display: 'grid', placeItems: 'center',
      border: '2px solid ' + (t.done ? (t.skipped ? 'var(--tx-3)' : 'var(--accent)') : 'var(--line)'),
      background: t.done ? (t.skipped ? 'var(--tx-3)' : 'var(--accent)') : 'transparent',
      color: t.done ? '#fff' : 'transparent'
    },
    'aria-label': t.done ? 'Desmarcar' : 'Marcar',
    onclick: () => {
      if (t.auto) { toast('Já consta pelo registro de hoje — não precisa marcar'); return; }
      toggleTask(aq, t.id);
      ctx.refresh();
    }
  }, t.done ? icon(t.skipped ? 'clock' : 'check', 'ic ic-sm') : null));

  lab.appendChild(h('button', {
    style: { flex: '1', minWidth: '0', textAlign: 'left', display: 'block', padding: '0' },
    'aria-label': 'Editar ' + t.title,
    onclick: () => taskSheet(aq, ctx.refresh, (aq.tasks || []).find((x) => x.id === t.id))
  },
    h('div', { style: { fontSize: '15px', color: t.done ? 'var(--tx-3)' : 'var(--tx)', textDecoration: t.done && !t.skipped ? 'line-through' : 'none' }, text: t.title }),
    h('div', { style: { fontSize: '12px', color: 'var(--tx-3)', marginTop: '1px' }, text: t.auto ? 'registrado hoje' : t.skipped ? 'pulada hoje' : subLabel(t, aq) })
  ));

  if (t.how) lab.appendChild(h('button', { class: 'tb-btn', style: { width: '30px', height: '30px' }, 'aria-label': 'Como fazer', onclick: () => openHow(t) }, icon('info', 'ic ic-sm')));

  if (!t.auto && !t.done) {
    lab.appendChild(h('button', {
      class: 'tb-btn', style: { width: '30px', height: '30px' }, 'aria-label': 'Pular hoje',
      onclick: () => { skipTask(aq, t.id); ctx.refresh(); }
    }, icon('clock', 'ic ic-sm')));
  }

  if (t.action && !t.auto && !t.done) {
    lab.appendChild(h('button', {
      class: 'btn sm', style: { padding: '7px 11px' },
      'aria-label': 'Registrar',
      onclick: () => runAction(aq, t, ctx)
    }, icon(actIcon(t.action), 'ic ic-sm')));
  }
  return lab;
}

function runAction(aq, t, ctx) {
  if (t.action === 'test') return openTestSheet(aq, ctx.refresh, (t.params || [])[0]);
  if (t.action === 'dose') return openDoseSheet(aq, ctx.refresh);
  if (t.action === 'feed') return openFeedSheet(aq, ctx.refresh);
  if (t.action === 'tpa') return openTPAGuide(aq, ctx);
}

const actIcon = (a) => ({ test: 'flask', dose: 'box', tpa: 'drop', feed: 'food' }[a] || 'chev');

function subLabel(t, aq) {
  if (t.freq === 'cadencia') return `conforme a fase — a cada ${nextTestDue(aq).every} dias`;
  if (t.freq === 'tpa') return `programa de TPA — ${tpaDue(aq).label}`;
  return (FREQ[t.freq] || t.freq) + (t.time ? ' · ' + t.time : '');
}

function openHow(t) {
  return sheet({
    title: t.title,
    body: (b) => {
      b.appendChild(h('div', { style: { display: 'flex', gap: '10px', marginTop: '6px' } },
        h('span', { style: { color: 'var(--accent)', flex: '0 0 auto' } }, icon('bulb', 'ic')),
        h('div', { style: { fontSize: '14.5px', color: 'var(--tx-2)', lineHeight: '1.5' }, text: t.how })));
    },
    actions: (close) => h('button', { class: 'btn', text: 'Entendi', onclick: () => close() })
  });
}

/* ---------------- guia de TPA: quando e como ---------------- */
export function openTPAGuide(aq, ctx) {
  const tp = tpaDue(aq);
  let pct = tp.plan.pct;

  return sheet({
    title: 'TPA — quando e como',
    big: true,
    body: (b) => {
      const out = h('div');
      const verd = tpaVerdict(aq);

      out.appendChild(h('div', { class: 'alert ' + verd.level },
        icon(verd.level === 'ok' ? 'checkCircle' : verd.level === 'bad' ? 'alert' : 'info', 'ic'),
        h('div', { style: { flex: '1' } },
          h('div', { class: 'alert-t', text: (verd.level === 'ok' ? '🟢 ' : verd.level === 'warn' ? '🟡 ' : '🔴 ') + verd.title }),
          h('div', { class: 'alert-d' }, ...verd.reasons.map((r) => h('div', { style: { marginTop: '3px' }, text: '• ' + r }))))));

      out.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-pad' },
        kv('Programa', tp.plan.on ? `a cada ${tp.plan.every} dias` : 'desligado'),
        kv('Última TPA', tp.lastAt ? `${fmtDate(tp.lastAt)} (${relDay(tp.lastAt)})` : 'nenhuma registrada'),
        kv('Situação do prazo', tp.label),
        h('div', { class: 'note', style: { marginTop: '8px' }, text: 'O prazo é lembrete. Quem decide é o veredito acima, que olha nitrato, amônia, nitrito e a fase do ciclo. Prazo vencido com água boa não obriga a trocar.' })
      )));

      const stepsBox = h('div');
      const draw = () => {
        stepsBox.innerHTML = '';
        const c = tpaCalc(aq, pct);
        stepsBox.appendChild(h('div', { class: 'card', style: { background: 'var(--accent-soft)', borderColor: 'rgba(26,127,240,.3)' } },
          h('div', { class: 'card-pad' },
            h('div', { style: { fontSize: '13px', color: 'var(--tx-2)' }, text: `${pct}% de ${fmtNum(aq.volUtil, 0)} L úteis` }),
            h('div', { style: { fontSize: '30px', fontWeight: '700', margin: '2px 0 4px' } },
              h('span', { text: fmtNum(c.liters, 1) }), h('span', { style: { fontSize: '15px', color: 'var(--tx-2)' }, text: ' L de água nova' })),
            h('div', { style: { fontSize: '14.5px' }, text: `Prime: ${fmtNum(c.prime.ml, 2)} mL (~${c.prime.drops} gotas)` }))));
        tpaSteps(aq, pct).forEach((s, i) => stepsBox.appendChild(
          h('div', { style: { display: 'flex', gap: '11px', marginBottom: '11px' } },
            h('div', { style: { width: '24px', height: '24px', borderRadius: '50%', background: 'var(--card-2)', color: 'var(--accent)', display: 'grid', placeItems: 'center', fontSize: '12.5px', fontWeight: '700', flex: '0 0 auto' }, text: String(i + 1) }),
            h('div', { style: { fontSize: '14px', color: 'var(--tx-2)', lineHeight: '1.45' }, text: s }))));
      };

      out.appendChild(h('div', { class: 'sec-title', text: 'Como fazer' }));
      out.appendChild(field('Porcentagem', segmented(
        [{ v: 10, n: '10%' }, { v: 20, n: '20%' }, { v: 25, n: '25%' }, { v: 30, n: '30%' }],
        pct, (v) => { pct = v; draw(); }, 'wrap')));
      out.appendChild(stepsBox);
      draw();

      out.appendChild(h('div', { class: 'alert bad', style: { marginTop: '4px' } }, icon('shield', 'ic'),
        h('div', {}, h('div', { class: 'alert-t', text: 'Nunca, em nenhuma TPA' }),
          h('div', { class: 'alert-d', text: 'Não lave as mídias biológicas na torneira e não troque todas de uma vez. Não misture Prime com Cloronev na mesma água.' }))));

      b.appendChild(out);
    },
    actions: (close) => h('div', { class: 'btn-row', style: { paddingTop: '6px' } },
      h('button', { class: 'btn sec', text: 'Fechar', onclick: () => close() }),
      h('button', {
        class: 'btn', text: 'Registrar TPA', onclick: () => {
          close();
          setTimeout(() => openTPASheet(aq, ctx.refresh), 160);
        }
      })
    )
  });
}

function openTPAPlan(aq, refresh) {
  const p = Object.assign({ on: true, every: 10, pct: 20 }, aq.tpaPlan || {});
  return sheet({
    title: 'Programa de TPA',
    big: true,
    body: (b, close) => {
      b.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-row' },
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title', text: 'Lembrar da TPA' }),
          h('div', { class: 'row-sub', text: 'o app avisa quando o prazo vence' })),
        switchBtn(p.on, (v) => { p.on = v; }))));
      b.appendChild(field('A cada quantos dias', stepper(p.every, { min: 1, max: 90, onChange: (v) => { p.every = v; } }),
        'É lembrete, não obrigação. Aquário plantado maduro com nitrato baixo passa bem de 10 a 14 dias.'));
      b.appendChild(field('Porcentagem padrão', segmented(
        [{ v: 10, n: '10%' }, { v: 20, n: '20%' }, { v: 25, n: '25%' }, { v: 30, n: '30%' }],
        p.pct, (v) => { p.pct = v; })));
      b.appendChild(h('div', { class: 'note', style: { marginBottom: '10px' } },
        `Com ${p.pct}% dos ${fmtNum(aq.volUtil, 0)} L úteis, cada TPA são ${fmtNum(tpaCalc(aq, p.pct).liters, 1)} L de água nova.`));
      b.appendChild(h('button', {
        class: 'btn', text: 'Salvar', onclick: () => {
          aq.tpaPlan = p; save({ immediate: true }); close(); toast('Programa de TPA salvo', 'ok'); refresh?.();
        }
      }));
    }
  });
}

/* ---------------- utilidades ---------------- */
function seed(aq, merge = false) {
  if (!merge) aq.tasks = [];
  aq.tasks = aq.tasks || [];
  TASK_TPL.forEach((t) => {
    const ex = aq.tasks.find((x) => x.title === t.t);
    if (ex) {
      // completa o que faltava nas tarefas antigas, sem perder ligado/desligado
      if (ex.action == null) ex.action = t.action || null;
      if (ex.params == null) ex.params = t.params || null;
      if (ex.prod == null) ex.prod = t.prod || null;
      if (ex.fase == null) ex.fase = t.fase || null;
      if (!ex.how) ex.how = t.how || '';
      if (t.freq === 'cadencia' || t.freq === 'tpa') ex.freq = t.freq;
      touch(ex);
      return;
    }
    aq.tasks.push({
      id: uid(), title: t.t, freq: t.freq, time: t.freq === 'diaria' ? '09:00' : '', on: true,
      action: t.action || null, params: t.params || null, prod: t.prod || null,
      fase: t.fase || null, how: t.how || '', updatedAt: new Date().toISOString()
    });
  });
  save({ immediate: true });
  toast('Rotina atualizada', 'ok');
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Formulário único: sem `t` cria uma tarefa nova, com `t` edita a existente. */
export function taskSheet(aq, refresh, t) {
  const novo = !t;
  const d = {
    title: t?.title || '',
    freq: t?.freq || 'diaria',
    time: t?.time || '09:00',
    action: t?.action || '',
    params: [...(t?.params || [])],
    prod: t?.prod || '',
    fase: t?.fase || '',
    how: t?.how || '',
    weekday: t?.weekday ?? 6,
    monthday: t?.monthday ?? 1,
    on: t?.on ?? true
  };

  return sheet({
    title: novo ? 'Nova tarefa' : 'Editar tarefa',
    big: true,
    body: (b, close) => {
      const out = h('div');
      const quandoBox = h('div');
      const vincBox = h('div');

      out.appendChild(field('O que fazer', input({
        value: d.title, placeholder: 'ex.: Sifonar o fundo',
        oninput: (e) => { d.title = e.target.value; }
      })));

      /* ---- quando ---- */
      const drawQuando = () => {
        quandoBox.innerHTML = '';
        if (d.freq === 'semanal') {
          quandoBox.appendChild(field('Dia da semana', select(
            DIAS.map((n, i) => ({ v: String(i), n, sel: i === d.weekday })),
            { onchange: (e) => { d.weekday = Number(e.target.value); } })));
        }
        if (d.freq === 'mensal') {
          quandoBox.appendChild(field('Dia do mês', stepper(d.monthday, { min: 1, max: 28, onChange: (v) => { d.monthday = v; } }),
            'Até 28 para o dia existir em todos os meses.'));
        }
        if (d.freq === 'cadencia') {
          quandoBox.appendChild(h('div', { class: 'note', style: { marginBottom: '15px' } },
            `Vence conforme a fase do aquário — hoje a cada ${nextTestDue(aq).every} dias. Muda sozinho quando o ciclo conclui ou entra fauna nova.`));
        }
        if (d.freq === 'tpa') {
          const p = tpaDue(aq);
          quandoBox.appendChild(h('div', { class: 'note', style: { marginBottom: '15px' } },
            p.plan.on ? `Vence junto do programa de TPA — a cada ${p.plan.every} dias. Situação: ${p.label}.`
              : 'O programa de TPA está desligado, então esta tarefa não vai vencer. Ligue em "Configurar programa de TPA".'));
        }
        if (d.freq === 'diaria' || d.freq === 'semanal' || d.freq === 'mensal' || d.freq === 'unica') {
          quandoBox.appendChild(field('Horário', input({
            type: 'time', value: d.time, oninput: (e) => { d.time = e.target.value; }
          }), null, true));
        }
      };

      out.appendChild(field('Frequência', segmented([
        { v: 'diaria', n: 'Diária' }, { v: 'semanal', n: 'Semanal' }, { v: 'mensal', n: 'Mensal' },
        { v: 'cadencia', n: 'Conforme a fase' }, { v: 'tpa', n: 'Junto da TPA' }, { v: 'unica', n: 'Única' }
      ], d.freq, (v) => { d.freq = v; drawQuando(); }, 'wrap')));
      out.appendChild(quandoBox);
      drawQuando();

      /* ---- vínculo com registro ---- */
      const drawVinc = () => {
        vincBox.innerHTML = '';
        if (d.action === 'test') {
          const grid = h('div', { class: 'seg wrap' });
          CORE.forEach((k) => {
            const sel = d.params.includes(k);
            const btn = h('button', { type: 'button', 'aria-pressed': String(sel), text: P[k].n.replace(/\s*\(.*\)/, '') });
            btn.addEventListener('click', () => {
              const i = d.params.indexOf(k);
              if (i >= 0) d.params.splice(i, 1); else d.params.push(k);
              btn.setAttribute('aria-pressed', String(d.params.includes(k)));
            });
            grid.appendChild(btn);
          });
          vincBox.appendChild(field('Quais parâmetros contam', grid,
            'A tarefa só se marca sozinha quando o teste do dia incluir TODOS os parâmetros marcados. Sem nenhum marcado, qualquer teste do dia serve.'));
        }
        if (d.action === 'dose') {
          vincBox.appendChild(field('Qual produto', select(
            [{ v: '', n: 'Qualquer produto', sel: !d.prod }, ...PRODUCTS.map((p) => ({ v: p.id, n: p.name, sel: p.id === d.prod }))],
            { onchange: (e) => { d.prod = e.target.value; } }),
            'A tarefa se marca sozinha quando houver dosagem desse produto no dia.'));
        }
      };

      out.appendChild(field('Vincular a um registro', select([
        { v: '', n: 'Nenhum — só marcar como feita', sel: !d.action },
        { v: 'test', n: 'Medição de parâmetros', sel: d.action === 'test' },
        { v: 'dose', n: 'Dosagem de produto', sel: d.action === 'dose' },
        { v: 'tpa', n: 'Troca parcial de água', sel: d.action === 'tpa' },
        { v: 'feed', n: 'Alimentação', sel: d.action === 'feed' }
      ], { onchange: (e) => { d.action = e.target.value; drawVinc(); } }),
        'Vinculando, a tarefa abre o registro certo quando você toca nela, e se marca sozinha quando o registro entra — sem anotar duas vezes.'));
      out.appendChild(vincBox);
      drawVinc();

      /* ---- fase ---- */
      out.appendChild(field('Quando faz sentido', segmented([
        { v: '', n: 'Sempre' }, { v: 'ciclagem', n: 'Só na ciclagem' }, { v: 'povoado', n: 'Só com peixes' }
      ], d.fase, (v) => { d.fase = v; }, 'wrap'),
        'A tarefa desaparece da lista do dia fora da fase escolhida, em vez de ficar cobrando algo impossível.'));

      /* ---- orientação ---- */
      out.appendChild(field('Como fazer', textarea({
        value: d.how, placeholder: 'Orientação que aparece ao tocar em "Como fazer".',
        style: { minHeight: '96px' },
        oninput: (e) => { d.how = e.target.value; }
      }), null, true));

      b.appendChild(out);
    },
    actions: (close) => h('div', { class: 'btn-row', style: { paddingTop: '6px' } },
      h('button', { class: 'btn sec', text: 'Cancelar', onclick: () => close() }),
      h('button', {
        class: 'btn', text: novo ? 'Adicionar' : 'Salvar', onclick: () => {
          if (!d.title.trim()) { toast('Informe a tarefa', 'bad'); return; }
          const dados = {
            title: d.title.trim(),
            freq: d.freq,
            time: (d.freq === 'cadencia' || d.freq === 'tpa') ? '' : d.time,
            action: d.action || null,
            params: d.action === 'test' && d.params.length ? d.params : null,
            prod: d.action === 'dose' && d.prod ? d.prod : null,
            fase: d.fase || null,
            how: d.how.trim()
          };
          if (d.freq === 'semanal') dados.weekday = d.weekday;
          if (d.freq === 'mensal') dados.monthday = d.monthday;

          if (novo) {
            aq.tasks = aq.tasks || [];
            aq.tasks.push(Object.assign({ id: uid(), on: true, updatedAt: new Date().toISOString() }, dados));
          } else {
            Object.assign(t, dados);
            touch(t);
          }
          save({ immediate: true });
          close();
          toast(novo ? 'Tarefa adicionada' : 'Tarefa atualizada', 'ok');
          refresh?.();
        }
      })
    )
  });
}
