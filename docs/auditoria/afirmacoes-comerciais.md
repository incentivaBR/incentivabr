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

# O que SE PODE afirmar hoje

*Acrescentado em outubro de 2026.*

A tabela acima diz o que saiu. Faltava a outra metade: a lista do que o código
sustenta, para que qualquer material — post, PDF, apresentação, roteiro de
conversa — saia daqui em vez de sair da imaginação de quem está escrevendo.
**Nenhuma peça comercial deve afirmar nada que não esteja nesta lista.**

Cada linha aponta para o arquivo e, quando existe, para o teste que a trava.
Uma afirmação sem teste é uma afirmação que pode deixar de ser verdade num
deploy sem ninguém notar.

## Para a instituição que vai contratar

| Pode-se afirmar | O que está por trás | Trava |
|---|---|---|
| "O site é seu: suas cores, sua logo, seu nome, seu projeto, seus textos" | migration 039; `tenant.js` preenche por `textContent`; sem logo cadastrada entra o **nome** do cliente, inclusive nas telas de bastidor e em todo o caminho autenticado | `marca-nas-paginas.test.mjs` |
| "Funciona no seu domínio próprio, não num endereço nosso" | `organizations.custom_domain` resolve o tenant por hostname, e o CORS lê os domínios **do banco** — cadastrar cliente não exige deploy | `origem-do-cliente.test.mjs` |
| "Você vê quanto entrou pela plataforma, separado do que o projeto captou" | `GET /api/donations/resultado` e o painel do gestor: conferido, na fila, prometido e ensaio em caixas distintas | `resultado-do-cliente.test.mjs`, fluxo no E2E |
| "Ensaio nunca é contado como dinheiro" | `donations.simulada` (migration 055) marca a linha no nascimento; a rota de pagamento fictício grava a marca junto com o status | idem, e cruzado contra Postgres real |
| "A plataforma não toca no dinheiro" | não há integração bancária nem conta nossa: o contribuinte transfere direto para a Conta de Captação do projeto, que vem de `org_projects`, por tenant | `conta-captacao.test.mjs` |
| "O Recibo de Mecenato é seu, emitido por você" | `routes/mecenato.js`; o PDF da plataforma é registro de operação, não documento fiscal | — |
| "Conferência humana: alguém abre o extrato e confirma, e fica registrado quem foi" | `donations.confirmed_by`, fila em `/api/donations/conferencia` | `conferencia-http.test.mjs` |
| "Você é o controlador dos dados; nós somos operadores" | LGPD art. 5º VI/VII; o Encarregado divulgado é o **do cliente**, por tenant (migration 041) | `papeis-lgpd.test.mjs` |
| "A lista de quem pediu aviso é sua, e o token de acesso nunca sai dela" | `subscribers.organization_id` escopa; `access_token` é credencial, não identificador | `lista-interessados.test.mjs` |
| "Comprovantes e recibos ficam em armazenamento com SHA-256, servidos só por rota autenticada" | migration 037, `services/armazenamento.js` | `armazenamento.test.mjs` |
| "Backup diário do banco, e monitor de disponibilidade a cada 15 minutos" | `.github/workflows/` | — |

## Para o servidor que vai destinar

| Pode-se afirmar | O que está por trás | Trava |
|---|---|---|
| "Custo líquido zero, dentro do limite" | art. 18 é 100% dedutível; o percentual vem de `tetos_deducao`, nunca de constante | `textos-fiscais.test.mjs` |
| "Só vale para quem declara no modelo completo" | é **condição**, não nota de pé: a pergunta barra o botão de destinar | `decimo-terceiro-e-modelo-completo.test.mjs` |
| "O limite é sobre o imposto DEVIDO, não sobre o retido" | a conta pelo retido foi removida de cinco lugares; o campo diz onde achar o número | `prova-no-topo.test.mjs` |
| "O prazo é 31 de dezembro — vale a data em que o dinheiro sai da conta" | `lib/prazoDaDecisao.js`; `donations.transferido_em` (migration 048) | `prazo-da-decisao.test.mjs` |
| "Se o projeto não pode mais captar, a plataforma recusa — inclusive em simulação" | `captacao_encerrada` na rota de registro; esconder o convite não fecha o endereço | `conta-captacao.test.mjs` |
| "Você transfere direto para a conta do projeto; a plataforma não recebe nem retém" | ver acima | `conta-captacao.test.mjs` |
| "Dá para conferir os limites e imprimir um laudo" | `validador.html`, alcançável pela URL com os números prontos, oferecido na conclusão do assistente | `conferencia-dos-limites.test.mjs` |
| "Não precisa saber o número de cor: tem o caminho na declaração, e uma mensagem pronta para o seu contador" | `guia-ir-servidor.html`; o texto fica na tela e a pessoa manda do aparelho dela — a plataforma não envia nada a terceiro | `onde-achar-o-ir-devido.test.mjs` |
| "Você exporta ou elimina seus dados, com senha" | `/api/meus-dados`, LGPD art. 18 | `meus-dados.test.mjs` |
| "A TINA tira dúvidas, e nunca dá orientação jurídica ou contábil definitiva" | o aviso é obrigatório no prompt; percentuais só do `nucleo.md` | `prompt-tina.test.mjs` |

## O que NÃO se pode afirmar (ainda)

Esta lista é tão importante quanto a de cima, e é a que se esquece primeiro.

- **Nenhuma destinação real foi percorrida de ponta a ponta.** `SIMULATION_MODE`
  segue ligado em produção. Não se diz "já captamos", "servidores já
  destinaram" nem qualquer número de resultado.
- **Nenhum número do piloto de maio/2026**, enquanto não houver
  `docs/piloto-fgv/resultados.md`. Vale para NPS, conversão, percentuais e
  depoimentos.
- **Nada de "integrado ao Gov.br"**: as colunas existem, a troca de dados não.
- **Nada de "assinatura digital"** no PDF da plataforma.
- **Nada de "criptografia AES em repouso"**, "trilha imutável" ou
  "microsserviços" — ver a tabela de setembro.
- **Os códigos da ficha DIRPF (41 e 40) estão marcados como não confirmados em
  fonte primária.** Material que os cite leva a mesma ressalva que o site leva.
- **PRONON e PRONAS/PCD não geram dedução para pessoa física em 2026.** Não
  entram como oferta; entram como referência, com o aviso.
- **A plataforma opera a Lei Rouanet, art. 18.** As outras seis leis do catálogo
  são consulta, não jornada: nenhum material promete operá-las.

---

*Setembro de 2026, com a lista do que se pode afirmar acrescentada em outubro.
Quando uma linha passar a ser verdadeira no código, ela muda aqui antes de
mudar em qualquer material.*
