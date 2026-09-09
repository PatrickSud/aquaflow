/* ai.js — Consultor. Funciona em dois modos:
   1) LOCAL (sempre disponível, offline): responde pelo motor de regras do próprio app.
   2) IA (opcional): manda o resumo técnico do aquário para um modelo de linguagem.

   A chave da IA fica só neste aparelho (IndexedDB local). Nada é enviado sem você perguntar. */

import {
  digest, systemPrompt, canAddFish, cyclingStatus, alerts, bioload, waterQuality,
  latest, lastN, trend, trendText, tpaCalc, primeDose, stabilityDose, compatibility,
  riskLabel, nextTestDue, fmtNum, fmtDate, relDay, statusOf, statusLabel, target, ageDays, series
} from './engine.js';
import { PARAMS, P, CORE, SPECIES, SPEC } from './model.js';

/* ================= modo LOCAL ================= */

const LEVEL = { ok: '🟢 RECOMENDAÇÃO SEGURA', warn: '🟡 RECOMENDAÇÃO CONDICIONAL', bad: '🔴 NÃO RECOMENDADO' };

export function localAnswer(aq, q) {
  const s = (q || '').toLowerCase();
  const has = (...ws) => ws.some((w) => s.includes(w));

  if (has('posso colocar', 'posso por', 'posso pôr', 'liberar peixe', 'soltar os peixe', 'adicionar peixe', 'colocar os peixe', 'já posso', 'ja posso', 'povoar', 'povoamento'))
    return ansStocking(aq);
  if (has('tpa', 'troca parcial', 'trocar água', 'trocar agua', 'preciso trocar'))
    return ansTPA(aq);
  if (has('prime', 'condicionador', 'quanto dosar', 'dosagem', 'stability', 'dose'))
    return ansDose(aq, s);
  if (has('ciclo', 'ciclagem', 'ciclado', 'ciclando'))
    return ansCycle(aq);
  if (has('compat', 'junto com', 'conviv', 'pode com', 'camarão', 'camarao', 'betta'))
    return ansCompat(aq, s);
  if (has('mudou', 'semana', 'evolu', 'tend'))
    return ansChanges(aq);
  if (has('testar', 'próximo teste', 'proximo teste', 'quando medir'))
    return ansNextTest(aq);
  if (has('planta', 'folha', 'marrom', 'melt'))
    return ansPlants(aq);
  if (has('filtro', 'mídia', 'midia', 'perlon', 'manutenção do filtro'))
    return ansFilter(aq);
  if (has('alimenta', 'ração', 'racao', 'comida'))
    return ansFeeding(aq);
  return ansStatus(aq);
}

function head(t) { return `## ${t}\n`; }
function ask(q) { return `\n**Pergunta:** ${q}`; }

function ansStatus(aq) {
  const wq = waterQuality(aq);
  const cyc = cyclingStatus(aq);
  const bl = bioload(aq);
  const al = alerts(aq);
  const nt = nextTestDue(aq);
  let o = head('Situação do aquário');

  if (!aq.tests?.length) {
    o += 'Não há nenhuma medição registrada, então não é possível afirmar nada sobre a água.\n\n';
    o += '**Não há dados suficientes para recomendar isso com segurança.** Preciso de: amônia, nitrito, nitrato, pH e temperatura.\n';
    o += `\n${LEVEL.bad}`;
    return o + ask('Você consegue registrar hoje um teste completo de amônia, nitrito, nitrato, pH e temperatura?');
  }

  o += `Água: **${statusLabel(wq.status)}**. Última medição ${relDay(aq.tests[0].at)}.\n\n`;
  o += '**Parâmetros**\n';
  for (const k of CORE) {
    const l = latest(aq, k);
    const def = P[k];
    if (!l) { o += `- ${def.n}: sem registro\n`; continue; }
    const tr = trend(aq, k);
    o += `- ${def.n}: ${fmtNum(l.v, def.dec)}${def.u ? ' ' + def.u : ''} — ${statusLabel(statusOf(aq, k, l.v))}${tr ? ` (${trendText(k, tr)})` : ''}\n`;
  }
  o += `\n**Ciclagem:** dia ${cyc.day} — ${cyc.label}. ${cyc.desc}\n`;
  o += `**Carga biológica:** ${bl.used} de ${bl.capacity} unidades (${bl.pct}% para ${bl.vol} L úteis).\n`;
  o += `**Próximo teste:** ${nt.label}.\n`;
  if (wq.missing.length) o += `\nFaltam medições de: ${wq.missing.map((k) => P[k].n).join(', ')}. Não vou supor esses valores.\n`;
  if (al.length) {
    o += '\n**Alertas ativos**\n';
    al.slice(0, 6).forEach((a) => { o += `- ${a.s === 'bad' ? '🔴' : a.s === 'warn' ? '🟡' : a.s === 'ok' ? '🟢' : 'ℹ️'} **${a.t}** — ${a.d}\n`; });
  }
  return o + ask('Qual foi a última leitura de amônia e nitrito, e em que data você a fez?');
}

