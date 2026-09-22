-- 051 — O que identifica a destinação, e como o mecanismo se chama na tela
--
-- POR QUE
--
-- A rota de registro exige PRONAC de seis ou sete dígitos e fixa o fundo da
-- Rouanet no código:
--
--   if (!pronac || !/^\d{6,7}$/.test(pronac)) → 400
--   SELECT id FROM official_funds WHERE code = 'FNC'
--
-- Um fundo municipal não tem PRONAC. Tem CNPJ, uma OSC indicada pelo doador
-- e um recibo emitido pelo próprio Conselho. Enquanto essas duas linhas
-- existirem, nenhum cliente fora da Rouanet consegue registrar destinação —
-- e é por isso que o FDCA está pronto no cálculo e parado na jornada.
--
-- O QUE IDENTIFICA A DESTINAÇÃO
--
-- Na Rouanet, o PRONAC: um registro externo, conferível no SALIC, que existe
-- antes de o cliente entrar na plataforma.
--
-- No FDCA/DF, não há número externo. A RN 125/2026 (art. 5º) diz que o doador
-- indica a OSC e, se quiser, o projeto. A OSC e o projeto são exatamente o que
-- `org_projects` guarda. Então a destinação aponta para o projeto do tenant, e
-- ponto — nenhum identificador a digitar.
--
-- `identificador` diz qual dos dois vale. Explícito, e não deduzido de "o
-- projeto tem pronac preenchido?": dedução silenciosa é o que faz um cliente
-- mal cadastrado cair na jornada errada sem ninguém perceber.
--
-- O VOCABULÁRIO TAMBÉM MUDA
--
-- "PRONAC", "proponente" e "Recibo de Mecenato" são palavras da Rouanet. No
-- FDCA quem recebe é o fundo, quem executa é a OSC, e quem emite o recibo é o
-- CDCA/DF — não o proponente, que nem tem conta na plataforma.
--
-- Vai em `laws` porque é conteúdo do mecanismo, ao lado de `orgao` e
-- `sistema_oficial`, e `mecanismoDaOrg()` já junta as duas tabelas. A tela lê
-- de `/api/config/brand`; nenhuma página escreve essas palavras à mão, pela
-- mesma razão que nenhuma escreve percentual.

-- ─────────────────────────────────────────────────────────────
-- 1. O que identifica a destinação
-- ─────────────────────────────────────────────────────────────
ALTER TABLE incentive_groups
  ADD COLUMN IF NOT EXISTS identificador TEXT NOT NULL DEFAULT 'projeto_do_tenant'
    CHECK (identificador IN ('pronac', 'projeto_do_tenant'));

COMMENT ON COLUMN incentive_groups.identificador IS
  '"pronac": a destinação carrega um número de registro externo, conferível no '
  'sistema oficial (só a Rouanet hoje). "projeto_do_tenant": não há número a '
  'digitar — a destinação aponta para o projeto ativo da organização, que é '
  'onde moram a OSC, o fundo e a conta.';

-- A Rouanet é a única com registro externo. O padrão da coluna já deixa os
-- demais em 'projeto_do_tenant'; este UPDATE é o que diz que a exceção é ela.
UPDATE incentive_groups SET identificador = 'pronac' WHERE code = 'rouanet';

-- ─────────────────────────────────────────────────────────────
-- 2. O vocabulário do mecanismo
-- ─────────────────────────────────────────────────────────────
ALTER TABLE laws
  ADD COLUMN IF NOT EXISTS termo_identificador TEXT,
  ADD COLUMN IF NOT EXISTS termo_beneficiario  TEXT,
  ADD COLUMN IF NOT EXISTS termo_recibo        TEXT,
  ADD COLUMN IF NOT EXISTS termo_recibo_emissor TEXT;

COMMENT ON COLUMN laws.termo_identificador IS
  'Como se chama o número que identifica o projeto ("PRONAC"). NULL quando o '
  'mecanismo não tem registro externo — e aí a tela não pede nada.';

COMMENT ON COLUMN laws.termo_beneficiario IS
  'Como se chama quem recebe e executa: "proponente" na Rouanet, "OSC" no FDCA.';

COMMENT ON COLUMN laws.termo_recibo IS
  'O nome do documento que dá direito à dedução: "Recibo de Mecenato" na '
  'Rouanet, "Recibo de Doação" no FDCA/DF (RN 125/2026, art. 8º).';

COMMENT ON COLUMN laws.termo_recibo_emissor IS
  'Quem emite esse recibo. Na Rouanet é o proponente, que tem conta aqui; no '
  'FDCA/DF é o próprio Conselho, que não tem — e é isso que muda a jornada.';

UPDATE laws SET
  termo_identificador  = 'PRONAC',
  termo_beneficiario   = 'proponente',
  termo_recibo         = 'Recibo de Mecenato',
  termo_recibo_emissor = 'o proponente do projeto'
 WHERE slug = 'rouanet';

UPDATE laws SET
  termo_identificador  = NULL,
  termo_beneficiario   = 'OSC',
  termo_recibo         = 'Recibo de Doação',
  termo_recibo_emissor = 'a Secretaria Executiva do CDCA/DF'
 WHERE slug = 'fia';

-- O Fundo da Pessoa Idosa tem conselho próprio, que não lemos. Fica com o
-- termo genérico em vez de herdar o do CDCA/DF: nomear o emissor errado num
-- documento fiscal é pior do que não nomear.
UPDATE laws SET
  termo_identificador  = NULL,
  termo_beneficiario   = 'entidade beneficiária',
  termo_recibo         = 'recibo de doação',
  termo_recibo_emissor = 'o conselho gestor do fundo'
 WHERE slug = 'idoso';
