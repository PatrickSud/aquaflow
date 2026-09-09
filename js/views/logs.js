/* views/logs.js — TPA, dosagens, alimentação e diário (folhas de registro + telas de lista). */

import {
  h, icon, cardHead, row, pill, sheet, toast, field, input, textarea, select, segmented,
  empty, kv, nowLocal, photoPicker, confirmSheet, switchBtn
} from '../ui.js';
import { push, remove, putPhoto, uid, save, photoURL } from '../store.js';
import { PRODUCTS, PRODUCT } from '../model.js';
import { tpaCalc, primeDose, stabilityDose, productGuard, fmtNum, fmtDate, relDay, latest, num, cyclingStatus } from '../engine.js';

/* ================= TPA ================= */
export function openTPASheet(aq, refresh) {
  let pct = 20;
  let at = nowLocal();
  let newTemp = latest(aq, 'temp')?.v ?? '';
  let usePrime = true;
  let notes = '';

  return sheet({
    title: 'Registrar TPA',
    big: true,
    body: (b) => {
      const out = h('div');
      const calcBox = h('div', { class: 'card', style: { background: 'var(--accent-soft)', borderColor: 'rgba(26,127,240,.3)' } });

      const draw = () => {
        const c = tpaCalc(aq, pct);
        calcBox.innerHTML = '';
        calcBox.appendChild(h('div', { class: 'card-pad' },
          h('div', { style: { fontSize: '13px', color: 'var(--tx-2)' }, text: `${pct}% de ${fmtNum(aq.volUtil, 0)} L úteis` }),
          h('div', { style: { fontSize: '32px', fontWeight: '700', margin: '2px 0 6px' } }, h('span', { text: fmtNum(c.liters, 1) }), h('span', { style: { fontSize: '15px', color: 'var(--tx-2)' }, text: ' L de água nova' })),
          usePrime ? h('div', { style: { fontSize: '14.5px' }, text: `Prime: ${fmtNum(c.prime.ml, 2)} mL (~${c.prime.drops} gotas)` }) : null,
          h('div', { class: 'note', style: { marginTop: '7px' }, text: 'Cálculo sobre o volume útil. A dose de Prime é para a ÁGUA NOVA (rótulo: 5 mL / 200 L) — confirme no seu frasco.' })
        ));
      };

      out.appendChild(field('Data e hora', input({ type: 'datetime-local', value: at, oninput: (e) => { at = e.target.value; } })));
      out.appendChild(field('Porcentagem trocada',
        segmented([{ v: 10, n: '10%' }, { v: 20, n: '20%' }, { v: 25, n: '25%' }, { v: 30, n: '30%' }, { v: 40, n: '40%' }],
          pct, (v) => { pct = v; draw(); }, 'wrap')));
      out.appendChild(field('Ou informe os litros direto',
        input({ type: 'number', step: '0.5', placeholder: 'litros', oninput: (e) => { const L = num(e.target.value); if (L !== null && aq.volUtil) { pct = Math.round((L / aq.volUtil) * 1000) / 10; draw(); } } }), null, true));
      out.appendChild(calcBox);
      out.appendChild(field('Temperatura da água nova (°C)', input({ type: 'number', step: '0.1', value: String(newTemp), oninput: (e) => { newTemp = e.target.value; } }), 'Deve chegar próxima da temperatura do aquário.'));
      out.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-row' },
        h('div', { class: 'row-main' }, h('div', { class: 'row-title', text: 'Usei Prime na água nova' })),
        switchBtn(usePrime, (v) => { usePrime = v; draw(); }))));
      out.appendChild(field('Observações', textarea({ placeholder: 'Ex.: sifonei o fundo, aspirei o cascalho…', oninput: (e) => { notes = e.target.value; } }), null, true));
      draw();
      b.appendChild(out);
    },
    actions: (close) => h('div', { class: 'btn-row', style: { paddingTop: '6px' } },
      h('button', { class: 'btn sec', text: 'Cancelar', onclick: () => close() }),
      h('button', {
        class: 'btn', text: 'Salvar', onclick: () => {
          const c = tpaCalc(aq, pct);
          push('tpas', { at: new Date(at).toISOString(), pct, liters: c.liters, newTemp: num(newTemp), prime: usePrime ? c.prime.ml : null, notes });
          if (usePrime) push('dosings', { at: new Date(at).toISOString(), prod: 'prime', ml: c.prime.ml, water: c.liters, where: 'água nova da TPA', notes: 'registrado junto com a TPA' });
          close(); toast('TPA registrada', 'ok'); refresh?.();
        }
      })
    )
  });
}

