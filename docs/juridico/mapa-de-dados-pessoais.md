# Mapa de dados pessoais

O que a plataforma coleta, onde cada coisa fica, quem enxerga e para onde sai.

Levantado lendo o código em setembro de 2026, não a documentação comercial.
Cada linha tem o arquivo onde se confere. É a base factual para os Termos de
Uso, para a Política de Privacidade e para o contrato com um cliente
white-label — e é o que um advogado vai pedir primeiro.

**Isto não é parecer jurídico.** É inventário. A classificação de papéis
(controlador, operador) é decisão de contrato e precisa de advogado.

## O que é coletado

| Dado | Onde fica | Quando entra | Quem enxerga |
|---|---|---|---|
| Nome e e-mail | `users` | criação da conta | a própria pessoa; superadmin da IncentivaBR |
| Senha | `users.senha_hash` — bcrypt, fator 10 | criação da conta | ninguém; não é reversível |
| Telefone | `users.phone`, opcional | criação da conta | superadmin |
| CPF | `users.cpf`, **opcional** | no registro da destinação, não no cadastro (migration 040) | superadmin (mascarado na tela); o proponente, no Recibo de Mecenato |
| IR devido, valor destinado, ano | `donations` | ao registrar a destinação | a própria pessoa; gestor do tenant, na fila de conferência |
| Comprovante da transferência | bucket S3, com SHA-256 em `donations.receipt_sha256` | quando a pessoa envia | a própria pessoa; gestor do tenant |
| Recibo de Mecenato | mesmo bucket | quando o proponente anexa | a própria pessoa; gestor do tenant |
| Aceite dos termos | `users.accepted_terms_at`, `accepted_terms_version` | criação da conta | superadmin |
| Registro de acesso e de operação | `audit_log`: ação, IP, user-agent, data | login, exclusão de conta, operações de admin | superadmin |
| Lista de avisos | `subscribers`: e-mail obrigatório; nome e telefone opcionais; o texto exato do consentimento, a versão da política, IP, user-agent e data | cadastro de avisos | superadmin |

O comprovante é o dado mais sensível do conjunto: é um documento bancário, e o
que está **dentro** do arquivo (nome, valor, dados da transferência) não passa
por nenhuma coluna — está na imagem ou no PDF.

## O que a plataforma não coleta, ou não guarda

Isto vale tanto quanto a lista de cima, e é conferível:

- **A calculadora não grava nada.** `POST /api/calculator/ir` não tem um único
  `INSERT`: o rendimento digitado é usado para responder e descartado. Quem só
  calcula não deixa rastro.
- **CPF não é pedido para criar conta** (migration 040). Ele entra na
  destinação, que é onde serve — vai no Recibo de Mecenato.
- **Nenhum dado bancário de contribuinte.** A única conta que aparece é a Conta
  de Captação do projeto, aberta pelo MinC no Banco do Brasil e vinculada ao
  PRONAC — informação pública.
- **O token de sessão (JWT) não carrega CPF.**
- **Tokens que viajam por e-mail** (redefinição de senha, confirmação, convite)
  ficam no banco só como SHA-256 (migration 038). Vazar o banco não dá acesso a
  conta nenhuma por esse caminho.
- **As conversas com a TINA não são gravadas.** O histórico vem do navegador a
  cada pergunta; o servidor conta tokens em memória, para controle de custo, e
  zera a cada deploy.

## Para onde os dados saem

| Destino | O que sai | Onde se confere |
|---|---|---|
| Anthropic (TINA) | só o texto da pergunta e o histórico que o navegador manda. Nome, CPF e e-mail não são enviados | `src/routes/chat.js` |
| Resend (e-mail) | nome e e-mail do destinatário, e o conteúdo da mensagem | `src/services/emailService.js` |
| Bucket S3 | o arquivo do comprovante e do recibo — com o que houver dentro deles | `src/services/armazenamento.js` |
| Railway (hospedagem) | o banco inteiro, porque é onde ele roda | `backend/Dockerfile` |
| Proponente do projeto | nome, CPF e valor: é o que o modelo do Recibo de Mecenato exige | `src/routes/mecenato.js` |
| SALIC (MinC) | **nada pessoal.** A consulta é por PRONAC | `src/routes/salic.js` |

Resend e o bucket ficam em servidores fora do Brasil conforme a configuração
escolhida. A LGPD trata disso nos arts. 33 a 36 (transferência internacional) —
ponto para o advogado, não para mim.

## Quem enxerga o quê, dentro da plataforma

Três níveis, e é bom que fiquem explícitos no contrato:

1. **A própria pessoa** — os dados dela e as destinações dela.
2. **Gestor do tenant** — a fila de conferência da organização dele: nome,
   valor, projeto e o comprovante de cada destinação para aquele projeto. Não
   vê destinações de outra organização.
3. **Superadmin da IncentivaBR** — a lista de contas (com CPF mascarado), a
   tela de clientes e o `audit_log`. É o nível que existe para operar a
   plataforma, e é o que precisa estar nomeado no contrato: alguém da
   IncentivaBR consegue ver que uma pessoa do cliente tem conta.

## O que ainda não existe

- `govbr_client_id` e afins estão nas colunas de `organizations`, mas **não há
  código de integração com o gov.br**. Nenhum dado é trocado com o gov.br hoje.
- Nada é apagado **por prazo**. O titular elimina os próprios dados quando
  quiser (`minha-conta.html`, `/api/meus-dados`, set/2026): sem registro
  fiscal a conta é anonimizada no ato; com registro fiscal é encerrada e
  nome, CPF, valor, comprovante e recibo ficam até o fim do prazo da Política
  (§7), calculado em `config/lgpd.js` a partir do ano seguinte ao ano-base.
  O que já venceu aparece em `GET /api/admin/retencao`, que só lista. O
  apagamento automático espera o tributarista dizer de que data o prazo
  conta. O superadmin continua podendo apagar uma conta pela tela dele.

---

*Levantado em setembro de 2026 a partir do código. Versão viva: quando o
sistema passar a coletar ou enviar algo novo, esta tabela muda junto.*
