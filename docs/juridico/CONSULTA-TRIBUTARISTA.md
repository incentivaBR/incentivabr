# Consulta ao tributarista — limites de dedução do IRPF

Documento para enviar ao tributarista. Cada pergunta existe porque o **código da
plataforma decide algo com base na resposta** — não são dúvidas acadêmicas.

O parecer deve vir **por escrito e com a base legal citada**: é ele que um
contador vai querer ver antes de recomendar a destinação ao cliente dele, e é
ele que nos defende se um servidor for questionado na declaração.

Contexto: a IncentivaBR organiza a destinação de IRPF de **pessoas físicas**
(servidores públicos) a projetos culturais aprovados. Todas as perguntas são
sobre pessoa física.

---

## O que já consideramos resolvido

Registramos aqui para que o parecer confirme ou corrija, sem gastar tempo.

**Art. 22 da Lei 9.532/1997**: a soma das deduções dos incisos I a III do art. 12
da Lei 9.250/1995 fica limitada a 6% do imposto devido, não se aplicando limites
específicos a nenhuma delas.

**Inciso I** do art. 12 abrange os fundos da criança e do adolescente **e do
idoso** — a Lei 12.213/2010, art. 2º, alterou esse inciso para incluir os
conselhos do idoso. Logo, FDCA e Fundo do Idoso dividem o mesmo teto, e não têm
limites separados de 6% cada.

**Nossa leitura, portanto:** Lei Rouanet, FDCA, Fundo do Idoso e audiovisual
somam dentro de 6% do imposto devido.

O sistema já opera assim. Confirme se está correto.

---

## 1. A Lei de Incentivo ao Esporte compõe o teto de 6%?

**Por que perguntamos:** é a única modalidade sobre a qual encontramos afirmações
contraditórias, inclusive em material técnico.

- A dedução da Lei 11.438/2006 foi inserida em **qual inciso** do art. 12 da Lei
  9.250/1995? Se estiver além do inciso III, ficaria fora do alcance do art. 22
  da Lei 9.532/1997 e teria teto próprio.
- **Qual o percentual vigente para pessoa física** hoje, considerando a alteração
  da Lei 14.439/2022 e, principalmente, a **Lei Complementar nº 222/2025**, de
  novembro de 2025, que revogou o marco anterior?
- Um contribuinte pode usar Rouanet e incentivo ao esporte no mesmo ano? Em que
  proporção?

**O que muda no sistema:** hoje tratamos o esporte como concorrente do teto de
6% — a leitura conservadora. Se tiver teto próprio, estamos impedindo destinações
legítimas.

---

## 2. Art. 18 e art. 26 da Lei Rouanet dividem o mesmo teto?

O art. 18 permite deduzir **100% do valor destinado**; o art. 26, **80% ou 60%**
conforme o segmento.

- Os dois artigos concorrem dentro dos mesmos 6%?
- O percentual dedutível (100%, 80%, 60%) incide sobre o valor destinado **antes**
  de aplicar o teto, ou o teto se aplica ao valor já reduzido?

**O que muda no sistema:** a conta que mostramos ao servidor. Hoje só operamos
art. 18 e assumimos 100%; ao abrir o art. 26, a ordem das operações altera o
valor exibido.

---

## 3. PRONON e PRONAS: 1% cada ou 1% somados? Dentro ou fora do teto?

Nosso material afirma que **compartilham** 1% entre si e que esse 1% fica **fora**
dos 6%. Confirme as duas afirmações.

---

## 4. Recicla+ (Lei 14.260/2021)

Nosso validador oferece essa modalidade com limite de 6%.

- Qual o percentual correto para pessoa física?
- Compõe o teto do art. 22 ou é limite autônomo?

**O que muda no sistema:** se compuser e estivermos tratando como autônomo,
aprovamos destinação acima do permitido.

---

## 5. ~~Qual é exatamente a base do percentual?~~ — RESPONDIDA

**Imposto devido.** É o que o sistema já usa: o `ir_devido` apurado pela tabela
progressiva, antes das deduções de incentivo — não o imposto a pagar depois de
retenções e antecipações.

Fica a confirmação formal no parecer, mas não bloqueia nada: o cálculo já opera
sobre essa base, em toda a plataforma.

---

