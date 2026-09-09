/* views/settings.js — ajustes, backup, instalação e informações. */

import {
  h, icon, cardHead, row, pill, sheet, toast, field, input, empty, kv,
  download, confirmSheet, switchBtn
} from '../ui.js';
import { state, save, exportJSON, importJSON, storageInfo } from '../store.js';
import { aiReady, AI_PROVIDERS } from '../ai.js';
import { fmtNum, fmtDate, relDay, ageDays } from '../engine.js';
import { env, isInstalled, promptInstall, canOfferInstall } from '../pwa.js';
import { openAIConfig } from './consultor.js';
import * as cloud from '../cloud.js';

const APP_VERSION = '1.0.0';

export default function settings(ctx) {
  const aq = ctx.aq;
  const el = h('div');
  const cfg = state.settings.ai;

  /* aquário */
  el.appendChild(h('div', { class: 'sec-title', text: 'Aquário' }));
  const c1 = h('div', { class: 'card' });
  if (aq) {
    c1.appendChild(row(aq.name, `${fmtNum(aq.volUtil, 0)} L úteis · ${ageDays(aq)} dias`, { onClick: () => ctx.nav('aquarios/editar/' + aq.id), left: h('div', { style: { width: '34px', height: '34px', borderRadius: '9px', background: aq.color + '22', color: aq.color, display: 'grid', placeItems: 'center' } }, icon('tank', 'ic ic-sm')) }));
    c1.appendChild(row('Parâmetros ideais', 'faixas de 🟢 🟡 🔴', { onClick: () => ctx.nav('parametros/metas') }));
    c1.appendChild(row('Ciclagem', aq.cycling?.done ? 'concluída' : 'em andamento', { onClick: () => ctx.nav('ciclagem') }));
  }
  c1.appendChild(row('Meus aquários', `${state.aquariums.length} cadastrado(s)`, { onClick: () => ctx.nav('aquarios') }));
  el.appendChild(c1);

  /* registros */
  el.appendChild(h('div', { class: 'sec-title', text: 'Registros' }));
  const c2 = h('div', { class: 'card' });
  c2.appendChild(row('TPA', `${(aq?.tpas || []).length} registro(s)`, { onClick: () => ctx.nav('tpa'), left: icon('drop', 'ic') }));
  c2.appendChild(row('Dosagens', `${(aq?.dosings || []).length} registro(s)`, { onClick: () => ctx.nav('dosagens'), left: icon('box', 'ic') }));
  c2.appendChild(row('Alimentação', `${(aq?.feedings || []).length} registro(s)`, { onClick: () => ctx.nav('alimentacao'), left: icon('food', 'ic') }));
  c2.appendChild(row('Plantas', `${(aq?.plants || []).length} espécie(s)`, { onClick: () => ctx.nav('plantas'), left: icon('leaf', 'ic') }));
  c2.appendChild(row('Diário', `${(aq?.notes || []).length} nota(s)`, { onClick: () => ctx.nav('diario'), left: icon('book', 'ic') }));
  c2.appendChild(row('Histórico e gráficos', `${(aq?.tests || []).length} medição(ões)`, { onClick: () => ctx.nav('historico'), left: icon('chart', 'ic') }));
  el.appendChild(c2);

  /* conta e nuvem */
  el.appendChild(h('div', { class: 'sec-title', text: 'Conta e nuvem' }));
  const cacc = h('div', { class: 'card' });
  const cu = cloud.status.user;
  const pend = cu ? cloud.pendingCount() : 0;
  cacc.appendChild(row(
    cu ? cu.email : cloud.isConfigured() ? 'Entrar com e-mail e senha' : 'Ativar login e nuvem',
    cu
      ? (pend ? `${pend} registro(s) aguardando envio` : cloud.status.lastSync ? `sincronizado ${relDay(cloud.status.lastSync)}` : 'conectado')
      : cloud.isConfigured() ? 'sincronize entre celular e computador' : 'os dados estão só neste aparelho',
    {
      left: icon('user', 'ic'),
      right: cu ? pill(pend ? 'warn' : 'ok', pend ? 'Pendente' : 'Em dia') : null,
      onClick: () => ctx.nav('conta')
    }
  ));
  el.appendChild(cacc);

  /* consultor */
  el.appendChild(h('div', { class: 'sec-title', text: 'Consultor' }));
  const c3 = h('div', { class: 'card' });
  c3.appendChild(row('Consultor com IA', aiReady(cfg) ? `${AI_PROVIDERS.find((p) => p.v === cfg.provider)?.n || cfg.provider}` : 'motor local (offline)', {
    left: icon('bulb', 'ic'), right: pill(aiReady(cfg) ? 'ok' : null, aiReady(cfg) ? 'Ativa' : 'Offline'), onClick: () => openAIConfig(ctx)
  }));
  el.appendChild(c3);

  /* instalação */
  el.appendChild(h('div', { class: 'sec-title', text: 'Aplicativo' }));
  const c4 = h('div', { class: 'card' });
  if (isInstalled()) {
    c4.appendChild(row('Instalado no aparelho', 'rodando em tela cheia', { left: icon('checkCircle', 'ic'), right: pill('ok', 'Ok') }));
  } else {
    c4.appendChild(row('Instalar na tela de início', env.ios ? 'Compartilhar → Adicionar à Tela de Início' : 'funciona sem internet depois de instalado', { left: icon('down', 'ic'), onClick: () => promptInstall() }));
  }
  c4.appendChild(h('div', { class: 'card-row' },
    icon('bell', 'ic'),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title', text: 'Lembretes no aparelho' }),
      h('div', { class: 'row-sub', text: 'Aviso das tarefas do dia enquanto o app estiver aberto' })),
    switchBtn(state.settings.notif, async (v) => {
      state.settings.notif = v; save();
      if (v && 'Notification' in window) {
        const p = await Notification.requestPermission();
        if (p !== 'granted') { toast('Permissão de notificação não concedida', 'bad'); state.settings.notif = false; save(); ctx.refresh(); }
        else toast('Lembretes ativados', 'ok');
      }
    })));
  c4.appendChild(row('Buscar atualização', 'recarrega a versão mais nova publicada', {
    left: icon('refresh', 'ic'),
    onClick: async () => {
      if ('serviceWorker' in navigator) {
        const rs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(rs.map((r) => r.update()));
      }
      toast('Procurando atualização…');
      setTimeout(() => location.reload(), 900);
    }
  }));
  el.appendChild(c4);

  /* backup */
  el.appendChild(h('div', { class: 'sec-title', text: 'Backup dos seus dados' }));
  el.appendChild(h('div', { class: 'alert info' }, icon('shield', 'ic'), h('div', {},
    h('div', { class: 'alert-t', text: 'Tudo fica neste aparelho' }),
    h('div', { class: 'alert-d', text: 'Não existe servidor nem conta: seus registros ficam guardados no navegador deste celular. Se você limpar os dados do navegador, desinstalar o app ou trocar de aparelho, os dados vão embora. Faça o backup de vez em quando.' }))));

  const c5 = h('div', { class: 'card' });
  c5.appendChild(row('Exportar backup completo', 'arquivo .json com tudo, inclusive as fotos', {
    left: icon('down', 'ic'),
    onClick: async () => {
      toast('Preparando backup…');
      const txt = await exportJSON();
      download(`aquaflow-backup-${new Date().toISOString().slice(0, 10)}.json`, txt);
      toast('Backup gerado', 'ok');
    }
  }));
  c5.appendChild(row('Restaurar backup', 'substitui os dados atuais', {
    left: icon('up', 'ic'),
    onClick: () => {
      const inp = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
      inp.addEventListener('change', async () => {
        const f = inp.files?.[0]; if (!f) return;
        const txt = await f.text();
        confirmSheet({
          title: 'Restaurar este backup?',
          message: 'Os dados atuais deste aparelho serão substituídos pelos do arquivo. Faça um backup do que está aqui antes, se for o caso.',
          confirmText: 'Restaurar', danger: true,
          onConfirm: async () => {
            try { await importJSON(txt); toast('Backup restaurado', 'ok'); setTimeout(() => location.reload(), 700); }
            catch (e) { toast(e.message, 'bad'); }
          }
        });
      });
      document.body.appendChild(inp); inp.click(); setTimeout(() => inp.remove(), 1000);
    }
  }));
  const storeRow = row('Espaço usado', 'calculando…', { left: icon('box', 'ic') });
  c5.appendChild(storeRow);
  storageInfo().then((i) => {
    const sub = storeRow.querySelector('.row-sub span');
    if (!i) { if (sub) sub.textContent = 'não disponível neste navegador'; return; }
    const mb = (i.used / 1048576).toFixed(1);
    const qmb = (i.quota / 1048576).toFixed(0);
    if (sub) sub.textContent = `${mb} MB de ~${qmb} MB disponíveis`;
  });
  el.appendChild(c5);

  /* zona de risco */
  el.appendChild(h('div', { class: 'sec-title', text: 'Zona de risco' }));
  const c6 = h('div', { class: 'card' });
  c6.appendChild(h('div', {
    class: 'card-row press', onclick: () => confirmSheet({
      title: 'Apagar TUDO?',
      message: 'Todos os aquários, medições, fauna, plantas, fotos e configurações serão apagados deste aparelho. Não há como desfazer.',
      confirmText: 'Apagar tudo', danger: true,
      onConfirm: async () => {
        indexedDB.deleteDatabase('aquaflow');
        try { localStorage.clear(); } catch {}
        toast('Dados apagados');
        setTimeout(() => location.reload(), 800);
      }
    })
  },
    h('span', { style: { color: 'var(--bad)' } }, icon('trash', 'ic')),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title', style: { color: 'var(--bad)' }, text: 'Apagar todos os dados' }),
      h('div', { class: 'row-sub', text: 'Remove tudo deste aparelho, definitivamente' }))
  ));
  el.appendChild(c6);

  /* sobre */
  const c7 = h('div', { class: 'card' });
  c7.appendChild(row('Como funciona o Consultor', 'as regras que o app nunca quebra', { left: icon('info', 'ic'), onClick: openRules }));
  c7.appendChild(row('Diagnóstico técnico', 'útil se algo não funcionar', { left: icon('sliders', 'ic'), onClick: openDiag }));
  el.appendChild(c7);

  el.appendChild(h('div', { class: 'note', style: { textAlign: 'center', padding: '18px 0 6px' }, text: `AquaFlow ${APP_VERSION}` }));

  return { title: 'Ajustes', el };
}

