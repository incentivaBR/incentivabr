# Nota técnica de pesquisa — remunerar a plataforma dentro do projeto (novembro de 2026)

> **ISTO NÃO É UM PARECER.** Documento de pesquisa, sem assinatura de advogado
> tributarista e sem responsabilidade técnica. Não fundamenta proposta
> comercial, não fixa preço e não autoriza cláusula de contrato.
>
> **Atualizada em 1/nov/2026.** A primeira versão desta nota dizia que nenhuma
> fonte primária havia sido alcançada — o ambiente não resolve `gov.br`,
> `planalto.gov.br` nem `legisweb.com.br`. Isso deixou de valer para a Rouanet:
> Adacto forneceu os dois **Manuais do Proponente da IN 29/2026** (Módulo 1 —
> Apresentação de Propostas; Módulo 2 — Monitoramento e Execução), publicados
> pela Secretaria de Fomento e Incentivo à Cultura, e eles **transcrevem os
> artigos da Instrução Normativa**. O que foi lido ali está marcado como
> conferido, com página. O FDCA continua inteiramente em fonte secundária.

## A pergunta

A remuneração da IncentivaBR pode ser rubrica do orçamento de um projeto
incentivado? E, se pode, até quanto?

## 1. Rouanet: existe rubrica própria, e acima de R$ 1,5 milhão o teto manda

O orçamento da Rouanet tem **dez etapas**, e duas delas são exatamente o que se
está tentando vender:

| # | Etapa | Tipo de custo |
|---|---|---|
| 1 | Pré-produção | Produção |
| 2 | Produção | Produção |
| 3 | Divulgação | — |
| 4 | Custos administrativos | Administração |
| 5 | Recolhimentos | — |
| 6 | **Elaboração e agenciamento** | — |
| 7 | Pós-produção | Produção |
| 8 | Custos vinculados | — |
| 9 | Assessoria contábil e jurídica | Administração |
| 10 | **Captação de recursos** | — |

Os **custos vinculados** são quatro itens gravados com um percentual aplicado
sobre o orçamento (`pccalculo`), em 541.815 linhas de 177.024 propostas. Ou
seja: o percentual do custo vinculado é **dado por proposta**, guardado no
banco do SALIC — não constante. É a mesma lição que o nosso `tetos_deducao` já
carrega.

Os limites, **conferidos no Manual do Proponente Módulo 1, p. 43-44**, que
transcreve os artigos da IN:

| Rubrica | Limite | Base |
|---|---|---|
| Remuneração para captação de recursos | 10% do valor do projeto, **teto R$ 150.000** | art. 19 |
| Custos de administração | ≤ 15% do valor do projeto | art. 22 |
| Custos de acessibilidade, comunicação e divulgação acessíveis | ≤ 20% do valor do projeto | art. 20 |

A divergência entre R$ 150.000 e R$ 100.000 **está resolvida**: o art. 19 diz
R$ 150.000, e a própria tela do SALIC mostra "Limite: R$ 150.000,00" ao lado do
campo. A regra de que uma única despesa não passaria de 50% do grupo de
administração **não foi encontrada** no Módulo 1 — segue como não confirmada.

Os três são pagos "proporcionalmente às parcelas já captadas": não é condição
só da captação, os arts. 20 e 22 a repetem.

### Art. 19, § 3º — o dispositivo que mais importa para esta plataforma

> "Os valores destinados à remuneração para captação de recursos são exclusivos
> para prestação de serviço **ao proponente**, sendo caracterizado como
> **vantagem indevida** financeira ou material o uso dessa rubrica, **ou de
> quaisquer outras aprovadas no projeto**, para pagamento de serviços prestados
> diretamente **ao incentivador**."

Quem usa a tela da IncentivaBR é o servidor, que é o incentivador. A vedação
alcança **qualquer** rubrica do projeto, não só a de captação. O que torna a
operação defensável é que o contrato é com a proponente, a entrega é a ela, e o
que o servidor vê é a proponente comunicando o próprio projeto ao público dela
— e isso precisa estar escrito no contrato nesses termos.

### Os tetos do projeto são da tipicidade, e a aritmética fecha

O Manual (p. 17-20) limita o valor do projeto pela tipicidade: "Projeto Normal",
Arte Religiosa, Arte Urbana, Cultura Afro-brasileira e Povos e Comunidades
Tradicionais vão até **R$ 1.500.000**; "Projetos Específicos" até R$ 6.000.000;
"Projetos Especiais" até R$ 15.000.000; patrimônio, museus e equipamento
cultural não têm limite.

