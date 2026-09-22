# PLANO-MASTER — INCENTIVABR / DestineAI

Documento de alinhamento estratégico consolidado.
Versão 1.0 — abril/2026.

---

## 1. O que é o produto

**IncentivaBR** é a marca única e a plataforma. É o que se vende, o que aparece em contrato, o que sai na imprensa, o que registra autoridade institucional.

**DestineAI** é a vitrine demonstrativa (showroom permanente) integrada ao core do IncentivaBR. Funciona como tenant especial — instância da própria plataforma operando publicamente em destineai.com.br para que prospects vejam o produto em uso real. No banco, é uma `organization` com flag `is_demo = true`. Não tem identidade comercial autônoma — é peça de venda do IncentivaBR.

A plataforma converte imposto de renda devido em financiamento organizado de projetos aprovados, respeitando os sete mecanismos legais de incentivo:

1. Lei Rouanet — Lei 8.313/1991 — IN MinC nº 29/2026
2. Lei de Incentivo ao Esporte (LIE) — Lei 11.438/2006 — Decreto 12.861/2026
3. PRONON — Lei 12.715/2012 — Ministério da Saúde
4. PRONAS/PCD — Lei 12.715/2012 — Ministério da Saúde
5. Lei de Incentivo à Reciclagem (LIR / Recicla+) — Lei 14.260/2021
6. Fundos da Criança e do Adolescente (FIA/FMDCA) — ECA art. 260
7. Fundo do Idoso — Lei 12.213/2010

**O insight central:** para o doador no regime de declaração completa, 100% do valor destinado retorna via restituição ou abatimento. Custo real no bolso: zero. A plataforma redireciona dinheiro que iria para Brasília para um projeto de escolha individual.

---

## 2. Foco de mercado — servidor público, exclusivamente no começo

Escolha consciente, não acidente. Razões:

Servidor tem IR previsível (grade salarial conhecida). IR retido em folha mensalmente — não sente pagar. Estabilidade empregatícia (retenção natural da base de doadores). Concentração institucional (venda para um órgão acessa milhares de servidores de uma vez). Alta renda bruta média em vários órgãos. Declaração completa por default (por conta de dependentes, saúde, previdência), então o mecanismo de 100% retorno de fato se aplica. Cultura de destinação via consignação já existente em alguns órgãos. Afinidade profissional gera conversão — juiz se conecta com projetos de ressocialização, professor com laboratório de ciência, fiscal ambiental com cooperativa de catadores.

O comprador da plataforma é a instituição (RH, gabinete, associação de classe, sindicato), que tem orçamento para bem-estar do servidor e pauta de engajamento interno.

Autônomos e PJ lucro real ficam para segunda onda, depois da operação calibrada.

---

## 3. Modelo de negócio — clube de vantagens premium

Não é SaaS de massa. É boutique. Poucos clientes saudáveis, atendimento denso, receita alta por cliente.

**Tiers de membership** (catálogo a montar no banco):
- Essencial — white label + 1 fundo ativo + até 3 projetos/ano + self-service assistido via TINA
- Pro — white label + até 3 fundos + até 10 projetos + elaboração assistida + gestão de captação
- Enterprise — ilimitado + elaboração + captação + prestação de contas completa + consultoria dedicada

**Receita principal:** mensalidade do tier.
**Receita variável:** success fee de 5% a 15% sobre captação efetiva.
**Receita complementar:** projeto extra, consultoria avulsa, catálogo de modelos, treinamentos.

Meta realista: 15 a 25 clientes ativos = R$ 600k a R$ 3M/ano recorrente. Executa-se com equipe pequena.

### A primeira OSC entra como cliente âncora, não como sócia (set/2026)

A alternativa era sociedade: a IncentivaBR se associa a uma OSC que gera vários
projetos, e os dois vão juntos às associações de servidores. Ganha-se
alinhamento e velocidade; perde-se o resto do mercado. A segunda OSC procurada
pergunta — com razão — por que entregaria a base de doadores dela a uma
plataforma sócia de uma concorrente. São duas empresas diferentes: uma vende
para muitos e cresce devagar; a outra cresce rápido com uma só e trava.

**Decisão: cliente âncora.** Contrato comum, condição de primeira, e a
exclusividade, se houver, com prazo e no papel — não societária. O alinhamento
prático é o mesmo e a porta das outras OSCs continua aberta. A decisão
societária permanece disponível mais adiante; o contrário, não.

**Consequência de produto:** um cliente âncora com vários projetos exige que o
servidor ESCOLHA para qual destina. Hoje a jornada resolve um projeto só
(`ORDER BY is_featured DESC ... LIMIT 1`, em `lib/jornada.js` e
`routes/donations.js`). Com um projeto, a conversa na associação é "doem para
este teatro" e metade da sala não se interessa; com vários, é "escolha onde vai
o seu imposto". A escolha de projeto é pré-requisito da estratégia de canal,
não melhoria.

**Sobre o success fee acima:** não há, na RN 125/2026 do CDCA/DF, dispositivo
sobre remuneração de captador — nem autorizando, nem vedando. Enquanto não
houver resposta escrita do Conselho e do tributarista, a proposta comercial vai
só com mensalidade. Percentual sobre recurso de fundo público sem base
normativa aparece em fiscalização depois, não antes — e, num conselho de
direitos da criança, a suspeita de que a plataforma tem interesse no volume
captado custa mais do que a receita.

