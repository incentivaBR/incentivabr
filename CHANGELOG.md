# CHANGELOG — IncentivaBR Rouanet

## [Não lançado] — 2026-09 — Onda 2 do Raio-X

### O prazo do comprovante, e a data que faltava para poder contá-lo
- A Resolução Normativa nº 125/2026 do CDCA/DF, art. 7º, dá ao contribuinte **60 dias da data da doação** para apresentar o comprovante de depósito à Secretaria Executiva do CDCA/DF — e é isso que faz o recibo sair. Sem recibo não há dedução, **com o dinheiro já transferido**. É o único prazo do produto que mata o benefício depois de a pessoa ter pagado; a Rouanet não tem equivalente.
- **Não dava para contar, porque a data da doação não existia no banco.** `donations` tinha `created_at` (registro na plataforma) e `confirmed_at` (conferência do gestor). Entre registrar e transferir passa uma semana; entre transferir e conferir, outra. Contar de qualquer uma delas daria data errada — e errada **para mais**, o lado que faz alguém perder o prazo achando que tem folga. Agora há `transferido_em`, informada por quem lê o comprovante bancário: o próprio contribuinte, no upload. É `DATE`, não `TIMESTAMP` — o comprovante traz o dia, e fingir precisão de hora seria inventar.
- **O prazo é dado do fundo**, em `official_funds.prazo_comprovante_dias`, com órgão e base legal ao lado. Quem fixa os 60 dias é o Conselho do DF na resolução dele; outro conselho municipal fixa outro. Mudar é `UPDATE`, não deploy — a mesma disciplina do teto. Fonte única em `lib/prazos.js`, e um teste recusa o número escrito no código.
- **`null` é informação, não campo esquecido.** A Rouanet não tem janela porque o proponente emite o recibo, então nenhum aviso aparece lá. Inventar contagem onde não há prazo treina a pessoa a ignorar o aviso onde há.
- O aviso aparece **duas vezes**: antes de transferir (em `/api/config/brand`, que é quando ainda evita o problema) e no fim, com a contagem já iniciada. O assistente passou a pedir a data da transferência junto do comprovante.
- O FDCA/DF entra no catálogo de fundos com prazo, órgão e base legal — e **sem agência, conta ou CNPJ**, embora a resolução os publique. Dado bancário vem de `org_projects`, por tenant: número gravado em migration envelhece calado na primeira resolução que o mudar. Um teste recusa os números publicados dentro da migration.
- **O job do Postgres real pegou um erro que o pg-mem não pega:** `official_funds.local_law` era `VARCHAR(50)` e a citação legal do FDCA/DF tem 84 caracteres. As colunas de referência legal viraram `TEXT` — truncar a referência que o contador confere seria guardar dado pela metade.

### O texto legal foi lido: sai "fonte secundária", entra o dispositivo
- A migration 045 corrigiu o catálogo a partir de uma nota de pesquisa e marcou tudo como fonte secundária, porque o ambiente de trabalho não alcança o `planalto.gov.br`. O texto dos dois dispositivos foi trazido e lido na íntegra.
- **LC 222/2025, art. 9º, § 1º, II** — "7% (sete por cento) do imposto devido na Declaração de Ajuste Anual, **conjuntamente** com as deduções a que se referem os incisos I, II e III do caput do art. 12 da Lei nº 9.250/1995". A palavra "conjuntamente" encerra a dúvida: não é teto adicional, é a mesma cesta subindo.
- **Lei 12.715/2012, art. 4º, § 6º, I, "d"** — 1% para o programa do art. 1º (PRONON) **e** 1% para o do art. 3º (PRONAS/PCD). Confirma a correção da 045. O § 8º confirma que ficam fora do teto geral; a alínea "c" confirma a exigência de deduções legais.
- As páginas deixam de dizer "não confirmado em fonte primária" nesses dois pontos e passam a citar o dispositivo. A ressalva continua onde ainda vale: os códigos da DIRPF.
- **`confirmado_por_parecer` seguiu FALSE em tudo.** Ler a lei não é ter parecer: o que se ganhou foi saber o que o texto diz; falta alguém assinar que a nossa aplicação dele está correta. Um teste recusa a ressalva ao lado do 7% e do 1%, e continua exigindo que nenhuma página calcule com 0.07.

### PRONON e PRONAS/PCD entram em standby
- O texto revelou algo mais grave que a dúvida anterior. O caput do art. 4º da Lei 12.715/2012, com a redação da Lei 14.564/2023, faculta a dedução **"às pessoas físicas... até o ano-calendário de 2025, e às pessoas jurídicas... até o ano-calendário de 2026"**.
- Pessoa física é o público desta plataforma. Deixou de ser "vigência não confirmada" e virou prazo que o texto fixa: sem norma posterior prorrogando — e não encontramos nenhuma —, destinação de pessoa física feita em 2026 **não gera dedução**.
- Os dois ficam no catálogo e na biblioteca jurídica como referência, marcados. A biblioteca, o Espaço do Contador, o validador e a agenda fiscal avisam o efeito prático: em 2026, não ofereça. O teto em si está resolvido, então uma eventual prorrogação só exigiria a jornada.
- A pergunta 2 da consulta encolheu para uma linha: houve prorrogação?

### Trava de retenção: o prazo não corre enquanto houver processo em aberto
- `/api/admin/retencao` lista quem já passou do prazo de guarda. Hoje é só uma lista — nada apaga por prazo. Mas é o **rascunho da fila de eliminação**: no dia em que a rotina for ligada, ela vai agir sobre exatamente essas linhas. Apagar o comprovante de alguém no meio de uma fiscalização destrói a prova de quem a plataforma deveria estar protegendo, e é irreversível.
- A trava (migration 046) resolve isso **agora, enquanto a fila ainda é só uma lista**. O superadmin trava a conta com o motivo escrito — número do processo, ofício, o que for — e ela some da fila de vencidas, aparecendo numa lista própria com o motivo à vista. Ligar a eliminação depois, sobre uma base que já sabe o que não pode ser tocado, é mais seguro do que ligar primeiro e lembrar da exceção depois.
- **Motivo é obrigatório** (mínimo de 10 caracteres). Trava sem motivo escrito vira trava eterna: seis meses depois ninguém sabe se ainda vale, e na dúvida ninguém destrava — o dado fica guardado para sempre, o oposto do que a LGPD quer. Travar e destravar vão para o `audit_log`, com dono.
- **A trava é por pessoa, não por destinação.** Uma fiscalização é sobre o contribuinte e a declaração dele: alcança o ano inteiro e normalmente mais de uma destinação. Travar uma a uma deixaria o superadmin esquecendo alguma.
- **O prazo termina em 31/12**, não em 1º de janeiro. `anoFinalDaGuarda()` devolvia um ano, e ano sozinho é ambíguo — a diferença entre as duas leituras é um ano inteiro de documento apagado cedo demais. Agora há `dataFinalDaGuarda()` e `guardaVencida()`, e um teste prova que durante todo o ano final o documento ainda está na guarda.
- **Anonimizar a linha não anonimiza nada** enquanto o comprovante e o recibo continuarem guardados: os dois trazem nome, banco, data e valor no próprio PDF e reidentificam sozinhos. Isso é fato técnico, não interpretação — está registrado em `config/lgpd.js` e sai na resposta da rota. O que continua sendo pergunta ao tributarista é se a plataforma precisa guardá-los.

### PRONON e PRONAS: o site dizia que dividiam 1%, e a lei dá 1% a cada um
- Quatro páginas no ar (`biblioteca-juridica`, `validador`, `espaco-contador`, `agenda-fiscal`) e a base da TINA afirmavam que **"PRONON e PRONAS compartilham 1% do IR devido"**. A Lei 12.715/2012 dá **1% a cada programa**, independentes entre si e fora do teto geral do art. 22 da Lei 9.532/1997.
- Pior que o texto: o **validador calculava assim**. Somava as duas destinações (`V.pronon_pronas`) e conferia contra um único `L.pronon`, acusando excesso onde a lei permite o dobro — numa ferramenta que se chama Validador Anti-Malha Fina. Agora cada programa tem o seu limite e é conferido contra ele; o card dos dois mostra o pior dos dois, como o card FDCA + FDI já fazia, em vez da soma.
- Quatro cópias da mesma frase falsa, cada página guardando a sua — o padrão que o Raio-X (risco 04) já tinha apontado. `backend/tests/limites-por-mecanismo.test.mjs` impede a volta, com 8 casos, e foi conferido reintroduzindo o defeito.
- A vigência ficou marcada como **não confirmada**: a Lei 12.715/2012 autorizava a dedução da pessoa física até o ano-calendário de 2025, e não confirmamos se a prorrogação virou lei. Virou a pergunta 2 da consulta.

