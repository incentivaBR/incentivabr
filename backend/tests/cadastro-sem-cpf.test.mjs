// Duas mudancas no cadastro, de setembro de 2026.
//
// 1. O CPF sai da criacao de conta (migration 040). Ele era obrigatorio na
//    primeira tela, antes de a pessoa entender o que a plataforma faz. Passa a
//    ser pedido no momento de registrar a destinacao, que e onde serve: vai no
//    Recibo de Mecenato. Pedir documento antes da hora e atrito e e guardar
//    dado sem finalidade imediata.
//
// 2. A confirmacao de e-mail passa a ser enviada. O token era gerado e
//    guardado como hash desde sempre, mas o valor em claro era descartado na
//    mesma linha: nenhuma mensagem saia e nao existia pagina que a recebesse.
//    A conta ficava com email_verified = false para sempre.
import { newDb } from 'pg-mem';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'teste';
process.env.APP_URL = 'https://www.incentivabr.com.br';

const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});
db.public.none(`
  CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, slug TEXT, custom_domain TEXT
  );
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpf TEXT UNIQUE, nome TEXT, email TEXT, phone TEXT, senha_hash TEXT,
    total_donated NUMERIC DEFAULT 0,
    is_admin BOOLEAN DEFAULT false, is_superadmin BOOLEAN DEFAULT false, is_org_admin BOOLEAN DEFAULT false,
    organization_id UUID, email_verified BOOLEAN DEFAULT false,
    accepted_terms_at TIMESTAMP, accepted_terms_version TEXT,
    -- No Postgres real sao TIMESTAMP; o pg-mem nao compara TIMESTAMP com NOW().
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
  INSERT INTO organizations (name, slug) VALUES ('IncentivaBR','www');
`);

const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });
const q = async (sql, p) => (await poolFalso.query(sql, p)).rows;
const [org] = await q(`SELECT * FROM organizations WHERE slug = 'www'`);

const { default: authRoutes, _trocaEnvioDeVerificacao } = await import('../src/routes/auth.js');
const { hashDoToken } = await import('../src/lib/tokens.js');

// O e-mail nao sai daqui; so o link passa por aqui, como no teste da
// redefinicao. E a unica vez que o token em claro existe fora da caixa.
const enviados = [];
_trocaEnvioDeVerificacao(async (msg) => { enviados.push(msg); });

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.organization = org; next(); });
app.use('/api/auth', authRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

const post = (rota, corpo, token) =>
  fetch(BASE + rota, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(corpo)
  }).then(async r => [r.status, await r.json()]);

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

const CONTA = { nome: 'Maria Aparecida de Souza', email: 'maria@exemplo.gov.br', senha: 'senha-bem-comprida', accepted_terms: true };

await teste('cria conta sem CPF nenhum', async () => {
  const [status, corpo] = await post('/api/auth/register', CONTA);
  if (status !== 201) throw new Error(`status ${status}: ${corpo.message}`);
  const [u] = await q(`SELECT cpf, email, email_verified FROM users WHERE email = 'maria@exemplo.gov.br'`);
  if (u.cpf !== null) throw new Error('gravou CPF do nada: ' + u.cpf);
  if (u.email_verified !== false) throw new Error('nasceu verificada');
});

await teste('a mensagem avisa do e-mail e nao exige confirmar para entrar', async () => {
  const [, corpo] = await post('/api/auth/register', { ...CONTA, email: 'segunda@exemplo.gov.br' });
  if (!/e-?mail/i.test(corpo.message)) throw new Error('nao menciona o e-mail: ' + corpo.message);
  if (!/entrar/i.test(corpo.message)) throw new Error('nao diz que ja da para entrar: ' + corpo.message);
});

await teste('o e-mail de confirmacao sai, com link que a pagina sabe ler', async () => {
  const msg = enviados.find(m => m.to === 'maria@exemplo.gov.br');
  if (!msg) throw new Error('nenhuma mensagem foi enviada');
  if (!msg.link.startsWith('https://www.incentivabr.com.br/verificar-email.html?t=')) {
    throw new Error('link: ' + msg.link);
  }
  const token = new URL(msg.link).searchParams.get('t');
  const [u] = await q(`SELECT email_verification_token FROM users WHERE email = 'maria@exemplo.gov.br'`);
  if (u.email_verification_token !== hashDoToken(token)) throw new Error('o banco nao tem o hash deste token');
  if (u.email_verification_token === token) throw new Error('o token em claro foi parar no banco');
});

await teste('o token do e-mail confirma a conta, e so serve uma vez', async () => {
  const token = new URL(enviados.find(m => m.to === 'maria@exemplo.gov.br').link).searchParams.get('t');
  const [status] = await post('/api/auth/verify-email', { token });
  if (status !== 200) throw new Error('status ' + status);
  const [u] = await q(`SELECT email_verified, email_verification_token FROM users WHERE email = 'maria@exemplo.gov.br'`);
  if (u.email_verified !== true) throw new Error('nao marcou como verificada');
  if (u.email_verification_token !== null) throw new Error('o token ficou no banco depois de usado');

  const [repetido] = await post('/api/auth/verify-email', { token });
  if (repetido !== 400) throw new Error('o mesmo token serviu duas vezes: ' + repetido);
});

