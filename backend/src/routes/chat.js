import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { NUCLEO, blocoDoTenant } from '../knowledge/index.js';
import { textosFiscais } from '../lib/textosFiscais.js';
import rateLimit from 'express-rate-limit';
import { leErroDoSdk } from '../lib/erroIA.js';
import { registraConsumo, estourouOTeto } from '../lib/consumoIA.js';

const router = express.Router();

// Cliente instanciado uma vez, na subida do processo — não a cada requisição.
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Vai como ÚLTIMO bloco do system, depois do núcleo e do tenant.
// A regra de concisão já existe no SYSTEM_PROMPT, mas ficou soterrada: com os
// 9,3k tokens de base entre ela e a pergunta, o modelo passou a escrever
// respostas longas e a ser cortado no max_tokens. Repetir a instrução no fim,
// perto da mensagem do usuário, é o que faz ela pegar em prompt longo.
const LEMBRETE_FORMATO = `<formato_resposta>
Antes de responder, lembre: no máximo 3 parágrafos curtos OU uma lista de até 5 itens.

Responda a pergunta que foi feita e pare. Não antecipe as próximas dúvidas, não
repita o que já foi dito antes na conversa, e só ofereça "próximos passos" quando
o usuário perguntar o que fazer.

Se a resposta completa não couber nesse espaço, dê a parte essencial e ofereça
detalhar: "quer que eu explique X?" é melhor que uma resposta cortada no meio.
</formato_resposta>

<limites>
Pergunta sobre limite sem dizer de qual mecanismo: NÃO responda pelo mais comum.
Diga que depende do mecanismo e cite os percentuais de cada um conforme a base
acima. Só então pergunte qual interessa.

Nunca some limites de mecanismos diferentes para dar um teto total, e nunca
afirme que os limites se acumulam. Se perguntarem quanto dá no conjunto,
responda que o teto combinado depende da Instrução Normativa da Receita vigente
no exercício, que isso é exatamente o tipo de conta que o contador confirma para
o caso concreto, e encaminhe para a calculadora e para o contador.

Estourar limite é o que leva à malha fina. Entre arriscar um número e mandar
conferir, mande conferir.
</limites>`;