function ansStocking(aq) {
  const g = canAddFish(aq);
  let o = head('Posso introduzir peixes?');
  o += `**${g.title}**\n\n`;
  g.reasons.forEach((r) => { o += `- ${r}\n`; });
  if (g.next.length) { o += '\n**Próximos passos**\n'; g.next.forEach((n) => { o += `- ${n}\n`; }); }

  if (g.level === 'ok') {
    const plan = (aq.stocking?.plan || []).filter((p) => !p.done);
    if (plan.length) {
      const first = plan[0];
      const c = compatibility(aq, first.spec, first.qty);
      o += `\n**Primeiro lote do seu plano:** ${first.qty}× ${SPEC[first.spec]?.n || first.spec} — ${c.level === 'ok' ? '🟢' : c.level === 'warn' ? '🟡' : '🔴'} ${riskLabel(c.level)}\n`;
      c.notes.slice(0, 4).forEach((n) => { o += `- ${n}\n`; });
      o += `\nAguarde ${aq.stocking.intervalDays} dias entre lotes e teste amônia e nitrito 24–48 h após cada entrada.\n`;
    }
  }
  o += `\n${LEVEL[g.level]}`;
  return o + ask(g.question);
}

function ansTPA(aq) {
  let o = head('Preciso fazer TPA?');
  const no3 = latest(aq, 'no3'), nh3 = latest(aq, 'nh3'), no2 = latest(aq, 'no2'), tp = latest(aq, 'temp');
  const miss = [];
  if (!no3) miss.push('nitrato'); if (!nh3) miss.push('amônia'); if (!no2) miss.push('nitrito');
  if (miss.length) {
    o += `**Não há dados suficientes para recomendar isso com segurança.** Faltam: ${miss.join(', ')}.\n\n`;
    o += 'Não recomendo TPA só porque passou um número de dias — a decisão depende dos parâmetros.\n';
    o += `\n${LEVEL.bad}`;
    return o + ask(`Você consegue medir ${miss.join(', ')} hoje?`);
  }

  const cyc = cyclingStatus(aq);
  const reasons = [];
  let lvl = 'warn', verdict = '';

  if (no3.v > 40) { reasons.push(`Nitrato em ${fmtNum(no3.v, 1)} ppm, acima de 40 — TPA indicada.`); verdict = 'TPA indicada'; lvl = 'ok'; }
  else if (no3.v >= 20) { reasons.push(`Nitrato em ${fmtNum(no3.v, 1)} ppm, zona de atenção (20–40).`); verdict = 'TPA opcional'; }
  else { reasons.push(`Nitrato em ${fmtNum(no3.v, 1)} ppm, abaixo de 20 — não há motivo de nitrato para trocar água.`); verdict = 'TPA não necessária agora'; }

  if (!cyc.done && (nh3.v > 0 || no2.v > 0)) {
    reasons.push(`O aquário está ciclando (amônia ${fmtNum(nh3.v, 3)} / nitrito ${fmtNum(no2.v, 3)} ppm). TPA nesta fase dilui a fonte de amônia e pode atrasar o ciclo. Sem peixes dentro, o padrão é NÃO trocar.`);
    verdict = 'Não trocar agora (ciclagem em andamento, sem fauna)';
    lvl = 'warn';
    const live = (aq.livestock || []).filter((x) => x.status !== 'obito' && x.status !== 'removido');
    if (live.length) {
      reasons.push('Mas há fauna registrada com o ciclo em andamento: nesse caso a TPA passa a ser proteção contra intoxicação. Priorize os animais.');
      verdict = 'TPA de socorro indicada (há fauna com ciclo incompleto)';
      lvl = 'ok';
    }
  }

  o += `**${verdict}**\n\n`;
  reasons.forEach((r) => { o += `- ${r}\n`; });

  o += '\n**Se for trocar, o cálculo para os seus ' + aq.volUtil + ' L úteis**\n';
  [20, 25, 30].forEach((p) => {
    const c = tpaCalc(aq, p);
    o += `- ${p}% = **${fmtNum(c.liters, 1)} L** de água nova → Prime **${fmtNum(c.prime.ml, 2)} mL**\n`;
  });
  o += `\nA água nova deve entrar na mesma temperatura do aquário (${tp ? fmtNum(tp.v, 1) + ' °C atualmente' : 'meça antes'}) e já condicionada.\n`;
  o += `\n${LEVEL[lvl]}`;
  return o + ask('Qual o motivo da TPA que você está considerando, e qual o nitrato e a temperatura de hoje?');
}

