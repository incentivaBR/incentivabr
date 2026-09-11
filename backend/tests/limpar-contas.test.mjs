// CPF e e-mail sao unicos na tabela de contas. Quem esta experimentando a
// plataforma esbarra em "CPF ja cadastrado" na segunda tentativa e, ate aqui,
// nao havia nenhum caminho no produto para desfazer — so editando o banco a
// mao. GET /api/admin/usuarios e DELETE /api/admin/usuarios/:id fecham isso.
//
// O que estes testes guardam sao as travas, porque apagar conta nao tem
// desfazer:
//
//   - superadmin nunca e apagado (apagar o unico tranca o sistema por fora);
//   - conta com destinacao so sai em modo simulacao, onde a destinacao e
//     exercicio; fora dele, comprovante e recibo sao registro fiscal;
//   - a listagem mascara o CPF: o superadmin precisa reconhecer a conta, nao
//     ler o documento de ninguem;
//   - quem apagou fica no audit_log.
import { newDb } from 'pg-mem';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'teste';

const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});
db.public.none(`
  CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, slug TEXT,
    custom_domain TEXT, website_url TEXT, cnpj TEXT, plan_type TEXT,
    fund_type TEXT, fund_name TEXT, max_percentage NUMERIC(5,2),
    contact_email TEXT, contact_phone TEXT, primary_color TEXT, secondary_color TEXT,
    logo_url TEXT, hero_titulo TEXT, hero_subtitulo TEXT, sobre TEXT,
    is_active BOOLEAN DEFAULT true, contracted_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(),
    govbr_client_id TEXT, govbr_client_secret TEXT, govbr_redirect_uri TEXT
  );
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpf TEXT UNIQUE, nome TEXT, email TEXT, phone TEXT, senha_hash TEXT,
    is_superadmin BOOLEAN DEFAULT false, organization_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE organization_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, user_id UUID, role TEXT, is_active BOOLEAN DEFAULT true
  );
  CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, organization_id UUID, donation_amount NUMERIC, status TEXT
  );
  CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, user_id UUID, action TEXT, entity_type TEXT, entity_id TEXT,
    details TEXT, ip_address TEXT, user_agent TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
  );
  INSERT INTO organizations (name, slug) VALUES ('IncentivaBR','www');
`);

const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });
const q = async (sql, p) => (await poolFalso.query(sql, p)).rows;

const [org] = await q(`SELECT * FROM organizations WHERE slug = 'www'`);
const cria = async (cpf, nome, email, superadmin = false) => {
  const [u] = await q(
    `INSERT INTO users (cpf, nome, email, senha_hash, is_superadmin, organization_id)
     VALUES ($1,$2,$3,'h',$4,$5) RETURNING id`, [cpf, nome, email, superadmin, org.id]);
  return u.id;
};

const chefe    = await cria('11144477735', 'Superadmin',      'chefe@incentivabr.com.br', true);
const comum    = await cria('52998224725', 'Maria de Teste',  'maria@exemplo.gov.br');
const comDoacao = await cria('10000000019', 'Joao de Teste',  'joao@exemplo.gov.br');
await q(`INSERT INTO donations (user_id, organization_id, donation_amount, status)
         VALUES ($1,$2,1200,'awaiting_confirmation')`, [comDoacao, org.id]);

const { default: adminRoutes } = await import('../src/routes/admin.js');
const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

const tokenChefe = jwt.sign({ userId: chefe, orgId: org.id, isSuperadmin: true }, 'teste');
const tokenComum = jwt.sign({ userId: comum, orgId: org.id }, 'teste');
const chama = (rota, opcoes = {}, token = tokenChefe) =>
  fetch(BASE + rota, {
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, ...opcoes
  }).then(async r => [r.status, await r.json()]);

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

await teste('a listagem mascara o CPF e nunca devolve o numero inteiro', async () => {
  const [status, corpo] = await chama('/api/admin/usuarios');
  if (status !== 200) throw new Error('status ' + status);
  const maria = corpo.usuarios.find(u => u.email === 'maria@exemplo.gov.br');
  if (!maria) throw new Error('a conta nao apareceu na lista');
  if (maria.cpf_mascarado !== '•••.•••.247-25') throw new Error('mascara: ' + maria.cpf_mascarado);
  const texto = JSON.stringify(corpo);
  if (texto.includes('52998224725')) throw new Error('o CPF inteiro vazou na resposta');
  if ('cpf' in maria) throw new Error('a resposta ainda traz o campo cpf cru');
});

await teste('a listagem conta as destinacoes e marca o superadmin', async () => {
  const [, corpo] = await chama('/api/admin/usuarios');
  const joao = corpo.usuarios.find(u => u.email === 'joao@exemplo.gov.br');
  if (joao.destinacoes !== 1) throw new Error('destinacoes: ' + joao.destinacoes);
  const c = corpo.usuarios.find(u => u.email === 'chefe@incentivabr.com.br');
  if (c.is_superadmin !== true) throw new Error('o superadmin nao esta marcado');
});

