# PROMPT MESTRE — GERAÇÃO DE UI PARA INCENTIVABR / DestineAI

Documento self-contained para gerar telas da plataforma usando ferramentas de IA (v0.dev, Lovable, Bolt.new, Cursor, Claude, Magic Patterns). Cada seção pode ser copiada e colada como prompt na ferramenta de sua escolha.

Versão 1.0 — abril/2026.

---

## COMO USAR

1. Escolha a ferramenta (recomendações no final deste documento).
2. Cole a **Seção A — Contexto e Design System** sempre, em qualquer prompt.
3. Cole a **Seção B — Página específica** que você quer gerar.
4. Refine iterativamente com pedidos curtos.

Para gerações longas (página completa), comece com a Seção A + B em uma única mensagem. Para refinamentos pontuais ("deixe esse botão dourado", "adicione subtítulo"), peça em mensagens curtas e referencie a tela.

---

## ╔══════════════════════════════════════════════════════════╗
## ║ SEÇÃO A — CONTEXTO E DESIGN SYSTEM (sempre incluir)     ║
## ╚══════════════════════════════════════════════════════════╝

### Contexto do produto

Você está construindo a UI da plataforma IncentivaBR (marca pública DestineAI), produto SaaS B2B2C que permite a servidores públicos brasileiros destinarem parte do imposto de renda devido a projetos sociais aprovados pelo governo, sem custo adicional, com retorno integral na declaração anual seguinte.

A plataforma é multi-tenant (cada organização cliente — tribunal, prefeitura, sindicato, associação — tem sua própria white label). Cobre sete leis de incentivo (Rouanet, LIE, PRONON, PRONAS/PCD, LIR, FIA, Fundo do Idoso), mas a versão inicial foca apenas Rouanet com o Circuito do Forró (PRONAC 252026 — projeto musical de forró popular brasileiro, proponente BR Projects LTDA, conta de captação no Banco do Brasil ag. 0000-0 / conta 00000-0).

### Persona-alvo

Servidor público brasileiro, 28 a 60 anos, IR retido em folha, declara IRPF no modelo completo. Familiaridade média com tecnologia. Cético com produtos novos, especialmente envolvendo dinheiro. Tem 5 a 30 minutos para decidir se confia. Lê pouco, decide por percepção. 70% acessa pelo celular.

### Promessa central

"O imposto que você já paga, com destino que você escolhe. Custo no seu bolso: R$ 0. Retorno integral na sua próxima declaração."

### Stack técnico OBRIGATÓRIO

- HTML5 puro (sem React, sem Vue, sem framework JS pesado)
- Tailwind CSS via CDN (`<script src="https://cdn.tailwindcss.com"></script>`)
- JavaScript Vanilla (sem build, sem npm para o frontend)
- FontAwesome via CDN para ícones quando necessário
- Google Fonts: Inter (pesos 400, 500, 600, 700, 800, 900)
- Mobile first; cada layout funciona em 375px de largura antes do desktop

### Design System

**Paleta primária:**
- Navy escuro: #0D1B3E (cor de fundo principal, headers, botões secundários)
- Navy meio: #132247 (cards, fundos secundários)
- Navy claro: #1A2C5A (hover states)
- Dourado primário: #FFD700 (CTAs, destaques, links)
- Dourado escuro: #FFC000 (hover de CTAs)

**Paleta secundária (para temas de tenant):**
- Branco: #FFFFFF
- Cinza claro: #EDEDED
- Preto: #1D1D1B

**Cores funcionais:**
- Verde sucesso: #16A34A
- Vermelho erro: #DC2626
- Amarelo alerta: #EAB308

**Tipografia:**
- Family: Inter, sans-serif
- Headlines hero: 5xl-8xl, font-weight 900 (black), tracking-tight, leading 1.05
- Headings de seção: 4xl-5xl, font-weight 800
- Subtítulos: xl-2xl, font-weight 500-600
- Corpo: base, font-weight 400, leading-relaxed
- Microtexto/labels: xs-sm, font-weight 500, tracking-wide quando uppercase

**Espaçamento e ritmo:**
- Container padrão: max-w-7xl ou max-w-5xl, mx-auto, px-6
- Padding vertical de seções: py-24 sm:py-32 (generoso)
- Border radius padrão: rounded-2xl para cards, rounded-xl para inputs e botões
- Sombras: shadow-lg em CTAs, shadow-2xl em modais e cards principais

