-- 043 — O mecanismo de incentivo é escolha do cliente, não constante do código.
--
-- QUATRO pontos do código escolhiam o mecanismo lendo
-- `org.incentive_group_code`, com reserva 'ROUANET':
--
--   lib/textosFiscais.js, routes/calculator.js, routes/donations.js, routes/config.js
--
-- A coluna NUNCA EXISTIU. `req.organization` vem de `SELECT * FROM
-- organizations`, então a leitura era sempre `undefined` e todo cliente caía
-- na reserva. O interruptor por tenant foi desenhado e nunca ligado: na
-- prática, nenhum white label podia operar outro mecanismo, e a tela de
-- clientes sequer oferecia a escolha.
--
-- Dois catálogos conviviam sem se falar:
--
--   `laws` (migration 018)   os sete mecanismos, com base legal, órgão e
--                            sistema oficial. Conteúdo, nada de cálculo.
--   `incentive_groups`       o que o cálculo consulta — e que tinha só a
--                            Rouanet, DUAS vezes: 'ROUANET' e 'rouanet'.
--
-- Esta migration liga o interruptor e junta os dois catálogos:
--
--   1. desfaz a duplicata, alinhando o código do grupo ao slug de `laws`;
--   2. cria os grupos que faltavam, a partir de `laws`;
--   3. marca quais podem ser atribuídos a um cliente;
--   4. dá a `organizations` a coluna que o código já lia.
--
-- SOBRE O PASSO 3 — por que só a Rouanet fica disponível.
--
-- Teto é dado (`tetos_deducao`), não constante, e mecanismo sem teto
-- resolvido não pode ser oferecido: `tetoDoMecanismo()` cai no teto global de
-- 6% quando não encontra o do mecanismo, e 6% é PERMISSIVO demais para quase
-- todos os outros. Liberar por engano é liberar acima da lei — o erro que
-- este projeto sempre escolheu não cometer.
--
--   LIE            7% na tabela, mas a LC 222/2025 revogou a lei anterior e o
--                  percentual precisa ser reconferido. Para pessoa física
--                  concorre com a Rouanet no mesmo teto (migration 031).
--                  Item 1 da consulta ao tributarista.
--   FDCA e Idoso   dividem o teto global de 6% — essa parte está resolvida.
--                  Mas o catálogo `laws` registra "destinação durante o ano
--                  até 3%; doação na declaração até 6%", e a destinação
--                  durante o ano é exatamente o que esta plataforma faz. Se
--                  o limite do nosso fluxo for 3%, oferecer 6% seria liberar
--                  o dobro. Item 11 da consulta.
--   Recicla+       item 4 da consulta.
--   PRONON/PRONAS  1% cada, ou 1% somados, dentro ou fora do teto global —
--                  item 3 da consulta.
--
-- Cada bloqueio fica escrito na própria linha (`pendencia_parecer`), para a
-- tela de clientes dizer ao superadmin por que o mecanismo está cinza. A
-- confirmação do teto em si continua em `tetos_deducao.confirmado_por_parecer`.

-- ─────────────────────────────────────────────────────────────
-- 1. Colunas novas do catálogo operacional
-- ─────────────────────────────────────────────────────────────
ALTER TABLE incentive_groups
  ADD COLUMN IF NOT EXISTS law_slug                VARCHAR(20) REFERENCES laws(slug) ON UPDATE CASCADE,
  ADD COLUMN IF NOT EXISTS disponivel_para_cliente BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pendencia_parecer       TEXT;

COMMENT ON COLUMN incentive_groups.law_slug IS
  'Liga este grupo à lei em `laws` (base legal, órgão, sistema oficial).';
COMMENT ON COLUMN incentive_groups.disponivel_para_cliente IS
  'Só TRUE quando o teto do mecanismo está resolvido. A rota do superadmin recusa os demais.';
COMMENT ON COLUMN incentive_groups.pendencia_parecer IS
  'NULL quando operável; senão, o que falta decidir — texto mostrado ao superadmin.';

