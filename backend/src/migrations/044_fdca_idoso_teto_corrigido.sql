-- 044 — FDCA e Fundo do Idoso: o catálogo tinha 3% e 6% trocados.
--
-- A migration 018 semeou, na observação das duas leis:
--
--   "Destinação durante o ano até 3%; doação na declaração até 6%"
--
-- É o INVERSO. Durante o ano-calendário vale o teto de 6% do art. 22 da Lei
-- 9.532/1997, o mesmo que a Rouanet divide — exatamente o que a seção "O que
-- já consideramos resolvido" da consulta ao tributarista registra e o que
-- `saldoDisponivel()` sempre fez. Os 3% são a via do art. 260-A do ECA:
-- destinar na PRÓPRIA declaração de ajuste, caminho que esta plataforma não
-- opera (o contribuinte o faz sozinho no programa da Receita).
--
-- A migration 043 leu a observação invertida e bloqueou os dois mecanismos
-- pelo motivo errado — "falta o limite da destinação durante o ano". Não
-- falta: é 6%, e é o `irpf_global_6` que já está na tabela.
--
-- O que de fato falta para FDCA e Idoso é OUTRA coisa, e não é jurídica: a
-- jornada. O assistente de destinação é moldado na Rouanet — PRONAC, consulta
-- ao SALIC, proponente e Recibo de Mecenato. Um fundo municipal não tem
-- PRONAC nem proponente; tem CNPJ do fundo, e é o fundo que emite o recibo.
-- Por isso a coluna muda de nome: `pendencia_parecer` prometia que o bloqueio
-- era sempre do tributarista, e passou a mentir no primeiro caso real.

-- ─────────────────────────────────────────────────────────────
-- 1. O catálogo passa a dizer o certo
-- ─────────────────────────────────────────────────────────────
UPDATE laws SET observacao =
  'Aprovação prévia pelo Conselho competente. Destinação durante o ano-calendário: '
  || 'dedução até 6% do imposto devido, dentro do teto do art. 22 da Lei 9.532/1997, '
  || 'compartilhado com Rouanet e Idoso. Os 3% do art. 260-A do ECA são a via '
  || 'separada de destinar na própria declaração de ajuste.'
 WHERE slug = 'fia';

UPDATE laws SET observacao =
  'Mesma sistemática do FDCA. Destinação durante o ano-calendário: dedução até 6% '
  || 'do imposto devido, no teto compartilhado do art. 22 da Lei 9.532/1997. '
  || 'A Lei 12.213/2010 incluiu os conselhos do idoso no inciso I do art. 12 da '
  || 'Lei 9.250/1995 — mesmo teto, não um teto a mais.'
 WHERE slug = 'idoso';

-- ─────────────────────────────────────────────────────────────
-- 2. O motivo do bloqueio deixa de prometer que é sempre jurídico
-- ─────────────────────────────────────────────────────────────
ALTER TABLE incentive_groups RENAME COLUMN pendencia_parecer TO motivo_indisponivel;

COMMENT ON COLUMN incentive_groups.motivo_indisponivel IS
  'NULL quando operável; senão, por que não pode ir para um cliente — pode ser '
  'pendência jurídica (teto não resolvido) ou de produto (jornada não construída).';

-- ─────────────────────────────────────────────────────────────
-- 3. FDCA e Idoso: teto resolvido, jornada não
--
-- O teto passa a apontar para o global, que é o correto e o que o resto do
-- sistema já usava. Continuam fora da escolha do cliente — mas agora pelo
-- motivo verdadeiro.
-- ─────────────────────────────────────────────────────────────
UPDATE incentive_groups
   SET teto_codigo = 'irpf_global_6',
       motivo_indisponivel =
         'Teto resolvido: 6% durante o ano, no teto compartilhado com a Rouanet. '
         || 'Falta a jornada — o assistente pede PRONAC e consulta o SALIC, e um fundo '
         || 'municipal não tem PRONAC: tem CNPJ do fundo, e é o fundo que emite o recibo.'
 WHERE code IN ('fia', 'idoso');
