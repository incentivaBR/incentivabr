-- Migration 020: Atualizar PRONAC para Circuito do Forró (PRONAC 252026)
-- Data: 2026-04-28
-- Proponente: BR Projects LTDA (CNPJ 00.000.000/0001-00)
-- Banco: BB Ag. 0000-0, Conta Captação 00000-0

-- 1. Atualizar organização
UPDATE organizations SET
  pronac            = '252026',
  pronac_titulo     = 'Circuito do Forró',
  pronac_area       = 'Música',
  pronac_proponente = 'BR Projects LTDA',
  bank_name         = 'Banco do Brasil',
  bank_code         = '001',
  bank_agency       = '0000-0',
  bank_account      = '00000-0',
  pix_key           = NULL,
  pix_key_type      = NULL
WHERE slug = 'www';

-- 2. Atualizar org_projects
UPDATE org_projects SET
  pronac          = '252026',
  titulo          = 'Circuito do Forró',
  area            = 'Música',
  proponente_nome = 'BR Projects LTDA',
  bank_name       = 'Banco do Brasil',
  bank_code       = '001',
  bank_agency     = '0000-0',
  bank_account    = '00000-0',
  pix_key         = NULL,
  pix_key_type    = NULL
WHERE organization_id = (SELECT id FROM organizations WHERE slug = 'www');
