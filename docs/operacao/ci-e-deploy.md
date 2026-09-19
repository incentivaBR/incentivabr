# CI e deploy

Autor: Adacto Artur Dornas de Oliveira. Setembro de 2026.

## O que existe

`.github/workflows/ci.yml` roda a suíte do backend (`cd backend && npm ci && npm test`)
a cada push, em qualquer branch, e a cada pull request. A suíte usa pg-mem e não
depende de Postgres, chave de API ou segredo. O resultado aparece como o check
**Testes do backend** no commit e no PR.

A Railway continua fazendo deploy do branch `main` a cada push. O CI não
substitui isso; ele diz se o commit está são antes de a Railway publicá-lo.

## O que fazer no painel (uma vez)

Duas configurações fecham o ciclo "deploy só com verde". As duas ficam fora do
repositório.

1. **Railway → serviço → Settings → Deploy → Wait for CI.** Com isso ligado, a
   Railway espera os checks do GitHub passarem no commit antes de publicar.
   Check vermelho, deploy não sai.
2. **GitHub → Settings → Branches → Add rule para `main`:** marcar *Require
   status checks to pass before merging* e escolher **Testes do backend**.
   Marcar também *Require a pull request before merging*. Com isso ninguém
   mescla em `main` com teste quebrado, nem faz push direto.

## Quando o check ficar vermelho

Abra a execução em GitHub → Actions. A saída do `npm test` mostra qual arquivo
falhou e qual caso. Todos os testes rodam em qualquer máquina com
`cd backend && npm ci && npm test`; reproduza antes de corrigir.

"Flake" não é diagnóstico: a suíte não usa rede nem relógio. Se falhou, é código.

## Fluxos de ponta a ponta (E2E)

Os três jobs acima conferem peças: cada rota, o banco, cada tela abrindo.
Nenhum confere que as peças **encaixam** — que a calculadora leva ao projeto
certo, que o formulário de entrar chega ao painel, que o gestor vê a fila e o
destinador não. O job **"Fluxos no Chromium (E2E)"** faz isso: sobe
`tests/servidor-memoria.mjs` (o site da Casa Azul, com dados plausíveis e sem
banco) e `scripts/e2e.mjs` percorre os fluxos do
`fluxo-das-paginas.md` como uma pessoa faria.

Localmente: `cd backend && npm run e2e` (precisa de `npm i --no-save
playwright && npx playwright install chromium`).

O fixture é **envenenado**: nome de quem destina, título e descrição do
projeto, órgão do interessado e nome do arquivo do comprovante terminam em
`"><img data-veneno src=x>`. Se alguma tela puser um desses textos em
`innerHTML` sem escapar, nasce um elemento `[data-veneno]` e o fluxo é
recusado. Quatro fluxos ainda exigem que o veneno tenha chegado como texto —
uma guarda que nunca vê o veneno não prova nada. A guarda estática
correspondente é `tests/escape-innerhtml.test.mjs`, na suíte.

Sem rede, `SEM_CDN=1` bloqueia os CDNs e dá ao Tailwind um dublê com as
classes de display. O dublê existe porque o primeiro vermelho do E2E no
GitHub só acontecia lá: com o Tailwind de verdade, `.flex` vence `[hidden]`
e o cartão que vende o white-label aparecia no site do cliente. O CI não
define `SEM_CDN` — lá o Tailwind é o real, e é essa a rodada que vale.

A pasta `tests/` antiga (API + E2E de 2025, escritos para o DestineAI, o
Circuito do Forró e páginas que já não existem) saiu: o CI nunca a executou.

## Postgres de verdade no CI

A suíte (`npm test`) roda em pg-mem, sem infraestrutura — e isso é bom. Mas o
pg-mem é tolerante onde o Postgres não é: em setembro de 2026 um `WHERE email
= $2` recebendo `[null, email]` passou verde no pg-mem e derrubou todo
cadastro sem CPF em produção. Guardas de texto foram escritas; o único juiz
do que o Postgres aceita, porém, é o Postgres.

O job **"Postgres de verdade"** (`.github/workflows/ci.yml`) sobe um
`postgres:16` e roda `tests/postgres-real.test.mjs`, que:

1. apaga o schema e aplica `schema.sql`, `seeds.sql`, a 003 legada e **todas**
   as migrations num banco vazio;
2. confere que nada fica pendente e que o segundo boot não reaplica nada;
3. exercita o cadastro sem CPF, o e-mail repetido (409, não 500), o CPF em uso
   e o login contra o banco real.

Ele **não** entra no `npm test`: sem `DATABASE_URL` é pulado. E só aceita
banco cujo nome termine em `_teste` ou `_test`, porque apaga o schema antes de
começar — apontar para produção por engano não pode custar o banco.

### Rodar localmente

```bash
docker compose up -d db
docker compose exec db createdb -U incentivabr incentivabr_teste   # uma vez
cd backend && DATABASE_URL=postgresql://incentivabr:incentivabr123@localhost:5432/incentivabr_teste npm run test:postgres
```

Quando um teste novo tocar SQL que o pg-mem não executa (subconsulta
correlacionada, `FILTER`, lock consultivo), o lugar dele é este arquivo.

## A TINA responde? (manual)

`/diagnostico` diz se a chave da Anthropic existe e se a última chamada
falhou; o monitor de uptime alarma quando `assistente` vier com erro. Não diz
se a assistente responde algo que preste. O workflow **"TINA responde"**
(`.github/workflows/tina.yml`) faz uma pergunta real à TINA em produção e
confere status 200, texto de resposta e o aviso de que a plataforma não
substitui contador ou advogado. A resposta sai no log, para ler.

É manual (aba Actions → TINA responde → Run workflow), porque cada execução
gasta uma chamada ao modelo. Rode depois de mexer no prompt, na base de
conhecimento (`scripts/sync-nucleo-tina.mjs`) ou na chave.

A base de conhecimento é um retrato de seis páginas do site. Mexeu numa
página-fonte, rode o script: `backend/tests/nucleo-em-dia.test.mjs` falha no
CI se o arquivo não for o que o script geraria.
