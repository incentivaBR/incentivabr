/**
 * A situação da captação do projeto: quanto falta, e quanto tempo falta.
 *
 * Duas regras governam este arquivo, e as duas são sobre honestidade com
 * número de dinheiro numa página que pede transferência.
 *
 * REGRA 1 — NÃO SABER NÃO É ZERO.
 *
 * `valor_captado` nulo significa "ninguém conferiu", e a tela tem de dizer
 * isso em vez de escrever "R$ 0 captado". São afirmações diferentes: uma é
 * ausência de consulta, a outra é ausência de doador. Escrever a segunda
 * quando houve a primeira é mentir por descuido — e é o tipo de coisa que o
 * proponente percebe no primeiro extrato que conferir.
 *
 * REGRA 2 — RETRATO VELHO NÃO É NOTÍCIA.
 *
 * Em modo simulação a plataforma não consulta o SALIC: os valores são um
 * retrato digitado a partir da consulta oficial, com a data em `valores_em`.
 * Um "zero captado" de setembro exibido em dezembro é falso. Passado o prazo
 * de validade, o número continua aparecendo — mas marcado, e com a data ao
 * lado, para quem lê saber o que está lendo.
 *
 * O que NÃO está aqui, de propósito: como isso é escrito na tela. A página
 * decide se lidera com o que falta ou com o que entrou. O que este módulo
 * garante é que ela nunca receba um número que não pode afirmar.
 */

/** Depois disso, o retrato é velho demais para ser apresentado como atual. */
export const VALIDADE_DO_RETRATO_DIAS = 45;

/** Daqui para baixo, o prazo é curto o bastante para virar o assunto. */
export const PRAZO_APERTADO_DIAS = 120;

const numero = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Meia-noite UTC do dia, para contar dias sem depender de fuso. */
const dia = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).slice(0, 10) + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? null : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * 'AAAA-MM-DD', venha o valor como texto ou como Date.
 *
 * O driver do Postgres devolve coluna DATE como objeto Date — não como texto.
 * `String(data).slice(0,10)` nesse objeto produz "Tue Sep 29", que foi
 * exatamente o que apareceu no JSON da rota na primeira versão deste arquivo.
 * As contas de dias estavam certas (dia() já tratava os dois casos); só o
 * texto que vai para a tela é que saía errado.
 */
const iso = (v) => {
  const t = dia(v);
  return t == null ? null : new Date(t).toISOString().slice(0, 10);
};

/**
 * @param {object|null} projeto - linha de org_projects
 * @param {Date} [agora]
 * @returns {object|null} null quando não há nada que se possa afirmar
 */
export function situacaoDaCaptacao(projeto, agora = new Date()) {
  const autorizado = numero(projeto?.valor_autorizado);
  const captado    = numero(projeto?.valor_captado);
  const fim        = dia(projeto?.captacao_fim);
  const conferidoEm = dia(projeto?.valores_em);

  // Sem valor autorizado e sem prazo não há situação nenhuma a mostrar. A
  // página some com o bloco em vez de desenhar uma barra vazia.
  if (autorizado == null && fim == null) return null;

  const hoje = dia(agora);
  const diasRestantes = fim == null ? null : Math.round((fim - hoje) / DIA_MS);

  // O retrato envelhece; o prazo, não. Uma data de fim continua verdadeira
  // com um ano — é um fato do projeto, não uma medição.
  const idade = conferidoEm == null ? null : Math.round((hoje - conferidoEm) / DIA_MS);
  const defasado = captado != null && (idade == null || idade > VALIDADE_DO_RETRATO_DIAS);

  const falta = (autorizado != null && captado != null)
    ? Math.max(0, Math.round((autorizado - captado) * 100) / 100)
    : null;

  const pct = (autorizado != null && captado != null && autorizado > 0)
    ? Math.min(100, Math.round((captado / autorizado) * 1000) / 10)
    : null;

  return {
    autorizado,
    captado,                       // null = não conferido, e não zero
    captado_conhecido: captado != null,
    falta,
    percentual: pct,
    conferido_em: iso(projeto?.valores_em),
    defasado,                      // o número existe, mas é retrato velho
    fim: iso(projeto?.captacao_fim),
    dias_restantes: diasRestantes,
    encerrada: diasRestantes != null && diasRestantes < 0,
    apertado: diasRestantes != null && diasRestantes >= 0 && diasRestantes <= PRAZO_APERTADO_DIAS
  };
}

/**
 * Uma frase sobre o prazo, para a tela não ter de montar a sua.
 *
 * Fala do PRAZO, não do captado: é o prazo que é fato estável, e é ele que
 * move quem lê. Quanto entrou até agora a barra mostra, com a data ao lado.
 */
export function fraseDaCaptacao(c) {
  if (!c) return null;
  if (c.dias_restantes == null) return 'Captação autorizada pelo Ministério da Cultura.';
  if (c.encerrada) return 'A janela de captação deste projeto está encerrada.';
  if (c.dias_restantes === 0) return 'Hoje é o último dia da janela de captação.';
  if (c.dias_restantes === 1) return 'Falta 1 dia para o fim da janela de captação.';
  return `Faltam ${c.dias_restantes} dias para o fim da janela de captação.`;
}

/** Números que vêm de formulário: recusa o que não dá para afirmar. */
export function validaCaptacao(corpo = {}) {
  const valores = {};

  for (const campo of ['valor_autorizado', 'valor_captado']) {
    const bruto = corpo[campo];
    if (bruto == null || bruto === '') { valores[campo] = null; continue; }
    const n = Number(bruto);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, erro: `${campo.replace('_', ' ')} inválido.` };
    }
    valores[campo] = Math.round(n * 100) / 100;
  }

  for (const campo of ['captacao_inicio', 'captacao_fim', 'valores_em']) {
    const bruto = String(corpo[campo] || '').trim();
    if (!bruto) { valores[campo] = null; continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto)) {
      return { ok: false, erro: `${campo.replace('_', ' ')} deve estar no formato AAAA-MM-DD.` };
    }
    valores[campo] = bruto;
  }

  if (valores.valor_autorizado != null && valores.valor_captado != null
      && valores.valor_captado > valores.valor_autorizado) {
    return { ok: false, erro: 'O valor captado não pode ser maior que o autorizado.' };
  }

  // Informar quanto entrou sem dizer quando foi conferido é o que cria o
  // retrato velho apresentado como atual. Exige-se a data junto.
  if (valores.valor_captado != null && !valores.valores_em) {
    return { ok: false, erro: 'Informe a data em que os valores foram conferidos na fonte oficial.' };
  }

  return { ok: true, valores };
}

export default {
  situacaoDaCaptacao, fraseDaCaptacao, validaCaptacao,
  VALIDADE_DO_RETRATO_DIAS, PRAZO_APERTADO_DIAS
};
