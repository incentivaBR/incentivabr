-- 052 — A foto do projeto, e a autorização que ela exige
--
-- POR QUE
--
-- Até aqui não havia campo de imagem no cadastro do projeto. A página de
-- projetos diz isso com todas as letras, num comentário:
--
--   "Aqui havia a foto do projeto do piloto. Não há campo de imagem no
--    cadastro do projeto; até haver, o fundo é a paleta, não a foto de um
--    projeto que pode não ser o do cliente."
--
-- A foto saiu porque era a do projeto do piloto aparecendo no site de
-- QUALQUER cliente. Tirar foi certo; ficar sem é o que trava o white-label:
-- uma home sem imagem nenhuma não sustenta uma apresentação.
--
-- POR QUE A AUTORIZAÇÃO É COLUNA, E NÃO RECOMENDAÇÃO
--
-- O primeiro cliente atende crianças e adolescentes, e é disso que são as
-- fotos boas: oficina de música, dança, teatro. Imagem de criança
-- identificável não é foto comum.
--
--   ECA (Lei 8.069/1990), arts. 17 e 18 — o direito ao respeito compreende a
--   preservação da imagem, e é dever de todos velar pela dignidade da criança
--   e do adolescente.
--
--   LGPD, art. 14 — o tratamento de dado pessoal de criança e adolescente
--   deve ser feito em seu melhor interesse.
--
-- Quem responde por essa autorização é a organização, que conhece as famílias
-- e guarda os termos assinados. A plataforma não pode conferir isso — mas pode
-- se recusar a publicar sem que alguém declare, com nome e data, que a
-- autorização existe. É o que estas colunas fazem: `foto_autorizacao_em` e
-- `foto_autorizacao_por` são o registro de quem afirmou o quê e quando.
--
-- Sem essa declaração a foto fica guardada e NÃO é publicada. Um aviso na tela
-- seria pedido; uma coluna que a consulta filtra é regra.
--
-- POR QUE A CHAVE, E NÃO UMA URL
--
-- Guardar a URL da foto no site do cliente seria mais rápido e erraria em
-- dois lugares: a imagem muda ou sai do ar sem ninguém aqui saber, e o
-- navegador do servidor público passa a buscar arquivo num terceiro domínio.
-- O arquivo vai para o mesmo armazenamento dos comprovantes
-- (services/armazenamento.js), e o banco guarda a chave, o SHA-256 e o
-- tamanho — a mesma disciplina da migration 037.

ALTER TABLE org_projects
  ADD COLUMN IF NOT EXISTS foto_chave           TEXT,
  ADD COLUMN IF NOT EXISTS foto_credito         TEXT,
  ADD COLUMN IF NOT EXISTS foto_sha256          TEXT,
  ADD COLUMN IF NOT EXISTS foto_bytes           INTEGER,
  ADD COLUMN IF NOT EXISTS foto_atualizada_em   TIMESTAMP,
  ADD COLUMN IF NOT EXISTS foto_autorizacao_em  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS foto_autorizacao_por UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN org_projects.foto_chave IS
  'Chave da imagem no armazenamento (services/armazenamento.js), como o '
  'comprovante. Nunca uma URL de terceiro: a imagem sairia do ar sem ninguém '
  'aqui saber.';

COMMENT ON COLUMN org_projects.foto_credito IS
  'Crédito da foto, como deve aparecer na tela. Fotógrafo, projeto ou acervo.';

COMMENT ON COLUMN org_projects.foto_autorizacao_em IS
  'Quando a organização declarou ter a autorização de uso de imagem das '
  'pessoas retratadas. NULL = a foto existe no armazenamento e NÃO é '
  'publicada. ECA, arts. 17 e 18; LGPD, art. 14 (criança e adolescente).';

COMMENT ON COLUMN org_projects.foto_autorizacao_por IS
  'Quem declarou. Sem nome e data, "a organização autorizou" é afirmação sem '
  'responsável — e imagem de criança é o pior lugar para isso.';

-- A consulta que publica é sempre com as duas condições. O índice existe para
-- que "tem foto publicável?" não vire varredura quando houver muitos projetos.
CREATE INDEX IF NOT EXISTS idx_org_projects_foto_publicavel
  ON org_projects (organization_id)
  WHERE foto_chave IS NOT NULL AND foto_autorizacao_em IS NOT NULL;