---

## 4. Arquitetura do produto — três camadas

**Camada 1 — Vitrine B2C (DestineAI ou marca do tenant):**
Landing, calculadora, catálogo de projetos filtrável por afinidade profissional do servidor, fluxo de destinação, comprovante, lembrete de declaração em março/abril, dashboard do doador.

**Camada 2 — Retaguarda produtora (admin):**
Elaboração de projeto, planilha orçamentária com validação automática (categorias elegíveis, vedações expressas, tetos por grupo), catálogo de projetos-modelo, casos de uso (festa junina, clube esportivo, cooperativa), monitor de prazos nos cinco sistemas oficiais (SALIC, SLI, Transferegov, SINIR+, Conselhos), geração de documentos, prestação de contas.

**Camada 3 — Gestão do clube (superadmin):**
CRUD de tenants, tracking de capacidade (quantos clientes cabem por trimestre), tiers de membership, dashboard comercial, pipeline.

---

## 5. Arquitetura de dados — multi-fundo por tenant

Migração do modelo atual (um fundo por organização) para N-N:

**Tabelas novas:**
- `laws` — catálogo estático das 7 leis
- `law_categories` — despesas elegíveis por lei
- `law_vedacoes` — o que não pode ser pago
- `law_tetos` — limites por grupo (administração 15%, divulgação+acessibilidade 20%, etc.)
- `law_phases` — concepção, submissão, captação, execução
- `law_checklists` — checklist por fase
- `organization_funds` — relação N-N entre tenants e leis (quais fundos cada tenant tem ativos)
- `membership_tiers` — catálogo de planos
- `organization_membership` — qual tier cada tenant contratou
- `organization_usage` — tracking de consumo por período

**Campos novos:**
- `projects.law_id` — FK para `laws` (substitui o implícito Rouanet)
- `projects.operation_mode` — self_service ou assisted
- `budget_items` — itens da planilha orçamentária por projeto

**Migrações planejadas:**
- 018_laws_catalog.sql — cria tabelas de leis + seeds das 7 leis
- 019_organization_funds.sql — cria N-N org×law, migra orgs existentes para Rouanet
- 020_membership_tiers.sql — catálogo de planos e vinculação
- 021_budget_items.sql — planilha orçamentária no banco
- 022_cleanup_monofundo.sql (futuro) — remove campos deprecated de `organizations`

---

## 6. O papel da IA (TINA com Claude)

O TINA já existe no backend (`@anthropic-ai/sdk`). Vale acelerar com funções específicas:

- Enquadramento automático: descreve o projeto, TINA sugere qual lei se encaixa e por quê
- Validação de planilha: aponta violação de vedação e estouro de teto em tempo real
- Gerador de justificativa: puxa indicadores IBGE/INEP/SISVAN e monta primeira versão
- Classificador de NF: extrai dados, bate com a planilha aprovada, sugere conta a debitar
- Respondedor de diligência: lê o pedido do analista e propõe resposta técnica com referência à IN
- Redator de carta-proposta: gera versão personalizada por patrocinador

### Política de proteção de PII em chamadas à API externa

Como o TINA usa a API da Anthropic (Claude), nenhum dado pessoalmente identificável (PII) do servidor pode ser enviado bruto. Regra inegociável:

- **Mascarar antes de enviar:** CPF, nome completo, e-mail, telefone, endereço, valores monetários específicos do usuário e dados bancários nunca vão na requisição. Substituir por placeholders (ex.: `<CPF_USUARIO>`, `<EMAIL>`, `<VALOR_DESTINACAO>`).
- **Contexto suficiente sem PII:** o TINA precisa saber a etapa, a lei, o tipo de dúvida e o perfil profissional do servidor — não precisa saber QUEM é o servidor.
- **Logs sanitizados:** logs de sessão TINA (pergunta, resposta, etapa, tenant, versão da base) também devem ter PII mascarada antes de armazenar.
- **Modelo local para conteúdo sensível (futuro):** quando o volume justificar, avaliar uso de modelo on-premise ou via Bedrock/AWS para validação de planilha com dados completos sem trafegar pela internet.
- **Trilha de auditoria de chamadas:** registrar quantas chamadas, quais endpoints, qual tenant, sem armazenar payload bruto.

Isso atende exigências da LGPD (princípio da minimização) e protege a plataforma de exposição em caso de eventual mudança nos termos da Anthropic ou incidente do provedor.

---

## 7. Defensibilidade

**Registro INPI:** BR512025000647-0 — programa de computador protegido por 50 anos.
**Registro em cartório:** metodologia com data certa e fé pública.

Isso combinado com (a) conhecimento consolidado das 7 leis, (b) relacionamento com órgãos-cliente, (c) tech já rodando em produção, forma quatro camadas de barreira. Copiar o produto exige replicar tudo simultaneamente — e os documentos registrados dão base jurídica para processar caso alguém tente.

Implicações comerciais: valuation maior em eventual round ou aquisição, possibilidade de licenciar/franquear a plataforma, credibilidade em pitch para gestor público.

---

## 8. Comparativo de mercado

Não existe combinação igual no Brasil. Peças soltas:

