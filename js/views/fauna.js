/* views/fauna.js — cadastro de fauna, análise de compatibilidade e plano de povoamento. */

import {
  h, icon, cardHead, row, pill, sheet, toast, field, input, textarea, select, segmented,
  empty, kv, stepper, colorPicker, confirmSheet, menuSheet, todayLocal, photoPicker, openImageLightbox
} from '../ui.js';
import { save, uid, remove, touch, state, photoURL, putPhoto, delPhoto, forgetPhotoURL } from '../store.js';
import {
  bioload, bioStatus, compatibility, riskLabel, canAddFish, fmtNum, fmtDate, relDay, num, ageDays, specOf, allSpecies, stockingOrderIssues
} from '../engine.js';
import { aiReady, identifySpeciesAI, planStockingOrderAI } from '../ai.js';
import { SPECIES, SPEC, SPECIES_ZONA, SPECIES_CAMARAO, SPECIES_PLANTA, SPECIES_BETTA } from '../model.js';

const HEALTH = [{ v: 'ok', n: 'Saudável' }, { v: 'warn', n: 'Alerta' }, { v: 'bad', n: 'Doente' }];
const hName = (v) => ({ ok: 'Saudável', warn: 'Alerta', bad: 'Doente' }[v] || '—');
const normSpeciesName = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Ícone e cor sugeridos para uma espécie — usa "kind"/"color" da base fixa quando existem
 *  (não são fotos reais, só um jeito de diferenciar visualmente cada espécie nas listas);
 *  para espécies customizadas (IA/manual), cai no que dá pra inferir do "camarao". */
function specGlyph(sp) {
  const kind = sp.kind || (sp.camarao === 'self' ? 'shrimp' : 'fish');
  const iconName = kind === 'shrimp' ? 'shrimp' : kind === 'snail' ? 'snail' : 'fish';
  return { iconName, color: sp.color || '#1a7ff0' };
}

