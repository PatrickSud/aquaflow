/* engine.js — motor de decisão: status, tendências, ciclagem, liberação de peixes,
   carga biológica, compatibilidade, cálculos de TPA/dosagem e linha do tempo.

   REGRAS INEGOCIÁVEIS aplicadas aqui:
   - dosagens e capacidade usam SEMPRE o volume ÚTIL informado (padrão 80 L), nunca o bruto;
   - amônia > 0 ou nitrito > 0  =>  nunca liberar peixe;
   - uma única medição nunca confirma estabilidade;
   - nunca inventar dado ausente: se falta, pede o teste. */

import { PARAMS, P, CORE, SPEC, SPECIES, PRODUCT } from './model.js';

/* ---------------- utilitários ---------------- */
export const dayMs = 86400000;
export const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

export function daysBetween(a, b) {
  const d = (new Date(b) - new Date(a)) / dayMs;
  return Math.floor(d);
}
export function daysSince(iso) { return iso ? Math.max(0, Math.floor((Date.now() - new Date(iso)) / dayMs)) : null; }
export function ageDays(aq) { return Math.max(0, Math.floor((Date.now() - new Date(aq.setupDate + 'T00:00:00')) / dayMs)); }

export function fmtNum(v, dec = 2) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const s = n.toFixed(dec).replace(/\.?0+$/, '');
  return (s === '' || s === '-' ? '0' : s).replace('.', ',');
}
export function fmtDate(iso, withTime = true) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, '0');
  const base = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  return withTime ? `${base} ${p(d.getHours())}:${p(d.getMinutes())}` : base;
}
export function relDay(iso) {
  const d = daysSince(iso);
  if (d === null) return '—';
  if (d === 0) return 'hoje';
  if (d === 1) return 'ontem';
  return `há ${d} dias`;
}

/* ---------------- leitura de medições ---------------- */
/** Última medição registrada de um parâmetro. */
export function latest(aq, k) {
  for (const t of aq.tests || []) {
    const v = num(t[k]);
    if (v !== null) return { v, at: t.at, test: t };
  }
  return null;
}
/** N últimas medições (mais recente primeiro). */
export function lastN(aq, k, n = 3) {
  const out = [];
  for (const t of aq.tests || []) {
    const v = num(t[k]);
    if (v !== null) { out.push({ v, at: t.at }); if (out.length >= n) break; }
  }
  return out;
}
/** Série cronológica crescente para gráficos. */
export function series(aq, k, days = 0) {
  const cut = days ? Date.now() - days * dayMs : 0;
  return (aq.tests || [])
    .filter((t) => num(t[k]) !== null && (!cut || new Date(t.at) >= cut))
    .map((t) => ({ t: new Date(t.at).getTime(), v: num(t[k]) }))
    .sort((a, b) => a.t - b.t);
}

/** Eventos de TPA e dosagem no período, para marcar nos gráficos de parâmetro
 *  (ex.: ver visualmente que o nitrato caiu porque houve uma TPA naquele dia). */
export function chartEvents(aq, days = 0) {
  const cut = days ? Date.now() - days * dayMs : 0;
  const tpas = (aq.tpas || [])
    .filter((t) => !cut || new Date(t.at) >= cut)
    .map((t) => ({ t: new Date(t.at).getTime(), label: `TPA ${fmtNum(t.pct, 0)}%` }));
  const doses = (aq.dosings || [])
    .filter((d) => !cut || new Date(d.at) >= cut)
    .map((d) => ({ t: new Date(d.at).getTime(), label: PRODUCT[d.prod]?.name || 'Dosagem' }));
  return { tpas, doses };
}

/* ---------------- status por parâmetro ---------------- */
export function target(aq, k) {
  const d = P[k] || {};
  const t = (aq.targets || {})[k] || {};
  return { min: t.min ?? d.min, max: t.max ?? d.max };
}

/** Status de um valor: ok | warn | bad. Usa a meta do usuário; zonas do modelo como reforço. */
export function statusOf(aq, k, v) {
  if (v === null || v === undefined) return null;
  const def = P[k];
  if (!def) return null;
  const { min, max } = target(aq, k);

  // parâmetros críticos: qualquer coisa acima do máximo é crítico
  if (def.crit) return v > max ? 'bad' : 'ok';

  if (v >= min && v <= max) return 'ok';

  // fora da meta: gravidade proporcional ao afastamento
  const span = Math.max(max - min, Math.abs(max) * 0.2, 0.5);
  const off = v > max ? v - max : min - v;
  if (off <= span * 0.5) return 'warn';
  return 'bad';
}

export function statusLabel(s) {
  return s === 'ok' ? 'Normal' : s === 'warn' ? 'Atenção' : s === 'bad' ? 'Crítico' : 'Sem dados';
}

/** Tendência de um parâmetro comparando as duas últimas medições. */
export function trend(aq, k) {
  const l = lastN(aq, k, 3);
  if (l.length < 2) return null;
  const [a, b] = l;                        // a = mais recente
  const diff = a.v - b.v;
  const def = P[k] || {};
  const eps = Math.max((def.step || 0.01) * 0.9, Math.abs(b.v) * 0.03);
  const dir = Math.abs(diff) <= eps ? 'flat' : diff > 0 ? 'up' : 'down';
  return { dir, diff, from: b, to: a, days: Math.max(0, daysBetween(b.at, a.at)) };
}

export function trendText(k, tr) {
  if (!tr) return '';
  const def = P[k] || {};
  const d = fmtNum(Math.abs(tr.diff), def.dec ?? 2);
  if (tr.dir === 'flat') return 'estável';
  return (tr.dir === 'up' ? 'subindo' : 'caindo') + ` ${d}${def.u ? ' ' + def.u : ''}`;
}

/* ---------------- qualidade geral da água ---------------- */
export function waterQuality(aq) {
  const parts = [];
  let worst = null;
  let have = 0;
  for (const k of CORE) {
    const l = latest(aq, k);
    if (!l) { parts.push({ k, s: null }); continue; }
    have++;
    const s = statusOf(aq, k, l.v);
    parts.push({ k, s, v: l.v, at: l.at });
    if (s === 'bad') worst = 'bad';
    else if (s === 'warn' && worst !== 'bad') worst = 'warn';
    else if (s === 'ok' && !worst) worst = 'ok';
  }
  const stale = (() => {
    const l = aq.tests?.[0];
    return l ? daysSince(l.at) : null;
  })();
  return { status: have ? worst : null, parts, have, missing: CORE.filter((k) => !latest(aq, k)), staleDays: stale };
}