**Componentes-padrão:**

Botão primário (CTA dourado):
```html
<a class="inline-flex items-center gap-2 bg-[#FFD700] hover:bg-[#FFC000] text-[#0D1B3E] font-bold text-lg px-8 py-4 rounded-xl shadow-lg transition-all duration-200 hover:scale-[1.03]">
  Texto do botão
  <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5-5 5M6 12h12"/>
  </svg>
</a>
```

Botão secundário (link sublinhado em fundo escuro):
```html
<a class="text-white/60 hover:text-white text-sm font-medium underline underline-offset-4 decoration-white/30 hover:decoration-white transition-colors">
  Texto do link →
</a>
```

Card padrão em fundo escuro:
```html
<div class="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-8 hover:bg-white/[0.07] transition-colors duration-300">
  <!-- conteúdo -->
</div>
```

Selo de credibilidade:
```html
<span class="inline-flex items-center gap-2 rounded-full bg-[#FFD700]/10 border border-[#FFD700]/30 px-5 py-2">
  <svg class="w-4 h-4 text-[#FFD700]"><!-- ícone --></svg>
  <span class="text-[#FFD700] font-semibold text-sm tracking-wide">PRONAC aprovado pelo MinC</span>
</span>
```

### Princípios de UX inegociáveis

1. **Mobile primeiro.** Todo layout começa pensando em 375px de largura.
2. **Mostre antes de pedir.** Calculadora pública não pede cadastro.
3. **Cada tela responde uma objeção.** É golpe? Custa? Quanto ganho? Funciona mesmo?
4. **Prova social institucional sempre presente.** PRONAC, MinC, INPI visíveis.
5. **Linguagem do servidor, não de fintech.** "Você", "seu imposto", "o projeto". Sem jargão.
6. **Botões CTA grandes, dourados, com ícone seta.** Conversão é o foco.
7. **Animação fade-up ao rolar a página.** Movimento sutil, nunca distrativo.

### Padrão de SEO e acessibilidade

- Meta description obrigatória em cada página
- Alt em todas as imagens
- Hierarquia de headings correta (h1 único por página)
- Contraste mínimo AA (verificar tons cinzas sobre navy)
- Foco visível em links e botões
- Aria-label em botões com só ícone

---

## ╔══════════════════════════════════════════════════════════╗
## ║ SEÇÃO B — PROMPTS POR PÁGINA                            ║
## ╚══════════════════════════════════════════════════════════╝

### B.1 — LANDING PAGE (`index.html`)

**Prompt:**

Gere a landing page completa do DestineAI seguindo o design system acima. A página deve ter:

