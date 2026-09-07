/**
 * A fonte única dos textos fiscais.
 *
 * O Raio-X (risco 04) encontrou o site dizendo coisas diferentes sobre o
 * mesmo assunto: teto de 6% numa página e 7% em outra, Esporte "independente"
 * num bloco e "no mesmo teto" no seguinte, código 41 da DIRPF para a Rouanet e
 * também para o Fundo do Idoso, recibo em 10, 15 ou 60 dias. Cada página
 * guardava a própria cópia, e as cópias divergiram.
 *
 * Este módulo monta UM objeto com esses valores, a partir do banco quando o
 * dado está lá (tetos_deducao, incentive_groups, organizations) e daqui
 * quando não está. Quem lê:
 *
 *   - GET /api/config/brand devolve o objeto em `fiscal`; tenant.js preenche
 *     todo elemento `[data-fiscal="..."]` das páginas com ele;
 *   - a TINA recebe o resumo em texto no bloco do tenant do prompt
 *     (knowledge/index.js), fora do prefixo cacheado.
 *
 * O que está marcado como não confirmado é assim de propósito: o parecer do
 * tributarista ainda não existe, e os códigos da ficha DIRPF vieram de fontes
 * secundárias porque as páginas da Receita não eram alcançáveis quando isto
 * foi escrito. Mudar um valor aqui muda o site inteiro e a TINA de uma vez —
 * é o que se quer, mas também é o que exige cuidado.
 */
import pool from '../../config/database.js';
import { tetosVigentes, tetoDoMecanismo } from './tetos.js';

/**
 * Códigos da ficha "Doações Efetuadas" do programa IRPF.
 *
 * NÃO CONFIRMADO em fonte primária. Antes, o site dizia 41 para a Rouanet e
 * também 41 para o Fundo do Idoso — um dos dois estava errado com certeza.
 * Os valores abaixo são os que as fontes secundárias consultadas (Receita via
 * resumo de terceiros, manuais de contabilidade) apresentam de forma
 * consistente. Conferir no programa IRPF do ano antes de qualquer campanha.
 */
export const DIRPF = {
  ficha: 'Doações Efetuadas',
  codigos: {
    eca: 40,          // Estatuto da Criança e do Adolescente (FDCA / FIA)
    cultura: 41,      // Incentivo à Cultura (Lei Rouanet, art. 18)
    audiovisual: 42,  // Incentivo à Atividade Audiovisual
    desporto: 43,     // Incentivo ao Desporto
    idoso: 44         // Fundos controlados pelos Conselhos da Pessoa Idosa
  },
  confirmado: false,
  nota: 'Códigos conferidos em fontes secundárias; confirme no programa IRPF do ano-exercício.'
};

/** Lei Rouanet: quanto do valor destinado abate do imposto devido. */
export const ROUANET = { art18_dedutivel_pct: 100, art26_dedutivel_pct: 80 };

/** Por quanto tempo a Receita pode pedir os comprovantes. */
export const GUARDA_DOCUMENTOS_ANOS = 5;

export const AVISO =
  'A plataforma não substitui contador nem advogado. Confirme os valores do seu caso com quem assina a sua declaração.';

const PRAZO_RECIBO_PADRAO_DIAS = 10;

/** 6.00 → "6"; 6.50 → "6,5". Para texto em português. */
export function formataPercentual(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return String(Math.round(v * 100) / 100).replace('.', ',');
}

/**
 * O objeto completo, para a organização da requisição (ou nenhuma).
 *
 * @param {object|null} org - req.organization (pode ser null)
 * @param {{query: Function}} [executor]
 */
export async function textosFiscais(org, executor = pool) {
  const teto = await tetoDoMecanismo(org?.incentive_group_code || 'ROUANET', executor);
  const tetos = await tetosVigentes(executor);

  let grupos = [];
  try {
    const { rows } = await executor.query(
      'SELECT code, name, teto_codigo FROM incentive_groups ORDER BY name'
    );
    grupos = rows;
  } catch (erro) {
    console.error('[fiscal] falha ao ler incentive_groups:', erro.message);
  }

  const mecanismos = grupos.map(g => {
    const t = (g.teto_codigo && tetos.get(g.teto_codigo)) || teto;
    return {
      code: g.code,
      nome: g.name,
      teto_codigo: t.codigo,
      percentual: t.percentual,
      compoe_teto_global: t.codigo === teto.codigo
    };
  });

  return {
    teto: {
      codigo: teto.codigo,
      percentual: teto.percentual,
      percentual_texto: `${formataPercentual(teto.percentual)}%`,
      fracao: teto.percentual / 100,
      base_legal: teto.base_legal,
      descricao: teto.descricao || null,
      confirmado_por_parecer: Boolean(teto.confirmado_por_parecer)
    },
    mecanismos,
    dirpf: DIRPF,
    recibo: {
      emissor: 'proponente',
      modelo: 'modelo do Ministério da Cultura, em três vias',
      prazo_dias: Number(org?.mecenato_prazo_dias) || PRAZO_RECIBO_PADRAO_DIAS,
      prazo_tipo: 'declarado pelo proponente, em dias úteis'
    },
    rouanet: ROUANET,
    guarda_documentos_anos: GUARDA_DOCUMENTOS_ANOS,
    aviso: AVISO
  };
}

/**
 * O mesmo objeto, em texto curto, para o prompt da TINA. Vai no bloco do
 * tenant (fora do prefixo cacheado), então pode variar por organização.
 */
export function resumoParaPrompt(f) {
  if (!f) return '';
  const c = f.dirpf.codigos;
  const dividem = f.mecanismos.filter(m => m.compoe_teto_global).map(m => m.nome);
  const proprios = f.mecanismos.filter(m => !m.compoe_teto_global)
    .map(m => `${m.nome} (${formataPercentual(m.percentual)}%)`);
  return [
    '## Valores fiscais vigentes (lidos do banco da plataforma)',
    '',
    `- Teto de dedução: ${f.teto.percentual_texto} do imposto devido (${f.teto.base_legal}).` +
      (f.teto.confirmado_por_parecer ? '' : ' Parecer do tributarista: pendente; trate como leitura conservadora.'),
    dividem.length
      ? `- Dividem esse mesmo teto, sem somar: ${dividem.join(', ')}.`
      : '- Todos os mecanismos cadastrados dividem esse mesmo teto, sem somar.',
    ...(proprios.length ? [`- Com teto próprio: ${proprios.join('; ')}.`] : []),
    `- Ficha da declaração: "${f.dirpf.ficha}". Códigos: ${c.cultura} cultura (Rouanet), ${c.eca} criança e adolescente, ` +
      `${c.idoso} pessoa idosa, ${c.desporto} desporto, ${c.audiovisual} audiovisual. ${f.dirpf.nota}`,
    `- Recibo de Mecenato: emitido pelo ${f.recibo.emissor}, ${f.recibo.modelo}; prazo ${f.recibo.prazo_tipo}: ${f.recibo.prazo_dias} dias.`,
    `- Lei Rouanet: art. 18 abate ${f.rouanet.art18_dedutivel_pct}% do valor; art. 26 abate ${f.rouanet.art26_dedutivel_pct}%.`,
    `- Guardar comprovantes por ${f.guarda_documentos_anos} anos.`,
    `- ${f.aviso}`
  ].join('\n');
}

export default { textosFiscais, resumoParaPrompt, formataPercentual, DIRPF, ROUANET, GUARDA_DOCUMENTOS_ANOS, AVISO };
