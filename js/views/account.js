/* views/account.js — conta (e-mail e senha) e sincronização com a nuvem. */

import {
  h, icon, cardHead, row, pill, sheet, toast, field, input, textarea, kv,
  empty, confirmSheet, switchBtn, segmented
} from '../ui.js';
import { state, save, active } from '../store.js';
import * as cloud from '../cloud.js';
import { fmtDate, relDay } from '../engine.js';

export default function account(ctx) {
  const el = h('div');

  if (!cloud.isConfigured()) {
    el.appendChild(h('div', { class: 'alert info' }, icon('info', 'ic'), h('div', {},
      h('div', { class: 'alert-t', text: 'Nuvem ainda não configurada' }),
      h('div', { class: 'alert-d', text: 'O app funciona normalmente sem conta — tudo fica salvo no aparelho. Para ter login e sincronizar entre celular e computador, é preciso criar um projeto gratuito no Firebase e colar a configuração aqui.' }))));

    el.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-pad' },
      h('div', { style: { fontWeight: '700', fontSize: '15px', marginBottom: '10px' }, text: 'O que você ganha' }),
      ...[
        'Entrar com e-mail e senha em qualquer aparelho',
        'Histórico sincronizado entre celular e computador',
        'Backup automático — trocar de celular não perde nada',
        'Continua funcionando offline; sincroniza quando houver internet'
      ].map((t) => h('div', { style: { display: 'flex', gap: '9px', marginBottom: '7px', fontSize: '14px', color: 'var(--tx-2)' } },
        h('span', { style: { color: 'var(--ok)' } }, icon('check', 'ic ic-sm')), h('span', { text: t })))
    )));

    el.appendChild(h('button', { class: 'btn', onclick: () => openConfigSheet(ctx) }, icon('box', 'ic ic-sm'), 'Colar configuração do Firebase'));
    el.appendChild(h('div', { style: { height: '9px' } }));
    el.appendChild(h('div', { class: 'note', style: { padding: '0 4px' }, text: 'O passo a passo completo para criar o projeto está no arquivo GUIA.md, na seção "Login e nuvem". São cerca de 10 minutos, sem cartão de crédito.' }));

    return { title: 'Conta', back: true, el };
  }

  const u = cloud.status.user;

  /* ---------- deslogado ---------- */
  if (!u) {
    el.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-pad', style: { textAlign: 'center' } },
      h('div', { style: { width: '54px', height: '54px', borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center', margin: '0 auto 12px' } }, icon('user', 'ic')),
      h('div', { style: { fontSize: '17px', fontWeight: '700' }, text: 'Entrar na sua conta' }),
      h('div', { class: 'note', style: { marginTop: '5px' }, text: 'Seus dados atuais continuam salvos neste aparelho. Ao entrar, você escolhe se envia para a nuvem ou baixa o que já está lá.' })
    )));
    el.appendChild(h('button', { class: 'btn', onclick: () => openAuthSheet(ctx, 'in') }, 'Entrar'));
    el.appendChild(h('div', { style: { height: '9px' } }));
    el.appendChild(h('button', { class: 'btn sec', onclick: () => openAuthSheet(ctx, 'up') }, 'Criar conta'));
    el.appendChild(h('div', { style: { height: '9px' } }));
    el.appendChild(h('button', { class: 'btn ghost', onclick: () => openResetSheet() }, 'Esqueci minha senha'));

    el.appendChild(h('div', { class: 'sec-title', text: 'Configuração' }));
    el.appendChild(h('div', { class: 'card' }, row('Projeto Firebase', 'trocar ou remover a configuração', { left: icon('box', 'ic'), onClick: () => openConfigSheet(ctx) })));
    return { title: 'Conta', back: true, el };
  }

  /* ---------- logado ---------- */
  const pend = cloud.pendingCount();

  el.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-row' },
    h('div', { style: { width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center', flex: '0 0 auto' } }, icon('user', 'ic ic-sm')),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title', text: u.email }),
      h('div', { class: 'row-sub', text: u.verified ? 'e-mail confirmado' : 'e-mail ainda não confirmado' })),
    pill(u.verified ? 'ok' : 'warn', u.verified ? 'Ativa' : 'Pendente')
  )));

  if (!u.verified) {
    el.appendChild(h('div', { class: 'alert warn' }, icon('alert', 'ic'), h('div', { style: { flex: '1' } },
      h('div', { class: 'alert-t', text: 'Confirme seu e-mail para sincronizar' }),
      h('div', { class: 'alert-d', text: 'As regras de segurança do Firestore só liberam a gravação para e-mails confirmados. Procure a mensagem do Firebase na sua caixa de entrada — e olhe também no spam, porque o remetente é um endereço automático do Google.' }),
      h('div', { class: 'btn-row', style: { marginTop: '10px' } },
        h('button', {
          class: 'btn sm sec', text: 'Reenviar', onclick: async (e) => {
            e.currentTarget.disabled = true;
            try { await cloud.resendVerification(); toast('E-mail de confirmação enviado', 'ok'); }
            catch (err) { toast(cloud.errMsg(err), 'bad'); }
            e.currentTarget.disabled = false;
          }
        }),
        h('button', {
          class: 'btn sm', text: 'Já confirmei', onclick: async () => {
            await cloud.refreshUser();
            toast(cloud.status.user?.verified ? 'E-mail confirmado' : 'Ainda não consta como confirmado', cloud.status.user?.verified ? 'ok' : 'bad');
            ctx.refresh();
          }
        })
      ))));
  }

  /* sincronização */
  const sc = h('div', { class: 'card' });
  sc.appendChild(cardHead('refresh', 'Sincronização', null,
    pill(cloud.status.syncing ? 'info' : pend ? 'warn' : 'ok', cloud.status.syncing ? 'Enviando…' : pend ? `${pend} pendente${pend > 1 ? 's' : ''}` : 'Em dia')));
  const sb = h('div', { class: 'card-body' });
  sb.appendChild(kv('Última sincronização', cloud.status.lastSync ? `${fmtDate(cloud.status.lastSync)} (${relDay(cloud.status.lastSync)})` : 'nunca'));
  sb.appendChild(kv('Aquário ativo', active()?.name || '—'));
  if (cloud.status.lastError) sb.appendChild(h('div', { class: 'alert bad', style: { marginTop: '10px' } }, icon('alert', 'ic'),
    h('div', {}, h('div', { class: 'alert-t', text: 'Último erro' }), h('div', { class: 'alert-d', text: cloud.status.lastError }))));
  sb.appendChild(h('button', {
    class: 'btn', style: { marginTop: '12px' }, disabled: cloud.status.syncing, onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Sincronizando…';
      try {
        const r = await cloud.syncNow();
        toast(`Enviados ${r.pushed} · recebidos ${r.pulled}`, 'ok');
      } catch (err) { toast(cloud.errMsg(err), 'bad'); }
      ctx.refresh();
    }
  }, 'Sincronizar agora'));
  sc.appendChild(sb);
  el.appendChild(sc);

  /* opções */
  const oc = h('div', { class: 'card' });
  oc.appendChild(h('div', { class: 'card-row' },
    icon('refresh', 'ic'),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title', text: 'Sincronizar automaticamente' }),
      h('div', { class: 'row-sub', text: 'ao abrir o app e após registrar algo' })),
    switchBtn(state.settings.autoSync !== false, (v) => { state.settings.autoSync = v; save(); })));
  oc.appendChild(h('div', { class: 'card-row' },
    icon('cam', 'ic'),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title', text: 'Sincronizar fotos' }),
      h('div', { class: 'row-sub', text: 'consome bem mais dados; desligado por padrão' })),
    switchBtn(!!state.settings.syncPhotos, (v) => { state.settings.syncPhotos = v; save(); })));
  el.appendChild(oc);

  /* primeira vez / aparelho novo */
  el.appendChild(h('div', { class: 'sec-title', text: 'Transferir dados' }));
  const tc = h('div', { class: 'card' });
  tc.appendChild(row('Enviar tudo deste aparelho', 'sobrescreve a nuvem com o que está aqui', {
    left: icon('up', 'ic'),
    onClick: () => confirmSheet({
      title: 'Enviar tudo para a nuvem?',
      message: 'Todos os registros deste aparelho serão enviados. O que estiver na nuvem e também aqui será atualizado com a versão daqui.',
      confirmText: 'Enviar tudo',
      onConfirm: async () => {
        try { const r = await cloud.pushEverything(); toast(`${r.pushed} registros enviados`, 'ok'); }
        catch (e) { toast(cloud.errMsg(e), 'bad'); }
        ctx.refresh();
      }
    })
  }));
  tc.appendChild(row('Baixar tudo da nuvem', 'para usar num aparelho novo', {
    left: icon('down', 'ic'),
    onClick: () => confirmSheet({
      title: 'Baixar tudo da nuvem?',
      message: 'Traz todos os registros da conta. Onde houver o mesmo registro nos dois lados, a versão da nuvem prevalece.',
      confirmText: 'Baixar tudo',
      onConfirm: async () => {
        try { const r = await cloud.pullEverything(); toast(`${r.pulled} registros recebidos`, 'ok'); }
        catch (e) { toast(cloud.errMsg(e), 'bad'); }
        ctx.refresh();
      }
    })
  }));
  tc.appendChild(row('Aquários na conta', 'ver e importar o que está na nuvem', {
    left: icon('tank', 'ic'), onClick: () => openRemoteList(ctx)
  }));
  el.appendChild(tc);

  /* segurança */
  el.appendChild(h('div', { class: 'sec-title', text: 'Segurança' }));
  const seg = h('div', { class: 'card' });
  seg.appendChild(row('Alterar senha', '', { left: icon('shield', 'ic'), onClick: () => openChangePass() }));
  seg.appendChild(row('Sair da conta', 'os dados continuam neste aparelho', {
    left: icon('up', 'ic'),
    onClick: () => confirmSheet({
      title: 'Sair da conta?',
      message: 'Os registros continuam salvos neste aparelho. Você pode entrar de novo quando quiser.',
      confirmText: 'Sair',
      onConfirm: async () => { await cloud.signOutNow(); toast('Você saiu da conta'); ctx.refresh(); }
    })
  }));
  el.appendChild(seg);

  el.appendChild(h('div', { class: 'sec-title', text: 'Zona de risco' }));
  el.appendChild(h('div', { class: 'card' }, h('div', {
    class: 'card-row press', onclick: () => openDeleteAccount(ctx)
  },
    h('span', { style: { color: 'var(--bad)' } }, icon('trash', 'ic')),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title', style: { color: 'var(--bad)' }, text: 'Excluir conta' }),
      h('div', { class: 'row-sub', text: 'apaga o login; os dados na nuvem precisam ser apagados no console' })))));

  el.appendChild(h('div', { class: 'note', style: { padding: '14px 4px 0' }, text: 'A conversa do Consultor e a marcação de tarefas do dia não sincronizam — são informações do momento, específicas de cada aparelho.' }));

  return { title: 'Conta', back: true, el };
}

