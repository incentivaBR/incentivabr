-- Migration 021: Adicionar CNPJ do proponente ao org_projects (Circuito do Forró)
-- CNPJ: BR Projects LTDA — 00.000.000/0001-00

UPDATE org_projects SET
  proponente_cnpj = '00383111000124'
WHERE organization_id = (SELECT id FROM organizations WHERE slug = 'www');
