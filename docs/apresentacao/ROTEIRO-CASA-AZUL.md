# Roteiro da demonstração — Casa Azul Felipe Augusto

Reescrito em 29 de setembro de 2026. A versão anterior era de 10 de agosto e
ficou desatualizada no ponto mais importante: ela mandava **não** abrir a
página inicial, porque na época ela não era do cliente. Hoje é — e é o melhor
momento da demonstração.

**A ordem conta uma história:** *o imposto é seu e você escolhe → este é o
projeto de vocês → é assim que um servidor destina → e esta é a tela que vocês
vão operar.*

---

## 0. A senha do site — leia isto primeiro

O site está **fechado por senha** (`SITE_SENHA`, no painel da Railway). Toda
página responde 401 até alguém digitar, e de fora isso é indistinguível de site
fora do ar.

- **No seu computador o navegador já guardou o cookie**, que dura 30 dias.
  Você não vai ver a tela de senha — e é exatamente por isso que o risco existe.
- **Se for apresentar de outra máquina, ou projetar de outro navegador, teste
  antes.** Abrir a primeira aba e receber "acesso restrito" na frente do cliente
  custa a reunião inteira.
- Se alguém da Casa Azul for abrir depois, mande a senha junto do endereço.

Confira que está tudo de pé em `/diagnostico` — ele responde sem senha e diz
`"portaria": { "ligada": true }`.

---

## Antes de começar

**Abra as abas na ordem, e deixe-as abertas.** Trocar de aba é mais rápido e
menos arriscado do que digitar endereço na frente do cliente.

| # | Aba | Endereço |
|---|---|---|
| 1 | **A home deles** | `https://www.incentivabr.com.br/index.html?org=casa-azul` |
| 2 | O projeto | `https://www.incentivabr.com.br/projetos-rouanet.html?org=casa-azul` |
| 3 | Fila de conferência | `https://www.incentivabr.com.br/conferencia.html?org=casa-azul` |
| 4 | Cadastro de clientes | `https://www.incentivabr.com.br/admin-clientes.html` |

**O `?org=casa-azul` só precisa estar no primeiro endereço.** Daí em diante ele
se propaga sozinho — nos links e em toda chamada de API.

**Faça login antes da reunião.** Sessão expirada no meio da demonstração custa
a atenção da sala.

**Tenha um número de IR na cabeça** para digitar no Ato 1. R$ 20.000 dá R$ 1.200
e é fácil de acompanhar de cabeça.

---

## Ato 1 — "Quanto é meu?", respondido em cinco segundos

**Aba 1.** A página abre com a marca da Casa Azul: o símbolo no cabeçalho, o
azul-marinho `#1E346B`, o título da janela e o texto do topo falando do projeto
deles — não da IncentivaBR.

**Não explique nada ainda. Digite.** No campo do topo, digite o IR retido.
O valor aparece embaixo, na hora, sem carregar página e sem cadastro.

> "Um servidor que abre isto no celular descobre em cinco segundos quanto é
> dele. Não pedi cadastro, não pedi CPF, não mandei para outra página. É essa
> a diferença entre alguém que lê sobre Lei Rouanet e alguém que destina."

**Por que abrir por aqui:** a pergunta que todo servidor faz é "quanto é meu?".
Quem responde primeiro ganha a conversa. E o Felipe entende, sem você dizer,
que o problema dele não é ter um projeto aprovado — é converter interesse em
depósito.

Depois clique em **"Destinar para este projeto"**: o valor que você acabou de
calcular **viaja junto**. A pessoa não redigita nada.

---

## Ato 2 — O projeto deles, com o dado do Ministério

**Aba 2.** Título, PRONAC, proponente, área e a descrição do projeto — tudo do
cadastro, nada escrito no código.

O que dizer, com precisão:

> "PRONAC 2511274, Casa Azul Celebra: Ritmos que Transformam. Artes Cênicas,
> apresentação de dança. Essa descrição é a síntese que o Ministério aprovou,
> não um resumo que eu escrevi. Situação: autorizada a captação total."

⚠️ **Não diga que vem da API do SALIC "agora".** Em modo simulação a
plataforma **não** consulta o SALIC — os dados saem do cadastro, conferidos
contra a consulta oficial de setembro. Quando a simulação for desligada, a
consulta passa a ser ao vivo. Dizer "ao vivo" hoje é o tipo de detalhe que
derruba a credibilidade se alguém checar.

**O argumento mais forte da reunião, e é um fato verificável:**

> "Vocês estão autorizados a captar R$ 635.728,50. Já captaram zero. E a janela
> de captação termina em 31 de dezembro deste ano — no mesmo dia em que termina
> o ano-calendário do imposto. Não é a plataforma que estou vendendo: é a única
> forma de transformar servidor interessado em depósito documentado antes
> dessa data."

Confira quantos dias faltam no dia da reunião e diga o número. Urgência com
data é argumento; urgência sem data é pressão.

*(Há prorrogação automática prevista, e já houve uma em janeiro. Não use isso
no discurso — alivia a urgência que é real.)*

---

## Ato 3 — A tela que o Felipe vai operar

