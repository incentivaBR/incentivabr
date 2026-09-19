# Checklist de virada — sair de `SIMULATION_MODE=true`

Este documento existe porque desligar a simulação não é mexer numa variável de
ambiente: é passar a receber dinheiro real de servidores públicos, com
consequência fiscal para eles. Enquanto qualquer item abaixo estiver aberto, a
chave fica como está.

Última revisão: 6 de agosto de 2026.

---

## 0. ~~Bloqueador absoluto~~ — RESOLVIDO em 6 de agosto de 2026

Este item era o que impedia a virada: o único ponto que marcava uma destinação
como confirmada era `POST /api/donations/:id/simulate`, que recusa quando
`SIMULATION_MODE` não é `'true'`. Com a chave desligada, o destinador
registrava, transferia, anexava o comprovante — e a destinação ficava em
`awaiting_confirmation` para sempre.

**O que existe agora:**

| Rota | O que faz |
|---|---|
| `GET /api/donations/conferencia` | fila do que aguarda conferência, com CPF, valor e link do comprovante |
| `POST /api/donations/:id/confirmar` | confirma; registra quem confirmou; dispara o aviso ao proponente |
| `POST /api/donations/:id/recusar` | devolve para `pending` com motivo obrigatório |

Tela: [`conferencia.html`](frontend/conferencia.html), acessível a `org_admin` e
`superadmin`. O acesso aparece no topo do painel só para quem tem permissão — a
própria fila responde 403 para os demais, e é essa resposta que decide se o
atalho aparece.

O motivo da recusa vai para a tela do destinador em bloco vermelho. Sem isso a
devolução seria invisível: a destinação voltaria para "aguardando pagamento" e
quem já transferiu dinheiro não saberia o que corrigir.

**Ainda em aberto neste item:** a conferência é manual, por decisão — o dinheiro
cai na Conta de Captação do Banco do Brasil, fora do alcance da plataforma, e
não há como conciliar sem integração bancária. Se o volume crescer, vale
avaliar conciliação por arquivo de extrato (OFX/CNAB).

## 1. PRONAC — o fictício saiu do código; falta o real entrar

Em setembro de 2026 o PRONAC fictício **261847** não aparece mais em nenhum
arquivo servido: sobrou só em `docs/piloto-fgv/guia-piloto-fgv.md`, marcado
como documento histórico. O projeto que cada tenant mostra vem de
`org_projects`, inclusive em modo simulação (`routes/salic.js`: a simulação
só deixa de consultar o SALIC; não inventa projeto nem dado bancário).

O PRONAC real da Casa Azul — **2511274** — é cadastrado pela tela de clientes,
não pelo código. O que ainda depende de gente:

- [ ] Confirmar o PRONAC real e a vigência da captação junto ao proponente
- [ ] Cadastrar o projeto e a Conta de Captação em `admin-clientes.html` —
      inclusive "O que o projeto faz": é o texto que `projetos-rouanet.html`
      e `como-funciona.html` mostram. Em branco, fica um texto neutro; fora da
      simulação, o resumo do SALIC entra no lugar
- [ ] Exercitar `GET /api/salic/projetos/2511274` contra a API real antes de
      desligar a simulação: se a consulta falhar, a página de projetos fica vazia

---|---|
| Backend | `migrations/022_orquestra_periferias.sql`, `migrations/025_knowledge_extra.sql`, `routes/salic.js` |
| Frontend | `calculadora.html`, `dashboard.html`, `demo-dashboard.html`, `demo-projeto.html`, `destinar-rouanet.html`, `faq.html`, `passo-a-passo.html`, `projeto-detalhes.html`, `projetos-rouanet.html` |

O PRONAC real do projeto aprovado da Casa Azul — **2511274** — não aparece em
nenhum lugar do código hoje.

Atenção a `routes/salic.js:325`: em modo simulação a rota devolve um projeto
inventado **sem consultar a API do SALIC**, com dados bancários fixos. Ao
desligar a simulação, essa rota passa a consultar o SALIC de verdade. Isso
precisa ser testado antes, não depois: se a consulta falhar, a página de
projetos fica vazia.

- [ ] Confirmar o PRONAC real e a vigência da captação junto ao proponente
- [ ] Substituir 261847 por 2511274 nos 12 arquivos
- [ ] Exercitar `GET /api/salic/...` contra a API real, com o PRONAC real
- [ ] Decidir o destino das páginas `demo-*` (elas existem para demonstração;
      ou saem do ar ou deixam explícito que são demonstração)

---

## 2. Conta de Captação — o dinheiro vai para o Banco do Brasil, não para nós

Pelo Manual do Proponente do MinC, o incentivador deposita na **Conta de
Captação** do projeto, que é bloqueada e específica por PRONAC. O proponente só
movimenta pela conta livre, após liberação. A plataforma nunca toca no dinheiro.

Hoje os dados bancários exibidos em simulação são fixos no código
(`routes/salic.js`). Em produção precisam vir da organização.

- [ ] Obter da Casa Azul: banco, agência, conta de captação e CNPJ do proponente
- [ ] Conferir que a conta informada é a **de captação** do PRONAC, não a
      conta institucional — depósito na conta errada não gera recibo e o
      servidor perde a dedução
