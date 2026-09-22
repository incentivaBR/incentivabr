-- 050 — Sublimite por mecanismo, DENTRO do teto compartilhado
--
-- POR QUE
--
-- A Resolução Normativa nº 125/2026 do CDCA/DF diz, no art. 2º, § 1º, II, que
-- a dedução da pessoa física não pode ultrapassar 3% do imposto apurado na
-- Declaração de Ajuste Anual — e o § 3º aplica esse mesmo limite tanto à
-- doação feita na própria declaração quanto às feitas durante o ano.
--
-- A plataforma calcula 6%, apoiada no art. 22 da Lei 9.532/1997 ("não se
-- aplicando limites específicos a nenhuma delas"). O conselho que EMITE O
-- RECIBO do nosso piloto diz metade disso.
--
-- Decisão de set/2026: seguir a RN 125. Não porque saibamos que o conselho
-- está certo — a pergunta 1 da consulta ao tributarista continua aberta —,
-- mas porque 3% é menor que 6% sob qualquer leitura, e é o número que o órgão
-- que dá o recibo ao servidor publica. Errar para menos, alinhado com quem
-- emite o documento.
--
-- A ARMADILHA QUE ESTA MIGRATION EVITA
--
-- O jeito intuitivo seria criar um teto `irpf_fdca_3` e apontar o FDCA para
-- ele. Isso seria PIOR do que não fazer nada.
--
-- `saldoDisponivel()` soma o que já foi destinado contra o MESMO
-- `teto_codigo`. É esse cruzamento que impede alguém de destinar 6% pela
-- Rouanet e mais 6% ao FDCA. Dar ao FDCA um teto próprio quebraria o
-- cruzamento, e o contribuinte poderia fazer 6% de Rouanet MAIS 3% de FDCA:
-- nove por cento, acima de qualquer leitura.
--
-- Por isso o FDCA CONTINUA apontando para `irpf_global_6` — segue dividindo o
-- bolo com a Rouanet — e ganha um SUBLIMITE que limita a fatia dele a 3%.
-- São duas perguntas diferentes, e as duas precisam de resposta:
--
--   "quanto ainda cabe no bolo de 6%?"        → teto compartilhado
--   "quanto ainda cabe na fatia deste fundo?" → sublimite
--
-- Vale o menor dos dois.
--
-- POR QUE SÓ O FDCA, E NÃO O FUNDO DO IDOSO
--
-- A RN 125 é do Conselho dos Direitos da Criança e do Adolescente e trata do
-- FDCA. O Fundo da Pessoa Idosa tem conselho próprio e norma própria, que não
-- lemos. Aplicar a ele os 3% do FDCA seria inventar um limite sem fonte —
-- exatamente o erro que a migration 044 corrigiu, na direção oposta.
--
-- Os dois seguem indisponíveis para cliente, então nada está exposto. Fica
-- registrado em `motivo_indisponivel` que a pergunta equivalente do Idoso
-- está aberta.

ALTER TABLE incentive_groups
  ADD COLUMN IF NOT EXISTS sublimite_pct        NUMERIC(5,2)
    CHECK (sublimite_pct IS NULL OR (sublimite_pct > 0 AND sublimite_pct <= 100)),
  ADD COLUMN IF NOT EXISTS sublimite_base_legal TEXT;

COMMENT ON COLUMN incentive_groups.sublimite_pct IS
  'Percentual do imposto devido que este mecanismo sozinho pode consumir, '
  'DENTRO do teto compartilhado que `teto_codigo` aponta. NULL significa que o '
  'mecanismo pode usar o teto inteiro — é o caso da Rouanet. Não é um teto '
  'separado: o mecanismo continua somando contra o mesmo bolo dos outros.';

COMMENT ON COLUMN incentive_groups.sublimite_base_legal IS
  'De onde vem o sublimite. Sem isto o número é palpite, e quem for barrado '
  'por ele merece saber quem o fixou.';

-- ─────────────────────────────────────────────────────────────
-- O FDCA passa a 3%, continuando no bolo de 6%
-- ─────────────────────────────────────────────────────────────
UPDATE incentive_groups
   SET sublimite_pct        = 3.00,
       sublimite_base_legal = 'Resolução Normativa CDCA/DF nº 125, de 06/05/2026, '
                           || 'art. 2º, § 1º, II, c/c § 3º — adotado por ser o limite '
                           || 'publicado pelo conselho que emite o recibo, enquanto a '
                           || 'pergunta 1 da consulta ao tributarista (3% x 6%) não '
                           || 'for respondida por escrito.'
 WHERE code = 'fia';

-- O teto_codigo NÃO muda: é isso que mantém o cruzamento com a Rouanet.
-- Repetido de propósito, como a 031 fez — se alguém apontar o FDCA para um
-- teto próprio, o cruzamento morre em silêncio.
UPDATE incentive_groups
   SET teto_codigo = 'irpf_global_6'
 WHERE code = 'fia' AND teto_codigo IS DISTINCT FROM 'irpf_global_6';

UPDATE incentive_groups SET motivo_indisponivel =
  'Teto resolvido e limitado a 3% pela RN 125/2026 do CDCA/DF (sublimite dentro dos '
  || '6% compartilhados). Falta a jornada: o assistente pede PRONAC e consulta o SALIC, '
  || 'e o fundo não tem PRONAC — tem CNPJ, OSC indicada e recibo emitido pelo próprio '
  || 'Conselho. Item 1 da consulta segue aberto para eventualmente subir a 6%.'
 WHERE code = 'fia';

UPDATE incentive_groups SET motivo_indisponivel =
  'Teto resolvido: 6% durante o ano, no teto compartilhado com a Rouanet. NÃO recebeu '
  || 'o sublimite de 3% do FDCA: a RN 125/2026 é do Conselho da Criança e do '
  || 'Adolescente, e a norma equivalente do conselho da pessoa idosa não foi lida. '
  || 'Aplicar aqui um limite sem fonte seria inventar. Falta também a jornada.'
 WHERE code = 'idoso';