/* ---------------- ciclagem ---------------- */
/** Detecta a fase pela evidência disponível, sem chutar. */
export function cyclingStatus(aq) {
  const c = aq.cycling || {};
  const start = c.start || aq.setupDate;
  const day = Math.max(1, Math.floor((Date.now() - new Date(start + 'T00:00:00')) / dayMs) + 1);

  const nh3 = lastN(aq, 'nh3', 6);
  const no2 = lastN(aq, 'no2', 6);
  const no3 = lastN(aq, 'no3', 6);

  const zeros = zeroStreak(aq);
  const sawPeak = (aq.tests || []).some((t) => (num(t.nh3) ?? 0) > 0 || (num(t.no2) ?? 0) > 0);

  let phase = 1, label = 'Fase 1 — amônia acumulando', desc = '', s = 'warn';

  if (!aq.tests?.length) {
    return { day, phase: 1, label: 'Fase 1 — sem medições', desc: 'Registre amônia, nitrito, nitrato, pH e temperatura para o sistema poder acompanhar o ciclo.', s: null, zeros, sawPeak, done: false };
  }

  const a = nh3[0]?.v ?? null;
  const n = no2[0]?.v ?? null;
  const t3 = no3[0]?.v ?? null;

  if (a === 0 && n === 0) {
    if (zeros.count >= 3 && zeros.spanDays >= 5) { phase = 4; label = 'Ciclo aparentemente concluído'; s = 'ok'; desc = `${zeros.count} medições consecutivas com amônia e nitrito em 0, ao longo de ${zeros.spanDays} dias.`; }
    else { phase = 4; label = 'Fase 4 — confirmando o fim do ciclo'; s = 'warn'; desc = `Amônia e nitrito em 0, mas ainda são ${zeros.count} medição(ões) em ${zeros.spanDays} dia(s). Uma única leitura não confirma estabilidade.`; }
  } else if (n !== null && n > 0) {
    const tn = trend(aq, 'no2');
    if (tn && tn.dir === 'down') { phase = 3; label = 'Fase 3 — nitrito caindo'; desc = 'As bactérias que consomem nitrito estão se estabelecendo.'; }
    else { phase = 2; label = 'Fase 2 — nitrito presente'; desc = 'Momento mais tóxico do ciclo. Nenhum peixe entra agora.'; s = 'bad'; }
  } else if (a !== null && a > 0) {
    const ta = trend(aq, 'nh3');
    if (ta && ta.dir === 'down') { phase = 2; label = 'Fase 2 — amônia caindo'; desc = 'Amônia começando a ser processada. O nitrito deve aparecer em seguida — teste com frequência.'; }
    else { phase = 1; label = 'Fase 1 — amônia acumulando'; desc = 'As bactérias nitrificantes estão colonizando as mídias.'; }
  } else if (t3 !== null && t3 > 0) {
    phase = 3; label = 'Fase 3 — nitrato aparecendo'; desc = 'Sinal de que a nitrificação está funcionando.';
  }

  const done = phase === 4 && zeros.count >= 3 && zeros.spanDays >= 5;
  return { day, phase, label, desc, s, zeros, sawPeak, done };
}

/** Quantas medições consecutivas mais recentes têm NH3 = 0 e NO2 = 0. */
export function zeroStreak(aq) {
  let count = 0, first = null, last = null;
  for (const t of aq.tests || []) {
    const a = num(t.nh3), n = num(t.no2);
    if (a === null && n === null) continue;      // teste sem esses parâmetros: ignora
    if (a === 0 && n === 0) {
      count++;
      if (!last) last = t.at;
      first = t.at;
    } else break;
  }
  const spanDays = first && last ? Math.max(0, daysBetween(first, last)) : 0;
  return { count, first, last, spanDays };
}

