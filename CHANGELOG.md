# CHANGELOG — IncentivaBR Rouanet

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
