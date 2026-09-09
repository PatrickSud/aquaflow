/* firebase-config.js — configuração do projeto Firebase do AquaFlow.
 *
 * Projeto: aquaflow-27258
 *
 * ESTES VALORES NÃO SÃO SEGREDO. O Firebase os publica no navegador de
 * propósito — é assim que o SDK sabe com qual projeto falar. Podem ir para um
 * repositório público sem problema.
 *
 * O QUE REALMENTE PROTEGE OS SEUS DADOS são as Regras de Segurança do Firestore.
 * Publique o arquivo firestore.rules (console → Firestore Database → aba Regras)
 * com o SEU e-mail na lista. Sem isso, o banco fica aberto para qualquer pessoa
 * que crie uma conta neste projeto.
 *
 * Se um dia quiser trocar de projeto: substitua o objeto abaixo, ou volte para
 * `null` — com `null`, o app funciona normalmente, só sem conta e sem nuvem.
 */

export const firebaseConfig = {
  apiKey: 'AIzaSyC2yHymEFAfNl0tvWmvZjqTbN5blKZG280',
  authDomain: 'aquaflow-27258.firebaseapp.com',
  projectId: 'aquaflow-27258',
  storageBucket: 'aquaflow-27258.firebasestorage.app',
  messagingSenderId: '318559780755',
  appId: '1:318559780755:web:eec9cc8d236f087289b266'
};