/* ================= entrar / criar conta ================= */
function openAuthSheet(ctx, mode) {
  let email = '', pass = '', pass2 = '';
  let busy = false;

  return sheet({
    title: mode === 'in' ? 'Entrar' : 'Criar conta',
    big: true,
    body: (b, close) => {
      const err = h('div');
      b.appendChild(field('E-mail', input({ type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'none', placeholder: 'seu@email.com', oninput: (e) => { email = e.target.value; } })));
      b.appendChild(field('Senha', input({ type: 'password', autocomplete: mode === 'in' ? 'current-password' : 'new-password', placeholder: 'mínimo 6 caracteres', oninput: (e) => { pass = e.target.value; } })));
      if (mode === 'up') b.appendChild(field('Repita a senha', input({ type: 'password', autocomplete: 'new-password', oninput: (e) => { pass2 = e.target.value; } })));
      b.appendChild(err);
      if (mode === 'up') b.appendChild(h('div', { class: 'note', style: { marginBottom: '10px' }, text: 'Vamos enviar um e-mail de confirmação. Confirmar é obrigatório para sincronizar, porque as regras de segurança exigem e-mail verificado.' }));

      const go = async (btn) => {
        if (busy) return;
        err.innerHTML = '';
        if (!email.trim() || !pass) { err.appendChild(errBox('Preencha e-mail e senha.')); return; }
        if (mode === 'up' && pass !== pass2) { err.appendChild(errBox('As duas senhas não são iguais.')); return; }
        if (mode === 'up' && pass.length < 6) { err.appendChild(errBox('A senha precisa de pelo menos 6 caracteres.')); return; }
        busy = true; btn.disabled = true; btn.textContent = 'Aguarde…';
        try {
          if (mode === 'up') {
            await cloud.signUp(email, pass);
            close();
            toast('Conta criada. Confira o e-mail de confirmação.', 'ok');
            setTimeout(() => offerFirstSync(ctx), 400);
          } else {
            await cloud.signIn(email, pass);
            close();
            toast('Conectado', 'ok');
            setTimeout(() => offerFirstSync(ctx), 400);
          }
        } catch (e) {
          err.appendChild(errBox(cloud.errMsg(e)));
          busy = false; btn.disabled = false; btn.textContent = mode === 'in' ? 'Entrar' : 'Criar conta';
        }
      };

      b.appendChild(h('button', { class: 'btn', onclick: (e) => go(e.currentTarget) }, mode === 'in' ? 'Entrar' : 'Criar conta'));
      if (mode === 'in') b.appendChild(h('button', { class: 'btn ghost', style: { marginTop: '8px' }, onclick: () => { close(); setTimeout(() => openResetSheet(), 200); } }, 'Esqueci minha senha'));
    }
  });
}

