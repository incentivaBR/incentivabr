// O que quebrou o cadastro em setembro de 2026, e o que estes testes guardam.
//
// 1. A tela nunca mostrava o motivo. js/utils.js injetava um `.toast` antigo
//    (opacity: 0, à espera de um `.show`) que mirava o mesmo elemento do
//    js/toast.js e vencia nas propriedades que este não declarava. Nas duas
//    páginas que carregam os dois arquivos, o aviso aparecia durante os 0,3s
//    da animação e sumia. A visibilidade em si é conferida no navegador
//    (scripts/confere-paginas.mjs); aqui ficam as marcas no código-fonte.
//
// 2. A resposta de sucesso mandava "verifique seu email para ativar a conta".
//    O token de verificação é gerado e guardado como hash, mas o valor em
//    claro não é enviado a ninguém e não existe página que o receba: a conta
//    já entra pelo login. Prometer o e-mail deixava a pessoa esperando.
//
// 3. A conexão era pedida FORA do try. Com o banco indisponível, a promessa do
//    handler era rejeitada e o Express 4 não encaminha rejeição de função
//    async para o tratador de erro: a requisição ficava sem resposta.
//
// 4. A entrada automática depois do cadastro falhava em silêncio. A conta
//    estava criada, a pessoa voltava para a aba de entrar sem saber, tentava
//    de novo e recebia "Email já cadastrado".
import { newDb } from 'pg-mem';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'teste';

const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});
db.public.none(`
  CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, slug TEXT
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
const conectaDeVerdade = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = conectaDeVerdade;

const q = async (sql, p) => (await poolFalso.query(sql, p)).rows;
const [org] = await q(`SELECT * FROM organizations WHERE slug = 'www'`);

const { default: authRoutes } = await import('../src/routes/auth.js');

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.organization = org; next(); });
app.use('/api/auth', authRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

// CPFs validos pelo digito verificador, so para atravessar a validacao.
const CONTA = {
  nome: 'Maria Aparecida de Souza', cpf: '529.982.247-25',
  email: 'Maria@Exemplo.gov.BR', phone: '61999990000',
  senha: 'senha-bem-comprida', accepted_terms: true
};

const cadastra = (corpo, ms = 5000) =>
  fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo), signal: AbortSignal.timeout(ms)
  }).then(async r => [r.status, await r.json()]);

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

await teste('cadastro valido responde 201 e guarda e-mail e CPF normalizados', async () => {
  const [status, corpo] = await cadastra(CONTA);
  if (status !== 201) throw new Error(`status ${status}: ${corpo.message}`);
  const [u] = await q(`SELECT cpf, email, email_verified FROM users WHERE nome = 'Maria Aparecida de Souza'`);
  if (u.cpf !== '52998224725') throw new Error('CPF nao foi limpo: ' + u.cpf);
  if (u.email !== 'maria@exemplo.gov.br') throw new Error('e-mail nao foi normalizado: ' + u.email);
});

await teste('a resposta de sucesso nao promete e-mail de ativacao', async () => {
  const [, corpo] = await cadastra({ ...CONTA, cpf: '111.444.777-35', email: 'outra@exemplo.gov.br' });
  if (/verifique seu e?mail|ativar a conta/i.test(corpo.message)) {
    throw new Error('a mensagem voltou a prometer e-mail de ativacao: ' + corpo.message);
  }
  if (!/entrar/i.test(corpo.message)) throw new Error('a mensagem nao diz o que fazer: ' + corpo.message);
});

await teste('e-mail repetido responde 409 dizendo que e o e-mail', async () => {
  const [status, corpo] = await cadastra({ ...CONTA, cpf: '100.000.000-19' });
  if (status !== 409) throw new Error('status ' + status);
  if (!/email/i.test(corpo.message)) throw new Error('mensagem: ' + corpo.message);
});

await teste('CPF repetido responde 409 dizendo que e o CPF', async () => {
  const [status, corpo] = await cadastra({ ...CONTA, email: 'terceiro@exemplo.gov.br' });
  if (status !== 409) throw new Error('status ' + status);
  if (!/cpf/i.test(corpo.message)) throw new Error('mensagem: ' + corpo.message);
});

await teste('banco fora responde 500 em JSON, nao deixa a requisicao sem resposta', async () => {
  poolReal.connect = async () => { throw new Error('banco indisponivel'); };
  try {
    const [status, corpo] = await cadastra({ ...CONTA, cpf: '100.007.919-89', email: 'quarto@exemplo.gov.br' }, 4000);
    if (status !== 500) throw new Error('status ' + status);
    if (corpo.status !== 'error') throw new Error('corpo: ' + JSON.stringify(corpo));
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error('a requisicao ficou sem resposta (o connect voltou para fora do try)');
    throw e;
  } finally {
    poolReal.connect = conectaDeVerdade;
  }
});

// ── as telas ────────────────────────────────────────────────────────────────
const le = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

await teste('js/utils.js nao define mais um `.toast` que brigue com o js/toast.js', () => {
  const js = le('frontend/js/utils.js');
  if (/^\s*\.toast[\s.{,]/m.test(js)) throw new Error('o seletor .toast voltou ao utils.js');
  if (/className = `toast /.test(js)) throw new Error('o aviso de reserva voltou a usar a classe toast');
  if (!js.includes('aviso-simples')) throw new Error('o aviso de reserva perdeu o nome proprio');
});

await teste('js/toast.js declara o estado visivel e preserva o quadro final', () => {
  const js = le('frontend/js/toast.js');
  const base = js.slice(js.indexOf('.toast {'), js.indexOf('.toast:hover'));
  if (!/opacity:\s*1/.test(base)) throw new Error('o .toast nao declara opacity: 1');
  if (!/animation:\s*toastSlideIn[^;]*\b(both|forwards)\b/.test(base)) {
    throw new Error('a animacao de entrada nao preserva o quadro final (both/forwards)');
  }
});

await teste('a tela de login avisa quando a entrada automatica falha', () => {
  const html = le('frontend/login.html');
  const trecho = html.slice(html.indexOf('api.register('), html.indexOf('api.register(') + 1600);
  if (!/Toast\.(warning|error)/.test(trecho)) {
    throw new Error('a falha da entrada automatica voltou a ser silenciosa');
  }
  if (!/conta foi criada/i.test(trecho)) throw new Error('a mensagem nao diz que a conta ja existe');
});

await teste('o limitador nao fala so em login, ja que cadastro divide a mesma cota', () => {
  const js = le('backend/server.js');
  const trecho = js.slice(js.indexOf('const authLimiter'), js.indexOf("app.use('/api/auth/register'"));
  if (!/criar conta/i.test(trecho)) throw new Error('a mensagem do limitador nao menciona criar conta');
});

servidor.close();
console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
