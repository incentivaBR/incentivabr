-- 054 — O status da destinação não cabia na coluna.
--
-- O DEFEITO
--
-- `donations.status` nasceu `VARCHAR(20)` na migration 001. O fluxo tem um
-- status de 21 caracteres: `awaiting_confirmation`, escrito por
-- `routes/uploads.js` no momento em que o contribuinte anexa o comprovante da
-- transferência.
--
-- Num Postgres de verdade isso é erro 22001 (string_data_right_truncation). O
-- efeito, no produto:
--
--   1. a pessoa transfere o dinheiro de verdade;
--   2. anexa o comprovante;
--   3. recebe "Erro ao enviar comprovante";
--   4. a destinação fica em `pending` para sempre, o gestor nunca a vê na fila
--      de conferência, e não há Recibo de Mecenato.
--
-- Dinheiro saiu da conta de alguém e a plataforma não tem registro da prova.
--
-- POR QUE NINGUÉM VIU
--
-- O pg-mem, que roda a suíte, NÃO aplica o comprimento de VARCHAR: aceita os
-- 21 caracteres sem reclamar. O job do Postgres real existe desde set/2026,
-- mas cobre migrations, cadastro e login — a jornada da destinação não passava
-- por ele. É a mesma lição da coluna que o código lê sem existir, um nível
-- adiante: o valor que o código ESCREVE tem de caber na coluna.
--
-- A ESCOLHA
--
-- Alargar a coluna, não encurtar o valor. O nome do status aparece em sete
-- lugares do código, na tela do gestor e no histórico; trocá-lo exigiria
-- migrar dado existente para ganhar nada. VARCHAR(40) dá folga para o
-- vocabulário atual (o maior passa a ter 21 de 40) sem virar texto livre.
--
-- A tabela pode já ter linhas em produção: ampliar VARCHAR não reescreve a
-- tabela nem invalida índice, e nenhum valor existente é afetado.

ALTER TABLE donations
  ALTER COLUMN status TYPE VARCHAR(40);

-- O vocabulário em um lugar só, no banco, para que a próxima adição seja uma
-- decisão explícita e não um literal solto numa rota. Sem isso, nada impede
-- que entre amanhã um status de 45 caracteres e o defeito volte igual.
ALTER TABLE donations
  DROP CONSTRAINT IF EXISTS donations_status_conhecido;

ALTER TABLE donations
  ADD CONSTRAINT donations_status_conhecido CHECK (status IN (
    'pending',                -- registrada, aguardando a transferência
    'awaiting_confirmation',  -- comprovante anexado, na fila do gestor
    'confirmed',              -- gestor conferiu o comprovante
    'awaiting_mecenato',      -- aguardando o recibo do proponente
    'mecenato_issued',        -- recibo emitido
    'cancelled',              -- desistência ou recusa
    'error'
  ));