function errBox(msg) {
  return h('div', { class: 'alert bad', style: { marginBottom: '12px' } }, icon('alert', 'ic'),
    h('div', {}, h('div', { class: 'alert-d', style: { color: '#ff8b83' }, text: msg })));
}

/* Depois de entrar, o app não decide sozinho o que sobrescreve o quê. */
function offerFirstSync(ctx) {
  const aq = active();
  const localN = aq ? ['tests', 'dosings', 'tpas', 'feedings', 'livestock', 'plants', 'notes'].reduce((s, c) => s + (aq[c] || []).length, 0) : 0;

  return sheet({
    title: 'Como começar?',
    body: (b, close) => {
      b.appendChild(h('div', { class: 'note', style: { marginBottom: '14px' }, text: `Este aparelho tem ${localN} registro(s) salvo(s). Escolha o que fazer — nada é sobrescrito sem você mandar.` }));
      b.appendChild(h('button', {
        class: 'btn', onclick: async () => {
          close();
          try { const r = await cloud.pushEverything(); toast(`${r.pushed} registros enviados para a nuvem`, 'ok'); }
          catch (e) { toast(cloud.errMsg(e), 'bad'); }
          ctx.refresh();
        }
      }, icon('up', 'ic ic-sm'), 'Enviar o que está neste aparelho'));
      b.appendChild(h('div', { style: { height: '9px' } }));
      b.appendChild(h('button', {
        class: 'btn sec', onclick: async () => {
          close();
          try { const r = await cloud.pullEverything(); toast(`${r.pulled} registros recebidos`, 'ok'); }
          catch (e) { toast(cloud.errMsg(e), 'bad'); }
          ctx.refresh();
        }
      }, icon('down', 'ic ic-sm'), 'Baixar o que já está na nuvem'));
      b.appendChild(h('div', { style: { height: '9px' } }));
      b.appendChild(h('button', { class: 'btn ghost', onclick: () => { close(); ctx.refresh(); }, text: 'Decidir depois' }));
    }
  });
}

