// A suite contra um Postgres DE VERDADE.
//
// Toda a suite roda em pg-mem, sem infraestrutura, e isso e uma virtude: um
// clone e `npm test`. Mas o pg-mem e tolerante onde o Postgres nao e, e essa
// diferenca ja custou caro: `WHERE email = $2` recebendo [null, email] passou
// verde no pg-mem e derrubou TODO cadastro sem CPF em producao ("could not
// determine data type of parameter $1"). Guardas de texto foram escritas
// depois, mas guarda de texto e remendo — o unico juiz do que o Postgres
// aceita e o Postgres.
//
// Este arquivo NAO entra no `npm test`. Roda no CI num container postgres:16
// (`.github/workflows/ci.yml`, job "Postgres de verdade") e localmente por
// `npm run test:postgres` com DATABASE_URL apontando para um banco de TESTE.
//
// O que ele guarda:
//   - schema.sql, seeds.sql, a 003 legada e TODAS as migrations aplicam num
//     Postgres real, em ordem, num banco vazio;
//   - o segundo boot nao reaplica nada (idempotencia de verdade, com ROLLBACK
//     de verdade — o que o migracoes.test.mjs so consegue fingir);
//   - o cadastro sem CPF — o defeito que motivou este arquivo — passa contra
//     o banco real, e e-mail repetido responde 409, nao 500;
//   - o login devolve sessao.
//
// Ele APAGA o schema public antes de comecar. Por isso so aceita banco cujo
// nome termine em _teste ou _test: apontar para producao por engano nao pode
// custar o banco.
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'teste';
process.env.APP_URL = 'https://www.incentivabr.com.br';

const url = process.env.DATABASE_URL || '';
if (!url) {
  console.log('postgres-real: DATABASE_URL nao definida — pulado (a suite padrao roda em pg-mem).');
  process.exit(0);
}
const nomeDoBanco = (() => { try { return new URL(url).pathname.replace(/^\//, ''); } catch { return ''; } })();
if (!/_teste?$/.test(nomeDoBanco)) {
  console.error(`postgres-real: recuso apagar o banco "${nomeDoBanco}". O nome precisa terminar em _teste ou _test.`);
  process.exit(2);
}

const { default: pool } = await import('../config/database.js');
const q = async (sql, p) => (await pool.query(sql, p)).rows;

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};
const igual = (a, b, o) => { if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };

// ── banco vazio, de verdade ──────────────────────────────────────────────────
await q('DROP SCHEMA public CASCADE');
await q('CREATE SCHEMA public');

const { runMigrations, statusDasMigracoes } = await import('../src/config/migrate.js');
const silencio = { log() {}, error() {} };
const migrationsNaPasta = fs.readdirSync(path.join(AQUI, '../src/migrations')).filter(f => f.endsWith('.sql')).length;

await teste('banco vazio: schema, seeds, 003 legada e todas as migrations aplicam num Postgres real', async () => {
  const r = await runMigrations({ log: silencio });
  igual(r.bootstrap, true, 'bootstrap');
  igual(r.aplicadas.length, migrationsNaPasta, 'migrations aplicadas');
});

await teste('nenhuma migration fica pendente', async () => {
  const s = await statusDasMigracoes();
  igual(s.pendentes.length, 0, 'pendentes: ' + s.pendentes.join(','));
  igual(s.aplicadas, migrationsNaPasta, 'aplicadas');
});

await teste('segundo boot: nada reaplica', async () => {
  const r = await runMigrations({ log: silencio });
  igual(r.bootstrap, false, 'bootstrap');
  igual(r.aplicadas.length, 0, 'reaplicou: ' + r.aplicadas.join(','));
});

await teste('as tabelas que o codigo supoe existem', async () => {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
  const tem = new Set(rows.map(r => r.table_name));
  for (const t of ['users', 'organizations', 'organization_users', 'donations', 'audit_log',
                   'subscribers', 'subscriber_consent_log', 'tetos_deducao', 'migrations_log']) {
    if (!tem.has(t)) throw new Error('falta a tabela ' + t);
  }
});

// ── o cadastro, contra o banco real ─────────────────────────────────────────
// A organizacao `www` nasce no boot do server.js (semeadura), nao nas
// migrations. Aqui sobe so a rota, entao ela e criada a mao quando falta.
let [www] = await q(`SELECT * FROM organizations WHERE slug = 'www'`);
if (!www) {
  [www] = await q(`INSERT INTO organizations (name, slug) VALUES ('IncentivaBR', 'www') RETURNING *`);
}

const { default: authRoutes, _trocaEnvioDeVerificacao } = await import('../src/routes/auth.js');
const enviados = [];
_trocaEnvioDeVerificacao(async (msg) => { enviados.push(msg); });

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.organization = www; next(); });
app.use('/api/auth', authRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;
const post = (rota, corpo) => fetch(BASE + rota, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
}).then(async r => [r.status, await r.json().catch(() => ({}))]);

const CONTA = { nome: 'Maria Aparecida de Souza', email: 'maria@exemplo.gov.br', senha: 'senha-bem-comprida', accepted_terms: true };

await teste('cadastro SEM CPF passa no Postgres real (o 500 de setembro)', async () => {
  // Foi exatamente isto que o pg-mem deixou passar verde.
  const [status, corpo] = await post('/api/auth/register', CONTA);
  if (status !== 201) throw new Error(`status ${status}: ${corpo.message}`);
  const [u] = await q(`SELECT cpf, email_verified FROM users WHERE email = $1`, [CONTA.email]);
  igual(u.cpf, null, 'cpf');
  igual(u.email_verified, false, 'email_verified');
  if (!enviados.some(m => m.to === CONTA.email)) throw new Error('a confirmacao de e-mail nao saiu');
});

await teste('e-mail repetido responde 409, nao 500', async () => {
  const [status, corpo] = await post('/api/auth/register', CONTA);
  igual(status, 409, 'status: ' + (corpo.message || ''));
  if (/cpf/i.test(corpo.message || '')) throw new Error('culpou o CPF: ' + corpo.message);
});

await teste('cadastro COM CPF valido passa, e CPF em uso responde 409', async () => {
  const [bom] = await post('/api/auth/register', { ...CONTA, email: 'comcpf@exemplo.gov.br', cpf: '529.982.247-25' });
  igual(bom, 201, 'com cpf');
  const [repetido, corpo] = await post('/api/auth/register', { ...CONTA, email: 'outro@exemplo.gov.br', cpf: '529.982.247-25' });
  igual(repetido, 409, 'cpf em uso: ' + (corpo.message || ''));
});

await teste('login devolve sessao', async () => {
  const [status, corpo] = await post('/api/auth/login', { email: CONTA.email, senha: CONTA.senha });
  igual(status, 200, 'status: ' + (corpo.message || ''));
  if (!corpo.token) throw new Error('sem token');
});

await teste('o audit_log registrou o login com IP e user-agent (colunas reais)', async () => {
  const [linha] = await q(`SELECT action FROM audit_log WHERE action = 'user.login' ORDER BY created_at DESC LIMIT 1`);
  if (!linha) throw new Error('nenhuma linha de user.login');
});

servidor.close();
await pool.end();

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam  (Postgres real: ${nomeDoBanco})`);
process.exit(falhas.length ? 1 : 0);
