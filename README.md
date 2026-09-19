# IncentivaBR

**Destinação de imposto de renda para projetos culturais, em minutos, sem tocar no dinheiro do contribuinte.**

O IncentivaBR permite que um servidor público destine até 6% do imposto de renda
devido a um projeto cultural aprovado pela Lei Rouanet (Lei 8.313/1991, art. 18).
A plataforma calcula o teto, registra a destinação, orienta a transferência para
a Conta de Captação do projeto, confere o comprovante e entrega ao servidor o
Recibo de Mecenato emitido pelo proponente.

Este é o repositório único do produto. Os repositórios anteriores foram
incorporados em `archive/` e serão arquivados no GitHub.

## Estado atual

| Item | Situação em setembro de 2026 |
|---|---|
| Mecanismo suportado | Lei Rouanet, art. 18 |
| Produção | Railway, em `SIMULATION_MODE=true` |
| Primeiro cliente | Casa Azul (PRONAC 2511274), em preparação |
| Consulta ao SALIC | real, com cache |
| Assistente TINA | real, sobre a API da Anthropic |
| Login Gov.br | não implementado |
| Movimentação financeira | nenhuma; a transferência é feita pelo servidor, fora da plataforma |
| Parecer tributário | pendente; até lá vale o teto único de 6% |

A auditoria completa do código, com os riscos abertos e o plano de 30 dias,
está em `docs/auditoria/raio-x-2026-09.md`.

## Como funciona

1. A calculadora pública estima o IR devido e o teto de dedução.
2. O servidor cria conta, escolhe o projeto do tenant e registra a destinação.
3. Transfere o valor para a Conta de Captação do projeto, no banco dele.
4. Envia o comprovante pela plataforma.
5. Um gestor da organização confirma ou recusa na fila de conferência.
6. O proponente é avisado e anexa o Recibo de Mecenato.
7. O servidor baixa o recibo no painel e usa na declaração anual.

Cada organização (tenant) tem marca, cores, projeto e teto próprios,
resolvidos por subdomínio ou domínio customizado.

## Rodar localmente

Pré-requisitos: Node.js 20 e PostgreSQL 15, ou Docker.

```bash
# com Docker
docker compose up

# sem Docker
cp backend/.env.example backend/.env   # preencher DATABASE_URL, JWT_SECRET e, se quiser a TINA, ANTHROPIC_API_KEY
cd backend && npm install && npm start
```

O servidor sobe em `http://localhost:3000`, aplica as migrations e serve o
frontend. Testes do backend:

```bash
cd backend && npm test
```

## Estrutura do repositório

```
backend/     API, migrations, testes, base de conhecimento da TINA
frontend/    páginas do produto, sem build
brand/       manual da marca, logos e identidade visual
docs/        estratégia, operação, jurídico, auditoria, apresentação, piloto FGV
scripts/     utilitários (sync da TINA, limpeza de histórico)
backend/scripts/e2e.mjs   fluxos de ponta a ponta no Chromium (npm run e2e)
archive/     histórico: os três repositórios anteriores e as demos de 2026
```

Detalhes de cada pasta, regras de negócio e decisões tomadas estão em `CLAUDE.md`.

## Configuração

Toda personalização é feita por variáveis de ambiente e pelo banco, nunca no
código. As variáveis estão descritas em `backend/.env.example`. Dados
bancários de projeto vivem na tabela de projetos do tenant e só são exibidos
quando o projeto está ativo.

## Propriedade intelectual

Software registrado no INPI sob o número BR512025000647-0. Marca INCENTIVA BR
depositada nas classes 35 e 42. Código proprietário; uso comercial exige
licenciamento. Detalhes em `docs/juridico/LEGAL.md`.

## Autor

Adacto Artur Dornas de Oliveira. Contato comercial: adactoartur.gestor@gmail.com.