/* ================= senha ================= */
function openResetSheet() {
  let email = '';
  return sheet({
    title: 'Recuperar senha',
    body: (b, close) => {
      b.appendChild(field('E-mail da conta', input({ type: 'email', inputmode: 'email', autocapitalize: 'none', oninput: (e) => { email = e.target.value; } })));
      b.appendChild(h('div', { class: 'note', style: { marginBottom: '12px' }, text: 'Se existir uma conta com esse e-mail, o Firebase envia um link para criar uma senha nova. Por segurança, o serviço não informa se o e-mail existe ou não. Verifique também a pasta de spam.' }));
      b.appendChild(h('button', {
        class: 'btn', onclick: async (e) => {
          if (!email.trim()) { toast('Informe o e-mail', 'bad'); return; }
          e.currentTarget.disabled = true;
          try { await cloud.resetPassword(email); close(); toast('Se a conta existir, o link foi enviado', 'ok'); }
          catch (err) { toast(cloud.errMsg(err), 'bad'); e.currentTarget.disabled = false; }
        }
      }, 'Enviar link'));
    }
  });
}

function openChangePass() {
  let cur = '', nova = '', nova2 = '';
  return sheet({
    title: 'Alterar senha',
    body: (b, close) => {
      b.appendChild(field('Senha atual', input({ type: 'password', autocomplete: 'current-password', oninput: (e) => { cur = e.target.value; } })));
      b.appendChild(field('Nova senha', input({ type: 'password', autocomplete: 'new-password', oninput: (e) => { nova = e.target.value; } })));
      b.appendChild(field('Repita a nova senha', input({ type: 'password', autocomplete: 'new-password', oninput: (e) => { nova2 = e.target.value; } })));
      b.appendChild(h('button', {
        class: 'btn', onclick: async (e) => {
          if (nova.length < 6) { toast('A nova senha precisa de 6 caracteres ou mais', 'bad'); return; }
          if (nova !== nova2) { toast('As novas senhas não são iguais', 'bad'); return; }
          e.currentTarget.disabled = true;
          try { await cloud.changePassword(cur, nova); close(); toast('Senha alterada', 'ok'); }
          catch (err) { toast(cloud.errMsg(err), 'bad'); e.currentTarget.disabled = false; }
        }
      }, 'Alterar senha'));
    }
  });
}

