/* views/fauna.js — cadastro de fauna, análise de compatibilidade e plano de povoamento. */

import {
  h, icon, cardHead, row, pill, sheet, toast, field, input, textarea, select, segmented,
  empty, kv, stepper, colorPicker, confirmSheet, menuSheet, todayLocal
} from '../ui.js';
import { save, uid, remove, touch } from '../store.js';
import { SPECIES, SPEC } from '../model.js';
import {
  bioload, bioStatus, compatibility, riskLabel, canAddFish, fmtNum, fmtDate, relDay, num, ageDays
} from '../engine.js';

const HEALTH = [{ v: 'ok', n: 'Saudável' }, { v: 'warn', n: 'Alerta' }, { v: 'bad', n: 'Doente' }];
const hName = (v) => ({ ok: 'Saudável', warn: 'Alerta', bad: 'Doente' }[v] || '—');

export default function fauna(ctx) {
  const aq = ctx.aq;
  const el = h('div');
  const bl = bioload(aq);
  const live = (aq.livestock || []).filter((x) => x.status !== 'obito' && x.status !== 'removido');
  const gone = (aq.livestock || []).filter((x) => x.status === 'obito' || x.status === 'removido');

  /* carga */
  el.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-pad' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
      h('div', { style: { flex: '1' } },
        h('div', { style: { fontSize: '15px', fontWeight: '700' }, text: `${live.reduce((s, x) => s + (num(x.qty) || 0), 0)} animais · ${bl.used} de ${bl.capacity} un. de carga` }),
        h('div', { style: { fontSize: '13px', color: 'var(--tx-3)' }, text: `${fmtNum(aq.volUtil, 0)} L úteis` })),
      pill(bioStatus(bl.pct), bl.pct + '%')),
    h('div', { style: { height: '7px', borderRadius: '4px', background: 'var(--line)', overflow: 'hidden', marginTop: '11px' } },
      h('div', { style: { height: '100%', width: Math.min(100, bl.pct) + '%', background: bl.pct > 100 ? 'var(--bad)' : bl.pct > 80 ? 'var(--warn)' : 'var(--ok)' } }))
  )));

  /* portão */
  const gate = canAddFish(aq);
  el.appendChild(h('div', { class: 'alert ' + gate.level }, icon(gate.level === 'ok' ? 'checkCircle' : 'alert', 'ic'),
    h('div', { style: { flex: '1' } },
      h('div', { class: 'alert-t', text: (gate.level === 'ok' ? '🟢 ' : gate.level === 'warn' ? '🟡 ' : '🔴 ') + gate.title }),
      h('div', { class: 'alert-d' }, ...gate.reasons.map((r) => h('div', { style: { marginTop: '3px' }, text: '• ' + r }))))));

  /* lista */
  el.appendChild(h('div', { class: 'sec-title', text: 'Fauna atual' }));
  if (!live.length) el.appendChild(h('div', { class: 'card' }, empty('fish', 'Nenhum animal registrado.',
    h('button', { class: 'btn', onclick: () => ctx.nav('fauna/nova') }, icon('plus', 'ic ic-sm'), 'Adicionar'))));
  else {
    const c = h('div', { class: 'card' });
    live.forEach((x) => {
      const sp = SPEC[x.spec] || SPEC.outro;
      c.appendChild(row(`${x.qty}× ${x.name || sp.n}`,
        `${sp.zona} · adulto ~${sp.adult} cm${x.entryDate ? ' · entrou ' + fmtDate(x.entryDate + 'T12:00:00', false) : ''}`,
        {
          left: h('div', { style: { width: '34px', height: '34px', borderRadius: '9px', background: (x.color || '#1a7ff0') + '22', color: x.color || '#1a7ff0', display: 'grid', placeItems: 'center', flex: '0 0 auto' } }, icon(sp.camarao === 'self' ? 'shrimp' : x.spec === 'neritina' ? 'snail' : 'fish', 'ic ic-sm')),
          right: pill(x.health || null, hName(x.health)),
          onClick: () => openLivestock(aq, x, ctx)
        }));
    });
    el.appendChild(c);
  }

  el.appendChild(h('button', { class: 'btn', onclick: () => ctx.nav('fauna/nova') }, icon('plus', 'ic ic-sm'), 'Adicionar espécie'));
  el.appendChild(h('div', { style: { height: '9px' } }));
  el.appendChild(h('button', { class: 'btn sec', onclick: () => ctx.nav('povoamento') }, icon('cal', 'ic ic-sm'), 'Plano de povoamento'));
  el.appendChild(h('div', { style: { height: '9px' } }));
  el.appendChild(h('button', { class: 'btn sec', onclick: () => openCompatCheck(aq) }, icon('shield', 'ic ic-sm'), 'Verificar compatibilidade'));

  if (gone.length) {
    el.appendChild(h('div', { class: 'sec-title', text: 'Histórico (saídas e óbitos)' }));
    const c = h('div', { class: 'card' });
    gone.forEach((x) => c.appendChild(row(`${x.qty}× ${x.name || SPEC[x.spec]?.n}`,
      `${x.status === 'obito' ? 'Óbito' : 'Removido'}${x.diedAt ? ' · ' + fmtDate(x.diedAt, false) : ''}${x.notes ? ' · ' + x.notes : ''}`,
      { onClick: () => openLivestock(aq, x, ctx) })));
    el.appendChild(c);
  }

  return { title: 'Fauna', actions: [{ icon: 'plus', label: 'Adicionar', on: () => ctx.nav('fauna/nova') }], el };
}