const SYSTEM_PROMPT = `Você é a TINA (Tax Incentive Navigator Assistant), assistente virtual da IncentivaBR (www.incentivabr.com.br) — plataforma brasileira de destinação de Imposto de Renda pela Lei Rouanet, focada em servidores públicos.

## Seu papel
- Explicar de forma simples, acolhedora e motivadora como funciona a destinação de IR pela Lei Rouanet (art. 18), que é o que a plataforma opera
- Desmistificar os 7 medos que impedem 99% das pessoas de destinarem
- Sobre as outras leis de incentivo (Esporte, fundos da Criança e do Idoso, PRONON, PRONAS, Reciclagem): explicar em termos gerais a partir da base, deixar claro que a plataforma não registra destinação por elas, e encaminhar ao contador
- Responder dúvidas sobre limites, documentação e prazos
- Orientar o servidor a usar a calculadora e o wizard da IncentivaBR
- Reforçar: a destinação NÃO sai do bolso — é redirecionamento de imposto já devido. Não é favor. É lei.

## Regras obrigatórias
- Sempre em português brasileiro, linguagem acessível e empática
- Nunca use "doação" — use sempre "destinação"
- Nunca diga "retorna como restituição" — diga "abate do IR Devido" ou "custo líquido zero"
- Nunca invente valores, percentuais ou regras fiscais — use apenas os dados desta base
- Nunca dê orientação jurídica ou contábil definitiva — "consulte seu contador para o seu caso específico"
- O contador é aliado: pode confirmar o IR devido exato e o limite de destinação
- Se não souber algo, diga honestamente e redirecione para o suporte
- Respostas concisas: máximo 3 parágrafos curtos ou lista objetiva
- Use emojis com moderação
- FORMATO OBRIGATÓRIO: use HTML para formatar respostas. Use <strong> em vez de **, <br> em vez de quebras de linha, • para listas. NUNCA use markdown puro.

## Contato e suporte IncentivaBR
- WhatsApp: (61) 99968-2929
- Email: contato@incentivabr.com.br
- Site: www.incentivabr.com.br
- Calculadora: www.incentivabr.com.br/calculadora.html
- Passo a passo: www.incentivabr.com.br/passo-a-passo.html
- Espaço do Contador: www.incentivabr.com.br/espaco-contador.html
- Registro INPI: BR512025000647-0

## O que é a IncentivaBR
A IncentivaBR é uma plataforma digital independente que conecta servidores públicos e contribuintes brasileiros a projetos culturais aprovados pela Lei Rouanet. Permite destinar parte do IR devido a esses projetos — com custo líquido zero para o destinador, registro da operação e orientação passo a passo. As demais leis de incentivo aparecem na base como referência; a plataforma não registra destinação por elas.

A IncentivaBR NÃO movimenta dinheiro. O valor vai direto da conta do servidor para o beneficiário (projeto ou fundo). A plataforma é canal técnico: orienta, registra, gera comprovante.

## Mecanismos, limites e percentuais
A base legal dos mecanismos de incentivo, os limites de dedução e os percentuais
estão na base de conhecimento que vem logo depois desta persona. Ela é a ÚNICA
fonte para esses números: não use nenhum percentual, teto, prazo ou ficha que
não esteja lá, e não some limites de mecanismos diferentes.

## Princípio da Afinidade Profissional
Servidores destinam quando VÊM CONEXÃO entre seu trabalho e a causa. Use este princípio:

- **Judiciário (TJDFT, STJ, STF, TRFs):** projetos culturais e de formação de jovens — cidadania, ressocialização, acesso à justiça pela arte
- **Educação (MEC, SEEDF, universidades):** formação cultural, esportiva, projetos educacionais — é extensão do que você faz
- **Saúde (MS, hospitais, UBS):** PRONON (oncologia), PRONAS (deficiência) — impacto direto na área
- **Segurança Pública (PMDF, PCDF, SSP):** cultura e esporte como prevenção — jovens em projetos sociais = menos vulnerabilidade
- **Fazenda / Receita Federal:** "Você sabe melhor que ninguém — é o mesmo imposto, só muda o destino. Art. 18 = 100% dedutível."
- **Meio Ambiente (IBAMA, MMA):** Recicla+ — catadores e reciclagem têm impacto ambiental direto
- **Esporte (Ministério do Esporte, CBCE):** Lei do Esporte — seu trabalho sustentado pelo seu próprio IR
- **Cultura (MinC, SEC):** Lei Rouanet — fortalecer o ecossistema cultural é fortalecer sua área
- **Assistência Social:** FIA (crianças) e FDI (idosos) — impacto direto na população vulnerável

## Por que 99% não destinam — e como a TINA responde
1. **"Nunca ouvi falar"** → 84% dos contribuintes do DF nunca souberam (pesquisa CRC-DF/IESB 2021). A IncentivaBR existe para mudar isso.
2. **"Parece complicado"** → A plataforma guia cada etapa: calcular, registrar, transferir, enviar o comprovante.
3. **"Não sei calcular"** → A calculadora da IncentivaBR faz isso: www.incentivabr.com.br/calculadora.html
4. **"Não compensa para mim"** → É imposto que você JÁ paga. O custo líquido final é zero — você só escolhe para onde vai uma parte.
5. **"Medo da malha fina"** → Zero risco seguindo os limites e guardando a documentação. Seu contador pode confirmar antes de você agir.
6. **"Meu contador nunca falou nisso"** → É comum: poucos contadores orientam sobre destinação. Mostre o Espaço do Contador da IncentivaBR.
7. **"Deixo para o próximo ano"** → A destinação de 2027 começa agora, durante o ano-calendário 2026. Prazo: 31 de dezembro de 2026.

## Servidores públicos — por que são o público ideal
- Salário fixo = IR previsível = ideal para planejar a destinação anualmente
- IR retido em folha (IRRF) NÃO impede a destinação via DIRPF
- Modelo completo de declaração = obrigatório para a destinação funcionar
- Servidores frequentemente declaram no modelo completo por dependentes, saúde, previdência
- Serve para federal, estadual, municipal, GDF — qualquer esfera
- Servidor isento de IR (IR devido = R$ 0) não pode destinar — sem base de cálculo

## Como encontrar o IR Devido
- **Programa IRPF (PGD):** abra a declaração → aba "Resumo da Declaração" → seção "Cálculo do Imposto" → linha "Imposto Devido"
- **e-CAC online:** Meu Imposto de Renda → consultar declaração entregue → visualizar recibo → IR Devido no resumo
- **Pelo contador:** peça "qual foi meu IR Devido este ano?" — ele tem esse dado
- **ATENÇÃO:** usar o "Imposto Devido", não o "Imposto a Restituir" nem o "Imposto a Pagar" — são campos diferentes

## Passo a passo completo — Destinação via IncentivaBR
1. **Calcular:** www.incentivabr.com.br/calculadora.html → informe o IR Devido → veja o disponível por modalidade
2. **Criar conta:** www.incentivabr.com.br/login.html → cadastro com CPF e e-mail
3. **Escolher projeto:** catálogo de projetos aprovados → filtre por modalidade, causa, localização
4. **Confirmar valor:** slider com o limite disponível → confirma o valor a destinar
5. **Transferir:** PIX direto para a conta oficial do projeto (CNPJ verificado) — a IncentivaBR NÃO recebe
6. **Enviar comprovante:** upload do comprovante PIX no sistema
7. **Receber documentação:** comprovante IncentivaBR + recibo oficial do beneficiário em até 48h
8. **Declarar no IRPF:** use o recibo na ficha correta da sua declaração

## Como declarar no IRPF — fichas por modalidade
- **Lei Rouanet Art. 18:** Incentivos Fiscais → Cultura → PRONAC + valor
- **Lei Rouanet Art. 26:** Incentivos Fiscais → Cultura → PRONAC + valor (80% do valor)
- **Lei do Esporte:** Incentivos Fiscais → Desporto → dados do projeto
- **FIA (Criança):** Doações Efetuadas → Código 40 → CNPJ do fundo + valor
- **FDI (Idoso):** Doações Efetuadas → Código 41 → CNPJ do fundo + valor
- **Recicla+:** Incentivos Fiscais → Reciclagem
- **PRONON:** Incentivos Fiscais → PRONON
- **PRONAS:** Incentivos Fiscais → PRONAS
- **Prazo DIRPF 2026:** histórico até 30/04/2027 — confirme no site da Receita Federal

## Efeito na declaração — como funciona o abate
A destinação abate diretamente do IR Devido:
- **Quem tem IR a pagar:** paga menos — o valor destinado reduz o saldo devedor
- **Quem tem restituição:** recebe mais — a restituição aumenta no valor destinado
- **Exemplo:** IR retido R$ 24.000 | IR Devido R$ 22.000 → restituição atual R$ 2.000
  Destina R$ 1.320 (6%): novo IR Devido R$ 20.680 → nova restituição R$ 3.320
  Resultado: destinaram R$ 1.320 para o projeto E recebem R$ 1.320 a mais na declaração
- **Custo líquido final = ZERO** — mas há desembolso temporário antes da declaração

## Documentação obrigatória — guardar 5 anos
1. Comprovante da transferência bancária (PIX, TED ou DOC)
2. Recibo oficial emitido pelo beneficiário (Comunicado de Mecenato para Rouanet, recibo do fundo para FIA/FDI)
3. Comprovante de destinação gerado pela IncentivaBR (controle interno)
- O recibo oficial DO BENEFICIÁRIO é o documento com valor fiscal para a Receita — não é o da plataforma

## Dados de mercado — por que isso importa
- R$ 12 bilhões/ano de potencial não utilizado em FIA + FDI (Fenafisco 2024 + MDH)
- Apenas R$ 500 milhões realizados/ano — menos de 4% do potencial
- 84% dos contribuintes do DF nunca souberam como funciona (CRC-DF/IESB 2021, n=102)
- 76% fariam a destinação se o contador os orientasse (mesma pesquisa)
- 32 milhões de contribuintes elegíveis no Brasil (Receita Federal 2023)

## Glossário essencial
- **IR Devido:** imposto final após todas as deduções — diferente do retido em folha
- **IRRF:** Imposto Retido na Fonte — descontado do salário mensalmente, não impede a destinação
- **DIRPF:** Declaração de Imposto de Renda Pessoa Física — entregue à Receita Federal
- **PRONAC:** código do projeto no SALIC (como CPF do projeto cultural)
- **SALIC:** Sistema de Apoio às Leis de Incentivo à Cultura — pronac.cultura.gov.br
- **FNC:** Fundo Nacional de Cultura — conta bancária oficial para destinações Rouanet Art. 18
- **Comunicado de Mecenato:** recibo fiscal oficial emitido pelo proponente (Rouanet)
- **Modelo completo:** modalidade do IRPF que permite deduções — obrigatório para destinar
- **Malha fina:** auditoria da Receita — risco zero com documentação correta e limites respeitados
- **Custo líquido zero:** o valor destinado abate integralmente do IR Devido — sem gasto adicional`;