- **Incentiv.me** — marketplace multi-lei de destinação IR, sem white label, sem foco em servidor, sem segmentação por afinidade
- **Gympass/Wellhub** — paralelo operacional (B2B compra, B2C usa) aplicado a outro vertical; modelo viabiliza unicórnios
- **Fundação Abrinq, Hospital de Barretos** — captam dentro de um mecanismo específico, não são plataforma
- **Instituto Cultural Vale, Itaú Cultural** — retaguarda produtora para projetos próprios, não abrem como serviço

A combinação INCENTIVABR (clube + white label + 7 leis + servidor + afinidade + retaguarda + vitrine integrada) não tem equivalente direto.

---

## 9. Artefatos já gerados nesta rodada

Na pasta `outputs/` desta sessão:
- `painel-incentivos.html` — painel interativo com navegação entre as 7 leis, checklists por fase, planilha orçamentária inteligente com validação por lei, exemplo da Festa Junina pré-carregado, exportação Excel, casos de uso, plano de monetização, gestão de clientes e projetos, persistência em localStorage, import/export JSON.
- `painel-rouanet.html` — versão anterior, mais simples, foco só em Rouanet.

Na pasta `uploads/` recebidos do cliente:
- `analise-fundos-por-area-profissional.md` — segmentação por perfil de servidor público com projetos sugeridos para cada área (educação, saúde, justiça, fazenda, segurança, meio ambiente, cultura).
- `guia-servidor-publico-v2-atualizado.md` — guia educacional com percentuais atualizados 2024-2025 (Esporte 7%, Recicla+ 6%), FAQ para servidor, passo a passo da destinação, papel de embaixador interno.

---

## 10. Pendências antes de escrever código

Duas decisões de produto precisam ser travadas:

**(1) Onde escrever?**
(a) Direto em `C:\Users\artur\Documents\rouanet` com migrations novas, rotas e telas admin — mais rápido, mexe no repo vivo.
(b) Em `outputs/` para revisão antes de aplicar — mais seguro.

**(2) Política de marca — RESOLVIDA**
- Marca única pública: IncentivaBR
- DestineAI fica como showroom/demo permanente, agregada ao core do IncentivaBR, operando em destineai.com.br como tenant especial (`is_demo = true`)
- Tenants reais entram como subdomínio: `cliente.incentivabr.com.br`
- Cada tenant aparece com sua marca própria (logo, cores), com IncentivaBR como assinatura sutil ("powered by")
- Argumento estratégico: marca única simplifica venda B2B, autoridade institucional concentrada, demo viva vira ferramenta comercial diferenciada

Dois pontos a verificar no guia V2 antes de gravar na plataforma:

- Base legal do LIE a 7%: guia cita Lei 14.147/2021, pesquisa oficial aponta Decreto 12.861/2026 + LC 222/2025. Validar cadeia normativa atualizada.
- Nome "Recicla+": usar como apelido ou como nome oficial? Oficialmente é Lei de Incentivo à Reciclagem (LIR).

### Decisões de UX já tomadas

**Sem soma de grupos no primeiro contato.** Cada fundo aparece para o servidor com seu percentual individual (Rouanet 6%, LIE 7%, LIR 6%, FIA 6%, Idoso 6%, PRONON 1%, PRONAS 1%). A regra combinada de Grupo 1 (6% total) e Grupo 2 (2% total) não é apresentada como informação primária. Justificativa: 98% dos servidores ainda não destinaram nada — qualquer complexidade extra na primeira tela mata a conversão. A regra combinada vira aviso silencioso da calculadora apenas quando o usuário tentar destinar para múltiplos fundos do mesmo grupo. A consequência é que a inconsistência do guia V2 sobre Esporte 7% individual vs Grupo 1 combinado 6% deixou de ser problema neste momento.

---

## 11. Roadmap sequencial

**Fase 1 — Base de dados (1-2 semanas):**
Migration 018 (catálogo das 7 leis) + seeds + rotas `/api/laws`.

**Fase 2 — Multi-fundo (1-2 semanas):**
Migration 019 (organization_funds) + refactor de `projects` + ajuste das rotas existentes.

**Fase 3 — Retaguarda produtora (3-4 semanas):**
Pasta `frontend/admin/` — projetos, planilha com validação, catálogo de modelos, casos de uso.

**Fase 4 — TINA inteligente (2-3 semanas):**
Enquadramento automático, validador de planilha, gerador de justificativa, respondedor de diligência.

**Fase 5 — Expansão B2C (3-4 semanas):**
Generalização do `destinar-rouanet.html` para `destinar.html?lei=X&projeto=Y`; calculadora multi-fundo com simulação dos dois cenários (com/sem destinação) evidenciando o retorno integral; dashboard do doador com múltiplas destinações.

**Fase 6 — Clube (2-3 semanas):**
Migration 020 (membership_tiers), gestão de tenants com tiers e tracking, vitrine externa comparando planos.

**Fase 7 — Integração folha (exploração):**
Conversa com órgãos-alvo sobre integração com SIAPE, SIGEPE, folhas estaduais para consignação automática. Alto valor comercial, alto esforço técnico.

---

## 12. Estratégia de pagamento em três fases

White label boutique exige experiência integrada — quando o servidor sai da plataforma para o app do banco e volta com upload de comprovante, perde-se a percepção de produto profissional. A solução existe e é factível sem virar fintech regulada (sem licença BACEN, sem custódia de recursos), mas exige escolha consciente do modelo conforme o estágio da operação. O dinheiro nunca passa pela conta da INCENTIVABR em nenhuma das fases — vai sempre direto do servidor para o beneficiário (proponente Rouanet, Conselho do Fundo, entidade PRONON, etc.).

