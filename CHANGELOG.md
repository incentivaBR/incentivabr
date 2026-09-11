# CHANGELOG — IncentivaBR Rouanet

## [Não lançado] — 2026-09 — Onda 2 do Raio-X

### O aviso na tela não some mais, e o cadastro diz o que aconteceu
- **Causa raiz.** `js/utils.js` injetava um `.toast` antigo (estado base `opacity: 0`, à espera de um `.show`) que mirava o mesmo elemento do `js/toast.js` e vencia nas duas propriedades que este não declarava. Nas duas páginas que carregam os dois arquivos, `login.html` e `calculadora.html`, todo aviso aparecia durante os 0,3s da animação de entrada e sumia. Ninguém conseguia ler por que o cadastro ou o login tinha falhado. As classes do aviso de reserva passam a ter nome próprio (`aviso-simples`), e o `js/toast.js` declara o estado visível e preserva o quadro final da animação (`both`), para não voltar a depender do que outra folha de estilo disser.
- O aviso também trazia a largura somada ao recuo, e no celular a caixa passava da borda da tela levando o botão de fechar junto. `box-sizing: border-box` no próprio componente, que traz o próprio CSS e não deve depender do reset da página.
- `scripts/confere-paginas.mjs` (job do CI no Chromium) passa a mostrar um aviso em cada página e falhar se ele ficar invisível ou fora da área visível depois da animação.
- **Cadastro.** A resposta de sucesso mandava "verifique seu email para ativar a conta". O token de verificação é gerado e guardado como hash, mas o valor em claro não é enviado a ninguém e não existe página que o receba: a conta já entra pelo login. A mensagem passa a dizer isso.
- A entrada automática depois do cadastro falhava em silêncio: a conta estava criada, a pessoa voltava para a aba de entrar sem saber, tentava de novo e recebia "Email já cadastrado". Agora a tela diz que a conta foi criada, repete o motivo da falha e pede para entrar.
- `POST /api/auth/register` pedia a conexão FORA do `try`. Com o banco indisponível, a promessa do handler era rejeitada e o Express 4 não encaminha rejeição de função async para o tratador de erro: a requisição ficava sem resposta e a tela girava até o navegador desistir. Agora responde 500 em JSON.
- O limitador de tentativas vale para entrar e para criar conta, que dividem a mesma cota de 10 a cada 15 minutos, mas a mensagem falava só em login e mandava quem tentou se cadastrar procurar problema onde não estava.
- `backend/tests/cadastro-conta.test.mjs`.

### White label: a página inicial do cliente
- Um cliente white-label recebia a cor e a logo dele sobre o discurso da IncentivaBR. A migration 039 dá três textos à organização (frase principal, parágrafo, quem somos), editados na tela de clientes do superadmin e devolvidos por `GET /api/config/brand` em `textos`, junto com `slug` e `eh_plataforma`. `tenant.js` escreve cada um em `[data-tenant="…"]` por `textContent`, e mostra `[data-so-cliente]` só na página de um cliente. Em branco, a página fica com o texto da IncentivaBR.
- Na página do cliente, o projeto ativo dele vem no hero, com PRONAC e o botão "Destinar para este projeto" (`data-projeto`, `data-destinar`), e uma seção "Quem somos" com o e-mail de contato. O rodapé único ganha a linha "opera esta página com a tecnologia IncentivaBR".
- `PUT /api/admin/orgs/:id` aceita os três textos, corta no limite (160, 400 e 2.000 caracteres) e apaga com string vazia sem mexer nos outros campos. `backend/tests/textos-tenant.test.mjs`.
- Fica: domínio próprio por cliente é DNS e domínio na Railway (o middleware já resolve `custom_domain`); a logo do cliente ainda é gravada por `logo_url` na API, sem upload na tela.