**Aba 3, a fila de conferência.** É o coração da demonstração, porque responde
à pergunta que ele realmente tem: *"e como eu sei que o dinheiro entrou?"*

Mostre a fila com as destinações aguardando, e o que cada linha traz: quem
destinou, quanto, e o comprovante anexado.

> "Quem confirma é você, não o sistema. O dinheiro cai na Conta de Captação do
> projeto, no banco — a plataforma nunca toca nele. Você confere o comprovante
> contra o extrato e confirma. Aí o destinador recebe o aviso de que você vai
> emitir o Recibo de Mecenato."

E mostre o botão de **recusar**: ele exige um motivo, que aparece na tela do
destinador.

> "Se a devolução fosse silenciosa, quem já transferiu dinheiro ficaria sem
> saber o que corrigir."

Esta tela é percorrida pelo Chromium a cada push — a fila com as três
destinações e o comprovante são conferidos automaticamente. O aviso de "não
verifiquei" da versão anterior deste roteiro saiu porque deixou de valer.

---

## Ato 4 — Quanto tempo leva para pôr um cliente no ar

**Aba 4.** Opcional, e serve a um propósito só: mostrar que a Casa Azul não é
um caso único feito à mão.

Crie uma instituição fictícia na frente dele — nome, identificador, cores —,
vincule um projeto. Leva menos de um minuto.

> "Foi assim que a de vocês entrou. E é assim que entra a próxima."

**Se quiser fechar com efeito:** convide o e-mail dele ali, ao vivo. Ele recebe
um convite que diz exatamente o que está aceitando — ver as destinações,
conferir comprovantes, confirmar. O link vale 48 horas e serve uma vez só.

⚠️ **Mande um convite para você mesmo antes da reunião.** Se não chegar, pule
este fecho em vez de improvisar.

---

## As três perguntas difíceis, e o que responder

### "Por que está escrito Simulação?"

Não esconda:

> "Porque falta uma coisa que só vocês podem me dar: a Conta de Captação do
> projeto. Enquanto ela não estiver aqui, eu não deixo ninguém transferir de
> verdade — depósito na conta errada não gera recibo, e o servidor perde a
> dedução. No dia em que vocês me passarem a conta, eu viro a chave."

Isso transforma a etiqueta em prova de cuidado e deixa a pendência **do lado
deles** — que é onde ela deve estar numa reunião de venda.

### "Cadê as fotos? Cadê nossos números?"

Se ainda não houver foto cadastrada, o topo é a paleta da marca. Diga a
verdade, que joga a favor:

> "Não publico foto de projeto que atende criança sem alguém da instituição
> declarar, com nome e data, que existe autorização de uso de imagem. O sistema
> recusa o envio sem essa declaração. O mesmo vale para os números de vocês:
> só entram os que vocês confirmarem."

### "Quanto custa?"

Não é assunto do sistema, mas vai aparecer. O que o sistema sustenta:

- a plataforma é **ferramenta de captação do proponente**, não consultoria;
- o custo cabe nas rubricas do próprio projeto aprovado.

Os números da proposta são seus. **Não ofereça percentual sobre o captado** —
não há norma conhecida sobre remuneração de captador, e a pergunta está aberta.
Mensalidade, e só.

---

## O que NÃO mostrar

**As páginas institucionais da plataforma.** Onze das 36 telas não têm marcação
de tenant — saem com a marca da IncentivaBR. Não é defeito (são páginas da
plataforma, e `para-associacoes.html` é recusada no servidor no site do
cliente), mas no meio da demonstração parece troca de identidade.

**Qualquer tela sem `?org=casa-azul`.** Sem ele, sai a organização padrão, com
outro projeto. Uma tela ao lado da outra, isso confunde.

**A etapa de pagamento com a conta em branco** — a não ser que você vá usar o
argumento da simulação. Aí é proposital, e é forte.

---

## Depois da reunião

O que pedir antes de sair, em ordem de importância:

1. **A Conta de Captação do PRONAC 2511274** — banco, agência e conta. É o que
   destrava a virada. Reforce: a conta **de captação** do projeto, não a
   institucional. *(A consulta do SALIC traz agência 2895-9 e conta 97.365-3;
   peça confirmação mesmo assim — depósito na conta errada não gera recibo.)*
2. **Uma foto boa do projeto, e os termos de autorização de imagem.**
   Horizontal, pelo menos 1600px. Sem a declaração de autorização, a foto não
   é publicada.
3. **Os números que eles autorizam publicar** — anos de atuação, pessoas
   atendidas, unidades, selos. Verificados, são o que convence servidor; sem
   confirmação deles, ficam fora do site.
4. **O e-mail de quem vai operar a fila.** O convite leva um minuto.

O CNPJ do proponente já está cadastrado (33.486.911/0001-20, a matriz).

O que falta para desligar a simulação está em
[`VIRADA-PRODUCAO.md`](../operacao/VIRADA-PRODUCAO.md); o que depende de
tributarista, em
[`CONSULTA-TRIBUTARISTA.md`](../juridico/CONSULTA-TRIBUTARISTA.md).