/* ================= formulário ================= */
export function faunaForm(ctx, editId) {
  const aq = ctx.aq;
  const existing = editId ? (aq.livestock || []).find((x) => x.id === editId) : null;
  const d = existing
    ? Object.assign({}, existing)
    : { id: null, spec: 'cory', name: '', qty: 1, color: '#1a7ff0', health: 'ok', entryDate: todayLocal(), notes: '', status: 'ativo' };

  const el = h('div');
  const analysis = h('div');

  const drawAnalysis = () => {
    analysis.innerHTML = '';
    const c = compatibility(aq, d.spec, num(d.qty) || 1);
    const sp = SPEC[d.spec] || SPEC.outro;
    analysis.appendChild(h('div', { class: 'card' },
      cardHead('shield', 'Análise de compatibilidade', null, pill(c.level, riskLabel(c.level))),
      h('div', { class: 'card-body' },
        h('div', { class: 'note', style: { marginBottom: '9px' } }, `${sp.n}${sp.sci ? ` — ${sp.sci}` : ''} · adulto ~${sp.adult} cm · ${sp.zona} · cardume mínimo ${sp.grupo}`),
        ...c.notes.map((n) => h('div', { style: { fontSize: '13.5px', color: 'var(--tx-2)', marginBottom: '6px', display: 'flex', gap: '7px' } },
          h('span', { text: '•' }), h('span', { text: n }))),
        h('div', { style: { marginTop: '8px', fontSize: '13.5px' }, text: `Carga estimada após a entrada: ${c.pctAfter}% da capacidade.` })
      )));
  };

  el.appendChild(field('Espécie', select(SPECIES.map((s) => ({ v: s.id, n: s.n, sel: s.id === d.spec })), {
    onchange: (e) => { d.spec = e.target.value; if (!existing) { const sp = SPEC[d.spec]; d.qty = sp.grupo > 1 ? sp.grupo : 1; qtyEl.replaceWith(qtyEl = stepper(d.qty, { min: 1, max: 500, onChange: (v) => { d.qty = v; drawAnalysis(); } })); } drawAnalysis(); }
  })));
  el.appendChild(field('Nome / apelido', input({ value: d.name, placeholder: SPEC[d.spec]?.n || '', oninput: (e) => { d.name = e.target.value; } }), null, true));
  let qtyEl = stepper(d.qty, { min: 1, max: 500, onChange: (v) => { d.qty = v; drawAnalysis(); } });
  el.appendChild(field('Quantidade', qtyEl));
  el.appendChild(field('Cor no app', colorPicker(d.color, (v) => { d.color = v; })));
  el.appendChild(field('Status de saúde', segmented(HEALTH, d.health, (v) => { d.health = v; }, 'st')));
  el.appendChild(field('Data de entrada', input({ type: 'date', value: d.entryDate, oninput: (e) => { d.entryDate = e.target.value; } })));
  el.appendChild(field('Observações', textarea({ value: d.notes, placeholder: 'Ex.: comportamento, marcas, tanque de origem…', oninput: (e) => { d.notes = e.target.value; } }), null, true));
  el.appendChild(analysis);
  drawAnalysis();

  el.appendChild(h('button', {
    class: 'btn', onclick: () => {
      const c = compatibility(aq, d.spec, num(d.qty) || 1);
      const doSave = () => {
        aq.livestock = aq.livestock || [];
        d.updatedAt = new Date().toISOString();
        if (existing) Object.assign(existing, d);
        else aq.livestock.unshift(Object.assign({}, d, { id: uid(), createdAt: new Date().toISOString() }));
        save({ immediate: true });
        toast(existing ? 'Atualizado' : 'Espécie adicionada', 'ok');
        ctx.nav('fauna');
      };
      if (!existing && c.level === 'bad') {
        confirmSheet({
          title: '🔴 Alto risco — registrar mesmo assim?',
          message: c.notes.slice(0, 3).join(' ') + '\n\nSe o animal já está no aquário, registre para o app poder monitorar. Se ainda não, resolva os pontos acima primeiro.',
          confirmText: 'Registrar mesmo assim', danger: true, onConfirm: doSave
        });
        return;
      }
      doSave();
    }
  }, existing ? 'Salvar' : 'Adicionar'));

  if (existing) {
    el.appendChild(h('div', { style: { height: '9px' } }));
    el.appendChild(h('button', {
      class: 'btn danger', onclick: () => menuSheet('Registrar saída', [
        { icon: 'alert', label: 'Registrar óbito', on: () => { existing.status = 'obito'; existing.diedAt = new Date().toISOString(); touch(existing); save({ immediate: true }); toast('Óbito registrado. Teste amônia nas próximas 24 h.'); ctx.nav('fauna'); } },
        { icon: 'up', label: 'Removido do aquário', on: () => { existing.status = 'removido'; existing.diedAt = new Date().toISOString(); touch(existing); save({ immediate: true }); ctx.nav('fauna'); } },
        { icon: 'trash', label: 'Excluir registro', danger: true, on: () => confirmSheet({ title: 'Excluir registro?', message: 'Some do histórico. Prefira "registrar óbito/removido" para manter o rastro.', confirmText: 'Excluir', danger: true, onConfirm: async () => { await remove('livestock', existing.id); ctx.nav('fauna'); } }) }
      ])
    }, 'Registrar saída / óbito'));
  }

  return { title: existing ? 'Editar espécie' : 'Adicionar peixe', back: true, el };
}

