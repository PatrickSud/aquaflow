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
2. **Importante:** abra o `sw.js` e aumente a linha `const VERSION = ...`. A versão atual é **`'v1.1.1'`** — na próxima alteração passe para `'v1.1.2'`, depois `'v1.1.3'`, e assim por diante.

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

Mesmo com a nuvem ligada (seção 10), **sincronizar não é backup**. São coisas diferentes:

- **Sincronizar** mantém os aparelhos iguais. Se você apagar um registro por engano no celular, ele é apagado no computador também.
- **Backup** é uma foto congelada no tempo, que a sincronização não alcança.

E se você **não** ligar a nuvem, os registros ficam apenas no navegador deste aparelho: limpar os dados do navegador, desinstalar o app ou trocar de celular apaga tudo.

Nos dois casos, a rede de segurança é a mesma: **Ajustes → Exportar backup completo**. Sai um arquivo `.json` com tudo, inclusive as fotos. Guarde no Google Drive.

Faça isso de vez em quando — e obrigatoriamente antes de trocar de celular. Para restaurar: **Ajustes → Restaurar backup**.

Em **Ajustes → Histórico → Exportar medições (CSV)** você também tira uma planilha só das medições, que abre no Excel.

---

## 6. Firebase — o que está configurado

**Já está pronto.** O arquivo `js/firebase-config.js` aponta para o projeto **`aquaflow-27258`**. O passo a passo de criar a conta e sincronizar está na **seção 10**.

O que é útil saber (verificado em setembro de 2026):

