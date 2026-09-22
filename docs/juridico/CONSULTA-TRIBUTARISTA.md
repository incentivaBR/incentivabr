# Consulta ao tributarista — o que continua aberto

Documento para enviar ao tributarista. Cada pergunta existe porque o **código da
plataforma decide algo com base na resposta** — não são dúvidas acadêmicas.

O parecer deve vir **por escrito e com a base legal citada**: é ele que um
contador vai querer ver antes de recomendar a destinação ao cliente dele, e é
ele que nos defende se um servidor for questionado na declaração.

Contexto: a IncentivaBR organiza a destinação de IRPF de **pessoas físicas**
(servidores públicos) a projetos culturais aprovados. Todas as perguntas são
sobre pessoa física.

**Esta versão é curta de propósito.** A consulta original tinha onze perguntas.
Uma nota técnica de pesquisa — não assinada, arquivada em
`nota-tecnica-pesquisa-2026-09.md` — resolveu sete delas em fonte legal, e as
correções já entraram no sistema. Restaram quatro, e é por elas que vale pagar
hora de advogado. O que consideramos resolvido está listado no fim, para o
parecer confirmar ou corrigir sem gastar tempo.

---

## 1. Os 3% do art. 260-A do ECA são adicionais ao que foi destinado no ano?

É a pergunta que a pesquisa **não** conseguiu responder com segurança — a
própria nota diz "não é juridicamente seguro apresentar" e propõe apenas uma
"leitura operacional prudente".

O art. 260-A do ECA permite destinar até 3% do imposto devido ao FDCA **na
própria declaração de ajuste**, e há regra análoga para o Fundo da Pessoa
Idosa. Não operamos esse caminho: o contribuinte o faz sozinho no programa da
Receita.

- Esses 3% são **adicionais** ao que já foi destinado durante o ano-calendário,
  ou consomem o mesmo teto de 6%?
- A soma das duas modalidades na declaração pode chegar a 6% (3% + 3%), ou os
  3% são um só limite para as duas?

**O que muda no sistema:** o saldo que mostramos a quem já usou essa via. Hoje
tratamos como consumidor do mesmo teto — a leitura conservadora. Se forem
adicionais, estamos impedindo destinação legítima.

---

## 2. PRONON e PRONAS/PCD: houve prorrogação para a pessoa física?

Esta encolheu depois de lermos o texto. O caput do art. 4º da Lei 12.715/2012,
com a redação da Lei 14.564/2023, faculta a dedução **"às pessoas físicas, a
partir do ano-calendário de 2012 até o ano-calendário de 2025, e às pessoas
jurídicas, a partir do ano-calendário de 2013 até o ano-calendário de 2026"**.

O limite também está resolvido no texto: o § 6º, I, "d", fixa 1% para o
programa do art. 1º (PRONON) **e** outro 1% para o do art. 3º (PRONAS/PCD), e o
§ 8º confirma que não excluem outros benefícios em vigor.

Sobra uma pergunta só:

- **Houve norma posterior prorrogando o benefício da pessoa física** para 2026
  e adiante? Não encontramos. Há notícia de projeto estendendo até 2029; não
  confirmamos se virou lei.

**O que muda no sistema:** os dois mecanismos estão **em standby**. Sem
vigência para pessoa física — que é o público desta plataforma — não há o que
construir. Se houver prorrogação, o teto já está pronto no catálogo e só falta
a jornada.

---

## 3. Ficha e código da DIRPF de cada modalidade

O site dizia duas coisas diferentes, e a TINA lia as duas. O guia do servidor
manda lançar em **"Doações Efetuadas", código 41**. A tabela do Espaço do
Contador diz **"Deduções → Incentivos Fiscais → PRONAC/Cultura"** e dá o
**código 41 ao Fundo do Idoso** e o 40 ao FDCA.

Em qual ficha e com qual código o servidor lança a destinação à Rouanet no
programa da DIRPF vigente? E os demais mecanismos (Esporte, FDCA, Fundo da
Pessoa Idosa, PRONON, PRONAS/PCD, Recicla+)? Pedimos a referência no manual do
programa ou no Perguntas e Respostas da Receita do ano.

Enquanto não houver resposta, os códigos seguem marcados no site como "não
confirmados em fonte primária" (`lib/textosFiscais.js`) e a tabela de fichas do
Espaço do Contador fica fora da base da TINA.

---

## 4. Prazo de guarda do registro fiscal (de que data conta?)

Esta não é sobre limite de dedução; é sobre **retenção de dados**, e trava uma
rotina de proteção de dados que já está escrita e desligada.

**O que a plataforma guarda de cada destinação confirmada:** nome, CPF e valor
do servidor, o comprovante da transferência que ele enviou, e a cópia do Recibo
de Mecenato que o proponente emitiu.

**O que precisamos saber:**

