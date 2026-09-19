// O convite entrega o papel que confirma dinheiro de terceiros. Estes testes
// travam o que nao pode afrouxar numa refatoracao distraida.
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
    name TEXT, slug TEXT, primary_color TEXT, secondary_color TEXT, logo_url TEXT
  );
  CREATE TABLE users (encerrada_em TIMESTAMP, anonimizada_em TIMESTAMP, 
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpf TEXT UNIQUE, nome TEXT, email TEXT, senha_hash TEXT,
    email_verified BOOLEAN DEFAULT false, organization_id UUID,
    accepted_terms_at TIMESTAMP
  );
  CREATE TABLE organization_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL, user_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'member', invited_by UUID,
    invited_at TIMESTAMP DEFAULT NOW(), accepted_at TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (organization_id, user_id)
  );
`);
db.public.none(fs.readFileSync(path.join(AQUI, '../src/migrations/033_convites.sql'), 'utf8'));

const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });

// O e-mail nao sai daqui, mas o token em claro passa por ele — e a unica vez
// que ele existe fora do navegador do convidado.
let ultimoTokenEnviado = null;

const q = async (sql, p) => (await poolFalso.query(sql, p)).rows;

const [{ id: orgId }] = await q(
  `INSERT INTO organizations (name, slug) VALUES ('Casa Azul','casa-azul') RETURNING id`);
const [{ id: outraOrg }] = await q(
  `INSERT INTO organizations (name, slug) VALUES ('Outro Cliente','outro') RETURNING id`);
const [{ id: gestorId }] = await q(
  `INSERT INTO users (cpf, nome, email, senha_hash) VALUES ('11111111111','Gestor','gestor@casazul.org.br','x') RETURNING id`);
await q(`INSERT INTO organization_users (organization_id, user_id, role, is_active)
         VALUES ($1,$2,'org_admin',true)`, [orgId, gestorId]);

const [{ id: superId }] = await q(
  `INSERT INTO users (cpf, nome, email, senha_hash) VALUES ('22222222222','Super','super@incentivabr.com.br','x') RETURNING id`);
await q(`INSERT INTO organization_users (organization_id, user_id, role, is_active)
         VALUES ($1,$2,'superadmin',true)`, [orgId, superId]);

const { default: convitesRoutes, _trocaEnvioDeConvite } = await import('../src/routes/convites.js');
_trocaEnvioDeConvite(async (_org, _c, claro) => { ultimoTokenEnviado = claro; return true; });
const jwt = (await import('jsonwebtoken')).default;

const app = express();
app.use(express.json());
app.use('/api/convites', convitesRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

const token = (userId) => jwt.sign({ userId }, 'teste', { expiresIn: '1h' });
const pede = async (metodo, caminho, corpo, comoUsuario) => {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(comoUsuario ? { Authorization: 'Bearer ' + token(comoUsuario) } : {})
    },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

await teste('quem nao gere a organizacao nao convida', async () => {
  const [{ id: estranho }] = await q(
    `INSERT INTO users (cpf, nome, email, senha_hash) VALUES ('99999999999','Estranho','x@y.com','x') RETURNING id`);
  const r = await pede('POST', '/api/convites',
    { organization_id: orgId, email: 'alguem@casazul.org.br' }, estranho);
  if (r.status !== 403) throw new Error('status: ' + r.status);
});

await teste('o gestor da organizacao convida', async () => {
  const r = await pede('POST', '/api/convites',
    { organization_id: orgId, email: 'Felipe@CasAzul.org.BR', nome: 'Felipe' }, gestorId);
  if (r.status !== 201) throw new Error(JSON.stringify(r.corpo));
  if (!ultimoTokenEnviado) throw new Error('o token nao chegou ao e-mail');
});

await teste('o banco guarda o hash, nunca o token', async () => {
  const [c] = await q('SELECT token_hash, email FROM org_invites ORDER BY created_at DESC LIMIT 1');
  if (c.token_hash === ultimoTokenEnviado) throw new Error('o token foi guardado em claro');
  if (!/^[0-9a-f]{64}$/.test(c.token_hash)) throw new Error('nao parece um sha-256');
  // E-mail normalizado: senao "Felipe@" e "felipe@" viram duas pessoas.
  if (c.email !== 'felipe@casazul.org.br') throw new Error('e-mail nao normalizado: ' + c.email);
});

await teste('consultar o token diz a organizacao, e nao vaza o hash', async () => {
  const r = await pede('GET', `/api/convites/token/${ultimoTokenEnviado}`);
  if (r.status !== 200) throw new Error(JSON.stringify(r.corpo));
  if (r.corpo.convite.organizacao !== 'Casa Azul') throw new Error('org errada');
  if (JSON.stringify(r.corpo).includes('token_hash')) throw new Error('vazou o hash');
});

await teste('token inexistente devolve o mesmo recado generico', async () => {
  const r = await pede('GET', '/api/convites/token/naoexiste');
  if (r.status !== 410) throw new Error('status: ' + r.status);
  // Dizer "ja foi aceito" a quem tem o link revelaria que ele e valido e que
  // alguem entrou — util para quem interceptou o e-mail.
  if (/aceito|expirado|revogado/i.test(r.corpo.message)) {
    throw new Error('a mensagem revela o motivo: ' + r.corpo.message);
  }
});

await teste('aceitar cria a conta e o vinculo de gestor', async () => {
  const r = await pede('POST', `/api/convites/token/${ultimoTokenEnviado}/aceitar`,
    { senha: 'senha-bem-longa', nome: 'Felipe Augusto', cpf: '123.456.789-01' });
  if (r.status !== 200) throw new Error(JSON.stringify(r.corpo));

  const [v] = await q(`SELECT ou.role, u.email, u.cpf FROM organization_users ou
                       JOIN users u ON u.id = ou.user_id
                       WHERE ou.organization_id = $1 AND u.email = 'felipe@casazul.org.br'`, [orgId]);
  if (!v) throw new Error('nenhum vinculo criado');
  if (v.role !== 'org_admin') throw new Error('papel: ' + v.role);
  if (v.cpf !== '12345678901') throw new Error('cpf nao normalizado: ' + v.cpf);
});

await teste('o mesmo link nao serve duas vezes', async () => {
  const r = await pede('POST', `/api/convites/token/${ultimoTokenEnviado}/aceitar`,
    { senha: 'outra-senha', nome: 'Outro', cpf: '98765432100' });
  if (r.status !== 410) throw new Error('status: ' + r.status);
});

await teste('a senha foi guardada com hash', async () => {
  const [u] = await q(`SELECT senha_hash FROM users WHERE email = 'felipe@casazul.org.br'`);
  if (!u.senha_hash.startsWith('$2')) throw new Error('senha em claro');
  if (!(await bcrypt.compare('senha-bem-longa', u.senha_hash))) throw new Error('hash nao confere');
});

await teste('reenviar revoga o convite anterior, em vez de abrir uma segunda porta', async () => {
  await pede('POST', '/api/convites', { organization_id: orgId, email: 'novo@casazul.org.br' }, gestorId);
  const primeiro = ultimoTokenEnviado;
  await pede('POST', '/api/convites', { organization_id: orgId, email: 'novo@casazul.org.br' }, gestorId);
  const segundo = ultimoTokenEnviado;
  if (primeiro === segundo) throw new Error('reenviou o mesmo token');

  const r = await pede('GET', `/api/convites/token/${primeiro}`);
  if (r.status !== 410) throw new Error('o primeiro link continua valendo');
  const r2 = await pede('GET', `/api/convites/token/${segundo}`);
  if (r2.status !== 200) throw new Error('o segundo link nao vale');
});

await teste('conta existente exige a senha dela', async () => {
  // Sem isto, quem interceptasse o e-mail trocaria a senha de uma conta que ja
  // existe usando so o link do convite.
  // Pelo superadmin: o gestor da Casa Azul nao gere a outra organizacao.
  await pede('POST', '/api/convites', { organization_id: outraOrg, email: 'felipe@casazul.org.br' }, superId);
  const link = ultimoTokenEnviado;

  const errada = await pede('POST', `/api/convites/token/${link}/aceitar`, { senha: 'chute' });
  if (errada.status !== 401) throw new Error('aceitou com senha errada: ' + errada.status);

  const certa = await pede('POST', `/api/convites/token/${link}/aceitar`, { senha: 'senha-bem-longa' });
  if (certa.status !== 200) throw new Error(JSON.stringify(certa.corpo));
});

await teste('convite expirado nao vale', async () => {
  await pede('POST', '/api/convites', { organization_id: orgId, email: 'tarde@casazul.org.br' }, gestorId);
  await q(`UPDATE org_invites SET expires_at = NOW() - INTERVAL '1 hour'
            WHERE LOWER(email) = 'tarde@casazul.org.br'`);
  const r = await pede('GET', `/api/convites/token/${ultimoTokenEnviado}`);
  if (r.status !== 410) throw new Error('status: ' + r.status);
});

await teste('revogar um convite ja aceito e recusado, com explicacao util', async () => {
  const [c] = await q(`SELECT id FROM org_invites WHERE accepted_at IS NOT NULL LIMIT 1`);
  const r = await pede('POST', `/api/convites/${c.id}/revogar`, null, gestorId);
  if (r.status !== 409) throw new Error('status: ' + r.status);
  // Revogar nao tira o acesso de quem ja entrou; dizer que tirou deixaria
  // alguem achando que fechou uma porta que segue aberta.
  if (!/desative/i.test(r.corpo.message)) throw new Error('nao diz o que fazer: ' + r.corpo.message);
});

await teste('a listagem nunca devolve o hash do token', async () => {
  const r = await pede('GET', `/api/convites?organization_id=${orgId}`, null, gestorId);
  if (r.status !== 200) throw new Error(JSON.stringify(r.corpo));
  if (JSON.stringify(r.corpo).includes('token_hash')) throw new Error('vazou o hash na listagem');
  if (!r.corpo.convites.some(c => c.situacao === 'aceito')) throw new Error('sem situacao calculada');
});

servidor.close();

console.log('\n================================================================');
ok.forEach(n => console.log('  ok   ', n));
falhas.forEach(([n, e]) => console.log('  FALHA', n, '\n          ' + e));
console.log('================================================================');
console.log(`${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
