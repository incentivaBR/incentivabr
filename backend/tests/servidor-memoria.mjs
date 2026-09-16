// Sobe a aplicacao inteira (backend + frontend) contra um Postgres em memoria,
// com dados plausiveis ja carregados. Serve para clicar o fluxo no navegador
// sem depender de um banco de verdade. NAO e usado em producao.
//
//   node tests/servidor-memoria.mjs [porta]
//
// Imprime os tokens de sessao para colar no localStorage.
import { newDb } from 'pg-mem';
import express from 'express';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.argv[2] || 3100);

process.env.JWT_SECRET = 'teste';
process.env.NODE_ENV = 'test';
process.env.SIMULATION_MODE = process.env.SIMULATION_MODE || 'true';

const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});

db.public.none(`
  CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT, slug TEXT, contact_email TEXT, contact_whatsapp TEXT,
    contact_person TEXT, mecenato_prazo_dias INT DEFAULT 10,
    primary_color TEXT, secondary_color TEXT, logo_url TEXT,
    -- Encarregado de dados do cliente (migration 041). Fica vazio de
    -- proposito: e como um cliente novo entra, e e o caminho de reserva da
    -- Politica que precisa ser visto funcionando.
    encarregado_nome TEXT, encarregado_email TEXT
  );
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT, cpf TEXT, email TEXT, phone TEXT
  );
  CREATE TABLE organization_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, user_id UUID, role TEXT, is_active BOOLEAN DEFAULT true
  );
  CREATE TABLE incentive_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE, name TEXT, max_percentage NUMERIC(5,2),
    period_type TEXT, teto_codigo TEXT
  );
  CREATE TABLE tetos_deducao (
    codigo TEXT PRIMARY KEY, descricao TEXT, percentual NUMERIC(5,2),
    base_legal TEXT, vigencia_inicio DATE, vigencia_fim DATE,
    confirmado_por_parecer BOOLEAN DEFAULT FALSE, observacao TEXT
  );
  INSERT INTO tetos_deducao (codigo, descricao, percentual, base_legal, vigencia_inicio)
    VALUES ('irpf_global_6','Teto global',6.00,'Lei 9.532/1997, art. 22','1998-01-01');
  INSERT INTO incentive_groups (code, name, max_percentage, period_type, teto_codigo)
    VALUES ('ROUANET','Lei Rouanet',6.00,'annual','irpf_global_6');
  CREATE TABLE official_funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT, name TEXT
  );
  CREATE TABLE org_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, pronac TEXT, titulo TEXT, area TEXT, segmento TEXT,
    descricao TEXT, uf TEXT,
    proponente_nome TEXT, proponente_cnpj TEXT,
    bank_name TEXT, bank_code TEXT, bank_agency TEXT, bank_account TEXT,
    pix_key TEXT, pix_key_type TEXT,
    is_active BOOLEAN DEFAULT true, is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, organization_id UUID, official_fund_id UUID,
    donation_amount NUMERIC, ir_devido NUMERIC, fiscal_year INT,
    pronac TEXT, projeto_titulo TEXT, status TEXT DEFAULT 'pending',
    receipt_url TEXT, receipt_filename TEXT, receipt_file_path TEXT,
    confirmed_at TIMESTAMP, proponente_notified_at TIMESTAMP,
    mecenato_url TEXT, mecenato_issued_at TIMESTAMP,
    confirmed_by UUID, confirmation_note TEXT,
    rejected_at TIMESTAMP, rejected_by UUID, rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );
`);

const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });

const q = async (sql) => (await poolFalso.query(sql)).rows;

const [{ id: orgId }] = await q(`
  INSERT INTO organizations (name, slug, contact_email, contact_whatsapp, contact_person,
                             mecenato_prazo_dias, primary_color, secondary_color)
  VALUES ('Casa Azul Felipe Augusto','casa-azul','contato@casazul.org.br','61999998888',
          'Coordenação', 10, '#273F77', '#EE985C') RETURNING id`);
const [{ id: destinadorId }] = await q(`
  INSERT INTO users (nome, cpf, email) VALUES
  ('Maria Aparecida de Souza','12345678901','maria@exemplo.gov.br') RETURNING id`);
const [{ id: gestorId }] = await q(`
  INSERT INTO users (nome, cpf, email) VALUES
  ('Gestor Casa Azul','98765432100','gestor@casazul.org.br') RETURNING id`);
await q(`INSERT INTO organization_users (organization_id, user_id, role, is_active)
         VALUES ('${orgId}','${gestorId}','org_admin', true)`);
await q(`INSERT INTO organization_users (organization_id, user_id, role, is_active)
         VALUES ('${orgId}','${destinadorId}','member', true)`);

for (const [valor, status] of [[3200,'awaiting_confirmation'], [12500.50,'awaiting_confirmation'],
                               [800,'awaiting_confirmation']]) {
  await q(`INSERT INTO donations (user_id, organization_id, donation_amount, ir_devido,
             fiscal_year, pronac, projeto_titulo, status, receipt_url, receipt_filename)
           VALUES ('${destinadorId}','${orgId}',${valor},208342,2026,'2511274',
                   'Mostra Casa Azul de Teatro Inclusivo','${status}',
                   '/uploads/receipts/exemplo.pdf','comprovante-${valor}.pdf')`);
}

// Projeto da organizacao — e daqui que o frontend tira PRONAC e titulo agora
// que eles sairam do codigo.
await q(`INSERT INTO org_projects
  (organization_id, pronac, titulo, area, segmento, descricao, uf,
   proponente_nome, proponente_cnpj, bank_name, bank_code, bank_agency, bank_account,
   is_active, is_featured)
  VALUES ('${orgId}', '2511274', 'Mostra Casa Azul de Teatro Inclusivo',
          'Artes Cenicas', 'Teatro', 'Temporada de teatro inclusivo em Brasilia.', 'DF',
          'Casa Azul Felipe Augusto', '12.345.678/0001-90',
          'Banco do Brasil', '001', '1234-5', '98765-4', true, true)`);

const { default: donationsRoutes } = await import('../src/routes/donations.js');
const { default: configRoutes }    = await import('../src/routes/config.js');
const { default: salicRoutes }     = await import('../src/routes/salic.js');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  // Este servidor finge SEMPRE o site do cliente: e para isso que ele existe.
  // O contato entra porque e o degrau de reserva do Encarregado enquanto o
  // cliente nao preenche o dele — e o estado real de um cliente recem-criado.
  req.organization = { id: orgId, name: 'Casa Azul Felipe Augusto', slug: 'casa-azul',
                       contact_email: 'contato@casazul.org.br',
                       primary_color: '#273F77', secondary_color: '#EE985C' };
  next();
});
app.use('/api/donations', donationsRoutes);
app.use('/api/config', configRoutes);
app.use('/api/salic', salicRoutes);
app.use(express.static(path.join(AQUI, '../../frontend')));

const token = (userId) => jwt.sign({ userId, orgId }, 'teste', { expiresIn: '8h' });

app.listen(PORTA, () => {
  console.log(`\nServidor de teste em http://localhost:${PORTA}`);
  console.log('\nCole no console do navegador para entrar como GESTOR:');
  console.log(`localStorage.setItem('incentivabr_token','${token(gestorId)}');` +
              `localStorage.setItem('incentivabr_user','{"nome":"Gestor Casa Azul"}');location.reload()`);
  console.log('\n...ou como DESTINADOR:');
  console.log(`localStorage.setItem('incentivabr_token','${token(destinadorId)}');` +
              `localStorage.setItem('incentivabr_user','{"nome":"Maria"}');location.reload()`);
  console.log('');
});