export function tpaView(ctx) {
  const aq = ctx.aq;
  const el = h('div');

  const card = h('div', { class: 'card' });
  card.appendChild(cardHead('drop', 'Calculadora de TPA', null));
  const body = h('div', { class: 'card-body' });
  body.appendChild(h('div', { class: 'note', style: { marginBottom: '10px' }, text: `Todos os cálculos usam ${fmtNum(aq.volUtil, 0)} L de volume útil (o bruto de ${fmtNum(aq.volBruto, 0)} L nunca é usado).` }));
  [10, 20, 25, 30, 40, 50].forEach((p) => {
    const c = tpaCalc(aq, p);
    body.appendChild(kv(`${p}%`, `${fmtNum(c.liters, 1)} L · Prime ${fmtNum(c.prime.ml, 2)} mL`));
  });
  card.appendChild(body);
  el.appendChild(card);

  el.appendChild(h('div', { class: 'alert info' }, icon('info', 'ic'), h('div', {},
    h('div', { class: 'alert-t', text: 'Antes de trocar água' }),
    h('div', { class: 'alert-d', text: 'A decisão não é pelo calendário. Verifique amônia, nitrito, nitrato, pH, temperatura, estado dos peixes e o motivo da TPA. Pergunte ao Consultor: ele analisa os seus dados atuais.' }))));

  el.appendChild(h('button', { class: 'btn', onclick: () => openTPASheet(aq, ctx.refresh) }, icon('plus', 'ic ic-sm'), 'Registrar TPA'));

  el.appendChild(h('div', { class: 'sec-title', text: `Histórico (${(aq.tpas || []).length})` }));
  if (!(aq.tpas || []).length) el.appendChild(h('div', { class: 'card' }, empty('drop', 'Nenhuma TPA registrada.')));
  else {
    const c = h('div', { class: 'card' });
    aq.tpas.forEach((t) => c.appendChild(row(`${fmtNum(t.pct, 0)}% · ${fmtNum(t.liters, 1)} L`,
      `${fmtDate(t.at)}${t.newTemp ? ` · água nova ${fmtNum(t.newTemp, 1)} °C` : ''}${t.notes ? ' · ' + t.notes : ''}`,
      { onClick: () => delSheet('tpas', t.id, 'esta TPA', ctx.refresh) })));
    el.appendChild(c);
  }
  return { title: 'TPA', back: true, el };
}

