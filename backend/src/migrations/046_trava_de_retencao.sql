-- 046 — Trava de retenção: o prazo não corre enquanto houver processo em aberto
--
-- POR QUE
--
-- `anoFinalDaGuarda()` devolve um ano, e a rota /api/admin/retencao lista o
-- que já passou dele. Hoje isso é só uma lista, porque nada apaga por prazo.
-- Mas a lista é o rascunho da fila de eliminação: no dia em que a rotina for
-- ligada, ela vai agir sobre exatamente estas linhas.
--
-- E aí existe um caso em que o prazo NÃO pode valer: fiscalização, impugnação,
-- processo administrativo ou judicial em curso sobre aquela destinação. Apagar
-- o comprovante no meio de uma defesa destrói a prova de quem a plataforma
-- deveria estar protegendo — e é irreversível.
--
-- A trava resolve isso agora, enquanto a fila ainda é só uma lista. Ligar a
-- eliminação depois, sobre uma base que já sabe o que não pode ser tocado, é
-- muito mais seguro do que ligar primeiro e lembrar da exceção depois.
--
-- POR QUE EM `users` E NÃO EM `donations`
--
-- Uma fiscalização é sobre o contribuinte e a declaração dele, não sobre uma
-- transferência isolada: alcança o ano inteiro e costuma alcançar mais de uma
-- destinação. Travar por pessoa cobre o caso real. Travar por destinação
-- deixaria o superadmin marcando uma a uma e esquecendo alguma.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS retencao_travada_em     TIMESTAMP,
  ADD COLUMN IF NOT EXISTS retencao_travada_motivo TEXT,
  ADD COLUMN IF NOT EXISTS retencao_travada_por    UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN users.retencao_travada_em IS
  'Quando a guarda desta pessoa foi travada. Enquanto não for NULL, o prazo de '
  'retenção não vence para ela: nenhuma rotina de eliminação pode alcançá-la.';

COMMENT ON COLUMN users.retencao_travada_motivo IS
  'Por que travou, em texto livre: número do processo, ofício da fiscalização, '
  'o que for. Obrigatório ao travar — trava sem motivo vira trava eterna, '
  'porque ninguém depois sabe se ainda vale.';

COMMENT ON COLUMN users.retencao_travada_por IS
  'Qual superadmin travou. A decisão tem dono.';

-- Índice parcial: a rota de retenção pergunta "quem está travado", e travado é
-- a minoria. O índice só carrega essas linhas.
CREATE INDEX IF NOT EXISTS idx_users_retencao_travada
  ON users(retencao_travada_em) WHERE retencao_travada_em IS NOT NULL;