## 6. Ordem de imputação quando a soma estoura

Se o contribuinte destinou a várias modalidades e o total ultrapassa o teto,
existe ordem legal de aproveitamento — ou a Receita simplesmente glosa o excesso
sem critério de preferência?

**O que muda no sistema:** a mensagem que damos a quem estourou. Hoje dizemos
apenas "reduza X"; se houver ordem, podemos dizer qual reduzir.

---

## 7. A opção de destinar na própria declaração (3%)

O art. 260-A do ECA permite destinar até 3% ao FDCA no ajuste anual, e há regra
análoga para o Fundo do Idoso.

- Esses 3% são **adicionais** ao que foi destinado durante o ano-calendário, ou
  estão **dentro** do mesmo teto de 6%?
- A soma das duas modalidades na declaração pode chegar a 6% (3% + 3%)?

**Observação:** comercialmente não pretendemos operar esse caminho — o
contribuinte o faz sozinho no programa da Receita. Perguntamos porque afeta o
cálculo do que ainda resta disponível a quem já usou essa via.

---

## 8. Declaração completa como requisito

Confirmar a formulação que passamos a usar: **só aproveita a dedução quem declara
pelo modelo completo**, porque o desconto simplificado substitui todas as
deduções legais.

Há alguma hipótese em que o desconto simplificado conviva com dedução de
incentivo? Perguntamos porque essa é a informação que, se errada, faz um servidor
destinar e não abater nada.

---

## 9. Prazo de guarda do registro fiscal da destinação (de que data conta?)

Esta pergunta não é sobre limite de dedução; é sobre **retenção de dados**, e
trava uma rotina de proteção de dados que já está escrita e desligada.

**O que a plataforma guarda de cada destinação confirmada:** nome, CPF e valor
do servidor, o comprovante da transferência que ele enviou, e a cópia do Recibo
de Mecenato que o proponente emitiu. É o que o servidor precisa se for
questionado na declaração, e o que o proponente precisa na prestação de contas.

**O que a Política de Privacidade promete (seção 7):** guardar esses documentos
por **5 anos, "conforme legislação tributária"**, e anonimizar depois. Quando o
servidor pede a eliminação da conta (LGPD, art. 18, VI), e-mail, telefone e
senha somem na hora; nome, CPF, valor, comprovante e recibo ficam "até o fim do
prazo", e a tela diz até que ano.

**O que precisamos saber:**

1. **De que data conta o prazo?** Do ano-base da destinação, da entrega da
   declaração, ou do primeiro dia do exercício seguinte ao da declaração? Se a
   referência for o prazo decadencial do CTN (art. 173), qual é o termo inicial
   no caso concreto de uma dedução na DIRPF?
2. **O prazo se aplica à plataforma?** A obrigação de guardar o comprovante é do
   contribuinte e a do recibo é do proponente. A IncentivaBR não é parte da
   relação fiscal. Há base para a plataforma **reter** nome e CPF de quem pediu
   eliminação, ou a retenção deveria ficar só com o proponente, cabendo à
   plataforma apagar tudo? (Hoje retemos, pela leitura mais protetiva do
   servidor; se a resposta for "não há base", mudamos.)
3. **Anonimizar basta ao fim do prazo**, ou o registro deve ser apagado?

**O que o código faz hoje, à espera da resposta:** o fim da guarda é calculado
como ano-base + 1 + 5 (`backend/src/config/lgpd.js`, `anoFinalDaGuarda`) — a
contagem mais conservadora, a partir do ano da declaração. **Nada é apagado por
prazo**: uma rota do superadmin lista o que já venceu, e a anonimização
automática só será ligada com a resposta a esta pergunta.

---

## Como pretendemos usar o parecer

1. **No código.** Os tetos vivem em tabela (`tetos_deducao`), não em constante —
   a resposta vira um `UPDATE`, com a base legal registrada no próprio registro.
2. **Na página do contador.** Publicamos a base legal citada, para ele conferir.
3. **Na defesa do servidor.** Se algum for questionado, é o parecer que responde.
4. **Na retenção.** A resposta à pergunta 9 vira a regra de `config/lgpd.js`
   e liga a anonimização automática do que venceu o prazo.

Por isso pedimos a **citação do dispositivo** em cada resposta, e não apenas a
conclusão.
