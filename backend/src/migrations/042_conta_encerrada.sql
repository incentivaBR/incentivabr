-- 042 — Conta encerrada ou anonimizada a pedido do titular (LGPD, art. 18 VI).
--
-- Quem tem conta passa a poder exportar e eliminar os próprios dados sem
-- pedir a ninguém (rotas /api/meus-dados). Duas saídas, conforme haja ou não
-- registro fiscal:
--
--   encerrada_em    a conta some para a pessoa (senha invalidada, e-mail e
--                   telefone apagados, sem login), mas nome e CPF ficam
--                   porque uma destinação fora da simulação gerou comprovante
--                   e Recibo de Mecenato — documentos que a Política (§7)
--                   promete guardar pelo prazo fiscal (LGPD art. 16 I).
--   anonimizada_em  não havia registro fiscal: nome, CPF, e-mail, telefone e
--                   senha somem na hora. Fica só a linha, sem identificar
--                   ninguém, como prova de que o pedido foi atendido.
--
-- Uma conta anonimizada também está encerrada: as duas colunas ficam
-- preenchidas. O contrário não vale.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS encerrada_em   TIMESTAMP,
  ADD COLUMN IF NOT EXISTS anonimizada_em TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_encerrada ON users (encerrada_em)
  WHERE encerrada_em IS NOT NULL;