### O teto do esporte é registro, não cálculo
- A LC 222/2025 substituiu a Lei 11.438/2006 e fixa, para pessoa física, **7% do imposto devido em conjunto** com os incisos I a III do art. 12 da Lei 9.250/1995: a cesta inteira sobe de 6% para 7% quando o esporte entra, em vez de abrir um teto separado. A migration 031 tinha acertado a parte difícil (o esporte concorre, não tem teto próprio) e parado no percentual.
- O `irpf_global_7` entra em `tetos_deducao` como **registro, sem nenhum mecanismo apontando para ele** — do mesmo jeito que o `desporto_7` entrou na 030. O cálculo segue em 6%: o teto condicional é lógica de `saldoDisponivel()`, não dado, e não se escreve regra fiscal nova sobre documento não assinado. Manter 6% erra para menos, e errar para menos é recuperável no ano seguinte.
- A guarda de `textos-fiscais.test.mjs` que proibia qualquer "7%" na tela foi **reescrita, não apagada**: ela travava a crença anterior de que 7% é sempre erro. Agora exige que todo "7%" apareça dito como teto conjunto, e nunca como teto próprio ou adicional. A proibição no cálculo continua absoluta, em `limites-por-mecanismo.test.mjs`.
- Recicla+ também corrigido no catálogo: 100% do valor é dedutível, mas dentro do teto geral — não é limite autônomo de 6%.

### A consulta ao tributarista encolheu de onze perguntas para quatro
- Uma nota técnica de **pesquisa** — não assinada, sem responsabilidade técnica — revisou as onze perguntas. Está arquivada em `docs/juridico/nota-tecnica-pesquisa-2026-09.md` com a ressalva no topo. **Nada nela virou `confirmado_por_parecer`, nada saiu da simulação, nenhum mecanismo foi liberado para cliente.**
- Sete perguntas caíram: confirmou a leitura que o sistema já operava (base é o imposto devido, art. 18 e 26 no mesmo teto, sem ordem legal de imputação, modelo completo como requisito) e resolveu três erros de cadastro. Restaram os 3% do art. 260-A, a vigência do PRONON/PRONAS, os códigos da DIRPF e a retenção.
- O texto legal **não foi lido**: o ambiente de trabalho não alcança o `planalto.gov.br`. Os dois pontos que mudaram o produto foram conferidos em fontes secundárias (Senado, Mattos Filho, Oncoguia, Câmara), e por isso tudo o que entrou nas páginas está marcado como "não confirmado em fonte primária", como já estão os códigos da DIRPF.

### FDCA e Fundo do Idoso: o catálogo tinha 3% e 6% trocados
- A migration 018 semeou, na observação das duas leis, **"destinação durante o ano até 3%; doação na declaração até 6%"**. É o inverso. Durante o ano-calendário vale o teto de 6% do art. 22 da Lei 9.532/1997, o mesmo que a Rouanet divide — exatamente o que a seção "O que já consideramos resolvido" da consulta registra e o que `saldoDisponivel()` sempre fez. Os 3% são a via do art. 260-A do ECA, destinar na própria declaração, caminho que a plataforma não opera.
- A migration 043 leu a observação invertida e bloqueou os dois mecanismos **pelo motivo errado**: "falta o limite da destinação durante o ano". Não falta. A 044 corrige o catálogo, aponta FDCA e Idoso para o teto global e troca o motivo do bloqueio pelo verdadeiro, que não é jurídico: o assistente pede PRONAC e consulta o SALIC, e um fundo municipal não tem PRONAC — tem CNPJ do fundo, e é o fundo que emite o recibo.
- Por isso a coluna deixa de se chamar `pendencia_parecer`: ela prometia que o bloqueio era sempre do tributarista, e mentiu no primeiro caso real. Agora é `motivo_indisponivel`, e a tela mostra o motivo de cada um em vez de dizer "aguarda parecer" para todos.
- A pergunta 11 da consulta estava montada sobre a premissa invertida. Reescrita: pede confirmação da leitura correta, e pergunta se os 3% do art. 260-A são adicionais ao destinado durante o ano.

### O mecanismo de incentivo é escolha do cliente, e o interruptor finalmente existe
- **Uma coluna fantasma, lida por quatro rotas.** `lib/textosFiscais.js`, `routes/calculator.js`, `routes/donations.js` e `routes/config.js` escolhiam o mecanismo lendo `org.incentive_group_code`, com reserva `'ROUANET'`. A coluna **nunca existiu**: `req.organization` vem de `SELECT *`, então a leitura era sempre `undefined` e todo cliente caía na reserva. O interruptor por tenant foi desenhado e nunca ligado — nenhum white label podia operar outro mecanismo, e a tela de clientes sequer oferecia a escolha. Em JavaScript, ler campo que não existe não é erro: nada quebrou, e por isso ninguém viu.
- **A conta já estava certa.** `saldoDisponivel()` soma o que a pessoa destinou contra o **mesmo teto**, cruzando mecanismos: quem usar 3% pela Rouanet e 3% no Fundo do Idoso é barrado no quarto por cento. Essa era a parte difícil e não precisou mudar.
- **Dois catálogos viraram um.** `laws` (migration 018) tinha os sete mecanismos com base legal, órgão e sistema oficial, mas só conteúdo; `incentive_groups`, que o cálculo consulta, tinha só a Rouanet — **duas vezes**, `ROUANET` e `rouanet`. A migration 043 desfaz a duplicata (repontando o Fundo Nacional de Cultura antes), alinha o código do grupo ao slug da lei e cria os seis que faltavam a partir de `laws`.
- **Só a Rouanet fica disponível para um cliente, e cada bloqueio diz por quê** (`incentive_groups.pendencia_parecer`). Mecanismo sem teto resolvido cairia no teto global de 6% dentro de `tetoDoMecanismo()`, permissivo demais para quase todos: a LIE teve a lei revogada pela LC 222/2025, PRONON e PRONAS são 1%, e FDCA e Idoso dividem o 6% mas o catálogo registra **3% na destinação durante o ano**, que é exatamente o fluxo desta plataforma. Oferecer 6% ali seria liberar o dobro. A rota do superadmin recusa, e a tela mostra os bloqueados em cinza com o motivo — esconder faria o sistema parecer que só sabe Rouanet.
- Fonte única em `lib/mecanismos.js`; `/api/config/brand` passa a dizer qual lei o site opera (código, nome, base legal, órgão), para nenhuma página escrever "Rouanet" à mão. Item 11 novo na consulta ao tributarista: qual o limite da destinação durante o ano ao FDCA e ao Fundo do Idoso — a resposta destrava o primeiro cliente fora da Rouanet.
- **A guarda que teria pego isso** entra no job do Postgres real, único lugar onde as colunas são de verdade: ela cruza tudo o que o código lê de `org` com as colunas da tabela, ignorando texto e comentário (`'org.created'` é nome de ação no audit_log, não leitura de coluna). Conferida reintroduzindo uma leitura fantasma: aponta arquivo e linha. Mais `backend/tests/mecanismo-por-tenant.test.mjs`, com 16 casos.

### O avatar da TINA
- A imagem anterior tinha fundo navy, cílios e batom marcados, e o rosto pequeno no círculo. A nova (`assets/tina-avatar.svg`) é um traço simples: fundo creme, olhos fechados sorrindo, flor coral no cabelo na cor de acento da marca. Desenho próprio em vetor, escolhido entre três candidatas conferidas nos três tamanhos em que a TINA aparece (botão flutuante, cabeçalho do chat, bolha de mensagem).