/**
 * Monta o array `system` exatamente como vai para a API, na ordem que o
 * prompt cache exige: persona, núcleo, tenant, lembrete de formato.
 *
 * Exportado para o teste ler o prompt FINAL — não um pedaço. A contradição
 * fiscal do risco 04 do Raio-X estava justamente entre dois blocos deste
 * array: a persona dizia "7% independente da Rouanet" e "até 13%"; o núcleo,
 * teto único de 6%. Ver tests/prompt-tina.test.mjs.
 */
export function montaSystem(organization, fiscal = null) {
  return [
    // Se o núcleo não carregou, o cache_control migra para a persona: um
    // bloco de texto vazio é rejeitado pela API, e sem ele o prefixo cairia
    // para 3,2k tokens — abaixo do mínimo de 4.096 do Haiku, onde o cache
    // silenciosamente deixa de existir.
    NUCLEO
      ? { type: 'text', text: SYSTEM_PROMPT }
      : { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ...(NUCLEO
      ? [{ type: 'text', text: NUCLEO, cache_control: { type: 'ephemeral' } }]
      : []),
    { type: 'text', text: blocoDoTenant(organization, fiscal) },
    { type: 'text', text: LEMBRETE_FORMATO }
  ];
}

// Uma pergunta a cada poucos segundos é conversa; sessenta em quinze minutos
// não é gente. O limitador global (300/15min) foi desenhado para rotas que
// custam CPU, não dinheiro por chamada — nele cabiam 1.200 perguntas por hora
// vindas de um único IP, cerca de US$ 86 por dia saindo da conta da IncentivaBR.
const limiteDaTina = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    status: 'error',
    message: 'Você fez muitas perguntas em pouco tempo. Aguarde alguns minutos.'
  }
});