### TINA: resposta em texto, sem tags na tela
- A persona mandava o modelo responder em HTML e o widget, desde o escape de HTML, mostra a resposta como texto: cada `<br>` e `<strong>` aparecia escrito. A persona passa a pedir texto simples com `**negrito**`, e o widget devolve só essa formatação depois de escapar.
- A TINA afirmava "não há risco", "milhões fazem" e o código 41 da DIRPF como certeza. "Zero risco" saiu da persona, de `faq.html` e de `guia-ir-servidor.html`; "milhões de brasileiros" saiu das duas páginas. Regras novas: nunca "não há risco" ou "100% seguro"; nunca citar adesão ou quantidade fora da base; código da DIRPF como "confira no programa do ano". `nucleo.md` regenerado; guardas em `prompt-tina.test.mjs`.

### Layout: a logo da barra não encolhe
- `tenant.js` trocava a logo horizontal da barra pela `logo_url` da organização, que para a IncentivaBR é a versão quadrada gravada pela migration 012: a logo abria grande e encolhia. A troca vale só para logo de cliente white-label.

### Layout único, parte 2: uma paleta (risco 11)
- Decisão: na tela, o azul primário é o navy #0F1E3D; o #273F77 do manual fica para logotipo e impresso (`brand/IDENTIDADE-VISUAL.md`).
- `frontend/js/tema.js` é o único lugar onde a paleta do Tailwind é definida. Os 14 blocos `tailwind.config` copiados de página em página, com quatro paletas diferentes, viraram uma linha de `<script>`. `navy` era #273F77 na página inicial e em `para-associacoes` e #0F1E3D nas outras doze.
- O acento (`gold`, `orange`) passa a sair de `--secondary-rgb`, que `tenant.js` escreve a partir da cor do cliente: `bg-gold/20` e `text-gold/80` agora seguem a cor do tenant, o que `var(--secondary-color)` direto não permitia.
- #273F77 trocado por #0F1E3D nas seis páginas de aplicação, no e-mail de redefinição de senha, no e-mail de boas-vindas, no PDF de registro e nos padrões de `config.js` e `admin.js`.
- O verificador de páginas do CI confere que a paleta de `tema.js` foi aplicada em toda página que usa o Tailwind.
- Fica: os seis formatadores de moeda copiados, que dependem de todas as páginas carregarem `utils.js`.

### Página órfã arquivada
- `impacto.html` não tinha nenhum link chegando nela; foi para `archive/paginas-2026/` e no lugar ficou um redirecionamento para a página inicial. Os outros sete endereços antigos já eram redirecionamentos e continuam. A agenda fiscal apontava para `projetos.html` (um redirecionamento) e passa a apontar direto para `projetos-rouanet.html`.

### Rouanet na frente (risco 12)
- O produto registra destinação só pela Lei Rouanet, mas quatro páginas prometiam "7 modalidades" e a persona da TINA se apresentava como assistente dos "7 mecanismos". Agora a página inicial, a calculadora, a biblioteca jurídica, o Espaço do Contador e a página de impacto dizem o que a plataforma faz: destinação pela Lei Rouanet, art. 18; as outras leis ficam como material de consulta, com aviso de que não há caminho de destinação para elas na plataforma. O card de Cultura na página inicial é marcado "Disponível na plataforma".
- A resposta "Posso cair na malha fina?" da página inicial deixava de dizer quem emite o recibo e afirmava que a plataforma "gera toda a documentação necessária"; corrigida.
- Persona da TINA (`chat.js`): plataforma de destinação pela Lei Rouanet; sobre as demais leis, explica em termos gerais e encaminha ao contador. `nucleo.md` regenerado.