1. **De que data conta o prazo?** Do ano-base da destinação, da entrega da
   declaração, ou do primeiro dia do exercício seguinte ao da declaração? Se a
   referência for o prazo decadencial do CTN (art. 173), qual é o termo inicial
   no caso concreto de uma dedução na DIRPF?
2. **O prazo se aplica à plataforma?** A obrigação de guardar o comprovante é do
   contribuinte e a do recibo é do proponente. A IncentivaBR não é parte da
   relação fiscal. Há base para a plataforma **reter** nome e CPF de quem pediu
   eliminação, ou a retenção deveria ficar só com o proponente?
3. **Anonimizar basta ao fim do prazo**, ou o registro deve ser apagado? A
   pesquisa aponta que anonimizar não resolve, porque o comprovante e o recibo
   reidentificam por si — nome, banco, data e valor no próprio documento.

**O que o código faz hoje:** o fim da guarda é `ano-base + 1 + 5`, e termina em
**31 de dezembro** desse ano, não em 1º de janeiro (`backend/src/config/lgpd.js`).
**Nada é apagado por prazo**: uma rota do superadmin lista o que já venceu, e a
anonimização automática só será ligada com a resposta a esta pergunta.

Já existe **trava de retenção** (migration 046): havendo fiscalização,
impugnação ou processo sobre a destinação de alguém, o superadmin trava aquela
conta com o motivo escrito, e o prazo deixa de correr para ela. Foi feita antes
de ligar qualquer eliminação, de propósito — é mais seguro do que ligar
primeiro e lembrar da exceção depois.

---

## O que já consideramos resolvido

Registramos para que o parecer confirme ou corrija, sem gastar tempo. Tudo isto
o sistema já opera assim.

**Teto geral.** O art. 22 da Lei 9.532/1997 limita a 6% do imposto devido a
soma das deduções dos incisos I a III do art. 12 da Lei 9.250/1995, sem limites
específicos internos. Lei Rouanet, FDCA, Fundo da Pessoa Idosa e audiovisual
somam dentro desses 6%.

**FDCA e Fundo da Pessoa Idosa.** O inciso I do art. 12 abrange os dois — a Lei
12.213/2010, art. 2º, alterou o inciso para incluir os conselhos da pessoa
idosa. Durante o ano-calendário, a destinação a qualquer dos dois é dedutível
até 6%, dentro do mesmo teto que a Rouanet divide. Não são 6% para cada.

**Base do percentual.** É o **imposto devido** apurado pela tabela progressiva,
antes das deduções de incentivo — não o imposto a pagar depois de retenções e
antecipações.

**Art. 18 e art. 26 da Rouanet.** Concorrem no mesmo teto. O art. 18 abate 100%
do valor destinado; o art. 26, 80% na doação e 60% no patrocínio. O percentual
incide sobre o valor destinado **antes** de aplicar o teto.

**Ordem de imputação.** Não há ordem legal de preferência quando a soma estoura
o teto; a Receita glosa o excesso. Por isso dizemos ao servidor apenas quanto
reduzir, sem sugerir qual modalidade.

**Declaração completa.** Só aproveita a dedução quem declara pelo modelo de
deduções legais; o desconto simplificado substitui todas elas.

**Incentivo ao esporte.** Lemos o art. 9º, § 1º, II, da LC 222/2025: "7% (sete
por cento) do imposto devido na Declaração de Ajuste Anual, **conjuntamente**
com as deduções a que se referem os incisos I, II e III do caput do art. 12 da
Lei nº 9.250, de 26 de dezembro de 1995". A cesta inteira sobe de 6% para 7%,
em vez de abrir teto separado. Registramos no catálogo e no texto das páginas,
**sem mexer no cálculo**: o sistema segue em 6%, que erra para menos. O que
pedimos aqui não é o percentual — é a confirmação de que aplicá-lo como teto
único condicional está correto.

**PRONON e PRONAS/PCD.** 1% para cada programa, separados entre si e fora do
teto geral (art. 4º, § 6º, I, "d", e § 8º da Lei 12.715/2012), com exigência de
declaração pelas deduções legais (alínea "c"). Texto lido; sobra só a vigência,
que é a pergunta 2.

**Recicla+.** 100% do valor destinado é dedutível, mas dentro do teto geral do
art. 22 — não é limite autônomo de 6%.

---

## Como pretendemos usar o parecer

1. **No código.** Os tetos vivem em tabela (`tetos_deducao`), não em constante —
   a resposta vira um `UPDATE`, com a base legal registrada no próprio registro.
2. **Na página do contador.** Publicamos a base legal citada, para ele conferir.
3. **Na defesa do servidor.** Se algum for questionado, é o parecer que responde.
4. **Na retenção.** A resposta à pergunta 4 vira a regra de `config/lgpd.js` e
   liga a anonimização automática do que venceu o prazo.

Por isso pedimos a **citação do dispositivo** em cada resposta, e não apenas a
conclusão.