export default function fauna(ctx) {
  const aq = ctx.aq;
  const cfg = state.settings.ai;
  const el = h('div');
  const bl = bioload(aq);
  const live = (aq.livestock || []).filter((x) => x.status !== 'obito' && x.status !== 'removido');
  const gone = (aq.livestock || []).filter((x) => x.status === 'obito' || x.status === 'removido');
  const addFauna = () => ctx.nav('fauna/nova');
  const newSpeciesAction = () => (aiReady(cfg) ? openAISpeciesAdd(ctx) : openManualSpeciesAdd(ctx));
  const newSpeciesLabel = aiReady(cfg) ? 'Cadastrar espécie com IA' : 'Cadastrar espécie manualmente';
  const newSpeciesIcon = aiReady(cfg) ? 'bulb' : 'plus';

  /* carga */
  const bioBits = [];
  if (bl.turnover !== null) bioBits.push(`filtro ${fmtNum(bl.turnover, 1)}×/h`);
  if (bl.plantFactor !== 1) bioBits.push(`plantio ${aq.plantDensity}`);
  const bioHints = [];
  if (bl.turnover === null) bioHints.push('a vazão do filtro em "Editar aquário"');
  if ((aq.plants || []).length && (!aq.plantDensity || aq.plantDensity === 'none')) bioHints.push('a densidade de plantio em "Plantas"');

  el.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-pad' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
      h('div', { style: { flex: '1' } },
        h('div', { style: { fontSize: '15px', fontWeight: '700' }, text: `${live.reduce((s, x) => s + (num(x.qty) || 0), 0)} animais · ${bl.used} de ${bl.capacity} un. de carga` }),
        h('div', { style: { fontSize: '13px', color: 'var(--tx-3)' }, text: `${fmtNum(aq.volUtil, 0)} L úteis` })),
      pill(bioStatus(bl.pct), bl.pct + '%')),
    h('div', { style: { height: '7px', borderRadius: '4px', background: 'var(--line)', overflow: 'hidden', marginTop: '11px' } },
      h('div', { style: { height: '100%', width: Math.min(100, bl.pct) + '%', background: bl.pct > 100 ? 'var(--bad)' : bl.pct > 80 ? 'var(--warn)' : 'var(--ok)' } })),
    bioBits.length ? h('div', { class: 'note', style: { marginTop: '8px' }, text: `Capacidade base ${fmtNum(bl.baseCapacity, 1)} un. → ajustada para ${fmtNum(bl.capacity, 1)} un. (${bioBits.join(' · ')}).` }) : null,
    bioHints.length ? h('div', { class: 'note', style: { marginTop: '4px' }, text: `Informe ${bioHints.join(' e ')} para refinar este número.` }) : null
  )));

  /* portão */
  const gate = canAddFish(aq);
  el.appendChild(h('div', { class: 'alert ' + gate.level }, icon(gate.level === 'ok' ? 'checkCircle' : 'alert', 'ic'),
    h('div', { style: { flex: '1' } },
      h('div', { class: 'alert-t', text: (gate.level === 'ok' ? '🟢 ' : gate.level === 'warn' ? '🟡 ' : '🔴 ') + gate.title }),
      h('div', { class: 'alert-d' }, ...gate.reasons.map((r) => h('div', { style: { marginTop: '3px' }, text: '• ' + r }))))));

  /* lista */
  el.appendChild(h('div', { class: 'sec-title', text: 'Fauna atual' }));
  if (!live.length) el.appendChild(h('div', { class: 'card' }, empty('fish', 'Nenhum animal registrado.')));
  else {
    const c = h('div', { class: 'card' });
    live.forEach((x) => {
      const sp = specOf(aq, x.spec);
      const thumb = h('div', { style: { width: '34px', height: '34px', borderRadius: '9px', background: (x.color || '#1a7ff0') + '22', color: x.color || '#1a7ff0', display: 'grid', placeItems: 'center', flex: '0 0 auto', overflow: 'hidden' } }, icon(specGlyph(sp).iconName, 'ic ic-sm'));
      if (x.photo) photoURL(x.photo).then((u) => {
        if (!u) return;
        thumb.innerHTML = '';
        thumb.appendChild(h('img', { src: u, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } }));
        thumb.style.cursor = 'zoom-in';
        thumb.onclick = (e) => { e.stopPropagation(); openImageLightbox(u); };
      });
      c.appendChild(row(`${x.qty}× ${x.name || sp.n}`,
        `${sp.zona} · adulto ~${sp.adult} cm${x.entryDate ? ' · entrou ' + fmtDate(x.entryDate + 'T12:00:00', false) : ''}`,
        {
          left: thumb,
          right: pill(x.health || null, hName(x.health)),
          onClick: () => openLivestock(aq, x, ctx)
        }));
    });
    el.appendChild(c);
  }

  el.appendChild(h('button', { class: 'btn', onclick: addFauna }, icon('plus', 'ic ic-sm'), 'Adicionar fauna'));
  el.appendChild(h('div', { style: { height: '9px' } }));
  el.appendChild(h('button', { class: 'btn sec', onclick: newSpeciesAction }, icon(newSpeciesIcon, 'ic ic-sm'), newSpeciesLabel));
  el.appendChild(h('div', { style: { height: '9px' } }));
  el.appendChild(h('button', { class: 'btn sec', onclick: () => ctx.nav('fauna/especies') }, icon('book', 'ic ic-sm'), 'Minhas espécies'));
  el.appendChild(h('div', { style: { height: '9px' } }));
  el.appendChild(h('button', { class: 'btn sec', onclick: () => ctx.nav('povoamento') }, icon('cal', 'ic ic-sm'), 'Plano de povoamento'));
  el.appendChild(h('div', { style: { height: '9px' } }));
  el.appendChild(h('button', { class: 'btn sec', onclick: () => openCompatCheck(aq) }, icon('shield', 'ic ic-sm'), 'Verificar compatibilidade'));

  if (gone.length) {
    el.appendChild(h('div', { class: 'sec-title', text: 'Histórico (saídas e óbitos)' }));
    const c = h('div', { class: 'card' });
    gone.forEach((x) => c.appendChild(row(`${x.qty}× ${x.name || specOf(aq, x.spec)?.n}`,
      `${x.status === 'obito' ? 'Óbito' : 'Removido'}${x.diedAt ? ' · ' + fmtDate(x.diedAt, false) : ''}${x.notes ? ' · ' + x.notes : ''}`,
      { onClick: () => openLivestock(aq, x, ctx) })));
    el.appendChild(c);
  }

  return {
    title: 'Fauna',
    actions: [
      { icon: newSpeciesIcon, label: newSpeciesLabel, on: newSpeciesAction },
      { icon: 'plus', label: 'Adicionar fauna', on: addFauna }
    ],
    el
  };
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
  let blob = null;
  const photoSlot = h('div');
  photoSlot.appendChild(photoPicker(null, (b) => { blob = b; }, { ratio: 16 / 9 }));
  if (d.photo) photoURL(d.photo).then((u) => {
    if (!u) return;
    photoSlot.innerHTML = '';
    photoSlot.appendChild(photoPicker(u, (b) => { blob = b; }, { ratio: 16 / 9 }));
  });

  const drawAnalysis = () => {
    analysis.innerHTML = '';
    const c = compatibility(aq, d.spec, num(d.qty) || 1);
    const sp = specOf(aq, d.spec);
    analysis.appendChild(h('div', { class: 'card' },
      cardHead('shield', 'Análise de compatibilidade', null, pill(c.level, riskLabel(c.level))),
      h('div', { class: 'card-body' },
        h('div', { class: 'note', style: { marginBottom: '9px' } }, `${sp.n}${sp.sci ? ` — ${sp.sci}` : ''} · adulto ~${sp.adult} cm · ${sp.zona} · cardume mínimo ${sp.grupo}`),
        ...c.notes.map((n) => h('div', { style: { fontSize: '13.5px', color: 'var(--tx-2)', marginBottom: '6px', display: 'flex', gap: '7px' } },
          h('span', { text: '•' }), h('span', { text: n }))),
        h('div', { style: { marginTop: '8px', fontSize: '13.5px' }, text: `Carga estimada após a entrada: ${c.pctAfter}% da capacidade.` })
      )));
  };

  el.appendChild(field('Espécie', select(allSpecies(aq).map((s) => ({ v: s.id, n: s.n, sel: s.id === d.spec })), {
    onchange: (e) => { d.spec = e.target.value; if (!existing) { const sp = specOf(aq, d.spec); d.qty = sp.grupo > 1 ? sp.grupo : 1; qtyEl.replaceWith(qtyEl = stepper(d.qty, { min: 1, max: 500, onChange: (v) => { d.qty = v; drawAnalysis(); } })); } drawAnalysis(); }
  })));
  el.appendChild(field('Nome / apelido', input({ value: d.name, placeholder: specOf(aq, d.spec)?.n || '', oninput: (e) => { d.name = e.target.value; } }), null, true));
  let qtyEl = stepper(d.qty, { min: 1, max: 500, onChange: (v) => { d.qty = v; drawAnalysis(); } });
  el.appendChild(field('Quantidade', qtyEl));
  el.appendChild(field('Cor no app', colorPicker(d.color, (v) => { d.color = v; })));
  el.appendChild(field('Status de saúde', segmented(HEALTH, d.health, (v) => { d.health = v; }, 'st')));
  el.appendChild(field('Data de entrada', input({ type: 'date', value: d.entryDate, oninput: (e) => { d.entryDate = e.target.value; } })));
  el.appendChild(field('Observações', textarea({ value: d.notes, placeholder: 'Ex.: comportamento, marcas, tanque de origem…', oninput: (e) => { d.notes = e.target.value; } }), null, true));
  el.appendChild(field('Foto', photoSlot, 'Ajuda a identificar o exemplar e comparar a evolução.', true));
  el.appendChild(analysis);
  drawAnalysis();

  el.appendChild(h('button', {
    class: 'btn', onclick: () => {
      const c = compatibility(aq, d.spec, num(d.qty) || 1);
      const doSave = async () => {
        if (blob) {
          const pid = uid();
          await putPhoto(pid, blob);
          if (d.photo) { forgetPhotoURL(d.photo); await delPhoto(d.photo); }
          d.photo = pid;
        }
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
  const sp = specOf(aq, x.spec);
  return sheet({
    title: `${x.qty}× ${x.name || sp.n}`,
    body: (b) => {
      if (x.photo) {
        const img = h('img', { alt: '', style: { width: '100%', height: '170px', objectFit: 'cover', borderRadius: 'var(--r-sm)', marginBottom: '12px', display: 'block', cursor: 'zoom-in' } });
        photoURL(x.photo).then((u) => { if (u) { img.src = u; img.onclick = () => openImageLightbox(u); } });
        b.appendChild(img);
      }
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
        const sp = specOf(aq, spec);
        res.appendChild(h('div', { class: 'alert ' + c.level }, icon('shield', 'ic'),
          h('div', { style: { flex: '1' } },
            h('div', { class: 'alert-t', text: `${c.level === 'ok' ? '🟢' : c.level === 'warn' ? '🟡' : '🔴'} ${riskLabel(c.level)}` }),
            h('div', { class: 'alert-d', text: `${qty}× ${sp.n} em ${fmtNum(aq.volUtil, 0)} L úteis` }))));
        c.notes.forEach((n) => res.appendChild(h('div', { style: { fontSize: '14px', color: 'var(--tx-2)', display: 'flex', gap: '8px', marginBottom: '8px' } }, h('span', { text: '•' }), h('span', { text: n }))));
        res.appendChild(h('div', { class: 'note', style: { marginTop: '4px' }, text: `Carga após a entrada: ${c.pctAfter}% da capacidade estimada.` }));
      };
      out.appendChild(field('Espécie', select(allSpecies(aq).map((s) => ({ v: s.id, n: s.n, sel: s.id === spec })), { onchange: (e) => { spec = e.target.value; qty = specOf(aq, spec).grupo > 1 ? specOf(aq, spec).grupo : 1; qs.value = String(qty); draw(); } })));
      const qs = input({ type: 'number', min: '1', value: String(qty), oninput: (e) => { qty = num(e.target.value) || 1; draw(); } });
      out.appendChild(field('Quantidade', qs));
      out.appendChild(res);
      draw();
      b.appendChild(out);
    },
    actions: (close) => h('button', { class: 'btn sec', text: 'Fechar', onclick: () => close() })
  });
}

/* ================= adicionar espécie com IA ================= */
export function openAISpeciesAdd(ctx) {
  const aq = ctx.aq;
  const cfg = state.settings.ai;
  let name = '';
  let qty = 1;

  return sheet({
    title: 'Adicionar peixe com IA',
    big: true,
    body: (b, close) => {
      if (!aiReady(cfg)) {
        b.appendChild(h('div', { class: 'alert warn' }, icon('alert', 'ic'), h('div', { style: { flex: '1' } },
          h('div', { class: 'alert-t', text: 'Nenhuma IA conectada' }),
          h('div', { class: 'alert-d', text: 'Para identificar espécies fora da lista, conecte uma IA primeiro (Gemini, OpenAI, Claude ou seu proxy).' }))));
        b.appendChild(h('button', {
          class: 'btn', style: { marginTop: '12px' }, onclick: async () => {
            const { openAIConfig } = await import('./consultor.js');
            close();
            openAIConfig(ctx);
          }
        }, icon('sliders', 'ic ic-sm'), 'Configurar IA'));
        b.appendChild(h('button', {
          class: 'btn ghost', style: { marginTop: '8px' }, onclick: () => { close(); openManualSpeciesAdd(ctx); }
        }, 'Prefiro cadastrar manualmente'));
        return;
      }

      b.appendChild(h('div', { class: 'note', style: { marginBottom: '12px' } },
        'Digite o nome da espécie (popular ou científico). A IA identifica tamanho, faixas de água, cardume e riscos, e o app cadastra automaticamente essa espécie e a fauna — inclusive na nuvem, se você sincroniza.'));
      b.appendChild(field('Nome da espécie', input({ placeholder: 'Ex.: Corydora Sterbai, Danio rerio…', oninput: (e) => { name = e.target.value; } })));
      b.appendChild(field('Quantidade', input({ type: 'number', min: '1', value: '1', oninput: (e) => { qty = num(e.target.value) || 1; } }), 'Usada só se você escolher "Adicionar ao aquário" — não é obrigatória para apenas cadastrar a espécie.'));

      const resultBox = h('div');
      b.appendChild(resultBox);

      const askBtn = h('button', {
        class: 'btn', style: { marginTop: '4px' }, onclick: async (ev) => {
          if (!name.trim()) { toast('Digite o nome da espécie', 'bad'); return; }
          resultBox.innerHTML = '';
          const btn = ev.currentTarget;
          const orig = btn.textContent;
          btn.disabled = true; btn.textContent = 'Perguntando à IA…';
          try {
            const key = normSpeciesName(name);
            state.speciesCache = state.speciesCache || {};
            if (state.speciesCache[key]) {
              drawPreview(state.speciesCache[key]);
              toast('Já identificada antes — reaproveitando os dados', 'ok');
            } else {
              const sp = await identifySpeciesAI(name.trim(), cfg);
              state.speciesCache[key] = sp;
              save();
              drawPreview(sp);
            }
          } catch (err) {
            resultBox.appendChild(h('div', { class: 'alert bad' }, icon('alert', 'ic'), h('div', { style: { flex: '1' } },
              h('div', { class: 'alert-t', text: 'Não foi possível adicionar' }),
              h('div', { class: 'alert-d', text: err.message }),
              err.raw ? h('details', { style: { marginTop: '8px' } },
                h('summary', { style: { fontSize: '12.5px', color: 'var(--tx-3)', cursor: 'pointer' }, text: 'Ver resposta da IA' }),
                h('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '11.5px', color: 'var(--tx-2)', background: 'var(--card)', padding: '10px', borderRadius: '8px', marginTop: '6px', overflowX: 'auto' }, text: err.raw })) : null)));
          }
          btn.disabled = false; btn.textContent = orig;
        }
      }, icon('bulb', 'ic ic-sm'), 'Perguntar à IA');
      b.appendChild(askBtn);
      b.appendChild(h('button', {
        class: 'btn ghost', style: { marginTop: '8px' }, onclick: () => { close(); openManualSpeciesAdd(ctx); }
      }, 'Prefiro cadastrar manualmente'));

      function drawPreview(sp) {
        resultBox.innerHTML = '';
        const id = 'custom_' + uid();
        const shadow = Object.assign({}, aq, { customSpecies: [...(aq.customSpecies || []), Object.assign({ id }, sp)] });
        const comp = compatibility(shadow, id, qty);

        resultBox.appendChild(h('div', { class: 'card' },
          cardHead('fish', sp.n, null, pill(comp.level, riskLabel(comp.level))),
          h('div', { class: 'card-body' },
            h('div', { class: 'note', style: { marginBottom: '9px' } }, `${sp.sci ? sp.sci + ' · ' : ''}adulto ~${sp.adult} cm · ${sp.zona} · cardume mínimo ${sp.grupo}`),
            h('div', { style: { fontSize: '13.5px', color: 'var(--tx-2)', marginBottom: '8px' } }, `Temperatura ${sp.temp[0]}–${sp.temp[1]} °C · pH ${sp.ph[0]}–${sp.ph[1]}`),
            ...comp.notes.map((n) => h('div', { style: { fontSize: '13.5px', color: 'var(--tx-2)', marginBottom: '6px', display: 'flex', gap: '7px' } }, h('span', { text: '•' }), h('span', { text: n }))),
            sp.obs ? h('div', { class: 'note', style: { marginTop: '6px' }, text: sp.obs }) : null,
            h('div', { class: 'note', style: { marginTop: '8px' }, text: 'Identificado por IA — confira se os dados condizem com o que você conhece da espécie antes de confirmar.' })
          )));

        resultBox.appendChild(h('div', { class: 'btn-row', style: { marginTop: '10px' } },
          h('button', {
            class: 'btn sec', onclick: () => {
              const now = new Date().toISOString();
              aq.customSpecies = aq.customSpecies || [];
              aq.customSpecies.push(Object.assign({ id, source: 'ia', createdAt: now, updatedAt: now }, sp));
              save({ immediate: true });
              toast(`${sp.n} cadastrada — sem adicionar ao aquário`, 'ok');
              close();
              ctx.refresh();
            }
          }, 'Só cadastrar a espécie'),
          h('button', {
            class: 'btn', onclick: () => {
              const doAdd = () => {
                const now = new Date().toISOString();
                aq.customSpecies = aq.customSpecies || [];
                aq.customSpecies.push(Object.assign({ id, source: 'ia', createdAt: now, updatedAt: now }, sp));
                aq.livestock = aq.livestock || [];
                aq.livestock.unshift({ id: uid(), spec: id, name: sp.n, qty, color: '#1a7ff0', health: 'ok', entryDate: todayLocal(), notes: 'Identificado e adicionado com auxílio de IA.', status: 'ativo', createdAt: now, updatedAt: now });
                save({ immediate: true });
                toast(`${sp.n} adicionado à fauna`, 'ok');
                close();
                ctx.refresh();
              };
              if (comp.level === 'bad') {
                confirmSheet({
                  title: '🔴 Alto risco — adicionar mesmo assim?',
                  message: comp.notes.slice(0, 3).join(' ') + '\n\nSe o animal já está no aquário, registre para o app poder monitorar. Se ainda não, resolva os pontos acima primeiro.',
                  confirmText: 'Adicionar mesmo assim', danger: true, onConfirm: doAdd
                });
                return;
              }
              doAdd();
            }
          }, icon('check', 'ic ic-sm'), 'Adicionar ao aquário')
        ));
      }
    },
    actions: (close) => h('button', { class: 'btn sec', text: 'Fechar', onclick: () => close() })
  });
}

/* ================= cadastrar espécie manualmente (sem IA) ================= */
export function openManualSpeciesAdd(ctx) {
  const aq = ctx.aq;
  let qty = 1;
  let existingId = null; // se setado, reaproveita a espécie já conhecida em vez de criar uma nova
  const sp = { n: '', sci: '', adult: 5, zona: 'meia-água', bio: 1, grupo: 1, temp: [22, 28], ph: [6.0, 8.0], camarao: 'medio', planta: 'medio', betta: 'atencao', obs: '' };

  return sheet({
    title: 'Cadastrar espécie manualmente',
    big: true,
    body: (b, close) => {
      b.appendChild(h('div', { class: 'note', style: { marginBottom: '12px' } },
        'Preencha as características técnicas da espécie. Elas alimentam as análises de compatibilidade e carga biológica deste aquário, do mesmo jeito que a base fixa do app.'));

      b.appendChild(field('Já é uma espécie conhecida?', select(
        [{ v: '', n: '— Nova espécie —', sel: true }, ...allSpecies(aq).map((s) => ({ v: s.id, n: s.n }))],
        { onchange: (e) => { existingId = e.target.value || null; drawForm(); } }
      ), 'Escolher uma já cadastrada pula direto para a quantidade — não duplica dados.'));

      const formBox = h('div');
      const qtyBox = h('div');
      const footBox = h('div');
      b.appendChild(formBox);
      b.appendChild(qtyBox);
      b.appendChild(footBox);

      const drawForm = () => {
        formBox.innerHTML = '';
        qtyBox.innerHTML = '';
        footBox.innerHTML = '';

        if (existingId) {
          const known = specOf(aq, existingId);
          qty = known.grupo > 1 ? known.grupo : 1;
          formBox.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-pad' },
            h('div', { style: { fontWeight: '700', fontSize: '14.5px' }, text: known.n }),
            h('div', { class: 'note', style: { marginTop: '4px' }, text: `${known.sci ? known.sci + ' · ' : ''}adulto ~${known.adult} cm · ${known.zona} · cardume mínimo ${known.grupo}` })
          )));
        } else {
          formBox.appendChild(field('Nome popular', input({ value: sp.n, placeholder: 'Ex.: Corydora Sterbai', oninput: (e) => { sp.n = e.target.value; } })));
          formBox.appendChild(field('Nome científico', input({ value: sp.sci, placeholder: 'Opcional', oninput: (e) => { sp.sci = e.target.value; } }), null, true));
          formBox.appendChild(h('div', { class: 'grid2' },
            field('Tamanho adulto (cm)', input({ type: 'number', step: '0.5', min: '0.5', value: String(sp.adult), oninput: (e) => { sp.adult = num(e.target.value) || 5; } })),
            field('Cardume mínimo', input({ type: 'number', min: '1', value: String(sp.grupo), oninput: (e) => { sp.grupo = Math.max(1, Math.round(num(e.target.value) || 1)); } }))
          ));
          formBox.appendChild(field('Zona do aquário', select(SPECIES_ZONA.map((o) => ({ v: o.v, n: o.n, sel: o.v === sp.zona })), { onchange: (e) => { sp.zona = e.target.value; } })));
          formBox.appendChild(field('Carga biológica relativa', input({ type: 'number', step: '0.1', min: '0.1', max: '3', value: String(sp.bio), oninput: (e) => { sp.bio = Math.min(3, Math.max(0.1, num(e.target.value) || 1)); } }), 'Referência: neon ≈ 0.5, coridora ≈ 1, peixe grande ≥ 2.'));
          formBox.appendChild(h('div', { class: 'grid2' },
            field('Temp. mínima (°C)', input({ type: 'number', step: '0.5', value: String(sp.temp[0]), oninput: (e) => { sp.temp = [num(e.target.value) ?? 22, sp.temp[1]]; } })),
            field('Temp. máxima (°C)', input({ type: 'number', step: '0.5', value: String(sp.temp[1]), oninput: (e) => { sp.temp = [sp.temp[0], num(e.target.value) ?? 28]; } }))
          ));
          formBox.appendChild(h('div', { class: 'grid2' },
            field('pH mínimo', input({ type: 'number', step: '0.1', value: String(sp.ph[0]), oninput: (e) => { sp.ph = [num(e.target.value) ?? 6, sp.ph[1]]; } })),
            field('pH máximo', input({ type: 'number', step: '0.1', value: String(sp.ph[1]), oninput: (e) => { sp.ph = [sp.ph[0], num(e.target.value) ?? 8]; } }))
          ));
          formBox.appendChild(field('Risco para camarões', select(SPECIES_CAMARAO.map((o) => ({ v: o.v, n: o.n, sel: o.v === sp.camarao })), { onchange: (e) => { sp.camarao = e.target.value; } })));
          formBox.appendChild(field('Risco para plantas', select(SPECIES_PLANTA.map((o) => ({ v: o.v, n: o.n, sel: o.v === sp.planta })), { onchange: (e) => { sp.planta = e.target.value; } })));
          formBox.appendChild(field('Convivência com Betta macho', select(SPECIES_BETTA.map((o) => ({ v: o.v, n: o.n, sel: o.v === sp.betta })), { onchange: (e) => { sp.betta = e.target.value; } })));
          formBox.appendChild(field('Observações', textarea({ value: sp.obs, placeholder: 'Cuidados, comportamento, alimentação…', oninput: (e) => { sp.obs = e.target.value; } }), null, true));
        }

        qtyBox.appendChild(field('Quantidade a adicionar agora', input({ type: 'number', min: '1', value: String(qty), oninput: (e) => { qty = num(e.target.value) || 1; } }),
          existingId ? null : 'Usada só se você escolher "Adicionar ao aquário".'));

        const addToTank = () => {
          if (existingId) {
            const known = specOf(aq, existingId);
            const comp = compatibility(aq, existingId, qty);
            const doAdd = () => {
              const now = new Date().toISOString();
              aq.livestock = aq.livestock || [];
              aq.livestock.unshift({ id: uid(), spec: existingId, name: known.n, qty, color: '#1a7ff0', health: 'ok', entryDate: todayLocal(), notes: '', status: 'ativo', createdAt: now, updatedAt: now });
              save({ immediate: true });
              toast(`${known.n} adicionado à fauna`, 'ok');
              close();
              ctx.refresh();
            };
            if (comp.level === 'bad') {
              confirmSheet({
                title: '🔴 Alto risco — adicionar mesmo assim?',
                message: comp.notes.slice(0, 3).join(' ') + '\n\nSe o animal já está no aquário, registre para o app poder monitorar. Se ainda não, resolva os pontos acima primeiro.',
                confirmText: 'Adicionar mesmo assim', danger: true, onConfirm: doAdd
              });
              return;
            }
            doAdd();
            return;
          }

          if (!sp.n.trim()) { toast('Informe o nome da espécie', 'bad'); return; }
          const id = 'custom_' + uid();
          const shadow = Object.assign({}, aq, { customSpecies: [...(aq.customSpecies || []), Object.assign({ id }, sp)] });
          const comp = compatibility(shadow, id, qty);
          const doAdd = () => {
            const now = new Date().toISOString();
            aq.customSpecies = aq.customSpecies || [];
            aq.customSpecies.push(Object.assign({ id, source: 'manual', createdAt: now, updatedAt: now }, sp));
            aq.livestock = aq.livestock || [];
            aq.livestock.unshift({ id: uid(), spec: id, name: sp.n, qty, color: '#1a7ff0', health: 'ok', entryDate: todayLocal(), notes: '', status: 'ativo', createdAt: now, updatedAt: now });
            save({ immediate: true });
            toast(`${sp.n} adicionado à fauna`, 'ok');
            close();
            ctx.refresh();
          };
          if (comp.level === 'bad') {
            confirmSheet({
              title: '🔴 Alto risco — adicionar mesmo assim?',
              message: comp.notes.slice(0, 3).join(' ') + '\n\nSe o animal já está no aquário, registre para o app poder monitorar. Se ainda não, resolva os pontos acima primeiro.',
              confirmText: 'Adicionar mesmo assim', danger: true, onConfirm: doAdd
            });
            return;
          }
          doAdd();
        };

        if (existingId) {
          footBox.appendChild(h('button', { class: 'btn', style: { marginTop: '6px' }, onclick: addToTank }, icon('check', 'ic ic-sm'), 'Adicionar ao aquário'));
        } else {
          footBox.appendChild(h('div', { class: 'btn-row', style: { marginTop: '6px' } },
            h('button', {
              class: 'btn sec', onclick: () => {
                if (!sp.n.trim()) { toast('Informe o nome da espécie', 'bad'); return; }
                const id = 'custom_' + uid();
                const now = new Date().toISOString();
                aq.customSpecies = aq.customSpecies || [];
                aq.customSpecies.push(Object.assign({ id, source: 'manual', createdAt: now, updatedAt: now }, sp));
                save({ immediate: true });
                toast(`${sp.n} cadastrada — sem adicionar ao aquário`, 'ok');
                close();
                ctx.refresh();
              }
            }, 'Só cadastrar a espécie'),
            h('button', { class: 'btn', onclick: addToTank }, icon('check', 'ic ic-sm'), 'Adicionar ao aquário')
          ));
        }
      };
      drawForm();
    },
    actions: (close) => h('button', { class: 'btn sec', text: 'Fechar', onclick: () => close() })
  });
}

/* ================= catálogo de espécies disponíveis (suas + base fixa do app) ================= */
export function speciesCatalogView(ctx) {
  const aq = ctx.aq;
  const allCustom = aq.customSpecies || [];
  // uma personalização de espécie da base fixa usa o MESMO id da base (ver specOf) —
  // separa quem é só personalização (mostrar junto da base) de quem é espécie nova de fato.
  const overridesById = Object.fromEntries(allCustom.filter((s) => SPEC[s.id] && s.id !== 'outro').map((s) => [s.id, s]));
  const customNew = allCustom.filter((s) => !SPEC[s.id]);
  const fixed = SPECIES.filter((s) => s.id !== 'outro');
  const el = h('div');

  el.appendChild(h('div', { class: 'note', style: { marginBottom: '12px' } },
    'Todas as espécies disponíveis para cadastrar fauna neste aquário: as que você adicionou (por IA ou manualmente) e a base fixa do app. Toque em qualquer uma para editar — inclusive as da base fixa, que ganham uma personalização só deste aquário.'));

  el.appendChild(h('div', { class: 'sec-title', text: `Cadastradas por você (${customNew.length})` }));
  if (!customNew.length) {
    el.appendChild(h('div', { class: 'card' }, empty('book', 'Nenhuma espécie cadastrada ainda. Use "Cadastrar espécie com IA" ou o cadastro manual na tela de Fauna.')));
  } else {
    const c = h('div', { class: 'card' });
    customNew.forEach((s) => {
      const usedBy = (aq.livestock || []).filter((x) => x.spec === s.id).reduce((sum, x) => sum + (num(x.qty) || 0), 0);
      const g = specGlyph(s);
      const thumb = h('div', { style: { width: '34px', height: '34px', borderRadius: '9px', background: g.color + '22', color: g.color, display: 'grid', placeItems: 'center', flex: '0 0 auto', overflow: 'hidden' } }, icon(g.iconName, 'ic ic-sm'));
      if (s.photo) photoURL(s.photo).then((u) => {
        if (!u) return;
        thumb.innerHTML = '';
        thumb.appendChild(h('img', { src: u, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } }));
        thumb.style.cursor = 'zoom-in';
        thumb.onclick = (e) => { e.stopPropagation(); openImageLightbox(u); };
      });
      c.appendChild(row(s.n,
        `${s.sci ? s.sci + ' · ' : ''}adulto ~${s.adult} cm · ${usedBy ? `${usedBy} na fauna atual` : 'não usada na fauna atual'}`,
        { left: thumb, onClick: () => ctx.nav('fauna/especies/editar/' + s.id) }));
    });
    el.appendChild(c);
  }

  el.appendChild(h('div', { class: 'sec-title', text: `Base fixa do app (${fixed.length})` }));
  const c2 = h('div', { class: 'card' });
  fixed.forEach((s) => {
    const ov = overridesById[s.id];
    const display = ov || s;
    const usedBy = (aq.livestock || []).filter((x) => x.spec === s.id).reduce((sum, x) => sum + (num(x.qty) || 0), 0);
    const g = specGlyph(display);
    const thumb = h('div', { style: { width: '34px', height: '34px', borderRadius: '9px', background: g.color + '22', color: g.color, display: 'grid', placeItems: 'center', flex: '0 0 auto', overflow: 'hidden' } }, icon(g.iconName, 'ic ic-sm'));
    if (display.photo) photoURL(display.photo).then((u) => {
      if (!u) return;
      thumb.innerHTML = '';
      thumb.appendChild(h('img', { src: u, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } }));
      thumb.style.cursor = 'zoom-in';
      thumb.onclick = (e) => { e.stopPropagation(); openImageLightbox(u); };
    });
    c2.appendChild(row(display.n,
      `${display.sci ? display.sci + ' · ' : ''}adulto ~${display.adult} cm · ${usedBy ? `${usedBy} na fauna atual` : 'não usada na fauna atual'}`,
      {
        left: thumb,
        right: ov ? h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, pill('info', 'Personalizada'), icon('chev', 'ic ic-sm')) : null,
        onClick: () => ctx.nav('fauna/especies/editar/' + s.id)
      }));
  });
  el.appendChild(c2);

  return { title: 'Minhas espécies', back: true, el };
}

export function speciesForm(ctx, editId) {
  const aq = ctx.aq;
  const base = SPEC[editId] && editId !== 'outro' ? SPEC[editId] : null;
  const override = (aq.customSpecies || []).find((s) => s.id === editId);
  const source = override || base;
  if (!source) {
    setTimeout(() => ctx.nav('fauna/especies'), 0);
    return { title: 'Espécie', back: true, el: h('div') };
  }
  const isBase = !!base;
  const d = Object.assign({ photo: null }, source, { temp: [...source.temp], ph: [...source.ph] });
  let blob = null;
  const el = h('div');

  if (isBase && !override) {
    el.appendChild(h('div', { class: 'note', style: { marginBottom: '10px' } },
      'Espécie da base fixa do app. Salvar aqui cria uma personalização só para este aquário — os demais aquários continuam usando os dados originais.'));
  }

  const photoSlot = h('div');
  photoSlot.appendChild(photoPicker(null, (b) => { blob = b; }));
  if (d.photo) photoURL(d.photo).then((u) => {
    if (!u) return;
    photoSlot.innerHTML = '';
    photoSlot.appendChild(photoPicker(u, (b) => { blob = b; }));
  });

  el.appendChild(field('Foto de referência', photoSlot, 'Ajuda a reconhecer a espécie — é separada da foto de cada animal cadastrado na Fauna.', true));
  el.appendChild(field('Nome popular', input({ value: d.n, oninput: (e) => { d.n = e.target.value; } })));
  el.appendChild(field('Nome científico', input({ value: d.sci || '', placeholder: 'Opcional', oninput: (e) => { d.sci = e.target.value; } }), null, true));
  el.appendChild(h('div', { class: 'grid2' },
    field('Tamanho adulto (cm)', input({ type: 'number', step: '0.5', min: '0.5', value: String(d.adult), oninput: (e) => { d.adult = num(e.target.value) || 5; } })),
    field('Cardume mínimo', input({ type: 'number', min: '1', value: String(d.grupo), oninput: (e) => { d.grupo = Math.max(1, Math.round(num(e.target.value) || 1)); } }))
  ));
  el.appendChild(field('Zona do aquário', select(SPECIES_ZONA.map((o) => ({ v: o.v, n: o.n, sel: o.v === d.zona })), { onchange: (e) => { d.zona = e.target.value; } })));
  el.appendChild(field('Carga biológica relativa', input({ type: 'number', step: '0.1', min: '0.1', max: '3', value: String(d.bio), oninput: (e) => { d.bio = Math.min(3, Math.max(0.1, num(e.target.value) || 1)); } }), 'Referência: neon ≈ 0.5, coridora ≈ 1, peixe grande ≥ 2.'));
  el.appendChild(h('div', { class: 'grid2' },
    field('Temp. mínima (°C)', input({ type: 'number', step: '0.5', value: String(d.temp[0]), oninput: (e) => { d.temp[0] = num(e.target.value) ?? d.temp[0]; } })),
    field('Temp. máxima (°C)', input({ type: 'number', step: '0.5', value: String(d.temp[1]), oninput: (e) => { d.temp[1] = num(e.target.value) ?? d.temp[1]; } }))
  ));
  el.appendChild(h('div', { class: 'grid2' },
    field('pH mínimo', input({ type: 'number', step: '0.1', value: String(d.ph[0]), oninput: (e) => { d.ph[0] = num(e.target.value) ?? d.ph[0]; } })),
    field('pH máximo', input({ type: 'number', step: '0.1', value: String(d.ph[1]), oninput: (e) => { d.ph[1] = num(e.target.value) ?? d.ph[1]; } }))
  ));
  el.appendChild(field('Risco para camarões', select(SPECIES_CAMARAO.map((o) => ({ v: o.v, n: o.n, sel: o.v === d.camarao })), { onchange: (e) => { d.camarao = e.target.value; } })));
  el.appendChild(field('Risco para plantas', select(SPECIES_PLANTA.map((o) => ({ v: o.v, n: o.n, sel: o.v === d.planta })), { onchange: (e) => { d.planta = e.target.value; } })));
  el.appendChild(field('Convivência com Betta macho', select(SPECIES_BETTA.map((o) => ({ v: o.v, n: o.n, sel: o.v === d.betta })), { onchange: (e) => { d.betta = e.target.value; } })));
  el.appendChild(field('Observações', textarea({ value: d.obs || '', placeholder: 'Cuidados, comportamento, alimentação…', oninput: (e) => { d.obs = e.target.value; } }), null, true));

  el.appendChild(h('button', {
    class: 'btn', onclick: async () => {
      if (!d.n.trim()) { toast('Informe o nome da espécie', 'bad'); return; }
      if (blob) {
        const pid = uid();
        await putPhoto(pid, blob);
        if (d.photo) { forgetPhotoURL(d.photo); await delPhoto(d.photo); }
        d.photo = pid;
      }
      d.updatedAt = new Date().toISOString();
      if (override) {
        Object.assign(override, d);
      } else {
        aq.customSpecies = aq.customSpecies || [];
        aq.customSpecies.push(Object.assign({ createdAt: d.updatedAt }, d, isBase ? { source: 'override' } : {}));
      }
      await save({ immediate: true });
      toast(isBase ? 'Personalização salva' : 'Espécie atualizada', 'ok');
      ctx.nav('fauna/especies');
    }
  }, 'Salvar'));

  const usedBy = (aq.livestock || []).filter((x) => x.spec === editId).reduce((sum, x) => sum + (num(x.qty) || 0), 0);
  if (override) {
    el.appendChild(h('div', { style: { height: '9px' } }));
    el.appendChild(h('button', {
      class: 'btn danger', onclick: () => confirmSheet({
        title: isBase ? 'Restaurar os dados originais desta espécie?' : 'Excluir espécie do catálogo?',
        message: isBase
          ? (usedBy ? `${usedBy} animal(is) na fauna atual usam esta espécie. Os dados técnicos voltam ao padrão da base fixa do app — a espécie continua disponível, só sem a sua personalização.` : 'Os dados técnicos desta espécie voltam ao padrão da base fixa do app.')
          : (usedBy ? `${usedBy} animal(is) na fauna atual usam esta espécie — eles continuam registrados, mas perdem os dados técnicos (voltam ao padrão genérico "Outra espécie"). Considere editar ou remover essa fauna antes.` : 'Nenhum animal da fauna atual usa esta espécie agora.'),
        confirmText: isBase ? 'Restaurar padrão' : 'Excluir', danger: true,
        onConfirm: async () => { await remove('customSpecies', editId); ctx.nav('fauna/especies'); }
      })
    }, icon('trash', 'ic ic-sm'), isBase ? 'Restaurar padrão original' : 'Excluir espécie'));
  }

  return { title: isBase ? 'Personalizar espécie' : 'Editar espécie', back: true, el };
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

  const orderIssues = stockingOrderIssues(aq);
  if (orderIssues.length) {
    el.appendChild(h('div', { class: 'alert warn' }, icon('alert', 'ic'), h('div', { style: { flex: '1' } },
      h('div', { class: 'alert-t', text: '🟡 Ordem do plano em desacordo com a regra do Betta' }),
      h('div', { class: 'alert-d' }, ...orderIssues.map((m) => h('div', { style: { marginTop: '3px' }, text: '• ' + m }))))));
  }

  el.appendChild(h('div', { class: 'sec-title', text: 'Ordem planejada' }));
  if (!aq.stocking.plan.length) el.appendChild(h('div', { class: 'card' }, empty('cal', 'Nenhum lote planejado.')));
  else {
    const c = h('div', { class: 'card' });
    aq.stocking.plan.forEach((p, i) => {
      const sp = specOf(aq, p.spec);
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

    if (aq.stocking.aiJustification) {
      const stale = !aq.stocking.aiOrderIds || aq.stocking.aiOrderIds.length !== aq.stocking.plan.length
        || !aq.stocking.aiOrderIds.every((id) => aq.stocking.plan.some((p) => p.id === id));
      el.appendChild(h('div', { class: 'card', style: { marginTop: '10px' } }, h('div', { class: 'card-pad' },
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' } },
          icon('bulb', 'ic ic-sm'),
          h('div', { style: { fontWeight: '700', fontSize: '13.5px', flex: '1' }, text: 'Por que esta ordem' }),
          h('span', { style: { fontSize: '11.5px', color: 'var(--tx-3)' }, text: relDay(aq.stocking.aiSuggestedAt) })),
        h('div', { class: 'note', text: aq.stocking.aiJustification }),
        stale ? h('div', { class: 'note', style: { marginTop: '6px', color: 'var(--warn)' }, text: '⚠ O plano mudou desde esta sugestão — peça uma nova avaliação para atualizar.' }) : null
      )));
    }
  }

  el.appendChild(h('div', { class: 'btn-row' },
    h('button', {
      class: 'btn', onclick: () => {
        let spec = 'cory', qty = 6;
        sheet({
          title: 'Adicionar lote ao plano',
          body: (b) => {
            b.appendChild(field('Espécie', select(allSpecies(aq).map((s) => ({ v: s.id, n: s.n, sel: s.id === spec })), { onchange: (e) => { spec = e.target.value; qi.value = String(specOf(aq, spec).grupo > 1 ? specOf(aq, spec).grupo : 1); qty = num(qi.value); } })));
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
    }, icon('plus', 'ic ic-sm'), 'Adicionar lote'),
    h('button', { class: 'btn sec', onclick: () => openStockingAIPlan(ctx) }, icon('bulb', 'ic ic-sm'), 'Planejar ordem com IA')
  ));

  el.appendChild(h('div', { class: 'card', style: { marginTop: '14px' } }, h('div', { class: 'card-pad' },
    h('div', { style: { fontWeight: '700', fontSize: '14.5px', marginBottom: '7px' }, text: 'Como o app trata o povoamento' }),
    h('div', { class: 'note' },
      'Nenhum peixe entra com amônia ou nitrito acima de 0. Após cada introdução, registre quantidade, data, comportamento, alimentação e mortalidade — e teste amônia e nitrito em 24–48 h, porque a carga biológica aumentou. ',
      'O Betta é sempre o último. A Neritina depende de aquário maduro com biofilme disponível, não de uma data fixa.'))));

  return { title: 'Plano de povoamento', back: true, el };
}

/* ================= planejar ordem de povoamento com IA ================= */
export function openStockingAIPlan(ctx) {
  const aq = ctx.aq;
  const cfg = state.settings.ai;
  aq.stocking = aq.stocking || { plan: [], intervalDays: 8 };
  const plan = aq.stocking.plan || [];

  return sheet({
    title: 'Planejar ordem com IA',
    big: true,
    body: (b, close) => {
      if (!aiReady(cfg)) {
        b.appendChild(h('div', { class: 'alert warn' }, icon('alert', 'ic'), h('div', { style: { flex: '1' } },
          h('div', { class: 'alert-t', text: 'Nenhuma IA conectada' }),
          h('div', { class: 'alert-d', text: 'Conecte uma IA para pedir uma sugestão de ordem de povoamento.' }))));
        b.appendChild(h('button', {
          class: 'btn', style: { marginTop: '12px' }, onclick: async () => {
            const { openAIConfig } = await import('./consultor.js');
            close();
            openAIConfig(ctx);
          }
        }, icon('sliders', 'ic ic-sm'), 'Configurar IA'));
        return;
      }

      if (plan.length < 2) {
        b.appendChild(h('div', { class: 'note' }, 'Adicione pelo menos 2 lotes ao plano para a IA ter o que reordenar.'));
        return;
      }

      b.appendChild(h('div', { class: 'note', style: { marginBottom: '12px' } },
        'A IA analisa comportamento, sensibilidade e carga biológica de cada lote e sugere uma ordem de introdução, com a justificativa. Nada muda até você aprovar.'));

      const resultBox = h('div');
      b.appendChild(resultBox);

      const askBtn = h('button', {
        class: 'btn', onclick: async (ev) => {
          resultBox.innerHTML = '';
          const btn = ev.currentTarget;
          const orig = btn.textContent;
          btn.disabled = true; btn.textContent = 'Consultando a IA…';
          try {
            const { order, justification } = await planStockingOrderAI(aq, cfg);
            drawResult(order, justification);
          } catch (err) {
            resultBox.appendChild(h('div', { class: 'alert bad' }, icon('alert', 'ic'), h('div', { style: { flex: '1' } },
              h('div', { class: 'alert-t', text: 'Não foi possível sugerir uma ordem' }),
              h('div', { class: 'alert-d', text: err.message }),
              err.raw ? h('details', { style: { marginTop: '8px' } },
                h('summary', { style: { fontSize: '12.5px', color: 'var(--tx-3)', cursor: 'pointer' }, text: 'Ver resposta da IA' }),
                h('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '11.5px', color: 'var(--tx-2)', background: 'var(--card)', padding: '10px', borderRadius: '8px', marginTop: '6px', overflowX: 'auto' }, text: err.raw })) : null)));
          }
          btn.disabled = false; btn.textContent = orig;
        }
      }, icon('bulb', 'ic ic-sm'), 'Pedir sugestão à IA');
      b.appendChild(askBtn);

      function drawResult(order, justification) {
        resultBox.innerHTML = '';
        const byId = Object.fromEntries(plan.map((p) => [p.id, p]));
        const changed = order.some((id, i) => plan[i]?.id !== id);

        resultBox.appendChild(h('div', { class: 'card' },
          cardHead('cal', changed ? 'Nova ordem sugerida' : 'A IA manteve a ordem atual', null),
          h('div', { class: 'card-body' },
            ...order.map((id, i) => {
              const p = byId[id];
              const sp = specOf(aq, p.spec);
              return h('div', { style: { display: 'flex', gap: '9px', alignItems: 'center', padding: '7px 0', borderTop: i ? '1px solid var(--line-soft)' : 'none' } },
                h('div', { style: { width: '22px', height: '22px', borderRadius: '50%', background: 'var(--card-2)', color: 'var(--accent)', display: 'grid', placeItems: 'center', fontSize: '12px', fontWeight: '700', flex: '0 0 auto' } }, String(i + 1)),
                h('span', { style: { fontSize: '14px' }, text: `${p.qty}× ${sp.n}` }));
            }),
            h('div', { class: 'note', style: { marginTop: '10px' }, text: justification })
          )));

        resultBox.appendChild(h('div', { class: 'btn-row', style: { marginTop: '10px' } },
          h('button', { class: 'btn sec', text: 'Manter ordem atual', onclick: () => close() }),
          h('button', {
            class: 'btn', text: 'Aplicar esta ordem', onclick: () => {
              aq.stocking.plan = order.map((id) => byId[id]);
              aq.stocking.aiJustification = justification;
              aq.stocking.aiOrderIds = order.slice();
              aq.stocking.aiSuggestedAt = new Date().toISOString();
              save({ immediate: true });
              toast('Ordem atualizada', 'ok');
              close();
              ctx.refresh();
            }
          })
        ));
      }
    },
    actions: (close) => h('button', { class: 'btn sec', text: 'Fechar', onclick: () => close() })
  });
}
