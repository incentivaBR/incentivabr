// Sobe a aplicacao inteira (backend + frontend) contra um Postgres em memoria,
// com dados plausiveis ja carregados. Serve para clicar o fluxo no navegador
// sem depender de um banco de verdade, e e o servidor contra o qual o E2E
// (scripts/e2e.mjs) roda. NAO e usado em producao.
//
//   node tests/servidor-memoria.mjs [porta]
//
// Finge SEMPRE o site da Casa Azul (cliente white-label). Contas para entrar
// pelo formulario, as duas com a senha "senha-bem-comprida":
//
//   maria@exemplo.gov.br    — destinadora, com tres destinacoes aguardando
//   gestor@casazul.org.br   — gestora da organizacao (org_admin)
//
// Tambem imprime os tokens de sessao, para colar no localStorage.
import { newDb } from 'pg-mem';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.argv[2] || 3100);

process.env.JWT_SECRET = 'teste';
process.env.NODE_ENV = 'test';
process.env.SIMULATION_MODE = process.env.SIMULATION_MODE || 'true';
process.env.APP_URL = process.env.APP_URL || `http://localhost:${PORTA}`;

export const SENHA_DE_TESTE = 'senha-bem-comprida';

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
  -- As colunas que o login (SELECT) e o cadastro (INSERT) de routes/auth.js
  -- tocam. Sem elas, o formulario de entrar nao serve para nada aqui.
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT, cpf TEXT, email TEXT, phone TEXT, senha_hash TEXT,
    total_donated NUMERIC DEFAULT 0,
    is_admin BOOLEAN DEFAULT false, is_superadmin BOOLEAN DEFAULT false,
    is_org_admin BOOLEAN DEFAULT false,
    organization_id UUID, email_verified BOOLEAN DEFAULT false,
    accepted_terms_at TIMESTAMP, accepted_terms_version TEXT,
    email_verification_token TEXT, email_verification_expires TIMESTAMPTZ,
    reset_token TEXT, reset_token_expires TIMESTAMPTZ,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE organization_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, user_id UUID, role TEXT, is_active BOOLEAN DEFAULT true,
    accepted_at TIMESTAMP,
    UNIQUE (organization_id, user_id)
  );
  CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, user_id UUID, action TEXT, entity_type TEXT, entity_id UUID,
    details TEXT, ip_address TEXT, user_agent TEXT, created_at TIMESTAMP DEFAULT NOW()
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
  -- A lista de avisos (migration 027), para a tela de interessados.
  CREATE TABLE subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT, nome TEXT, phone TEXT, orgao TEXT, organization_id UUID,
    consent_prazos BOOLEAN DEFAULT FALSE, consent_projetos BOOLEAN DEFAULT FALSE,
    consent_whatsapp BOOLEAN DEFAULT FALSE,
    consent_text TEXT, consent_policy_version TEXT, consent_at TIMESTAMPTZ,
    confirm_token TEXT, confirm_token_expires TIMESTAMPTZ, confirmed_at TIMESTAMPTZ,
    access_token TEXT, revoked_at TIMESTAMPTZ, revoke_reason TEXT, anonymized_at TIMESTAMPTZ,
    last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE subscriber_consent_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), subscriber_id UUID, evento TEXT,
    consent_prazos BOOLEAN, consent_projetos BOOLEAN, consent_whatsapp BOOLEAN,
    consent_text TEXT, consent_policy_version TEXT, ip TEXT, user_agent TEXT,
    detalhe TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
  );
