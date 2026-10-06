/**
 * O que entrou pela plataforma — o número que o cliente contratou para ver.
 *
 * A pergunta que esta peça responde é a que decide a renovação do contrato:
 * "o investimento valeu a pena?". Até aqui o sistema não tinha onde respondê-la
 * — o gestor via a FILA do que falta conferir, que é trabalho pendente, não
 * resultado. Nenhuma tela somava.
 *
 * Somar é fácil. O que este arquivo guarda são as quatro distinções que um
 * número de dinheiro numa tela de cliente tem de respeitar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 1. PROMESSA NÃO É DINHEIRO
 *
 * Uma destinação em `pending` é alguém que preencheu o formulário. Em
 * `awaiting_confirmation`, alguém que anexou um comprovante que ninguém
 * conferiu ainda. Nenhuma das duas é dinheiro na Conta de Captação.
 *
 * Só entra no total `confirmado` o que um gestor abriu o extrato e confirmou.
 * As outras aparecem, com os seus nomes, em caixas separadas — porque elas
 * importam (são trabalho a fazer e receita provável), mas somá-las ao
 * captado transformaria o painel num instrumento de autoengano.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 2. ENSAIO NÃO É DINHEIRO
 *
 * `simulada` (migration 055) marca a linha nascida em modo simulação. Ela fica
 * FORA de todos os totais de dinheiro e tem a sua própria caixa. Sem isso o
 * painel da demonstração mostraria dezenas de milhares de reais que nunca
 * existiram — e continuaria mostrando depois da virada, para sempre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 3. O QUE ENTROU PELA PLATAFORMA NÃO É O QUE O PROJETO CAPTOU
 *
 * O projeto capta por vários caminhos; a plataforma é um deles. Misturar os
 * dois números infla o que a plataforma entregou — exatamente a afirmação que
 * o contrato depende de ser verdadeira. Os dois vêm separados e nomeados, e
 * `lib/captacao.js` continua sendo o dono do lado do projeto.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 4. AQUI, ZERO É ZERO
 *
 * Em `lib/captacao.js` vale a regra oposta: `valor_captado` nulo é "ninguém
 * conferiu", nunca zero. Aqui é o contrário, e de propósito — nós CONTAMOS as
 * linhas. Nenhuma destinação confirmada significa nenhuma destinação
 * confirmada, e o painel pode dizer isso com todas as letras. A diferença é
 * que lá o número vem de fora e aqui vem da nossa própria tabela.
 */

/** Situações em que o dinheiro já foi conferido por um gestor. */
export const CONFIRMADAS = ['confirmed', 'awaiting_mecenato', 'mecenato_issued'];

/** Comprovante anexado, esperando alguém abrir o extrato. */
export const NA_FILA = ['awaiting_confirmation'];

/** Registrada e nada mais: ninguém transferiu, ou ninguém anexou. */
export const SO_PROMESSA = ['pending'];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const dinheiro = (v) => Math.round(num(v) * 100) / 100;

/**
 * Monta o resultado a partir da linha agregada da consulta.
 *
 * @param {object} soma - uma linha com os totais já somados pelo banco
 * @param {object} [opcoes]
 * @param {object|null} [opcoes.captacaoDoProjeto] - saída de situacaoDaCaptacao()
 * @param {boolean} [opcoes.modoSimulacao] - a plataforma está em simulação AGORA
 */
export function montaResultado(soma = {}, { captacaoDoProjeto = null, modoSimulacao = false } = {}) {
  const confirmado = {
    valor:      dinheiro(soma.confirmado_valor),
    quantidade: num(soma.confirmado_qtd),
    pessoas:    num(soma.confirmado_pessoas)
  };
  const naFila = {
    valor:      dinheiro(soma.fila_valor),
    quantidade: num(soma.fila_qtd)
  };
  const prometido = {
    valor:      dinheiro(soma.promessa_valor),
    quantidade: num(soma.promessa_qtd)
  };
  const simulado = {
    valor:      dinheiro(soma.simulado_valor),
    quantidade: num(soma.simulado_qtd)
  };

  // Quanto do autorizado do projeto veio por aqui. Só faz sentido quando os
  // dois números existem, e só com dinheiro de verdade.
  const autorizado = captacaoDoProjeto?.autorizado ?? null;
  const pctDoAutorizado = (autorizado && autorizado > 0 && confirmado.valor > 0)
    ? Math.round((confirmado.valor / autorizado) * 1000) / 10
    : null;

  return {
    confirmado,
    na_fila: naFila,
    prometido,
    simulado,
    // Dito aqui para a tela não ter de deduzir: há ensaio dentro desta
    // organização, e ele está fora dos totais acima.
    tem_simulacao: simulado.quantidade > 0,
    modo_simulacao: Boolean(modoSimulacao),
    percentual_do_autorizado: pctDoAutorizado,
    projeto: captacaoDoProjeto,
    frase: frase({ confirmado, naFila, prometido, simulado, modoSimulacao })
  };
}

/**
 * Uma frase sobre o resultado, para a tela não inventar a sua.
 *
 * Lidera com o que é verdade mais forte em cada caso. Em simulação, lidera com
 * a simulação — não como rodapé: quem lê um número de dinheiro decide em cima
 * dele antes de chegar ao rodapé.
 */
export function frase({ confirmado, naFila, prometido, simulado, modoSimulacao }) {
  if (modoSimulacao) {
    const quantas = simulado.quantidade + confirmado.quantidade
      + naFila.quantidade + prometido.quantidade;
    return quantas
      ? 'Modo simulação: nenhum valor desta tela saiu ou entrou em conta alguma.'
      : 'Modo simulação: ainda não há destinações registradas.';
  }
  if (confirmado.quantidade === 0 && naFila.quantidade === 0 && prometido.quantidade === 0) {
    return 'Ainda não há destinações registradas para este projeto.';
  }
  if (confirmado.quantidade === 0) {
    return naFila.quantidade
      ? `Nenhuma destinação conferida ainda. ${naFila.quantidade} aguarda${naFila.quantidade > 1 ? 'm' : ''} conferência.`
      : 'Nenhuma destinação conferida ainda.';
  }
  const pessoas = confirmado.pessoas === 1
    ? '1 contribuinte'
    : `${confirmado.pessoas} contribuintes`;
  return `${pessoas} já destinaram e tiveram o comprovante conferido.`;
}

export default { montaResultado, frase, CONFIRMADAS, NA_FILA, SO_PROMESSA };