function openDeleteAccount(ctx) {
  let pass = '';
  return sheet({
    title: 'Excluir conta',
    body: (b, close) => {
      b.appendChild(h('div', { class: 'alert bad' }, icon('alert', 'ic'), h('div', {},
        h('div', { class: 'alert-t', text: 'Leia antes' }),
        h('div', { class: 'alert-d', text: 'Isso apaga o login. Os registros que já foram para a nuvem NÃO são apagados automaticamente — para removê-los, exclua os dados no console do Firebase. Os registros deste aparelho continuam aqui.' }))));
      b.appendChild(field('Confirme sua senha', input({ type: 'password', oninput: (e) => { pass = e.target.value; } })));
      b.appendChild(h('button', {
        class: 'btn danger', onclick: async (e) => {
          e.currentTarget.disabled = true;
          try { await cloud.deleteAccount(pass); close(); toast('Conta excluída'); ctx.refresh(); }
          catch (err) { toast(cloud.errMsg(err), 'bad'); e.currentTarget.disabled = false; }
        }
      }, 'Excluir minha conta'));
    }
  });
}

/* ================= aquários na nuvem ================= */
function openRemoteList(ctx) {
  return sheet({
    title: 'Aquários na conta',
    big: true,
    body: async (b) => {
      b.appendChild(h('div', { class: 'note', text: 'Consultando…' }));
      try {
        const list = await cloud.listRemoteAquariums();
        b.innerHTML = '';
        if (!list.length) { b.appendChild(empty('tank', 'Nenhum aquário na nuvem ainda. Use "Enviar tudo deste aparelho".')); return; }
        list.forEach((a) => {
          const local = state.aquariums.some((x) => x.id === a.id);
          b.appendChild(h('div', { class: 'card' }, row(a.name || a.id,
            `${a.volUtil ? a.volUtil + ' L úteis' : ''}${local ? ' · já está neste aparelho' : ''}`,
            {
              right: h('button', {
                class: 'btn sm ' + (local ? 'sec' : ''), text: local ? 'Rebaixar' : 'Importar',
                onclick: async (e) => {
                  e.currentTarget.disabled = true;
                  try { await cloud.importRemoteAquarium(a.id); toast('Aquário importado', 'ok'); ctx.nav('aquario'); }
                  catch (err) { toast(cloud.errMsg(err), 'bad'); e.currentTarget.disabled = false; }
                }
              })
            })));
        });
      } catch (e) {
        b.innerHTML = '';
        b.appendChild(errBox(cloud.errMsg(e)));
      }
    },
    actions: (close) => h('button', { class: 'btn sec', text: 'Fechar', onclick: () => close() })
  });
}

