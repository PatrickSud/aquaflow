# AquaFlow — o que você precisa fazer por fora

Guia prático, na ordem. Você não precisa instalar nada no computador para publicar.

---

## 1. Testar no seu celular agora (5 minutos, sem publicar nada)

O app precisa ser servido por um endereço `http`. Abrir o `index.html` com dois cliques **não funciona** — o navegador bloqueia o modo offline e a instalação.

No PowerShell, dentro da pasta do projeto:

```powershell
cd C:\Claude\AquaFlow
& "$env:USERPROFILE\.lou\python\venv\Scripts\python.exe" -m http.server 8000
```

Deixe essa janela aberta. Em **outra** janela do PowerShell, descubra o IP do computador:

```powershell
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' }).IPAddress
```

No celular, **na mesma rede Wi‑Fi**, abra `http://SEU_IP:8000` (ex.: `http://192.168.0.15:8000`).

Duas coisas a saber nesse modo:
- Serve para ver o app funcionando e testar os fluxos.
- A instalação na tela de início e o modo offline só funcionam de verdade com **HTTPS** — ou seja, depois de publicar (passo 2). Por isso o próximo passo existe.

Para parar o servidor: `Ctrl + C` na primeira janela.

---

## 2. Publicar de graça no GitHub Pages (recomendado)

É a opção mais simples: HTTPS automático, sem cartão, sem instalar Node nem nenhuma ferramenta. Dá para fazer inteiro pelo navegador.

