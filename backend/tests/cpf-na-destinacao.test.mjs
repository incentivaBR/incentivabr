// O CPF saiu da criacao de conta (migration 040) e passou a ser pedido aqui,
// em POST /api/donations/rouanet, que e onde ele serve: vai no Recibo de
// Mecenato que o proponente emite, e e por ele que a Receita liga a deducao a
// pessoa.
//
// O que estes testes guardam:
//
//   - sem CPF na conta e sem CPF no pedido, a destinacao NAO e registrada;
//   - o numero informado e validado pelo digito verificador antes de entrar;
//   - CPF que ja esta em outra conta e recusado — senao duas contas
//     apontariam para o mesmo contribuinte e o teto de 6% seria conferido
//     por metade;
//   - informado uma vez, fica na conta: a segunda destinacao nao pergunta;
//   - cada recusa traz um `codigo`, que e como a tela sabe reabrir o campo do
//     CPF em vez de so mostrar um erro sem saida.
import { newDb, DataType } from 'pg-mem';
import express from 'express';
import jwt from 'jsonwebtoken';
import http from 'http';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'teste';
process.env.SIMULATION_MODE = 'true';

const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: DataType.uuid, impure: true,
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
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT, cpf TEXT UNIQUE, email TEXT, phone TEXT, total_donated NUMERIC DEFAULT 0
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
  CREATE TABLE incentive_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE, name TEXT, max_percentage NUMERIC(5,2), period_type TEXT, teto_codigo TEXT
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
const q = async (sql, p) => (await poolFalso.query(sql, p)).rows;

const { default: donationsRoutes } = await import('../src/routes/donations.js');

const [{ id: orgId }] = await q(
  `INSERT INTO organizations (name, slug) VALUES ('IncentivaBR','www') RETURNING id`);
await q(`INSERT INTO org_projects (organization_id, pronac, titulo, proponente_nome,
           bank_name, bank_code, bank_agency, bank_account, is_active, is_featured)
         VALUES ($1,'2511274','Mostra','Casa Azul','Banco do Brasil','001','3217-4','48.291-5',true,true)`, [orgId]);

// Sem CPF: e assim que uma conta nasce agora.
const [{ id: semCpf }] = await q(
  `INSERT INTO users (nome, email) VALUES ('Maria','maria@x.gov.br') RETURNING id`);
// Com CPF: para o caso de numero ja em uso.
const [{ id: outra }] = await q(
  `INSERT INTO users (nome, cpf, email) VALUES ('Joao','52998224725','joao@x.gov.br') RETURNING id`);

const org = (await q(`SELECT * FROM organizations WHERE id = $1`, [orgId]))[0];
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.organization = org; next(); });
app.use('/api/donations', donationsRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

let ano = 2040;
const destina = async (userId, extra = {}) => {
  const r = await fetch(BASE + '/api/donations/rouanet', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + jwt.sign({ userId, orgId }, 'teste', { expiresIn: '1h' })
    },
    body: JSON.stringify({
      pronac: '2511274', projeto_titulo: 'Mostra', ir_devido: 100000,
      donation_amount: 500, fiscal_year: ano++, ...extra
    })
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};
const quantas = async () => Number((await q('SELECT COUNT(*) AS n FROM donations'))[0].n);

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

await teste('sem CPF na conta e sem CPF no pedido, nao registra', async () => {
  const antes = await quantas();
  const { status, corpo } = await destina(semCpf);
  if (status !== 400) throw new Error('status ' + status);
  if (corpo.codigo !== 'cpf_necessario') throw new Error('codigo: ' + corpo.codigo);
  if (!/recibo de mecenato/i.test(corpo.message)) throw new Error('a mensagem nao explica para que serve: ' + corpo.message);
  if (await quantas() !== antes) throw new Error('registrou mesmo assim');
});

await teste('CPF mal formado e recusado antes de entrar no banco', async () => {
  const antes = await quantas();
  const { status, corpo } = await destina(semCpf, { cpf: '111.111.111-11' });
  if (status !== 400) throw new Error('status ' + status);
  if (corpo.codigo !== 'cpf_invalido') throw new Error('codigo: ' + corpo.codigo);
  const [u] = await q(`SELECT cpf FROM users WHERE id = $1`, [semCpf]);
  if (u.cpf !== null) throw new Error('gravou um CPF invalido: ' + u.cpf);
  if (await quantas() !== antes) throw new Error('registrou mesmo assim');
});

await teste('CPF que ja esta em outra conta e recusado', async () => {
  const { status, corpo } = await destina(semCpf, { cpf: '529.982.247-25' });
  if (status !== 409) throw new Error('status ' + status);
  if (corpo.codigo !== 'cpf_em_uso') throw new Error('codigo: ' + corpo.codigo);
  const [u] = await q(`SELECT cpf FROM users WHERE id = $1`, [semCpf]);
  if (u.cpf !== null) throw new Error('roubou o CPF da outra conta');
});

await teste('CPF valido entra na conta e a destinacao e registrada', async () => {
  const antes = await quantas();
  const { status, corpo } = await destina(semCpf, { cpf: '100.000.000-19' });
  if (status !== 201 && status !== 200) throw new Error(`status ${status}: ${corpo.message}`);
  const [u] = await q(`SELECT cpf FROM users WHERE id = $1`, [semCpf]);
  if (u.cpf !== '10000000019') throw new Error('cpf gravado: ' + u.cpf);
  if (await quantas() !== antes + 1) throw new Error('nao registrou');
});

await teste('na segunda destinacao nao pergunta de novo', async () => {
  const antes = await quantas();
  const { status, corpo } = await destina(semCpf);   // sem mandar CPF
  if (status !== 201 && status !== 200) throw new Error(`status ${status}: ${corpo.message}`);
  if (await quantas() !== antes + 1) throw new Error('nao registrou');
});

await teste('quem ja tinha CPF na conta segue sem informar nada', async () => {
  const antes = await quantas();
  const { status, corpo } = await destina(outra);
  if (status !== 201 && status !== 200) throw new Error(`status ${status}: ${corpo.message}`);
  if (await quantas() !== antes + 1) throw new Error('nao registrou');
  const [u] = await q(`SELECT cpf FROM users WHERE id = $1`, [outra]);
  if (u.cpf !== '52998224725') throw new Error('mexeu no CPF de quem ja tinha: ' + u.cpf);
});

servidor.close();
console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