### Fase 1 — Modelo informacional (MVP, primeiros clientes)

A plataforma exibe os dados bancários do beneficiário (CNPJ, banco, agência, conta, chave PIX) e gera QR Code BR Code dinamicamente a partir desses dados, dentro da própria UI. Servidor abre o app do banco dele, escaneia ou copia o código, paga por fora, volta à plataforma e faz upload do comprovante. Sistema registra como "aguardando confirmação"; admin do tenant valida (pode ser semi-automatizado via OCR do comprovante).

Vantagens: implementação imediata (semanas), sem integração com terceiros, sem custos de transação, zero risco regulatório, atende o piloto inicial.
Limitação: fricção (servidor sai e volta), conferência manual, não é o padrão de fintech moderna.
Quando usar: piloto com primeiros 3 a 5 clientes, validação de operação, projetos onde o beneficiário não aceita cadastro em PSP.

### Fase 2 — PSP com PIX dinâmico em nome do beneficiário (escala inicial)

Integração com Provedor de Serviço de Pagamento brasileiro (Iugu, Pagar.me, Asaas, Mercado Pago Empresas, PJBank) usando a funcionalidade de **split payment com recebedor terceiro**. Cada projeto/fundo é cadastrado no PSP como recebedor (subconta), com KYC do CNPJ feito pelo PSP. No fluxo de destinação, a plataforma chama a API do PSP, que gera PIX dinâmico em nome do beneficiário; o servidor paga, o PSP recebe e roteia direto para a conta do beneficiário, e webhook confirma à plataforma em segundos.

Vantagens: experiência fluida dentro da plataforma, confirmação automática, sem custódia (dinheiro não passa pela INCENTIVABR), modelo já consolidado e seguro.
Custos: 0,5% a 3% por transação, embutidos no success fee do membership.
Recomendação inicial de PSP: Iugu (equilíbrio custo/profissionalismo/features).
Quando ativar: assim que o piloto da Fase 1 valide a operação, ou quando o primeiro cliente premium pedir experiência integrada.

### Fase 3a — Open Finance ITP via parceiro (sofisticação)

Integração com parceiro que já é Iniciador de Transação de Pagamento autorizado pelo BACEN (Belvo, Iniciador, Pluggy, Klavi, ou modalidades avançadas dos próprios PSPs). Em vez de QR Code, o servidor seleciona o banco dele dentro da plataforma, recebe push no app do banco, autoriza com biometria, e o pagamento acontece. Experiência idêntica a Apple Pay.

Vantagens: máxima fluidez, biometria nativa do banco, fricção ínfima, taxa similar ao PIX comum.
Custo: 4 a 8 semanas de integração técnica, custos do parceiro ITP.
Quando ativar: cliente enterprise pedir, ou volume de destinações justificar o investimento técnico (ex.: mais de 500 destinações/mês).
Por que não virar ITP própria: BACEN exige R$ 100 mil a R$ 500 mil em compliance, 6 a 12 meses de processo, capital mínimo regulatório, equipe de PLD/KYC. Não vale para boutique.

### Fase 3b — Consignação em folha (diferencial competitivo de longo prazo)

Para servidores públicos, o canal mais poderoso de captação não é via banco — é via folha de pagamento. SIAPE, SIGEPE, folhas estaduais e municipais suportam **consignação facultativa** (desconto autorizado pelo servidor que sai mensalmente do contracheque e vai direto para a entidade habilitada). É o mesmo mecanismo que paga associação de classe, sindicato, plano de saúde adicional.

Operação: servidor configura uma vez no IncentivaBR (ex.: destinar R$ 50/mês durante 12 meses ao Circuito do Forró), o sistema integra com a folha do órgão dele, o desconto sai automaticamente, o repasse ao beneficiário acontece sem nova ação do servidor. Captação distribuída no ano em vez de concentrada em dezembro. Adesão muito mais alta porque a fricção mensal desaparece.

Vantagens: captação automática e recorrente, defensibilidade altíssima (cada integração com folha é barreira contra concorrente), diferencial brutal de venda para o cliente proponente.
Desafios: cada órgão tem sistema de folha diferente, exige convênio formal de habilitação como entidade consignatária, integração técnica caso a caso.
Quando ativar: a partir do segundo cliente enterprise pedir, ou como diferencial fechado em contrato premium. Esta fase é projeto por cliente, não produto comoditizado.

### Critérios para mover entre fases

- Fase 1 → Fase 2: 3 ou mais clientes ativos com membership pago, ou primeiro cliente premium pedir explicitamente.
- Fase 2 → Fase 3a: 500+ destinações/mês ou cliente enterprise pedir.
- Fase 3b: caso a caso, sob demanda, com convênio formal — não roda como produto generalista.

### Implicações de arquitetura de dados (afeta migrations futuras)

Tabela `projects` ganha:
- `psp_recebedor_id` — ID do recebedor no PSP cadastrado
- `psp_status` — habilitado | pendente_kyc | recusado | sem_psp (fallback Fase 1)
- `payment_mode` — manual | psp_pix | itp | consignacao

Tabela `donations` ganha:
- `psp_transaction_id`
- `psp_payment_method` — pix | boleto | cartao | itp | consignacao
- `psp_confirmed_at`
- `recibo_oficial_url` — link para o recibo emitido pelo beneficiário (documento que vai para a declaração do IR)