/* ================= dosagens ================= */
export function openDoseSheet(aq, refresh) {
  let prod = 'stability';
  let at = nowLocal();
  let ml = '';
  let water = '';
  let where = 'sobre as mídias do filtro';
  let notes = '';

  return sheet({
    title: 'Registrar dosagem',
    big: true,
    body: (b) => {
      const out = h('div');
      const guardBox = h('div');
      const helpBox = h('div');

      const draw = () => {
        const p = PRODUCT[prod];
        const g = productGuard(aq, prod);
        guardBox.innerHTML = '';
        if (g.msgs.length) {
          g.msgs.forEach((m) => guardBox.appendChild(h('div', { class: 'alert ' + (g.level === 'bad' ? 'bad' : 'warn') },
            icon('alert', 'ic'), h('div', {}, h('div', { class: 'alert-t', text: g.level === 'bad' ? 'Incompatível com o estado atual' : 'Atenção' }), h('div', { class: 'alert-d', text: m })))));
        }
        helpBox.innerHTML = '';
        if (p?.label && p.label !== '—') {
          const sug = prod === 'prime'
            ? `Para ${fmtNum(tpaCalc(aq, 20).liters, 1)} L de água nova (TPA 20%): ${fmtNum(tpaCalc(aq, 20).prime.ml, 2)} mL`
            : prod === 'stability'
              ? `Manutenção no volume útil (${fmtNum(aq.volUtil, 0)} L): ${fmtNum(stabilityDose(aq).ml, 1)} mL${aq.protocols?.stabilityMl ? ` · seu protocolo: ${aq.protocols.stabilityMl} mL/dia` : ''}`
              : '';
          helpBox.appendChild(h('div', { class: 'card', style: { background: 'var(--card-2)' } }, h('div', { class: 'card-pad' },
            h('div', { style: { fontSize: '13.5px', fontWeight: '600', marginBottom: '4px' }, text: 'Rótulo: ' + p.label }),
            sug ? h('div', { style: { fontSize: '14px', color: 'var(--accent)' }, text: sug }) : null,
            p.notes ? h('div', { class: 'note', style: { marginTop: '6px' }, text: p.notes }) : null
          )));
        }
      };

      out.appendChild(field('Produto', select(PRODUCTS.map((p) => ({ v: p.id, n: p.name, sel: p.id === prod })), { onchange: (e) => { prod = e.target.value; draw(); } })));
      out.appendChild(helpBox);
      out.appendChild(guardBox);
      out.appendChild(field('Data e hora', input({ type: 'datetime-local', value: at, oninput: (e) => { at = e.target.value; } })));
      out.appendChild(field('Quantidade aplicada (mL)', input({ type: 'number', step: '0.1', inputmode: 'decimal', placeholder: 'ex.: 6', oninput: (e) => { ml = e.target.value; } })));
      out.appendChild(field('Volume de água considerado (L)', input({ type: 'number', step: '0.5', placeholder: `padrão: ${fmtNum(aq.volUtil, 0)} L úteis`, oninput: (e) => { water = e.target.value; } }), 'Para condicionador de TPA, informe os litros de ÁGUA NOVA.', true));
      out.appendChild(field('Local da aplicação', input({ value: where, oninput: (e) => { where = e.target.value; } }), null, true));
      out.appendChild(field('Observações', textarea({ oninput: (e) => { notes = e.target.value; } }), null, true));
      draw();
      b.appendChild(out);
    },
    actions: (close) => h('div', { class: 'btn-row', style: { paddingTop: '6px' } },
      h('button', { class: 'btn sec', text: 'Cancelar', onclick: () => close() }),
      h('button', {
        class: 'btn', text: 'Salvar', onclick: () => {
          const v = num(ml);
          if (v === null || v <= 0) { toast('Informe a quantidade em mL', 'bad'); return; }
          const g = productGuard(aq, prod);
          const doSave = () => {
            push('dosings', { at: new Date(at).toISOString(), prod, ml: v, water: num(water) ?? aq.volUtil, where, notes });
            close(); toast('Dosagem registrada', 'ok'); refresh?.();
          };
          if (g.level === 'bad') {
            confirmSheet({
              title: 'Registrar mesmo assim?',
              message: g.msgs.join(' ') + '\n\nO registro será salvo como aplicado, mas o app manterá o alerta no histórico.',
              confirmText: 'Registrar mesmo assim', danger: true, onConfirm: doSave
            });
            return;
          }
          doSave();
        }
      })
    )
  });
}