/* ---------------- liberação de peixes (portão de segurança) ---------------- */
export function canAddFish(aq) {
  const R = { level: 'bad', title: '', reasons: [], missing: [], question: '', next: [] };
  const nh3 = latest(aq, 'nh3');
  const no2 = latest(aq, 'no2');
  const no3 = latest(aq, 'no3');
  const ph = latest(aq, 'ph');
  const tp = latest(aq, 'temp');

  if (!nh3) R.missing.push('amônia');
  if (!no2) R.missing.push('nitrito');
  if (!no3) R.missing.push('nitrato');
  if (!ph) R.missing.push('pH');
  if (!tp) R.missing.push('temperatura');

  // As regras inegociáveis vêm ANTES da checagem de dados faltantes: se a amônia
  // ou o nitrito já estão acima de 0, esse é o motivo do bloqueio e é isso que o
  // usuário precisa ouvir — não um genérico "faltam dados".
  if (nh3 && nh3.v > 0) R.reasons.push(`Amônia em ${fmtNum(nh3.v, 3)} ppm (medida ${relDay(nh3.at)}). Enquanto não estiver exatamente 0, nenhum peixe entra.`);
  if (no2 && no2.v > 0) R.reasons.push(`Nitrito em ${fmtNum(no2.v, 3)} ppm (medido ${relDay(no2.at)}). Enquanto não estiver exatamente 0, nenhum peixe entra.`);
  if (R.reasons.length) {
    R.level = 'bad';
    R.title = 'Não recomendado — ciclo em andamento';
    if (R.missing.length) R.reasons.push(`Também faltam medições de: ${R.missing.join(', ')}.`);
    R.next.push('Manter a fonte de amônia e as bactérias, sem trocar as mídias biológicas.');
    R.next.push('Testar amônia e nitrito a cada 1–2 dias.');
    R.question = 'Qual o valor de amônia e nitrito de hoje, e como estão em relação à medição anterior?';
    return R;
  }

  if (R.missing.length) {
    R.level = 'bad';
    R.title = 'Não há dados suficientes para recomendar isso com segurança';
    R.reasons.push(`Faltam medições de: ${R.missing.join(', ')}.`);
    R.next.push('Registrar um teste completo (amônia, nitrito, nitrato, pH e temperatura).');
    R.question = 'Qual foi a última leitura de amônia, nitrito, nitrato, pH e temperatura, e em que data foram feitas?';
    return R;
  }

  const stale = daysSince(aq.tests[0].at);
  if (stale > 3) {
    R.level = 'bad';
    R.title = 'Dados desatualizados — refaça os testes antes de decidir';
    R.reasons.push(`A última medição foi ${relDay(aq.tests[0].at)} (${stale} dias). Para decidir povoamento, use dados de até 3 dias.`);
    R.next.push('Refazer amônia e nitrito hoje.');
    R.question = 'Consegue medir amônia e nitrito hoje para atualizar a base de decisão?';
    return R;
  }

  // regras inegociáveis já foram checadas acima; aqui amônia e nitrito estão em 0
  const z = zeroStreak(aq);
  const cyc = cyclingStatus(aq);

  if (z.count < 3 || z.spanDays < 5) {
    R.level = 'warn';
    R.title = 'Condicional — falta confirmar estabilidade';
    R.reasons.push(`Amônia e nitrito estão em 0, mas há ${z.count} medição(ões) nesse estado em ${z.spanDays} dia(s). Uma leitura isolada não comprova ciclo concluído.`);
    R.next.push(`Repetir o teste até somar 3 medições em 0/0 ao longo de pelo menos 5 dias (faltam ${Math.max(0, 3 - z.count)}).`);
    R.question = 'Você pode repetir amônia e nitrito em 48 h para confirmar a sequência de zeros?';
    return R;
  }

  if (!cyc.sawPeak) {
    R.level = 'warn';
    R.title = 'Condicional — sem histórico do pico registrado';
    R.reasons.push('Nunca foi registrada amônia ou nitrito acima de 0 neste app, então não há como comprovar que o ciclo realmente aconteceu — apenas que agora está em 0.');
    R.next.push('Se o ciclo ocorreu antes de começar a registrar, faça um teste de carga: alimente normalmente por 3 dias e confirme que amônia e nitrito continuam em 0.');
    R.question = 'O pico de amônia e nitrito foi observado antes de você começar a registrar aqui? Em que datas aproximadamente?';
    return R;
  }

  // condições secundárias
  const warns = [];
  if (no3.v > 40) warns.push(`Nitrato em ${fmtNum(no3.v, 1)} ppm (acima de 40). Faça TPA antes de introduzir.`);
  else if (no3.v >= 20) warns.push(`Nitrato em ${fmtNum(no3.v, 1)} ppm (zona de atenção). Considere TPA antes.`);
  const st = statusOf(aq, 'temp', tp.v);
  if (st !== 'ok') warns.push(`Temperatura em ${fmtNum(tp.v, 1)} °C, fora da faixa alvo (${fmtNum(target(aq, 'temp').min, 1)}–${fmtNum(target(aq, 'temp').max, 1)} °C). Estabilize antes.`);
  const sp = statusOf(aq, 'ph', ph.v);
  if (sp !== 'ok') warns.push(`pH em ${fmtNum(ph.v, 2)}, fora da faixa alvo. Verifique estabilidade antes de introduzir.`);

  const bl = bioload(aq);
  if (bl.pct >= 100) warns.push(`A carga biológica estimada já está em ${bl.pct}% da capacidade para ${aq.volUtil} L úteis.`);

  if (warns.length) {
    R.level = 'warn';
    R.title = 'Liberado com condições';
    R.reasons.push(`Ciclo confirmado: ${z.count} medições em 0/0 ao longo de ${z.spanDays} dias.`);
    R.reasons.push(...warns);
    R.next.push('Resolver os pontos acima, introduzir um lote pequeno por vez e testar amônia/nitrito em 24–48 h após cada entrada.');
    R.question = 'Qual espécie e quantidade você pretende introduzir primeiro, e o nitrato já está abaixo de 20 ppm?';
    return R;
  }

  R.level = 'ok';
  R.title = 'Liberado para iniciar o povoamento gradual';
  R.reasons.push(`Amônia 0 e nitrito 0 confirmados em ${z.count} medições ao longo de ${z.spanDays} dias.`);
  R.reasons.push(`Nitrato ${fmtNum(no3.v, 1)} ppm, pH ${fmtNum(ph.v, 2)}, temperatura ${fmtNum(tp.v, 1)} °C — dentro das faixas definidas.`);
  R.next.push('Entrar com um lote pequeno (o primeiro grupo do plano de povoamento).');
  R.next.push('Testar amônia e nitrito 24–48 h após a introdução e aguardar o intervalo antes do próximo lote.');
  R.question = 'Qual é o primeiro lote que você vai introduzir e a água nova já está com a mesma temperatura do aquário?';
  return R;
}

/* ---------------- carga biológica ---------------- */
/** Capacidade estimada em "unidades de carga" para o volume útil.
 *  Referência conservadora para plantado comunitário: ~1 unidade / 10 L úteis. */
export function bioload(aq) {
  const vol = num(aq.volUtil) || 0;
  const capacity = vol / 10;
  let used = 0;
  const items = [];
  for (const it of aq.livestock || []) {
    if (it.status === 'obito' || it.status === 'removido') continue;
    const sp = SPEC[it.spec] || SPEC.outro;
    const b = (it.bio ?? sp.bio) * (num(it.qty) || 0);
    used += b;
    items.push({ it, sp, b });
  }
  const pct = capacity > 0 ? Math.round((used / capacity) * 100) : 0;
  return { used: Math.round(used * 100) / 100, capacity: Math.round(capacity * 10) / 10, pct, items, vol };
}

export function bioStatus(pct) { return pct < 70 ? 'ok' : pct <= 100 ? 'warn' : 'bad'; }