function openLivestock(aq, x, ctx) {
  const sp = SPEC[x.spec] || SPEC.outro;
  return sheet({
    title: `${x.qty}× ${x.name || sp.n}`,
    body: (b) => {
      b.appendChild(kv('Espécie', sp.n + (sp.sci ? ` (${sp.sci})` : '')));
      b.appendChild(kv('Tamanho adulto', `~${sp.adult} cm`));
      b.appendChild(kv('Posição na coluna', sp.zona));
      b.appendChild(kv('Cardume mínimo', sp.grupo > 1 ? `${sp.grupo} indivíduos` : 'não é de cardume'));
      b.appendChild(kv('Faixa de temperatura', `${sp.temp[0]}–${sp.temp[1]} °C`));
      b.appendChild(kv('Faixa de pH', `${sp.ph[0]}–${sp.ph[1]}`));
      b.appendChild(kv('Risco para camarões', sp.camarao === 'self' ? '— (é camarão)' : sp.camarao));
      b.appendChild(kv('Saúde', hName(x.health)));
      b.appendChild(kv('Entrada', x.entryDate ? fmtDate(x.entryDate + 'T12:00:00', false) : '—'));
      if (x.notes) b.appendChild(kv('Observações', x.notes));
      if (sp.obs) b.appendChild(h('div', { class: 'note', style: { marginTop: '10px' }, text: sp.obs }));
    },
    actions: (close) => h('div', { class: 'btn-row', style: { paddingTop: '14px' } },
      h('button', { class: 'btn sec', text: 'Fechar', onclick: () => close() }),
      h('button', { class: 'btn', text: 'Editar', onclick: () => { close(); ctx.nav('fauna/editar/' + x.id); } }))
  });
}

