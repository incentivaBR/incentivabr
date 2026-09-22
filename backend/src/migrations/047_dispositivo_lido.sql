-- 047 — O texto legal foi lido; o catálogo passa a citar o dispositivo
--
-- ORIGEM
--
-- A migration 045 corrigiu o catálogo a partir de uma nota de PESQUISA, e
-- marcou tudo como "fonte secundária": o ambiente de trabalho não alcança o
-- planalto.gov.br, então ninguém tinha lido o texto da lei. Agora o texto dos
-- dois dispositivos foi trazido e lido na íntegra.
--
-- O QUE MUDA, E O QUE NÃO MUDA
--
-- Muda a PROCEDÊNCIA: sai "conferido em fonte secundária", entra a citação do
-- dispositivo. O site também deixa de marcar esses dois pontos como não
-- confirmados.
--
-- NÃO muda `confirmado_por_parecer`. Ler a lei não é ter parecer. Essa coluna
-- significa "um tributarista assinou dizendo que a nossa leitura está certa", e
-- continua FALSE em todas as linhas. O que se ganhou aqui é saber o que o texto
-- DIZ; o que falta é alguém responder, com responsabilidade técnica, se a nossa
-- aplicação dele está correta.
--
-- ─────────────────────────────────────────────────────────────
-- O QUE O TEXTO RESOLVEU
--
-- LC 222/2025, art. 9º, § 1º, II — literal:
--
--   "relativamente à pessoa física, a 7% (sete por cento) do imposto devido na
--    Declaração de Ajuste Anual, conjuntamente com as deduções a que se referem
--    os incisos I, II e III do caput do art. 12 da Lei nº 9.250, de 26 de
--    dezembro de 1995."
--
-- "Conjuntamente" encerra a dúvida: não é teto adicional, é a mesma cesta
-- subindo de 6% para 7%.
--
-- Lei 12.715/2012, art. 4º, § 6º, I, "d" — literal:
--
--   "ficam limitadas a 1% (um por cento) do imposto sobre a renda devido com
--    relação ao programa de que trata o art. 1º, e a 1% (um por cento) do
--    imposto sobre a renda devido com relação ao programa de que trata o
--    art. 3º"
--
-- Art. 1º é o PRONON, art. 3º é o PRONAS/PCD: 1% para cada, como a 045 já
-- tinha corrigido. O § 8º ("não excluem outros benefícios, abatimentos e
-- deduções em vigor") confirma que ficam fora do teto geral, e a alínea "c"
-- do mesmo inciso confirma a exigência de declaração pelas deduções legais.
--
-- O QUE O TEXTO REVELOU, E É MAIS GRAVE
--
-- O caput do art. 4º, com a redação da Lei 14.564/2023, faculta a dedução
-- "às pessoas físicas, a partir do ano-calendário de 2012 até o ano-calendário
-- de 2025, e às pessoas jurídicas, a partir do ano-calendário de 2013 até o
-- ano-calendário de 2026".
--
-- Ou seja: para pessoa física o benefício ALCANÇOU até 2025. Isto deixou de
-- ser "vigência não confirmada" e passou a ser um prazo que o texto fixa. Não
-- foi encontrada norma posterior prorrogando; enquanto não houver, destinação
-- de pessoa física feita a partir de 2026 não gera dedução, e o site não pode
-- oferecer o mecanismo como se gerasse.
-- ─────────────────────────────────────────────────────────────

UPDATE tetos_deducao
   SET observacao = 'NÃO USAR sem parecer, e nenhum mecanismo aponta para este teto. '
                 || 'O art. 9º, § 1º, II, da LC 222/2025 foi lido na íntegra e diz 7% do '
                 || 'imposto devido na DAA "conjuntamente com as deduções a que se referem '
                 || 'os incisos I, II e III do caput do art. 12 da Lei nº 9.250/1995" — a '
                 || 'cesta inteira sobe de 6% para 7%, não se abre uma segunda. O que falta '
                 || 'não é mais a fonte: é a lógica condicional em saldoDisponivel(), que '
                 || 'hoje só sabe um teto fixo, e o parecer sobre a aplicação.'
 WHERE codigo = 'irpf_global_7';

UPDATE laws SET observacao =
  'A LC 222/2025 substituiu a Lei 11.438/2006 e tornou o incentivo permanente. Para '
  || 'pessoa física, art. 9º, § 1º, II: 7% do imposto devido na Declaração de Ajuste '
  || 'Anual, CONJUNTAMENTE com os incisos I, II e III do caput do art. 12 da Lei '
  || '9.250/1995 — não é teto próprio. Texto lido na íntegra. '
  || 'Manifestações: Formação Esportiva, Esporte para Toda a Vida, Excelência '
  || 'Esportiva. Vedado pagamento de atleta profissional.'
 WHERE slug = 'lie';

UPDATE laws SET observacao =
  'Art. 4º, § 6º, I, "d", da Lei 12.715/2012: 1% do imposto devido para o programa do '
  || 'art. 1º (PRONON) e outro 1% para o do art. 3º (PRONAS/PCD) — limites separados. '
  || 'O § 8º confirma que não entram no teto geral do art. 22 da Lei 9.532/1997. A '
  || 'alínea "c" exige declaração pelas deduções legais. '
  || 'ATENÇÃO: o caput, com a redação da Lei 14.564/2023, faculta a dedução à PESSOA '
  || 'FÍSICA apenas ATÉ O ANO-CALENDÁRIO DE 2025 (pessoa jurídica até 2026). Sem norma '
  || 'posterior que prorrogue, destinação de pessoa física a partir de 2026 não gera '
  || 'dedução. Texto lido na íntegra.'
 WHERE slug IN ('pronon', 'pronas');

-- ─────────────────────────────────────────────────────────────
-- Os motivos do bloqueio passam a dizer o que o texto revelou
-- ─────────────────────────────────────────────────────────────
UPDATE incentive_groups SET motivo_indisponivel =
  'Teto confirmado no texto: 7% conjunto (LC 222/2025, art. 9º, § 1º, II), registrado '
  || 'em irpf_global_7. Falta a lógica condicional em saldoDisponivel(), que hoje só '
  || 'sabe um teto fixo, e o parecer sobre a aplicação. Item 1 da consulta.'
 WHERE code = 'lie';

UPDATE incentive_groups SET motivo_indisponivel =
  'VIGÊNCIA ENCERRADA PARA PESSOA FÍSICA: o caput do art. 4º da Lei 12.715/2012 '
  || '(redação da Lei 14.564/2023) faculta a dedução à pessoa física até o '
  || 'ano-calendário de 2025, e não há norma posterior conhecida prorrogando. Esta '
  || 'plataforma opera pessoa física, então o mecanismo não pode ser oferecido. O teto '
  || 'em si está resolvido: 1% próprio de cada programa, fora do teto geral '
  || '(art. 4º, § 6º, I, "d", e § 8º). Em standby por decisão de produto (set/2026): '
  || 'sem vigência, não há o que construir. Item 2 da consulta.'
 WHERE code IN ('pronon', 'pronas');