/* ---------------- compatibilidade ---------------- */
export function compatibility(aq, specId, qty = 1) {
  const sp = SPEC[specId] || SPEC.outro;
  const notes = [];
  let level = 'ok';
  const bump = (l) => { if (l === 'bad' || level === 'bad') level = 'bad'; else if (l === 'warn') level = 'warn'; };

  const vol = num(aq.volUtil) || 0;
  const live = (aq.livestock || []).filter((x) => x.status !== 'obito' && x.status !== 'removido');
  const hasBetta = live.some((x) => x.spec === 'betta');
  const hasShrimp = live.some((x) => (SPEC[x.spec] || {}).camarao === 'self');

  // volume
  const minVol = Math.max(20, sp.adult * 6);
  if (vol < minVol) { notes.push(`Espécie chega a ${sp.adult} cm; ${vol} L úteis é apertado para ela.`); bump('bad'); }

  // cardume
  if (sp.grupo > 1 && qty < sp.grupo) {
    notes.push(`Precisa de grupo: mínimo recomendado ${sp.grupo} indivíduos. Com ${qty}, o risco de estresse é alto.`);
    bump('warn');
  }

  // faixas de água medidas
  const ph = latest(aq, 'ph'), tp = latest(aq, 'temp');
  if (ph) {
    if (ph.v < sp.ph[0] || ph.v > sp.ph[1]) { notes.push(`pH atual ${fmtNum(ph.v, 2)} está fora da faixa da espécie (${sp.ph[0]}–${sp.ph[1]}).`); bump('warn'); }
  } else notes.push('pH não medido recentemente — não é possível avaliar adequação química.');
  if (tp) {
    if (tp.v < sp.temp[0] || tp.v > sp.temp[1]) { notes.push(`Temperatura atual ${fmtNum(tp.v, 1)} °C fora da faixa da espécie (${sp.temp[0]}–${sp.temp[1]} °C).`); bump('warn'); }
  } else notes.push('Temperatura não medida recentemente.');

  // betta
  if (specId === 'betta') {
    notes.push('Betta exige fluxo brando, tampa sempre fechada e nenhuma decoração com rebarba.');
    notes.push('Deve ser o último peixe a entrar no comunitário.');
    const provoc = live.filter((x) => (SPEC[x.spec] || {}).betta === 'risco');
    if (provoc.length) { notes.push(`Já há espécie(s) de risco para o Betta: ${provoc.map((x) => (SPEC[x.spec] || {}).n).join(', ')}.`); bump('bad'); }
    if (hasShrimp) { notes.push('Há camarões no aquário: o Betta costuma predar filhotes.'); bump('warn'); }
  } else if (hasBetta) {
    if (sp.betta === 'risco') { notes.push('Alto risco de perseguição/mordida de nadadeiras com o Betta macho presente.'); bump('bad'); }
    else if (sp.betta === 'atencao') { notes.push('Convivência com Betta possível, mas exige espaço, esconderijos e observação nos primeiros dias.'); bump('warn'); }
    if (sp.zona === 'superfície') { notes.push('Ocupa a mesma faixa d\'água do Betta (superfície) — aumenta o atrito.'); bump('warn'); }
  }

  // camarões
  if (sp.camarao === 'self') {
    const preds = live.filter((x) => ['alto', 'medio'].includes((SPEC[x.spec] || {}).camarao));
    if (preds.length) { notes.push(`Risco de predação por: ${preds.map((x) => (SPEC[x.spec] || {}).n).join(', ')}. Só com muitos esconderijos e musgo.`); bump(preds.some((x) => (SPEC[x.spec] || {}).camarao === 'alto') ? 'bad' : 'warn'); }
  }

  // neritina precisa de maturidade
  if (specId === 'neritina' || specId === 'otocinclus') {
    const age = ageDays(aq);
    if (age < 45) { notes.push(`Aquário com ${age} dias. Essa espécie depende de biofilme/algas de aquário maduro — o alimento natural disponível pesa mais que a data.`); bump('warn'); }
  }

  // carga
  const bl = bioload(aq);
  const after = bl.used + sp.bio * qty;
  const pctAfter = bl.capacity ? Math.round((after / bl.capacity) * 100) : 0;
  if (pctAfter > 100) { notes.push(`A carga estimada iria a ${pctAfter}% da capacidade de ${vol} L úteis.`); bump('bad'); }
  else if (pctAfter > 80) { notes.push(`A carga estimada iria a ${pctAfter}% da capacidade — margem apertada.`); bump('warn'); }

  // portão do ciclo
  const gate = canAddFish(aq);
  if (gate.level === 'bad') { notes.unshift(gate.title + ': ' + gate.reasons[0]); level = 'bad'; }

  if (sp.obs) notes.push(sp.obs);

  return { level, notes, pctAfter, sp };
}

export const riskLabel = (l) => (l === 'ok' ? 'Baixo risco' : l === 'warn' ? 'Risco moderado' : 'Alto risco');

/* ---------------- cálculos ---------------- */
export function tpaCalc(aq, pct) {
  const vol = num(aq.volUtil) || 0;
  const liters = Math.round((vol * pct) / 100 * 10) / 10;
  return { vol, pct, liters, prime: primeDose(liters) };
}

/** Dose de Prime para um volume de ÁGUA NOVA (rótulo: 5 mL / 200 L). */
export function primeDose(liters, mult = 1) {
  const p = PRODUCT.prime;
  const ml = (num(liters) || 0) * p.doseMlPerL * mult;
  return { ml: Math.round(ml * 100) / 100, drops: Math.round(ml * 20), label: p.label, mult };
}

/** Dose de Stability para o volume TOTAL útil. */
export function stabilityDose(aq, first = false) {
  const p = PRODUCT.stability;
  const vol = num(aq.volUtil) || 0;
  const ml = vol * (first ? p.firstDoseMlPerL : p.doseMlPerL);
  const user = num(aq.protocols?.stabilityMl);
  return { ml: Math.round(ml * 10) / 10, label: p.label, user };
}

/** Checagem de conflito de produtos antes de registrar uma dosagem. */
export function productGuard(aq, prodId) {
  const p = PRODUCT[prodId];
  const out = { level: 'ok', msgs: [] };
  if (!p) return out;

  const recent = (aq.dosings || []).filter((d) => daysSince(d.at) <= 2);
  for (const c of p.conflicts || []) {
    if (recent.some((d) => d.prod === c)) {
      out.level = 'bad';
      out.msgs.push(`${p.name} não pode ser misturado com ${PRODUCT[c]?.name || c} — houve aplicação nas últimas 48 h.`);
    }
  }
  if (p.warn) { if (out.level !== 'bad') out.level = 'warn'; out.msgs.push(p.warn); }

  if ((p.blockIf || []).includes('cycling')) {
    const cyc = cyclingStatus(aq);
    if (!cyc.done) { out.level = 'bad'; out.msgs.push('O ciclo ainda não foi confirmado como concluído. Este produto não deve ser usado durante a ciclagem.'); }
    const live = (aq.livestock || []).filter((x) => x.status !== 'obito' && x.status !== 'removido');
    if (live.length > 1) { out.level = 'bad'; out.msgs.push('Este é um aquário comunitário. Medicamento aqui só com diagnóstico e, de preferência, em aquário hospitalar.'); }
  }
  return out;
}

/* ---------------- TPA programada ----------------
   O calendário LEMBRA; os parâmetros DECIDEM. Nunca o contrário.
   Uma tarefa "trocar água toda semana" seria exatamente o que a regra proíbe,
   então o que vence no calendário é a AVALIAÇÃO, não a troca. */
export function tpaDue(aq) {
  const plan = Object.assign({ on: true, every: 10, pct: 20 }, aq.tpaPlan || {});
  const last = (aq.tpas || [])[0];
  const lastAt = last ? last.at : null;
  const since = lastAt ? daysSince(lastAt) : null;
  const days = since === null ? null : plan.every - since;
  return {
    plan,
    lastAt,
    daysSince: since,
    due: !plan.on ? false : since === null ? true : since >= plan.every,
    days,
    label: !plan.on ? 'programa desligado'
      : since === null ? 'nunca registrada'
        : since >= plan.every ? 'vencida' : days === 1 ? 'amanhã' : `em ${days} dias`
  };
}