function ansDose(aq, s) {
  let o = head('Cálculo de dosagem');
  o += `Base de cálculo: **${aq.volUtil} L úteis** (nunca os ${aq.volBruto} L brutos).\n\n`;

  if (s.includes('stability')) {
    const d = stabilityDose(aq);
    const d1 = stabilityDose(aq, true);
    o += '**Seachem Stability**\n';
    o += `- Rótulo: ${d.label}\n`;
    o += `- 1º dia no volume total: ${fmtNum(d1.ml, 1)} mL\n`;
    o += `- Manutenção diária no volume total: ${fmtNum(d.ml, 1)} mL\n`;
    if (d.user) o += `- Protocolo que você registrou: **${fmtNum(d.user, 1)} mL/dia** por ${aq.protocols?.stabilityDays || 7} dias\n`;
    o += '\nAplique diretamente sobre as mídias biológicas do filtro. Isto é um valor estimado a partir do rótulo — confirme a concentração no seu frasco.\n';
    o += `\n${LEVEL.warn}`;
    return o + ask('Você já aplicou a dose de hoje? Se sim, registre para o app não sugerir de novo.');
  }

  o += '**Seachem Prime**\n';
  o += '- Regra do rótulo: 5 mL para **200 L de água nova** (1 mL por 40 L).\n';
  o += '- A dose é calculada sobre o volume de ÁGUA NOVA, não sobre os 80 L do aquário.\n\n';
  o += '| Água nova | Dose |\n';
  [10, 16, 20, 24, 80].forEach((L) => { const p = primeDose(L); o += `- ${L} L → **${fmtNum(p.ml, 2)} mL** (~${p.drops} gotas)\n`; });
  o += `\nEm emergência de amônia o rótulo admite até 5× a dose aplicada ao volume total (${fmtNum(primeDose(aq.volUtil, 5).ml, 2)} mL para ${aq.volUtil} L) — só com motivo claro e nunca junto com Cloronev.\n`;
  o += '\nEstes valores são estimados a partir da regra do rótulo; confirme a concentração indicada no seu frasco.\n';
  o += `\n${LEVEL.warn}`;
  return o + ask('Quantos litros de água nova você vai repor nesta TPA?');
}

function ansCycle(aq) {
  const c = cyclingStatus(aq);
  let o = head('Como está a ciclagem');
  o += `**Dia ${c.day} — ${c.label}**\n\n${c.desc}\n\n`;
  ['nh3', 'no2', 'no3'].forEach((k) => {
    const l = latest(aq, k), def = P[k], tr = trend(aq, k);
    if (!l) { o += `- ${def.n}: sem registro\n`; return; }
    o += `- ${def.n}: ${fmtNum(l.v, def.dec)} ${def.u}${tr ? ` — ${trendText(k, tr)}` : ''} (${relDay(l.at)})\n`;
  });
  o += `\nSequência atual em 0/0: **${c.zeros.count} medição(ões)** ao longo de **${c.zeros.spanDays} dia(s)**.\n`;
  o += 'Para eu considerar o ciclo concluído: amônia 0 e nitrito 0 em pelo menos 3 medições ao longo de 5 dias ou mais. Uma leitura isolada não vale.\n';
  o += '\n**O caminho esperado:** amônia sobe → bactérias crescem → nitrito aparece → amônia cai → nitrito é processado → nitrato sobe → 0/0 estável.\n';
  o += `\n${c.done ? LEVEL.ok : LEVEL.warn}`;
  return o + ask('Qual a amônia e o nitrito de hoje, e qual era o valor na medição anterior?');
}

