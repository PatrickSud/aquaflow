/* pwa.js — instalação na tela de início, registro do service worker e aviso de atualização. */

import { h, icon, sheet, toast } from './ui.js';

let deferred = null;
let onChange = null;

export const env = detect();

function detect() {
  const ua = navigator.userAgent || '';
  const isIPadDesktopUA = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
  const ios = /iPad|iPhone|iPod/.test(ua) || isIPadDesktopUA;
  const android = /Android/.test(ua);
  const webview =
    /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|TikTok|Twitter|LinkedInApp|OKApp|GSA\//.test(ua) ||
    (android && /;\s*wv\)/.test(ua));
  // Safari real no iOS (Chrome/Firefox no iOS não instalam PWA)
  const iosOtherBrowser = ios && /CriOS|FxiOS|EdgiOS|OPiOS|Brave/.test(ua);
  const standalone =
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches;
  return { ios, android, webview, iosOtherBrowser, standalone, ua };
}

export function isInstalled() { return detect().standalone; }

/** Pode mostrar convite de instalação? */
export function canOfferInstall() {
  const e = detect();
  if (e.standalone) return false;
  if (e.webview) return true;          // convida a abrir no navegador
  if (e.ios) return true;              // instrução manual
  return !!deferred || e.android;      // Chromium: evento; Android sem evento: instrução manual
}

export function initPWA(cb) {
  onChange = cb;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    onChange?.();
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    toast('AquaFlow instalado no aparelho', 'ok');
    onChange?.();
  });

  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', () => onChange?.());

  registerSW();
}

/** Abre o fluxo de instalação adequado à plataforma. */
export async function promptInstall() {
  const e = detect();

  if (e.standalone) { toast('O app já está instalado'); return; }

  if (e.webview) {
    return instructionSheet('Abra no navegador do celular', [
      'Você está dentro do navegador de outro aplicativo (Instagram, Facebook, WhatsApp…). Aqui não é possível instalar.',
      'Toque nos três pontinhos (⋮) no canto da tela e escolha "Abrir no navegador" / "Abrir no Chrome".',
      'Com a página aberta no Chrome ou no Safari, volte aqui e toque em Instalar.'
    ], true);
  }

  if (deferred) {
    try {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      onChange?.();
      if (outcome === 'accepted') toast('Instalando…', 'ok');
      return outcome;
    } catch {
      deferred = null;
    }
  }

  if (e.ios) {
    if (e.iosOtherBrowser) {
      return instructionSheet('Use o Safari para instalar', [
        'No iPhone e iPad, só o Safari consegue adicionar um app à Tela de Início.',
        'Copie o endereço desta página e abra no Safari.',
        'No Safari: toque em Compartilhar (o quadrado com a flecha para cima) → "Adicionar à Tela de Início".'
      ], true);
    }
    return instructionSheet('Instalar no iPhone / iPad', [
      'Toque no botão Compartilhar do Safari — o quadrado com uma flecha para cima, na barra inferior.',
      'Role a lista e toque em "Adicionar à Tela de Início".',
      'Deixe a opção "Abrir como Web App" LIGADA. Se desligar, vira só um atalho e o app perde a tela cheia.',
      'Toque em Adicionar. O ícone do AquaFlow aparece junto dos seus outros aplicativos.'
    ]);
  }

  return instructionSheet('Instalar no Android', [
    'Toque no menu do navegador — os três pontinhos (⋮) no canto superior direito.',
    'Escolha "Instalar aplicativo" ou "Adicionar à tela inicial".',
    'Confirme. O ícone do AquaFlow aparece junto dos seus outros aplicativos.'
  ]);
}

function instructionSheet(title, steps, warn = false) {
  return sheet({
    title,
    body: (b) => {
      if (warn) b.appendChild(h('div', { class: 'alert warn', style: { marginTop: '10px' } },
        icon('alert', 'ic'), h('div', {}, h('div', { class: 'alert-t', text: 'Instalação indisponível aqui' }))));
      const ol = h('div', { style: { margin: '12px 0 6px' } });
      steps.forEach((s, i) => ol.appendChild(h('div', { style: { display: 'flex', gap: '11px', marginBottom: '13px' } },
        h('div', { style: { width: '25px', height: '25px', borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '13px', fontWeight: '700', flex: '0 0 auto' }, text: String(i + 1) }),
        h('div', { style: { fontSize: '14.5px', color: 'var(--tx-2)', lineHeight: '1.45' }, text: s })
      )));
      b.appendChild(ol);
      b.appendChild(h('div', { class: 'note', style: { marginBottom: '8px' } },
        'Depois de instalar, o AquaFlow abre em tela cheia e funciona sem internet — seus registros ficam salvos no aparelho.'));
    },
    actions: (close) => h('button', { class: 'btn', text: 'Entendi', onclick: () => close() })
  });
}

/** Barra de convite reaproveitável no topo do painel. */
export function installBanner(onDismiss) {
  const e = detect();
  if (!canOfferInstall()) return null;
  const msg = e.webview
    ? { t: 'Abra no navegador para instalar', d: 'Você está no navegador interno de outro app.' }
    : e.ios
      ? { t: 'Instale o AquaFlow no iPhone', d: 'Compartilhar → Adicionar à Tela de Início.' }
      : { t: 'Instale o AquaFlow', d: 'Fica na tela inicial e funciona sem internet.' };

  return h('div', { class: 'install-bar' },
    icon('down', 'ic'),
    h('div', { class: 't' }, h('b', { text: msg.t }), h('span', { text: msg.d })),
    h('button', { class: 'btn sm', text: 'Instalar', onclick: () => promptInstall() }),
    h('button', { class: 'tb-btn', style: { width: '30px', height: '30px' }, 'aria-label': 'Dispensar', onclick: onDismiss }, icon('x', 'ic ic-sm'))
  );
}

/* ---------------- service worker ---------------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;   // não funciona abrindo o arquivo direto

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');

      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(nw);
        });
      });

      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);

      // procura atualização quando o app volta ao primeiro plano
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    } catch (err) {
      console.warn('SW', err);
    }
  });

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
  });
}

function showUpdate(worker) {
  const bar = h('div', {
    style: {
      position: 'fixed', left: '14px', right: '14px', bottom: 'calc(var(--tabh) + var(--safe-b) + 14px)',
      zIndex: '45', background: '#1f3a5f', border: '1px solid #2f6fbf', borderRadius: '14px',
      padding: '12px 13px', display: 'flex', gap: '11px', alignItems: 'center', boxShadow: '0 8px 24px rgba(0,0,0,.5)'
    }
  },
    icon('refresh', 'ic'),
    h('div', { style: { flex: '1', fontSize: '13.5px' } }, h('b', { text: 'Nova versão disponível' })),
    h('button', { class: 'btn sm', text: 'Atualizar', onclick: () => { worker.postMessage('skip-waiting'); setTimeout(() => location.reload(), 350); } }),
    h('button', { class: 'tb-btn', style: { width: '30px', height: '30px' }, 'aria-label': 'Depois', onclick: () => bar.remove() }, icon('x', 'ic ic-sm'))
  );
  document.body.appendChild(bar);
}