- [ ] Preencher em `organizations` e confirmar que a tela lê de lá, não do código
- [ ] Fazer uma destinação real de valor baixo, ponta a ponta, antes de anunciar

---

## 3. A questão dos 6% — precisa de tributarista, não de opinião nossa

O código aplica um teto rígido de 6%:

```js
const LIMITE_ROUANET = 0.06;   // donations.js:78
```

A base é o art. 22 da Lei 9.532/97, que fixa o limite **global** de 6% do imposto
devido para o conjunto das deduções de incentivo (Rouanet art. 26, ECA, Idoso).
Já a destinação a projeto aprovado no art. 18 da Lei 8.313/91 é deduzida
integralmente do imposto devido, e é justamente sobre a interação entre os dois
dispositivos que existe divergência de interpretação.

**Onde a divergência aparece hoje no nosso próprio material:** o
`biblioteca-juridica.html` diverge do deck e da Lean Inception. Como esse arquivo
alimenta as respostas da TINA, a assistente pode estar dizendo algo diferente do
que a apresentação comercial afirma.

- [ ] Levar a um tributarista e obter parecer escrito
- [ ] Alinhar `biblioteca-juridica.html`, o deck e a Lean Inception à mesma tese
- [ ] Ajustar `LIMITE_ROUANET` se o parecer indicar outro tratamento
- [ ] Guardar o parecer: se um servidor for questionado na declaração, é ele que
      responde por nós

---

## 4. ~~Texto de consentimento~~ — RESOLVIDO em 10 de agosto de 2026

O aceite dizia "para fins desta demonstração" e "autorizo o registro desta
simulação". Com dinheiro real esse texto fica falso, e um consentimento colhido
sob descrição falsa não é consentimento (LGPD, art. 5º XII: livre, **informado**
e inequívoco).

O que se descobriu ao mexer: não era um texto, eram **vinte** — a página inteira
fala em simulação, de ponta a ponta. Trocar tudo à mão no dia da virada é
exatamente como se esquece um.

Então o texto passou a seguir a chave. Cada trecho carrega `data-modo` e chega
escondido; `aplicaModo()` lê `simulation_mode` de `/api/config/brand` e revela
só o lado certo. Verificado no navegador nos dois modos: 8 trechos em produção,
12 em simulação, zero vazamento cruzado.

**A parte que importa mais do que a troca:** se `/api/config/brand` não
responder, a página não escolhe um lado — ela **bloqueia o aceite** e diz por
quê. Sem saber o modo, não há como descrever com honestidade o que vai
acontecer com o dinheiro, e melhor não destinar do que destinar sob descrição
errada.

O aceite de produção também fechou dois buracos que a auditoria dos contadores
apontou: diz que vale **só para quem declara pelo modelo completo**, e diz que
quem emite o Recibo de Mecenato é o **proponente**, não a plataforma.

Guardado em `backend/tests/modo-texto.test.mjs` (7 testes, na suíte).

- [ ] Versionar a Política de Privacidade junto quando o texto for revisado
      (`POLITICA_VERSAO` em `backend/src/config/lgpd.js` e a data em
      `politica-privacidade.html` — os dois andam juntos, senão a prova do
      consentimento aponta para um texto que já não existe)
- [ ] Guardar o texto do aceite junto da destinação, como já se faz no cadastro
      de interessados

---

## 5. Documentos — o que a plataforma emite e o que ela não emite

Já resolvido no código, registrado aqui para não se perder:

O gerador de PDF (`services/pdfGenerator.js`) tem dois modos e o padrão vem de
`SIMULATION_MODE`. Em produção o documento se identifica como **registro de
operação** e diz, na primeira dobra, que **não é o Recibo de Mecenato**. Quem
emite o recibo é o proponente, no modelo do Ministério da Cultura, em três vias.

A versão anterior prometia que "um comprovante oficial com validade fiscal será
emitido" — promessa que a plataforma nunca poderia cumprir, e que só se
frustraria na hora da declaração.

- [ ] Ler o PDF de produção uma vez, impresso, antes da primeira destinação real

---

## 6. Ambiente

- [ ] `APP_URL` definido. Sem ele, os links de e-mail caem no fallback; em
      produção o fallback é `https://www.incentivabr.com.br` (o apex responde
      com falha de TLS — `SEC_E_WRONG_PRINCIPAL`)
- [ ] `DPO_EMAIL` — a caixa `privacidade@incentivabr.com.br` precisa existir de
      verdade. Ela está publicada na Política de Privacidade e é o canal do
      art. 18; e-mail que volta é descumprimento
- [ ] `RESEND_API_KEY` ou SMTP configurados. Sem transporte de e-mail, o
      proponente não é avisado e o interessado não confirma cadastro
- [ ] DNS do apex `incentivabr.com.br` corrigido
- [ ] `SIMULATION_MODE=false` — **por último, depois de tudo acima**

---

## 7. Depois de virar, nas primeiras 48 horas

- [ ] Acompanhar `GET /api/mecenato/fila` — é onde aparece o que o proponente
      precisa emitir
- [ ] Conferir que `proponente_notified_at` está sendo preenchido; se não
      estiver, a notificação falhou e a tela do destinador não dirá que a
      instituição foi avisada
- [ ] Fazer o caminho inteiro como se fosse um servidor: destinar, transferir,
      receber o aviso, baixar o recibo