export function doseView(ctx) {
  const aq = ctx.aq;
  const el = h('div');

  const cyc = cyclingStatus(aq);
  const prot = aq.protocols || {};
  if (prot.stabilityDays && cyc.day <= prot.stabilityDays) {
    const done = (aq.dosings || []).some((d) => d.prod === 'stability' && new Date(d.at).toDateString() === new Date().toDateString());
    el.appendChild(h('div', { class: 'alert ' + (done ? 'ok' : 'info') }, icon(done ? 'checkCircle' : 'info', 'ic'),
      h('div', {}, h('div', { class: 'alert-t', text: done ? 'Stability de hoje já registrado' : 'Stability de hoje pendente' }),
        h('div', { class: 'alert-d', text: `Protocolo: dia ${cyc.day} de ${prot.stabilityDays} · ${prot.stabilityMl || 6} mL sobre as mídias biológicas.` }))));
  }

  const calc = h('div', { class: 'card' });
  calc.appendChild(cardHead('box', 'Referências de dosagem', null));
  const cb = h('div', { class: 'card-body' });
  cb.appendChild(h('div', { style: { fontWeight: '700', fontSize: '14px', margin: '0 0 6px' }, text: 'Seachem Prime — sobre a ÁGUA NOVA' }));
  [10, 16, 20, 24].forEach((L) => cb.appendChild(kv(`${L} L de água nova`, `${fmtNum(primeDose(L).ml, 2)} mL (~${primeDose(L).drops} gotas)`)));
  cb.appendChild(kv(`Emergência: 5× no volume útil`, `${fmtNum(primeDose(aq.volUtil, 5).ml, 2)} mL`));
  cb.appendChild(h('div', { style: { fontWeight: '700', fontSize: '14px', margin: '14px 0 6px' }, text: 'Seachem Stability — sobre o volume útil' }));
  cb.appendChild(kv('1º dia', `${fmtNum(stabilityDose(aq, true).ml, 1)} mL`));
  cb.appendChild(kv('Manutenção diária', `${fmtNum(stabilityDose(aq).ml, 1)} mL`));
  if (prot.stabilityMl) cb.appendChild(kv('Seu protocolo', `${prot.stabilityMl} mL/dia por ${prot.stabilityDays} dias`));
  cb.appendChild(h('div', { class: 'note', style: { marginTop: '10px' }, text: 'Valores estimados a partir da regra do rótulo (Prime 5 mL/200 L; Stability 5 mL/40 L no 1º dia e 5 mL/80 L depois). Confirme sempre a concentração indicada no seu frasco.' }));
  calc.appendChild(cb);
  el.appendChild(calc);

  el.appendChild(h('div', { class: 'alert bad' }, icon('shield', 'ic'), h('div', {},
    h('div', { class: 'alert-t', text: 'Regras que o app não deixa passar' }),
    h('div', { class: 'alert-d', text: 'Prime e Cloronev nunca se misturam. Transnev não entra durante a ciclagem nem como prevenção no comunitário — apenas aquário hospitalar com indicação clara.' }))));

  el.appendChild(h('button', { class: 'btn', onclick: () => openDoseSheet(aq, ctx.refresh) }, icon('plus', 'ic ic-sm'), 'Registrar dosagem'));

  el.appendChild(h('div', { class: 'sec-title', text: `Histórico (${(aq.dosings || []).length})` }));
  if (!(aq.dosings || []).length) el.appendChild(h('div', { class: 'card' }, empty('box', 'Nenhuma dosagem registrada.')));
  else {
    const c = h('div', { class: 'card' });
    aq.dosings.slice(0, 40).forEach((d) => c.appendChild(row(`${PRODUCT[d.prod]?.name || d.prod} · ${fmtNum(d.ml, 2)} mL`,
      `${fmtDate(d.at)}${d.where ? ' · ' + d.where : ''}`, { onClick: () => delSheet('dosings', d.id, 'esta dosagem', ctx.refresh) })));
    el.appendChild(c);
  }
  return { title: 'Dosagens', back: true, el };
}

/* ================= alimentação ================= */
export function openFeedSheet(aq, refresh) {
  const foods = aq.foods || [];
  let food = foods[0]?.name || 'Ração';
  let at = nowLocal();
  let qty = '';
  let who = '';
  let accept = 'boa';
  let leftover = false;
  let notes = '';

  return sheet({
    title: 'Registrar alimentação',
    body: (b) => {
      const out = h('div');
      out.appendChild(field('Alimento', foods.length
        ? select([...foods.map((f) => ({ v: f.name, n: f.name + (f.target ? ` — ${f.target}` : ''), sel: f.name === food })), { v: '__', n: 'Outro…' }],
          { onchange: (e) => { food = e.target.value === '__' ? '' : e.target.value; } })
        : input({ value: food, oninput: (e) => { food = e.target.value; } })));
      out.appendChild(field('Data e hora', input({ type: 'datetime-local', value: at, oninput: (e) => { at = e.target.value; } })));
      out.appendChild(field('Quantidade', input({ placeholder: 'ex.: 4 grânulos / 1 pitada', oninput: (e) => { qty = e.target.value; } })));
      out.appendChild(field('Espécies alimentadas', input({ placeholder: 'ex.: Betta / Corydoras', oninput: (e) => { who = e.target.value; } }), null, true));
      out.appendChild(field('Aceitação', segmented([{ v: 'boa', n: 'Boa' }, { v: 'media', n: 'Média' }, { v: 'ruim', n: 'Ruim' }], accept, (v) => { accept = v; })));
      out.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-row' },
        h('div', { class: 'row-main' }, h('div', { class: 'row-title', text: 'Sobrou ração' }), h('div', { class: 'row-sub', text: 'Sobra vira amônia' })),
        switchBtn(leftover, (v) => { leftover = v; }))));
      out.appendChild(field('Observações', textarea({ oninput: (e) => { notes = e.target.value; } }), null, true));
      b.appendChild(out);
    },
    actions: (close) => h('div', { class: 'btn-row', style: { paddingTop: '6px' } },
      h('button', { class: 'btn sec', text: 'Cancelar', onclick: () => close() }),
      h('button', {
        class: 'btn', text: 'Salvar', onclick: () => {
          if (!food.trim()) { toast('Informe o alimento', 'bad'); return; }
          push('feedings', { at: new Date(at).toISOString(), food: food.trim(), qty, species: who, accept, leftover, notes });
          close(); toast('Alimentação registrada', 'ok'); refresh?.();
        }
      })
    )
  });
}