function ansCompat(aq, s) {
  let o = head('Compatibilidade');
  const found = SPECIES.find((sp) => s.includes(sp.n.toLowerCase().split(' ')[0]) || (sp.sci && s.includes(sp.sci.toLowerCase().split(' ')[0])));
  if (!found) {
    o += 'Diga qual espécie e quantidade você está avaliando que eu analiso contra o volume útil, a fauna atual, os parâmetros medidos e a carga biológica.\n';
    o += '\nEspécies na base: ' + SPECIES.filter((x) => x.id !== 'outro').map((x) => x.n).join(', ') + '.\n';
    return o + ask('Qual espécie e quantos indivíduos você quer avaliar?');
  }
  const qty = Number((s.match(/(\d+)/) || [])[1]) || found.grupo || 1;
  const c = compatibility(aq, found.id, qty);
  o += `**${qty}× ${found.n}** ${found.sci ? `(*${found.sci}*)` : ''} — ${c.level === 'ok' ? '🟢' : c.level === 'warn' ? '🟡' : '🔴'} **${riskLabel(c.level)}**\n\n`;
  c.notes.forEach((n) => { o += `- ${n}\n`; });
  o += `\nCarga biológica estimada após a entrada: **${c.pctAfter}%** da capacidade de ${aq.volUtil} L úteis.\n`;
  o += `\n${LEVEL[c.level]}`;
  return o + ask('Quantos esconderijos e áreas plantadas o aquário tem hoje, e qual a última leitura de amônia e nitrito?');
}

function ansChanges(aq) {
  let o = head('O que mudou');
  const t = aq.tests || [];
  if (t.length < 2) { o += 'Só há ' + t.length + ' medição registrada — preciso de pelo menos duas para comparar.\n' + `\n${LEVEL.bad}`; return o + ask('Você pode registrar um novo teste para eu comparar com o anterior?'); }
  o += `Comparando as duas últimas medições (${relDay(t[1].at)} → ${relDay(t[0].at)}):\n\n`;
  CORE.forEach((k) => {
    const tr = trend(aq, k), def = P[k];
    if (!tr) return;
    const arrow = tr.dir === 'up' ? '▲' : tr.dir === 'down' ? '▼' : '■';
    o += `- ${def.n}: ${fmtNum(tr.from.v, def.dec)} → ${fmtNum(tr.to.v, def.dec)} ${def.u} ${arrow} ${trendText(k, tr)}\n`;
  });
  const cyc = cyclingStatus(aq);
  o += `\n**Leitura do conjunto:** ${cyc.label}. ${cyc.desc}\n`;
  const ev = (aq.notes || []).filter((n) => (Date.now() - new Date(n.at)) / 86400000 <= 7);
  if (ev.length) { o += '\n**Registros da semana**\n'; ev.forEach((n) => { o += `- ${fmtDate(n.at, false)}: ${n.text}\n`; }); }
  o += `\n${LEVEL.warn}`;
  return o + ask('Houve alguma mudança de rotina nesse período — alimentação, TPA, dosagem ou fotoperíodo?');
}

function ansNextTest(aq) {
  const nt = nextTestDue(aq);
  let o = head('Quando testar de novo');
  o += `**${nt.label}** — cadência atual: a cada ${nt.every} dias.\n\n`;
  o += aq.tests?.length ? `Última medição: ${fmtDate(aq.tests[0].at)} (${relDay(aq.tests[0].at)}).\n` : 'Nenhuma medição registrada ainda.\n';
  o += '\nA cadência muda com a fase: ciclagem em andamento a cada 1–2 dias; com fauna nova a cada 3–4 dias; sistema maduro e estável, semanal. Depois de qualquer aumento de carga (peixe novo, óbito, ração extra), teste em 24–48 h.\n';
  o += `\n${LEVEL.ok}`;
  return o + ask('Você tem reagente suficiente de amônia e nitrito para manter essa cadência?');
}

function ansPlants(aq) {
  let o = head('Plantas');
  const ps = aq.plants || [];
  if (!ps.length) { o += 'Nenhuma planta registrada.\n'; return o + ask('Quais espécies você tem hoje e em que estado estão?'); }
  ps.forEach((p) => { o += `- ${p.qty}× **${p.species}** — ${p.cond}${p.loc ? ' · ' + p.loc : ''}${p.notes ? ' · ' + p.notes : ''}\n`; });
  o += '\n**Antes de tratar folha marrom como deficiência nutricional**, verifique nesta ordem: 1) adaptação, 2) melt, 3) dano mecânico, 4) iluminação, 5) nutrientes, 6) outros fatores.\n';
  o += `\nO aquário tem ${ageDays(aq)} dias. Nas primeiras semanas, melt e troca de folhas são esperados — Vallisneria com ponta marrom e Hygrophila trocando folha normalmente é adaptação.\n`;
  o += '\n**O que fazer agora:** remover apenas folhas totalmente necrosadas (matéria morta vira amônia), conferir se a coroa da Vallisneria não está enterrada e manter o fotoperíodo atual.\n';
  const li = aq.light || {};
  o += `\nFotoperíodo registrado: ${li.hours || '?'} h/dia (${li.on || '?'}–${li.off || '?'}). Não aumente só porque o crescimento está lento — luz a mais sem nutriente e CO₂ vira alga.\n`;
  o += `\n${LEVEL.warn}`;
  return o + ask('As folhas novas que nasceram depois da montagem estão saudáveis, ou o problema aparece também nelas?');
}

