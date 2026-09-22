// A conta de captacao vem do cadastro do projeto — ou nao vem.
//
// POST /api/donations/rouanet devolvia, como destino da transferencia, uma
// cadeia de fallbacks: org_projects, depois organizations (onde a migracao 022
// deixou uma conta inventada), depois 'Banco do Brasil' / '001' / '—' escritos
// no codigo. Quem transferisse para qualquer dessas contas nao teria Recibo de
// Mecenato. Raio-X de set/2026, risco 01.
//
// O que este teste garante:
//   - fora da simulacao, sem projeto ativo com conta preenchida, a rota recusa
//     com mensagem clara e NAO grava a destinacao;
//   - com conta preenchida, devolve exatamente o que esta no banco;
//   - em simulacao, registra mesmo sem conta, mas devolve os campos vazios
//     (nunca um banco inventado) e avisa que a conta nao esta preenchida;
//   - a migracao 034 zera a conta da organizacao 'www' e desativa o PRONAC
//     ficticio 261847, e depois dela a rota passa a recusar.
import { newDb, DataType } from 'pg-mem';
import express from 'express';
import jwt from 'jsonwebtoken';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
process.env.JWT_SECRET = 'teste';
process.env.NODE_ENV = 'test';
delete process.env.SIMULATION_MODE;

// ── banco em memoria ───────────────────────────────────────────────────────
const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});
// O lock por contribuinte da rota de registro (ver lib/tetos.js) nao existe
// no pg-mem: aqui e um no-op. A concorrencia real e conferida num Postgres.
db.public.registerFunction({
  name: 'pg_advisory_xact_lock', args: [DataType.bigint], returns: DataType.bool,
  impure: true, implementation: () => true
});

db.public.none(`
  CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT, slug TEXT, contact_email TEXT, pronac_proponente TEXT,
    bank_name TEXT, bank_code TEXT, bank_agency TEXT, bank_account TEXT,
    pix_key TEXT, pix_key_type TEXT
  );
  CREATE TABLE users (encerrada_em TIMESTAMP, anonimizada_em TIMESTAMP, 
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT, cpf TEXT, email TEXT, phone TEXT, total_donated NUMERIC DEFAULT 0
  );
  CREATE TABLE org_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, pronac TEXT, titulo TEXT,
    proponente_nome TEXT, proponente_cnpj TEXT,
    bank_name TEXT, bank_code TEXT, bank_agency TEXT, bank_account TEXT,
    pix_key TEXT, pix_key_type TEXT,
    is_active BOOLEAN DEFAULT true, is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  );
  -- migration 051: mecanismoDaOrg() junta laws para o vocabulario do mecanismo.
  CREATE TABLE laws (slug TEXT PRIMARY KEY, name TEXT, base_legal TEXT, orgao TEXT,
    sistema_oficial TEXT, sistema_url TEXT,
    termo_identificador TEXT, termo_beneficiario TEXT, termo_recibo TEXT, termo_recibo_emissor TEXT);
  CREATE TABLE incentive_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE, name TEXT, max_percentage NUMERIC(5,2), period_type TEXT, teto_codigo TEXT,
    -- migration 051: o que identifica a destinacao neste mecanismo.
    identificador TEXT DEFAULT 'projeto_do_tenant',
    law_slug TEXT,
    disponivel_para_cliente BOOLEAN DEFAULT false,
    motivo_indisponivel TEXT,
    sublimite_pct NUMERIC,
    sublimite_base_legal TEXT
  );
  CREATE TABLE tetos_deducao (
    codigo TEXT PRIMARY KEY, descricao TEXT, percentual NUMERIC(5,2),
    base_legal TEXT, vigencia_inicio DATE, vigencia_fim DATE,
    confirmado_por_parecer BOOLEAN DEFAULT FALSE, observacao TEXT
  );
  INSERT INTO tetos_deducao (codigo, descricao, percentual, base_legal, vigencia_inicio)
    VALUES ('irpf_global_6','Teto global',6.00,'Lei 9.532/1997, art. 22','1998-01-01');
  INSERT INTO incentive_groups (code, name, max_percentage, period_type, teto_codigo)
    VALUES ('rouanet','Lei Rouanet',6.00,'annual','irpf_global_6');
  -- migration 051: a Rouanet e a unica com registro externo.
  UPDATE incentive_groups SET identificador = 'pronac' WHERE code = 'rouanet';
  CREATE TABLE official_funds (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incentive_group_id UUID, code TEXT, name TEXT);
  CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, organization_id UUID, official_fund_id UUID,
    donation_amount NUMERIC, ir_devido NUMERIC, fiscal_year INT,
    pronac TEXT, projeto_titulo TEXT, status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
  );
`);