/* ================= verificador rápido ================= */
export function openCompatCheck(aq) {
  let spec = 'betta', qty = 1;
  return sheet({
    title: 'Verificar compatibilidade',
    big: true,
    body: (b) => {
      const out = h('div');
      const res = h('div');
      const draw = () => {
        res.innerHTML = '';
        const c = compatibility(aq, spec, qty);
        const sp = SPEC[spec];
        res.appendChild(h('div', { class: 'alert ' + c.level }, icon('shield', 'ic'),
          h('div', { style: { flex: '1' } },
            h('div', { class: 'alert-t', text: `${c.level === 'ok' ? '🟢' : c.level === 'warn' ? '🟡' : '🔴'} ${riskLabel(c.level)}` }),
            h('div', { class: 'alert-d', text: `${qty}× ${sp.n} em ${fmtNum(aq.volUtil, 0)} L úteis` }))));
        c.notes.forEach((n) => res.appendChild(h('div', { style: { fontSize: '14px', color: 'var(--tx-2)', display: 'flex', gap: '8px', marginBottom: '8px' } }, h('span', { text: '•' }), h('span', { text: n }))));
        res.appendChild(h('div', { class: 'note', style: { marginTop: '4px' }, text: `Carga após a entrada: ${c.pctAfter}% da capacidade estimada.` }));
      };
      out.appendChild(field('Espécie', select(SPECIES.map((s) => ({ v: s.id, n: s.n, sel: s.id === spec })), { onchange: (e) => { spec = e.target.value; qty = SPEC[spec].grupo > 1 ? SPEC[spec].grupo : 1; qs.value = String(qty); draw(); } })));
      const qs = input({ type: 'number', min: '1', value: String(qty), oninput: (e) => { qty = num(e.target.value) || 1; draw(); } });
      out.appendChild(field('Quantidade', qs));
      out.appendChild(res);
      draw();
      b.appendChild(out);
    },
    actions: (close) => h('button', { class: 'btn sec', text: 'Fechar', onclick: () => close() })
  });
}

