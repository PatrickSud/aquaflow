/* views/consultor.js — o Consultor. Responde pelo motor local e, se configurado, pela IA.
   Cada assunto vira uma conversa própria (como as abas de um projeto): esta tela lista as
   conversas existentes e permite abrir uma nova; a conversa em si vive em consultorThread. */

import { h, icon, mdToHTML, toast, sheet, field, input, select, empty, pill, row, segmented, switchBtn, confirmSheet } from '../ui.js';
import { state, save, uid, nowISO } from '../store.js';
import { localAnswer, aiAnswer, aiReady, SUGGESTIONS, AI_PROVIDERS, DEFAULT_MODELS, testConnection } from '../ai.js';
import { digest, canAddFish, cyclingStatus, waterQuality, statusLabel, relDay } from '../engine.js';

/** Garante aq.chats (lista de conversas) e migra o antigo aq.chat (uma conversa só, sem fim). */
function ensureChats(aq) {
  if (!Array.isArray(aq.chats)) aq.chats = [];
  if (Array.isArray(aq.chat) && aq.chat.length) {
    aq.chats.unshift({
      id: uid(),
      title: threadTitle(aq.chat.find((m) => m.role === 'user')?.text),
      createdAt: aq.chat[0]?.at || nowISO(),
      updatedAt: nowISO(),
      messages: aq.chat
    });
    delete aq.chat;
    save({ immediate: true });
  }
  return aq.chats;
}

function threadTitle(q) {
  const t = String(q || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Nova conversa';
  return t.length > 42 ? t.slice(0, 42).trimEnd() + '…' : t;
}

function preview(c) {
  const last = c.messages?.[c.messages.length - 1];
  if (!last) return 'Sem mensagens';
  const t = String(last.text || '').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim();
  const clip = t.length > 64 ? t.slice(0, 64).trimEnd() + '…' : t;
  return last.role === 'user' ? `Você: ${clip}` : clip;
}

const pendingAnswers = new Set(); // evita duplicar a resposta se o usuário sair e voltar à conversa antes dela terminar

const SRC_LABEL = {
  ia: 'Resposta gerada por IA a partir dos seus registros',
  'ia-livre': 'Resposta gerada por IA em modo livre — pode trazer opiniões e informações além dos dados deste aquário',
  'ia-livre-dados': 'Resposta gerada por IA em modo livre, considerando os parâmetros atuais deste aquário como referência',
  local: 'Análise do motor de regras do app (offline)'
};

const bubble = (m) => {
  if (m.role === 'user') return h('div', { class: 'msg me', text: m.text });
  const b = h('div', { class: 'msg bot' });
  b.innerHTML = mdToHTML(m.text);
  if (m.src) b.appendChild(h('div', { style: { marginTop: '9px', fontSize: '11px', color: 'var(--tx-3)' }, text: SRC_LABEL[m.src] || SRC_LABEL.local }));
  return b;
};

/* ================= lista de conversas ================= */
export default function consultor(ctx) {
  const aq = ctx.aq;
  const cfg = state.settings.ai;
  const chats = ensureChats(aq);
  const el = h('div');

  const statusCard = h('div');
  const drawStatus = () => {
    statusCard.innerHTML = '';
    if (aiReady(cfg)) {
      statusCard.appendChild(h('div', { class: 'card press', onclick: () => openAIConfig(ctx) }, h('div', { class: 'card-row' },
        h('div', { class: 'badge-ic' }, icon('bulb', 'ic ic-sm')),
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title', text: 'IA conectada' }),
          h('div', { class: 'row-sub', text: `${AI_PROVIDERS.find((p) => p.v === cfg.provider)?.n || cfg.provider}${cfg.model ? ' · ' + cfg.model : ''}` })),
        pill('ok', 'Ativa'))));
    } else {
      statusCard.appendChild(h('div', { class: 'card press', onclick: () => openAIConfig(ctx) }, h('div', { class: 'card-row' },
        h('div', { class: 'badge-ic' }, icon('bulb', 'ic ic-sm')),
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title', text: 'Modo offline (motor de regras)' }),
          h('div', { class: 'row-sub', text: 'Funciona sem internet. Toque para conectar uma IA e ter respostas mais soltas.' })),
        h('span', { class: 'chev' }, icon('chev', 'ic ic-sm')))));
    }
  };
  drawStatus();
  el.appendChild(statusCard);

  el.appendChild(h('div', { class: 'sec-title', text: 'Conversas' }));
  const listWrap = h('div');
  const renderList = () => {
    listWrap.innerHTML = '';
    const sorted = [...chats].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    if (!sorted.length) {
      listWrap.appendChild(h('div', { class: 'card' }, empty('bulb', 'Nenhuma conversa ainda. Pergunte algo abaixo ou toque em uma sugestão.')));
      return;
    }
    const card = h('div', { class: 'card' });
    sorted.forEach((c) => card.appendChild(row(c.title, `${preview(c)} · ${relDay(c.updatedAt)}`, {
      onClick: () => ctx.nav('consultor/' + c.id),
      right: h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, c.free ? pill('info', 'Livre') : null, icon('chev', 'ic ic-sm'))
    })));
    listWrap.appendChild(card);
  };
  renderList();
  el.appendChild(listWrap);

  function startChat(q) {
    q = (q || '').trim();
    if (!q) return;
    const now = nowISO();
    const c = { id: uid(), title: threadTitle(q), createdAt: now, updatedAt: now, messages: [{ role: 'user', text: q }] };
    chats.unshift(c);
    save({ immediate: true });
    ctx.nav('consultor/' + c.id);
  }

  const chipsRow = h('div', { class: 'chips' });
  SUGGESTIONS.forEach((s) => chipsRow.appendChild(h('button', { class: 'chip', text: s, onclick: () => startChat(s) })));
  el.appendChild(chipsRow);

  const ta = h('textarea', { placeholder: 'Nova conversa…', rows: '1' });
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(130, ta.scrollHeight) + 'px'; });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 900) { e.preventDefault(); startChat(ta.value); } });
  el.appendChild(h('div', { class: 'chat-in' }, ta,
    h('button', { class: 'send', 'aria-label': 'Iniciar conversa', onclick: () => startChat(ta.value) }, icon('send', 'ic ic-sm'))));

  return {
    title: 'Consultor',
    actions: [{ icon: 'sliders', label: 'Configurar IA', on: () => openAIConfig(ctx) }],
    el
  };
}