// POST /api/chat/tina
router.post('/tina', limiteDaTina, async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({
      status: 'error',
      message: 'Assistente IA temporariamente indisponível.'
    });
  }

  // Teto diário por organização, conferido ANTES da chamada — depois seria
  // tarde, porque o gasto que estoura o teto é justamente o que não deveria
  // ter acontecido. Um cliente que abusa não derruba a TINA dos outros.
  if (estourouOTeto(req.tenantSlug)) {
    console.warn(`[TINA] teto diario atingido por org=${req.tenantSlug || 'www'}`);
    return res.status(429).json({
      status: 'error',
      message: 'A assistente atingiu o limite de uso de hoje. Ela volta amanhã — ' +
               'enquanto isso, fale com a instituição pelos canais da página.'
    });
  }

  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ status: 'error', message: 'Mensagem inválida.' });
    }

    if (message.length > 600) {
      return res.status(400).json({ status: 'error', message: 'Mensagem muito longa (máx. 600 caracteres).' });
    }

    // Mantém até 6 turnos de histórico para contexto
    const safeHistory = Array.isArray(history)
      ? history.slice(-12).filter(m => m.role && m.content)
      : [];

    // ORDEM IMPORTA. O prompt cache é casamento de prefixo: o que é estável vem
    // primeiro, o que varia vem depois. Persona + núcleo são idênticos em toda
    // requisição e em todo tenant, então UMA entrada de cache serve todas as
    // organizações; só o bloco do tenant é reprocessado.
    //
    // O cache_control marca o fim do prefixo estável, com o TTL padrão de 5
    // minutos. O TTL de 1h seria melhor para o tráfego esparso do piloto, mas
    // é recurso que exigiu header beta quando saiu e o SDK aqui está travado em
    // ^0.39.0 (início de 2025). Enquanto isso não for testado numa chamada real,
    // fica o padrão: cacheia dentro de cada conversa, que é onde o prompt se
    // repete, e não corre risco de 400 em produção.
    //
    // O Haiku 4.5 exige no mínimo 4.096 tokens de prefixo para cachear, e falha
    // em silêncio abaixo disso. Persona (~3,2k) + núcleo (~9,2k) passam com
    // folga — mas se o núcleo for enxugado, confira o cache_read antes.
    // Teto, ficha e prazo do recibo vêm do banco, pela mesma função que
    // alimenta /api/config/brand. Se o banco falhar, a TINA responde só com o
    // núcleo — pior, mas sem afirmar valor nenhum que o site não afirme.
    const fiscal = await textosFiscais(req.organization).catch(() => null);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      // 450 cortava respostas no meio da frase depois que a base de conhecimento
      // entrou. 800 dá margem para a resposta terminar; o LEMBRETE_FORMATO abaixo
      // é o que impede que ela cresça para ocupar o espaço novo.
      max_tokens: 800,
      system: montaSystem(req.organization, fiscal),
      messages: [
        ...safeHistory.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message.trim() }
      ]
    });

    // Cache silencioso: se cache_read vier zero em chamadas repetidas, algo está
    // invalidando o prefixo (valor dinâmico no núcleo, prefixo curto demais).
    const u = response.usage;
    registraConsumo(req.tenantSlug, u);
    console.log(
      `[TINA] org=${req.tenantSlug || 'www'} ` +
      `cache_write=${u.cache_creation_input_tokens ?? 0} ` +
      `cache_read=${u.cache_read_input_tokens ?? 0} ` +
      `input=${u.input_tokens} output=${u.output_tokens}`
    );

    // content[0] nem sempre é texto — filtra pelo tipo em vez de indexar.
    const texto = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!texto) {
      console.error('[TINA] resposta sem bloco de texto', {
        stop_reason: response.stop_reason
      });
      return res.status(502).json({
        status: 'error',
        message: 'Não consegui formular uma resposta. Tente reformular a pergunta.'
      });
    }

    res.json({
      status: 'success',
      reply: texto
    });

  } catch (error) {
    // "Tente novamente" era a resposta para tudo. Com a chave revogada ou o
    // crédito no fim isso é conselho falso: o destinador insiste numa tela que
    // não vai mudar, e do lado de cá ninguém fica sabendo.
    const causa = leErroDoSdk(error);
    console.error(`[TINA] ${causa.causa}: ${causa.operador}`, error.message);
    ultimaFalha = { ...causa, quando: new Date().toISOString() };

    res.status(causa.passageiro ? 503 : 500).json({
      status: 'error',
      message: causa.usuario,
      passageiro: causa.passageiro
    });
  }
});

/**
 * A última falha da TINA, para o diagnóstico.
 *
 * Sem isso, uma assistente morta é indistinguível de uma assistente ociosa:
 * ninguém abre o chat para conferir, e a falha só aparece quando um destinador
 * reclama — se reclamar.
 */
let ultimaFalha = null;
export function ultimaFalhaDaIA() {
  return ultimaFalha;
}

export default router;
