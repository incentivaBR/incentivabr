/**
 * Quanto o projeto JÁ CAPTOU, segundo o Ministério — e por que não é o campo
 * da API que tem esse nome.
 *
 * O PROBLEMA QUE ESTE ARQUIVO CONSERTA
 *
 * A rota do projeto do tenant lia `valores.captado`, que vem do campo
 * `valor_captado` do detalhe do projeto na API do SALIC. O nome do campo é
 * convidativo e está errado: no código aberto da API (culturagovbr/salic-api,
 * `resources/projeto/models.py`), esse rótulo é aplicado sobre a função
 * `fnCustoProjeto` — o CUSTO do projeto. Não existe nenhuma `fnCaptacao` no
 * código da API; as únicas funções de valor são fnCustoProjeto,
 * fnValorSolicitado, fnValorAprovado(Convenio), fnOutrasFontes e
 * fnValorDaProposta.
 *
 * O efeito na tela era o pior possível para uma página que pede transferência:
 * "captado" valendo o custo do projeto desenha a barra perto de 100% e diz a
 * quem chegou que o projeto já está financiado. Quem iria destinar, não destina.
 *
 * A captação de verdade é `CaptacaoModel.CaptacaoReal`, e só aparece em dois
 * lugares da API: nos endpoints do incentivador e em
 * `/projetos/:PRONAC/captacoes`, uma linha por recibo. A soma dessas linhas é
 * o que este módulo produz.
 *
 * RESSALVA HONESTA: o código que fundamenta isto é o aberto, cujo último
 * commit é de 2018, e o ambiente de trabalho não alcança a produção para
 * conferir. Mas a escolha é segura nas duas hipóteses — se a produção mudou,
 * `CaptacaoReal` continua sendo inequivocamente a captação, enquanto
 * `valor_captado` continua sendo um rótulo sobre outra coisa.
 *
 * O QUE NÃO SAI DAQUI, DE PROPÓSITO
 *
 * Cada linha de captação traz o nome do doador e o CPF/CNPJ dele (mascarado).
 * É dado pessoal de terceiro que não nos serve para nada: o que a tela mostra
 * é um total e uma data. Guardar as linhas nos tornaria controladores de dado
 * que não pedimos e não usamos (LGPD, art. 6º, III — necessidade). Então o
 * resumo é construído campo por campo, e nenhuma chave da origem é repassada.
 *
 * E A REGRA DA CASA CONTINUA VALENDO: não saber não é zero.
 */

/** Código que a API usa para "não há captação para este projeto". */
export const SEM_CAPTACAO_MESSAGE_CODE = 11;

/** O que se devolve quando o Ministério respondeu que não houve captação. */
export const ZERO_CONFERIDO = Object.freeze({
  captado: 0,
  ultimo_recibo: null,
  recibos: 0
});

const dinheiro = (v) => {
  if (v == null || v === '') return null;
  // A coluna é String no modelo da API; vírgula decimal já apareceu em campo
  // de valor do SALIC, então trata-se antes de converter.
  const n = Number(String(v).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const diaIso = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).slice(0, 10) + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

/**
 * As linhas de captação, como a API as devolve, em qualquer dos invólucros.
 *
 * A API usa HAL: o recurso vem em `_embedded.captacoes`. Uma lista crua e uma
 * chave `captacoes` no topo também são aceitas, porque é o que um proxy ou uma
 * versão anterior entregam — e errar o invólucro produziria zero silencioso.
 */
export function linhasDeCaptacao(bruto) {
  if (Array.isArray(bruto)) return bruto;
  const candidatos = [bruto?._embedded?.captacoes, bruto?.captacoes, bruto?.items];
  for (const c of candidatos) if (Array.isArray(c)) return c;
  return null;
}

/**
 * Soma os recibos e devolve só o que a tela precisa.
 *
 * @param {Array|null} linhas
 * @returns {{captado:number, ultimo_recibo:string|null, recibos:number}|null}
 *   null quando não há como AFIRMAR o total.
 */
export function resumoDasCaptacoes(linhas) {
  if (!Array.isArray(linhas)) return null;
  if (linhas.length === 0) return null;   // lista vazia é resposta, mas é do chamador decidir

  let soma = 0;
  let ultimo = null;

  for (const linha of linhas) {
    const valor = dinheiro(linha?.valor);

    // Uma linha com valor ilegível não pode ser pulada: a soma sairia MENOR
    // que a verdadeira e seria apresentada como o total. Somar o que se
    // entende e calar o resto é como se inventa um número de dinheiro. Sem
    // poder afirmar o total, não se afirma nada.
    if (valor == null) return null;

    soma += valor;
    const dia = diaIso(linha?.data_recibo);
    if (dia && (ultimo == null || dia > ultimo)) ultimo = dia;
  }

  return {
    captado: Math.round(soma * 100) / 100,
    ultimo_recibo: ultimo,
    recibos: linhas.length
  };
}

/**
 * O resumo a partir da resposta crua, já decidindo os casos de borda.
 *
 * @param {object|Array|null} bruto  corpo da resposta de /captacoes
 * @returns {object|null}
 */
export function resumoDaResposta(bruto) {
  const linhas = linhasDeCaptacao(bruto);
  if (linhas == null) return null;
  if (linhas.length === 0) return { ...ZERO_CONFERIDO };
  return resumoDasCaptacoes(linhas);
}

/**
 * Um 404 da rota de captações: foi "não houve captação" ou "não sei"?
 *
 * A API responde 404 com message_code 11 quando o projeto não tem captação —
 * isso é um zero conferido, e dizê-lo é melhor que calar. Mas 404 também é o
 * que responde um endpoint que não existe, e aí tratar como zero afirmaria, na
 * página que pede transferência, que ninguém doou — quando a verdade é que não
 * perguntamos direito. Só o código na resposta separa os dois.
 */
export function zeroConferido(corpoDoErro) {
  return corpoDoErro?.message_code === SEM_CAPTACAO_MESSAGE_CODE
    ? { ...ZERO_CONFERIDO }
    : null;
}

export default {
  resumoDasCaptacoes, resumoDaResposta, linhasDeCaptacao, zeroConferido,
  ZERO_CONFERIDO, SEM_CAPTACAO_MESSAGE_CODE
};