function ansFilter(aq) {
  const age = ageDays(aq);
  const swap = aq.protocols?.filterSwapDay || 35;
  let o = head('Filtragem');
  o += `Equipamento: ${aq.equip?.filtro || 'não informado'}\nMídias: ${aq.equip?.midias || 'não informadas'}\n\n`;
  o += `Idade do aquário: **${age} dias**. Plano registrado: rever a filtragem mecânica a partir do dia ${swap}.\n\n`;
  o += age >= swap
    ? '**Já está na janela do plano:** retire o refil mecânico saturado, **preserve as mídias biológicas** e passe a usar perlon solto na entrada.\n'
    : `Faltam ${swap - age} dias para essa etapa.\n`;
  o += '\n**Regra que não muda:** em manutenção normal nunca se substitui todo o material biológico. Se precisar lavar, lave em água do próprio aquário, nunca em água da torneira.\n';
  o += `\n${LEVEL.warn}`;
  return o + ask('O fluxo de saída continua igual ao do início, ou já caiu perceptivelmente?');
}

function ansFeeding(aq) {
  let o = head('Alimentação');
  const f = (aq.feedings || []).slice(0, 6);
  const foods = aq.foods || [];
  if (foods.length) { o += '**Alimentos cadastrados**\n'; foods.forEach((x) => { o += `- ${x.name}${x.target ? ` — ${x.target}` : ''}\n`; }); o += '\n'; }
  if (!f.length) o += 'Nenhum registro de alimentação ainda.\n';
  else { o += '**Últimos registros**\n'; f.forEach((x) => { o += `- ${fmtDate(x.at)} · ${x.food} · ${x.qty || '?'}${x.leftover ? ' · **com sobra**' : ''}\n`; }); }
  const left = (aq.feedings || []).filter((x) => x.leftover && (Date.now() - new Date(x.at)) / 86400000 <= 5);
  if (left.length >= 2) o += `\n🟡 **${left.length} registros com sobra nos últimos 5 dias.** Reduza a quantidade: sobra de ração vira amônia e sobrecarrega o filtro.\n`;
  const live = (aq.livestock || []).filter((x) => x.status !== 'obito' && x.status !== 'removido');
  if (!live.length) o += '\nSem fauna registrada: durante a ciclagem sem peixes não há o que alimentar. A fonte de amônia é outra.\n';
  o += `\n${LEVEL.warn}`;
  return o + ask('Em quanto tempo a ração desaparece por completo depois que você oferece?');
}

/* ================= modo IA ================= */

export const AI_PROVIDERS = [
  { v: 'gemini', n: 'Google Gemini (tem plano gratuito)' },
  { v: 'openai', n: 'OpenAI' },
  { v: 'anthropic', n: 'Anthropic Claude' },
  { v: 'proxy', n: 'Meu próprio servidor / proxy' }
];

export const DEFAULT_MODELS = {
  gemini: 'gemini-3.5-flash',
  openai: 'gpt-5.6-luna',
  anthropic: 'claude-haiku-4-5',
  proxy: ''
};

export function aiReady(cfg) {
  if (!cfg) return false;
  if (cfg.provider === 'proxy') return !!cfg.proxyUrl;
  return !!cfg.key;
}