/* ================= uma conversa ================= */
export function consultorThread(ctx, id) {
  const aq = ctx.aq;
  const cfg = state.settings.ai;
  const chats = ensureChats(aq);
  const thread = chats.find((c) => c.id === id);

  if (!thread) {
    setTimeout(() => ctx.nav('consultor'), 0);
    return { title: 'Consultor', back: true, el: h('div') };
  }

  const el = h('div');
  let busy = false;
  const chat = h('div', { class: 'chat' });

  const scroll = () => requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));

  const renderChat = () => {
    chat.innerHTML = '';
    thread.messages.forEach((m) => chat.appendChild(bubble(m)));
  };

  const think = () => {
    const b = h('div', { class: 'msg bot' }, h('span', { class: 'typing' }, h('i'), h('i'), h('i')));
    chat.appendChild(b); scroll();
    return b;
  };

  const attachOn = () => (thread.attachParams !== undefined ? !!thread.attachParams : !!cfg.attachParamsDefault);

  const answer = async (q) => {
    const t = think();
    try {
      let text, src;
      if (aiReady(cfg)) {
        const hist = thread.messages.slice(0, -1).slice(-8).map((m) => ({ role: m.role, text: m.text }));
        const attach = !!thread.free && attachOn();
        text = await aiAnswer(aq, q, cfg, hist, { free: !!thread.free, attachParams: attach });
        src = thread.free ? (attach ? 'ia-livre-dados' : 'ia-livre') : 'ia';
      } else {
        await new Promise((r) => setTimeout(r, 260));
        text = localAnswer(aq, q);
        src = 'local';
      }
      t.remove();
      thread.messages.push({ role: 'model', text, src });
      thread.updatedAt = nowISO();
      chat.appendChild(bubble({ role: 'model', text, src }));
      save();
    } catch (e) {
      t.remove();
      const fb = localAnswer(aq, q);
      const msg = `**Não consegui falar com a IA.**\n${e.message}\n\nSegue a análise do motor local do app:\n\n${fb}`;
      thread.messages.push({ role: 'model', text: msg, src: 'local' });
      thread.updatedAt = nowISO();
      chat.appendChild(bubble({ role: 'model', text: msg, src: 'local' }));
      save();
    }
    busy = false;
    scroll();
  };

  const send = async (q) => {
    if (busy || !q.trim()) return;
    busy = true;
    ta.value = ''; ta.style.height = 'auto';
    thread.messages.push({ role: 'user', text: q.trim() });
    thread.updatedAt = nowISO();
    chat.appendChild(bubble({ role: 'user', text: q.trim() }));
    save();
    scroll();
    await answer(q.trim());
  };

  el.appendChild(chat);
  renderChat();

  const composeWrap = h('div', { style: { position: 'sticky', bottom: '0', background: 'linear-gradient(to top, var(--bg) 70%, transparent)', paddingTop: '8px' } });

  const controlsCard = h('div', { class: 'card' });
  const drawControls = () => {
    controlsCard.innerHTML = '';
    controlsCard.appendChild(h('div', { class: 'card-pad', style: { paddingBottom: thread.free ? '10px' : '14px' } }, segmented(
      [{ v: false, n: 'Consultor do aquário' }, { v: true, n: 'Modo livre' }],
      !!thread.free,
      (v) => {
        thread.free = v;
        thread.updatedAt = nowISO();
        save();
        toast(v ? 'Modo livre ativado — a IA pode opinar além dos dados deste aquário' : 'Voltou a considerar os dados registrados deste aquário', v ? '' : 'ok');
        drawControls();
      }
    )));
    if (thread.free) {
      controlsCard.appendChild(h('div', { class: 'card-row' },
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title', text: 'Incluir parâmetros deste aquário' }),
          h('div', { class: 'row-sub', text: 'A IA usa como referência, mas continua livre para opinar além deles' })),
        switchBtn(attachOn(), (v) => {
          thread.attachParams = v;
          thread.updatedAt = nowISO();
          cfg.attachParamsDefault = v; // lembra a escolha para as próximas conversas
          save();
        })));
    }
  };
  drawControls();

  if (aiReady(cfg)) {
    composeWrap.appendChild(controlsCard);
    composeWrap.appendChild(h('div', { style: { height: '8px' } }));
  }

  const ta = h('textarea', { placeholder: 'Pergunte sobre o seu aquário…', rows: '1' });
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(130, ta.scrollHeight) + 'px'; });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 900) { e.preventDefault(); send(ta.value); } });
  composeWrap.appendChild(h('div', { class: 'chat-in', style: { position: 'static', background: 'none', padding: '0 0 2px' } }, ta,
    h('button', { class: 'send', 'aria-label': 'Enviar', onclick: () => send(ta.value) }, icon('send', 'ic ic-sm'))));
  el.appendChild(composeWrap);

  // conversa recém-criada na lista: a pergunta já está registrada, falta responder
  const last = thread.messages[thread.messages.length - 1];
  if (last && last.role === 'user' && !pendingAnswers.has(thread.id)) {
    pendingAnswers.add(thread.id);
    busy = true;
    scroll();
    setTimeout(() => answer(last.text).finally(() => pendingAnswers.delete(thread.id)), 30);
  }

  return {
    title: thread.title,
    back: true,
    actions: [
      { icon: 'sliders', label: 'Configurar IA', on: () => openAIConfig(ctx) },
      {
        icon: 'trash', label: 'Excluir conversa', on: () => confirmSheet({
          title: 'Excluir conversa?', message: 'Esta conversa será apagada. Seus registros do aquário não são afetados.', confirmText: 'Excluir', danger: true,
          onConfirm: () => { const i = chats.findIndex((c) => c.id === id); if (i >= 0) chats.splice(i, 1); save({ immediate: true }); ctx.nav('consultor'); }
        })
      }
    ],
    el
  };
}