/** Veredito de TPA a partir dos dados — a mesma lógica que o Consultor usa. */
export function tpaVerdict(aq) {
  const no3 = latest(aq, 'no3'), nh3 = latest(aq, 'nh3'), no2 = latest(aq, 'no2');
  const cyc = cyclingStatus(aq);
  const live = (aq.livestock || []).filter((x) => x.status !== 'obito' && x.status !== 'removido');
  const R = { level: 'warn', title: '', reasons: [], missing: [] };

  if (!no3) R.missing.push('nitrato');
  if (!nh3) R.missing.push('amônia');
  if (!no2) R.missing.push('nitrito');
  if (R.missing.length) {
    R.level = 'bad';
    R.title = 'Não há dados suficientes para decidir';
    R.reasons.push(`Faltam medições de: ${R.missing.join(', ')}. Não recomendo TPA só porque venceu o prazo.`);
    return R;
  }

  const stale = daysSince(aq.tests[0].at);
  if (stale > 4) {
    R.level = 'bad';
    R.title = 'Meça antes de trocar';
    R.reasons.push(`A última medição foi ${relDay(aq.tests[0].at)}. Teste nitrato, amônia e nitrito hoje e a decisão sai na hora.`);
    return R;
  }

  if (!cyc.done && (nh3.v > 0 || no2.v > 0)) {
    if (live.length) {
      R.level = 'ok';
      R.title = 'TPA de socorro indicada';
      R.reasons.push(`Há fauna no aquário com o ciclo incompleto (amônia ${fmtNum(nh3.v, 3)} / nitrito ${fmtNum(no2.v, 3)} ppm). Aqui a troca protege os animais e vem antes de preservar o ciclo.`);
      return R;
    }
    R.level = 'bad';
    R.title = 'Não trocar agora';
    R.reasons.push(`O aquário está ciclando sem peixes (amônia ${fmtNum(nh3.v, 3)} / nitrito ${fmtNum(no2.v, 3)} ppm). Trocar água agora dilui a fonte de amônia e atrasa a colonização das bactérias.`);
    return R;
  }

  if (no3.v > 40) {
    R.level = 'ok';
    R.title = 'TPA indicada';
    R.reasons.push(`Nitrato em ${fmtNum(no3.v, 1)} ppm, acima de 40.`);
  } else if (no3.v >= 20) {
    R.level = 'warn';
    R.title = 'TPA opcional';
    R.reasons.push(`Nitrato em ${fmtNum(no3.v, 1)} ppm, zona de atenção (20–40). Trocar antecipa; esperar também é defensável.`);
  } else {
    R.level = 'warn';
    R.title = 'Sem motivo de nitrato para trocar';
    R.reasons.push(`Nitrato em ${fmtNum(no3.v, 1)} ppm, abaixo de 20. Se for trocar, que seja por outro motivo — sifão do fundo, reposição de minerais ou algo observado.`);
  }

  const tp = latest(aq, 'temp');
  if (tp) R.reasons.push(`A água nova precisa entrar próxima de ${fmtNum(tp.v, 1)} °C e já condicionada.`);
  return R;
}

/** Passo a passo de COMO fazer, com os números deste aquário. */
export function tpaSteps(aq, pct) {
  const p = pct ?? (aq.tpaPlan?.pct ?? 20);
  const c = tpaCalc(aq, p);
  const tp = latest(aq, 'temp');
  return [
    `Separe ${fmtNum(c.liters, 1)} L de água nova — ${p}% dos ${fmtNum(aq.volUtil, 0)} L úteis.`,
    `Condicione a água nova com ${fmtNum(c.prime.ml, 2)} mL de Prime (cerca de ${c.prime.drops} gotas) e aguarde alguns minutos.`,
    `Iguale a temperatura da água nova à do aquário${tp ? ` (hoje ${fmtNum(tp.v, 1)} °C)` : ''}. Diferença brusca estressa mais que a própria troca.`,
    'Desligue o termostato e o filtro antes de baixar o nível.',
    `Retire ${fmtNum(c.liters, 1)} L sifonando o fundo, onde a matéria orgânica acumula. Não mexa nas mídias biológicas.`,
    'Reponha devagar, sem jato direto no substrato nem nas plantas.',
    'Religue filtro e termostato e confira se o fluxo voltou brando.',
    'Registre a TPA aqui no app — é o que alimenta o histórico e o próximo vencimento.'
  ];
}

/** A cadência de dosagem que está valendo (protocolo Stability). */
export function doseDue(aq) {
  const prot = aq.protocols || {};
  const cyc = cyclingStatus(aq);
  if (!prot.stabilityDays) return { active: false, done: false, label: 'sem protocolo definido' };
  const active = cyc.day <= prot.stabilityDays;
  const todayDone = (aq.dosings || []).some((d) => d.prod === 'stability' && sameDay(d.at));
  return {
    active,
    day: cyc.day,
    total: prot.stabilityDays,
    ml: prot.stabilityMl || stabilityDose(aq).ml,
    done: todayDone,
    label: !active ? 'protocolo concluído' : todayDone ? 'aplicado hoje' : `dia ${cyc.day} de ${prot.stabilityDays} — pendente`
  };
}