/** Lista os modelos que a chave do usuário realmente pode usar (Gemini). */
export async function listGeminiModels(key) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models', { headers: { 'x-goog-api-key': key } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(friendlyError(r.status, j, 'gemini'));
  return (j.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => ({ id: String(m.name || '').replace(/^models\//, ''), label: m.displayName || m.name }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function friendlyError(status, body, provider) {
  const msg = body?.error?.message || body?.error?.type || '';
  if (status === 400 && /API key not valid|api key/i.test(msg)) return 'A chave da IA parece inválida. Confira se copiou inteira, sem espaços.';
  if (status === 401) return 'A chave da IA foi recusada (não autorizada). Gere uma nova chave e cole novamente.';
  if (status === 403) return 'Acesso negado pela chave. Verifique se a chave tem permissão para este modelo/serviço.';
  if (status === 404) return `O modelo configurado não existe ou não está disponível para a sua chave. Toque em "Buscar modelos disponíveis" nos Ajustes e escolha um da lista.`;
  if (status === 429) return 'Limite de uso atingido no momento. Aguarde alguns minutos e tente de novo — o plano gratuito tem limite por minuto e por dia.';
  if (status >= 500) return 'O serviço de IA está com instabilidade. Tente novamente em instantes.';
  return msg ? `Erro do serviço de IA: ${msg}` : `Erro do serviço de IA (código ${status}).`;
}

/** Envia a pergunta com o contexto do aquário. history = [{role:'user'|'model', text}] */
export async function aiAnswer(aq, question, cfg, history = []) {
  const sys = systemPrompt(aq);
  const ctx = `CONTEXTO ATUAL DO AQUÁRIO (dados reais registrados pelo usuário; use apenas estes números):\n\n${digest(aq)}`;

  if (cfg.provider === 'gemini') return callGemini(sys, ctx, question, cfg, history);
  if (cfg.provider === 'openai') return callOpenAI(sys, ctx, question, cfg, history);
  if (cfg.provider === 'anthropic') return callClaude(sys, ctx, question, cfg, history);
  if (cfg.provider === 'proxy') return callProxy(sys, ctx, question, cfg, history);
  throw new Error('Provedor de IA não configurado.');
}

async function callGemini(sys, ctx, q, cfg, history) {
  const model = cfg.model || DEFAULT_MODELS.gemini;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const contents = [];
  history.slice(-8).forEach((m) => contents.push({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
  contents.push({ role: 'user', parts: [{ text: `${ctx}\n\nPERGUNTA DO USUÁRIO:\n${q}` }] });

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 1400 }
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(friendlyError(r.status, j, 'gemini'));
  const cand = j.candidates?.[0];
  const txt = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!txt) {
    if (cand?.finishReason === 'SAFETY') throw new Error('A resposta foi bloqueada pelos filtros do serviço de IA. Tente reformular a pergunta.');
    throw new Error('O serviço de IA respondeu vazio. Tente novamente.');
  }
  return txt;
}

async function callOpenAI(sys, ctx, q, cfg, history) {
  const messages = [{ role: 'system', content: sys }];
  history.slice(-8).forEach((m) => messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  messages.push({ role: 'user', content: `${ctx}\n\nPERGUNTA DO USUÁRIO:\n${q}` });
  const r = await fetch(cfg.endpoint || 'https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: cfg.model || DEFAULT_MODELS.openai, messages, temperature: 0.4, max_tokens: 1400 })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(friendlyError(r.status, j, 'openai'));
  const txt = j.choices?.[0]?.message?.content?.trim();
  if (!txt) throw new Error('O serviço de IA respondeu vazio.');
  return txt;
}

async function callClaude(sys, ctx, q, cfg, history) {
  const messages = [];
  history.slice(-8).forEach((m) => messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  messages.push({ role: 'user', content: `${ctx}\n\nPERGUNTA DO USUÁRIO:\n${q}` });
  const r = await fetch(cfg.endpoint || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({ model: cfg.model || DEFAULT_MODELS.anthropic, max_tokens: 1400, system: sys, messages })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(friendlyError(r.status, j, 'anthropic'));
  const txt = (j.content || []).map((b) => b.text || '').join('').trim();
  if (!txt) throw new Error('O serviço de IA respondeu vazio.');
  return txt;
}

async function callProxy(sys, ctx, q, cfg, history) {
  const r = await fetch(cfg.proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system: sys, context: ctx, prompt: q, history })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(friendlyError(r.status, j, 'proxy'));
  const txt = j.reply || j.text || j.answer;
  if (!txt) throw new Error('O seu servidor respondeu sem o campo "reply".');
  return String(txt).trim();
}

export const SUGGESTIONS = [
  'A água está segura?',
  'Posso colocar os peixes?',
  'O ciclo está evoluindo?',
  'Preciso fazer TPA?',
  'Quanto de Prime eu doso?',
  'Quando devo testar novamente?',
  'O que mudou desde a semana passada?',
  'Minha fauna está adequada para esse volume?',
  'O filtro precisa de manutenção?',
  'As plantas estão com problema?'
];