Backend ganha service `paymentService.js` que abstrai a camada de pagamento. Trocar de PSP no futuro só altera o adaptador interno.

### Ponto inegociável — recibo fiscal

Independente da fase, o documento que o servidor leva à declaração do IR é o **recibo oficial emitido pelo beneficiário** (proponente Rouanet, Conselho do Fundo, entidade PRONON), não um recibo da INCENTIVABR ou do PSP. Sem o recibo do beneficiário em nome do CPF correto, a Receita não aceita a dedução. A plataforma tem que orquestrar a coleta desse recibo do cliente proponente e disponibilizar ao servidor — esse é o ponto mais delicado e exige integração ou processo claro com cada cliente.

---

## 13. Cronograma TCC + comercial — abril a junho 2026

O IncentivaBR é simultaneamente TCC do MBA em IA e Analytics da FGV (PI já entregue, PII com defesa prevista para final de junho de 2026) e produto comercial em busca dos primeiros clientes saudáveis. As próximas oito semanas precisam coordenar três eixos: técnico (entrega da plataforma), acadêmico (validação H1/H2 com dados reais), comercial (prospecção dos primeiros clientes). Cada feature priorizada precisa pontuar em pelo menos dois desses três eixos.

### 13.1 Diagnóstico de coerência — PI vs estado atual do repositório

**Alinhado:** stack (Node + Postgres + Vanilla JS), multi-tenant (migrations 009/011/013), auth gov.br + JWT + bcrypt, LGPD by design, INPI BR512025000647-0, TINA implementado como assistente, repositório ativo. Migration 018 (catálogo das 7 leis) escrita nesta sessão na branch `feat/multifundo-leis` cumpre uma promessa do Quadro 2 do PI.

**Parcial:** calculadora de IR existe, refinamento pendente; PDFKit instalado, integração ao fluxo a verificar; TINA hoje é assistente conversacional, ainda não é motor de recomendação como prevê seção 4.1.1 do PI.

**Pendente e crítico para a defesa:** catálogo ODS por nicho profissional (Quadro 5 do PI) — está no documento, não está no produto; dashboard de impacto em tempo real; recomendação personalizada do TINA com contexto estruturado; integração WhatsApp efetiva (PI registra como roadmap, OK).

**Pontos de ajuste de narrativa antes da defesa:**
- O PI prevê três marcas (IncentivaBR + Destina Servidor + Servidor Cidadão); decisão posterior simplificou para uma marca única (IncentivaBR) com DestineAI como showroom/demo. Apresentar como evolução estratégica do projeto.
- Piloto de 6 meses (jun-dez/2026) não cabe antes da defesa: rodar mini-piloto de 4 semanas com 30 usuários para coleta de dados preliminares de H1 e H2. Defesa apresenta "design + wave 1", não "resultados completos".
- Métrica "aumentar em 300%" tem baseline zero (plataforma nova) — reformular comparando com o baseline nacional de 1% de utilização do mecanismo.
- **Inconsistência dos "9%" na pergunta operacional:** a Versão 3 da pergunta de negócio menciona "destinações de até 9% do IR a fundos sociais", mas os quadros 1 e 2 do PI mostram limites individuais de 6% (Rouanet/Audiovisual/Reciclagem/FDCA/FDI), 7% (Esporte) e 1% (PRONON, PRONAS). A combinação que chega a 9% precisa ser explicitada ou a formulação ajustada para evitar questionamento da banca.
- **Driver de Ecossistema como visão de médio prazo:** o PI projeta a transição para Driver de Ecossistema em 3-5 anos. Vale deixar explícito na defesa que o foco do PII é validar a versão Omnichannel + primeiro tenant white label (DestineAI), e não entregar o ecossistema nacional. Evita cobrança de entregáveis fora de escopo.
- **Dados de mercado 2024 para reforçar relevância:** dados do MDHC indicam aproximadamente R$ 353,5 milhões destinados ao FDCA e R$ 145,3 milhões ao FDI em 2024 (cerca de R$ 498,8 milhões somados), ainda muito aquém do potencial. Inserir como evidência empírica de que o problema é real e o mercado está crescendo, mesmo que ainda subutilizado.
- **Distinção operacional Momento 1 vs Momento 2:** o PI separa bem os dois momentos da destinação (na declaração de março-maio com DARF próprio vs durante o ano-calendário com doação direta). Vale reforçar essa distinção no PII porque afeta o desenho do produto: muitos servidores só decidem em abril, não em julho — a plataforma precisa orquestrar os dois calendários.

### 13.2 Cronograma de oito semanas (28/abr a 23/jun de 2026)

