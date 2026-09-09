/* views/aquariums.js — lista de aquários e o assistente de criação/edição em 3 etapas. */

import {
  h, icon, row, pill, sheet, toast, field, input, textarea, segmented, stepper,
  colorPicker, photoPicker, empty, menuSheet, confirmSheet, todayLocal, kv
} from '../ui.js';
import { state, save, addAquarium, removeAquarium, uid, putPhoto, photoURL, delPhoto, forgetPhotoURL } from '../store.js';
import { newAquarium, seedTasks, seedProfileDoBriefing, TASK_TPL, PARAMS } from '../model.js';
import { ageDays, fmtNum, fmtDate, num } from '../engine.js';

export default function aquariums(ctx) {
  const el = h('div');

  if (!state.aquariums.length) {
    el.appendChild(h('div', { class: 'card' }, empty('tank', 'Nenhum aquário cadastrado.',
      h('button', { class: 'btn', onclick: () => ctx.nav('aquarios/novo') }, icon('plus', 'ic ic-sm'), 'Adicionar aquário'))));
    return { title: 'Meus Aquários', back: true, el };
  }

  state.aquariums.forEach((a) => {
    const card = h('div', { class: 'hero press', onclick: () => { state.activeId = a.id; save(); ctx.nav('aquario'); } });
    const img = h('div', { class: 'hero-img' });
    if (a.photo) photoURL(a.photo).then((u) => { if (u) { img.innerHTML = ''; img.appendChild(h('img', { src: u, alt: '' })); } });
    else img.appendChild(h('div', { class: 'ph' }, icon('tank', 'ic')));
    card.appendChild(img);
    card.appendChild(h('div', { class: 'hero-info' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        h('div', { class: 'hero-name', style: { flex: '1' } }, h('span', { text: a.name }),
          h('span', { style: { width: '9px', height: '9px', borderRadius: '50%', background: a.color } })),
        h('button', {
          class: 'tb-btn', 'aria-label': 'Opções', onclick: (e) => {
            e.stopPropagation();
            menuSheet(a.name, [
              { icon: 'up', label: 'Abrir', on: () => { state.activeId = a.id; save(); ctx.nav('aquario'); } },
              { icon: 'edit', label: 'Editar', on: () => ctx.nav('aquarios/editar/' + a.id) },
              state.aquariums.length > 1 ? {
                icon: 'trash', label: 'Excluir', danger: true, on: () => confirmSheet({
                  title: 'Excluir aquário?',
                  message: `"${a.name}" e todo o histórico dele — medições, fauna, plantas, fotos — serão apagados definitivamente. Faça um backup antes se quiser guardar.`,
                  confirmText: 'Excluir', danger: true,
                  onConfirm: async () => { await removeAquarium(a.id); toast('Aquário excluído'); ctx.refresh(); }
                })
              } : null
            ]);
          }
        }, icon('sliders', 'ic ic-sm'))),
      h('div', { style: { display: 'flex', gap: '9px', alignItems: 'center', marginTop: '9px', flexWrap: 'wrap' } },
        pill('info', a.type === 'doce' ? 'Água doce' : 'Água salgada'),
        h('span', { style: { fontSize: '13px', color: 'var(--tx-3)' }, text: `${fmtNum(a.volUtil, 0)} L úteis` }),
        h('span', { style: { fontSize: '13px', color: 'var(--tx-3)', marginLeft: 'auto' }, text: `${ageDays(a)} dias` })),
      h('div', { style: { fontSize: '12.5px', color: 'var(--tx-3)', marginTop: '6px' }, text: `Montado em ${fmtDate(a.setupDate + 'T00:00:00', false)} · ${(a.tests || []).length} medições` })
    ));
    el.appendChild(card);
  });

  el.appendChild(h('button', { class: 'btn', onclick: () => ctx.nav('aquarios/novo') }, icon('plus', 'ic ic-sm'), 'Adicionar aquário'));
  return { title: 'Meus Aquários', back: true, actions: [{ icon: 'plus', label: 'Novo', on: () => ctx.nav('aquarios/novo') }], el };
}

