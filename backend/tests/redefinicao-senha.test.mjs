// Seguranca de conta (Raio-X, risco 05): o token de redefinicao de senha
// nunca fica em claro no banco, e o JWT nao carrega o CPF.
//
// Roda contra o pg-mem, com as rotas de /api/auth de verdade e o envio de
// e-mail trocado por uma funcao que captura o link.
import { newDb } from 'pg-mem';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'teste';

const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});

db.public.none(`
  CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT, slug TEXT, custom_domain TEXT, primary_color TEXT, secondary_color TEXT, fund_type TEXT
  );
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpf TEXT UNIQUE, nome TEXT, email TEXT, phone TEXT, senha_hash TEXT,
    total_donated NUMERIC DEFAULT 0,
    is_admin BOOLEAN DEFAULT false, is_superadmin BOOLEAN DEFAULT false, is_org_admin BOOLEAN DEFAULT false,
    organization_id UUID, email_verified BOOLEAN DEFAULT false,
    accepted_terms_at TIMESTAMP, accepted_terms_version TEXT,
    -- No Postgres real as colunas sao TIMESTAMP (migration 015); o pg-mem nao
    -- compara TIMESTAMP com NOW(), entao aqui sao TIMESTAMPTZ.
    email_verification_token TEXT, email_verification_expires TIMESTAMPTZ,
    reset_token TEXT, reset_token_expires TIMESTAMPTZ,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE organization_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, user_id UUID, role TEXT, accepted_at TIMESTAMP,
    UNIQUE (organization_id, user_id)
  );
  CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, user_id UUID, action TEXT, entity_type TEXT, entity_id UUID,
    details TEXT, ip_address TEXT, user_agent TEXT, created_at TIMESTAMP DEFAULT NOW()
  );
`);

const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });

const q = async (sql, p) => (await poolFalso.query(sql, p)).rows;

const [{ id: orgId }] = await q(
  `INSERT INTO organizations (name, slug) VALUES ('Casa Azul','casa-azul') RETURNING id`);
const [{ id: mariaId }] = await q(
  `INSERT INTO users (cpf, nome, email, senha_hash, organization_id, email_verified)
   VALUES ('12345678901','Maria','maria@exemplo.gov.br',$1,$2,true) RETURNING id`,
  [await bcrypt.hash('senha-antiga', 4), orgId]);

const { default: authRoutes, _trocaEnvioDeRedefinicao } = await import('../src/routes/auth.js');
const { hashDoToken } = await import('../src/lib/tokens.js');
const jwt = (await import('jsonwebtoken')).default;

