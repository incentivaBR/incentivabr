-- Migration 041: Encarregado de dados por organização
-- Data: 2026-09-16
--
-- No site de um cliente white-label, quem responde pelos dados dos
-- destinadores é o CLIENTE: ele é o controlador e a IncentivaBR é operadora,
-- tratando por conta e sob instrução dele.
--
-- Isso tem uma consequência prática que o código não cumpria. O art. 41 §1º
-- da LGPD exige que a identidade e o contato do Encarregado sejam divulgados
-- publicamente — e o Encarregado é o do controlador. A Política de
-- Privacidade servida sob a marca do cliente mostrava o Encarregado da
-- IncentivaBR: o titular era mandado reclamar com quem não responde por ele.
--
-- Dois campos, os dois opcionais. Vazios, a página cai no contato da
-- organização e, na falta dele, no Encarregado da IncentivaBR — que é o certo
-- para a própria plataforma e é o menos errado para um cliente que ainda não
-- preencheu. A tela de clientes avisa enquanto estiver vazio.
--
-- A organização `www` não usa estes campos: para ela vale `src/config/lgpd.js`.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS encarregado_nome  TEXT,
  ADD COLUMN IF NOT EXISTS encarregado_email TEXT;