1. Crie uma conta em [github.com](https://github.com) se ainda não tiver.
2. Clique em **New repository**.
3. Nome: `aquaflow`. Marque **Public** (o GitHub Pages gratuito exige repositório público). Crie.
4. Na página do repositório, clique em **Add file → Upload files**.
5. Arraste **o conteúdo** da pasta `C:\Claude\AquaFlow` para lá: `index.html`, `manifest.webmanifest`, `sw.js`, `GUIA.md` e as pastas `css`, `js`, `icons`.
   O upload pelo navegador aceita pastas, até 100 arquivos por vez.
6. Clique em **Commit changes**.
7. Vá em **Settings → Pages**. Em *Build and deployment*: Source = **Deploy from a branch**, Branch = **main**, pasta = **/(root)**. Salve.
8. Aguarde cerca de um minuto e recarregue. Vai aparecer o endereço:
   `https://SEU_USUARIO.github.io/aquaflow/`

Esse é o endereço que você abre no celular. Guarde-o.

**O app já está preparado para esse endereço com subpasta.** O `manifest.webmanifest` usa `start_url` e `scope` relativos (`"./"`) e o service worker é registrado como `./sw.js` — é exatamente o que faz a instalação e o modo offline funcionarem em `usuario.github.io/aquaflow/`. Se você mudar esses caminhos para `/`, quebra.

**Limites do plano gratuito:** site publicado de até 1 GB e cerca de 100 GB de tráfego por mês. Para uso pessoal, é folgado — o app inteiro tem menos de 200 KB.

### Publicar uma atualização depois

Toda vez que eu (ou você) mudar algum arquivo:

1. Suba os arquivos alterados no GitHub (**Add file → Upload files** novamente, ele sobrescreve).
2. **Importante:** abra o `sw.js` e mude a linha `const VERSION = 'v1.0.0';` para `'v1.0.1'`, `'v1.0.2'` e assim por diante.

Sem trocar essa versão, o celular pode continuar servindo a versão antiga guardada em cache. Com a versão trocada, o app detecta sozinho e mostra o aviso **"Nova versão disponível → Atualizar"**.

---

## 3. Instalar no celular

Depois de publicar, abra o endereço `https://...github.io/aquaflow/` no celular.

**Android (Chrome):** aparece a faixa azul "Instale o AquaFlow" no topo do painel. Toque em **Instalar**. Se não aparecer, use o menu do Chrome (⋮) → **Instalar aplicativo**.

**iPhone / iPad (Safari):** não existe botão automático — a Apple não permite. O caminho é:
Safari → botão **Compartilhar** (o quadrado com a flecha para cima) → **Adicionar à Tela de Início**.

Um detalhe que engana muita gente: nas versões atuais do iOS aparece uma chave **"Abrir como Web App"** nessa tela, ligada por padrão. **Deixe ligada.** Se desligar, o ícone vira um atalho comum do Safari, abre com a barra de endereço e perde a tela cheia. O app mostra essa instrução na tela quando você toca em Instalar.

**No iPhone só funciona pelo Safari.** Chrome e Firefox no iOS não conseguem instalar app na tela de início — é limitação da Apple.

**Se você abrir o link pelo Instagram ou WhatsApp**, o app detecta e avisa: instalar de dentro do navegador interno desses aplicativos não funciona. Use o menu (⋮) → "Abrir no navegador" primeiro.

---

## 4. Ligar a IA no Consultor (opcional)

O Consultor **já funciona sem nada configurado**: ele responde pelo motor de regras do próprio app, offline, usando o seu histórico. Analisa parâmetros, libera ou bloqueia povoamento, calcula TPA e dosagem, avalia compatibilidade.

Ligar uma IA deixa as respostas mais soltas e conversacionais. O caminho mais barato:

1. Acesse [aistudio.google.com](https://aistudio.google.com) e entre com uma conta Google.
2. Clique em **Get API key → Create API key**. Não pede cartão.
3. Copie a chave.
4. No app: aba **Consultor** → ícone de ajustes → serviço **Google Gemini** → cole a chave.
5. Toque em **Buscar modelos disponíveis**. O app consulta a sua chave e lista os modelos que ela realmente aceita — escolha um da lista.

Esse último passo existe por um motivo: os nomes dos modelos do Google mudam com frequência, e um nome fixo no código vira erro em poucos meses. Buscando a lista, você nunca fica preso a um nome velho.

**O que saber sobre o plano gratuito do Gemini:**
- É permanente e não pede cartão, mas vale só para os modelos **Flash** — os modelos Pro saíram do gratuito em 2026.
- Tem limite por minuto e por dia. O Google parou de publicar tabela fixa; o número real aparece no painel do AI Studio, no seu projeto.
- No plano gratuito, o Google pode usar o que você envia para treinar os modelos dele, e revisores humanos podem ver o conteúdo. Para dados de aquário isso é inofensivo, mas é honesto avisar.
- Os termos do Gemini exigem plano pago para aplicativos disponibilizados a usuários na Europa e no Reino Unido. Para uso pessoal no Brasil, o gratuito serve.

**Sobre a chave ficar guardada no celular:** para um app pessoal, é aceitável — ela fica no armazenamento do navegador, no seu aparelho. Toque em **"Ver exatamente o que é enviado"** no app: ele mostra, literalmente, o resumo técnico que sai daí. Nenhuma foto é enviada.

**Se um dia você compartilhar o app com outras pessoas, não distribua sua chave.** Nesse caso use a opção **"Meu próprio servidor / proxy"**: um Cloudflare Worker gratuito (100 mil requisições por dia, sem cartão) guarda a chave do lado do servidor. O app envia `{system, context, prompt, history}` e espera `{"reply":"..."}` de volta. Se chegar a esse ponto, me chame que eu monto.

---

## 5. Backup — leia isto

**Não existe servidor nem conta.** Todos os seus registros ficam guardados no navegador do celular. Isso é ótimo para privacidade e custo, e tem um preço: se você limpar os dados do navegador, desinstalar o app ou trocar de aparelho, **os dados vão embora**.

Vá em **Ajustes → Exportar backup completo**. Sai um arquivo `.json` com tudo, inclusive as fotos. Guarde no Google Drive.

Faça isso de vez em quando — e obrigatoriamente antes de trocar de celular. Para restaurar: **Ajustes → Restaurar backup**.

Em **Ajustes → Histórico → Exportar medições (CSV)** você também tira uma planilha só das medições, que abre no Excel.

---

## 6. Firebase — quando vale e quando não

**Hoje você não precisa de Firebase.** Ele resolve um problema que você ainda não tem: sincronizar os mesmos dados entre vários aparelhos, ou várias pessoas cuidando do mesmo aquário. Enquanto for você, num celular, o armazenamento local é mais rápido, funciona offline de verdade e não custa nada.

Se e quando quiser sincronização, o que é preciso saber (verificado em setembro de 2026):

- **Plano Spark (gratuito, sem cartão):** Firestore com 1 GiB, 50 mil leituras e 20 mil escritas por dia; Authentication com e-mail/senha e Google incluídos. Mais que suficiente.
- **Cuidado com uma mudança recente:** desde **3 de fevereiro de 2026** o Cloud Storage do Firebase exige o plano **Blaze com cartão cadastrado**, mesmo sem gastar nada. Projetos no Spark recebem erro 402/403. É exatamente por isso que as fotos do app ficam guardadas no aparelho, e não no Firebase.
- **Hospedagem:** o Firebase Hosting gratuito dá 10 GB de armazenamento, mas o limite de tráfego na tabela do plano é de **360 MB por dia** — bem mais apertado que o GitHub Pages. E o Firebase Hosting não tem upload pelo painel: exige a ferramenta de linha de comando. Por isso a recomendação é GitHub Pages.
- **Se usar Authentication com o site no GitHub Pages:** cadastre `SEU_USUARIO.github.io` (só o domínio, sem `/aquaflow`) em **Authentication → Settings → Authorized domains**, e use `signInWithPopup()` — o método de redirecionamento quebra em hospedagem de terceiros por causa do bloqueio de cookies.
- **Regras do Firestore** para cada pessoa ver só os próprios dados:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

O `firebaseConfig` que aparece no painel é público por natureza — não é segredo. O que protege os dados são essas regras.

---

## 7. Outras hospedagens, se quiser comparar

| Hospedagem | Gratuito | Sobe pelo navegador? | HTTPS |
|---|---|---|---|
| **GitHub Pages** | 1 GB de site · ~100 GB/mês | Sim, arrastando a pasta | Sim |
| Cloudflare Pages | requisições de arquivos ilimitadas | Sim, arrastando pasta ou zip | Sim |
| Netlify Drop | 300 créditos/mês (para e pausa ao atingir) | Sim, arrastando a pasta | Sim |
| Firebase Hosting | 10 GB · 360 MB/dia de tráfego | Não, exige linha de comando | Sim |

Para o seu caso, GitHub Pages resolve. Cloudflare Pages é a segunda melhor opção — igualmente simples e com tráfego mais generoso.

---

## 8. O que o app não faz (e é bom você saber)

- **Notificações com o app fechado não funcionam.** Isso exigiria um servidor enviando as mensagens. O que existe é um aviso das tarefas do dia enquanto o app está aberto, que você liga em Ajustes. No iPhone, notificação de web app só funciona depois de instalado na tela de início.
- **Não há login nem sincronização.** Um aparelho, um conjunto de dados. É o que o passo 5 resolve com backup manual.
- **As dosagens são calculadas a partir da regra do rótulo** (Prime 5 mL para 200 L de água nova; Stability 5 mL para 40 L no primeiro dia e 5 mL para 80 L depois). O app deixa claro quando o valor é estimado. **Confirme a concentração no seu frasco** — fabricante muda fórmula.
- **O app não substitui observação.** A carga biológica é uma estimativa conservadora; comportamento dos animais e parâmetros medidos valem mais que qualquer conta.

---

## 9. Regras que o app nunca quebra

Estão no código **e** no prompt enviado à IA — valem nos dois modos. Você vê a lista completa em **Ajustes → Como funciona o Consultor**. As principais:

1. Todo cálculo usa o **volume útil** informado (80 L), nunca o bruto (96 L).
2. Nenhum peixe é liberado com amônia acima de 0 ppm.
3. Nenhum peixe é liberado com nitrito acima de 0 ppm.
4. Uma única medição nunca confirma estabilidade. Para declarar o ciclo concluído, o app exige **3 medições em 0/0 ao longo de pelo menos 5 dias**.
5. Nunca recomenda substituir por completo as mídias biológicas.
6. Nunca mistura Prime e Cloronev — o app bloqueia o registro e explica.
7. Transnev não entra durante a ciclagem nem como prevenção no comunitário.
8. Betta exige fluxo brando e é o último a entrar.
9. **Nunca inventa dado que falta.** Se falta medição, ele diz qual e pede.
10. Toda análise termina com uma pergunta objetiva, nunca com "posso ajudar em mais alguma coisa?".