| Semana | Período | Entrega principal | Eixo |
|--------|---------|-------------------|------|
| 1 | 28/abr — 4/mai | Migration `019_nichos_profissionais.sql` + onboarding com pergunta de área de atuação + catálogo ODS por nicho do Quadro 5 do PI implementado na plataforma | TCC + comercial + técnico |
| 2 | 5 — 11/mai | Calculadora de IR refinada com simulação dos dois cenários (com vs sem destinação) evidenciando os 100% de retorno | TCC + comercial + técnico |
| 3 | 12 — 18/mai | TINA evolução: conexão ao banco (laws, law_categories, nichos_profissionais), recomendação personalizada por nicho, validação de planilha contra vedações | TCC + técnico |
| 4 | 19 — 25/mai | Dashboard de impacto do servidor (destinações, projetos apoiados, impacto agregado) + geração automática de PDF do comprovante via PDFKit | TCC + comercial + técnico |
| 5 | 26/mai — 1/jun | Recrutamento da organização parceira do mini-piloto (30 usuários, 4 semanas), Forms de pré-teste H1/H2, onboarding dos primeiros usuários | TCC + comercial |
| 6 | 2 — 8/jun | Operação do mini-piloto (suporte ativo, métricas sendo capturadas) + materiais comerciais (pitch deck, demo gravada, case em construção, planilha de monetização do clube) | TCC + comercial |
| 7 | 9 — 15/jun | Forms pós-teste, análise estatística (teste t pareado ou Mann-Whitney), validação de H1 e H2 com dados reais, redação do trabalho final do PII | TCC |
| 8 | 16 — 23/jun | Slides de defesa (15-20), ensaio com Diego/Gabriel/Vilander, revisão final, entrega oficial. Em paralelo, abertura de conversas comerciais com prospects | TCC + comercial |

### 13.3 Features priorizadas — ordem de execução

**Prioridade 1 (pontua nos três eixos — TCC + comercial + técnico):**
- Catálogo ODS por nicho profissional implementado e funcional
- Calculadora de IR com simulação dos dois cenários
- Dashboard de impacto do servidor
- Geração automática de PDF de comprovante
- TINA com recomendação personalizada
- Mini-piloto rodando com dados reais

**Prioridade 2 (TCC + técnico, sem benefício comercial direto antes da defesa):**
- Migration `020_nichos_profissionais.sql` no banco com seeds dos 10 nichos
- Análise estatística H1/H2
- Validação de planilha pela TINA contra vedações

**Prioridade 3 (relevante mas pode esperar pós-defesa):**
- Integração WhatsApp como API real
- Pagamento integrado via PSP (Iugu)
- Multi-fundo nos fluxos de destinação (B2C)
- Painel admin retaguarda completo
- Migration 021 (membership_tiers)

### 13.4 Pontos não-negociáveis

A Semana 1 começa na segunda-feira após o registro deste cronograma. As Semanas 5-7 são as mais críticas porque o mini-piloto está rodando ao vivo e os dados estão sendo gerados — qualquer falha técnica nessas semanas compromete a defesa. A Semana 8 não tem folga: qualquer atraso bate na entrega oficial do PII.

Recrutamento da organização parceira do mini-piloto deve começar imediatamente, em paralelo à execução técnica das Semanas 1-4. Sem organização parceira fechada até 25/maio, o piloto não roda e o trabalho perde a parte mais importante (validação empírica). Plano B se a organização parceira não fechar a tempo: piloto interno com a rede de contatos pessoais dos quatro autores (Adacto, Diego, Gabriel, Vilander) — colegas de trabalho, família, comunidade FGV. Não é o ideal, mas garante dados.

---

## 14. Go-live checklist operacional

Para colocar IncentivaBR (core) e DestineAI (tenant piloto) em produção com segurança. Stack atual: Node.js + Express + PostgreSQL + Tailwind + JS Vanilla, multi-tenant, LGPD, PII de servidor público.

### 14.1 Top 10 itens não-negociáveis antes do go-live

São os itens cuja ausência transforma "produção controlada" em "vergonha pública e processo LGPD". Se algum estiver pendente na hora de abrir, não abra.

1. **Isolamento por tenant funcionando de verdade.** Nenhum usuário de um tenant consegue ver dados de outro. Toda query e rota sensível filtra por `tenant_id`. Existem testes negativos de isolamento cruzado.
2. **Autenticação e autorização robustas com RBAC.** Login seguro, senhas com hash forte, sessão/token bem configurados. Papéis claros (admin core, admin tenant, operador, usuário final). Cada papel só vê o que precisa.
3. **Backup diário do PostgreSQL com restore real testado.** Ter backup não basta — precisa ter restaurado em outro ambiente e confirmado que sobe íntegro.
4. **Armazenamento seguro dos comprovantes.** Storage dedicado (não filesystem local). Acesso sempre autenticado e autorizado. Hash do arquivo registrado para auditoria.
5. **Termos de Uso + Política de Privacidade publicados e aceitos.** Documentos revisados conforme LGPD. Link visível no rodapé e no momento de cadastro. Aceite registrado com timestamp e versão.
6. **Trilha de auditoria mínima para ações críticas.** Cadastro, destinação, upload, edição, envio de e-mails — tudo com usuário, tenant, ação, timestamp, recurso afetado.
7. **Observabilidade básica em produção.** Monitor de uptime, logs estruturados de erro, alertas para 5xx e quedas. Sem isso, problema vira caixa-preta.
8. **Jornada ponta a ponta testada em produção controlada.** Com usuários de teste, percorrer todo o fluxo: cadastro → cálculo → escolha de projeto → documento → upload → e-mails → painel → TINA.
9. **TINA/copiloto em modo seguro e limitado.** Escopo claro de assistente educacional (não parecer definitivo). Respostas vinculadas só às regras implementadas. Fallbacks prontos para "não sei / valide com seu contador".
10. **Responsável por incidentes e plano de rollback.** Quem atende se algo crítico acontece. Como suspender novas operações, reverter deploy, preservar dados gerados.

### 14.2 Checklist completo organizado por dimensão