10% de R$ 1.500.000 são exatamente R$ 150.000. Quer dizer que **para um projeto
normal o teto em reais nunca morde** — ele coincide com o limite da tipicidade.
O teto só passa a valer em projeto específico ou especial.

O teto em reais é absoluto, e é ele que decide na faixa em que os projetos
estão:

| Valor do projeto | 10% | O que a norma admite |
|---|---|---|
| R$ 500 mil | R$ 50 mil | R$ 50 mil |
| R$ 1 milhão | R$ 100 mil | R$ 100 mil |
| R$ 1,5 milhão | R$ 150 mil | R$ 150 mil |
| R$ 2 milhões | R$ 200 mil | **R$ 150 mil** |

De R$ 1,5 milhão para cima o percentual deixa de importar.

### Três restrições que desenham o contrato, não o preço

1. **O pagamento é proporcional ao captado.** A remuneração só pode ser paga na
   proporção do que já entrou. A norma já obriga ao modelo que se pretendia
   propor: não se fatura adiantado.
2. **Vedado quando o projeto é integralmente financiado por edital** (art. 37,
   na leitura de terceiros).
3. **Vedado se o serviço for prestado ao patrocinador** em vez de ao
   proponente — nesse caso conta como vantagem financeira ao incentivador.
   Este é o ponto delicado para a IncentivaBR, porque quem usa a tela é o
   **destinador**. O serviço é contratado pela OSC e prestado a ela; a página
   que o servidor vê é entrega do proponente ao público dele. É distinção de
   redação de contrato, e precisa estar escrita.

### O preço é comparado contra uma mediana que não existe para este item

O banco do SALIC tem uma visão com **2.681.696 linhas** guardando a mediana, o
mínimo, a média e o máximo dos valores unitários **por produto, item, município
e unidade**, na proposta e na aprovação — e a documentação do MinC diz que ela
é *a base de comparação de preço na análise de custo*.

Para um item sem histórico, e uma plataforma de captação não tem, **não existe
mediana para comparar**. A consequência prática não é recusa automática: é
diligência. Por isso a proposta entra com a justificativa de preço escrita
desde o início — escopo, o que a manutenção cobre, por que esse valor —, em vez
de esperar a pergunta.

### Um item pode cair sem o projeto cair

A planilha aprovada guarda **três valores por item**: o solicitado, o *sugerido
pelo parecer* e o *aprovado pela comissão*, cada um com justificativa — são
3.079.132 itens de 62.885 projetos. E há a contagem dos itens **impugnados na
prestação de contas**: 7.397 itens, de 303 projetos.

Daí uma regra de montagem: separar a construção da white-label da manutenção
mensal, para que o corte de uma não leve a outra. E lembrar que o risco não
termina na aprovação.

## 2. FDCA: a chancela virou lei, e a retenção muda a conta

A premissa com que se trabalhava — "a Rouanet permite, o FDCA não" — está
parcialmente certa, e a parte errada é a que favorece o negócio.

**A chancela tem base legal desde 2023.** A Lei 14.692/2023 acrescentou os
§§ 2º-A e 2º-B ao art. 260 do ECA, permitindo ao contribuinte indicar projeto
específico e aos conselhos chancelar projetos ou bancos de projetos. Isso
resolveu um problema real: os arts. 12 e 13 da Resolução CONANDA 137/2010, que
autorizavam a chancela, **tinham sido anulados pela Justiça** — sentença da 21ª
Vara Federal do DF em 2011 (processo 0033787-88.2010.4.01.3400), confirmada
pelo TRF1, que chamou a delegação a particulares de "flagrantemente abusiva".

**A retenção.** O conselho fixa um percentual retido pelo Fundo sobre o captado
em cada chancela. Exemplos encontrados: **20%** (edital municipal citando a Res.
137/2010, e Nortelândia/MT) e **25%** (FMCA Recife). Uma chancela de R$ 1 milhão
entrega R$ 750 a 800 mil à OSC. Qualquer remuneração calculada como percentual
do captado incide sobre base menor do que parece.

**"A captação deve ser realizada pela instituição proponente."** A frase está no
dispositivo novo do ECA, e é a melhor notícia da pesquisa para a arquitetura que
já existe: a plataforma **não toca no dinheiro** — o servidor transfere direto
para a conta de captação do projeto. A captação continua sendo da proponente, e
a plataforma é ferramenta dela. Uma plataforma que recebesse e repassasse teria
aqui um problema que esta não tem.

