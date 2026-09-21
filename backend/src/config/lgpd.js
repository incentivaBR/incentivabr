/**
 * Parâmetros de proteção de dados, num lugar só.
 *
 * Estavam implícitos espalhados pelo código e pelas páginas. O problema de
 * espalhar é que a prova do consentimento precisa apontar para uma versão
 * concreta da Política — se cada lugar tiver a sua ideia de qual é a versão
 * vigente, a prova não vale nada.
 */

/**
 * Versão da Política de Privacidade vigente.
 *
 * MUDE AQUI sempre que alterar frontend/politica-privacidade.html de forma
 * substantiva. Todo consentimento novo passa a apontar para a versão nova;
 * os antigos continuam apontando para a que a pessoa realmente leu — que é o
 * ponto de guardar isso.
 */
export const POLITICA_VERSAO = '2026-09';

/**
 * Encarregado pelo Tratamento de Dados Pessoais (art. 41 da LGPD).
 *
 * O art. 41 §1º exige que a identidade e as informações de contato do
 * Encarregado sejam divulgadas publicamente, de forma clara e objetiva.
 */
export const ENCARREGADO = {
  nome:  process.env.DPO_NOME  || 'Adacto Artur Dornas de Oliveira',
  email: process.env.DPO_EMAIL || 'privacidade@incentivabr.com.br',
  local: 'Brasília — DF'
};

/**
 * Retenção de quem se cadastrou mas nunca destinou.
 *
 * O prazo de 5 anos da legislação tributária vale para quem destinou: há
 * documento fiscal a guardar. Para um interessado que nunca destinou não
 * existe essa obrigação, e manter o dado indefinidamente seria conservação
 * além do necessário (LGPD, art. 15 I e art. 16). Vinte e quatro meses sem
 * qualquer interação é o corte: cobre dois ciclos completos de declaração de
 * IR, que é o intervalo em que essa pessoa teria motivo para voltar.
 */
export const RETENCAO_INTERESSADO_MESES = 24;

/**
 * Retenção de quem destinou: o prazo fiscal.
 *
 * A Política (§7) promete guardar os documentos fiscais por 5 anos, "conforme
 * legislação tributária". Quando uma conta com destinação real é encerrada a
 * pedido do titular, nome, CPF, valor, comprovante e recibo ficam até o fim
 * do ano devolvido por anoFinalDaGuarda(); e-mail, telefone e senha somem na
 * hora, porque nada obriga a guardá-los.
 *
 * A contagem começa no ano da DECLARAÇÃO (ano-base + 1), não no ano-base: é
 * a leitura mais conservadora, e a única que garante não apagar antes da
 * hora. De que data exata o prazo conta é pergunta para o tributarista
 * (docs/juridico/CONSULTA-TRIBUTARISTA.md); enquanto não houver parecer,
 * nada é apagado por prazo — a rota /api/admin/retencao só lista o que já
 * venceu.
 */
export const RETENCAO_FISCAL_ANOS = 5;

/** Último ano em que o registro fiscal de um ano-base precisa ser guardado. */
export function anoFinalDaGuarda(anoBase) {
  return Number(anoBase) + 1 + RETENCAO_FISCAL_ANOS;
}

/**
 * O mesmo prazo, com a data que ele de fato termina.
 *
 * `anoFinalDaGuarda()` devolve um ano, e ano sozinho é ambíguo: guardar "até
 * 2032" pode ser 1º de janeiro ou 31 de dezembro, e a diferença é um ano
 * inteiro de documento apagado cedo demais. O fim é o ÚLTIMO instante do ano,
 * que é a leitura conservadora e a que casa com o exercício fiscal.
 */
export function dataFinalDaGuarda(anoBase) {
  return new Date(Date.UTC(anoFinalDaGuarda(anoBase), 11, 31, 23, 59, 59));
}

/** Já venceu a guarda deste ano-base? */
export function guardaVencida(anoBase, agora = new Date()) {
  return agora > dataFinalDaGuarda(anoBase);
}

/**
 * O que "anonimizar ao fim do prazo" tem de alcançar.
 *
 * A Política (§7) promete anonimizar. Trocar o CPF por hash na linha do banco
 * NÃO anonimiza nada enquanto o comprovante e o recibo continuarem guardados:
 * os dois documentos trazem nome, banco, data e valor no próprio PDF, e
 * reidentificam a pessoa sozinhos.
 *
 * Isto é fato técnico, não interpretação jurídica: qualquer rotina de fim de
 * prazo tem de alcançar os arquivos, não só as colunas. O que continua sendo
 * pergunta ao tributarista é se a plataforma precisa guardá-los — item 4 de
 * docs/juridico/CONSULTA-TRIBUTARISTA.md.
 */
export const ANONIMIZAR_ALCANCA_ARQUIVOS = true;

export default {
  POLITICA_VERSAO, ENCARREGADO, RETENCAO_INTERESSADO_MESES,
  RETENCAO_FISCAL_ANOS, anoFinalDaGuarda, dataFinalDaGuarda, guardaVencida,
  ANONIMIZAR_ALCANCA_ARQUIVOS
};