/* ================= configuração da IA ================= */
export function openAIConfig(ctx) {
  const cfg = Object.assign({ provider: 'gemini', model: DEFAULT_MODELS.gemini, key: '', endpoint: '', proxyUrl: '' }, state.settings.ai);

  return sheet({
    title: 'Consultor com IA',
    big: true,
    body: (b) => {
      const out = h('div');
      const dyn = h('div');

      out.appendChild(h('div', { class: 'alert info' }, icon('shield', 'ic'), h('div', {},
        h('div', { class: 'alert-t', text: 'Como funciona' }),
        h('div', { class: 'alert-d', text: 'Sem IA, o Consultor já responde pelo motor de regras do app, offline. Conectando uma IA, cada conversa tem duas formas de responder: "Consultor do aquário" (usa o resumo técnico e as regras de segurança deste aquário) ou "Modo livre" (a IA opina mais solta, sem se prender aos dados registrados nem às regras rígidas — e, se você quiser, pode incluir os parâmetros atuais só como referência). Você escolhe o modo dentro de cada conversa. A chave fica guardada só neste aparelho.' }))));

      out.appendChild(field('Serviço', select(AI_PROVIDERS.map((p) => ({ v: p.v, n: p.n, sel: p.v === cfg.provider })), {
        onchange: (e) => { cfg.provider = e.target.value; cfg.model = DEFAULT_MODELS[cfg.provider] || ''; draw(); }
      })));

      const testBtn = () => h('button', {
        class: 'btn sec', style: { marginBottom: '14px' }, onclick: async (ev) => {
          const ready = cfg.provider === 'proxy' ? !!cfg.proxyUrl : !!cfg.key;
          if (!ready) { toast(cfg.provider === 'proxy' ? 'Informe o endereço do servidor primeiro' : 'Cole a chave primeiro', 'bad'); return; }
          const btn = ev.currentTarget;
          const orig = btn.textContent;
          btn.disabled = true; btn.textContent = 'Testando…';
          try {
            await testConnection(cfg);
            toast('Conexão funcionando', 'ok');
          } catch (err) {
            toast(err.message, 'bad');
          }
          btn.disabled = false; btn.textContent = orig;
        }
      }, icon('checkCircle', 'ic ic-sm'), 'Testar conexão');

      const draw = () => {
        dyn.innerHTML = '';
        if (cfg.provider === 'proxy') {
          dyn.appendChild(field('Endereço do seu servidor', input({ value: cfg.proxyUrl, placeholder: 'https://meu-proxy.workers.dev', oninput: (e) => { cfg.proxyUrl = e.target.value.trim(); } }),
            'O app envia POST com {system, context, prompt, history} e espera {"reply":"..."} de volta. É a forma segura de não expor a chave.'));
          dyn.appendChild(h('div', { class: 'note', style: { marginBottom: '14px' } }, 'Recomendado se você for compartilhar o app com outras pessoas.'));
          dyn.appendChild(testBtn());
          return;
        }

        const helpTxt = {
          gemini: 'Crie a chave em aistudio.google.com → "Get API key". O plano gratuito existe e não pede cartão, mas vale apenas para modelos Flash e tem limite por minuto e por dia.',
          openai: 'Crie a chave em platform.openai.com. A OpenAI não tem plano gratuito permanente — é necessário adicionar crédito.',
          anthropic: 'Crie a chave em console.anthropic.com. Também exige crédito pré-pago.'
        }[cfg.provider];

        dyn.appendChild(field('Chave da API', input({ type: 'password', value: cfg.key, placeholder: 'cole a chave aqui', autocomplete: 'off', oninput: (e) => { cfg.key = e.target.value.trim(); } }), helpTxt));

        const modelRow = h('div');
        modelRow.appendChild(field('Modelo', input({ value: cfg.model, placeholder: DEFAULT_MODELS[cfg.provider], oninput: (e) => { cfg.model = e.target.value.trim(); } }),
          'Os nomes de modelo mudam com o tempo. Se der erro de "modelo não encontrado", busque a lista abaixo.'));
        dyn.appendChild(modelRow);

        if (cfg.provider === 'gemini') {
          const listBox = h('div');
          dyn.appendChild(h('button', {
            class: 'btn sec', style: { marginBottom: '14px' }, onclick: async (ev) => {
              if (!cfg.key) { toast('Cole a chave primeiro', 'bad'); return; }
              const btn = ev.currentTarget;
              btn.disabled = true; btn.textContent = 'Buscando…';
              try {
                const { listGeminiModels } = await import('../ai.js');
                const ms = await listGeminiModels(cfg.key);
                listBox.innerHTML = '';
                const sel = select(ms.map((m) => ({ v: m.id, n: m.id, sel: m.id === cfg.model })), { onchange: (e) => { cfg.model = e.target.value; } });
                listBox.appendChild(field(`Modelos disponíveis para a sua chave (${ms.length})`, sel));
                toast(`${ms.length} modelos encontrados`, 'ok');
              } catch (err) {
                toast(err.message, 'bad');
              }
              btn.disabled = false; btn.textContent = 'Buscar modelos disponíveis';
            }
          }, 'Buscar modelos disponíveis'));
          dyn.appendChild(listBox);
        }

        dyn.appendChild(testBtn());

        dyn.appendChild(h('div', { class: 'alert warn' }, icon('alert', 'ic'), h('div', {},
          h('div', { class: 'alert-t', text: 'Sobre guardar a chave no aparelho' }),
          h('div', { class: 'alert-d', text: 'Para uso pessoal isso é aceitável: a chave fica no armazenamento do seu navegador, neste aparelho. Se você for publicar o app para outras pessoas, use a opção "Meu próprio servidor / proxy" — assim a chave nunca vai para o celular de ninguém.' }))));
      };

      out.appendChild(dyn);
      draw();
      b.appendChild(out);

      b.appendChild(h('button', {
        class: 'btn ghost', onclick: () => {
          const d = digest(ctx.aq);
          sheet({
            title: 'O que é enviado à IA',
            big: true,
            body: (bb) => {
              bb.appendChild(h('div', { class: 'note', style: { marginBottom: '10px' }, text: 'Exatamente este resumo (mais a sua pergunta) é enviado ao serviço escolhido quando a conversa está no modo "Consultor do aquário". No "Modo livre", este resumo só é enviado se você ligar "Incluir parâmetros deste aquário" naquela conversa — caso contrário, só a sua pergunta vai. Nenhuma foto é enviada em nenhum dos casos.' }));
              bb.appendChild(h('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '11.5px', color: 'var(--tx-2)', background: 'var(--card)', padding: '12px', borderRadius: '10px', overflowX: 'auto' }, text: d }));
            },
            actions: (c) => h('button', { class: 'btn sec', text: 'Fechar', onclick: () => c() })
          });
        }
      }, icon('eye', 'ic ic-sm'), 'Ver exatamente o que é enviado'));
    },
    actions: (close) => h('div', { class: 'btn-row', style: { paddingTop: '6px' } },
      h('button', {
        class: 'btn sec', text: 'Desconectar', onclick: () => {
          state.settings.ai = Object.assign({}, state.settings.ai, { provider: 'gemini', model: DEFAULT_MODELS.gemini, key: '', endpoint: '', proxyUrl: '' });
          save({ immediate: true }); close(); toast('IA desconectada — usando o motor local'); ctx.refresh();
        }
      }),
      h('button', {
        class: 'btn', text: 'Salvar', onclick: async () => {
          state.settings.ai = cfg;
          await save({ immediate: true });
          close();
          toast(aiReady(cfg) ? 'IA conectada' : 'Configuração salva', aiReady(cfg) ? 'ok' : '');
          ctx.refresh();
        }
      })
    )
  });
}