**Pagar a plataforma pelo projeto é questão de edital, não nacional.** O Edital
FIA 2022 do Itaú Social respondeu expressamente que *"não há percentual máximo
para nenhum item de despesa"*, só o teto total de R$ 250 mil. Um edital da
SEDESE/MG de 2019 admitia despesas indiretas e administrativas, com limite de
70% para recursos humanos. As vedações da Res. 137 e dos decretos encontrados
são sobre custear **o próprio Conselho**, não a gestão do projeto.

## 3. O modelo tem precedente — e um limite de ética, não de lei

Plataformas de tecnologia remuneradas sobre captação **já são contratadas**: uma
delas cobra 10% sobre o valor captado, pago pela instituição depois do
recebimento dos recursos. O precedente existe e trabalha a favor: não é preciso
convencer ninguém de que o modelo é possível.

O limite real é outro: o **código de ética da ABCR não aceita remuneração
baseada unicamente no êxito da captação**. É argumento técnico a favor da
estrutura de construção + manutenção, com a parte variável secundária — e é
resistência de setor, não de norma.

## 4. O que não foi confirmado

1. **O texto integral da IN 29/2026.** Os Manuais transcrevem os artigos que
   importam ao orçamento (19, 20 e 22) e citam outros (12, 13, 14, 16, 31, 37),
   mas não são a norma. O que está marcado como conferido acima veio do Manual,
   não do Diário Oficial.
2. ~~Os nomes dos 6.587 itens do catálogo~~ — **deixou de ser pendência, e a
   razão é melhor que a resposta.** O Manual (p. 49) determina: *"Não é
   necessário inserir itens orçamentários referentes aos CUSTOS DE
   ACESSIBILIDADE, COMUNICAÇÃO E DIVULGAÇÃO ACESSÍVEIS e aos CUSTOS
   ADMINISTRATIVOS, devendo o proponente definir apenas a porcentagem dos
   recursos que serão destinados e essas despesas nos CUSTOS VINCULADOS e
   comprovar os gastos na prestação de contas."* Nas três rubricas em que a
   plataforma entra **não se cadastra item nenhum** — define-se um percentual e
   comprova-se depois, com nota fiscal. O catálogo serve aos *custos por
   produto*, que são outra parte do orçamento. Quando for preciso consultá-lo,
   há endereço público que não exige proposta aberta:
   `aplicacoes.cultura.gov.br/comparar` → menu das três linhas → Projeto →
   Itens orçamentários → Menu de produtos culturais → selecionar o produto →
   Pesquisa. E, se nada servir, o SALIC tem "Itens orçamentários → Solicitar
   inclusão de itens", com justificativa: item inexistente não é um beco.
3. **Rio Grande do Sul e Paraná.** Do PR, apenas que o CEDCA mantém o Banco de
   Projetos sob a Lei Estadual 19.173/2017. Do RS, nada. As regras estão nos
   editais vigentes.
4. **Se os 20% de retenção são piso nacional** da Res. 137 ou escolha de cada
   conselho. As fontes misturam as duas coisas, e um município (Joinville)
   afirma repassar o valor do projeto "na sua totalidade".
5. **A RN 125/2026 do CDCA/DF**, que o código já cita para o prazo de 60 dias
   do comprovante e para o sublimite de 3%.

## 5. A pergunta que sobra, e para quem

Uma só, e **não é para o tributarista**: *a remuneração da plataforma pode ser
rubrica do orçamento de um projeto chancelado, e a plataforma descaracteriza a
captação como sendo "realizada pela instituição proponente"?*

É pergunta de uma página ao conselho. A resposta decide se, no FDCA, a
cobrança é do projeto ou da OSC fora do projeto.

