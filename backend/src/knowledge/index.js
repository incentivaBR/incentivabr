import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resumoParaPrompt } from '../lib/textosFiscais.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Núcleo de conhecimento da TINA.
 *
 * Conteúdo comum a TODOS os tenants: base legal dos 7 mecanismos, guia de IR,
 * como funciona a destinação, passo a passo e FAQ. Extraído das páginas do
 * frontend (ver o comentário de fonte em cada seção do nucleo.md).
 *
 * Lido UMA VEZ na subida do processo. Não leia por requisição: além do custo
 * de I/O, qualquer variação de bytes entre chamadas invalida o prompt cache.
 *
 * ATENÇÃO — este texto é o prefixo cacheado. Ele precisa ser byte a byte
 * idêntico em toda requisição e em todo tenant. Nunca interpole aqui data,
 * nome de organização, id de sessão ou qualquer valor dinâmico: isso quebra o
 * compartilhamento do cache entre tenants e faz cada organização pagar o
 * prompt inteiro a preço cheio.
 */
function carregaNucleo() {
  try {
    return fs.readFileSync(path.join(__dirname, 'nucleo.md'), 'utf-8');
  } catch (err) {
    // Falha aqui NÃO pode derrubar o processo. Este módulo é importado pela
    // rota de chat, que é importada pelo server.js: um readFileSync solto no
    // escopo do módulo transformaria um arquivo faltando (build incompleto,
    // .railwayignore mal configurado) na queda do site inteiro — inclusive do
    // fluxo de destinação, que é o negócio. A TINA responde pior; o site fica.
    console.error(
      '[TINA] nucleo.md não carregou — assistente seguirá apenas com a persona. ' +
      `Motivo: ${err.message}`
    );
    return '';
  }
}

export const NUCLEO = carregaNucleo();

/**
 * Monta o bloco específico do tenant a partir da linha de `organizations` que o
 * tenantMiddleware já injetou em req.organization.
 *
 * Vai DEPOIS do núcleo no array `system`, justamente para não invalidar o
 * prefixo cacheado — só estes ~300 tokens são reprocessados por organização.
 *
 * Deliberadamente FORA daqui: chave PIX, agência e conta. Esses dados aparecem
 * na tela de destinação, onde o usuário está autenticado no fluxo; num chat
 * eles viram superfície de engenharia social sem ganho nenhum de utilidade.
 */
export function blocoDoTenant(org, fiscal = null) {
  // O resumo dos textos fiscais (lib/textosFiscais.js) entra aqui, e não no
  // núcleo, porque o teto e o prazo do recibo vêm do banco e podem mudar por
  // organização — o núcleo é o prefixo cacheado e tem de ser fixo. É a mesma
  // fonte que as páginas leem por /api/config/brand: se o banco mudar, a TINA
  // e o site mudam juntos.
  const resumoFiscal = fiscal ? ['', resumoParaPrompt(fiscal)] : [];

  if (!org) {
    return [
      '# ORGANIZAÇÃO ATUAL',
      '',
      'Nenhuma organização identificada nesta sessão. Responda apenas com o',
      'conhecimento geral acima e não afirme dados de nenhum projeto específico.',
      ...resumoFiscal
    ].join('\n');
  }

  const linhas = [
    '# ORGANIZAÇÃO DESTA SESSÃO',
    '',
    'Isto é CONTEXTO, não o assunto da conversa.',
    '',
    'O mecanismo da destinação interessa a todo mundo e não depende de projeto',
    'nenhum: como funciona, quais os limites de cada lei, quem pode usar, como',
    'declarar, o que é o comprovante. A maioria das perguntas é sobre isso —',
    'responda de forma geral, servindo a qualquer pessoa que esteja lendo.',
    '',
    'Traga o projeto abaixo só quando o usuário perguntar sobre ele, quando',
    'pedir para destinar, ou quando a resposta ficar de fato incompleta sem ele.',
    'Nunca transforme uma pergunta geral ("quem pode destinar?", "qual o limite?")',
    'numa resposta sobre este projeto específico.',
    '',
    'Quando citar dados de projeto, use SOMENTE os que estão listados aqui.',
    'Nunca cite projeto ou proponente de outra organização.',
    '',
    `- Nome: ${org.name}`
  ];

  if (org.fund_name) linhas.push(`- Fundo / programa: ${org.fund_name}`);
  if (org.legal_basis) linhas.push(`- Base legal: ${org.legal_basis}`);
  if (org.max_percentage) {
    linhas.push(`- Limite de destinação: ${org.max_percentage}% do IR devido`);
  }
  if (org.pronac) {
    linhas.push(`- PRONAC: ${org.pronac}${org.pronac_titulo ? ` — ${org.pronac_titulo}` : ''}`);
  }
  if (org.pronac_area) linhas.push(`- Área cultural: ${org.pronac_area}`);
  if (org.pronac_proponente) linhas.push(`- Proponente: ${org.pronac_proponente}`);
  if (org.beneficiary_name) linhas.push(`- Beneficiário: ${org.beneficiary_name}`);
  if (org.beneficiary_cnpj) linhas.push(`- CNPJ do beneficiário: ${org.beneficiary_cnpj}`);
  if (org.contact_email) linhas.push(`- Contato: ${org.contact_email}`);

  // Conhecimento livre específico da organização (ex.: as regras do piloto FGV).
  // A coluna ainda não existe em `organizations`; enquanto não existir, este
  // bloco simplesmente não aparece. É o destino das 26 respostas fixas do
  // tina.js — mover para cá é o que permite apagá-las sem quebrar o piloto.
  if (org.knowledge_extra) {
    linhas.push('', '## Contexto específico desta organização', '', org.knowledge_extra);
  }

  linhas.push(
    '',
    'Se o usuário perguntar dados bancários ou chave PIX, não responda por aqui:',
    'oriente a seguir para a tela de destinação, onde os dados aparecem com o',
    'valor já calculado e o comprovante é gerado.',
    ...resumoFiscal
  );

  return linhas.join('\n');
}