**Hero section** ocupando a tela inteira no primeiro carregamento, com:
- Imagem de fundo: foto de orquestra (use `https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=1920&q=80`)
- Overlay navy `bg-[#0D1B3E]/80` sobre a imagem
- Texto centralizado:
  - Selo no topo: "R$ 0 do seu bolso" em badge dourada com ícone de relógio
  - Headline gigante: "Seu imposto vira **música**." (a palavra "música" em dourado #FFD700)
  - Subtítulo: "[TBD: descrição de impacto do Circuito do Forró em 1-2 linhas com números reais — ex.: 'X músicos levaram forró autêntico a Y praças e centros culturais'. Manter o gancho 'Com 6% do seu IR — dinheiro que você já pagaria ao governo.']"
  - Dois CTAs: "Quero apoiar o Circuito do Forró" (dourado primário) e "Calcular quanto posso destinar →" (link sutil)
  - Indicador de scroll na base (seta animada com bounce)

**Seção 2 — Circuito do Forró** (id="circuito-forro"):
- Card grande horizontal (grid md:grid-cols-2)
- Lado esquerdo: imagem da orquestra com overlay navy gradient e badge "Música & Transformação"
- Lado direito: título "Circuito do Forró", PRONAC 252026 em dourado uppercase, descrição em 3 linhas (TBD: pegar do release/proposta oficial), e grade 2x2 de indicadores ([TBD: indicador 1], [TBD: indicador 2], [TBD: território/local], R$ 0 custo) em mini-cards com ícone dourado
- CTA no final: "Destinar meu IR para o Circuito do Forró" (link para `destinar-rouanet.html?pronac=252026`)

**Seção 3 — Como funciona** (id="como-funciona", fundo branco):
- Título: "4 passos. **Menos de 5 minutos.**" (segunda parte em dourado)
- Grade de 4 cards numerados (01, 02, 03, 04)
- Cada card tem ícone navy em quadrado dourado, título e descrição:
  1. Calcule seu IR disponível
  2. Confirme o Circuito do Forró
  3. Transfira ao Fundo
  4. Declare no IRPF — Código 41
- Hover: card se destaca com shadow

**Seção 4 — Objeções respondidas** (fundo navy, fade-up):
- Título: "Seu imposto já vai para algum lugar."
- Subtítulo dourado: "A única pergunta é: para onde?"
- Comparação visual em 3 colunas: "Sem ação" (😐) → seta → "Com DestineAI" (destaque dourado, "→ Música para jovens")
- Grade de 3 cards menores: "Não sai do bolso", "4 passos simples", "Zero risco fiscal"

**Seção 5 — CTA final** (fundo dourado, alta conversão):
- Headline navy: "Seu IR já está sendo cobrado."
- Subtítulo: "Falta só você escolher para onde vai."
- Botão grande navy: "Destinar agora — é grátis"
- Link discreto: "Calcular quanto posso destinar →"

**Seção 6 — FAQ resumido** (fundo branco):
- 5 perguntas accordion: "Isso sai do meu bolso?", "Qual o limite?", "Tenho IR retido em folha — posso destinar?", "Como funciona na declaração?", "O Circuito do Forró é aprovado?"
- Link: "Ver todas as perguntas →" para `faq.html`

**Footer**:
- Logo DestineAI + tagline em uma linha
- Copyright e links para política de privacidade e termos

**Comportamentos JS**:
- Navbar transparente que ganha fundo navy com blur ao rolar
- Animação fade-up ao entrar na viewport (IntersectionObserver)
- FAQ accordion: clicar abre, outros fecham
- Bolha do TINA flutuante no canto inferior direito (placeholder por enquanto)

Retorne o HTML completo, pronto para salvar como `index.html` na pasta `frontend/`.

---

### B.2 — COMO FUNCIONA (`como-funciona.html`)

**Prompt:**

Gere a página `como-funciona.html` seguindo o design system. Estrutura:

**Hero compacta:**
- Fundo navy
- Título: "Como funciona em 5 minutos"
- Subtítulo: "O passo a passo da destinação de IR para o Circuito do Forró"

**Seção 1 — Os 4 passos detalhados:**
- Linha do tempo vertical (em mobile) ou horizontal (em desktop)
- Cada passo tem número grande dourado, ícone, título, descrição expandida (3 a 4 linhas)
- 1. Calcule seu IR devido — explica como achar o número na declaração anterior
- 2. Confirme o projeto — apresenta o Circuito do Forró em detalhes, fala do PRONAC 252026 e da aprovação MinC
- 3. Transfira via PIX — explica que vai DIRETO ao beneficiário, plataforma não recebe
- 4. Declare no IRPF — código 41, mostra screenshot/ilustração do campo

**Seção 2 — Por que 99% não destinam:**
- Título: "Você não está sozinho. **99% dos servidores nunca destinaram.**"
- 7 cards (grade 2x4 em desktop, 1 coluna em mobile) — cada um cobre um fator de não-destinação:
  1. Desconhecimento total
  2. Complexidade percebida
  3. Desconfiança nos fundos
  4. Falta de conexão emocional
  5. Processo burocrático
  6. Ausência de incentivos
  7. Timing desfavorável
- Cada card tem ícone, título do fator, descrição curta e badge dourado "Como o IncentivaBR resolve" com explicação

**Seção 3 — Sou servidor público:**
- Fundo levemente diferenciado (navy claro)
- Título: "Sou servidor público. Por que isso é especialmente para mim?"
- Lista de 4 vantagens com ícones:
  - Renda fixa = previsibilidade do limite
  - IR retido em folha = você já paga, só não escolheu
  - Modelo completo = aproveita a dedução
  - Estabilidade = ciclo anual recorrente
- Quadro comparativo "Servidor público vs Profissional liberal" com 5 linhas

**Seção 4 — Na hora de declarar:**
- Tutorial visual: mostra o caminho dentro do programa da Receita
  - "Doações Efetuadas → Código 41 — Atividade Cultural"
- Screenshot ilustrativo do campo
- Lembrete: "Modelo completo de declaração obrigatório"

**Seção 5 — CTA final:**
- "Ainda tem dúvida? Veja as **perguntas frequentes** →"
- "Pronto para começar? **Calcular meu IR** →"

**Comportamentos JS:**
- Mesmo navbar e footer da landing
- Animação fade-up

Retorne o HTML completo.

---

### B.3 — FAQ (`faq.html`)

**Prompt:**

Gere a página `faq.html`. Estrutura:

**Hero compacta:**
- Título: "Perguntas frequentes"
- Subtítulo: "Tudo que você precisa saber antes de destinar"
- Campo de busca opcional (filtra perguntas por palavra-chave em JS local)

**Lista de perguntas em 4 seções**, cada uma com tabs ou subtítulos. Use accordion (clicar abre, outros fecham):

**Seção A — O básico:**
- O que é destinação de IR?
- Quem pode destinar?
- Sou servidor público — isso muda algo?
- O que é a Lei Rouanet?

**Seção B — Custo e retorno:**
- Isso sai do meu bolso?
- Como recebo o valor de volta?
- E se eu declarar no modelo simplificado?
- Posso destinar mesmo com IR retido na fonte?

**Seção C — Segurança:**
- A INCENTIVABR recebe meu dinheiro?
- O PRONAC é confiável?
- Posso cair na malha fina?
- Como funcionam as auditorias?

**Seção D — Operacional:**
- Qual o limite que posso destinar?
- Posso destinar para vários projetos?
- E se eu errar o valor?
- Posso destinar agora e declarar depois?

**Cada resposta:**
- 2 a 5 parágrafos curtos
- Linguagem de servidor, não de advogado
- Quando relevante, incluir lei ou referência (com link externo se possível)
- Negrito em palavras-chave (para escaneamento rápido)

**Rodapé da seção:**
- "Não achou sua dúvida? Fale com a TINA →" (botão que abre chat)
- "Pronto para destinar? Criar conta →" (botão dourado)

**Comportamentos JS:**
- Accordion: clique abre, outros fecham
- Busca: filtra dinamicamente as perguntas exibidas

Retorne o HTML completo.

---

### B.4 — CALCULADORA PÚBLICA (`calculadora.html`)

**Prompt:**

Gere a página `calculadora.html` — calculadora rápida sem necessidade de cadastro. Estrutura:

**Hero compacta:**
- Título: "Calcule quanto você pode destinar"
- Subtítulo: "Sem cadastro. Sem compromisso. Em 30 segundos."

**Calculadora central (card grande, fundo branco, sombra):**
- Pergunta: "Qual foi seu IR devido na última declaração?"
- Campo numérico grande com máscara monetária `R$ ___`
- Slider opcional para faixas comuns: R$ 1.000 / R$ 5.000 / R$ 15.000 / R$ 30.000 (chips clicáveis que preenchem o campo)
- Botão grande dourado: "Calcular"

**Resultado (aparece após calcular, com animação):**
- Linha de destaque: "Você pode destinar até **R$ X** (6% do seu IR)" em fonte grande, dourado
- Comparação dois cenários (lado a lado em desktop, empilhado em mobile):
  - Card A — "Sem destinar":
    - IR devido: R$ Y
    - Já retido: R$ (estimativa 80% de Y)
    - Restituição estimada: R$ (Y * 0.2)
  - Card B — "Destinando 6%":
    - IR devido após dedução: R$ (Y - X)
    - Já retido: R$ (estimativa 80% de Y) (mesmo valor)
    - Restituição estimada: R$ (Y * 0.2 + X)
- Linha de fechamento, em destaque visual: "Seu bolso fica **igual**. Mas R$ X agora vão para um projeto que você escolhe, e não somem na máquina pública."

**3 CTAs após o resultado:**
- "Quero destinar para o Circuito do Forró →" (botão dourado primário)
- "Quero ver outros projetos →" (botão secundário)
- "Salvar este cálculo no meu e-mail" (campo de email + botão pequeno — opcional)

**Disclaimer obrigatório:**
- Pequeno, no rodapé: "Cálculo válido para o modelo completo de declaração. No modelo simplificado, a destinação não retorna."

**Comportamentos JS:**
- Cálculo local em JavaScript (sem chamada ao backend)
- Os 6% são fixos para esta calculadora pública (Rouanet)
- Animação suave ao revelar o resultado
- Salvar e-mail (opcional) faz POST para `/api/leads/calculator-save` (placeholder)

Retorne o HTML completo.

---

### B.5 — LOGIN E CADASTRO (`login.html`)

**Prompt:**

Gere a página `login.html` com tabs "Entrar" e "Cadastrar". Layout: fundo navy, card branco centralizado de até 480px de largura. Já tem versão funcional — quero que você refine para máxima conversão. Estrutura:

**Header do card** (fundo navy interno):
- Logo DestineAI
- Tagline: "Destine seu IR para a cultura brasileira"

**Tabs:**
- "Entrar" e "Cadastrar"
- Estado ativo com borda inferior dourada
- Por padrão, abrir na aba "Cadastrar" (mais conversão)

**Form Entrar:**
- Campo: "CPF ou E-mail"
- Campo: "Senha" (com botão de olho para revelar)
- Botão grande dourado: "Entrar"
- Link discreto: "Esqueci minha senha"

**Form Cadastrar:**
- Nome completo (mínimo 3 caracteres)
- CPF (com máscara 000.000.000-00, validação de algoritmo)
- E-mail (validação de formato)
- Telefone (opcional, com máscara)
- Senha (mínimo 8 caracteres, indicador visual de força em barra colorida fraco/médio/forte)
- Confirmar senha (verificar match em tempo real)
- Checkbox obrigatório com texto: "Li e aceito a Política de Privacidade e os Termos de Uso *" (links abrem em nova aba)
- Botão grande dourado: "Criar conta"

**Rodapé do card:**
- Link: "← Voltar para o início"
- Microtexto: "Política de Privacidade · Termos de Uso"

**Comportamentos JS:**
- Validação inline com feedback visual (borda vermelha + mensagem)
- Indicador de força de senha em barra colorida
- Toast de sucesso/erro após submit
- Após cadastro, troca automaticamente para "Entrar" e pré-preenche o e-mail
- Após login, redireciona para dashboard.html
- Senha tem botão "olho" para revelar/ocultar

**Mensagens de erro padrão:**
- Nome: "Nome deve ter pelo menos 3 caracteres"
- CPF: "Digite um CPF válido"
- E-mail: "Digite um e-mail válido"
- Senha: "Senha deve ter pelo menos 8 caracteres"
- Confirmar senha: "As senhas digitadas não conferem"
- Termos: "Você precisa aceitar os termos para continuar"

Retorne o HTML completo.

---

### B.6 — FLUXO DE DESTINAÇÃO (`destinar-rouanet.html`)

**Prompt:**

Gere a página `destinar-rouanet.html` — fluxo de destinação em 6 passos, em wizard sequencial, todos na mesma página com transição entre etapas. Layout: fundo cinza claro, container central de até 800px. Cabeçalho com logo, barra de progresso (1 de 6) e indicador do passo atual em texto.

Use abordagem de step-by-step (cada passo aparece, outros ficam ocultos). Botão "Anterior" volta um passo, botão "Continuar" avança. Salvar progresso em `localStorage` para retomada.

**PASSO 1 — Projeto:**
- Card grande do Circuito do Forró
  - Imagem
  - Nome, PRONAC, lei
  - Resumo
  - 4 indicadores ([TBD: indicador 1], [TBD: indicador 2], [TBD: território/local], R$ 0 custo)
  - Selo "Aprovado pelo MinC"
- Bloco "Antes de continuar, confira":
  - Lei: Rouanet
  - Limite individual: até 6% do IR devido
  - Sua dedução: 100% volta na declaração
- Botão "Calcular meu IR →"

**PASSO 2 — Calculadora:**
- Pergunta: "Qual foi seu IR devido na última declaração?"
- Campo numérico
- Botão "Calcular"
- Após calcular: mostra valor disponível (6%) e simulação dos dois cenários
- Botão "Definir valor →"

**PASSO 3 — Valor:**
- Slider visual (R$ 50 ao limite calculado)
- Campo numérico sincronizado com o slider
- Indicador: "Você está destinando X% do limite disponível"
- Checkbox obrigatório: "Confirmo que declararei meu IR no modelo completo no próximo exercício e informarei este valor no campo Doações Efetuadas - Código 41"
- Botão "Confirmar valor: R$ X →"

**PASSO 4 — Pagamento:**
- Cabeçalho: "Faça a transferência"
- Aviso: "O dinheiro vai DIRETO ao beneficiário. A INCENTIVABR não recebe nem retém."
- QR Code PIX grande gerado a partir dos dados do beneficiário (use uma biblioteca cliente JS para gerar QR a partir do payload PIX, ou use um placeholder visual com instrução de copiar/colar)
- Dados em texto:
  - CNPJ (com botão copiar)
  - Banco, agência, conta
  - Chave PIX (com botão copiar)
  - Beneficiário
  - Valor: R$ X (em destaque)
- Selo "CNPJ verificado em [data]" e "Plataforma protegida pelo INPI BR512025000647-0"
- Instruções passo a passo numeradas (1 a 5)
- Botão: "Já realizei o pagamento — Subir comprovante →"

**PASSO 5 — Comprovante:**
- Área drag-and-drop: "Arraste o comprovante aqui ou clique para selecionar"
- Aceita PDF/JPG/PNG, máx 5MB
- Após upload, mostra preview (nome + miniatura)
- Status visual: "Validando comprovante..." → "Comprovante validado" (verde) ou "Em análise manual" (amarelo)
- Botão "Confirmar destinação →"

**PASSO 6 — Confirmação:**
- Animação confetti (use canvas-confetti via CDN: `https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js`)
- Mensagem central: "Pronto, [primeiro nome]! Sua destinação de R$ X para o Circuito do Forró está registrada."
- Bloco "Próximos passos automáticos":
  - ✅ Recibo oficial em até 48h
  - ✅ Comprovante arquivado no painel
  - ✅ Lembrete em março/2027
  - ✅ Atualizações sobre o impacto
- Bloco "Seu impacto":
  - Total destinado: R$ X
  - Projetos apoiados: 1
- 3 botões finais:
  - "Destinar para outro projeto" (volta ao Passo 1 com novo projeto)
  - "Ir para meu painel" (vai para `dashboard.html`)
  - "Compartilhar minha história" (gera card visual via JS para postar)

**Comportamentos JS:**
- Wizard com transição suave entre passos
- Validação a cada passo antes de avançar
- localStorage para retomada
- Cálculo de IR em JS local
- Geração de QR Code PIX dinamicamente (use biblioteca como `qrcodejs` ou `qrcode.js`)
- Drag and drop no upload
- Animação de sucesso no Passo 6

Retorne o HTML completo, pronto para salvar como `destinar-rouanet.html`.

---

### B.7 — DASHBOARD DO USUÁRIO (`dashboard.html`)

**Prompt:**

Gere a página `dashboard.html` — painel do servidor logado. Layout: navbar fixa no topo (com nome do usuário, avatar/inicial, link "Sair"), container central com cards.

**Header personalizado:**
- "Olá, [primeiro nome]!"
- Subtítulo: "Aqui você acompanha suas destinações e o impacto que está gerando"

**Card destacado — Próxima ação:**
- Se ainda não destinou: "Você ainda não destinou. Comece pelo Circuito do Forró →" (CTA dourado grande)
- Se já destinou: "Sua destinação de R$ X está registrada. Que tal apoiar mais um projeto?"

**Grade de cards informativos (3 colunas em desktop, 1 em mobile):**
- Total destinado em 2026: R$ X / R$ Y disponível (barra de progresso)
- Projetos apoiados: N
- Impacto agregado estimado: frase com números

**Lista de destinações recentes (tabela ou cards):**
- Para cada destinação:
  - Data
  - Projeto
  - Valor
  - Status (Validado / Em análise / Recibo recebido)
  - Botão "Ver comprovante"

**Bloco "Calendário fiscal":**
- "Próximo lembrete: março de 2027 — Hora de declarar"
- Mini-tutorial visual de onde declarar

**Sidebar ou bloco lateral (em desktop):**
- Quick links:
  - "Calcular novo limite"
  - "Ver outros projetos"
  - "Atualizar perfil"
  - "FAQ"
  - "Falar com TINA"

**Footer compacto:**
- Logo + copyright

**Comportamentos JS:**
- Ler dados do usuário do localStorage (token + dados básicos) e fazer fetch em `/api/donations` para popular a lista
- Atualizar barra de progresso dinamicamente
- Botão Sair faz logout (limpa localStorage e redireciona)

Retorne o HTML completo.

---

### B.8 — COMPROVANTE (`comprovante.html`)

**Prompt:**

Gere a página `comprovante.html` — visualização de comprovante de destinação para impressão ou download. Layout: A4 retrato, fundo branco, conteúdo centralizado.

**Cabeçalho:**
- Logo DestineAI/IncentivaBR
- "COMPROVANTE DE DESTINAÇÃO — IMPOSTO DE RENDA"
- Número do comprovante: COD-XXXX-YYYY
- Data de emissão

**Bloco — Dados do destinador:**
- Nome
- CPF
- E-mail

**Bloco — Dados da destinação:**
- Lei: Rouanet (Lei 8.313/1991)
- Projeto: Circuito do Forró
- PRONAC: 252026
- Beneficiário: BR Projects LTDA
- CNPJ do beneficiário: 00.000.000/0001-00
- Banco: Banco do Brasil — Ag. 0000-0 — Conta de Captação 00000-0
- Valor destinado: R$ X
- Data da transferência

**Bloco — Para a declaração do IR:**
- "Informe este valor no campo Doações Efetuadas - Código 41"
- Indicador: "Lembre-se: declarar no modelo completo"

**Rodapé:**
- "Plataforma protegida pelo INPI BR512025000647-0"
- "Este comprovante é gerado automaticamente. O recibo oficial dedutível, emitido pelo beneficiário, está disponível separadamente em seu painel."
- Selo de assinatura digital (placeholder)

**Botões de ação (ocultos na impressão):**
- "Imprimir" (chama `window.print()`)
- "Baixar PDF" (placeholder ou via biblioteca cliente)
- "Voltar ao painel"

**CSS de impressão:**
- @media print: oculta navbar e botões, ajusta margens A4

Retorne o HTML completo.

---

## ╔══════════════════════════════════════════════════════════╗
## ║ SEÇÃO C — RECOMENDAÇÕES DE FERRAMENTAS DE IA            ║
## ╚══════════════════════════════════════════════════════════╝

### Para gerar UI completa (HTML/JS pronto)

**v0.dev (Vercel)** — Melhor opção se você puder migrar para React + Tailwind + shadcn/ui no futuro. Gera componentes prontos com qualidade alta. Limitação: gera React, não HTML puro. Se ficar com HTML/JS Vanilla atual, v0 não é ideal.

**Lovable (ex-GPT Engineer)** — Gera apps full-stack a partir de prompts longos. Útil para protótipos rápidos. Gera React por padrão. Plano gratuito limitado.

**Bolt.new (StackBlitz)** — Geração e preview imediato no navegador. Aceita prompts para HTML/JS Vanilla. Boa para iteração rápida. Plano gratuito generoso.

**Claude (este aqui, via Claude Code/Cursor/API)** — Recomendação principal para SEU caso. Já tem todo o contexto do IncentivaBR carregado, gera HTML+Tailwind+JS Vanilla com fidelidade ao stack atual, refina com precisão. Use o prompt da Seção A + B desta página.

**Magic Patterns** — Similar a v0, mas mais variações de estilo. Bom para inspiração, menos para output final.

### Para mockups visuais e protótipos (sem código)

**Figma + plugins de IA** — Padrão de mercado para design. Plugins recomendados: **Magician** (gera ícones e copy), **Wireframe Designer**, **Diagram**. Use Figma para validar visualmente antes de gerar código.

**Galileo AI** — Gera designs Figma a partir de prompts. Boa qualidade. Pago.

**Uizard** — Gera protótipos clicáveis a partir de descrições. Útil para testes de usabilidade rápidos. Plano free limitado.

**Khroma** — Gera paletas de cores customizadas. Útil para evoluções visuais do design system.

### Para imagens conceituais (hero, ilustrações)

**Midjourney** — Melhor qualidade artística. Prompt: "young Brazilian musicians in a courtroom orchestra, golden hour lighting, photorealistic". Cobra mensalidade.

**DALL-E 3 (via ChatGPT)** — Bom para ilustrações conceituais. Plano gratuito limitado.

**Adobe Firefly** — Integração direta com Photoshop. Útil para ajustar imagens existentes.

**Unsplash + filtros** — Alternativa gratuita para fotos reais. Use a foto que já está na landing como referência de estilo.

### Para refinamento de copy

**Claude (preferência)** — Melhor para tom natural em português brasileiro. Pode pedir variações de copy de uma frase específica.

**ChatGPT (alternativa)** — Bom para A/B testing de copy. Fora do português, qualidade similar a Claude.

### Para análise de UX e fluxo

**Maze** — Testes de usabilidade remotos. Caro mas eficaz para validar protótipos.

**Notably** — Análise qualitativa de feedback. Útil durante o piloto FGV.

**Hotjar** — Heatmaps e gravação de sessão. Plano free generoso. Recomendo desde o lançamento.

### Recomendação prática para o seu caso

Stack atual é HTML5 + Tailwind CDN + JS Vanilla, mobile first, multi-tenant. Para isso:

1. **Para gerar telas:** Claude (este painel) ou Cursor + Claude. Você já tem todo o contexto. Cole a Seção A + B da tela desejada e peça o HTML completo.

2. **Para gerar imagens:** Unsplash para fotos reais (já em uso), Midjourney quando precisar de ilustração específica.

3. **Para refinar visual:** Figma com plugin Magician para gerar ícones consistentes com o design system.

4. **Para validar com usuários do piloto:** Hotjar para heatmaps + Google Forms para pré/pós-teste (já está no PI).

5. **Para copy específico:** Claude com este prompt mestre carregado.

### Fluxo de trabalho recomendado

**Etapa 1** — Use o prompt da Seção A + B para gerar a primeira versão de cada tela.

**Etapa 2** — Salve cada arquivo gerado em `frontend/`.

**Etapa 3** — Teste no navegador local com `python -m http.server` ou similar.

**Etapa 4** — Refine pedindo ajustes pontuais ("mude esse botão para a cor X", "adicione um subtítulo aqui").

**Etapa 5** — Quando satisfeito, faça commit em branch específica (`feat/refresh-landing`, etc.).

**Etapa 6** — Quando todas as telas estiverem alinhadas, faça merge na main e push para Railway.

---

## ╔══════════════════════════════════════════════════════════╗
## ║ SEÇÃO D — DICAS DE PROMPTING POR TIPO DE TAREFA         ║
## ╚══════════════════════════════════════════════════════════╝

### Para gerar uma página inteira

Estrutura do prompt:
```
[Cole Seção A — Contexto e Design System]

[Cole prompt da página específica em Seção B]

Retorne HTML completo, pronto para salvar.
```

### Para refinar um componente específico

```
Já tenho o seguinte código HTML:
[cole o trecho]

Refine para:
- [pedido específico 1]
- [pedido específico 2]

Mantenha o restante intacto.
```

### Para gerar variação visual

```
[Cole Seção A]

Quero variações do hero da landing page. Gere 3 alternativas, cada uma com:
- Uma headline diferente
- Um background diferente
- Um CTA primário diferente

Cada alternativa em um bloco HTML separado.
```

### Para gerar copy específico

```
[Cole Seção A — apenas o resumo do contexto e persona]

Estou escrevendo o subtítulo do hero da landing. O título é "Seu imposto vira música". Preciso de 5 variações de subtítulo, cada uma com:
- Máximo 25 palavras
- Tom poético mas direto
- Mencionando o número 6% e o conceito de "sem custo"
- Português brasileiro natural

Liste as 5 variações numeradas.
```

### Para validar acessibilidade

```
Analise este código HTML e aponte problemas de acessibilidade:
[cole código]

Liste por prioridade (alta/média/baixa) e proponha correção para cada.
```

---

**Fim do prompt mestre.**
Use, refine, evolua. Cada nova tela ou refinamento que você descobrir, atualize aqui mesmo na Seção B para virar memória do projeto.
