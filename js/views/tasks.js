/* views/tasks.js — checklists de manutenção diária, semanal e mensal. */

import { h, icon, cardHead, row, pill, sheet, toast, field, input, select, segmented, empty, switchBtn, confirmSheet } from '../ui.js';
import { save, uid } from '../store.js';
import { TASK_TPL, FREQ } from '../model.js';
import { fmtDate, relDay } from '../engine.js';
import { todayTasks, toggleTask } from './dashboard.js';

export default function tasks(ctx) {
  const aq = ctx.aq;
  const el = h('div');
  const today = todayTasks(aq);
  const doneN = today.filter((t) => t.done).length;

  el.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-pad' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
      h('div', { style: { flex: '1' } },
        h('div', { style: { fontSize: '15px', fontWeight: '700' }, text: `Hoje: ${doneN} de ${today.length}` }),
        h('div', { style: { fontSize: '13px', color: 'var(--tx-3)' }, text: new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) })),
      pill(today.length && doneN === today.length ? 'ok' : doneN ? 'warn' : null, today.length && doneN === today.length ? 'Completo' : 'Em andamento')),
    h('div', { style: { height: '7px', borderRadius: '4px', background: 'var(--line)', overflow: 'hidden', marginTop: '11px' } },
      h('div', { style: { height: '100%', width: (today.length ? (doneN / today.length) * 100 : 0) + '%', background: 'var(--ok)', transition: 'width .2s' } }))
  )));

  if (!(aq.tasks || []).length) {
    el.appendChild(h('div', { class: 'card' }, empty('clip', 'Nenhuma tarefa cadastrada.',
      h('button', { class: 'btn', onclick: () => { seed(aq); ctx.refresh(); } }, 'Usar checklist padrão'))));
  }

  if (today.length) {
    el.appendChild(h('div', { class: 'sec-title', text: 'Tarefas de hoje' }));
    const c = h('div', { class: 'card' });
    today.forEach((t) => {
      const lab = h('label', { class: 'chk' });
      const cb = h('input', { type: 'checkbox', checked: t.done });
      cb.addEventListener('change', () => { toggleTask(aq, t.id); ctx.refresh(); });
      lab.appendChild(cb);
      lab.appendChild(h('span', { class: 'box' }, icon('check', 'ic ic-sm')));
      lab.appendChild(h('span', { class: 'lb' }, h('span', { text: t.title }),
        h('span', { style: { display: 'block', fontSize: '12px', color: 'var(--tx-3)' }, text: `${FREQ[t.freq]}${t.time ? ' · ' + t.time : ''}` })));
      c.appendChild(lab);
    });
    el.appendChild(c);
  }

  ['diaria', 'semanal', 'mensal', 'unica'].forEach((f) => {
    const list = (aq.tasks || []).filter((t) => t.freq === f);
    if (!list.length) return;
    el.appendChild(h('div', { class: 'sec-title', text: FREQ[f] }));
    const c = h('div', { class: 'card' });
    list.forEach((t) => c.appendChild(h('div', { class: 'card-row' },
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title', text: t.title, style: t.on ? {} : { color: 'var(--tx-3)' } }),
        h('div', { class: 'row-sub', text: t.time ? `às ${t.time}` : FREQ[t.freq] })),
      switchBtn(t.on, (v) => { t.on = v; save(); }),
      h('button', { class: 'tb-btn', style: { width: '32px', height: '32px' }, 'aria-label': 'Excluir', onclick: () => confirmSheet({ title: 'Excluir tarefa?', message: t.title, confirmText: 'Excluir', danger: true, onConfirm: () => { const i = aq.tasks.indexOf(t); aq.tasks.splice(i, 1); save(); ctx.refresh(); } }) }, icon('trash', 'ic ic-sm'))
    )));
    el.appendChild(c);
  });

  el.appendChild(h('div', { style: { height: '12px' } }));
  el.appendChild(h('button', { class: 'btn', onclick: () => addTask(aq, ctx.refresh) }, icon('plus', 'ic ic-sm'), 'Nova tarefa'));
  if ((aq.tasks || []).length) {
    el.appendChild(h('div', { style: { height: '9px' } }));
    el.appendChild(h('button', { class: 'btn sec', onclick: () => confirmSheet({ title: 'Restaurar checklist padrão?', message: 'As tarefas do modelo que não existirem serão adicionadas. Suas tarefas personalizadas continuam.', confirmText: 'Restaurar', onConfirm: () => { seed(aq, true); ctx.refresh(); } }) }, icon('refresh', 'ic ic-sm'), 'Restaurar checklist padrão'));
  }

  const log = (aq.taskLog || []).slice(0, 15);
  if (log.length) {
    el.appendChild(h('div', { class: 'sec-title', text: 'Últimas conclusões' }));
    const c = h('div', { class: 'card' });
    log.forEach((l) => {
      const t = (aq.tasks || []).find((x) => x.id === l.taskId);
      c.appendChild(row(t?.title || 'Tarefa removida', fmtDate(l.at), { right: pill('ok', 'Feita') }));
    });
    el.appendChild(c);
  }

  return { title: 'Tarefas', actions: [{ icon: 'plus', label: 'Nova', on: () => addTask(aq, ctx.refresh) }], el };
}

function seed(aq, merge = false) {
  if (!merge) aq.tasks = [];
  aq.tasks = aq.tasks || [];
  TASK_TPL.forEach((t) => {
    if (aq.tasks.some((x) => x.title === t.t)) return;
    aq.tasks.push({ id: uid(), title: t.t, freq: t.freq, time: t.freq === 'diaria' ? '09:00' : '', on: true });
  });
  save({ immediate: true });
  toast('Checklist atualizado', 'ok');
}

function addTask(aq, refresh) {
  let title = '', freq = 'diaria', time = '09:00';
  return sheet({
    title: 'Nova tarefa',
    body: (b) => {
      b.appendChild(field('O que fazer', input({ placeholder: 'ex.: Sifonar o fundo', oninput: (e) => { title = e.target.value; } })));
      b.appendChild(field('Frequência', segmented([{ v: 'diaria', n: 'Diária' }, { v: 'semanal', n: 'Semanal' }, { v: 'mensal', n: 'Mensal' }, { v: 'unica', n: 'Única' }], freq, (v) => { freq = v; }, 'wrap')));
      b.appendChild(field('Horário', input({ type: 'time', value: time, oninput: (e) => { time = e.target.value; } }), null, true));
    },
    actions: (close) => h('button', {
      class: 'btn', text: 'Adicionar', onclick: () => {
        if (!title.trim()) { toast('Informe a tarefa', 'bad'); return; }
        aq.tasks = aq.tasks || [];
        aq.tasks.push({ id: uid(), title: title.trim(), freq, time, on: true });
        save({ immediate: true }); close(); refresh?.();
      }
    })
  });
}