function openRules() {
  const R = [
    'Toda dosagem, capacidade e concentração usa o volume ÚTIL informado — nunca o volume bruto.',
    'Nenhum peixe é liberado com amônia acima de 0 ppm.',
    'Nenhum peixe é liberado com nitrito acima de 0 ppm.',
    'Uma única medição nunca confirma estabilidade nem declara o aquário ciclado.',
    'Nunca recomendar substituição completa das mídias biológicas em manutenção normal.',
    'Nunca recomendar medicamento de forma indiscriminada.',
    'Nunca misturar Prime e Cloronev.',
    'Nunca usar Transnev no comunitário como prevenção — só aquário hospitalar com indicação.',
    'Betta exige fluxo brando e é o último peixe a entrar no comunitário.',
    'Tampa fechada; decorações sem rebarbas.',
    'Toda mudança de fauna considera carga biológica e compatibilidade.',
    'Na dúvida, priorizar a segurança e pedir novos dados.',
    'Nunca inventar dado ausente — se falta medição, o app diz o que falta.',
    'Nunca assumir que um parâmetro está normal sem registro.',
    'Toda recomendação importante explica o motivo e os próximos passos.'
  ];
  return sheet({
    title: 'Regras inegociáveis',
    big: true,
    body: (b) => {
      b.appendChild(h('div', { class: 'note', style: { marginBottom: '12px' }, text: 'Estas regras estão no código do app e no prompt enviado à IA. Valem tanto no modo offline quanto com IA conectada.' }));
      R.forEach((t, i) => b.appendChild(h('div', { style: { display: 'flex', gap: '10px', marginBottom: '11px' } },
        h('div', { style: { width: '23px', height: '23px', borderRadius: '50%', background: 'var(--card-2)', color: 'var(--accent)', display: 'grid', placeItems: 'center', fontSize: '12px', fontWeight: '700', flex: '0 0 auto' }, text: String(i + 1) }),
        h('div', { style: { fontSize: '14px', color: 'var(--tx-2)' }, text: t }))));
    },
    actions: (c) => h('button', { class: 'btn', text: 'Entendi', onclick: () => c() })
  });
}