Para o **tributarista**, a leitura dos Manuais deixou outras três, todas sobre
a Rouanet: se o art. 22, IX ("consultorias especializadas em gestão para a
execução de projetos culturais" e "serviço de elaboração de prestação de
contas") sustenta a operação mensal da plataforma; como redigir o contrato para
não cair no art. 19, § 3º; e onde orçar a campanha junto aos servidores, já que
o art. 20 é de acessibilidade e lista profissionais, não ferramentas.

## Como as afirmações foram conferidas

**A fonte mais forte, acrescentada em 1/nov/2026**, são os dois **Manuais do
Proponente da IN 29/2026** da Secretaria de Fomento e Incentivo à Cultura,
fornecidos por Adacto. Eles transcrevem os artigos da Instrução Normativa e
mostram as telas do SALIC. Tudo que esta nota marca com página (p. 17-20,
p. 43-44, p. 47-49) veio de lá. Não são a norma publicada, mas são documento
oficial do órgão que a aplica — um degrau acima de qualquer consultoria.

**O que já era firme** não veio de resumo de consultoria: veio de código e de
documentação de dados lidos diretamente.

- **A estrutura do orçamento** (as dez etapas, os quatro custos vinculados com
  `pccalculo`, as 25 unidades de medida, os 6.587 itens, a `vwMediana`, a
  `vwPlanilhaAprovada` e a `vwItemOrcamentarioImpugnado`) está nos modelos de
  dados do SALIC publicados pela equipe de dados do MinC:
  [GovHub-br/data-application-minc](https://github.com/GovHub-br/data-application-minc),
  arquivo `dbt/minc/models/salic/schema_sac_planilha.yml`. É descrição do
  sistema, com documentação semântica deles — não é norma, e não diz o que a
  IN permite; diz o que o SALIC guarda.
- **Que a API pública não expõe planilha orçamentária** foi verificado no
  código das duas implementações:
  [culturagovbr/salic-api](https://github.com/culturagovbr/salic-api) e
  [lablivre-unb/salic-api](https://github.com/lablivre-unb/salic-api) (último
  commit em 2018). As rotas são `/projetos`, `/projetos/:PRONAC`,
  `/projetos/:PRONAC/captacoes`, `/projetos/areas`, `/projetos/segmentos`,
  `/fornecedores`, `/fornecedores/:id/produtos`, `/incentivadores`,
  `/incentivadores/:id/doacoes`, `/proponentes` e `/propostas`.

**Tudo o mais é secundário**, e por isso nada aqui move teto, preço ou texto de
página sem outra conferência:

- Limites da Rouanet e IN 29/2026: [página oficial da
  IN](https://www.gov.br/cultura/pt-br/acesso-a-informacao/legislacao-e-normativas/instrucao-normativa-minc-no-29-de-29-de-janeiro-de-2026)
  (não alcançada, apenas indexada), [IN 23/2025 na
  LegisWeb](https://www.legisweb.com.br/legislacao/?id=472998),
  [ABCR](https://captadores.org.br/abcr/captacao-de-recursos-na-lei-rouanet-contribuicoes-da-abcr-a-nova-instrucao-normativa-sao-incorporadas-pelo-minc/)
  e [IDEA](https://institutodea.com/artigo/o-que-muda-na-lei-rouanet-com-a-in-no-29-26/).
- Chancela e FDCA: [Res. CONANDA 137/2010 consolidada
  (MDHC)](https://www.gov.br/mdh/pt-br/acesso-a-informacao/participacao-social/conselho-nacional-dos-direitos-da-crianca-e-do-adolescente-conanda/resolucoes/resolucao-no-137_atualizada-art-16-em-17-07-2017.pdf),
  [Res. 137 no MPPR](https://site.mppr.mp.br/crianca/Pagina/Resolucao-CONANDA-no-1372010-de-21-de-janeiro-de-2010),
  [TRF1 anula parte da
  Resolução](https://www.trf1.jus.br/trf1/noticias/?id=9958), [Lei 14.692/2023
  (Agência
  Gov)](https://agenciagov.ebc.com.br/noticias/202310/alteracao-no-eca-permite-indicar-destino-de-doacao-a-fundos-dos-direitos-da-infancia),
  [Edital FIA 2022 — Itaú
  Social](https://www.itausocial.org.br/wp-content/uploads/2022/06/Perguntas-e-respostas-Edital-FIA-2022-.docx-1.pdf)
  e [Resolução FMCA Recife
  020/2024](https://www.e-edital.tec.br/sources/tutoriais/Capita%C3%A7%C3%A3o-Recursos-2024/Resol_020_-_2024_Resolu%C3%A7%C3%A3o_Edital_FMCA_Capta%C3%A7%C3%A3o_Recursos_2024_a_2026.pdf).
- Precedente de mercado e ética: [Captação com pessoa física para projetos
  incentivados](https://www.portaldoimpacto.com/aprenda-a-captar-recursos-com-pessoa-fisica-para-projetos-incentivados)
  e [Custo da captação de
  recursos](https://consultoriasquadra.com.br/custo-da-captacao-de-recursos/).

## O que esta nota já mudou no código

Nada de cálculo, nada de teto — e um defeito de produto, achado de passagem ao
conferir o que a API do SALIC devolve: o campo `valor_captado` do detalhe do
projeto é rotulado sobre a função de **custo**, e duas telas desenhavam a barra
de captação com ele. Ver a linha de novembro de 2026 na tabela de decisões do
`CLAUDE.md`.