// O e-mail nao sai daqui; so o link passa por aqui.
let ultimoLink = null;
_trocaEnvioDeRedefinicao(async ({ link }) => { ultimoLink = link; });

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.organization = { id: orgId, slug: 'casa-azul' }; next(); });
app.use('/api/auth', authRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

const pede = async (caminho, corpo) => {
  const r = await fetch(base + caminho, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};
const igual = (a, b, o) => { if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };
const tokenDoLink = () => new URL(ultimoLink).searchParams.get('t');

// ── JWT ─────────────────────────────────────────────────────────────────────
await teste('o JWT do login nao carrega o CPF, so identificadores e papeis', async () => {
  const r = await pede('/api/auth/login', { email: 'maria@exemplo.gov.br', senha: 'senha-antiga' });
  igual(r.status, 200, 'status');
  const payload = jwt.verify(r.corpo.token, 'teste');
  igual(payload.cpf, undefined, 'cpf no payload');
  igual(payload.userId, mariaId, 'userId');
  igual(payload.orgId, orgId, 'orgId');
  igual('isSuperadmin' in payload, true, 'isSuperadmin presente');
  // O CPF continua vindo no corpo da resposta, que so a dona ve.
  igual(r.corpo.user.cpf, '12345678901', 'cpf no corpo');
});

// ── forgot-password ─────────────────────────────────────────────────────────
await teste('forgot-password: o banco guarda o hash, o e-mail leva o valor em claro', async () => {
  ultimoLink = null;
  const r = await pede('/api/auth/forgot-password', { email: 'maria@exemplo.gov.br' });
  igual(r.status, 200, 'status');
  if (!ultimoLink) throw new Error('o link nao chegou ao e-mail');
  const claro = tokenDoLink();
  if (!claro || claro.length < 32) throw new Error('token curto ou ausente: ' + claro);
  if (!ultimoLink.includes('/redefinir-senha.html?t=')) throw new Error('link errado: ' + ultimoLink);
  if (!ultimoLink.includes('org=casa-azul')) throw new Error('link sem o tenant: ' + ultimoLink);

  const [u] = await q('SELECT reset_token, reset_token_expires FROM users WHERE id = $1', [mariaId]);
  if (u.reset_token === claro) throw new Error('o banco guardou o token em claro');
  igual(u.reset_token, hashDoToken(claro), 'hash no banco');
  igual(/^[0-9a-f]{64}$/.test(u.reset_token), true, 'formato sha256');
  if (!(new Date(u.reset_token_expires) > new Date())) throw new Error('expiracao no passado');
});

await teste('forgot-password responde igual para e-mail desconhecido', async () => {
  ultimoLink = null;
  const conhecido = await pede('/api/auth/forgot-password', { email: 'maria@exemplo.gov.br' });
  const desconhecido = await pede('/api/auth/forgot-password', { email: 'ninguem@exemplo.gov.br' });
  igual(desconhecido.status, 200, 'status');
  igual(desconhecido.corpo.message, conhecido.corpo.message, 'mesma mensagem');
});

// ── reset-password ──────────────────────────────────────────────────────────
await teste('o hash tirado do banco nao redefine nada', async () => {
  const [u] = await q('SELECT reset_token FROM users WHERE id = $1', [mariaId]);
  const r = await pede('/api/auth/reset-password', { token: u.reset_token, senha: 'senha-invasor' });
  igual(r.status, 400, 'status');
  const login = await pede('/api/auth/login', { email: 'maria@exemplo.gov.br', senha: 'senha-invasor' });
  igual(login.status, 401, 'senha do invasor nao vale');
});

await teste('o token em claro do e-mail redefine, e so uma vez', async () => {
  const claro = tokenDoLink();
  const r = await pede('/api/auth/reset-password', { token: claro, senha: 'senha-nova-123' });
  igual(r.status, 200, 'status: ' + JSON.stringify(r.corpo));

  const login = await pede('/api/auth/login', { email: 'maria@exemplo.gov.br', senha: 'senha-nova-123' });
  igual(login.status, 200, 'login com a senha nova');
  const antiga = await pede('/api/auth/login', { email: 'maria@exemplo.gov.br', senha: 'senha-antiga' });
  igual(antiga.status, 401, 'senha antiga morreu');

  const [u] = await q('SELECT reset_token, reset_token_expires FROM users WHERE id = $1', [mariaId]);
  igual(u.reset_token, null, 'token apagado');
  igual(u.reset_token_expires, null, 'expiracao apagada');

  const denovo = await pede('/api/auth/reset-password', { token: claro, senha: 'outra-senha-123' });
  igual(denovo.status, 400, 'segundo uso recusado');
});

await teste('token expirado e recusado', async () => {
  ultimoLink = null;
  await pede('/api/auth/forgot-password', { email: 'maria@exemplo.gov.br' });
  const claro = tokenDoLink();
  await q(`UPDATE users SET reset_token_expires = NOW() - INTERVAL '1 minute' WHERE id = $1`, [mariaId]);
  const r = await pede('/api/auth/reset-password', { token: claro, senha: 'senha-tardia-123' });
  igual(r.status, 400, 'status');
  const login = await pede('/api/auth/login', { email: 'maria@exemplo.gov.br', senha: 'senha-nova-123' });
  igual(login.status, 200, 'a senha vigente continua');
});

// ── cadastro ────────────────────────────────────────────────────────────────
await teste('o token de verificacao de e-mail do cadastro tambem entra como hash', async () => {
  const r = await pede('/api/auth/register', {
    cpf: '529.982.247-25', nome: 'Joao Servidor', email: 'joao@exemplo.gov.br',
    senha: 'senha-joao-123', accepted_terms: true
  });
  igual(r.status, 201, 'status: ' + JSON.stringify(r.corpo));
  const [u] = await q('SELECT email_verification_token FROM users WHERE email = $1', ['joao@exemplo.gov.br']);
  igual(/^[0-9a-f]{64}$/.test(u.email_verification_token), true, 'formato sha256: ' + u.email_verification_token);
});

// ── migration 038 ───────────────────────────────────────────────────────────
await teste('a migration 038 anula os tokens que existiam em claro', async () => {
  await q(`UPDATE users SET reset_token = 'em-claro', reset_token_expires = NOW() + INTERVAL '1 hour',
           email_verification_token = 'em-claro-2', email_verification_expires = NOW() + INTERVAL '1 day'
           WHERE id = $1`, [mariaId]);
  const sql = fs.readFileSync(path.join(AQUI, '../src/migrations/038_tokens_de_conta_com_hash.sql'), 'utf8');
  for (const cmd of sql.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--') || /UPDATE/i.test(s))) {
    const semComentario = cmd.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').trim();
    if (semComentario) await q(semComentario);
  }
  const [u] = await q(`SELECT reset_token, reset_token_expires, email_verification_token, email_verification_expires
                       FROM users WHERE id = $1`, [mariaId]);
  igual(u.reset_token, null, 'reset_token');
  igual(u.reset_token_expires, null, 'reset_token_expires');
  igual(u.email_verification_token, null, 'email_verification_token');
  igual(u.email_verification_expires, null, 'email_verification_expires');
});

servidor.close();
console.log('\n================================================================');
for (const n of ok) console.log(`  ok    ${n}`);
for (const [n, e] of falhas) console.log(`  FALHA ${n}\n        ${e}`);
console.log('================================================================');
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
