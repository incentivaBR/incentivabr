# archive/

Tudo aqui é histórico. Nada nesta pasta é servido pela aplicação, copiado
para o deploy (`.railwayignore`) ou lido pelo backend. Serve para provar de
onde cada coisa veio e para consultar código antigo sem ressuscitá-lo.

Os manifestos npm (`package.json`, `package-lock.json`) dos três repositórios
foram removidos em setembro de 2026: o Dependabot os lia e acusava dezenas de
vulnerabilidades em código que ninguém executa, escondendo os alertas do
backend real. Os `npm install` dos READMEs antigos, portanto, não funcionam
mais a partir daqui. Para reconstruir um deles, pegue o manifesto no commit
anterior a essa remoção (`git log --diff-filter=D -- archive/**/package.json`).

## incentivabr-gdf/

O repositório ancestral, `incentivaBR/incentivabr-gdf`, trazido inteiro com
seus 105 commits (julho/2025 a abril/2026). É a versão do produto para os
fundos do DF (FDI e FDCA, contas no BRB), mais o MVP original de julho/2025
só em frontend, na raiz (`index.html`, `dashboard.html`, `login-govbr.html`).

Do que está aqui, o que ainda vale a pena portar para o produto, um item por
vez e reconferido antes:

- seeds de `official_funds` (FDI/DF e FDCA/DF) como dados do catálogo de leis;
- `backend/src/routes/orgDashboard.js` e `frontend/painel-organizacao.html`, o painel de impacto por associação;
- `backend/src/routes/funds.js`, adaptado para ler o catálogo de leis;
- textos de `clube-vantagens.html`, `para-organizacoes.html`, `para-contadores.html`.

O que não deve voltar: `admin.html` (superado por `conferencia.html`),
seeds com usuários de teste, `nixpacks.toml`, `Dockerfile`, `STATUS.md`.

Os comprovantes bancários que estavam em `backend/uploads/receipts/` e o CPF
que estava em `docs/LEGAL.md` foram removidos da árvore. Continuam em commits
antigos até a reescrita do histórico (`docs/operacao/limpeza-historico.md`).

A tag `mvp-2025` marca o último commit do MVP original, antes do backend.

## incentivabr-gdf-apresentacao/

Repositório privado `incentivaBR/incentivabr-gdf-apresentacao`, trazido
inteiro com seus 20 commits (10 e 11 de julho de 2025). É um deck de cinco
slides para gestores do GDF ("R$ 139 milhões sub-utilizados", "0,8% dos
servidores destinam"), em duas versões: `index.html` estático, publicado por
GitHub Pages, e um componente React nunca concluído.

Os números não têm fonte citada. A estrutura da narrativa (oportunidade,
problema, dados, solução, resultados) pode servir de esqueleto para um
material novo, mas nenhum valor deve ser reutilizado sem fonte.

## tina-incentivabr/

Repositório privado `incentivaBR/tina-incentivabr`, trazido inteiro com seus
26 commits (9 de julho de 2025). É um protótipo React de chat com respostas
escritas à mão; não chama nenhum modelo de IA. Diz que o teto é "7% do IR
devido" e lista percentuais por fundo que contradizem a leitura adotada no
produto (teto único de 6% até o parecer). O README traz afirmações sem lastro
("99,7% de conformidade", "2.847 servidores atendidos", "R$ 8,2 mi
destinados").

Nada daqui entra na TINA real (`backend/src/knowledge/nucleo.md`). Fica como
registro de que a assistente foi pensada antes de existir.

## paginas-2026/

Páginas do produto que ficaram sem nenhum link chegando nelas e saíram do
`frontend/` em setembro de 2026:

- `impacto.html` ("O Potencial do Seu IR"): a lista das sete leis com o
  teto de cada uma. A página inicial passou a dizer o mesmo, com a
  Rouanet na frente, e a biblioteca jurídica tem as fichas. No lugar ficou
  um redirecionamento para a página inicial, para links antigos não
  quebrarem.

Os outros endereços antigos (`campanha`, `piloto`, `piloto-start`,
`calculadora-escolha`, `calculadora-rapida`, `projetos`, `termos`,
`privacidade`) já eram só redirecionamentos de nove linhas e continuam no
`frontend/` por esse motivo.

## demos-2026/

Páginas e imagens que o produto não usa mais:

- `demo-calculadora.html`, `demo-dashboard.html`, `demo-projeto.html`: demonstrações do piloto ASJDF (março/2026), com paleta própria e depoimentos fictícios;
- `projeto-detalhes.html`: página órfã e quebrada, do projeto Circuito do Forró;
- `css/destineai.css`: só era usada por `projeto-detalhes.html`;
- `assets/`: imagens do Circuito do Forró, da Orquestra das Periferias, do piloto FGV e logos antigos que nenhuma página viva referencia.

Nenhum arquivo vivo em `frontend/` ou `backend/` aponta para cá. A conferência
foi feita por busca de referência em todo o código no dia da mudança.
