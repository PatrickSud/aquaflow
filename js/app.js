/* app.js — inicialização, roteamento por hash e montagem das telas. */

import { load, state, save, active, subscribe } from './store.js';
import { h, icon, menuSheet, toast, fabMenu } from './ui.js';
import { initPWA } from './pwa.js';

import dashboard, { quickActions } from './views/dashboard.js';
import params, { paramDetail, paramTargets } from './views/params.js';
import tasks from './views/tasks.js';
import fauna, { faunaForm, stockingView } from './views/fauna.js';
import plants, { plantForm } from './views/plants.js';
import consultor from './views/consultor.js';
import settings from './views/settings.js';
import aquariums, { aquariumForm } from './views/aquariums.js';
import historyView from './views/history.js';
import cycling from './views/cycling.js';
import { tpaView, doseView, feedView, diaryView } from './views/logs.js';
import account from './views/account.js';
import * as cloud from './cloud.js';

const TABS = ['parametros', 'tarefas', 'aquario', 'fauna', 'ajustes'];
const el = {};
let current = '';

/* ---------------- roteamento ---------------- */
function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  return { route: parts[0] || 'aquario', parts, query, raw };
}

export function nav(to) {
  const target = '#/' + String(to).replace(/^#?\/?/, '');
  if (location.hash === target) render();
  else location.hash = target;
}

function back() {
  if (window.history.length > 1) window.history.back();
  else nav('aquario');
}

/* ---------------- montagem ---------------- */
function render() {
  const { route, parts, query } = parseHash();
  const aq = active();

  // sem aquário: força o assistente de criação
  if (!aq && !(route === 'aquarios' && parts[1] === 'novo')) {
    location.hash = '#/aquarios/novo';
    return;
  }

  const ctx = { aq, nav, back, query, refresh: () => render() };
  let view;

  try {
    switch (route) {
      case 'aquario': view = dashboard(ctx); break;
      case 'parametros':
        view = !parts[1] ? params(ctx) : parts[1] === 'metas' ? paramTargets(ctx) : paramDetail(ctx, parts[1]);
        break;
      case 'tarefas': view = tasks(ctx); break;
      case 'fauna':
        view = !parts[1] ? fauna(ctx)
          : parts[1] === 'nova' ? faunaForm(ctx)
            : parts[1] === 'editar' ? faunaForm(ctx, parts[2]) : fauna(ctx);
        break;
      case 'povoamento': view = stockingView(ctx); break;
      case 'plantas':
        view = !parts[1] ? plants(ctx)
          : parts[1] === 'nova' ? plantForm(ctx)
            : parts[1] === 'editar' ? plantForm(ctx, parts[2]) : plants(ctx);
        break;
      case 'consultor': view = consultor(ctx); break;
      case 'ajustes': view = settings(ctx); break;
      case 'aquarios':
        view = !parts[1] ? aquariums(ctx)
          : parts[1] === 'novo' ? aquariumForm(ctx)
            : parts[1] === 'editar' ? aquariumForm(ctx, parts[2]) : aquariums(ctx);
        break;
      case 'historico': view = historyView(ctx); break;
      case 'ciclagem': view = cycling(ctx); break;
      case 'tpa': view = tpaView(ctx); break;
      case 'dosagens': view = doseView(ctx); break;
      case 'alimentacao': view = feedView(ctx); break;
      case 'diario': view = diaryView(ctx); break;
      case 'conta': view = account(ctx); break;
      default: nav('aquario'); return;
    }
  } catch (err) {
    console.error(err);
    view = {
      title: 'Erro', el: h('div', {},
        h('div', { class: 'alert bad' }, icon('alert', 'ic'),
          h('div', {}, h('div', { class: 'alert-t', text: 'Algo deu errado ao abrir esta tela' }),
            h('div', { class: 'alert-d', text: String(err && err.message || err) }))),
        h('button', { class: 'btn', text: 'Voltar ao painel', onclick: () => nav('aquario') }))
    };
  }

  /* topo */
  el.title.textContent = view.title || 'AquaFlow';
  el.back.hidden = !view.back;
  el.back.onclick = () => back();

  el.actions.innerHTML = '';
  const acts = (view.actions || []).slice();
  if (!view.back && route !== 'consultor') acts.push({ icon: 'bulb', label: 'Consultor', on: () => nav('consultor') });
  if (acts.length === 1) {
    const a = acts[0];
    el.actions.appendChild(h('button', { class: 'tb-btn', 'aria-label': a.label, onclick: a.on }, icon(a.icon, 'ic ic-sm')));
  } else if (acts.length > 1) {
    const main = acts[acts.length - 1];
    const rest = acts.slice(0, -1);
    if (rest.length === 1) {
      el.actions.appendChild(h('button', { class: 'tb-btn', 'aria-label': rest[0].label, onclick: rest[0].on }, icon(rest[0].icon, 'ic ic-sm')));
    } else if (rest.length > 1) {
      el.actions.appendChild(h('button', {
        class: 'tb-btn', 'aria-label': 'Mais opções',
        onclick: () => menuSheet('Opções', rest.map((a) => ({ icon: a.icon, label: a.label, on: a.on })))
      }, icon('sliders', 'ic ic-sm')));
    }
    el.actions.appendChild(h('button', { class: 'tb-btn', 'aria-label': main.label, onclick: main.on }, icon(main.icon, 'ic ic-sm')));
  }

  /* corpo */
  el.view.innerHTML = '';
  el.view.appendChild(view.el);
  el.view.classList.toggle('no-tabs', !!view.noTabs);
  el.tabbar.hidden = !!view.noTabs;

  /* botão + flutuante: registro rápido de qualquer aba */
  el.fab.hidden = !!view.noTabs || route === 'consultor';
  el.fab.onclick = () => {
    if (el.fabClose) { el.fabClose(); return; }
    el.fab.classList.add('open');
    el.fabClose = fabMenu(quickActions(aq, ctx), () => { el.fab.classList.remove('open'); el.fabClose = null; }).close;
  };

  /* abas */
  const tabRoute = TABS.includes(route) ? route
    : ['plantas', 'povoamento'].includes(route) ? (route === 'povoamento' ? 'fauna' : 'aquario')
      : ['ciclagem', 'historico', 'tpa', 'dosagens', 'alimentacao', 'diario', 'aquarios', 'conta'].includes(route) ? 'aquario' : route;
  [...el.tabbar.children].forEach((b) => {
    if (b.dataset.route === tabRoute) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  if (current !== parseHash().raw) window.scrollTo(0, 0);
  current = parseHash().raw;
}

/* ---------------- lembretes locais ---------------- */
function scheduleReminders() {
  if (!state.settings.notif || !('Notification' in window) || Notification.permission !== 'granted') return;
  const aq = active();
  if (!aq) return;
  const key = 'aquaflow-notif-' + new Date().toDateString();
  try { if (localStorage.getItem(key)) return; } catch { return; }

  import('./views/dashboard.js').then(({ todayTasks }) => {
    import('./engine.js').then(({ nextTestDue, alerts }) => {
      const pend = todayTasks(aq).filter((t) => !t.done).length;
      const nt = nextTestDue(aq);
      const crit = alerts(aq).filter((a) => a.s === 'bad').length;
      const bits = [];
      if (crit) bits.push(`${crit} alerta(s) crítico(s)`);
      if (nt.due) bits.push('medição recomendada hoje');
      if (pend) bits.push(`${pend} tarefa(s) pendente(s)`);
      if (!bits.length) return;
      try {
        new Notification('AquaFlow — ' + aq.name, { body: bits.join(' · '), icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'aquaflow-daily' });
        localStorage.setItem(key, '1');
      } catch {}
    });
  });
}

/* ---------------- início ---------------- */
async function boot() {
  el.title = document.getElementById('tb-title');
  el.back = document.getElementById('tb-back');
  el.actions = document.getElementById('tb-actions');
  el.view = document.getElementById('view');
  el.tabbar = document.getElementById('tabbar');
  el.topbar = document.getElementById('topbar');
  el.fab = document.getElementById('fab');

  await load();

  el.tabbar.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => nav(b.dataset.route)));
  window.addEventListener('hashchange', render);

  initPWA(() => { if (parseHash().route === 'aquario' || parseHash().route === 'ajustes') render(); });

  // nuvem é opcional: se não houver configuração, nada disso acontece e o app segue igual
  cloud.getConfig().then((cfg) => {
    if (!cfg) return;
    cloud.onChange(() => { const r = parseHash().route; if (r === 'conta' || r === 'ajustes') render(); });
    cloud.start().catch((e) => console.warn('cloud', e));

    // envio automático, com folga para não disparar a cada tecla digitada
    let t = null;
    subscribe(() => {
      if (state.settings.autoSync === false) return;
      if (!cloud.status.user || cloud.status.syncing) return;
      clearTimeout(t);
      t = setTimeout(() => {
        if (navigator.onLine) cloud.syncNow({ quiet: true }).catch(() => {});
      }, 8000);
    });
    window.addEventListener('online', () => {
      if (cloud.status.user && state.settings.autoSync !== false) cloud.syncNow({ quiet: true }).catch(() => {});
    });
  });

  document.getElementById('splash').remove();
  el.topbar.hidden = false;
  el.view.hidden = false;
  el.tabbar.hidden = false;
  el.fab.hidden = false;

  if (!location.hash) location.hash = '#/aquario';
  render();

  state.settings.lastSeen = new Date().toISOString();
  save({ silent: true });
  setTimeout(scheduleReminders, 2500);

  window.addEventListener('error', (e) => console.error('erro global', e.error || e.message));
}

boot().catch((e) => {
  console.error(e);
  const s = document.getElementById('splash');
  if (s) s.innerHTML = `<div style="padding:24px;text-align:center;color:#fff">
    <div style="font-weight:700;margin-bottom:8px">Não foi possível iniciar</div>
    <div style="font-size:13px;color:#a1a1aa">${String(e && e.message || e)}</div></div>`;
});