/* ================= plano de povoamento ================= */
export function stockingView(ctx) {
  const aq = ctx.aq;
  aq.stocking = aq.stocking || { plan: [], intervalDays: 8 };
  const el = h('div');
  const gate = canAddFish(aq);

  el.appendChild(h('div', { class: 'alert ' + gate.level }, icon(gate.level === 'ok' ? 'checkCircle' : 'alert', 'ic'),
    h('div', { style: { flex: '1' } },
      h('div', { class: 'alert-t', text: (gate.level === 'ok' ? '🟢 ' : gate.level === 'warn' ? '🟡 ' : '🔴 ') + gate.title }),
      h('div', { class: 'alert-d' }, ...gate.reasons.map((r) => h('div', { style: { marginTop: '3px' }, text: '• ' + r })),
        gate.next.length ? h('div', { style: { marginTop: '8px', fontWeight: '600' }, text: 'Próximos passos:' }) : null,
        ...gate.next.map((n) => h('div', { style: { marginTop: '2px' }, text: '→ ' + n }))))));

  el.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-pad' },
    h('div', { class: 'f-label', text: 'Intervalo entre lotes (dias)' }),
    input({ type: 'number', min: '1', value: String(aq.stocking.intervalDays), oninput: (e) => { aq.stocking.intervalDays = num(e.target.value) || 8; save(); } }),
    h('div', { class: 'f-hint', text: 'Referência configurável, não regra absoluta. Depois de cada entrada, observe antes do próximo lote.' })
  )));

  el.appendChild(h('div', { class: 'sec-title', text: 'Ordem planejada' }));
  if (!aq.stocking.plan.length) el.appendChild(h('div', { class: 'card' }, empty('cal', 'Nenhum lote planejado.')));
  else {
    const c = h('div', { class: 'card' });
    aq.stocking.plan.forEach((p, i) => {
      const sp = SPEC[p.spec] || SPEC.outro;
      const comp = compatibility(aq, p.spec, p.qty);
      c.appendChild(h('div', { class: 'card-row' },
        h('div', { style: { width: '28px', height: '28px', borderRadius: '50%', background: p.done ? 'var(--ok)' : 'var(--card-2)', color: p.done ? '#fff' : 'var(--tx-3)', display: 'grid', placeItems: 'center', fontSize: '13px', fontWeight: '700', flex: '0 0 auto' } }, p.done ? icon('check', 'ic ic-sm') : String(i + 1)),
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title', text: `${p.qty}× ${sp.n}` }),
          h('div', { class: 'row-sub', text: p.done ? 'já introduzido' : `${riskLabel(comp.level)} · carga iria a ${comp.pctAfter}%` })),
        pill(p.done ? 'ok' : comp.level, p.done ? 'Feito' : (comp.level === 'ok' ? '🟢' : comp.level === 'warn' ? '🟡' : '🔴')),
        h('button', {
          class: 'tb-btn', style: { width: '32px', height: '32px' }, 'aria-label': 'Opções',
          onclick: () => menuSheet(`${p.qty}× ${sp.n}`, [
            { icon: 'check', label: p.done ? 'Marcar como não introduzido' : 'Marcar como introduzido', on: () => { p.done = !p.done; save(); ctx.refresh(); } },
            { icon: 'plus', label: 'Adicionar à fauna atual', on: () => ctx.nav('fauna/nova') },
            { icon: 'trash', label: 'Remover do plano', danger: true, on: () => { aq.stocking.plan.splice(i, 1); save(); ctx.refresh(); } }
          ])
        }, icon('sliders', 'ic ic-sm'))
      ));
    });
    el.appendChild(c);
  }

  el.appendChild(h('button', {
    class: 'btn', onclick: () => {
      let spec = 'cory', qty = 6;
      sheet({
        title: 'Adicionar lote ao plano',
        body: (b) => {
          b.appendChild(field('Espécie', select(SPECIES.map((s) => ({ v: s.id, n: s.n, sel: s.id === spec })), { onchange: (e) => { spec = e.target.value; qi.value = String(SPEC[spec].grupo > 1 ? SPEC[spec].grupo : 1); qty = num(qi.value); } })));
          var qi = input({ type: 'number', min: '1', value: String(qty), oninput: (e) => { qty = num(e.target.value) || 1; } });
          b.appendChild(field('Quantidade', qi));
        },
        actions: (close) => h('button', {
          class: 'btn', text: 'Adicionar', onclick: () => {
            aq.stocking.plan.push({ id: uid(), spec, qty, done: false });
            save({ immediate: true }); close(); ctx.refresh();
          }
        })
      });
    }
  }, icon('plus', 'ic ic-sm'), 'Adicionar lote'));

  el.appendChild(h('div', { class: 'card', style: { marginTop: '14px' } }, h('div', { class: 'card-pad' },
    h('div', { style: { fontWeight: '700', fontSize: '14.5px', marginBottom: '7px' }, text: 'Como o app trata o povoamento' }),
    h('div', { class: 'note' },
      'Nenhum peixe entra com amônia ou nitrito acima de 0. Após cada introdução, registre quantidade, data, comportamento, alimentação e mortalidade — e teste amônia e nitrito em 24–48 h, porque a carga biológica aumentou. ',
      'O Betta é sempre o último. A Neritina depende de aquário maduro com biofilme disponível, não de uma data fixa.'))));

  return { title: 'Plano de povoamento', back: true, el };
}
