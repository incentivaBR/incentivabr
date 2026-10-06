-- 055 — A destinação simulada precisa dizer que é simulada.
--
-- O PROBLEMA
--
-- `POST /api/donations/:id/simulate` grava `status = 'confirmed'` — o mesmo
-- valor que o gestor escreve quando abre o extrato do banco, confere e
-- confirma. A linha fica indistinguível de uma destinação real.
--
-- Enquanto não havia nenhuma tela somando destinações, isso não aparecia.
-- Passa a aparecer agora: o cliente precisa de um número que diga quanto
-- entrou pela plataforma, e esse número não pode misturar ensaio com dinheiro.
-- Numa reunião, "R$ 48.000 captados" com ensaio dentro é mentira sobre
-- dinheiro — e o proponente descobre no primeiro extrato que conferir.
--
-- Pior: a mistura é PERMANENTE. Virado o `SIMULATION_MODE`, as linhas de
-- ensaio continuam lá, somando para sempre, sem nenhuma marca que permita
-- separá-las depois.
--
-- A MARCA É DO NASCIMENTO, NÃO DO ESTADO
--
-- `simulada` registra o modo em que a linha nasceu. Não é um estado que vira:
-- destinação de ensaio não "vira real" porque a plataforma saiu da simulação.
-- Por isso a rota de registro marca a linha no momento do INSERT, lendo o
-- modo, em vez de a tela consultar `SIMULATION_MODE` na hora de exibir — o
-- modo muda, a linha não.
--
-- O BACKFILL, E POR QUE ELE É `TRUE`
--
-- Toda linha que existe hoje nasceu em simulação: a plataforma nunca operou
-- fora dela (`SIMULATION_MODE=true` em produção, `docs/operacao/
-- VIRADA-PRODUCAO.md`), e as destinações de exemplo da Casa Azul vêm de
-- `config/semeiaCasaAzul.js`, que só roda com o modo ligado.
--
-- Se mesmo assim houver uma linha real perdida aí, marcá-la como ensaio erra
-- para MENOS: o cliente vê menos do que captou. O contrário — uma linha de
-- ensaio contada como dinheiro — é a afirmação que não se pode desfazer
-- depois de dita numa reunião. É a mesma escolha do teto fiscal: errar para
-- menos é recuperável.
--
-- Para desmarcar uma linha que se comprove real:
--   UPDATE donations SET simulada = FALSE WHERE id = '<uuid>';

ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS simulada BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE donations SET simulada = TRUE;

COMMENT ON COLUMN donations.simulada IS
  'Nasceu em modo simulação (ensaio). Nunca entra no total captado do cliente.';

-- O painel do cliente soma por organização e por situação. O índice de 029 é
-- (organization_id, created_at), que serve para listar em ordem, não para
-- somar por situação.
CREATE INDEX IF NOT EXISTS idx_donations_org_status
  ON donations (organization_id, status);
