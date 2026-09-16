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

export default { POLITICA_VERSAO, ENCARREGADO, RETENCAO_INTERESSADO_MESES };
