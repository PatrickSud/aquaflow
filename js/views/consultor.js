/* views/consultor.js — o Consultor. Responde pelo motor local e, se configurado, pela IA. */

import { h, icon, mdToHTML, toast, sheet, field, input, select, empty, pill, confirmSheet } from '../ui.js';
import { state, save } from '../store.js';
import { localAnswer, aiAnswer, aiReady, SUGGESTIONS, AI_PROVIDERS, DEFAULT_MODELS, testConnection } from '../ai.js';
import { digest, canAddFish, cyclingStatus, waterQuality, statusLabel } from '../engine.js';

export default function consultor(ctx) {
  const aq = ctx.aq;
  const cfg = state.settings.ai;
  const el = h('div');
  let busy = false;

  aq.chat = aq.chat || [];

  const chat = h('div', { class: 'chat' });
  const chipsRow = h('div', { class: 'chips' });

  const scroll = () => requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));

  const bubble = (m) => {
    if (m.role === 'user') return h('div', { class: 'msg me', text: m.text });
    const b = h('div', { class: 'msg bot' });
    b.innerHTML = mdToHTML(m.text);
    if (m.src) b.appendChild(h('div', { style: { marginTop: '9px', fontSize: '11px', color: 'var(--tx-3)' }, text: m.src === 'ia' ? 'Resposta gerada por IA a partir dos seus registros' : 'Análise do motor de regras do app (offline)' }));
    return b;
  };

  const renderChat = () => {
    chat.innerHTML = '';
    if (!aq.chat.length) {
      const wq = waterQuality(aq);
      const cyc = cyclingStatus(aq);
      const gate = canAddFish(aq);
      const intro = h('div', { class: 'msg bot' });
      intro.innerHTML = mdToHTML(
        `Sou o consultor deste aquário. Eu leio o **seu histórico** antes de responder — não dou resposta genérica.\n\n` +
        `**Agora:** água ${statusLabel(wq.status).toLowerCase()}, ${cyc.label.toLowerCase()}, dia ${cyc.day}.\n` +
        `**Povoamento:** ${gate.level === 'ok' ? '🟢 liberado' : gate.level === 'warn' ? '🟡 condicional' : '🔴 não recomendado'} — ${gate.title.toLowerCase()}.\n\n` +
        `Pergunte o que quiser, ou toque em uma das sugestões abaixo.`
      );
      chat.appendChild(intro);
    }
    aq.chat.forEach((m) => chat.appendChild(bubble(m)));
  };

  const think = () => {
    const b = h('div', { class: 'msg bot' }, h('span', { class: 'typing' }, h('i'), h('i'), h('i')));
    chat.appendChild(b); scroll();
    return b;
  };

  const send = async (q) => {
    if (busy || !q.trim()) return;
    busy = true;
    ta.value = ''; ta.style.height = 'auto';
    aq.chat.push({ role: 'user', text: q.trim() });
    chat.appendChild(bubble({ role: 'user', text: q.trim() }));
    save();
    scroll();

    const t = think();
    try {
      let text, src;
      if (aiReady(cfg)) {
        const hist = aq.chat.slice(-9, -1).map((m) => ({ role: m.role, text: m.text }));
        text = await aiAnswer(aq, q.trim(), cfg, hist);
        src = 'ia';
      } else {
        await new Promise((r) => setTimeout(r, 260));
        text = localAnswer(aq, q.trim());
        src = 'local';
      }
      t.remove();
      aq.chat.push({ role: 'model', text, src });
      chat.appendChild(bubble({ role: 'model', text, src }));
      save();
    } catch (e) {
      t.remove();
      const fb = localAnswer(aq, q.trim());
      const msg = `**Não consegui falar com a IA.**\n${e.message}\n\nSegue a análise do motor local do app:\n\n${fb}`;
      aq.chat.push({ role: 'model', text: msg, src: 'local' });
      chat.appendChild(bubble({ role: 'model', text: msg, src: 'local' }));
      save();
    }
    busy = false;
    scroll();
  };

  /* status da IA */
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

  el.appendChild(chat);
  renderChat();

  SUGGESTIONS.forEach((s) => chipsRow.appendChild(h('button', { class: 'chip', text: s, onclick: () => send(s) })));
  el.appendChild(chipsRow);

  const ta = h('textarea', { placeholder: 'Pergunte sobre o seu aquário…', rows: '1' });
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(130, ta.scrollHeight) + 'px'; });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 900) { e.preventDefault(); send(ta.value); } });
  el.appendChild(h('div', { class: 'chat-in' }, ta,
    h('button', { class: 'send', 'aria-label': 'Enviar', onclick: () => send(ta.value) }, icon('send', 'ic ic-sm'))));

  return {
    title: 'Consultor',
    actions: [
      { icon: 'sliders', label: 'Configurar IA', on: () => openAIConfig(ctx) },
      { icon: 'trash', label: 'Limpar conversa', on: () => confirmSheet({ title: 'Limpar conversa?', message: 'As respostas são apagadas. Seus registros do aquário não são afetados.', confirmText: 'Limpar', danger: true, onConfirm: () => { aq.chat = []; save({ immediate: true }); ctx.refresh(); } }) }
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
        h('div', { class: 'alert-d', text: 'Sem IA, o Consultor já responde pelo motor de regras do app, offline. Conectando uma IA, ele passa a receber o resumo técnico do seu aquário e responde com mais flexibilidade. A chave fica guardada só neste aparelho.' }))));

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
              bb.appendChild(h('div', { class: 'note', style: { marginBottom: '10px' }, text: 'Exatamente este resumo (mais a sua pergunta) é enviado ao serviço escolhido. Nenhuma foto é enviada.' }));
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
          state.settings.ai = { provider: 'gemini', model: DEFAULT_MODELS.gemini, key: '', endpoint: '', proxyUrl: '' };
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
