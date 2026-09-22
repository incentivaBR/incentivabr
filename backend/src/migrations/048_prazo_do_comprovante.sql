-- 048 — A data da transferência e o prazo para apresentar o comprovante
--
-- POR QUE
--
-- A Resolução Normativa nº 125/2026 do CDCA/DF, art. 7º, dá ao contribuinte
-- 60 dias CONTADOS DA DATA DA DOAÇÃO para apresentar o comprovante de depósito
-- à Secretaria Executiva do CDCA/DF — e é isso que faz o recibo ser emitido.
-- Sem recibo não há dedução, com o dinheiro já transferido.
--
-- É o único prazo do produto que mata o benefício depois de a pessoa ter
-- pagado. A Rouanet não tem equivalente: lá o proponente emite o recibo e não
-- há janela.
--
-- O QUE FALTAVA, E É O MOTIVO DESTA MIGRATION
--
-- Não dava para contar esse prazo, porque a data da doação não existia no
-- banco. `donations` tinha:
--
--   created_at   — quando a destinação foi REGISTRADA na plataforma
--   confirmed_at — quando o gestor CONFERIU o comprovante
--
-- Nenhuma das duas é a data em que o dinheiro saiu da conta do contribuinte.
-- Entre registrar e transferir pode passar uma semana; entre transferir e o
-- gestor conferir, outra. Contar de qualquer uma delas daria uma data errada
-- — e errada para MAIS, que é o lado que faz alguém perder o prazo achando
-- que ainda tem folga.
--
-- Por isso a data passa a ser informada por quem sabe: o contribuinte, ao
-- enviar o comprovante, lendo do próprio comprovante bancário. É DATE, não
-- TIMESTAMP: o comprovante traz o dia, e fingir precisão de hora seria
-- inventar.
--
-- POR QUE O PRAZO VIVE NO FUNDO, E NÃO NUMA CONSTANTE
--
-- Quem fixa os 60 dias é o Conselho do DF, na resolução dele. Outro conselho
-- municipal pode fixar 30 ou 90, e o mesmo conselho pode mudar o seu numa
-- resolução nova. Prazo é dado, como o teto é dado — mudar vira UPDATE, não
-- deploy. Fica em `official_funds` porque é do fundo, não do mecanismo: o
-- mecanismo "FDCA" é um só e os conselhos são muitos.
--
-- O QUE ESTA MIGRATION NÃO FAZ
--
-- Não cadastra a conta do FDCA/DF. A resolução publica agência, conta e CNPJ,
-- e mesmo assim eles não entram aqui: dado bancário vem do banco, por tenant,
-- pela tela de clientes. Um número gravado em migration envelhece calado na
-- primeira resolução que o mudar, e é justamente o erro que a 022 cometeu.

-- ─────────────────────────────────────────────────────────────
-- 1. A data em que o dinheiro saiu
-- ─────────────────────────────────────────────────────────────
ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS transferido_em DATE;

COMMENT ON COLUMN donations.transferido_em IS
  'Dia em que o contribuinte transferiu, lido do comprovante bancário por ele '
  'mesmo. NÃO é created_at (registro na plataforma) nem confirmed_at '
  '(conferência do gestor). É desta data que correm os prazos do fundo.';

-- ─────────────────────────────────────────────────────────────
-- 2. O prazo, por fundo
-- ─────────────────────────────────────────────────────────────
-- `federal_law` e `local_law` nasceram VARCHAR(50), e uma citação legal
-- brasileira de verdade não cabe em 50 caracteres: o FDCA/DF é regido por
-- "LC Distrital 151/1998, alterada pela LC Distrital 849/2012; Lei Distrital
-- 5.244/2013", que tem 84. Truncar a referência para caber na coluna seria
-- guardar um dado pela metade — e é a referência que o contador confere.
-- O pg-mem não impõe tamanho de varchar; quem pegou isto foi o job do
-- Postgres real.
ALTER TABLE official_funds
  ALTER COLUMN federal_law TYPE TEXT,
  ALTER COLUMN local_law   TYPE TEXT;

ALTER TABLE official_funds
  ADD COLUMN IF NOT EXISTS prazo_comprovante_dias       INTEGER
    CHECK (prazo_comprovante_dias IS NULL OR prazo_comprovante_dias > 0),
  ADD COLUMN IF NOT EXISTS prazo_comprovante_orgao      TEXT,
  ADD COLUMN IF NOT EXISTS prazo_comprovante_base_legal TEXT;

COMMENT ON COLUMN official_funds.prazo_comprovante_dias IS
  'Dias corridos, contados da data da transferência, para o contribuinte '
  'apresentar o comprovante ao órgão que emite o recibo. NULL quando o fundo '
  'não tem prazo — é o caso da Rouanet, onde o proponente emite sem janela.';

COMMENT ON COLUMN official_funds.prazo_comprovante_orgao IS
  'Quem recebe o comprovante e emite o recibo, por extenso, para a tela dizer '
  'à pessoa onde ela tem de ir.';

COMMENT ON COLUMN official_funds.prazo_comprovante_base_legal IS
  'O dispositivo que fixa o prazo. Sem ele o número é palpite, e a pessoa que '
  'perder o prazo merece saber de onde ele saiu.';

-- ─────────────────────────────────────────────────────────────
-- 3. O FDCA/DF, sem dado bancário
--
-- Entra como catálogo: o que a norma fixa e que não muda por cliente. A
-- agência, a conta e o CNPJ ficam de fora de propósito (ver cabeçalho) e são
-- preenchidos por tenant em org_projects.
-- ─────────────────────────────────────────────────────────────
INSERT INTO official_funds (code, name, legal_name, fund_type, federal_law, local_law,
                            donation_mode, requires_project, requires_pre_approval, is_active,
                            prazo_comprovante_dias, prazo_comprovante_orgao, prazo_comprovante_base_legal)
SELECT 'FDCA-DF',
       'Fundo dos Direitos da Criança e do Adolescente do Distrito Federal',
       'Fundo dos Direitos da Criança e do Adolescente do Distrito Federal — FDCA/DF',
       'distrital',
       'Lei 8.069/1990 (ECA), arts. 260 e seguintes',
       'LC Distrital 151/1998, alterada pela LC Distrital 849/2012; Lei Distrital 5.244/2013',
       'both',
       TRUE,   -- a captação é autorizada para projeto específico (RN 125/2026, art. 4º)
       TRUE,   -- a OSC precisa do Certificado de Autorização para Captação (art. 12)
       TRUE,
       60,
       'Secretaria Executiva do CDCA/DF',
       'Resolução Normativa CDCA/DF nº 125, de 06/05/2026, art. 7º'
 WHERE NOT EXISTS (SELECT 1 FROM official_funds WHERE code = 'FDCA-DF');

-- Liga ao mecanismo do catálogo, se o grupo existir com esse código.
UPDATE official_funds f
   SET incentive_group_id = g.id
  FROM incentive_groups g
 WHERE f.code = 'FDCA-DF' AND g.code = 'fia' AND f.incentive_group_id IS NULL;

-- A Rouanet não tem prazo: o proponente emite o Recibo de Mecenato sem janela.
-- Deixar explícito evita que alguém suponha que o campo só não foi preenchido.
COMMENT ON TABLE official_funds IS
  'Catálogo dos fundos oficiais. Dados bancários aqui são referência de '
  'catálogo; a conta para onde o contribuinte transfere vem SEMPRE de '
  'org_projects, por tenant, e só de projeto ativo.';
