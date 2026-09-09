/* views/plants.js — plantas: estado, poda, fotos e leitura correta de folha marrom. */

import {
  h, icon, cardHead, row, pill, sheet, toast, field, input, textarea, select, segmented,
  empty, kv, stepper, photoPicker, confirmSheet, todayLocal
} from '../ui.js';
import { save, uid, remove, putPhoto, photoURL } from '../store.js';
import { PLANT_STATES } from '../model.js';
import { fmtDate, relDay, ageDays, num } from '../engine.js';
import { condName, condStatus } from './dashboard.js';

export default function plants(ctx) {
  const aq = ctx.aq;
  const el = h('div');
  const list = aq.plants || [];

  el.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-pad' },
    h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } },
      h('div', { style: { flex: '1' } },
        h('div', { style: { fontSize: '15px', fontWeight: '700' }, text: `${list.reduce((s, p) => s + (num(p.qty) || 0), 0)} exemplares · ${list.length} espécie(s)` }),
        h('div', { style: { fontSize: '13px', color: 'var(--tx-3)' }, text: `Aquário com ${ageDays(aq)} dias` })),
      pill(list.some((p) => p.cond === 'ruim') ? 'bad' : list.some((p) => p.cond === 'melt' || p.cond === 'adapt' || p.cond === 'poda') ? 'warn' : list.length ? 'ok' : null,
        list.length ? (list.some((p) => p.cond === 'ruim') ? 'Atenção' : 'Acompanhando') : 'Sem plantas'))
  )));

  const bad = list.filter((p) => p.cond === 'ruim');
  const poda = list.filter((p) => p.cond === 'poda');
  const adapt = list.filter((p) => p.cond === 'adapt' || p.cond === 'melt');

  if (bad.length) el.appendChild(h('div', { class: 'alert warn' }, icon('alert', 'ic'), h('div', {},
    h('div', { class: 'alert-t', text: 'Plantas deteriorando' }),
    h('div', { class: 'alert-d', text: `${bad.map((p) => p.species).join(', ')}. Remova só as folhas totalmente necrosadas — matéria morta em decomposição vira amônia.` }))));
  if (poda.length) el.appendChild(h('div', { class: 'alert info' }, icon('leaf', 'ic'), h('div', {},
    h('div', { class: 'alert-t', text: 'Poda pendente' }), h('div', { class: 'alert-d', text: poda.map((p) => p.species).join(', ') }))));
  if (adapt.length && ageDays(aq) < 45) el.appendChild(h('div', { class: 'alert info' }, icon('info', 'ic'), h('div', {},
    h('div', { class: 'alert-t', text: 'Adaptação é esperada' }),
    h('div', { class: 'alert-d', text: `${adapt.length} espécie(s) em adaptação/melt com o aquário em ${ageDays(aq)} dias. Vallisneria com ponta marrom e Hygrophila trocando folhas normalmente é adaptação, não deficiência.` }))));

  el.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-pad' },
    h('div', { style: { fontWeight: '700', fontSize: '14.5px', marginBottom: '8px' }, text: 'Antes de tratar como deficiência nutricional' }),
    h('div', {}, ...['adaptação', 'melt', 'dano mecânico', 'iluminação', 'nutrientes', 'outros fatores'].map((t, i) =>
      h('div', { style: { display: 'flex', gap: '9px', marginBottom: '5px', fontSize: '13.5px', color: 'var(--tx-2)' } },
        h('span', { style: { color: 'var(--accent)', fontWeight: '700' }, text: (i + 1) + '.' }), h('span', { text: t })))),
    h('div', { class: 'note', style: { marginTop: '7px' }, text: 'Verifique nessa ordem. Folha marrom não é sinônimo de falta de nutriente.' })
  )));

  /* iluminação */
  const li = aq.light || {};
  el.appendChild(h('div', { class: 'card' },
    cardHead('light', 'Iluminação', () => openLight(aq, ctx.refresh)),
    h('div', { class: 'card-body' },
      kv('Fotoperíodo', `${li.hours ?? '—'} h/dia`),
      kv('Horário', `${li.on || '—'} às ${li.off || '—'}`),
      kv('Intensidade', li.intensity || '—'),
      li.notes ? h('div', { class: 'note', style: { marginTop: '7px' }, text: li.notes }) : null,
      h('div', { class: 'note', style: { marginTop: '7px' }, text: 'Não aumente o fotoperíodo só porque o crescimento está lento — luz extra sem nutriente e CO₂ resulta em alga.' })
    )));

  el.appendChild(h('div', { class: 'sec-title', text: 'Plantas' }));
  if (!list.length) el.appendChild(h('div', { class: 'card' }, empty('leaf', 'Nenhuma planta registrada.',
    h('button', { class: 'btn', onclick: () => ctx.nav('plantas/nova') }, icon('plus', 'ic ic-sm'), 'Adicionar'))));
  else list.forEach((p) => {
    const card = h('div', { class: 'card press', onclick: () => ctx.nav('plantas/editar/' + p.id) });
    if (p.photo) { const im = h('img', { alt: '', style: { width: '100%', height: '130px', objectFit: 'cover', display: 'block' } }); photoURL(p.photo).then((u) => { if (u) im.src = u; }); card.appendChild(im); }
    card.appendChild(h('div', { class: 'card-pad' },
      h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } },
        h('div', { style: { flex: '1' } },
          h('div', { style: { fontSize: '15.5px', fontWeight: '700' }, text: `${p.qty}× ${p.species}` }),
          h('div', { style: { fontSize: '12.5px', color: 'var(--tx-3)' }, text: `${p.loc || 'sem local'} · atualizado ${relDay(p.updatedAt || p.createdAt)}` })),
        pill(condStatus(p.cond), condName(p.cond))),
      p.notes ? h('div', { style: { fontSize: '13.5px', color: 'var(--tx-2)', marginTop: '8px' }, text: p.notes }) : null
    ));
    el.appendChild(card);
  });

  el.appendChild(h('button', { class: 'btn', onclick: () => ctx.nav('plantas/nova') }, icon('plus', 'ic ic-sm'), 'Adicionar planta'));
  return { title: 'Plantas', actions: [{ icon: 'plus', label: 'Adicionar', on: () => ctx.nav('plantas/nova') }], el };
}