const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });

const { default: donationsRoutes } = await import('../src/routes/donations.js');

// ── dados ──────────────────────────────────────────────────────────────────
const q = async (sql) => (await poolFalso.query(sql)).rows;

// A organizacao 'www' como a migracao 022 a deixou: conta inventada na propria
// organizacao e projeto ficticio ativo, com a mesma conta.
const [{ id: orgId }] = await q(
  `INSERT INTO organizations (name, slug, pronac_proponente, bank_name, bank_code, bank_agency, bank_account)
   VALUES ('IncentivaBR','www','Orquestra','Banco do Brasil','001','3217-4','48.291-5') RETURNING id`);
const [{ id: userId }] = await q(
  `INSERT INTO users (nome, cpf, email) VALUES ('Maria','12345678901','m@x.gov.br') RETURNING id`);

const token = jwt.sign({ userId, orgId }, 'teste', { expiresIn: '1h' });

// ── servidor ───────────────────────────────────────────────────────────────
let orgAtual = null;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.organization = orgAtual; next(); });
app.use('/api/donations', donationsRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

let ano = 2040;
const registrar = async () => {
  const r = await fetch(base + '/api/donations/rouanet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ pronac: '2511274', projeto_titulo: 'Mostra', ir_devido: 100000,
                           donation_amount: 500, fiscal_year: ano++ })
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};
const totalDestinacoes = async () => Number((await q('SELECT COUNT(*) AS n FROM donations'))[0].n);

// ── casos ──────────────────────────────────────────────────────────────────
const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};
const igual = (a, b, o) => { if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };

// Carrega a organizacao do banco, como o middleware de tenant faria.
const recarregaOrg = async () => { orgAtual = (await q(`SELECT * FROM organizations WHERE id='${orgId}'`))[0]; };
await recarregaOrg();

await teste('sem projeto ativo, fora da simulacao -> 409 e nada gravado', async () => {
  const antes = await totalDestinacoes();
  const r = await registrar();
  igual(r.status, 409, 'status');
  igual(r.corpo.codigo, 'conta_captacao_ausente', 'codigo');
  if (!/não faça nenhuma transferência/i.test(r.corpo.message)) throw new Error('mensagem nao avisa para nao transferir: ' + r.corpo.message);
  igual(await totalDestinacoes(), antes, 'destinacoes gravadas');
});

await teste('a conta da organizacao NAO serve de fallback', async () => {
  // organizations.bank_* esta preenchido (conta inventada da 022) e mesmo
  // assim a rota recusa: conta e do projeto, nunca da organizacao.
  const r = await registrar();
  igual(r.status, 409, 'status');
});

const [{ id: projetoId }] = await q(
  `INSERT INTO org_projects (organization_id, pronac, titulo, proponente_nome, is_active, is_featured)
   VALUES ('${orgId}','2511274','Casa Azul Celebra','Casa Azul',true,true) RETURNING id`);

await teste('projeto ativo sem conta preenchida, fora da simulacao -> 409', async () => {
  const antes = await totalDestinacoes();
  const r = await registrar();
  igual(r.status, 409, 'status');
  if (!/Conta de Captação/i.test(r.corpo.message)) throw new Error('mensagem nao fala da conta: ' + r.corpo.message);
  igual(await totalDestinacoes(), antes, 'destinacoes gravadas');
});

