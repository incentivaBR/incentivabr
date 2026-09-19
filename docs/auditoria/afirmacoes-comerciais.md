# Afirmações comerciais: o que se diz e o que o código mostra

Raio-X de setembro de 2026, risco 12: pitch, roteiro e página inicial
afirmam coisas que o código não sustenta. Esta tabela confere cada uma contra
o repositório. Onde a fonte é uma pessoa e não o código, está dito.

Regra que sai daqui: **projeção se chama projeção, meta se chama meta, e
número de piloto só entra com a planilha de onde saiu.**

## Arquitetura e segurança

| Afirmação | Onde aparecia | O que o código mostra | Providência |
|---|---|---|---|
| "73% nunca receberam orientação do seu contador — Piloto IncentivaBR, 2026" | `espaco-contador.html`, cartão de abertura | Nenhuma planilha do piloto no repositório (`docs/piloto-fgv/resultados.md` não existe). A página alimenta a TINA, que repetiria o número | Saiu em set/2026; `separacao-white-label.test.mjs` passa a olhar esta página também. Volta com a planilha |
| "OAuth Gov.br ativo" / "Gov.br e SALIC já ativos" | pitch FGV, roteiro ASJDF | Só as colunas `govbr_*` em `organizations`. **Nenhuma linha de código** troca dado com o gov.br. Login é e-mail e senha | Roteiro corrigido: Gov.br é roadmap |
| "Microsserviços — se um cair os outros continuam" | pitch, roteiro | **Um processo** Node.js serve API e frontend (`backend/server.js`). Módulos, não serviços | Roteiro corrigido; e é vantagem, não vergonha: menos peças |
| "Trilha de auditoria imutável, append-only, SHA-256 por evento" | pitch, roteiro, `SPEC_FLUXO_DESTINACAO.md` R6 | `audit_log` é tabela comum: sem trigger, sem regra, sem hash por evento. Quem tem acesso ao banco altera | Roteiro corrigido. O que protege é acesso restrito + backup diário |
| "Criptografia AES em repouso" | pitch, roteiro | Nenhum `pgcrypto`, nenhum `encrypt`. O banco é gerenciado pela Railway; a senha é bcrypt; tokens de e-mail ficam como SHA-256 | Roteiro corrigido |
| "URL assinada com TTL" para comprovantes | pitch, roteiro | Não há URL assinada. O arquivo sai por **rota autenticada** (`/api/uploads/receipt/:id/arquivo`), que exige sessão e papel | Roteiro corrigido — e o que existe é mais restritivo |
| "Segregação PII em tabelas separadas" | roteiro | Nome, e-mail e CPF estão na mesma tabela `users`. `donations` referencia por id | Roteiro corrigido |
| "Laudo PDF com assinatura digital" | pitch, roteiro | O PDF é **registro de operação**, sem assinatura digital. O documento fiscal é o Recibo de Mecenato, emitido pelo proponente | Roteiro corrigido |
| "TINA: GPT-4o vs. Mistral, análise em curso" | pitch | Roda sobre a API da Anthropic, `claude-haiku-4-5` (`routes/chat.js`) | Pitch é histórico; roteiro corrigido |
| SHA-256 dos documentos | pitch, roteiro | **Verdadeiro**: `donations.receipt_sha256`, migration 037 | Mantido |
| JWT sem CPF, senha bcrypt, RBAC por organização | pitch, roteiro | **Verdadeiro** (`lib/permissoes.js`, `routes/auth.js`) | Mantido |
| SALIC ativo, com cache | pitch, roteiro | **Verdadeiro** (`routes/salic.js`). Em simulação, o projeto vem da tabela do tenant, não de dado inventado | Mantido |

## Projeto e piloto

| Afirmação | Onde | O que se sabe | Providência |
|---|---|---|---|
| PRONAC 261847 "aprovado pelo MinC" | `guia-piloto-fgv.md` | **Fictício**, criado para o piloto (`VIRADA-PRODUCAO.md`). Não aparece mais em código | Guia marcado como histórico; linha corrigida |
| PRONAC 252026 "aprovado pelo MinC" | `SPEC_JORNADA_COMPLETA.md` | Fictício. Documento de especificação de jornada, não material de venda | Registrado aqui; a spec segue como spec |
| "1.847 associados · R$4,3M potencial" | pitch, roteiro | Número de associados informado pela ASJDF; o potencial é conta sobre ele. **Não é verificável no repositório** | Roteiro chama de estimativa e nomeia a fonte |
| "Meta ≥ 300% de aumento", "conversão ≥ 60%", "NPS ≥ 70" | pitch, roteiro | São **metas** do plano, escritas como metas | Mantidas como metas |

## Página inicial (o que está no ar)

| Afirmação | Onde | O que se sabe | Providência |
|---|---|---|---|
| "NPS +64 dos primeiros usuários" | `index.html`, bloco "Piloto · Maio 2026" | Nenhum documento de resultados no repositório. `docs/piloto-fgv/` tem os questionários, o guia e as mensagens — **não as respostas** | **Saiu da home** (set/2026) |
| "88% concluíram o fluxo completo" | idem | idem | **Saiu** |
| "84% nunca souberam que podiam destinar" | idem | idem | **Saiu** |
| "R$ 0 custo líquido para o servidor" | idem | Verdadeiro pela lei: art. 18 é 100% dedutível, dentro do teto | Mantido |
| Depoimento *"Parece mais simples do que eu imaginava"* — "Servidora do Judiciário Federal" | `index.html`, "Servidores que já simularam" | É a **segunda opção de múltipla escolha da Q6** do questionário (`questionarios-fgv-v2.md:168`). Uma caixa marcada não é uma frase dita | **Saiu** |
| Os outros dois depoimentos | idem | Não localizados em nenhum documento | **Saíram** |

### A decisão, tomada em setembro de 2026

O fundador confirmou que a planilha de respostas do piloto não está localizada.
Os três números e os três depoimentos **saíram da home** — não porque sejam
falsos, mas porque **não são conferíveis**, e numa plataforma que fala de
imposto, número que não se confere é passivo. Um teste impede que voltem sem
fonte. O caminho de volta: `docs/piloto-fgv/resultados.md` com quantas pessoas
responderam, como cada número foi calculado e a data — e aí a guarda muda junto.

## O que não muda

`pitch-fgv-mba-interno.html` é o trabalho apresentado à FGV. Reescrever o
passado não conserta nada; ele ganhou um aviso no topo apontando para esta
tabela e deixa de ser usado como material comercial. O roteiro da ASJDF, que
é script de venda reutilizável, foi corrigido em vez de avisado.

---

*Setembro de 2026. Quando uma linha desta tabela passar a ser verdadeira no
código, ela muda aqui antes de mudar no pitch.*
