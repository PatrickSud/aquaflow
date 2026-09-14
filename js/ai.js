/* ai.js — Consultor. Funciona em dois modos:
   1) LOCAL (sempre disponível, offline): responde pelo motor de regras do próprio app.
   2) IA (opcional): manda o resumo técnico do aquário para um modelo de linguagem.

   A chave da IA fica só neste aparelho (IndexedDB local). Nada é enviado sem você perguntar. */

import {
  digest, systemPrompt, canAddFish, cyclingStatus, alerts, bioload, waterQuality,
  latest, lastN, trend, trendText, tpaCalc, primeDose, stabilityDose, compatibility,
  riskLabel, nextTestDue, fmtNum, fmtDate, relDay, statusOf, statusLabel, target, ageDays, series, specOf, allSpecies
} from './engine.js';
import { PARAMS, P, CORE, SPECIES_ZONA, SPECIES_CAMARAO, SPECIES_PLANTA, SPECIES_BETTA } from './model.js';

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
      o += `\n**Primeiro lote do seu plano:** ${first.qty}× ${specOf(aq, first.spec)?.n || first.spec} — ${c.level === 'ok' ? '🟢' : c.level === 'warn' ? '🟡' : '🔴'} ${riskLabel(c.level)}\n`;
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
  const found = allSpecies(aq).find((sp) => s.includes(sp.n.toLowerCase().split(' ')[0]) || (sp.sci && s.includes(sp.sci.toLowerCase().split(' ')[0])));
  if (!found) {
    o += 'Diga qual espécie e quantidade você está avaliando que eu analiso contra o volume útil, a fauna atual, os parâmetros medidos e a carga biológica.\n';
    o += '\nEspécies na base: ' + allSpecies(aq).filter((x) => x.id !== 'outro').map((x) => x.n).join(', ') + '.\n';
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

/** Prompt de sistema do modo livre: sem os dados do aquário nem as regras rígidas do modo padrão. */
function freeSystemPrompt() {
  return `Você é um consultor de aquarismo experiente, conversando em MODO LIVRE dentro do app AquaFlow.

Neste modo você NÃO está preso aos dados registrados deste aquário específico nem às regras rígidas do modo "Consultor deste aquário". Você pode:
- Opinar sobre espécies, produtos, marcas, equipamentos e técnicas que não estão cadastrados no app.
- Discutir assuntos de aquarismo em geral, mesmo que fujam do que foi configurado neste aquário.
- Trazer recomendações externas, comparações e alternativas, sem se limitar aos parâmetros configurados.

Mesmo assim, mantenha o bom senso técnico: deixe claro quando algo é uma opinião geral (não validada pelos dados deste aquário específico) e avise quando alguma sugestão puder ser arriscada para peixes ou plantas.

Responda sempre em português do Brasil, de forma direta e natural. Você não precisa terminar com uma pergunta obrigatória.`;
}

function withCtx(ctx, q) {
  return ctx ? `${ctx}\n\nPERGUNTA DO USUÁRIO:\n${q}` : q;
}

/** Envia a pergunta ao modelo. Em modo padrão, inclui o contexto e as regras deste aquário.
 *  Em modo livre (opts.free), a IA responde sem as regras rígidas; se opts.attachParams também
 *  estiver ligado, os parâmetros atuais vão junto só como referência (não como limite).
 *  Retorna { text, truncated } — truncated=true quando a resposta foi cortada pelo limite de
 *  tamanho do provedor, para o chamador poder avisar em vez de entregar uma frase pela metade.
 *  history = [{role:'user'|'model', text}] */
export async function aiAnswer(aq, question, cfg, history = [], opts = {}) {
  const free = !!opts.free;
  const attach = !!opts.attachParams;
  const sys = free ? freeSystemPrompt() : systemPrompt(aq);
  let ctx = '';
  if (!free) {
    ctx = `CONTEXTO ATUAL DO AQUÁRIO (dados reais registrados pelo usuário; use apenas estes números):\n\n${digest(aq)}`;
  } else if (attach) {
    ctx = `PARÂMETROS ATUAIS DESTE AQUÁRIO (apenas para você usar como referência nesta pergunta; você não precisa se limitar só a eles nem seguir as regras rígidas do modo consultor):\n\n${digest(aq)}`;
  }

  const CHAT_MAX_TOKENS = 2400; // o prompt do Consultor pede resposta estruturada (motivo, próximos passos,
  // nível de confiança, pergunta de fechamento) — 1400 cortava respostas no meio com frequência.
  let r;
  if (cfg.provider === 'gemini') r = await callGemini(sys, ctx, question, cfg, history, CHAT_MAX_TOKENS);
  else if (cfg.provider === 'openai') r = await callOpenAI(sys, ctx, question, cfg, history, CHAT_MAX_TOKENS);
  else if (cfg.provider === 'anthropic') r = await callClaude(sys, ctx, question, cfg, history, CHAT_MAX_TOKENS);
  else if (cfg.provider === 'proxy') r = await callProxy(sys, ctx, question, cfg, history);
  else throw new Error('Provedor de IA não configurado.');
  return r;
}

async function callGemini(sys, ctx, q, cfg, history, maxTokens = 1400) {
  const model = cfg.model || DEFAULT_MODELS.gemini;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const contents = [];
  history.slice(-8).forEach((m) => contents.push({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
  contents.push({ role: 'user', parts: [{ text: withCtx(ctx, q) }] });

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens }
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
  return { text: txt, truncated: cand?.finishReason === 'MAX_TOKENS' };
}

async function callOpenAI(sys, ctx, q, cfg, history, maxTokens = 1400) {
  const messages = [{ role: 'system', content: sys }];
  history.slice(-8).forEach((m) => messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  messages.push({ role: 'user', content: withCtx(ctx, q) });
  const r = await fetch(cfg.endpoint || 'https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: cfg.model || DEFAULT_MODELS.openai, messages, temperature: 0.4, max_tokens: maxTokens })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(friendlyError(r.status, j, 'openai'));
  const choice = j.choices?.[0];
  const txt = choice?.message?.content?.trim();
  if (!txt) throw new Error('O serviço de IA respondeu vazio.');
  return { text: txt, truncated: choice?.finish_reason === 'length' };
}

async function callClaude(sys, ctx, q, cfg, history, maxTokens = 1400) {
  const messages = [];
  history.slice(-8).forEach((m) => messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  messages.push({ role: 'user', content: withCtx(ctx, q) });
  const r = await fetch(cfg.endpoint || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({ model: cfg.model || DEFAULT_MODELS.anthropic, max_tokens: maxTokens, system: sys, messages })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(friendlyError(r.status, j, 'anthropic'));
  const txt = (j.content || []).map((b) => b.text || '').join('').trim();
  if (!txt) throw new Error('O serviço de IA respondeu vazio.');
  return { text: txt, truncated: j.stop_reason === 'max_tokens' };
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
  return { text: String(txt).trim(), truncated: false };
}

/** Testa a conexão configurada com uma pergunta mínima, sem enviar o resumo do
 *  aquário — só para confirmar que a chave/modelo/servidor realmente respondem. */
export async function testConnection(cfg) {
  const sys = 'Você é um verificador de conexão. Responda só com a palavra "ok".';
  const q = 'teste de conexão';
  let r;
  if (cfg.provider === 'gemini') r = await callGemini(sys, '', q, cfg, []);
  else if (cfg.provider === 'openai') r = await callOpenAI(sys, '', q, cfg, []);
  else if (cfg.provider === 'anthropic') r = await callClaude(sys, '', q, cfg, []);
  else if (cfg.provider === 'proxy') r = await callProxy(sys, '', q, cfg, []);
  else throw new Error('Provedor de IA não configurado.');
  return r.text;
}

/* ================= identificação de espécie (Fauna) ================= */

const SPECIES_JSON_SYS = 'Você é um banco de dados técnico de aquarismo de água doce. Responda SEMPRE apenas com um objeto JSON válido, sem ```, sem comentários e sem nenhum texto fora do JSON.';

function speciesPrompt(name) {
  return `Descreva, para uso em um app de aquarismo, a espécie/animal: "${name}".

Responda apenas um objeto JSON com exatamente estas chaves:
{
  "found": true ou false,
  "reason": "só se found=false: por que não dá pra identificar (em português)",
  "n": "nome popular em português",
  "sci": "nome científico ou vazio",
  "adult": número (tamanho adulto médio em cm),
  "zona": "fundo" | "meia-água" | "superfície" | "vidros",
  "bio": número de 0.1 a 3 (carga biológica relativa; neon ≈ 0.5, coridora ≈ 1, peixe grande ≥ 2),
  "grupo": inteiro (mínimo de indivíduos recomendado; 1 se solitário),
  "temp": [minimo, maximo] em °C,
  "ph": [minimo, maximo],
  "camarao": "self" | "baixo" | "medio" | "alto" (risco que oferece a camarões; "self" se a própria espécie for camarão/invertebrado),
  "planta": "baixo" | "medio" | "alto" (risco/dano que oferece a plantas),
  "betta": "self" | "ok" | "atencao" | "risco" (convivência com Betta macho; "self" se for o próprio Betta),
  "obs": "observação curta e prática em português (1-2 frases)"
}

Se "${name}" não for uma espécie real de aquarismo de água doce/comunitário ou o nome não for reconhecível, responda found=false e explique em "reason". Não invente números — use valores técnicos reais e conhecidos da espécie.`;
}

const ZONA_VALS = SPECIES_ZONA.map((o) => o.v);
const CAMARAO_VALS = SPECIES_CAMARAO.map((o) => o.v);
const PLANTA_VALS = SPECIES_PLANTA.map((o) => o.v);
const BETTA_VALS = SPECIES_BETTA.map((o) => o.v);

function invalidSpeciesJSON(raw, msg, truncated) {
  const err = new Error(truncated ? 'A resposta da IA foi cortada por exceder o limite de tamanho antes de terminar o JSON. Tente de novo — geralmente resolve na segunda tentativa.' : msg);
  err.raw = raw;
  err.truncated = !!truncated;
  return err;
}

function parseSpeciesJSON(raw, truncated) {
  let json;
  try {
    const m = String(raw).match(/\{[\s\S]*\}/);
    json = JSON.parse(m ? m[0] : raw);
  } catch (e) {
    throw invalidSpeciesJSON(raw, 'A IA não respondeu em um formato que eu conseguisse entender (não veio um JSON válido).', truncated);
  }
  if (!json || typeof json !== 'object') throw invalidSpeciesJSON(raw, 'A IA não respondeu em um formato que eu conseguisse entender.');

  if (json.found === false) {
    const err = invalidSpeciesJSON(raw, json.reason || 'A IA não reconheceu essa espécie.');
    err.notFound = true;
    throw err;
  }

  const n = String(json.n || '').trim();
  if (!n) throw invalidSpeciesJSON(raw, 'A resposta da IA veio sem o nome da espécie.');
  if (!ZONA_VALS.includes(json.zona)) throw invalidSpeciesJSON(raw, `A IA respondeu uma "zona" inesperada (${json.zona}).`);
  if (!CAMARAO_VALS.includes(json.camarao)) throw invalidSpeciesJSON(raw, `A IA respondeu um risco de "camarao" inesperado (${json.camarao}).`);
  if (!PLANTA_VALS.includes(json.planta)) throw invalidSpeciesJSON(raw, `A IA respondeu um risco de "planta" inesperado (${json.planta}).`);
  if (!BETTA_VALS.includes(json.betta)) throw invalidSpeciesJSON(raw, `A IA respondeu uma convivência com "betta" inesperada (${json.betta}).`);

  const range = (v, d) => (Array.isArray(v) && v.length === 2 && Number.isFinite(Number(v[0])) && Number.isFinite(Number(v[1])) ? [Number(v[0]), Number(v[1])] : d);
  const numOr = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

  return {
    n,
    sci: String(json.sci || '').trim(),
    adult: numOr(json.adult, 5),
    zona: json.zona,
    bio: Math.min(3, Math.max(0.1, numOr(json.bio, 1))),
    grupo: Math.max(1, Math.round(numOr(json.grupo, 1))),
    temp: range(json.temp, [22, 28]),
    ph: range(json.ph, [6.0, 8.0]),
    camarao: json.camarao,
    planta: json.planta,
    betta: json.betta,
    obs: String(json.obs || '').trim()
  };
}

/** Pergunta à IA as características técnicas de uma espécie fora da base fixa do app.
 *  Retorna um objeto pronto para virar uma entrada de aq.customSpecies (sem id).
 *  Lança erro com .raw (texto bruto da IA), .notFound e .truncated (resposta cortada por tamanho). */
export async function identifySpeciesAI(name, cfg) {
  if (!aiReady(cfg)) throw new Error('Conecte uma IA em "Configurar IA" para usar esta função.');
  const q = speciesPrompt(name);
  let r;
  if (cfg.provider === 'gemini') r = await callGemini(SPECIES_JSON_SYS, '', q, cfg, [], 2000);
  else if (cfg.provider === 'openai') r = await callOpenAI(SPECIES_JSON_SYS, '', q, cfg, [], 2000);
  else if (cfg.provider === 'anthropic') r = await callClaude(SPECIES_JSON_SYS, '', q, cfg, [], 2000);
  else if (cfg.provider === 'proxy') r = await callProxy(SPECIES_JSON_SYS, '', q, cfg, []);
  else throw new Error('Provedor de IA não configurado.');
  return parseSpeciesJSON(r.text, r.truncated);
}

/* ================= ordem do plano de povoamento (Fauna → Plano de povoamento) ================= */

const STOCKING_JSON_SYS = 'Você é um consultor de aquarismo especializado em ordem de introdução de peixes em aquários comunitários. Responda SEMPRE apenas com um objeto JSON válido, sem ```, sem comentários e sem nenhum texto fora do JSON.';

function stockingPrompt(aq, plan) {
  const lines = plan.map((p) => {
    const sp = specOf(aq, p.spec);
    return `- id=${p.id} | ${p.qty}× ${sp.n}${sp.sci ? ` (${sp.sci})` : ''} | zona: ${sp.zona} | cardume mínimo: ${sp.grupo} | risco p/ camarões: ${sp.camarao} | convivência c/ Betta: ${sp.betta} | carga biológica por indivíduo: ${sp.bio}${p.done ? ' [já introduzido]' : ''}`;
  }).join('\n');

  const live = (aq.livestock || []).filter((x) => x.status !== 'obito' && x.status !== 'removido');
  const liveTxt = live.length ? live.map((x) => `${x.qty}× ${specOf(aq, x.spec).n}`).join(', ') : 'nenhuma (aquário ainda sem fauna)';
  const bl = bioload(aq);

  return `Analise esta lista de LOTES PLANEJADOS para entrar, em sequência, neste aquário comunitário de água doce, e sugira a MELHOR ORDEM de introdução.

Considere, nesta prioridade:
1. Betta macho (se houver) sempre por último.
2. Espécies que dependem de aquário maduro/biofilme (ex.: Neritina, Otocinclus) entram depois das mais resistentes.
3. Lotes já marcados como "[já introduzido]" devem permanecer nas primeiras posições, na ordem em que estão.
4. Espécies territorialistas ou de fundo geralmente entram antes de espécies de meia-água/superfície mais ativas, para já terem território estabelecido.
5. A carga biológica acumulada ao longo da sequência — capacidade estimada deste aquário é ${bl.capacity} unidades, já em uso ${bl.used}.

FAUNA JÁ NO AQUÁRIO (fora do plano): ${liveTxt}.

LOTES PLANEJADOS (id, quantidade, espécie e características técnicas):
${lines}

Responda apenas um objeto JSON:
{
  "order": ["id do primeiro lote a entrar", "id do segundo", ...],
  "justification": "resumo direto do raciocínio geral, em português, em no máximo 3 frases curtas — NÃO narre lote por lote, só as razões principais que pesaram na ordem"
}

"order" deve conter exatamente os mesmos ids listados acima, cada um uma única vez, apenas reordenados — nunca invente ids novos nem omita algum. Seja conciso na justificativa: respostas longas são cortadas.`;
}

function parseStockingJSON(raw, planIds, truncated) {
  let json;
  try {
    const m = String(raw).match(/\{[\s\S]*\}/);
    json = JSON.parse(m ? m[0] : raw);
  } catch (e) {
    throw invalidSpeciesJSON(raw, 'A IA não respondeu em um formato que eu conseguisse entender (não veio um JSON válido).', truncated);
  }
  if (!json || typeof json !== 'object') throw invalidSpeciesJSON(raw, 'A IA não respondeu em um formato que eu conseguisse entender.');

  const order = Array.isArray(json.order) ? json.order.map(String) : null;
  const justification = String(json.justification || '').trim();
  if (!order) throw invalidSpeciesJSON(raw, 'A resposta da IA não veio com a lista "order".');
  if (!justification) throw invalidSpeciesJSON(raw, 'A resposta da IA veio sem a justificativa.');

  const wantSet = new Set(planIds);
  const gotSet = new Set(order);
  const sameSize = order.length === planIds.length;
  const sameIds = sameSize && planIds.every((id) => gotSet.has(id)) && order.every((id) => wantSet.has(id));
  if (!sameSize || !sameIds) throw invalidSpeciesJSON(raw, 'A IA devolveu uma lista de lotes diferente da que foi enviada — talvez tenha inventado ou esquecido algum id.');

  return { order, justification };
}

/** Pede à IA uma sugestão de ordem para os lotes de aq.stocking.plan, com justificativa.
 *  Não altera nada — só devolve { order, justification } para o chamador decidir se aplica.
 *  Lança erro com .raw (texto bruto da IA) e .truncated quando a resposta não é utilizável. */
export async function planStockingOrderAI(aq, cfg) {
  if (!aiReady(cfg)) throw new Error('Conecte uma IA em "Configurar IA" para usar esta função.');
  const plan = aq.stocking?.plan || [];
  if (plan.length < 2) throw new Error('Adicione pelo menos 2 lotes ao plano para pedir uma ordem à IA.');
  const q = stockingPrompt(aq, plan);
  let r;
  if (cfg.provider === 'gemini') r = await callGemini(STOCKING_JSON_SYS, '', q, cfg, [], 3000);
  else if (cfg.provider === 'openai') r = await callOpenAI(STOCKING_JSON_SYS, '', q, cfg, [], 3000);
  else if (cfg.provider === 'anthropic') r = await callClaude(STOCKING_JSON_SYS, '', q, cfg, [], 3000);
  else if (cfg.provider === 'proxy') r = await callProxy(STOCKING_JSON_SYS, '', q, cfg, []);
  else throw new Error('Provedor de IA não configurado.');
  return parseStockingJSON(r.text, plan.map((p) => p.id), r.truncated);
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