await teste('token inventado nao confirma nada', async () => {
  const [status] = await post('/api/auth/verify-email', { token: 'nao-sou-um-token' });
  if (status !== 400) throw new Error('status ' + status);
});

await teste('reenviar troca o token: o link antigo para de valer', async () => {
  const [u] = await q(`SELECT id FROM users WHERE email = 'segunda@exemplo.gov.br'`);
  const antes = enviados.filter(m => m.to === 'segunda@exemplo.gov.br').length;
  const token = jwt.sign({ userId: u.id, orgId: org.id }, 'teste');

  const linkAntigo = enviados.find(m => m.to === 'segunda@exemplo.gov.br').link;
  const [status] = await post('/api/auth/reenviar-verificacao', {}, token);
  if (status !== 200) throw new Error('status ' + status);
  if (enviados.filter(m => m.to === 'segunda@exemplo.gov.br').length !== antes + 1) {
    throw new Error('nenhuma mensagem nova');
  }
  const velho = new URL(linkAntigo).searchParams.get('t');
  const [recusado] = await post('/api/auth/verify-email', { token: velho });
  if (recusado !== 400) throw new Error('o link antigo continuou valendo: ' + recusado);
});

await teste('reenviar sem estar logado nao envia nada', async () => {
  const [status] = await post('/api/auth/reenviar-verificacao', {});
  if (status !== 401) throw new Error('status ' + status);
});

await teste('quem mandar CPF no cadastro ainda tem ele aceito e validado', async () => {
  const [bom] = await post('/api/auth/register', { ...CONTA, email: 'comcpf@exemplo.gov.br', cpf: '529.982.247-25' });
  if (bom !== 201) throw new Error('status ' + bom);
  const [u] = await q(`SELECT cpf FROM users WHERE email = 'comcpf@exemplo.gov.br'`);
  if (u.cpf !== '52998224725') throw new Error('cpf: ' + u.cpf);

  const [ruim, corpo] = await post('/api/auth/register', { ...CONTA, email: 'cpfruim@exemplo.gov.br', cpf: '111.111.111-11' });
  if (ruim !== 400) throw new Error('CPF invalido passou: ' + ruim);
  if (!/cpf/i.test(corpo.message)) throw new Error('mensagem: ' + corpo.message);
});

await teste('e-mail repetido diz E-MAIL, nao CPF, quando nao ha CPF nenhum', async () => {
  // Com os dois lados nulos, a comparacao antiga dava verdadeiro e a tela
  // mandava a pessoa procurar problema no CPF que ela nem tinha informado.
  const [status, corpo] = await post('/api/auth/register', CONTA);
  if (status !== 409) throw new Error('status ' + status);
  if (/cpf/i.test(corpo.message)) throw new Error('mensagem culpa o CPF: ' + corpo.message);
});

// ── as telas ────────────────────────────────────────────────────────────────
const le = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

await teste('a tela de cadastro nao pede mais CPF', () => {
  const html = le('frontend/login.html');
  const cadastro = html.slice(html.indexOf('id="registerForm"'), html.indexOf('</form>', html.indexOf('id="registerForm"')));
  if (/regCpf/.test(cadastro)) throw new Error('o campo de CPF voltou ao cadastro');
  // E o script nao pode ficar com referencia solta: getElementById devolvendo
  // null quebra o bloco inteiro e o formulario volta a submeter sozinho.
  if (/getElementById\('regCpf'\)/.test(html)) throw new Error('sobrou referencia a regCpf no script');
  if (/api\.register\([^)]*\bcpf\b/.test(html)) throw new Error('o cadastro ainda envia cpf');
});

await teste('existe a pagina que recebe o link de confirmacao', () => {
  const html = le('frontend/verificar-email.html');
  if (!html.includes('/api/auth/verify-email')) throw new Error('a pagina nao chama a rota');
  if (!/URLSearchParams\(location\.search\)\.get\('t'\)/.test(html)) throw new Error('a pagina nao le o token do endereco');
  if (/innerHTML/.test(html)) throw new Error('a pagina escreve resposta do servidor como HTML');
});

await teste('o assistente de destinacao pede o CPF e o envia', () => {
  const html = le('frontend/destinar-rouanet.html');
  for (const marca of ['id="blocoCpf"', 'id="cpfDestinacao"', 'cpf_necessario']) {
    if (!html.includes(marca)) throw new Error('destinar-rouanet.html sem ' + marca);
  }
});

await teste('o painel avisa quem nao confirmou e deixa reenviar', () => {
  const html = le('frontend/dashboard.html');
  if (!html.includes('reenviar-verificacao')) throw new Error('o painel nao chama a rota de reenvio');
  if (!html.includes('id="avisoEmail"')) throw new Error('o painel nao tem o aviso');
});

await teste('a migration 040 so solta o NOT NULL do CPF', () => {
  const sql = le('backend/src/migrations/040_cpf_opcional_na_conta.sql');
  if (!/ALTER COLUMN cpf DROP NOT NULL/i.test(sql)) throw new Error('a migration nao solta o NOT NULL');
  if (/DROP (TABLE|COLUMN)|DELETE|UPDATE/i.test(sql)) throw new Error('a migration mexe em mais coisa');
});

servidor.close();
console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