await teste('em simulacao registra, mas devolve campos vazios e avisa', async () => {
  process.env.SIMULATION_MODE = 'true';
  try {
    const r = await registrar();
    igual(r.status, 201, 'status');
    const b = r.corpo.donation.banco;
    igual(b.conta_preenchida, false, 'conta_preenchida');
    igual(b.bank_agency, null, 'bank_agency');
    igual(b.bank_account, null, 'bank_account');
    for (const [campo, valor] of Object.entries(b)) {
      if (typeof valor === 'string' && /banco do brasil|^001$|^—$|3217-4|48\.291-5/i.test(valor) && campo !== 'instrucoes') {
        throw new Error(`${campo} veio de fallback: ${valor}`);
      }
    }
  } finally {
    delete process.env.SIMULATION_MODE;
  }
});

await q(`UPDATE org_projects SET bank_name='Banco do Brasil', bank_code='001', bank_agency='1234-5',
         bank_account='98.765-4', proponente_cnpj='12345678000199' WHERE id='${projetoId}'`);

await teste('com conta preenchida -> 201 e devolve o que esta no cadastro do projeto', async () => {
  const r = await registrar();
  igual(r.status, 201, 'status');
  const b = r.corpo.donation.banco;
  igual(b.conta_preenchida, true, 'conta_preenchida');
  igual(b.bank_agency, '1234-5', 'bank_agency');
  igual(b.bank_account, '98.765-4', 'bank_account');
  igual(b.beneficiary_name, 'Casa Azul', 'beneficiary_name');
  igual(b.beneficiary_cnpj, '12345678000199', 'beneficiary_cnpj');
});

await teste('so chave PIX tambem conta como conta preenchida', async () => {
  await q(`UPDATE org_projects SET bank_agency=NULL, bank_account=NULL, pix_key='12345678000199', pix_key_type='cnpj' WHERE id='${projetoId}'`);
  const r = await registrar();
  igual(r.status, 201, 'status');
  igual(r.corpo.donation.banco.pix_key, '12345678000199', 'pix_key');
});

// ── migracao 034 ───────────────────────────────────────────────────────────
// Recria o cenario da 022: projeto ficticio 261847 ativo, com conta, e a
// organizacao 'www' com a mesma conta. Depois da 034, nada disso serve.
await q(`UPDATE org_projects SET is_active=false WHERE id='${projetoId}'`);
await q(`INSERT INTO org_projects (organization_id, pronac, titulo, proponente_nome, bank_name, bank_code, bank_agency, bank_account, is_active, is_featured)
         VALUES ('${orgId}','261847','Orquestra das Periferias','Orquestra','Banco do Brasil','001','3217-4','48.291-5',true,true)`);

await teste('antes da 034, o PRONAC ficticio ainda e devolvido como destino', async () => {
  const r = await registrar();
  igual(r.status, 201, 'status');
  igual(r.corpo.donation.banco.bank_agency, '3217-4', 'bank_agency');
});

const sql034 = fs.readFileSync(path.join(AQUI, '../src/migrations/034_zera_conta_ficticia_www.sql'), 'utf8');
await teste('migracao 034 aplica', async () => { await poolFalso.query(sql034); });

await teste('depois da 034: conta da www zerada e 261847 desativado', async () => {
  await recarregaOrg();
  igual(orgAtual.bank_agency, null, 'organizations.bank_agency');
  igual(orgAtual.bank_account, null, 'organizations.bank_account');
  const [p] = await q(`SELECT is_active, is_featured, bank_agency FROM org_projects WHERE pronac='261847'`);
  igual(p.is_active, false, 'is_active');
  igual(p.is_featured, false, 'is_featured');
  igual(p.bank_agency, null, 'bank_agency');
});

await teste('depois da 034, a rota recusa em vez de devolver a conta ficticia', async () => {
  const r = await registrar();
  igual(r.status, 409, 'status');
});

servidor.close();

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