export function feedView(ctx) {
  const aq = ctx.aq;
  const el = h('div');

  const fc = h('div', { class: 'card' });
  fc.appendChild(cardHead('food', 'Alimentos cadastrados', null,
    h('button', { class: 'tb-btn', 'aria-label': 'Adicionar', onclick: () => addFood(aq, ctx.refresh) }, icon('plus', 'ic ic-sm'))));
  if (!(aq.foods || []).length) fc.appendChild(h('div', { class: 'card-body' }, h('div', { class: 'note', text: 'Nenhum alimento cadastrado.' })));
  else aq.foods.forEach((f, i) => fc.appendChild(row(f.name, f.target || '', {
    right: h('button', { class: 'tb-btn', style: { width: '32px', height: '32px' }, 'aria-label': 'Remover', onclick: () => { aq.foods.splice(i, 1); save(); ctx.refresh(); } }, icon('trash', 'ic ic-sm'))
  })));
  el.appendChild(fc);

  const left = (aq.feedings || []).filter((f) => f.leftover && (Date.now() - new Date(f.at)) / 86400000 <= 5);
  if (left.length >= 2) el.appendChild(h('div', { class: 'alert warn' }, icon('alert', 'ic'), h('div', {},
    h('div', { class: 'alert-t', text: 'Sobras repetidas' }),
    h('div', { class: 'alert-d', text: `${left.length} registros com sobra nos últimos 5 dias. Reduza a quantidade por refeição.` }))));

  el.appendChild(h('button', { class: 'btn', onclick: () => openFeedSheet(aq, ctx.refresh) }, icon('plus', 'ic ic-sm'), 'Registrar alimentação'));

  el.appendChild(h('div', { class: 'sec-title', text: `Histórico (${(aq.feedings || []).length})` }));
  if (!(aq.feedings || []).length) el.appendChild(h('div', { class: 'card' }, empty('food', 'Nenhum registro de alimentação.')));
  else {
    const c = h('div', { class: 'card' });
    aq.feedings.slice(0, 40).forEach((f) => c.appendChild(row(f.food, `${fmtDate(f.at)}${f.qty ? ' · ' + f.qty : ''}${f.species ? ' · ' + f.species : ''}`, {
      right: f.leftover ? pill('warn', 'sobra') : pill(f.accept === 'boa' ? 'ok' : f.accept === 'ruim' ? 'bad' : 'warn', f.accept || ''),
      onClick: () => delSheet('feedings', f.id, 'este registro', ctx.refresh)
    })));
    el.appendChild(c);
  }
  return { title: 'Alimentação', back: true, el };
}

function addFood(aq, refresh) {
  let name = '', tgt = '';
  return sheet({
    title: 'Novo alimento',
    body: (b) => {
      b.appendChild(field('Nome', input({ placeholder: 'ex.: TetraMin Flocos', oninput: (e) => { name = e.target.value; } })));
      b.appendChild(field('Para quem / observação', input({ placeholder: 'ex.: peixes de meia-água', oninput: (e) => { tgt = e.target.value; } }), null, true));
    },
    actions: (close) => h('button', {
      class: 'btn', text: 'Adicionar', onclick: () => {
        if (!name.trim()) { toast('Informe o nome', 'bad'); return; }
        aq.foods = aq.foods || [];
        aq.foods.push({ id: uid(), name: name.trim(), target: tgt.trim() });
        save(); close(); refresh?.();
      }
    })
  });
}