export function sameDay(iso, ref = new Date()) {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

/* ---------------- alertas ---------------- */
/** Assinatura estável de um alerta (título + descrição). Usada para lembrar
 *  quais o usuário já fechou no painel — muda sozinha quando o texto muda
 *  (nova medição, data diferente etc.), então um alerta fechado "hoje" volta
 *  a aparecer se a mesma situação ainda existir depois. */
export function alertSig(a) {
  return `${a.t}::${a.d || ''}`;
}

export function alerts(aq) {
  const out = [];
  const add = (s, t, d) => out.push({ s, t, d });
  const wq = waterQuality(aq);

  if (!aq.tests?.length) {
    add('info', 'Nenhuma medição registrada', 'O sistema não consegue avaliar nada sem dados. Registre amônia, nitrito, nitrato, pH e temperatura.');
    return out;
  }

  // críticos
  for (const k of CORE) {
    const l = latest(aq, k);
    if (!l) continue;
    const s = statusOf(aq, k, l.v);
    const def = P[k];
    const tg = target(aq, k);
    if (s === 'bad' || s === 'warn') {
      const dir = l.v > tg.max ? 'acima' : 'abaixo';
      let d = `${fmtNum(l.v, def.dec)}${def.u ? ' ' + def.u : ''} — ${dir} da faixa alvo (${fmtNum(tg.min, def.dec)}–${fmtNum(tg.max, def.dec)}${def.u ? ' ' + def.u : ''}). Medido ${relDay(l.at)}.`;
      if (k === 'nh3' || k === 'no2') d += ' Nenhum peixe entra enquanto não estiver em 0.';
      if (k === 'no3' && l.v > 40) d += ' Indicada TPA.';
      add(s, def.n, d);
    }
  }

  // cloro
  const cl = latest(aq, 'cl');
  if (cl && cl.v > 0) add('bad', 'Cloro detectado', `${fmtNum(cl.v, 2)} ppm. Condicione a água antes de qualquer reposição e verifique a dose de Prime usada.`);

  // dados velhos
  if (wq.staleDays !== null && wq.staleDays > 7) {
    add('warn', 'Medições desatualizadas', `A última medição foi ${relDay(aq.tests[0].at)}. Durante a ciclagem, teste a cada 1–2 dias.`);
  }

  // ciclagem
  const cyc = cyclingStatus(aq);
  if (!cyc.done && (aq.livestock || []).some((x) => x.status !== 'obito' && x.status !== 'removido')) {
    add('bad', 'Fauna presente com ciclo não confirmado', 'Há animais registrados antes da confirmação do ciclo. Monitore amônia e nitrito diariamente e reduza a alimentação.');
  }
  if (cyc.done && aq.cycling?.active && !aq.cycling?.done) {
    add('ok', 'Ciclo aparentemente concluído', `${cyc.zeros.count} medições em 0/0 ao longo de ${cyc.zeros.spanDays} dias. Você pode marcar o ciclo como concluído na tela de Ciclagem.`);
  }

  // protocolo stability
  const prot = aq.protocols || {};
  if (prot.stabilityDays) {
    const doses = (aq.dosings || []).filter((d) => d.prod === 'stability');
    const dayN = cyc.day;
    if (dayN <= prot.stabilityDays) {
      const todayDone = doses.some((d) => new Date(d.at).toDateString() === new Date().toDateString());
      if (!todayDone) add('info', 'Stability de hoje pendente', `Protocolo em andamento (dia ${dayN} de ${prot.stabilityDays}): ${prot.stabilityMl || 6} mL sobre as mídias biológicas do filtro.`);
    }
  }

  // troca do refil mecânico
  if (prot.filterSwapDay) {
    const age = ageDays(aq);
    if (age >= prot.filterSwapDay) {
      add('info', 'Rever filtragem mecânica', `O aquário tem ${age} dias. Plano previsto: retirar o refil mecânico saturado, PRESERVAR as mídias biológicas e passar a usar perlon solto na entrada. Nunca substituir as mídias biológicas por completo.`);
    }
  }

  // TPA programada vencida — o lembrete vem SEMPRE acompanhado do veredito,
  // nunca como uma ordem de trocar água por prazo
  const tp = tpaDue(aq);
  if (tp.due && tp.plan.on) {
    const v = tpaVerdict(aq);
    const liters = fmtNum(tpaCalc(aq, tp.plan.pct).liters, 1);
    add(v.level === 'ok' ? 'warn' : 'info', 'TPA programada venceu',
      `${tp.lastAt ? `Última troca ${relDay(tp.lastAt)}` : 'Nenhuma TPA registrada ainda'}; o programa é a cada ${tp.plan.every} dias. ` +
      `Veredito pelos dados de hoje: ${v.title}. ${v.reasons[0] || ''} ` +
      `Se for trocar, ${tp.plan.pct}% = ${liters} L de água nova.`);
  }

  // temperatura oscilando
  const tt = lastN(aq, 'temp', 4);
  if (tt.length >= 3) {
    const vs = tt.map((x) => x.v);
    const amp = Math.max(...vs) - Math.min(...vs);
    if (amp >= 2) add('warn', 'Oscilação de temperatura', `Variação de ${fmtNum(amp, 1)} °C nas últimas ${tt.length} medições. Verifique o termostato e a posição do sensor.`);
  }

  // plantas
  const pl = (aq.plants || []).filter((p) => p.cond === 'ruim');
  if (pl.length) add('warn', 'Plantas deteriorando', `${pl.map((p) => p.species).join(', ')}. Remova folhas totalmente necrosadas para não aumentar a carga orgânica. Antes de assumir deficiência nutricional, considere adaptação, melt, dano mecânico e iluminação.`);
  const melt = (aq.plants || []).filter((p) => p.cond === 'melt' || p.cond === 'adapt');
  if (melt.length && ageDays(aq) < 45) add('info', 'Plantas em adaptação', `${melt.length} espécie(s) em adaptação/melt. Isso é esperado nas primeiras semanas — retire apenas o material realmente morto.`);

  // carga
  const bl = bioload(aq);
  if (bl.pct > 100) add('bad', 'Carga biológica acima da capacidade', `Estimativa de ${bl.pct}% para ${bl.vol} L úteis. Reavalie a fauna, reforce a filtragem e monitore amônia/nitrito.`);
  else if (bl.pct > 80) add('warn', 'Carga biológica alta', `Estimativa de ${bl.pct}% da capacidade para ${bl.vol} L úteis.`);

  // óbito recente
  const dead = (aq.livestock || []).filter((x) => x.status === 'obito' && daysSince(x.diedAt || x.createdAt) <= 5);
  if (dead.length) add('warn', 'Óbito recente registrado', 'Matéria orgânica em decomposição eleva amônia. Retire o animal, teste amônia e nitrito nas próximas 24 h e monitore os demais.');

  // sobras de ração
  const leftovers = (aq.feedings || []).filter((f) => daysSince(f.at) <= 5 && f.leftover);
  if (leftovers.length >= 3) add('warn', 'Sobras repetidas de ração', `${leftovers.length} registros com sobra nos últimos 5 dias. Reduza a quantidade: sobra vira amônia.`);

  return out;
}

/* ---------------- próximo teste ---------------- */
export function nextTestDue(aq) {
  const last = aq.tests?.[0];
  const cyc = cyclingStatus(aq);
  const hasFish = (aq.livestock || []).some((x) => x.status !== 'obito' && x.status !== 'removido');
  const every = !cyc.done ? 2 : hasFish ? 4 : 7;
  if (!last) return { every, due: true, days: null, label: 'Agora — nenhuma medição registrada' };
  const d = daysSince(last.at);
  const days = every - d;
  return { every, due: days <= 0, days, label: days <= 0 ? 'Agora' : days === 1 ? 'Amanhã' : `Em ${days} dias` };
}

/* ---------------- linha do tempo ---------------- */
export function timeline(aq) {
  const ev = [];
  const start = aq.cycling?.start || aq.setupDate;
  const dayOf = (iso) => Math.max(1, Math.floor((new Date(iso) - new Date(start + 'T00:00:00')) / dayMs) + 1);

  ev.push({ at: aq.setupDate + 'T08:00:00', s: 'info', t: 'Início do aquário', d: `Montagem registrada. Volume útil ${aq.volUtil} L (bruto ${aq.volBruto} L).` });
  if (aq.cycling?.start && aq.cycling.start !== aq.setupDate) ev.push({ at: aq.cycling.start + 'T08:00:00', s: 'info', t: 'Início da ciclagem', d: '' });

  const tests = [...(aq.tests || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
  let sawNo2 = false, sawZero = false, peak = 0, peakAt = null;
  tests.forEach((t, i) => {
    const a = num(t.nh3), n = num(t.no2);
    if (a !== null && a > peak) { peak = a; peakAt = t.at; }
    if (!sawNo2 && n !== null && n > 0) { sawNo2 = true; ev.push({ at: t.at, s: 'warn', t: 'Nitrito apareceu', d: `${fmtNum(n, 3)} ppm — fase mais tóxica do ciclo.` }); }
    if (!sawZero && a === 0 && n === 0) { sawZero = true; ev.push({ at: t.at, s: 'ok', t: 'Primeira leitura com amônia e nitrito em 0', d: '' }); }
    if (i === 0) ev.push({ at: t.at, s: 'info', t: 'Primeira medição', d: describeTest(t) });
  });
  if (peakAt) ev.push({ at: peakAt, s: 'warn', t: 'Pico de amônia registrado', d: `${fmtNum(peak, 3)} ppm.` });

  (aq.livestock || []).forEach((l) => {
    if (l.entryDate) ev.push({ at: l.entryDate + 'T12:00:00', s: 'info', t: `Entrada de fauna: ${l.name || SPEC[l.spec]?.n || 'espécie'}`, d: `${l.qty} indivíduo(s).` });
    if (l.status === 'obito' && l.diedAt) ev.push({ at: l.diedAt, s: 'bad', t: `Óbito: ${l.name || SPEC[l.spec]?.n}`, d: l.notes || '' });
  });
  (aq.tpas || []).forEach((t) => ev.push({ at: t.at, s: 'info', t: `TPA de ${fmtNum(t.pct, 0)}%`, d: `${fmtNum(t.liters, 1)} L trocados.` }));
  (aq.notes || []).forEach((n) => ev.push({ at: n.at, s: n.kind === 'ocorrencia' ? 'warn' : 'info', t: n.kind === 'ocorrencia' ? 'Ocorrência' : 'Nota do diário', d: n.text }));
  if (aq.cycling?.doneAt) ev.push({ at: aq.cycling.doneAt, s: 'ok', t: 'Ciclo marcado como concluído', d: '' });

  return ev
    .filter((e) => e.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .map((e) => Object.assign(e, { day: dayOf(e.at) }));
}

export function describeTest(t) {
  const bits = [];
  for (const k of CORE) {
    const v = num(t[k]);
    if (v === null) continue;
    const def = P[k];
    bits.push(`${def.n.replace(/\s*\(.*\)/, '')} ${fmtNum(v, def.dec)}${def.u ? ' ' + def.u : ''}`);
  }
  return bits.join(' · ');
}

/* ---------------- resumo para a IA ---------------- */
export function digest(aq) {
  const L = [];
  const wq = waterQuality(aq);
  const cyc = cyclingStatus(aq);
  const gate = canAddFish(aq);
  const bl = bioload(aq);
  const nt = nextTestDue(aq);

  L.push(`AQUÁRIO: "${aq.name}" · ${aq.type === 'doce' ? 'água doce plantado comunitário' : 'água salgada'}`);
  L.push(`Volume ÚTIL (usar para TODOS os cálculos): ${aq.volUtil} L. Volume bruto: ${aq.volBruto} L. Dimensões: ${aq.dims?.c}×${aq.dims?.l}×${aq.dims?.a} cm.`);
  L.push(`Montado em ${fmtDate(aq.setupDate + 'T00:00:00', false)} — ${ageDays(aq)} dias de idade.`);
  if (aq.equip) {
    L.push('EQUIPAMENTOS:');
    Object.entries(aq.equip).forEach(([k, v]) => v && L.push(`- ${k}: ${v}`));
  }
  if (aq.light) L.push(`ILUMINAÇÃO: ${aq.light.hours} h/dia (${aq.light.on}–${aq.light.off}), intensidade ${aq.light.intensity}. ${aq.light.notes || ''}`);

  L.push('');
  L.push(`CICLAGEM: dia ${cyc.day} · ${cyc.label}. ${cyc.desc}`);
  L.push(`Sequência atual de medições com amônia=0 e nitrito=0: ${cyc.zeros.count} medição(ões) em ${cyc.zeros.spanDays} dia(s). Pico histórico registrado: ${cyc.sawPeak ? 'sim' : 'não'}.`);

  L.push('');
  L.push('PARÂMETROS (última medição de cada, com data):');
  let any = false;
  for (const p of PARAMS) {
    const l = latest(aq, p.k);
    if (!l) continue;
    any = true;
    const tr = trend(aq, p.k);
    const tg = target(aq, p.k);
    L.push(`- ${p.n}: ${fmtNum(l.v, p.dec)}${p.u ? ' ' + p.u : ''} (${fmtDate(l.at)}) · alvo ${fmtNum(tg.min, p.dec)}–${fmtNum(tg.max, p.dec)} · status ${statusLabel(statusOf(aq, p.k, l.v))}${tr ? ' · ' + trendText(p.k, tr) : ''}`);
  }
  if (!any) L.push('- NENHUMA medição registrada.');
  if (wq.missing.length) L.push(`FALTAM medições de: ${wq.missing.map((k) => P[k].n).join(', ')}. NÃO invente esses valores.`);

  const hist = (aq.tests || []).slice(0, 8).map((t) => `  ${fmtDate(t.at)} → ${describeTest(t)}${t.notes ? ' | ' + t.notes : ''}`);
  if (hist.length) { L.push(''); L.push('HISTÓRICO RECENTE DE TESTES (mais recente primeiro):'); L.push(...hist); }

  L.push('');
  const live = (aq.livestock || []).filter((x) => x.status !== 'obito' && x.status !== 'removido');
  L.push(`FAUNA ATUAL (${live.reduce((s, x) => s + (num(x.qty) || 0), 0)} indivíduos):`);
  if (!live.length) L.push('- nenhuma (aquário sem peixes).');
  live.forEach((x) => L.push(`- ${x.qty}× ${x.name || SPEC[x.spec]?.n || '?'} · saúde: ${x.health || 'não informada'} · entrada: ${x.entryDate || '?'}${x.notes ? ' · ' + x.notes : ''}`));
  const gone = (aq.livestock || []).filter((x) => x.status === 'obito');
  if (gone.length) L.push(`ÓBITOS registrados: ${gone.map((x) => `${x.qty}× ${x.name || SPEC[x.spec]?.n} (${fmtDate(x.diedAt, false)})`).join('; ')}`);
  L.push(`CARGA BIOLÓGICA estimada: ${bl.used} de ${bl.capacity} unidades (${bl.pct}% da capacidade para ${bl.vol} L úteis).`);

  if ((aq.stocking?.plan || []).length) {
    L.push(`PLANO DE POVOAMENTO (configurável, intervalo ${aq.stocking.intervalDays} dias): ${aq.stocking.plan.map((p, i) => `${i + 1}) ${p.qty}× ${SPEC[p.spec]?.n || p.spec}${p.done ? ' [já introduzido]' : ''}`).join(' → ')}`);
  }

  L.push('');
  L.push('PLANTAS:');
  if (!(aq.plants || []).length) L.push('- nenhuma registrada.');
  (aq.plants || []).forEach((p) => L.push(`- ${p.qty}× ${p.species} · ${p.cond} · ${p.loc || 's/ local'}${p.notes ? ' · ' + p.notes : ''}`));

  const dos = (aq.dosings || []).slice(0, 8);
  if (dos.length) { L.push(''); L.push('DOSAGENS RECENTES:'); dos.forEach((d) => L.push(`- ${fmtDate(d.at)} · ${PRODUCT[d.prod]?.name || d.prod} · ${fmtNum(d.ml, 2)} mL${d.where ? ' · ' + d.where : ''}${d.notes ? ' · ' + d.notes : ''}`)); }

  const tp = (aq.tpas || []).slice(0, 5);
  if (tp.length) { L.push(''); L.push('TPAs RECENTES:'); tp.forEach((t) => L.push(`- ${fmtDate(t.at)} · ${fmtNum(t.pct, 0)}% = ${fmtNum(t.liters, 1)} L · água nova a ${t.newTemp ? fmtNum(t.newTemp, 1) + ' °C' : 'temp. não informada'}${t.prime ? ` · Prime ${fmtNum(t.prime, 2)} mL` : ''}${t.notes ? ' · ' + t.notes : ''}`)); }

  const fd = (aq.feedings || []).slice(0, 6);
  if (fd.length) { L.push(''); L.push('ALIMENTAÇÃO RECENTE:'); fd.forEach((f) => L.push(`- ${fmtDate(f.at)} · ${f.food} · ${f.qty || '?'} · aceitação ${f.accept || '?'}${f.leftover ? ' · COM SOBRA' : ''}`)); }

  const nn = (aq.notes || []).slice(0, 6);
  if (nn.length) { L.push(''); L.push('DIÁRIO / OCORRÊNCIAS:'); nn.forEach((n) => L.push(`- ${fmtDate(n.at)} [${n.kind}] ${n.text}`)); }

  L.push('');
  L.push(`PORTÃO DE POVOAMENTO (calculado pelo app): ${gate.level === 'ok' ? '🟢 LIBERADO' : gate.level === 'warn' ? '🟡 CONDICIONAL' : '🔴 NÃO RECOMENDADO'} — ${gate.title}`);
  gate.reasons.forEach((r) => L.push(`  · ${r}`));
  L.push(`PRÓXIMO TESTE recomendado: ${nt.label} (cadência atual: a cada ${nt.every} dias).`);

  const al = alerts(aq);
  if (al.length) { L.push(''); L.push('ALERTAS ATIVOS:'); al.forEach((a) => L.push(`- [${a.s === 'ok' ? 'OK' : a.s === 'warn' ? 'ATENÇÃO' : a.s === 'bad' ? 'CRÍTICO' : 'INFO'}] ${a.t}: ${a.d}`)); }

  L.push('');
  L.push(`REFERÊNCIAS DE DOSAGEM já calculadas para este aquário (${aq.volUtil} L úteis):`);
  L.push(`- Prime para TPA de 20% (${tpaCalc(aq, 20).liters} L de água nova): ${tpaCalc(aq, 20).prime.ml} mL. Regra do rótulo: 5 mL para 200 L de ÁGUA NOVA.`);
  L.push(`- Stability manutenção (volume total útil): ${stabilityDose(aq).ml} mL. Protocolo do usuário: ${aq.protocols?.stabilityMl || '—'} mL/dia por ${aq.protocols?.stabilityDays || '—'} dias.`);
  L.push('- TPA: 20% = ' + tpaCalc(aq, 20).liters + ' L · 25% = ' + tpaCalc(aq, 25).liters + ' L · 30% = ' + tpaCalc(aq, 30).liters + ' L.');

  return L.join('\n');
}

/** Prompt de sistema do Consultor: carrega as regras inegociáveis. */
export function systemPrompt(aq) {
  return `Você é o CONSULTOR AQUARISTA do aplicativo AquaFlow. Você NÃO é um assistente genérico: você é um consultor técnico que decide com base no histórico registrado deste aquário específico.

Responda sempre em português do Brasil, de forma direta e prática. Use os dados fornecidos no CONTEXTO. Formate com títulos curtos e listas quando ajudar.

REGRAS INEGOCIÁVEIS (nunca viole, mesmo se o usuário insistir):
1. Todo cálculo de dosagem, capacidade e concentração usa o VOLUME ÚTIL de ${aq.volUtil} L. Nunca use o volume bruto de ${aq.volBruto} L.
2. Nunca recomende introduzir peixe se a amônia for maior que 0 ppm.
3. Nunca recomende introduzir peixe se o nitrito for maior que 0 ppm.
4. Nunca considere uma única medição suficiente para confirmar estabilidade ou declarar o aquário ciclado.
5. Nunca recomende substituir por completo as mídias biológicas do filtro em manutenção normal.
6. Nunca recomende medicamento de forma indiscriminada ou preventiva.
7. Nunca misture Prime e Cloronev.
8. Nunca recomende Transnev no aquário comunitário como prevenção — apenas aquário hospitalar com indicação clara.
9. Betta exige fluxo brando; é o último peixe a entrar no comunitário.
10. A tampa deve permanecer fechada; decorações sem rebarbas.
11. Toda mudança de fauna considera carga biológica e compatibilidade.
12. Na dúvida, priorize a segurança e peça novos dados.
13. NUNCA invente medições. Se um dado não está no contexto, diga que falta e peça exatamente qual medição é necessária.
14. Nunca assuma que um parâmetro está normal sem registro.
15. Toda recomendação importante explica o MOTIVO e os PRÓXIMOS PASSOS.

CADEIA DE EFEITOS: antes de recomendar, considere biologia nitrificante, carga orgânica, estresse dos peixes, temperatura, química da água, fluxo e oxigenação, risco mecânico, plantas, compatibilidade da fauna e manutenção futura.

FOLHAS MARRONS / PLANTAS: não interprete automaticamente como deficiência nutricional. Considere nesta ordem: adaptação, melt, dano mecânico, iluminação, nutrientes, outros fatores.

COMPATIBILIDADE: nunca diga apenas "compatível" ou "incompatível". Use 🟢 baixo risco, 🟡 risco moderado ou 🔴 alto risco, e explique o motivo.

NÍVEL DE CONFIANÇA: toda recomendação importante termina classificada como 🟢 RECOMENDAÇÃO SEGURA, 🟡 RECOMENDAÇÃO CONDICIONAL ou 🔴 NÃO RECOMENDADO. Se faltarem informações críticas, diga "Não há dados suficientes para recomendar isso com segurança" e liste exatamente quais medições faltam.

FECHAMENTO OBRIGATÓRIO: termine toda análise técnica com UMA pergunta objetiva que ajude a manter o aquário seguro (por exemplo, pedindo a última leitura e a data). Nunca pergunte algo genérico como "posso ajudar em mais alguma coisa?".`;
}