- **Plano Spark (gratuito, sem cartão):** Firestore com 1 GiB, 50 mil leituras e 20 mil escritas por dia; Authentication com e-mail/senha incluído, até 50 mil usuários por mês. Muito acima do que você vai usar.
- **Sem cartão cadastrado não existe cobrança possível.** Se algum dia estourar a cota diária, o serviço simplesmente para até a virada do dia.
- **A configuração no arquivo não é segredo.** O Firebase publica esses valores no navegador de propósito — é assim que o SDK sabe com qual projeto falar. Pode ir para repositório público. **O que protege os dados são as Regras de Segurança** (seção 10.5). Sem publicá-las, o banco fica aberto.
- **Opcional, se quiser blindar mais:** no [Google Cloud Console → APIs e serviços → Credenciais](https://console.cloud.google.com/apis/credentials), você pode restringir a chave da API para aceitar chamadas apenas do seu domínio (`SEU_USUARIO.github.io`). Não é obrigatório; serve para evitar que alguém use sua cota.
- **Cloud Storage não é usado.** Desde **3 de fevereiro de 2026** ele exige o plano **Blaze com cartão**, mesmo sem gastar nada — projetos no Spark recebem erro 402/403. Por isso as fotos ficam no aparelho e, quando sincronizadas, vão dentro do próprio banco.
- **Hospedagem continua no GitHub Pages.** O Firebase Hosting gratuito dá 10 GB de armazenamento mas só **360 MB de tráfego por dia**, e não tem upload pelo painel — exige linha de comando. GitHub Pages é melhor nos dois pontos.
- **Login em site fora do Firebase:** é obrigatório cadastrar `SEU_USUARIO.github.io` (só o domínio, sem `/aquaflow`) em **Authentication → Settings → Authorized domains**. Sem isso o login falha com "domínio não autorizado".

As regras a publicar estão prontas no arquivo `firestore.rules` deste projeto — basta trocar o e-mail. Elas exigem três coisas ao mesmo tempo: estar autenticado, acessar apenas a própria pasta, e ter e-mail **confirmado e na lista**.

> Atenção: **não** use a versão simplificada que circula em tutoriais, com apenas `request.auth.uid == uid`. Ela protege um usuário do outro, mas deixa **qualquer pessoa que crie uma conta** no seu projeto usar o seu banco livremente. Como no plano gratuito não há como impedir cadastro, a lista de e-mails é o que fecha essa porta.

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
- **A conversa do Consultor e a marcação de tarefas do dia não sincronizam.** São informações do momento, de cada aparelho. Todo o resto sincroniza (ver seção 10).
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

---

## 10. Login e nuvem (passo a passo)

O app funciona 100% sem isto. Só faça se quiser entrar com e-mail e senha e ter os dados sincronizados entre celular e computador. **Não pede cartão de crédito.**

### 10.1 Criar o projeto (uma vez)

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e entre com uma conta Google.
2. **Criar um projeto** → nome: `aquaflow`.
3. O **ID do projeto** que ele mostra **não pode ser alterado depois**. Confira e siga.
4. Google Analytics: **pode desativar**, não é necessário.
5. Clique em **Criar projeto** e aguarde.

### 10.2 Registrar o app da Web

1. Na visão geral do projeto, clique no ícone **`</>`** (Web).
2. Apelido: `AquaFlow`. **Não** marque Firebase Hosting (você já usa GitHub Pages).
3. **Registrar app**. Ele mostra um bloco começando com `apiKey`. **Deixe essa aba aberta.**

### 10.3 Ligar o login por e-mail e senha

1. Menu à esquerda → **Criação** (ou *Build*) → **Authentication** → **Vamos começar**.
2. Aba **Sign-in method** → **E-mail/senha** → ative a primeira chave → **Salvar**.
3. Aba **Settings** → **Domínios autorizados** → **Adicionar domínio** → digite **apenas** `SEU_USUARIO.github.io` (sem `/aquaflow`, sem `https://`).

Sem o passo 3, o login falha com "domínio não autorizado".

### 10.4 Criar o banco de dados

1. Menu → **Firestore Database** → **Criar banco de dados**.
2. Local: **`southamerica-east1` (São Paulo)** — mais perto, mais rápido. **O local é permanente.**
3. Escolha **Modo de produção** (nunca modo de teste: modo de teste deixa qualquer pessoa ler e apagar seus dados).
4. Criar.

### 10.5 Publicar as regras de segurança — não pule

1. Abra o arquivo [firestore.rules](C:/Claude/AquaFlow/firestore.rules) deste projeto.
2. Troque `troque-pelo-seu@email.com` pelo e-mail que você vai usar para entrar.
3. No console: **Firestore Database** → aba **Regras** → apague tudo → cole → **Publicar**.

**Por que isso importa:** seu repositório é público, então a configuração do Firebase é visível. Isso é normal e esperado — o Firebase publica esses valores no navegador de propósito. No plano gratuito **não existe** forma de impedir que um estranho crie uma conta no seu projeto (bloquear cadastro exige Cloud Functions, que só rodam no plano pago). Estas regras resolvem pelo outro lado: a pessoa consegue criar a conta, mas não lê nem grava **nada** se o e-mail não estiver na lista **e** confirmado. É a proteção certa e disponível no gratuito.

### 10.6 Configuração no app — já feito

O arquivo [js/firebase-config.js](C:/Claude/AquaFlow/js/firebase-config.js) já está preenchido com o projeto `aquaflow-27258`, e a versão do `sw.js` já foi para `v1.1.1`. Nada a fazer aqui — basta publicar no GitHub.

Se um dia precisar trocar de projeto: ou edita esse arquivo, ou usa **Ajustes → Conta e nuvem → Colar configuração do Firebase** (que vale só no aparelho onde você colar, útil para testar antes de publicar).

### 10.7 Criar sua conta e escolher a direção

1. No app: **Ajustes → Conta e nuvem → Criar conta**.
2. Confirme o e-mail — **as regras exigem e-mail confirmado**. A mensagem vem de um endereço automático do Google, então **olhe o spam**.
3. Depois de entrar, o app pergunta o que fazer. Ele **nunca** decide sozinho:
   - **Enviar o que está neste aparelho** → primeira vez, com os dados no celular.
   - **Baixar o que já está na nuvem** → aparelho novo.

### 10.8 Como a sincronização funciona

- **O aparelho continua sendo a fonte da verdade.** Sem internet, o app funciona igual; sincroniza quando a conexão volta.
- Envia automaticamente alguns segundos depois de você registrar algo, e ao abrir o app.
- Cada medição é **um registro próprio** na nuvem, não um arquivão. Registrar uma medição custa **uma** gravação, independente de quantos anos de histórico já existam.
- **Exclusão viaja.** Se você apaga uma medição no celular, ela não volta do computador.
- **Horário é o do servidor, não o do celular.** Se o relógio do aparelho estivesse adiantado, um registro feito noutro aparelho ficaria para trás do marcador de leitura e seria perdido — sem erro nenhum aparecendo. Usando o horário do servidor, todos comparam a mesma régua.
- **Fotos não sincronizam por padrão.** Você liga em **Conta → Sincronizar fotos**. Fica desligado porque foto consome muito mais dados que texto: 200 fotos são cerca de 76 MB, e a cota gratuita de saída é 10 GB por mês.

### 10.9 Quanto isso consome do plano gratuito

Cota diária gratuita: 50.000 leituras, 20.000 gravações, 1 GiB armazenado.

Na prática, com 5 aquários e abrindo o app 30 vezes por dia, dá cerca de 1.200 leituras — **2,4% da cota**. Registrar uma medição é 1 gravação. Você não chega perto do limite.

E se chegar: no plano gratuito **o serviço simplesmente para até o dia seguinte, não gera cobrança**. Sem cartão cadastrado, não existe conta para pagar.

### 10.10 Se algo der errado

| Mensagem | O que fazer |
|---|---|
| "E-mail ou senha incorretos" | O Firebase **não distingue** senha errada de e-mail inexistente (proteção contra descobrir quais e-mails existem). Use "Esqueci minha senha". |
| "domínio não autorizado" | Falta o passo 10.3 — adicione `SEU_USUARIO.github.io` nos domínios autorizados. |
| "as regras do Firestore recusaram o acesso" | Confirme o e-mail e verifique se ele está na lista do `firestore.rules`, exatamente igual. |
| "login por e-mail e senha não está habilitado" | Falta o passo 10.3, primeira parte. |
| "Firestore ainda não foi criado" | Falta o passo 10.4. |
| Não chegou e-mail de confirmação | Olhe o spam. O remetente é automático do Google e cai em spam com frequência. |

### 10.11 Por que Firebase e não Supabase

Consideramos as duas. O Supabase tem vantagens reais (Postgres, código aberto), mas **pausa projetos gratuitos após 7 dias sem atividade** e o plano gratuito **não tem backup**. Para um app de aquário que você pode não abrir por duas semanas, isso significa chegar e encontrar tela em branco. O Firebase não pausa. Foi o que decidiu.

O que o Firebase **não** resolve de graça: guardar arquivos no Cloud Storage passou a exigir cartão desde 3 de fevereiro de 2026. É por isso que as fotos ficam no aparelho, e quando sincronizadas vão dentro do próprio banco.

### 10.12 O backup manual continua importante

Sincronizar não é backup. Se você apagar um registro por engano, ele é apagado nos dois lados. **Ajustes → Exportar backup completo** continua sendo sua rede de segurança.