/* ================= diário ================= */
export function openNoteSheet(aq, refresh, kind = 'nota') {
  let at = nowLocal();
  let text = '';
  let k = kind;
  let blob = null;

  return sheet({
    title: k === 'ocorrencia' ? 'Registrar ocorrência' : 'Nova nota',
    big: true,
    body: (b) => {
      const out = h('div');
      out.appendChild(field('Tipo', segmented([{ v: 'nota', n: 'Nota' }, { v: 'ocorrencia', n: 'Ocorrência' }], k, (v) => { k = v; })));
      out.appendChild(field('Data e hora', input({ type: 'datetime-local', value: at, oninput: (e) => { at = e.target.value; } })));
      out.appendChild(field('O que aconteceu', textarea({ placeholder: 'Ex.: Betta ficou parado no fundo depois da TPA…', style: { minHeight: '110px' }, oninput: (e) => { text = e.target.value; } })));
      out.appendChild(field('Foto', photoPicker(null, (bl) => { blob = bl; }), null, true));
      b.appendChild(out);
    },
    actions: (close) => h('div', { class: 'btn-row', style: { paddingTop: '6px' } },
      h('button', { class: 'btn sec', text: 'Cancelar', onclick: () => close() }),
      h('button', {
        class: 'btn', text: 'Salvar', onclick: async () => {
          if (!text.trim()) { toast('Escreva algo', 'bad'); return; }
          let pid = null;
          if (blob) { pid = uid(); await putPhoto(pid, blob); }
          push('notes', { at: new Date(at).toISOString(), text: text.trim(), kind: k, photo: pid });
          close(); toast('Registrado', 'ok'); refresh?.();
        }
      })
    )
  });
}

export function diaryView(ctx) {
  const aq = ctx.aq;
  const el = h('div');
  el.appendChild(h('button', { class: 'btn', onclick: () => openNoteSheet(aq, ctx.refresh) }, icon('plus', 'ic ic-sm'), 'Nova nota'));
  el.appendChild(h('div', { style: { height: '9px' } }));
  el.appendChild(h('button', { class: 'btn sec', onclick: () => openNoteSheet(aq, ctx.refresh, 'ocorrencia') }, icon('alert', 'ic ic-sm'), 'Registrar ocorrência'));

  el.appendChild(h('div', { class: 'sec-title', text: `Registros (${(aq.notes || []).length})` }));
  if (!(aq.notes || []).length) { el.appendChild(h('div', { class: 'card' }, empty('book', 'Nenhuma nota registrada.'))); return { title: 'Diário', back: true, el }; }

  aq.notes.forEach((n) => {
    const card = h('div', { class: 'card' });
    card.appendChild(h('div', { class: 'card-pad' },
      h('div', { style: { display: 'flex', gap: '9px', alignItems: 'center', marginBottom: '7px' } },
        n.kind === 'ocorrencia' ? pill('warn', 'Ocorrência') : pill('info', 'Nota'),
        h('span', { style: { fontSize: '12.5px', color: 'var(--tx-3)', flex: '1' }, text: fmtDate(n.at) }),
        h('button', { class: 'tb-btn', style: { width: '30px', height: '30px' }, 'aria-label': 'Excluir', onclick: () => delSheet('notes', n.id, 'esta nota', ctx.refresh) }, icon('trash', 'ic ic-sm'))
      ),
      h('div', { style: { fontSize: '14.5px', whiteSpace: 'pre-wrap' }, text: n.text })
    ));
    if (n.photo) {
      const im = h('img', { alt: '', style: { width: '100%', display: 'block' } });
      photoURL(n.photo).then((u) => { if (u) im.src = u; });
      card.appendChild(im);
    }
    el.appendChild(card);
  });
  return { title: 'Diário', back: true, el };
}

/* ================= util ================= */
function delSheet(coll, id, what, refresh) {
  return confirmSheet({
    title: 'Excluir?',
    message: `Excluir ${what} do histórico. Essa ação não pode ser desfeita.`,
    confirmText: 'Excluir', danger: true,
    onConfirm: async () => { await remove(coll, id); toast('Excluído'); refresh?.(); }
  });
}
