-- Migration 039: textos da página inicial por organização
-- Data: 2026-09-07
--
-- Um cliente white-label recebia a cor e a logo dele sobre o discurso da
-- IncentivaBR: a página inicial falava "servidores de todo o Brasil" numa
-- tela que é da associação. Três textos, todos opcionais, preenchidos pela
-- tela de clientes do superadmin e lidos por GET /api/config/brand:
--
--   hero_titulo     — a frase grande da página inicial
--   hero_subtitulo  — o parágrafo abaixo dela
--   sobre           — quem é a instituição, mostrado só na página do cliente
--
-- Em branco, a página fica com o texto da IncentivaBR. A organização `www`
-- não usa estes campos.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS hero_titulo    TEXT,
  ADD COLUMN IF NOT EXISTS hero_subtitulo TEXT,
  ADD COLUMN IF NOT EXISTS sobre          TEXT;