/* ================= configuração do Firebase ================= */
export function openConfigSheet(ctx) {
  let txt = '';
  return sheet({
    title: 'Configuração do Firebase',
    big: true,
    body: (b, close) => {
      b.appendChild(h('div', { class: 'note', style: { marginBottom: '12px' } },
        'No console do Firebase: engrenagem → Configurações do projeto → role até "Seus aplicativos" → app da Web → Configuração do SDK. ',
        'Copie o objeto que começa com apiKey e cole abaixo.'));
      b.appendChild(field('Cole a configuração', textarea({
        placeholder: '{\n  "apiKey": "AIza...",\n  "authDomain": "...",\n  "projectId": "...",\n  "appId": "..."\n}',
        style: { minHeight: '160px', fontFamily: 'monospace', fontSize: '12px' },
        oninput: (e) => { txt = e.target.value; }
      })));
      b.appendChild(h('div', { class: 'alert info', style: { marginBottom: '12px' } }, icon('info', 'ic'), h('div', {},
        h('div', { class: 'alert-t', text: 'Isto vale só neste aparelho' }),
        h('div', { class: 'alert-d', text: 'Serve para você testar agora. Para funcionar em todos os aparelhos sem colar de novo, coloque a mesma configuração no arquivo js/firebase-config.js e publique.' }))));

      b.appendChild(h('button', {
        class: 'btn', onclick: async () => {
          let cfg;
          try {
            // aceita tanto JSON quanto o objeto JavaScript que o console mostra
            const clean = txt.trim().replace(/^const\s+firebaseConfig\s*=\s*/, '').replace(/;\s*$/, '');
            cfg = JSON.parse(clean.replace(/([{,]\s*)([A-Za-z_][\w]*)\s*:/g, '$1"$2":').replace(/'/g, '"'));
          } catch {
            toast('Não consegui ler essa configuração. Cole o objeto inteiro, com as chaves { }.', 'bad');
            return;
          }
          if (!cfg.apiKey || !cfg.projectId) { toast('Faltam apiKey e projectId na configuração.', 'bad'); return; }
          cloud.setLocalConfig(cfg);
          close();
          toast('Configuração salva', 'ok');
          try { await cloud.start(); } catch {}
          ctx.refresh();
        }
      }, 'Salvar configuração'));

      if (state.settings.fbConfig) {
        b.appendChild(h('div', { style: { height: '9px' } }));
        b.appendChild(h('button', {
          class: 'btn danger', onclick: () => {
            cloud.setLocalConfig(null); close(); toast('Configuração removida'); ctx.refresh();
          }
        }, 'Remover configuração deste aparelho'));
      }
    }
  });
}