export function plantForm(ctx, editId) {
  const aq = ctx.aq;
  const ex = editId ? (aq.plants || []).find((p) => p.id === editId) : null;
  const d = ex ? Object.assign({}, ex) : { species: '', qty: 1, cond: 'adapt', loc: '', notes: '', photo: null };
  let blob = null;
  const el = h('div');

  const photoSlot = h('div');
  photoSlot.appendChild(photoPicker(null, (b) => { blob = b; }));
  if (d.photo) photoURL(d.photo).then((u) => {
    if (!u) return;
    photoSlot.innerHTML = '';
    photoSlot.appendChild(photoPicker(u, (b) => { blob = b; }));
  });

  el.appendChild(field('Espécie', input({ value: d.species, placeholder: 'ex.: Vallisneria', oninput: (e) => { d.species = e.target.value; } })));
  el.appendChild(field('Quantidade', stepper(d.qty, { min: 1, max: 999, onChange: (v) => { d.qty = v; } })));
  el.appendChild(field('Estado', segmented(PLANT_STATES.map((s) => ({ v: s.v, n: s.n })), d.cond, (v) => { d.cond = v; }, 'wrap')));
  el.appendChild(field('Localização', input({ value: d.loc, placeholder: 'ex.: fundo esquerdo', oninput: (e) => { d.loc = e.target.value; } }), null, true));
  el.appendChild(field('Observações', textarea({
    value: d.notes,
    placeholder: 'Folhas novas? Folhas deterioradas? Coroa enterrada? Precisa de poda?',
    oninput: (e) => { d.notes = e.target.value; }
  }), null, true));
  el.appendChild(field('Foto', photoSlot, 'Foto ajuda a comparar a evolução mês a mês.', true));

  el.appendChild(h('button', {
    class: 'btn', onclick: async () => {
      if (!d.species.trim()) { toast('Informe a espécie', 'bad'); return; }
      if (blob) { const pid = uid(); await putPhoto(pid, blob); d.photo = pid; }
      d.updatedAt = new Date().toISOString();
      aq.plants = aq.plants || [];
      if (ex) Object.assign(ex, d);
      else aq.plants.unshift(Object.assign({ id: uid(), createdAt: new Date().toISOString() }, d));
      save({ immediate: true });
      toast(ex ? 'Planta atualizada' : 'Planta adicionada', 'ok');
      ctx.nav('plantas');
    }
  }, ex ? 'Salvar' : 'Adicionar'));

  if (ex) {
    el.appendChild(h('div', { style: { height: '9px' } }));
    el.appendChild(h('button', {
      class: 'btn danger', onclick: () => confirmSheet({
        title: 'Excluir planta?', message: ex.species, confirmText: 'Excluir', danger: true,
        onConfirm: async () => { await remove('plants', ex.id); toast('Excluída'); ctx.nav('plantas'); }
      })
    }, icon('trash', 'ic ic-sm'), 'Excluir'));
  }

  return { title: ex ? 'Editar planta' : 'Adicionar planta', back: true, el };
}

function openLight(aq, refresh) {
  const d = Object.assign({ on: '14:00', off: '20:00', hours: 6, intensity: 'média', notes: '' }, aq.light || {});
  return sheet({
    title: 'Iluminação',
    body: (b) => {
      const calc = () => {
        const [h1, m1] = (d.on || '0:0').split(':').map(Number);
        const [h2, m2] = (d.off || '0:0').split(':').map(Number);
        let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (mins < 0) mins += 1440;
        d.hours = Math.round((mins / 60) * 10) / 10;
        hEl.value = String(d.hours);
      };
      b.appendChild(field('Liga às', input({ type: 'time', value: d.on, oninput: (e) => { d.on = e.target.value; calc(); } })));
      b.appendChild(field('Desliga às', input({ type: 'time', value: d.off, oninput: (e) => { d.off = e.target.value; calc(); } })));
      const hEl = input({ type: 'number', step: '0.5', value: String(d.hours), oninput: (e) => { d.hours = num(e.target.value); } });
      b.appendChild(field('Duração (h/dia)', hEl));
      b.appendChild(field('Intensidade', segmented([{ v: 'baixa', n: 'Baixa' }, { v: 'média', n: 'Média' }, { v: 'alta', n: 'Alta' }], d.intensity, (v) => { d.intensity = v; })));
      b.appendChild(field('Observações sobre algas e crescimento', textarea({ value: d.notes, oninput: (e) => { d.notes = e.target.value; } }), null, true));
    },
    actions: (close) => h('button', { class: 'btn', text: 'Salvar', onclick: () => { aq.light = d; save({ immediate: true }); close(); toast('Iluminação salva', 'ok'); refresh?.(); } })
  });
}
