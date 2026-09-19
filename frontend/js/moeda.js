/**
 * Dinheiro na tela, de um jeito só.
 *
 * Havia nove formatadores de real espalhados por oito arquivos (Raio-X de
 * set/2026, risco 11): BRL, BRLs, formatBRL, fmtBRL, formatCurrency, cada um
 * com a sua ideia de casas decimais, de espaço depois do "R$" e do que fazer
 * com valor nulo. O mesmo número saía escrito de três formas em três telas.
 *
 *   BRL(1234.5)        → "R$ 1.234,50"
 *   BRL.inteiro(1234.4) → "R$ 1.234"       (metas e valores aprovados)
 *   BRL(null), BRL('x') → "—"              (valor que não veio não é zero)
 *   BRL(0)              → "R$ 0,00"
 *
 * Aceita número ou texto numérico ("1234.5"). O espaço depois do "R$" é o
 * comum, não o inflexível do Intl, para que copiar e colar (WhatsApp,
 * e-mail, planilha) produza o mesmo texto que se lê.
 *
 * Só este arquivo formata moeda; backend/tests/moeda.test.mjs recusa outro
 * Intl.NumberFormat de currency ou 'R$ ' + ... no frontend.
 */
(function (raiz) {
  const comCentavos = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const semCentavos = new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0
  });

  const escreve = (formato, v) => {
    if (v == null || v === '') return '—';
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!Number.isFinite(n)) return '—';
    return formato.format(n).replace(/ /g, ' ');
  };

  const BRL = v => escreve(comCentavos, v);
  BRL.inteiro = v => escreve(semCentavos, v);

  raiz.BRL = BRL;
})(typeof window !== 'undefined' ? window : globalThis);