/* ================= assistente ================= */
export function aquariumForm(ctx, editId) {
  const ex = editId ? state.aquariums.find((a) => a.id === editId) : null;
  const d = ex ? JSON.parse(JSON.stringify(ex)) : newAquarium();
  let blob = null;
  let step = 1;
  const useTpl = { on: !ex };
  const usePerfil = { on: false };

  const el = h('div');
  const stepsEl = h('div', { class: 'steps' });
  const bodyEl = h('div');
  const footEl = h('div');
  el.appendChild(stepsEl); el.appendChild(bodyEl); el.appendChild(footEl);

  const drawSteps = () => {
    stepsEl.innerHTML = '';
    ['Detalhes', 'Equipamentos', 'Foto'].forEach((lb, i) => {
      const n = i + 1;
      if (i) stepsEl.appendChild(h('div', { class: 'step-line' + (step > i ? ' on' : '') }));
      stepsEl.appendChild(h('div', { class: 'step' + (step >= n ? ' on' : '') },
        h('div', { class: 'n' }, step > n ? icon('check', 'ic ic-sm') : String(n)), h('div', { class: 'l', text: lb })));
    });
  };

  const recalcBruto = () => {
    const { c, l, a } = d.dims || {};
    if (c && l && a) {
      d.volBruto = Math.round((c * l * a) / 1000);
      brutoEl.value = String(d.volBruto);
      if (!ex && !d._volTouched) { d.volUtil = Math.round(d.volBruto * 0.83); volEl.get && (volEl.querySelector('input').value = String(d.volUtil)); }
    }
  };

  let brutoEl, volEl;

  const draw = () => {
    drawSteps();
    bodyEl.innerHTML = '';
    footEl.innerHTML = '';

    if (step === 1) {
      bodyEl.appendChild(field('Nome', input({ value: d.name, placeholder: 'Meu Aquário', oninput: (e) => { d.name = e.target.value; } })));
      bodyEl.appendChild(field('Data de instalação', input({ type: 'date', value: d.setupDate, oninput: (e) => { d.setupDate = e.target.value; if (!ex) d.cycling.start = e.target.value; } })));
      bodyEl.appendChild(field('Tipo', segmented([{ v: 'doce', n: 'Água Doce', icon: 'drop' }, { v: 'salgada', n: 'Água Salgada', icon: 'drop' }], d.type, (v) => { d.type = v; })));

      bodyEl.appendChild(h('div', { class: 'sec-title', text: 'Dimensões (cm)' }));
      bodyEl.appendChild(h('div', { class: 'grid2 g3' },
        h('div', {}, h('div', { style: { fontSize: '12.5px', color: 'var(--tx-3)', marginBottom: '5px' }, text: 'Comprimento' }),
          input({ type: 'number', value: String(d.dims?.c ?? ''), oninput: (e) => { d.dims.c = num(e.target.value); recalcBruto(); } })),
        h('div', {}, h('div', { style: { fontSize: '12.5px', color: 'var(--tx-3)', marginBottom: '5px' }, text: 'Largura' }),
          input({ type: 'number', value: String(d.dims?.l ?? ''), oninput: (e) => { d.dims.l = num(e.target.value); recalcBruto(); } })),
        h('div', {}, h('div', { style: { fontSize: '12.5px', color: 'var(--tx-3)', marginBottom: '5px' }, text: 'Altura' }),
          input({ type: 'number', value: String(d.dims?.a ?? ''), oninput: (e) => { d.dims.a = num(e.target.value); recalcBruto(); } }))
      ));

      brutoEl = input({ type: 'number', value: String(d.volBruto ?? ''), oninput: (e) => { d.volBruto = num(e.target.value); } });
      bodyEl.appendChild(field('Volume bruto (L)', brutoEl, 'Calculado pelas dimensões. Serve apenas de referência.'));

      volEl = stepper(d.volUtil, { min: 1, max: 5000, step: 1, onChange: (v) => { d.volUtil = v; d._volTouched = true; } });
      bodyEl.appendChild(field('Volume ÚTIL (L)', volEl,
        'Este é o número que o app usa em TODOS os cálculos de dosagem, TPA e capacidade — descontando substrato, decoração e lâmina de ar. O volume bruto nunca é usado.'));

      bodyEl.appendChild(field('Cor', colorPicker(d.color, (v) => { d.color = v; })));

      if (!ex) {
        bodyEl.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-row' },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title', text: 'Já em ciclagem' }),
            h('div', { class: 'row-sub', text: 'O módulo de ciclagem começa ativo' })),
          h('button', {
            class: 'switch', 'aria-pressed': String(d.cycling.active), role: 'switch',
            onclick: (e) => { const v = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(v)); d.cycling.active = v; }
          }))));
      }
    }

    if (step === 2) {
      bodyEl.appendChild(h('div', { class: 'note', style: { marginBottom: '14px' }, text: 'Estes dados alimentam as análises do Consultor. Pode preencher depois.' }));
      const E = [
        ['filtro', 'Filtragem', 'ex.: Hang-On Leecom HI-430, 350 L/h'],
        ['midias', 'Mídias filtrantes', 'ex.: placa mecânica + anéis cerâmicos'],
        ['aquecedor', 'Aquecimento', 'ex.: termostato Roxin 100 W'],
        ['luz', 'Iluminação', 'ex.: calha LED full spectrum'],
        ['tampa', 'Tampa', 'ex.: vidro em 4 partes'],
        ['substrato', 'Substrato', 'ex.: 10 kg de cascalho nº 2']
      ];
      d.equip = d.equip || {};
      E.forEach(([k, lb, ph]) => bodyEl.appendChild(field(lb, textarea({ value: d.equip[k] || '', placeholder: ph, style: { minHeight: '58px' }, oninput: (e) => { d.equip[k] = e.target.value; } }), null, true)));

      bodyEl.appendChild(h('div', { class: 'sec-title', text: 'Iluminação' }));
      d.light = d.light || {};
      bodyEl.appendChild(h('div', { class: 'grid2' },
        h('div', {}, h('div', { style: { fontSize: '12.5px', color: 'var(--tx-3)', marginBottom: '5px' }, text: 'Liga às' }),
          input({ type: 'time', value: d.light.on || '14:00', oninput: (e) => { d.light.on = e.target.value; } })),
        h('div', {}, h('div', { style: { fontSize: '12.5px', color: 'var(--tx-3)', marginBottom: '5px' }, text: 'Desliga às' }),
          input({ type: 'time', value: d.light.off || '20:00', oninput: (e) => { d.light.off = e.target.value; } }))
      ));
      bodyEl.appendChild(field('Fotoperíodo (h/dia)', input({ type: 'number', step: '0.5', value: String(d.light.hours ?? 6), oninput: (e) => { d.light.hours = num(e.target.value); } })));

      if (!ex) {
        bodyEl.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-row' },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title', text: 'Criar checklist de manutenção' }),
            h('div', { class: 'row-sub', text: `${TASK_TPL.length} tarefas diárias, semanais e mensais` })),
          h('button', {
            class: 'switch', 'aria-pressed': String(useTpl.on), role: 'switch',
            onclick: (e) => { const v = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(v)); useTpl.on = v; }
          }))));
      }
    }

    if (step === 3) {
      bodyEl.appendChild(field('Foto do aquário', photoPicker(null, (b) => { blob = b; }), null, true));
      bodyEl.appendChild(field('Observações', textarea({ value: d.notes0 || '', placeholder: 'Ex.: aquário plantado comunitário, foco em Betta…', oninput: (e) => { d.notes0 = e.target.value; } }), null, true));

      if (!ex) {
        bodyEl.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-row' },
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title', text: 'Carregar o perfil do briefing' }),
            h('div', { class: 'row-sub', text: 'Plantas, plano de povoamento, alimentos e protocolo Stability já preenchidos' })),
          h('button', {
            class: 'switch', 'aria-pressed': String(usePerfil.on), role: 'switch',
            onclick: (e) => { const v = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(v)); usePerfil.on = v; }
          }))));
        bodyEl.appendChild(h('div', { class: 'note', text: '8 Vallisnerias, 4 Amazonenses, 1 Hygrophila corymbosa · plano Corydoras → Neons → Betta → Neritina · TetraMin, Betta Bits e ração de fundo · Stability 6 mL/dia por 7 dias.' }));
      }

      bodyEl.appendChild(h('div', { class: 'card', style: { marginTop: '14px' } }, h('div', { class: 'card-pad' },
        h('div', { style: { fontWeight: '700', fontSize: '14.5px', marginBottom: '8px' }, text: 'Resumo' }),
        kv('Nome', d.name || '—'),
        kv('Tipo', d.type === 'doce' ? 'Água doce' : 'Água salgada'),
        kv('Dimensões', `${d.dims?.c || '?'} × ${d.dims?.l || '?'} × ${d.dims?.a || '?'} cm`),
        kv('Volume bruto', `${fmtNum(d.volBruto, 0)} L`),
        kv('Volume útil (usado nos cálculos)', `${fmtNum(d.volUtil, 0)} L`),
        kv('Instalação', d.setupDate)
      )));
    }

    /* rodapé */
    const btns = h('div', { class: 'btn-row', style: { marginTop: '16px' } });
    if (step > 1) btns.appendChild(h('button', { class: 'btn sec', text: 'Voltar', onclick: () => { step--; draw(); window.scrollTo(0, 0); } }));
    if (step < 3) btns.appendChild(h('button', {
      class: 'btn', text: 'Continuar', onclick: () => {
        if (step === 1) {
          if (!d.name.trim()) { toast('Informe o nome', 'bad'); return; }
          if (!num(d.volUtil)) { toast('Informe o volume útil', 'bad'); return; }
        }
        step++; draw(); window.scrollTo(0, 0);
      }
    }));
    else btns.appendChild(h('button', { class: 'btn', text: ex ? 'Salvar' : 'Confirmar', onclick: commit }));
    footEl.appendChild(btns);
  };

  const commit = async () => {
    if (blob) {
      const pid = uid();
      await putPhoto(pid, blob);
      if (d.photo) { forgetPhotoURL(d.photo); await delPhoto(d.photo); }
      d.photo = pid;
    }
    delete d._volTouched;

    if (ex) {
      Object.assign(ex, d);
      await save({ immediate: true });
      toast('Aquário atualizado', 'ok');
      ctx.nav('aquario');
      return;
    }

    d.id = uid();
    if (!d.targets) d.targets = Object.fromEntries(PARAMS.map((p) => [p.k, { min: p.min, max: p.max }]));
    if (useTpl.on) seedTasks(d);
    if (usePerfil.on) seedProfileDoBriefing(d);
    if (d.notes0?.trim()) d.notes = [{ id: uid(), at: new Date().toISOString(), text: d.notes0.trim(), kind: 'nota' }];
    addAquarium(d);
    toast('Aquário criado', 'ok');
    ctx.nav('aquario');
  };

  draw();
  return { title: ex ? 'Editar Aquário' : 'Adicionar Aquário', back: true, el, noTabs: !state.aquariums.length };
}
