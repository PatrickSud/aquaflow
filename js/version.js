/* version.js — única fonte da versão do app mostrada na interface (Ajustes → rodapé
   e Diagnóstico). Ao publicar uma atualização, mude só este número.

   Isto é independente da versão de cache do service worker (sw.js → VERSION),
   que existe por outro motivo (invalidar o cache de arquivos estáticos) e
   precisa continuar sendo bumpada à parte a cada deploy que mude algum
   arquivo — mas é uma boa prática manter os dois números iguais. */
export const APP_VERSION = '1.4.0';