function openDiag() {
  return sheet({
    title: 'Diagnóstico',
    big: true,
    body: async (b) => {
      const rows = [
        ['Versão', APP_VERSION],
        ['Instalado (standalone)', isInstalled() ? 'sim' : 'não'],
        ['Plataforma detectada', env.ios ? 'iOS/iPadOS' : env.android ? 'Android' : 'desktop/outro'],
        ['Navegador interno de app', env.webview ? 'sim (instalação indisponível)' : 'não'],
        ['Service worker', 'serviceWorker' in navigator ? 'suportado' : 'não suportado'],
        ['Endereço', location.origin + location.pathname],
        ['Protocolo', location.protocol],
        ['Online', navigator.onLine ? 'sim' : 'não'],
        ['Aquários', String(state.aquariums.length)],
        ['IA configurada', aiReady(state.settings.ai) ? state.settings.ai.provider + ' · ' + (state.settings.ai.model || '—') : 'não']
      ];
      rows.forEach(([k, v]) => b.appendChild(kv(k, v)));
      if (location.protocol === 'file:') {
        b.appendChild(h('div', { class: 'alert warn', style: { marginTop: '12px' } }, icon('alert', 'ic'),
          h('div', {}, h('div', { class: 'alert-t', text: 'Aberto como arquivo local' }),
            h('div', { class: 'alert-d', text: 'Abrindo o index.html direto do disco, o navegador bloqueia o modo offline e a instalação. Publique numa hospedagem (GitHub Pages, por exemplo) ou use um servidor local.' }))));
      }
      if ('serviceWorker' in navigator) {
        const rs = await navigator.serviceWorker.getRegistrations();
        b.appendChild(kv('Registros de SW', String(rs.length)));
        if (rs[0]) b.appendChild(kv('Escopo do SW', rs[0].scope));
      }
    },
    actions: (c) => h('button', { class: 'btn sec', text: 'Fechar', onclick: () => c() })
  });
}