`);

const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });

const q = async (sql, p) => (await poolFalso.query(sql, p)).rows;

const [{ id: orgId }] = await q(`
  INSERT INTO organizations (name, slug, contact_email, contact_whatsapp, contact_person,
                             mecenato_prazo_dias, primary_color, secondary_color)
  VALUES ('Casa Azul Felipe Augusto','casa-azul','contato@casazul.org.br','61999998888',
          'Coordenação', 10, '#273F77', '#EE985C') RETURNING id`);

// Fator 4: e um fixture, nao uma conta. O login compara com bcrypt.compare,
// que aceita qualquer fator.
const senhaHash = bcrypt.hashSync(SENHA_DE_TESTE, 4);

// Veneno. Vai no fim de campos que vêm de gente ou do SALIC — nome de quem
// destina, título e descrição do projeto, órgão de quem pediu avisos, nome do
// arquivo do comprovante. Se alguma tela puser o texto em innerHTML sem
// escapar, nasce um <img data-veneno>, e o E2E recusa a página. Fecha aspas e
// tag de propósito: pega tanto texto solto quanto atributo.
export const VENENO = '"><img data-veneno src=x>';

const [{ id: destinadorId }] = await q(`
  INSERT INTO users (nome, cpf, email, senha_hash, organization_id, email_verified)
  VALUES ($3,'12345678901','maria@exemplo.gov.br',$1,$2,true) RETURNING id`,
  [senhaHash, orgId, 'Maria Aparecida de Souza ' + VENENO]);
const [{ id: gestorId }] = await q(`
  INSERT INTO users (nome, cpf, email, senha_hash, organization_id, email_verified, is_org_admin)
  VALUES ('Gestor Casa Azul','98765432100','gestor@casazul.org.br',$1,$2,true,true) RETURNING id`,
  [senhaHash, orgId]);
await q(`INSERT INTO organization_users (organization_id, user_id, role, is_active)
         VALUES ($1,$2,'org_admin', true)`, [orgId, gestorId]);
await q(`INSERT INTO organization_users (organization_id, user_id, role, is_active)
         VALUES ($1,$2,'member', true)`, [orgId, destinadorId]);

for (const [valor, status] of [[3200,'awaiting_confirmation'], [12500.50,'awaiting_confirmation'],
                               [800,'awaiting_confirmation']]) {
  await q(`INSERT INTO donations (user_id, organization_id, donation_amount, ir_devido,
             fiscal_year, pronac, projeto_titulo, status, receipt_url, receipt_filename)
           VALUES ($1,$2,$3,208342,2026,'2511274',$6,$4,
                   '/uploads/receipts/exemplo.pdf',$5)`,
    [destinadorId, orgId, valor, status, `comprovante-${valor}${VENENO}.pdf`,
     'Mostra Casa Azul de Teatro Inclusivo ' + VENENO]);
}

// Projeto da organizacao — e daqui que o frontend tira PRONAC, titulo,
// descricao e proponente agora que eles sairam do codigo.
await q(`INSERT INTO org_projects
  (organization_id, pronac, titulo, area, segmento, descricao, uf,
   proponente_nome, proponente_cnpj, bank_name, bank_code, bank_agency, bank_account,
   is_active, is_featured)
  VALUES ($1, '2511274', $2,
          'Artes Cenicas', 'Teatro', $3, 'DF',
          $4, '12.345.678/0001-90',
          'Banco do Brasil', '001', '1234-5', '98765-4', true, true)`,
  [orgId, 'Mostra Casa Azul de Teatro Inclusivo ' + VENENO,
   'Temporada de teatro inclusivo em Brasilia. ' + VENENO,
   'Casa Azul Felipe Augusto ' + VENENO]);

// Um inscrito na lista de avisos, para a tela de interessados ter o que mostrar.
await q(`INSERT INTO subscribers (email, nome, orgao, organization_id, consent_prazos,
                                  confirmed_at, access_token, consent_at)
         VALUES ('joao@exemplo.gov.br','João da Silva',$2,$1,true,NOW(),'token-fixture',NOW())`,
  [orgId, 'TJDFT ' + VENENO]);

const { default: authRoutes }         = await import('../src/routes/auth.js');
const { default: calculatorRoutes }   = await import('../src/routes/calculator.js');
const { default: donationsRoutes }    = await import('../src/routes/donations.js');
const { default: configRoutes }       = await import('../src/routes/config.js');
const { default: salicRoutes }        = await import('../src/routes/salic.js');
const { default: interessadosRoutes } = await import('../src/routes/interessados.js');
const { guardaDePaginasDaPlataforma } = await import('../src/lib/paginasDaPlataforma.js');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  // Este servidor finge SEMPRE o site do cliente: e para isso que ele existe.
  // O contato entra porque e o degrau de reserva do Encarregado enquanto o
  // cliente nao preenche o dele — e o estado real de um cliente recem-criado.
  req.organization = { id: orgId, name: 'Casa Azul Felipe Augusto', slug: 'casa-azul',
                       contact_email: 'contato@casazul.org.br',
                       primary_color: '#273F77', secondary_color: '#EE985C' };
  req.tenantSlug = 'casa-azul';
  next();
});
app.use('/api/auth', authRoutes);
app.use('/api/calculator', calculatorRoutes);
app.use('/api/donations', donationsRoutes);
app.use('/api/config', configRoutes);
app.use('/api/salic', salicRoutes);
app.use('/api/interessados', interessadosRoutes);
// Mesma ordem do server.js: a pagina que so a plataforma mostra e recusada
// antes de o arquivo sair. Sem isto, o E2E nao teria como conferir a guarda.
app.use(guardaDePaginasDaPlataforma);
app.use(express.static(path.join(AQUI, '../../frontend')));

const token = (userId) => jwt.sign({ userId, orgId }, 'teste', { expiresIn: '8h' });

app.listen(PORTA, () => {
  console.log(`\nServidor de teste em http://localhost:${PORTA}`);
  console.log(`\nEntre pelo formulario com a senha "${SENHA_DE_TESTE}":`);
  console.log('  maria@exemplo.gov.br   (destinadora)   gestor@casazul.org.br  (gestora)');
  console.log('\n...ou cole no console do navegador para entrar como GESTOR:');
  console.log(`localStorage.setItem('incentivabr_token','${token(gestorId)}');` +
              `localStorage.setItem('incentivabr_user','{"nome":"Gestor Casa Azul"}');location.reload()`);
  console.log('\n...ou como DESTINADOR:');
  console.log(`localStorage.setItem('incentivabr_token','${token(destinadorId)}');` +
              `localStorage.setItem('incentivabr_user','{"nome":"Maria"}');location.reload()`);
  console.log('');
});