### Layout único, parte 1: barra e rodapé (risco 11)
- `frontend/js/layout.js` passa a ser a única barra de navegação e o único rodapé das páginas públicas, com o CSS injetado por ele mesmo (antes o CSS das classes `dai-nav` não existia em lugar nenhum: nove páginas mostravam a barra copiada à mão e, por cima, uma segunda barra sem estilo). Menu de celular com gaveta, overlay e Escape. Links fixos: Calculadora, Projetos, Como funciona, Contadores, FAQ, Entrar (vira o nome de quem está logado) e "Destinar agora" (`data-destinar`, preenchido pelo tenant).
- Quinze páginas perderam o `<nav>` próprio e sete perderam o `<footer>` próprio; seis passaram a chamar `Layout.init` (`index`, `espaco-contador`, `biblioteca-juridica`, `validador`, `agenda-fiscal`, `para-associacoes`). A barra é `sticky`, então a primeira seção dessas páginas deixou de reservar espaço para uma barra fixa.
- Apagados `css/incentivabr-theme.css` (3.552 linhas, paleta teal/âmbar que nenhuma página carregava) e `js/mobile-menu.js` (nenhuma página carregava).
- O verificador de páginas do CI acusa mais de uma barra de navegação na mesma página.
- Fica para a parte 2: os 14 blocos `tailwind.config` copiados, a decisão entre o azul do manual (#273F77) e o navy que as páginas usam (#0F1E3D), e os seis formatadores de moeda.

### Fonte única dos textos fiscais (risco 04)
- `backend/src/lib/textosFiscais.js` monta um objeto só com teto (de `tetos_deducao`), mecanismos e qual teto cada um divide (`incentive_groups`), ficha e códigos da DIRPF, quem emite o Recibo de Mecenato e em quanto tempo (`organizations.mecenato_prazo_dias`), art. 18/26, prazo de guarda e o aviso. `GET /api/config/brand` devolve em `fiscal`; a TINA recebe o resumo em texto no bloco do tenant do prompt.
- `tenant.js` preenche todo `[data-fiscal="…"]` com esse objeto. As páginas deixaram de escrever o percentual à mão: os 76 "6%" em 15 páginas viraram `<span data-fiscal="teto_pct">6%</span>`, com o valor de hoje como reserva. Sete páginas passaram a carregar `tenant.js`.
- Contradições resolvidas pela leitura adotada (migration 031): "até 7% do IR" na calculadora, "7% — o maior entre todas" no Espaço do Contador e na Biblioteca, "3%" do Fundo do Idoso, `0.07` no validador. Ficha DIRPF: a Rouanet e o Fundo do Idoso tinham o mesmo código 41; agora cultura 41, ECA 40, idoso 44, desporto 43, audiovisual 42, marcados como **não confirmados em fonte primária** (os sites da Receita não eram alcançáveis deste ambiente). Prazo do recibo: "15 dias legais" e "60 dias" viraram o prazo declarado pelo proponente. `guia-ir-servidor` dizia que a IncentivaBR emite o recibo.
- `nucleo.md` regenerado pelo script de sync, que estava atrasado desde a Onda 0: saem a conta bancária antiga (três vezes) e o "IncentivaBR emite".
- `backend/tests/textos-fiscais.test.mjs`: objeto do banco, resumo no prompt, `fiscal` na rota, e três guardas sobre as páginas (nenhum "6%" fora de `data-fiscal`, nenhum "7% do IR", `tenant.js` onde há `data-fiscal`).

### Escape de HTML e Content-Security-Policy (risco 05)
- Todo texto que vem de fora e vira HTML passa por escape: resposta da TINA e pergunta digitada (`js/tina.js`), título e status da destinação e mensagens de erro (`dashboard.html`), dados do projeto vindos do SALIC (`destinar-rouanet.html`), nome de cliente e e-mail de convidado (`admin-clientes.html`), dados do titular (`minhas-preferencias.html`), título e mensagem dos toasts (`js/toast.js`, `js/utils.js`). `conferencia.html` e `projetos-rouanet.html` já escapavam.
- `server.js` liga a Content-Security-Policy do helmet: script só da própria origem, do Tailwind Play CDN e do cdnjs; estilo e fonte do Google Fonts e do cdnjs; imagem de qualquer https (logo de tenant); `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`. `'unsafe-inline'` em script continua necessário porque as páginas têm script embutido e `onclick`. Conferido no Chromium, página a página, sem violação.
- `backend/tests/csp.test.mjs` garante o cabeçalho e as origens.

### Segurança de conta (risco 05)
- O JWT deixa de carregar o CPF. Leva só `userId`, `orgId`, `orgSlug` e os papéis; ninguém no backend lia o CPF do token, e o payload é legível por qualquer um que tenha o token.
- Tokens de redefinição de senha e de verificação de e-mail entram no banco como SHA-256 (`backend/src/lib/tokens.js`, o mesmo mecanismo dos convites). O valor em claro só existe no e-mail. Migration 038 anula os que existiam em claro.
- O fluxo "Esqueceu sua senha?" passa a funcionar de ponta a ponta: antes o botão mandava escrever para o contato, e o e-mail apontava para uma página que não existia. Agora `login.html` pede o e-mail, o servidor envia o link e `redefinir-senha.html` grava a senha nova. Resposta igual exista ou não a conta.
- `backend/tests/redefinicao-senha.test.mjs`: hash no banco, claro no e-mail, o hash roubado não redefine, uso único, expiração, JWT sem CPF, migration 038.

### Alterado
- Dependências do backend sem vulnerabilidade conhecida (`npm audit`: 7 → 0). `multer` 2.1.1 → 2.3.0, `nodemailer` 8 → 10 (só o Ethereal de desenvolvimento usa; produção é Resend), `form-data`, `ip-address`, `brace-expansion`, `body-parser` nas versões corrigidas; `qs` fixado em `^6.16.0` por `overrides`, porque o Express 4 prende em `~6.14.0`. Suíte completa verde. Os alertas restantes do Dependabot são de `archive/`, que não é servido.

---

## [Não lançado] — 2026-09-07 — Onda 1 do Raio-X: fundações (PRs #7 a #12)

### Adicionado
- `.github/workflows/ci.yml` — testes do backend a cada push e PR (check "Testes do backend").
- `.github/workflows/backup.yml` e `scripts/backup-postgres.sh` — dump diário cifrado (gpg) para o bucket, retenção de 30 dias; `scripts/restaurar-postgres.sh` com conferência de contagens. Restore executado e registrado em `docs/operacao/backup-restore.md`.
- `.github/workflows/uptime.yml` — `/health` e `/diagnostico` a cada 15 minutos; falha vira e-mail do GitHub.
- `backend/src/services/armazenamento.js` — object storage S3-compatível (R2 recomendado) com fallback local; `lib/validaArquivo.js` decide o tipo pelos primeiros bytes; `lib/recebeArquivo.js` e `lib/entregaArquivo.js`. Migration 037 (`receipt_sha256`, `mecenato_sha256`). `backend/scripts/migrar-uploads-para-storage.mjs`.
- `backup.yml` instala o cliente Postgres na versão do servidor (a Railway está no 18; o runner trazia o 16 e o `pg_dump` abortava por "server version mismatch"). `backup-postgres.sh` grava o `.sha256` em disco antes de enviar (a `aws cli` recusa pipes). Primeiro backup de produção no bucket em 7 de setembro de 2026.
- Sonda do armazenamento na subida: o servidor grava um arquivo em `_diagnostico/`, lê de volta, confere o SHA-256 e apaga. Chave errada, endpoint com o nome do bucket ou token sem escrita viram `armazenamento: error` no `/diagnostico` (campos `verificado` e `verificado_em`) e linha vermelha no log, sem esperar o primeiro upload de um servidor.
- Migration 036 (`users.updated_at`): `PUT /api/auth/profile` respondia 500.
- Testes: `migracoes`, `teto-registro`, `armazenamento`, `uploads-http`; garantias novas em `modo-texto` e `conferencia-http`.
- Documentos: `docs/operacao/ci-e-deploy.md`, `armazenamento.md`, `backup-restore.md`.

### Alterado
- `backend/src/config/migrate.js` — schema, seeds e a 003 legada só em banco vazio; transação por migration com registro no `migrations_log`; a primeira falha aborta o boot (na Railway, o deploy anterior continua no ar). `PERMITE_BOOT_SEM_MIGRACOES=true` é a saída de emergência. Migrations rodam antes do `listen`.
- `POST /api/donations/rouanet` — advisory lock por contribuinte, IR devido fixado por ano no menor valor registrado, `saldoDisponivel` dentro da transação, mensagens com o percentual vindo de `tetos_deducao`, bloco `saldo` na resposta. A regra vale também em simulação. `tetosVigentes`/`tetoDoMecanismo`/`saldoDisponivel` aceitam a conexão da transação (evita esgotar o pool sob concorrência).
- Upload de comprovante e de recibo: em memória, tipo pelo conteúdo, erros do multer viram 400, download por stream. `receipt_url` e `mecenato_url` guardam a chave no bucket; valores antigos continuam lidos.
- `destinar-rouanet.html` — sem jsPDF; botão chama o PDF do servidor; texto do PDF nos dois modos; "Ir para meu painel"; mensagens com o nome do projeto vindo do servidor; card de impacto do piloto removido; placeholders `[data-projeto]` preenchidos.
- Confirmação (e simulação) avisa o destinador por e-mail (`notifyDestinationConfirmed`).

### Depende de configuração no painel
- Railway: "Wait for CI"; GitHub: proteção do `main` com o check. Bucket R2 e cinco variáveis `S3_*`. Seis segredos do backup no GitHub. Monitor externo em `/health`.

---

## [Não lançado] — 2026-09 — Onda 0 do Raio-X: para de sangrar

### Removido
- Blocos com conta bancária (Ag. 1419-2 / Conta 36.068-6 / FNC) de `como-funciona.html`, `faq.html` e `passo-a-passo.html`. No lugar, aviso: os dados bancários aparecem na etapa de pagamento, vindos do cadastro do projeto.
- Admin de teste do `seeds.sql` (recriado a cada boot) e conta demo do piloto FGV. Migration 035 apaga as duas do banco, ou só desativa quando há destinação vinculada.
- Fallback do `login.html` que fabricava sessão quando a API falhava, e o modo `?demo=true`.
- Seção de mecanismos, limites e percentuais do `SYSTEM_PROMPT` da TINA ("7% independente", "até 13%") e métricas internas sem fonte ("88%", "NPS +64"). O `nucleo.md` é a única fonte de percentuais.

### Alterado
- Migration 034 zera `bank_*`/`pix_*` da organização `www` e desativa o PRONAC fictício 261847.
- `POST /api/donations/rouanet` exige projeto ativo com conta de captação preenchida fora da simulação; responde 409 com mensagem clara e não grava. Não há mais fallback para conta da organização nem para "Banco do Brasil / 001 / —" escritos no código.
- `GET /api/salic/org-project` usa só `org_projects` como fonte de dados bancários, inclusive no fallback sem SALIC.
- CTA "Criar Conta Grátis" da calculadora aponta para `login.html?tab=register&redirect=destinar-rouanet.html` (antes, `cadastro.html`, inexistente).

### Adicionado
- `backend/tests/prompt-tina.test.mjs` — falha se o prompt final contiver "13%" ou "independente da Rouanet".
- `backend/tests/conta-captacao.test.mjs` — cobre a recusa sem conta, a resposta sem fallback e a migration 034.

---

## [1.3.1] — 2026-05-16 — Piloto FGV: piloto-start.html + demo account

### Adicionado
- `frontend/piloto-start.html` — landing page do piloto com fluxo 3 etapas
- `backend/src/migrations/024_demo_user_piloto.sql` — conta demo compartilhada do piloto (removida pela migration 035, set/2026)
- OG tags no piloto-start.html para preview rico no WhatsApp
- Trust block (nenhum dado bancário / FGV / anônimo)
- Demo auto-login via `?demo=true` em login.html (MAR15)

### Alterado
- `frontend/login.html` — banner piloto + auto-preenchimento demo
- `frontend/piloto.html` — CTAs direcionam para destinar-rouanet.html diretamente
- `docs/piloto-fgv/mensagens-whatsapp-piloto.md` — 5 versões com URL www + data limite 15/jun
- Copy headline: "Você sabia que parte do seu IR descontado do seu salário..."

---

## [1.3.0] — 2026-04-30 — Piloto FGV: Campanha Cadeira 47
### Contexto
Substituição do projeto Circuito do Forró (PRONAC 252026) pelo projeto piloto
**Orquestra das Periferias do DF** (PRONAC 261847 — fictício, SIMULATION_MODE=true).
Objetivo: validar H1/H2 da pesquisa FGV (usabilidade e intenção de destinação).
Decisão estratégica: somente projetos Art. 18 (FNC, 100% dedutível) — nunca Art. 26 (80%).

### Adicionado
- `backend/src/migrations/022_orquestra_periferias.sql` — troca PRONAC + dados do projeto em `organizations` e `org_projects` (slug='www')
- `frontend/index.html` — reescrita completa com tema "Cadeira 47":
  - Hero: "A Cadeira 47 está esperando." (placeholder `assets/orquestra-hero.webp`)
  - Grid de 40 cadeiras CSS (7 pré-apoiadas: 3,7,12,18,23,31,36)
  - Seção 3 Atos: O Início / O Processo / A Visão
  - Credibilidade: Baccarelli (R$3,49 SROI/IDIS 2023) e Orquestra Jovem de Goiás
  - Contador live: 7/40 cadeiras apoiadas
  - CTA: "Você não sabe ainda quem vai sentar na Cadeira 47."
- `frontend/projeto-detalhes.html` — seções especiais para PRONAC 261847:
  - `DEMO_PROJETOS` dict: dados estáticos (não consulta SALIC para PRONAC fictício)
  - Seção "A Cadeira 47" com grid escuro de 40 cadeiras
  - Narrativa 3 Atos inline
  - Comparativo Art. 18 vs Art. 26 (verde/vermelho)
  - Sidebar: "Reserve uma cadeira" em vez de "Destine seu IR"
  - CTA final contextual para a Orquestra

### Projeto piloto — Orquestra das Periferias do DF
- **PRONAC:** 261847 (fictício para simulação FGV)
- **Proponente:** Associação Cultural Orquestra das Periferias do DF
- **CNPJ:** 47.832.156/0001-93
- **Banco:** Banco do Brasil — Ag. 3217-4 / Conta 48.291-5
- **Artigo:** Art. 18 — FNC — Música Erudita — 100% dedutível
- **Meta:** R$ 520.000 / Captado demo: R$ 91.000 (17,5%)
- **Público:** 80 jovens de 14–24 anos — Ceilândia, Samambaia, Santa Maria
- **Atividades:** ensaios semanais, 6 concertos públicos, gravação audiovisual

### Decisões estratégicas registradas
- Cadeira 47 = vaga anônima (nenhum menor nomeado — evita LGPD + risco de não entrega)
- Após piloto: `DELETE FROM donations WHERE status = 'test_simulated'`
- Trocar PRONAC = 5 min (arquitetura parametrizada por URL `?pronac=X`)
- IncentivaBR = marca mãe; DestineAI = showroom is_demo=true da Lei Rouanet

### Pendente
- Atualizar `destinar-rouanet.html` (wizard ainda referencia PRONAC 252026)
- Imagens da Orquestra para Nano criar: `assets/orquestra-hero.webp` e `assets/orquestra-card.webp`
- Corrigir 9% → 8% em `para-contadores.html` e demais arquivos

---

## [1.0.0] — 2026-03-10
### Origem
Fork white-label do repositório `casdfteste/incentivaBR-GDF`.
Extraídos apenas os módulos referentes à Lei Rouanet (Lei 8.313/1991).

### Incluído
- Proxy SALIC com cache TTL (áreas, segmentos, projetos, org-project)
- Wizard `destinar-rouanet.html` — 6 steps: projeto → calculadora → valor → pagamento → comprovante → confirmação
- Página `projetos-rouanet.html` com filtros ao vivo
- Migrations `008_rouanet.sql` e `009_rouanet_tenant.sql`
- Calculator com `case 'rouanet'` (6% IR devido)
- `POST /api/donations/rouanet` com validação de limite
- `GET /api/salic/org-project` com fallback offline
- `docker-compose.yml` para ambiente de desenvolvimento
- White-label parametrizável via `.env`

### Removido (específico GDF)
- `admin.html`, `painel-organizacao.html`, `clube-vantagens.html`
- `para-organizacoes.html`, `para-contadores.html`
- Rotas: `funds.js`, `orgDashboard.js`, `admin.js`
- Referências a FDI/DF e FDCA/DF