await teste('a busca acha por e-mail e por CPF, com ou sem pontuacao', async () => {
  const [, porEmail] = await chama('/api/admin/usuarios?busca=maria@exemplo');
  if (porEmail.usuarios.length !== 1) throw new Error('por e-mail: ' + porEmail.usuarios.length);
  const [, porCpf] = await chama('/api/admin/usuarios?busca=529.982.247-25');
  if (!porCpf.usuarios.some(u => u.email === 'maria@exemplo.gov.br')) throw new Error('nao achou pelo CPF pontuado');
});

await teste('superadmin nao e apagado, mesmo pedindo', async () => {
  const [status, corpo] = await chama(`/api/admin/usuarios/${chefe}`, { method: 'DELETE' });
  if (status !== 409) throw new Error('status ' + status);
  if (!/super-administrador/i.test(corpo.message)) throw new Error('mensagem: ' + corpo.message);
  const [u] = await q(`SELECT id FROM users WHERE id = $1`, [chefe]);
  if (!u) throw new Error('o superadmin foi apagado');
});

await teste('fora do modo simulacao, conta com destinacao nao e apagada', async () => {
  delete process.env.SIMULATION_MODE;
  const [status, corpo] = await chama(`/api/admin/usuarios/${comDoacao}`, { method: 'DELETE' });
  if (status !== 409) throw new Error('status ' + status);
  if (!/registro fiscal/i.test(corpo.message)) throw new Error('mensagem: ' + corpo.message);
  const [u] = await q(`SELECT id FROM users WHERE id = $1`, [comDoacao]);
  if (!u) throw new Error('a conta com destinacao foi apagada fora da simulacao');
});

await teste('em modo simulacao, a conta e a destinacao de exercicio saem juntas', async () => {
  process.env.SIMULATION_MODE = 'true';
  const [status, corpo] = await chama(`/api/admin/usuarios/${comDoacao}`, { method: 'DELETE' });
  if (status !== 200) throw new Error(`status ${status}: ${corpo.message}`);
  if (corpo.destinacoes_removidas !== 1) throw new Error('removidas: ' + corpo.destinacoes_removidas);
  const sobrou = await q(`SELECT id FROM donations WHERE user_id = $1`, [comDoacao]);
  if (sobrou.length) throw new Error('a destinacao de exercicio ficou orfa');
});

await teste('apagar libera o CPF e o e-mail para um novo cadastro', async () => {
  const [status] = await chama(`/api/admin/usuarios/${comum}`, { method: 'DELETE' });
  if (status !== 200) throw new Error('status ' + status);
  const sobrou = await q(`SELECT id FROM users WHERE cpf = '52998224725'`);
  if (sobrou.length) throw new Error('a conta continua la');
  // O que prova a liberacao: o mesmo CPF entra de novo sem violar o UNIQUE.
  await q(`INSERT INTO users (cpf, nome, email, senha_hash) VALUES ('52998224725','De novo','maria@exemplo.gov.br','h')`);
});

await teste('o vinculo com a organizacao sai junto, sem deixar orfao', async () => {
  const [status] = await chama(`/api/admin/usuarios/${chefe}`, { method: 'DELETE' });
  if (status !== 409) throw new Error('o superadmin deixou de ser protegido');
  const orfaos = await q(`SELECT ou.id FROM organization_users ou
                          LEFT JOIN users u ON u.id = ou.user_id WHERE u.id IS NULL`);
  if (orfaos.length) throw new Error(orfaos.length + ' vinculos orfaos');
});

await teste('quem apagou fica no audit_log, sem o CPF', async () => {
  const linhas = await q(`SELECT user_id, action, details FROM audit_log WHERE action = 'user.deleted'`);
  if (!linhas.length) throw new Error('nada foi registrado');
  if (linhas[0].user_id !== chefe) throw new Error('nao registrou quem apagou');
  if (/\d{11}/.test(String(linhas[0].details))) throw new Error('o CPF foi parar no audit_log');
});

await teste('conta que nao existe responde 404', async () => {
  const [status] = await chama('/api/admin/usuarios/' + crypto.randomUUID(), { method: 'DELETE' });
  if (status !== 404) throw new Error('status ' + status);
});

await teste('conta sem superadmin nao lista nem apaga', async () => {
  const [lista] = await chama('/api/admin/usuarios', {}, tokenComum);
  if (lista !== 403) throw new Error('listagem: status ' + lista);
  const [apaga] = await chama('/api/admin/usuarios/' + chefe, { method: 'DELETE' }, tokenComum);
  if (apaga !== 403) throw new Error('exclusao: status ' + apaga);
});

servidor.close();
console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