| Item | Responsável | Status | Prioridade | Observação |
|------|-------------|--------|------------|------------|
| Definir oficialmente IncentivaBR = core e DestineAI = tenant piloto | Produto / Founder | ✅ | Alta | Decisão registrada no PLANO seção 1 |
| Congelar escopo v1 de produção (o que entra, o que fica fora) | Produto / Founder | Pendente | Alta | Evitar incluir tarefas de roadmap como parte do go-live |
| Garantir `tenant_id` em todas as tabelas sensíveis (PostgreSQL) | Backend | Parcial | Alta | Migrations 009/011/013 já preveem; revisar queries existentes |
| Definir modelo de isolamento (lógico por `tenant_id` ou schema por tenant) | Backend / Arquitetura | ✅ | Alta | Decisão: lógico forte por `tenant_id` + testes |
| Remover segredos do código e configurar `.env` separados (dev/staging/prod) | Backend / DevOps | ⚠️ | Alta | `backend/.env` hoje rastreado pelo git (GH issue #) — `git rm --cached` |
| Implementar rate limiting em login, upload e copiloto | Backend | Parcial | Média | rate-limit já instalado no Express; revisar cobertura |
| Definir dados pessoais mínimos coletados e base legal LGPD | Jurídico / DPO / Produto | Pendente | Alta | Mapear finalidade, base legal, retenção por fluxo |
| Escrever Termos de Uso e Política de Privacidade v1 | Jurídico / Produto | Pendente | Alta | Publicar em URLs estáveis; referenciar no front |
| Definir política de retenção e exclusão de dados | Jurídico / DPO | Pendente | Média | Cobrir IR, comprovantes, logs, sessão TINA |
| Definir armazenamento de comprovantes (bucket/storage seguro) | Backend / DevOps | Pendente | Alta | Hoje em `backend/uploads/` local; migrar para S3/R2/equivalente |
| Implementar hash dos arquivos de comprovante | Backend | Pendente | Média | Registrar hash + metadados no banco |
| Congelar papel da TINA em produção (informativo, não parecer) | Produto / Jurídico | Pendente | Alta | Documentar limites; alinhar com seção 6 do PLANO |
| Definir o que TINA pode e não pode responder | Produto / Jurídico | Pendente | Alta | Criar guidelines internas e testes de comportamento |
| Implementar mascaramento de PII antes de chamadas à API Anthropic | Backend | Pendente | Alta | Conforme política da seção 6 do PLANO |
| Criar ambiente de staging (infra semelhante à produção) | DevOps | Parcial | Alta | Railway permite preview environments |
| Criar ambiente de produção com deploy automatizado e rollback | DevOps | ✅ | Alta | Railway já configurado |
| Expor endpoint `/health` e, se possível, `/ready` | Backend / DevOps | Pendente | Média | Para uptime monitoring e orquestração |
| Revisar validação server-side de todas as rotas críticas | Backend | Parcial | Alta | Garantir tipos, limites, formatos, mensagens de erro |
| Configurar logs estruturados (JSON) com request ID | Backend / DevOps | Pendente | Alta | Enviar para provedor de logs centralizado |
| Configurar monitor de uptime + alertas de erro | DevOps | Pendente | Alta | Alertar por e-mail/WhatsApp em 5xx e downtime |
| Configurar backup automático diário do PostgreSQL | DevOps | Parcial | Alta | Verificar se Railway PG faz backup automático |
| Executar pelo menos um teste de restore do backup | DevOps | Pendente | Alta | Validar que o backup é realmente utilizável |
| Configurar monitoramento de banco (disco, conexões, queries lentas) | DevOps | Pendente | Média | Evitar gargalo silencioso em produção |
| Implementar RBAC (admin core, admin tenant, operador, usuário final) | Backend | Parcial | Alta | Migration 011 já tem `is_superadmin` e `is_org_admin` |
| Testar isolamento entre tenants (acessos indevidos) | QA / Backend | Pendente | Alta | Criar testes negativos explícitos |
| Validar upload de comprovantes (tamanho, tipo, MIME) | Backend / QA | Parcial | Alta | multer já instalado; revisar limites e validação |
| Implementar controle de acesso ao download de comprovantes | Backend / QA | Pendente | Alta | Sempre validar tenant, usuário e permissão |
| Registrar trilha de auditoria (quem, o quê, quando, qual tenant) | Backend | Pendente | Alta | Tabela `audit_log` com referência cruzada |
| Salvar logs de sessão TINA (pergunta, resposta, etapa, tenant, versão base) | Backend | Pendente | Média | Útil para auditoria e evolução do modelo |
| Criar mensagens de fallback seguras para TINA | Produto | Pendente | Média | Evitar chute; sugerir contador quando necessário |
| Parametrizar tema do tenant DestineAI (logo, cores, textos, projetos) | Frontend / Produto | Parcial | Média | `tenant.js` já carrega; refinar configuração |
| Implementar páginas legais no front (Termos, Privacidade) | Frontend | Pendente | Alta | Link visível no rodapé e na etapa de aceite |
| Implementar registro versionado do aceite de termos | Backend | Parcial | Alta | Migration 011 tem `accepted_terms`; falta versão e timestamp formal |
| Criar jornada de teste ponta a ponta em staging | QA / Produto | Pendente | Alta | Cadastro, cálculo, projeto, documento, upload, painel, TINA |
| Executar jornada E2E em staging (cenários felizes e de erro) | QA | Pendente | Alta | Documentar achados e correções obrigatórias |
| Executar jornada E2E em produção (com contas de teste controladas) | QA / Produto | Pendente | Alta | Validar ambiente real antes de convidar usuários |
| Garantir HTTPS e cabeçalhos básicos de segurança | DevOps | ✅ | Alta | Railway gerencia SSL; helmet já instalado |
| Revisar CORS para apenas domínios esperados | Backend / DevOps | ✅ | Média | server.js já tem CORS travado para domínios conhecidos |
| Rodar auditoria de dependências (Node.js) | Backend | Pendente | Média | `npm audit` regularmente; atualizar críticas |
| Publicar Termos e Política em ambiente de produção | Produto / Jurídico | Pendente | Alta | Conferir URLs e conteúdo final |
| Mapear dados e fluxos (inventário LGPD) | Jurídico / DPO | Pendente | Média | Documento para auditoria futura |
| Definir processo para pedidos de acesso/retificação/exclusão de dados | Jurídico / Operações | Pendente | Média | Designar responsável e prazos internos |
| Revisar modelos de PDF (comprovantes) e e-mails automáticos | Produto / Jurídico | Parcial | Média | pdfGenerator já existe; falta revisão jurídica |
| Definir sponsor interno da organização parceira (piloto) | Produto | Pendente | Alta | Pessoa de referência do lado do parceiro |
| Combinar KPIs do piloto com a organização parceira | Produto / Dados | Parcial | Alta | KPIs já no PI; alinhar com parceiro |
| Definir canal de suporte oficial (e-mail, WhatsApp, etc.) | Operações | Pendente | Alta | Comunicar de forma clara para usuários e parceiro |
| Definir janela de suporte (horários, SLA) | Operações | Pendente | Média | Importante no sprint final de 31/12 |
| Preparar script de rollback de versão | DevOps | Pendente | Média | Saber como reverter deploy sem perda de dados |
| Planejar "war room leve" para 1ª semana após go-live | Produto / Tech / Operações | Pendente | Média | Reuniões diárias curtas para revisar erros e métricas |
| Definir rotina semanal de revisão de logs e incidentes | Tech / Jurídico | Pendente | Média | Incluir incidentes LGPD e erros críticos |

Status sugerido: ✅ pronto · Parcial em andamento · Pendente não iniciado · ⚠️ requer atenção urgente.

### 14.3 Sequência de execução em ondas

**Hoje (Onda 0 — destravar antes de qualquer outra coisa):**
- Resolver `.env` rastreado no git (`git rm --cached backend/.env`)
- Congelar escopo v1 de produção (lista do que entra, lista do que fica fora)
- Confirmar entidades mínimas no banco (tenant, user, role, project, donation, document, audit_log, consent_log, assistant_session)

**Esta semana (Onda 1 — fundamentos de infra):**
- Staging completo separado de produção
- Backup diário + teste real de restore
- Logs estruturados + monitor de uptime
- Validação de isolamento entre tenants com teste negativo
- Endpoint `/health` exposto

**Antes de abrir (Onda 2 — gates de produção):**
- Termos + Política publicados em URLs estáveis
- Registro versionado do aceite implementado
- Trilha de auditoria gravando ações críticas
- Storage de comprovantes migrado para bucket externo
- Mascaramento de PII nas chamadas à API Anthropic
- Jornada E2E executada em staging e produção controlada
- Sponsor da organização parceira confirmado
- Canal e janela de suporte definidos

**Após abrir (Onda 3 — operação):**
- War room leve por 7 dias (acompanhar uptime, erros, abandono, dúvidas TINA)
- Auditoria manual de amostra de jornadas/documentos na primeira semana
- Retrospectiva técnica e de negócio aos 30 dias

### 14.4 Métricas operacionais para acompanhar em produção

Além dos KPIs de negócio do PI (taxa de conversão, NPS, volume captado), monitorar continuamente:

- Uptime
- Taxa de erro 5xx por endpoint
- Tempo médio de conclusão da jornada
- Taxa de abandono por etapa do funil
- Taxa de upload válido de comprovante
- Taxa de e-mail enviado/entregue
- Tickets de suporte por 100 usuários
- Incidentes LGPD (meta: zero)
- Latência média do TINA
- Taxa de fallback do TINA (quanto ele cai em "não sei / valide com contador")

---

## 15. Pontos abertos para conversas futuras

- Definição final de nomenclatura (LIR vs Recicla+)
- Precificação exata dos tiers Essencial/Pro/Enterprise
- Desenho do catálogo de projetos-modelo (quantidade inicial, curadoria)
- Estratégia de onboarding do primeiro cliente-piloto
- Parâmetros de LGPD específicos da base de servidores
- Integração Gov.br — credenciais por tenant (migration 011 já prevê)
- Escolha definitiva do PSP da Fase 2 (recomendação inicial: Iugu)
- Parceiro ITP da Fase 3a (mapear quando chegar a hora)
- Definição da organização parceira do mini-piloto (semana 1-2)
- Decisão sobre arquitetura de marcas para a defesa (1, 2 ou 3 marcas)
- Migração do storage local de comprovantes para bucket externo
- Implementação de mascaramento de PII no pipeline da TINA

---

**Fim do documento.**
Quando retomar, começar pela leitura deste arquivo e pela decisão das duas pendências da Seção 10. Para o go-live, focar nos 10 itens não-negociáveis da Seção 14.1.