-- ─────────────────────────────────────────────────────────────
-- 2. Desfaz a duplicata ROUANET/rouanet
--
-- Escrito para qualquer estado de partida: os dois existirem, só um, ou já
-- estar em minúscula. `official_funds.incentive_group_id` é a única chave
-- estrangeira que aponta para cá; os fundos da duplicata são repontados antes
-- de ela sair.
-- ─────────────────────────────────────────────────────────────
UPDATE official_funds
   SET incentive_group_id = (SELECT id FROM incentive_groups WHERE code = 'ROUANET')
 WHERE incentive_group_id = (SELECT id FROM incentive_groups WHERE code = 'rouanet')
   AND EXISTS (SELECT 1 FROM incentive_groups WHERE code = 'ROUANET');

DELETE FROM incentive_groups
 WHERE code = 'rouanet'
   AND EXISTS (SELECT 1 FROM incentive_groups WHERE code = 'ROUANET');

UPDATE incentive_groups SET code = 'rouanet' WHERE code = 'ROUANET';

-- Rede de segurança: o passo 4 cria uma chave estrangeira com padrão
-- 'rouanet'. Se por qualquer motivo a linha não existir, o ALTER falharia e
-- abortaria o boot inteiro.
INSERT INTO incentive_groups (code, name, max_percentage, period_type, description)
SELECT 'rouanet', 'Lei Rouanet — Incentivo à Cultura', 6.00, 'annual',
       'Destinação a projetos culturais aprovados pelo MinC (Lei 8.313/1991, art. 18)'
 WHERE NOT EXISTS (SELECT 1 FROM incentive_groups WHERE code = 'rouanet');

-- ─────────────────────────────────────────────────────────────
-- 3. Os que faltavam, a partir de `laws`
-- ─────────────────────────────────────────────────────────────
INSERT INTO incentive_groups (code, name, max_percentage, period_type, description, law_slug)
SELECT l.slug,
       COALESCE(l.nickname, l.name),
       COALESCE(l.max_pf_percent, 6.00),
       'annual',
       l.base_legal,
       l.slug
  FROM laws l
 WHERE NOT EXISTS (SELECT 1 FROM incentive_groups g WHERE g.code = l.slug);

-- Liga os que já existiam à lei correspondente.
UPDATE incentive_groups g
   SET law_slug = l.slug
  FROM laws l
 WHERE g.code = l.slug AND g.law_slug IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. Quem pode ser atribuído a um cliente, e por que os outros não
-- ─────────────────────────────────────────────────────────────
UPDATE incentive_groups
   SET disponivel_para_cliente = TRUE,
       teto_codigo             = 'irpf_global_6',
       pendencia_parecer       = NULL
 WHERE code = 'rouanet';

UPDATE incentive_groups SET pendencia_parecer =
  'Percentual a reconferir: a LC 222/2025 revogou a lei anterior. Para pessoa '
  || 'física concorre com a Rouanet no mesmo teto. Item 1 da consulta ao tributarista.'
 WHERE code = 'lie';

UPDATE incentive_groups SET pendencia_parecer =
  'Divide o teto global de 6% — isso está resolvido. Falta o limite da '
  || 'DESTINAÇÃO DURANTE O ANO, que é o fluxo desta plataforma: o catálogo '
  || 'registra 3%, e 6% só na declaração. Item 11 da consulta ao tributarista.'
 WHERE code IN ('fia', 'idoso');

UPDATE incentive_groups SET pendencia_parecer =
  'Limite e enquadramento no teto global ainda não confirmados. Item 4 da consulta ao tributarista.'
 WHERE code = 'lir';

UPDATE incentive_groups SET pendencia_parecer =
  '1% cada ou 1% somados, dentro ou fora do teto global — não confirmado. '
  || 'Item 3 da consulta ao tributarista.'
 WHERE code IN ('pronon', 'pronas');

-- Mecanismo sem teto resolvido não aponta para teto nenhum. `tetoDoMecanismo()`
-- cairia no global de 6%, permissivo demais para quase todos eles — e é por
-- isso que nenhum está disponível para cliente.
UPDATE incentive_groups SET teto_codigo = NULL
 WHERE pendencia_parecer IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 5. A coluna que o código já lia
-- ─────────────────────────────────────────────────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS incentive_group_code VARCHAR(20) NOT NULL DEFAULT 'rouanet'
    REFERENCES incentive_groups(code) ON UPDATE CASCADE;

COMMENT ON COLUMN organizations.incentive_group_code IS
  'Mecanismo de incentivo deste cliente. Um por cliente (decisão de set/2026).';

CREATE INDEX IF NOT EXISTS idx_organizations_mecanismo
  ON organizations (incentive_group_code);