### A TINA em dia: o retrato das páginas volta a ser conferido, e o contador entra
- A base de conhecimento da TINA (`nucleo.md`) é um retrato de páginas do site, gerado por `scripts/sync-nucleo-tina.mjs`. Ninguém rodava o script: o projeto do piloto saiu das páginas em 14 de setembro (PR #44) e a TINA seguiu citando **"Orquestra das Periferias do DF" dez vezes**, no site de qualquer cliente, por cinco dias. Nada quebrava, porque nada conferia. `backend/tests/nucleo-em-dia.test.mjs` regenera o retrato em memória e falha se o arquivo estiver diferente: o CI não passa com a TINA desatualizada.
- **O FAQ do Espaço do Contador entra** na base (sete perguntas: limite sobre o IR devido, modelo completo, art. 18 × art. 26, responsabilidade do contador, IR já pago, mais de uma modalidade, PRONAC ativo). O guia do servidor, a biblioteca jurídica e o FAQ já estavam. Só o FAQ do contador: a calculadora é interativa, o material é comercial, e a **tabela de fichas da DIRPF diverge do guia do servidor** (o guia manda lançar a Rouanet em "Doações Efetuadas", código 41; a tabela do contador diz "Incentivos Fiscais → PRONAC" e dá o 41 ao Fundo do Idoso). Nenhuma das duas entra pela segunda vez até o tributarista dizer qual está certa — pergunta 10 da consulta.
- O texto de estado vazio do FAQ ("Nenhuma pergunta encontrada") saía no retrato como se fosse um título. Fontes passam a listar o que descartar por id. Um filtro genérico de "esconde o que está `hidden`" foi tentado e rejeitado: apagava as respostas do FAQ, que nascem colapsadas.
- O Espaço do Contador trazia "73% nunca receberam orientação do contador — Piloto IncentivaBR, 2026", número de piloto sem planilha (risco 12). Saiu, pela mesma regra da home, e a guarda passa a olhar as duas páginas. Sem isso o número entraria na TINA.
- De passagem, o conferidor de páginas ficou vermelho num dos dois runs do mesmo commit: o painel sem sessão redireciona para o login enquanto `tina.js` ainda carrega, e num runner lento o pedido abortado (`net::ERR_ABORTED`) contava como falha. Pedido cancelado pela própria navegação deixa de contar; bloqueio de CSP continua vindo pelo console e pelo relatório de violação.
- **O status da assistente entra no resumo público de `/diagnostico`** (sem chave ou com falha recente: `error`), e o monitor de uptime passa a alarmar. E um workflow manual, **"TINA responde"** (`.github/workflows/tina.yml`), faz uma pergunta real à TINA em produção e confere status, texto e o aviso de que a plataforma não substitui contador ou advogado. Uma chamada ao modelo por execução; roda pela aba Actions.

### O Encarregado é o do controlador também no cadastro de avisos e nas preferências
- `cadastro-avisos.html` e `minhas-preferencias.html` escreviam o e-mail do Encarregado da IncentivaBR à mão. No site de um cliente, o interessado escreveria para o Encarregado errado — a decisão de set/2026 é que o divulgado é o do controlador (LGPD art. 41 §1º). As duas páginas passam a carregar `tenant.js` e a usar `[data-privacidade="encarregado_email"]`, como a Política e a tela Minha conta.
- Pior: o **texto do consentimento** do cadastro de avisos, que é enviado como está e guardado como prova (art. 8º §2º), dizia "autorizo o IncentivaBR" em qualquer site. A prova nomeava o operador, não o controlador. O nome passa a vir de `[data-privacidade="controlador"]`, preenchido antes do envio.
- Duas guardas em `papeis-lgpd.test.mjs`: nenhuma página escreve o e-mail do Encarregado da plataforma fora de `[data-privacidade]`, e o consentimento nomeia o controlador pelo tenant. As duas falham contra as páginas antigas.

### Dinheiro na tela tem um formatador só (Raio-X, risco 11)
- Havia nove formatadores de real em oito arquivos (`BRL`, `BRLs`, `formatBRL`, `fmtBRL`, `utils.formatCurrency`...), cada um com a sua ideia de casas decimais, de espaço depois do "R$" e do que fazer com valor nulo: uns escreviam "R$ 0,00", outro "—", e o Intl punha um espaço inflexível que o `'R$ ' +` das outras telas não punha. Agora só `frontend/js/moeda.js`: `BRL(v)` com centavos, `BRL.inteiro(v)` para metas e valores aprovados, e valor ausente vira "—" em todo lugar — o que não veio não é zero. `utils.formatCurrency` continua existindo para a calculadora, delegando.
- No Espaço do Contador, o campo de IR passava a mostrar "R$ " e o parser antigo devolvia zero. Ao cobrir a tela no E2E apareceu um defeito mais antigo: o IR devido era lido do texto de **antes** da máscara, e a tela ficava um dígito atrasada — quem digitava 20.000 via os limites de 2.000 até teclar de novo. Agora o valor sai dos dígitos digitados, e o campo e a tabela mudam juntos.
- `backend/tests/moeda.test.mjs` roda `moeda.js` num escopo limpo e confere o que ele escreve; recusa qualquer outro `Intl.NumberFormat` de moeda ou `'R$ ' +` no frontend; e exige `moeda.js` em toda página que escreve dinheiro, antes de `utils.js`. Dois fluxos novos no E2E digitam o IR no Espaço do Contador e no validador e conferem o teto em reais.

### Quem tem conta exerce os direitos da LGPD sem pedir a ninguém (Raio-X, Onda 2)
- Quem só deixou o e-mail na lista de avisos já exportava e eliminava os dados por conta própria desde a migration 027. Quem criou conta e destinou — justamente quem tem CPF, comprovante e recibo na base — não tinha nada, e a Política mandava "procurar a instituição". Agora `minha-conta.html`, pelo painel: vê o que existe, baixa tudo em JSON (`GET /api/meus-dados`: cadastro, destinações, acessos, com quem cada dado foi compartilhado, Encarregado do tenant) e elimina confirmando com a senha (`DELETE /api/meus-dados`).
- **Duas saídas para a eliminação**, decididas em set/2026. Sem registro fiscal (nunca destinou, ou só simulou): anonimização no ato, como o interessado — nome, CPF, e-mail, telefone e senha somem, simulações e vínculo com a organização também. Com registro fiscal (comprovante ou recibo fora da simulação): a conta é **encerrada** — senha invalidada, e-mail e telefone apagados, nenhum login — e nome, CPF, valor, comprovante e recibo ficam até o fim do prazo da Política (§7), por obrigação legal (LGPD art. 16 I). A resposta diz até que ano. Migration 042 (`encerrada_em`, `anonimizada_em`).
- **O token morre na hora.** O JWT vale 24 h e não era revogável: `authenticateToken` passa a conferir no banco, a cada pedido, se a conta foi encerrada. O login recusa também. Conta apagada pelo superadmin (linha inexistente) passa, porque as rotas dela não encontram nada.
- **O prazo tem uma fonte só**: `config/lgpd.js` (`RETENCAO_FISCAL_ANOS`, `anoFinalDaGuarda`). A contagem começa no ano seguinte ao ano-base, a leitura mais conservadora. De que data o prazo conta de fato é pergunta para o tributarista; até lá, **nada é apagado por prazo**: `GET /api/admin/retencao` só lista as contas encerradas que venceram e os interessados parados há mais de 24 meses.
- A Política diz onde exercer os direitos (§1, §5) e o que acontece com quem tem destinação e pede a eliminação (§7). O registro de auditoria da eliminação não carrega nome, CPF nem o e-mail antigo.
- `backend/tests/meus-dados.test.mjs`; fluxo no E2E. Fora desta frente: `minhas-preferencias.html` ainda escreve o e-mail do Encarregado da plataforma à mão, em vez de `[data-privacidade]`.

### Dado de fora nunca vira HTML sem escape (Raio-X, Onda 2)
- Auditoria dos 72 usos de `innerHTML` em 18 arquivos do frontend. A maior parte já escapava ou só mostrava texto da própria página. O que faltava: em `projetos-rouanet.html`, o PRONAC ia cru para a URL do botão de destinar e a URL do SALIC ia crua para o `href`; em `conferencia.html` e `dashboard.html`, o id da destinação ia cru para `onclick` e `id`; em `admin-clientes.html`, a contagem de destinações ia crua para a célula. Todos embrulhados em `esc()`/`escapeHtml()`/`encodeURIComponent()`. Em `js/utils.js`, `getStatusBadge()` e `getFundBadge()` devolviam o valor desconhecido dentro do HTML sem escape e ninguém as chamava: saíram.
- **Duas guardas, uma estática e uma na tela.** `backend/tests/escape-innerhtml.test.mjs` lê o JavaScript de cada página com um lexer pequeno (string, comentário, regex, template aninhado) e recusa, em todo template literal que contenha uma tag, acesso a propriedade sem embrulho (`${d.nome}`) e interpolação sem embrulho em atributo que executa ou aponta (`href`, `src`, `on*`, `id`, `data-*`). Páginas isentas são as que não buscam nada de fora, e o teste confere que continuam assim. O E2E passa a rodar com o fixture **envenenado**: nome de quem destina, título e descrição do projeto, órgão do interessado e nome do arquivo do comprovante terminam em `"><img data-veneno src=x>`; toda tela é recusada se o veneno virar elemento, e quatro fluxos exigem que ele tenha chegado como texto, senão a guarda não prova nada. Conferido tirando o escape do órgão em `interessados.html`: o estático aponta a linha, o E2E fica vermelho; restaurado, verde.
- De passagem, `postgres-real.test.mjs` ficou vermelho num dos dois runs do mesmo commit: a rota de login grava o `audit_log` sem esperar (de propósito, o log não atrasa o login), e num runner lento a linha chegou depois da leitura do teste. O teste agora espera até 3 s pela linha.

### O E2E volta a existir, e roda no CI (Raio-X, risco 11)
- A suíte confere cada rota; o Postgres real, o banco; o conferidor de páginas, que cada tela abre. Nenhum dos três confere que as peças **encaixam** — foi esse tipo de defeito (a Política com dois controladores, a IncentivaBR "se comprometendo" no site do cliente) que só apareceu renderizando as páginas à mão. `backend/scripts/e2e.mjs` faz essa renderização virar automática: 12 fluxos num Chromium de verdade, como uma pessoa faria — público (início, calculadora, projeto, política, carta de vendas recusada), destinadora (senha errada, entrar pelo formulário, painel, assistente) e gestora (atalhos acesos pela rota, conferência, interessados, tela de clientes recusada). Job **"Fluxos no Chromium (E2E)"** em `ci.yml`; `npm run e2e` localmente.
- `tests/servidor-memoria.mjs` passa a aceitar login de verdade pelo formulário (colunas que o login lê, hash bcrypt, `audit_log`), monta auth, calculadora e interessados, e aplica a guarda de páginas da plataforma na mesma ordem do `server.js`. Duas contas, senha `senha-bem-comprida`: destinadora e gestora da Casa Azul.
- A pasta `tests/` antiga (API + E2E de 2025) **saiu**: procurava "DestineAI", o "Circuito do Forró", `#daiNav` e uma página apagada; fazia login por CPF; e o CI nunca a executou. Cobertura de caminho era zero, e ninguém notava porque nada rodava.
- Os dois vermelhos da primeira rodada eram do teste, não do produto: o campo de IR tem máscara de centavos ("20000" vira R$ 200,00 — uma pessoa digita "2000000"), e o erro de login chega por toast, não por bloco fixo. O E2E passou a agir como uma pessoa nos dois. Conferido reintroduzindo um defeito no `tenant.js` (parar de preencher `data-projeto`): o E2E fica vermelho; restaurado, verde.
- **O primeiro vermelho do E2E no GitHub era do produto.** O cartão "Associação / ONG" da home — o que vende o white-label — aparecia no site do cliente. `tenant.js` escondia só pelo atributo `hidden`, e a classe `flex` do cartão vence `[hidden]` assim que o Tailwind carrega (mesma especificidade, vem depois). Localmente o CDN não responde e o defeito não aparece; no CI e em produção, sim. `tenant.js` passa a esconder por `style.display` em linha, que vence qualquer classe, e a limpar ao mostrar. Sem rede, o E2E dá ao Tailwind um dublê com as regras de display, para o mesmo defeito aparecer aqui também; `separacao-white-label.test.mjs` guarda o `style.display`.

### O projeto do piloto sai das páginas públicas (Raio-X, risco 11)
- "Orquestra das Periferias do DF" — o projeto fictício do piloto de maio — estava escrito à mão em cinco páginas públicas (`calculadora`, `como-funciona`, `faq`, `passo-a-passo`, `projetos-rouanet`) e no assistente de destinação. O PRONAC já vinha do cadastro; a narrativa, não: **no site da Casa Azul, `como-funciona.html` pedia apoio a um projeto que não era dela.**
- `tenant.js` passa a preencher `data-projeto="descricao"` (do cadastro; fora da simulação, o resumo ou os objetivos que o SALIC devolve) e `data-projeto="proponente"`, além de `titulo`, `pronac`, `area`, `segmento` e `uf`. O texto de reserva das marcações é neutro de propósito — reserva com nome de projeto é o mesmo defeito com outra roupa, e o teste recusa.
- `projetos-rouanet.html` vira uma página de projeto: título, área, UF, proponente e descrição vêm do tenant. Os cartões "Quem são / O que fazem" com a história do piloto deram lugar a "Quem propõe" (razão social, quem emite o Recibo) e à descrição cadastrada.
- As três fotos do projeto do piloto saíram (`assets/orquestra-*`). Não há campo de imagem no cadastro; até haver, o fundo é a paleta — a foto de um projeto no site de outro é o mesmo erro em imagem.
- A tela de clientes ganha "O que o projeto faz" (`org_projects.descricao`, coluna que já existia e nenhuma tela preenchia).
- No assistente, o mapa `segDesc` — texto do piloto, com "no Distrito Federal", aplicado a qualquer projeto orquestral — deu lugar à descrição do projeto.
- Do risco 11 como o Raio-X o listou, três itens já não existiam (barras duplas, Tailwind inline, CSS órfão) e dois são desenho (aviso legal copiado para valer sem JavaScript; 13 páginas sem barra são redirecionamentos e telas de e-mail). Sobram, para depois: E2E morto e seis formatadores de moeda.
- `backend/tests/projeto-do-tenant.test.mjs`.

### O CI passa a testar contra um Postgres de verdade
- A suíte roda em pg-mem, sem infraestrutura, e isso continua. Mas o pg-mem é tolerante onde o Postgres não é: em setembro um `WHERE email = $2` recebendo `[null, email]` passou verde e derrubou todo cadastro sem CPF em produção. Guardas de texto foram escritas depois — remendo. O único juiz do que o Postgres aceita é o Postgres.
- Job novo **"Postgres de verdade"** em `ci.yml`: sobe `postgres:16`, apaga o schema, aplica `schema.sql`, `seeds.sql`, a 003 legada e **todas** as migrations num banco vazio, confere que nada fica pendente e que o segundo boot não reaplica nada, e exercita cadastro sem CPF, e-mail repetido (409, não 500), CPF em uso e login contra o banco real. `backend/tests/postgres-real.test.mjs`, `npm run test:postgres`.
- Fora do `npm test`: sem `DATABASE_URL` é pulado com saída 0. E só aceita banco cujo nome termine em `_teste` ou `_test`, porque apaga o schema — apontar para produção por engano não pode custar o banco (recusa com saída 2, conferido).
- Conferido num Postgres 16.13 real: 9 de 9. Reintroduzido o defeito de setembro, 4 vermelhos com o mesmo "Erro interno ao registrar." de produção; restaurado, 9 verdes.
- `docs/operacao/ci-e-deploy.md` explica como rodar localmente com `docker compose`.

### Material comercial: só o que o código sustenta (Raio-X, risco 12)
- `docs/auditoria/afirmacoes-comerciais.md` confere cada afirmação de pitch, roteiro e página inicial contra o repositório. Sete eram falsas: "OAuth Gov.br ativo" (não há uma linha de código), "microsserviços" (um processo), "trilha imutável / append-only / SHA-256 por evento" (`audit_log` é tabela comum), "AES em repouso" (não há), "URL assinada com TTL" (é rota autenticada — mais restritivo), "segregação de PII" (mesma tabela), "laudo com assinatura digital" (o PDF é registro de operação; o documento fiscal é o Recibo de Mecenato).
- **Os números do piloto saíram da home** (NPS +64, 88% concluíram, 84% não sabiam) e os três depoimentos também. Não existe no repositório a planilha de onde teriam saído; um deles era a opção de múltipla escolha de um questionário — caixa marcada não é frase dita. Numa plataforma que fala de imposto, número que não se confere é passivo. Um teste impede que voltem sem `docs/piloto-fgv/resultados.md`.
- O roteiro de venda (`ROTEIRO_PITCH_ASJDF.md`) foi corrigido passagem a passagem, com o que existe no lugar do que não existe — e, onde o que existe é melhor (rota autenticada em vez de link com prazo), dizendo isso. O pitch da FGV é histórico: ganhou aviso no topo e deixa de ser material comercial. O guia do piloto marca o PRONAC 261847 como fictício.
- `VIRADA-PRODUCAO.md` atualizado: o PRONAC fictício já não está em código servido; o real entra pela tela de clientes.

### A lista de avisos ganha tela
- `interessados.html`: a lista de quem se cadastrou para receber avisos pelo site da organização, com a situação de cada pessoa (ativo, pendente, revogado) e exportação em CSV. Chega por atalho no dashboard, aceso pela própria rota — o mesmo padrão da conferência e da tela de clientes: a tela não guarda cópia da regra de permissão.
- Nome, órgão e e-mail vêm de um formulário aberto ao público; nunca entram em `innerHTML` sem escape, e o teste falha se entrarem. O CSV sai por fetch autenticado, porque link direto não leva o token.
- `noindex`: é tela de operação com dado pessoal de terceiros.

### A lista de avisos do cliente passa a ser legível
- `subscribers.organization_id` guarda quem captou cada inscrição desde a migration 027, e a decisão de setembro é que **a lista é do cliente**. Só que não existia rota que lesse a tabela: a lista era dele no banco e não era dele em lugar nenhum — promessa correta e não entregável.
- `GET /api/interessados/lista` (JSON, com resumo de ativos, pendentes e revogados) e `GET /api/interessados/lista.csv` (para planilha). Escopo sempre pela organização, conferido por `podeGerirOrganizacao` **depois** de o tenant ser resolvido — senão bastava trocar o `?org=` do endereço para ler a base de qualquer cliente.
- **`access_token` e `confirm_token` nunca saem.** Não são identificadores, são credenciais: o primeiro autentica o link de um clique que consulta, corrige e elimina os dados da pessoa, sem login. Exportar a lista com ele dentro entregaria, junto, a chave da conta de cada inscrito.
- Quem pediu eliminação não volta na lista; o telefone só sai de quem consentiu WhatsApp, porque foi só para isso que ele foi pedido; cada inscrito vem com a situação, senão quem exporta para disparar e-mail não distingue quem confirmou de quem nunca confirmou.
- **O CSV neutraliza fórmula.** Nome digitado num formulário aberto como `=HYPERLINK(...)` é executado pelo Excel e pelo Sheets ao abrir o arquivo. E leva BOM, senão o Excel no Windows abre "João" como "JoÃ£o".
- Exportação em lote entra no `audit_log` com quem, quantas linhas, quando e de onde. A leitura em tela não — um registro por abertura de tela transforma o log em ruído.
- `backend/tests/lista-interessados.test.mjs`.

### O fluxo das páginas, levantado dos links
- `docs/operacao/fluxo-das-paginas.md`: os quatro fluxos (destinador, gestor, superadmin, público), as páginas que só chegam por link de e-mail e os nove atalhos de endereço. Levantado lendo os links entre os arquivos, não a memória de quem escreveu.
- Resultado: **nenhuma página órfã de verdade** — as 34 estão em um dos grupos. E o dashboard é o eixo: é dele que gestor e superadmin alcançam as telas de operação, sempre com o acesso decidido pela rota, nunca por uma cópia da regra na tela.

### No site do cliente, quem responde pelos dados é o cliente
- Decisão: no site de um cliente white-label, **o cliente é o controlador e a IncentivaBR é operadora** (LGPD, art. 5º VI e VII). Isso não é rótulo de contrato — muda o que a página tem de dizer, e as páginas diziam errado. Registrado em `docs/juridico/papeis-lgpd.md`, com o que o anexo de operador precisa conter.
- **A Política de Privacidade não carregava o `tenant.js`.** Sob a marca do cliente, ela continuava afirmando que a controladora é a IncentivaBR — justamente o documento em que isso não pode estar errado.
- **O Encarregado divulgado passa a ser o do controlador** (art. 41 §1º). Era uma constante única da IncentivaBR: o titular do cliente era mandado reclamar com quem não responde por ele. Migration 041 dá `encarregado_nome` e `encarregado_email` à organização, e a tela de clientes preenche. Sem preenchimento, a página cai no contato da organização e depois no Encarregado da plataforma — nunca sem canal, mas `encarregado_completo: false` acusa, porque uma Política com o canal errado é um problema que não pode passar despercebido.
- `backend/src/lib/papeisLgpd.js` é a fonte única disso; `GET /api/config/brand` devolve em `privacidade`; `tenant.js` escreve nos `[data-privacidade]` por `textContent`. Nenhuma página nomeia controlador à mão.
- Nos **Termos**, três cláusulas estavam erradas na página do cliente: o serviço aparecia como prestado pela IncentivaBR; a propriedade intelectual dizia que a marca da plataforma é da IncentivaBR — ou seja, que a marca do cliente é dela; e as seções 5 e 6 faziam a IncentivaBR prometer e limitar responsabilidade perante um usuário que não é dela. **Cláusula que limita responsabilidade nomeando quem não presta o serviço não protege ninguém.** Os Termos passam a falar em `prestador` e `fornecedor`, não em controlador e operador: eles tratam de quem presta o serviço e de quem é a tecnologia, não de dados.
- A eleição de foro de Brasília/DF ficou restrita ao site da IncentivaBR. Eleger essa comarca na página de um cliente mandaria o usuário **dele** litigar onde nenhum dos dois está.
- `POLITICA_VERSAO` sobe para `2026-09`, e um teste falha se a versão do HTML divergir da constante — senão a prova do consentimento (art. 8º §2º) aponta para um documento que não existe.
- `docs/juridico/mapa-de-dados-pessoais.md`: o que o sistema coleta, onde fica, quem vê e para onde sai, levantado do código. Inclui o que ele **não** coleta e é conferível: a calculadora não grava nada, a TINA não recebe nome nem CPF, e as conversas não são gravadas.
- `backend/tests/papeis-lgpd.test.mjs`, e `backend/tests/apoio/dentroDe.mjs` para as guardas que precisam saber se um trecho está dentro de um bloco marcado.

### O `/diagnostico` diz se a portaria está fechada
- Com a portaria ligada, toda página responde 401 e o navegador abre a janela de senha. De fora é indistinguível de site fora do ar — e foi exatamente o que aconteceu: "por que o domínio caiu?" com o domínio de pé, fechado por senha. O `/diagnostico` dizia banco, migrations, armazenamento e e-mail, e não dizia isto; a resposta só dava para deduzir.
- Novo bloco `portaria` (`ligada`, `explicacao`) na parte **pública** da rota, de propósito: quem está trancado do lado de fora é justamente quem precisa da resposta. Não revela nada que o 401 já não entregue. A senha, nem o tamanho dela, nunca sai — o teste falha se saírem.
- Fica **fora** de `services`: o monitor de uptime reprova qualquer serviço com status `error`, e portaria fechada é o estado que pedimos, não defeito.
- `SITE_SENHA` é lida com `trim()`, então uma variável só com espaço liga nada: a pessoa preenche no painel, o site segue aberto e parece que a portaria quebrou. Agora o diagnóstico avisa.
- Casos novos em `backend/tests/portaria.test.mjs` e `backend/tests/diagnostico.test.mjs`.

### O que é da IncentivaBR não aparece no site do cliente
- A página inicial já trocava marca, cores e textos por tenant, mas três trechos continuavam falando pela IncentivaBR sob a marca do cliente: o cartão "Associação / ONG", que vende a plataforma white-label, e os números e depoimentos do piloto de maio de 2026. O cartão ofereceria ao público **dele** a tecnologia que ele já contratou; os depoimentos são de servidores do DF que usaram o piloto e, sob outra marca, passariam por depoimentos da base dele — o que não é verdade. Os três ganharam `data-so-plataforma`.
- `para-associacoes.html` é a carta de vendas do white-label inteira, e esconder o link não faz o endereço sumir. `backend/src/lib/paginasDaPlataforma.js` lista as páginas que só a plataforma mostra, e a guarda roda **entre** o middleware de tenant e o `express.static`: no domínio do cliente, o arquivo não chega a sair daqui. Depois do estático o bloqueio não valeria nada, e o teste falha se alguém mudar essa ordem.
- O redirecionamento leva o `?org=` junto. Sem isso, testar um cliente em desenvolvimento devolveria sempre a página da IncentivaBR e pareceria que o white-label não funciona.
- `docs/operacao/separacao-white-label.md` diz, página a página, o que é da plataforma, o que é do cliente e o que serve aos dois — e registra os três pontos que dependem de contrato, não de código: de quem é a lista de avisos, quem é controlador dos dados nos termos e na política de privacidade, e o registro INPI no rodapé.
- `backend/tests/separacao-white-label.test.mjs`.

### Portaria: o site inteiro atrás de uma senha enquanto não abre
- O endereço estava aberto a qualquer pessoa e sem `robots.txt`: o Google podia indexar uma plataforma que fala de imposto, ainda em modo simulação e sem o parecer do tributarista. `SITE_SENHA` no painel põe o site inteiro atrás de uma senha; vazia, nada muda e o site segue aberto.
- Ficam fora da portaria `/health` (é por ele que a Railway sabe que o processo subiu), `/diagnostico` (é o que o monitor de uptime lê) e `/robots.txt` (existe para os buscadores). Se qualquer um entrasse, o deploy seria marcado como falho, o monitor apitaria a cada 15 minutos, ou o bloqueio de indexação não seria lido.
- Depois de acertar a senha, um cookie sustenta a sessão por 30 dias. É o que faz a API continuar funcionando: as chamadas mandam `Authorization: Bearer <token>`, que substitui o cabeçalho da senha do site — sem o cookie, a pessoa entraria na página e toda chamada de dados seria recusada. O selo do cookie deriva da senha, então trocá-la invalida tudo que já foi entregue.
- `robots.txt` acompanha a portaria: fechada, `Disallow: /`; aberta, o arquivo some. Assim não sobra um bloqueio esquecido no dia da abertura.
- `backend/tests/portaria.test.mjs` e `docs/operacao/portaria.md`.

### Uma mensagem só no cadastro, e botão de e-mail legível
- Quem criava conta recebia **duas** mensagens na mesma hora: as boas-vindas e a confirmação do endereço, dizendo quase a mesma coisa. Viraram uma só, composta em `routes/auth.js`, onde nasce o link: a confirmação primeiro, porque é a ação, e o convite para calcular depois. `notifyWelcome` fica só com o WhatsApp; `sendWelcomeEmail` saiu.
- **O botão do e-mail de boas-vindas estava ilegível.** Ele era estilizado pela classe `.button` de um bloco `<style>`, e o Gmail descarta parte desse bloco: o fundo escuro chegava e a cor branca do texto não, deixando texto escuro sobre fundo escuro. Valia para **sete** mensagens, incluindo o convite de gestor e a confirmação de cadastro de interessado, onde o botão é a única saída.
- `botaoEmail()` passa a ser o único jeito de escrever botão de e-mail, com estilo direto na tag e a cor da organização. A regra `.button` saiu do template para não convidar à volta, e o teste falha se um `<a class="button">` reaparecer.
- `getEmailTemplate` e `getAppUrl` viraram exportados: as mensagens de conta são compostas em `routes/auth.js` e precisam da mesma moldura de marca das demais.

### Cadastro sem CPF, e a confirmação de e-mail ligada
- **O CPF sai da criação de conta** (migration 040: `users.cpf` deixa de ser `NOT NULL`; a restrição `UNIQUE` fica, e no Postgres ela admite vários `NULL`). Ele era obrigatório na primeira tela, antes de a pessoa entender o que a plataforma faz. Passa a ser pedido em `POST /api/donations/rouanet`, que é onde serve: vai no Recibo de Mecenato que o proponente emite. Pedir documento antes da hora é atrito e é guardar dado sem finalidade imediata.
- O assistente de destinação mostra o campo a quem ainda não informou e some depois da primeira vez. A rota valida o dígito verificador, recusa CPF que já esteja em outra conta — senão duas contas apontariam para o mesmo contribuinte e o teto de 6% seria conferido pela metade — e devolve `codigo` (`cpf_necessario`, `cpf_invalido`, `cpf_em_uso`) para a tela reabrir o campo em vez de mostrar um erro sem saída.
- **A confirmação de e-mail passa a ser enviada.** O token era gerado e guardado como hash desde sempre, mas o valor em claro era descartado na mesma linha: nenhuma mensagem saía e não existia página que a recebesse. Agora o e-mail sai no cadastro, `frontend/verificar-email.html` recebe o link, e `POST /api/auth/reenviar-verificacao` manda outro — trocando o token, então o link antigo para de valer. O painel avisa quem ainda não confirmou, com botão de reenviar.
- Confirmar não é exigido para entrar nem para destinar. É o que prova que a caixa é da pessoa, e é o que dá sentido à redefinição de senha; exigir travaria as contas que já existem.
- `backend/src/lib/cpf.js` passa a ser o único lugar da limpeza, validação e máscara de CPF no backend — estavam em `routes/auth.js` e `routes/admin.js`. O navegador mantém a própria cópia em `js/utils.js`, que não importa este arquivo porque as páginas não têm etapa de build.
- Corrigido de passagem: com e-mail repetido e nenhum CPF informado, a comparação antiga dava verdadeiro nos dois lados nulos e a tela dizia "CPF já cadastrado".
- A tela de entrar dizia "CPF ou Email". Conta nova nasce sem CPF, então quem digitasse o número caía em "credenciais inválidas" sem entender por quê — um beco sem saída para justamente quem tinha acabado de se cadastrar. O rótulo passa a falar em e-mail; o campo continua aceitando os dois, para quem já informou o CPF ao destinar.
- `backend/tests/cadastro-sem-cpf.test.mjs` e `backend/tests/cpf-na-destinacao.test.mjs`.

### Apagar conta de teste pela tela do superadmin
- CPF e e-mail são únicos, e não havia nenhum caminho no produto para desfazer um cadastro: quem estava experimentando a plataforma esbarrava em "CPF já cadastrado" na segunda tentativa e só sairia dali editando o banco à mão. `GET /api/admin/usuarios` (busca por e-mail, nome ou CPF, com ou sem pontuação) e `DELETE /api/admin/usuarios/:id`, com um cartão novo em `admin-clientes.html`.
- Uma conta de cada vez; não existe rota que limpe a tabela. Três travas: conta de super-administrador nunca é apagada, porque apagar a única tranca o sistema por fora; conta com destinação registrada só sai em modo simulação, onde a destinação é exercício — fora dele, comprovante e recibo são registro fiscal de alguém; e a listagem devolve o CPF mascarado, porque o superadmin precisa reconhecer a conta, não ler o documento.
- O `audit_log` guarda quem apagou, quando e de onde, sem o CPF. Ele sobrevive à exclusão: `users.id` entra nele com `ON DELETE SET NULL`.
- `backend/tests/limpar-contas.test.mjs`.

### A calculadora não estima mais o IR devido por atalho
- Enquanto a pessoa digitava o rendimento, `calculadora.html` mostrava um "limite estimado" a partir de **IR ≈ 18% dos rendimentos**. O atalho ignora a faixa isenta e a progressividade da tabela. Medido contra a conta real do backend, sem deduções:

  | rendimento no ano | limite real | o que a prévia dizia | erro |
  |---|---|---|---|
  | R$ 36.000 | R$ 43,26 | R$ 388,80 | +799% |
  | R$ 60.000 | R$ 338,77 | R$ 648,00 | +91% |
  | R$ 96.000 | R$ 932,77 | R$ 1.036,80 | +11% |
  | R$ 150.000 | R$ 1.823,77 | R$ 1.620,00 | −11% |
  | R$ 240.000 | R$ 3.308,77 | R$ 2.592,00 | −22% |

  O erro é maior justamente na faixa de renda da maior parte do público. A prévia a partir do rendimento saiu: o IR devido vem da tabela progressiva, que é do backend (`POST /api/calculator/ir`, no envio). A prévia do campo "IR devido" continua, porque ali é exata — 6% do que a pessoa digitou.
- O cálculo dos 6% em si estava correto e continua: incide sobre o **imposto devido apurado na declaração**, nunca sobre o rendimento; o percentual vem de `tetos_deducao`; e a organização pode reduzir o teto, nunca aumentá-lo. `backend/tests/calculadora.test.mjs` passa a guardar as três coisas, mais a faixa isenta, a progressividade e o fato de a tela não escrever percentual à mão.

### O aviso na tela não some mais, e o cadastro diz o que aconteceu
- **Causa raiz.** `js/utils.js` injetava um `.toast` antigo (estado base `opacity: 0`, à espera de um `.show`) que mirava o mesmo elemento do `js/toast.js` e vencia nas duas propriedades que este não declarava. Nas duas páginas que carregam os dois arquivos, `login.html` e `calculadora.html`, todo aviso aparecia durante os 0,3s da animação de entrada e sumia. Ninguém conseguia ler por que o cadastro ou o login tinha falhado. As classes do aviso de reserva passam a ter nome próprio (`aviso-simples`), e o `js/toast.js` declara o estado visível e preserva o quadro final da animação (`both`), para não voltar a depender do que outra folha de estilo disser.
- O aviso também trazia a largura somada ao recuo, e no celular a caixa passava da borda da tela levando o botão de fechar junto. `box-sizing: border-box` no próprio componente, que traz o próprio CSS e não deve depender do reset da página.
- `scripts/confere-paginas.mjs` (job do CI no Chromium) passa a mostrar um aviso em cada página e falhar se ele ficar invisível ou fora da área visível depois da animação.
- **Cadastro.** A resposta de sucesso mandava "verifique seu email para ativar a conta". O token de verificação é gerado e guardado como hash, mas o valor em claro não é enviado a ninguém e não existe página que o receba: a conta já entra pelo login. A mensagem passa a dizer isso.
- A entrada automática depois do cadastro falhava em silêncio: a conta estava criada, a pessoa voltava para a aba de entrar sem saber, tentava de novo e recebia "Email já cadastrado". Agora a tela diz que a conta foi criada, repete o motivo da falha e pede para entrar.
- `POST /api/auth/register` pedia a conexão FORA do `try`. Com o banco indisponível, a promessa do handler era rejeitada e o Express 4 não encaminha rejeição de função async para o tratador de erro: a requisição ficava sem resposta e a tela girava até o navegador desistir. Agora responde 500 em JSON.
- O limitador de tentativas vale para entrar e para criar conta, que dividem a mesma cota de 10 a cada 15 minutos, mas a mensagem falava só em login e mandava quem tentou se cadastrar procurar problema onde não estava.
- `backend/tests/cadastro-conta.test.mjs`.

### White label: a página inicial do cliente
- Um cliente white-label recebia a cor e a logo dele sobre o discurso da IncentivaBR. A migration 039 dá três textos à organização (frase principal, parágrafo, quem somos), editados na tela de clientes do superadmin e devolvidos por `GET /api/config/brand` em `textos`, junto com `slug` e `eh_plataforma`. `tenant.js` escreve cada um em `[data-tenant="…"]` por `textContent`, e mostra `[data-so-cliente]` só na página de um cliente. Em branco, a página fica com o texto da IncentivaBR.
- Na página do cliente, o projeto ativo dele vem no hero, com PRONAC e o botão "Destinar para este projeto" (`data-projeto`, `data-destinar`), e uma seção "Quem somos" com o e-mail de contato. O rodapé único ganha a linha "opera esta página com a tecnologia IncentivaBR".
- `PUT /api/admin/orgs/:id` aceita os três textos, corta no limite (160, 400 e 2.000 caracteres) e apaga com string vazia sem mexer nos outros campos. `backend/tests/textos-tenant.test.mjs`.
- Fica: domínio próprio por cliente é DNS e domínio na Railway (o middleware já resolve `custom_domain`); a logo do cliente ainda é gravada por `logo_url` na API, sem upload na tela.

### TINA: resposta em texto, sem tags na tela
- A persona mandava o modelo responder em HTML e o widget, desde o escape de HTML, mostra a resposta como texto: cada `<br>` e `<strong>` aparecia escrito. A persona passa a pedir texto simples com `**negrito**`, e o widget devolve só essa formatação depois de escapar.
- A TINA afirmava "não há risco", "milhões fazem" e o código 41 da DIRPF como certeza. "Zero risco" saiu da persona, de `faq.html` e de `guia-ir-servidor.html`; "milhões de brasileiros" saiu das duas páginas. Regras novas: nunca "não há risco" ou "100% seguro"; nunca citar adesão ou quantidade fora da base; código da DIRPF como "confira no programa do ano". `nucleo.md` regenerado; guardas em `prompt-tina.test.mjs`.

### Layout: a logo da barra não encolhe
- `tenant.js` trocava a logo horizontal da barra pela `logo_url` da organização, que para a IncentivaBR é a versão quadrada gravada pela migration 012: a logo abria grande e encolhia. A troca vale só para logo de cliente white-label.

### Layout único, parte 2: uma paleta (risco 11)
- Decisão: na tela, o azul primário é o navy #0F1E3D; o #273F77 do manual fica para logotipo e impresso (`brand/IDENTIDADE-VISUAL.md`).
- `frontend/js/tema.js` é o único lugar onde a paleta do Tailwind é definida. Os 14 blocos `tailwind.config` copiados de página em página, com quatro paletas diferentes, viraram uma linha de `<script>`. `navy` era #273F77 na página inicial e em `para-associacoes` e #0F1E3D nas outras doze.
- O acento (`gold`, `orange`) passa a sair de `--secondary-rgb`, que `tenant.js` escreve a partir da cor do cliente: `bg-gold/20` e `text-gold/80` agora seguem a cor do tenant, o que `var(--secondary-color)` direto não permitia.
- #273F77 trocado por #0F1E3D nas seis páginas de aplicação, no e-mail de redefinição de senha, no e-mail de boas-vindas, no PDF de registro e nos padrões de `config.js` e `admin.js`.
- O verificador de páginas do CI confere que a paleta de `tema.js` foi aplicada em toda página que usa o Tailwind.
- Fica: os seis formatadores de moeda copiados, que dependem de todas as páginas carregarem `utils.js`.

### Página órfã arquivada
- `impacto.html` não tinha nenhum link chegando nela; foi para `archive/paginas-2026/` e no lugar ficou um redirecionamento para a página inicial. Os outros sete endereços antigos já eram redirecionamentos e continuam. A agenda fiscal apontava para `projetos.html` (um redirecionamento) e passa a apontar direto para `projetos-rouanet.html`.

### Rouanet na frente (risco 12)
- O produto registra destinação só pela Lei Rouanet, mas quatro páginas prometiam "7 modalidades" e a persona da TINA se apresentava como assistente dos "7 mecanismos". Agora a página inicial, a calculadora, a biblioteca jurídica, o Espaço do Contador e a página de impacto dizem o que a plataforma faz: destinação pela Lei Rouanet, art. 18; as outras leis ficam como material de consulta, com aviso de que não há caminho de destinação para elas na plataforma. O card de Cultura na página inicial é marcado "Disponível na plataforma".
- A resposta "Posso cair na malha fina?" da página inicial deixava de dizer quem emite o recibo e afirmava que a plataforma "gera toda a documentação necessária"; corrigida.
- Persona da TINA (`chat.js`): plataforma de destinação pela Lei Rouanet; sobre as demais leis, explica em termos gerais e encaminha ao contador. `nucleo.md` regenerado.

### Layout único, parte 1: barra e rodapé (risco 11)
- `frontend/js/layout.js` passa a ser a única barra de navegação e o único rodapé das páginas públicas, com o CSS injetado por ele mesmo (antes o CSS das classes `dai-nav` não existia em lugar nenhum: nove páginas mostravam a barra copiada à mão e, por cima, uma segunda barra sem estilo). Menu de celular com gaveta, overlay e Escape. Links fixos: Calculadora, Projetos, Como funciona, Contadores, FAQ, Entrar (vira o nome de quem está logado) e "Destinar agora" (`data-destinar`, preenchido pelo tenant).
- Quinze páginas perderam o `<nav>` próprio e sete perderam o `<footer>` próprio; seis passaram a chamar `Layout.init` (`index`, `espaco-contador`, `biblioteca-juridica`, `validador`, `agenda-fiscal`, `para-associacoes`). A barra é `sticky`, então a primeira seção dessas páginas deixou de reservar espaço para uma barra fixa.
- Apagados `css/incentivabr-theme.css` (3.552 linhas, paleta teal/âmbar que nenhuma página carregava) e `js/mobile-menu.js` (nenhuma página carregava).
- O verificador de páginas do CI acusa mais de uma barra de navegação na mesma página.
- Fica para a parte 2: os 14 blocos `tailwind.config` copiados, a decisão entre o azul do manual (#273F77) e o navy que as páginas usam (#0F1E3D), e os seis formatadores de moeda.

### Fonte única dos textos fiscais (risco 04)
- `backend/src/lib/textosFiscais.js` monta um objeto só com teto (de `tetos_deducao`), mecanismos e qual teto cada um divide (`incentive_groups`), ficha e códigos da DIRPF, quem emite o Recibo de Mecenato e em quanto tempo (`organizations.mecenato_prazo_dias`), art. 18/26, prazo de guarda e o aviso. `GET /api/config/brand` devolve em `fiscal`; a TINA recebe o resumo em texto no bloco do tenant do prompt.
- `tenant.js` preenche todo `[data-fiscal="…"]` com esse objeto. As páginas deixaram de escrever o percentual à mão: os 76 "6%" em 15 páginas viraram `<span data-fiscal="teto_pct">6%</span>`, com o valor de hoje como reserva. Sete páginas passaram a carregar `tenant.js`.
- Contradições resolvidas pela leitura adotada (migration 031): "até 7% do IR" na calculadora, "7% — o maior entre todas" no Espaço do Contador e na Biblioteca, "3%" do Fundo do Idoso, `0.07` no validador. Ficha DIRPF: a Rouanet e o Fundo do Idoso tinham o mesmo código 41; agora cultura 41, ECA 40, idoso 44, desporto 43, audiovisual 42, marcados como **não confirmados em fonte primária** (os sites da Receita não eram alcançáveis deste ambiente). Prazo do recibo: "15 dias legais" e "60 dias" viraram o prazo declarado pelo proponente. `guia-ir-servidor` dizia que a IncentivaBR emite o recibo.
- `nucleo.md` regenerado pelo script de sync, que estava atrasado desde a Onda 0: saem a conta bancária antiga (três vezes) e o "IncentivaBR emite".
- `backend/tests/textos-fiscais.test.mjs`: objeto do banco, resumo no prompt, `fiscal` na rota, e três guardas sobre as páginas (nenhum "6%" fora de `data-fiscal`, nenhum "7% do IR", `tenant.js` onde há `data-fiscal`).

### Escape de HTML e Content-Security-Policy (risco 05)
- Todo texto que vem de fora e vira HTML passa por escape: resposta da TINA e pergunta digitada (`js/tina.js`), título e status da destinação e mensagens de erro (`dashboard.html`), dados do projeto vindos do SALIC (`destinar-rouanet.html`), nome de cliente e e-mail de convidado (`admin-clientes.html`), dados do titular (`minhas-preferencias.html`), título e mensagem dos toasts (`js/toast.js`, `js/utils.js`). `conferencia.html` e `projetos-rouanet.html` já escapavam.
- `server.js` liga a Content-Security-Policy do helmet: script só da própria origem, do Tailwind Play CDN e do cdnjs; estilo e fonte do Google Fonts e do cdnjs; imagem de qualquer https (logo de tenant); `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`. `'unsafe-inline'` em script continua necessário porque as páginas têm script embutido e `onclick`. Conferido no Chromium, página a página, sem violação.
- `backend/tests/csp.test.mjs` garante o cabeçalho e as origens.

### Segurança de conta (risco 05)
- O JWT deixa de carregar o CPF. Leva só `userId`, `orgId`, `orgSlug` e os papéis; ninguém no backend lia o CPF do token, e o payload é legível por qualquer um que tenha o token.
- Tokens de redefinição de senha e de verificação de e-mail entram no banco como SHA-256 (`backend/src/lib/tokens.js`, o mesmo mecanismo dos convites). O valor em claro só existe no e-mail. Migration 038 anula os que existiam em claro.
- O fluxo "Esqueceu sua senha?" passa a funcionar de ponta a ponta: antes o botão mandava escrever para o contato, e o e-mail apontava para uma página que não existia. Agora `login.html` pede o e-mail, o servidor envia o link e `redefinir-senha.html` grava a senha nova. Resposta igual exista ou não a conta.
- `backend/tests/redefinicao-senha.test.mjs`: hash no banco, claro no e-mail, o hash roubado não redefine, uso único, expiração, JWT sem CPF, migration 038.

### Alterado
- Dependências do backend sem vulnerabilidade conhecida (`npm audit`: 7 → 0). `multer` 2.1.1 → 2.3.0, `nodemailer` 8 → 10 (só o Ethereal de desenvolvimento usa; produção é Resend), `form-data`, `ip-address`, `brace-expansion`, `body-parser` nas versões corrigidas; `qs` fixado em `^6.16.0` por `overrides`, porque o Express 4 prende em `~6.14.0`. Suíte completa verde. Os alertas restantes do Dependabot são de `archive/`, que não é servido.

---

## [Não lançado] — 2026-09-07 — Onda 1 do Raio-X: fundações (PRs #7 a #12)

### Adicionado
- `.github/workflows/ci.yml` — testes do backend a cada push e PR (check "Testes do backend").
- `.github/workflows/backup.yml` e `scripts/backup-postgres.sh` — dump diário cifrado (gpg) para o bucket, retenção de 30 dias; `scripts/restaurar-postgres.sh` com conferência de contagens. Restore executado e registrado em `docs/operacao/backup-restore.md`.
- `.github/workflows/uptime.yml` — `/health` e `/diagnostico` a cada 15 minutos; falha vira e-mail do GitHub.
- `backend/src/services/armazenamento.js` — object storage S3-compatível (R2 recomendado) com fallback local; `lib/validaArquivo.js` decide o tipo pelos primeiros bytes; `lib/recebeArquivo.js` e `lib/entregaArquivo.js`. Migration 037 (`receipt_sha256`, `mecenato_sha256`). `backend/scripts/migrar-uploads-para-storage.mjs`.
- `backup.yml` instala o cliente Postgres na versão do servidor (a Railway está no 18; o runner trazia o 16 e o `pg_dump` abortava por "server version mismatch"). `backup-postgres.sh` grava o `.sha256` em disco antes de enviar (a `aws cli` recusa pipes). Primeiro backup de produção no bucket em 7 de setembro de 2026.
- Sonda do armazenamento na subida: o servidor grava um arquivo em `_diagnostico/`, lê de volta, confere o SHA-256 e apaga. Chave errada, endpoint com o nome do bucket ou token sem escrita viram `armazenamento: error` no `/diagnostico` (campos `verificado` e `verificado_em`) e linha vermelha no log, sem esperar o primeiro upload de um servidor.
- Migration 036 (`users.updated_at`): `PUT /api/auth/profile` respondia 500.
- Testes: `migracoes`, `teto-registro`, `armazenamento`, `uploads-http`; garantias novas em `modo-texto` e `conferencia-http`.
- Documentos: `docs/operacao/ci-e-deploy.md`, `armazenamento.md`, `backup-restore.md`.

### Alterado
- `backend/src/config/migrate.js` — schema, seeds e a 003 legada só em banco vazio; transação por migration com registro no `migrations_log`; a primeira falha aborta o boot (na Railway, o deploy anterior continua no ar). `PERMITE_BOOT_SEM_MIGRACOES=true` é a saída de emergência. Migrations rodam antes do `listen`.
- `POST /api/donations/rouanet` — advisory lock por contribuinte, IR devido fixado por ano no menor valor registrado, `saldoDisponivel` dentro da transação, mensagens com o percentual vindo de `tetos_deducao`, bloco `saldo` na resposta. A regra vale também em simulação. `tetosVigentes`/`tetoDoMecanismo`/`saldoDisponivel` aceitam a conexão da transação (evita esgotar o pool sob concorrência).
- Upload de comprovante e de recibo: em memória, tipo pelo conteúdo, erros do multer viram 400, download por stream. `receipt_url` e `mecenato_url` guardam a chave no bucket; valores antigos continuam lidos.
- `destinar-rouanet.html` — sem jsPDF; botão chama o PDF do servidor; texto do PDF nos dois modos; "Ir para meu painel"; mensagens com o nome do projeto vindo do servidor; card de impacto do piloto removido; placeholders `[data-projeto]` preenchidos.
- Confirmação (e simulação) avisa o destinador por e-mail (`notifyDestinationConfirmed`).

### Depende de configuração no painel
- Railway: "Wait for CI"; GitHub: proteção do `main` com o check. Bucket R2 e cinco variáveis `S3_*`. Seis segredos do backup no GitHub. Monitor externo em `/health`.

---

## [Não lançado] — 2026-09 — Onda 0 do Raio-X: para de sangrar

### Removido
- Blocos com conta bancária (Ag. 1419-2 / Conta 36.068-6 / FNC) de `como-funciona.html`, `faq.html` e `passo-a-passo.html`. No lugar, aviso: os dados bancários aparecem na etapa de pagamento, vindos do cadastro do projeto.
- Admin de teste do `seeds.sql` (recriado a cada boot) e conta demo do piloto FGV. Migration 035 apaga as duas do banco, ou só desativa quando há destinação vinculada.
- Fallback do `login.html` que fabricava sessão quando a API falhava, e o modo `?demo=true`.
- Seção de mecanismos, limites e percentuais do `SYSTEM_PROMPT` da TINA ("7% independente", "até 13%") e métricas internas sem fonte ("88%", "NPS +64"). O `nucleo.md` é a única fonte de percentuais.

### Alterado
- Migration 034 zera `bank_*`/`pix_*` da organização `www` e desativa o PRONAC fictício 261847.
- `POST /api/donations/rouanet` exige projeto ativo com conta de captação preenchida fora da simulação; responde 409 com mensagem clara e não grava. Não há mais fallback para conta da organização nem para "Banco do Brasil / 001 / —" escritos no código.
- `GET /api/salic/org-project` usa só `org_projects` como fonte de dados bancários, inclusive no fallback sem SALIC.
- CTA "Criar Conta Grátis" da calculadora aponta para `login.html?tab=register&redirect=destinar-rouanet.html` (antes, `cadastro.html`, inexistente).

### Adicionado
- `backend/tests/prompt-tina.test.mjs` — falha se o prompt final contiver "13%" ou "independente da Rouanet".
- `backend/tests/conta-captacao.test.mjs` — cobre a recusa sem conta, a resposta sem fallback e a migration 034.

---

## [1.3.1] — 2026-05-16 — Piloto FGV: piloto-start.html + demo account

### Adicionado
- `frontend/piloto-start.html` — landing page do piloto com fluxo 3 etapas
- `backend/src/migrations/024_demo_user_piloto.sql` — conta demo compartilhada do piloto (removida pela migration 035, set/2026)
- OG tags no piloto-start.html para preview rico no WhatsApp
- Trust block (nenhum dado bancário / FGV / anônimo)
- Demo auto-login via `?demo=true` em login.html (MAR15)

### Alterado
- `frontend/login.html` — banner piloto + auto-preenchimento demo
- `frontend/piloto.html` — CTAs direcionam para destinar-rouanet.html diretamente
- `docs/piloto-fgv/mensagens-whatsapp-piloto.md` — 5 versões com URL www + data limite 15/jun
- Copy headline: "Você sabia que parte do seu IR descontado do seu salário..."

---

## [1.3.0] — 2026-04-30 — Piloto FGV: Campanha Cadeira 47
### Contexto
Substituição do projeto Circuito do Forró (PRONAC 252026) pelo projeto piloto
**Orquestra das Periferias do DF** (PRONAC 261847 — fictício, SIMULATION_MODE=true).
Objetivo: validar H1/H2 da pesquisa FGV (usabilidade e intenção de destinação).
Decisão estratégica: somente projetos Art. 18 (FNC, 100% dedutível) — nunca Art. 26 (80%).

### Adicionado
- `backend/src/migrations/022_orquestra_periferias.sql` — troca PRONAC + dados do projeto em `organizations` e `org_projects` (slug='www')
- `frontend/index.html` — reescrita completa com tema "Cadeira 47":
  - Hero: "A Cadeira 47 está esperando." (placeholder `assets/orquestra-hero.webp`)
  - Grid de 40 cadeiras CSS (7 pré-apoiadas: 3,7,12,18,23,31,36)
  - Seção 3 Atos: O Início / O Processo / A Visão
  - Credibilidade: Baccarelli (R$3,49 SROI/IDIS 2023) e Orquestra Jovem de Goiás
  - Contador live: 7/40 cadeiras apoiadas
  - CTA: "Você não sabe ainda quem vai sentar na Cadeira 47."
- `frontend/projeto-detalhes.html` — seções especiais para PRONAC 261847:
  - `DEMO_PROJETOS` dict: dados estáticos (não consulta SALIC para PRONAC fictício)
  - Seção "A Cadeira 47" com grid escuro de 40 cadeiras
  - Narrativa 3 Atos inline
  - Comparativo Art. 18 vs Art. 26 (verde/vermelho)
  - Sidebar: "Reserve uma cadeira" em vez de "Destine seu IR"
  - CTA final contextual para a Orquestra

### Projeto piloto — Orquestra das Periferias do DF
- **PRONAC:** 261847 (fictício para simulação FGV)
- **Proponente:** Associação Cultural Orquestra das Periferias do DF
- **CNPJ:** 47.832.156/0001-93
- **Banco:** Banco do Brasil — Ag. 3217-4 / Conta 48.291-5
- **Artigo:** Art. 18 — FNC — Música Erudita — 100% dedutível
- **Meta:** R$ 520.000 / Captado demo: R$ 91.000 (17,5%)
- **Público:** 80 jovens de 14–24 anos — Ceilândia, Samambaia, Santa Maria
- **Atividades:** ensaios semanais, 6 concertos públicos, gravação audiovisual

### Decisões estratégicas registradas
- Cadeira 47 = vaga anônima (nenhum menor nomeado — evita LGPD + risco de não entrega)
- Após piloto: `DELETE FROM donations WHERE status = 'test_simulated'`
- Trocar PRONAC = 5 min (arquitetura parametrizada por URL `?pronac=X`)
- IncentivaBR = marca mãe; DestineAI = showroom is_demo=true da Lei Rouanet

### Pendente
- Atualizar `destinar-rouanet.html` (wizard ainda referencia PRONAC 252026)
- Imagens da Orquestra para Nano criar: `assets/orquestra-hero.webp` e `assets/orquestra-card.webp`
- Corrigir 9% → 8% em `para-contadores.html` e demais arquivos

---

## [1.0.0] — 2026-03-10
### Origem
Fork white-label do repositório `casdfteste/incentivaBR-GDF`.
Extraídos apenas os módulos referentes à Lei Rouanet (Lei 8.313/1991).

### Incluído
- Proxy SALIC com cache TTL (áreas, segmentos, projetos, org-project)
- Wizard `destinar-rouanet.html` — 6 steps: projeto → calculadora → valor → pagamento → comprovante → confirmação
- Página `projetos-rouanet.html` com filtros ao vivo
- Migrations `008_rouanet.sql` e `009_rouanet_tenant.sql`
- Calculator com `case 'rouanet'` (6% IR devido)
- `POST /api/donations/rouanet` com validação de limite
- `GET /api/salic/org-project` com fallback offline
- `docker-compose.yml` para ambiente de desenvolvimento
- White-label parametrizável via `.env`

### Removido (específico GDF)
- `admin.html`, `painel-organizacao.html`, `clube-vantagens.html`
- `para-organizacoes.html`, `para-contadores.html`
- Rotas: `funds.js`, `orgDashboard.js`, `admin.js`
- Referências a FDI/DF e FDCA/DF
