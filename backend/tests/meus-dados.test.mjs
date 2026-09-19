// Os direitos de quem tem conta — LGPD, art. 18 (rotas /api/meus-dados).
//
// O que estes testes guardam:
//   - exportar devolve cadastro, destinações, acessos e compartilhamento, e
//     nunca a senha nem tokens;
//   - eliminar exige a senha certa; sem ela nada muda;
//   - sem registro fiscal, a conta é anonimizada no ato: nome, CPF, e-mail,
//     telefone e senha somem, simulações e vínculo com a organização também;
//   - com registro fiscal, a conta é ENCERRADA: e-mail, telefone e senha
//     somem, nome e CPF ficam com as destinações, e a resposta diz até que
//     ano (ano-base + 1 + 5, config/lgpd.js);
//   - o token que estava vivo morre na hora: o middleware recusa a conta
//     encerrada em qualquer rota; o login também;
//   - em modo simulação nada é registro fiscal, e tudo é anonimizado;
//   - superadmin não se encerra por aqui;
//   - o registro de auditoria não carrega nome, CPF nem o e-mail antigo;
//   - /api/admin/retencao lista o que venceu o prazo e não apaga nada;
//   - a página existe, o painel a linka e a Política a nomeia.
import { newDb } from 'pg-mem';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'teste';
delete process.env.SIMULATION_MODE;

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');

const db = newDb();
db.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID() });
db.public.none(`
  CREATE TABLE organizations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, slug TEXT,
    contact_email TEXT, encarregado_nome TEXT, encarregado_email TEXT);
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT, cpf TEXT, email TEXT, phone TEXT, senha_hash TEXT,
    total_donated NUMERIC DEFAULT 0,
    is_admin BOOLEAN DEFAULT false, is_superadmin BOOLEAN DEFAULT false, is_org_admin BOOLEAN DEFAULT false,
    organization_id UUID, email_verified BOOLEAN DEFAULT false,
    accepted_terms_at TIMESTAMP, accepted_terms_version TEXT,
    email_verification_token TEXT, reset_token TEXT,
    encerrada_em TIMESTAMP, anonimizada_em TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE organization_users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, user_id UUID, role TEXT, is_active BOOLEAN DEFAULT true);
  CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, organization_id UUID, fiscal_year INTEGER, donation_amount NUMERIC, ir_devido NUMERIC,
    status TEXT, pronac TEXT, projeto_titulo TEXT,
    confirmed_at TIMESTAMP, rejected_at TIMESTAMP, rejection_reason TEXT,
    receipt_filename TEXT, mecenato_filename TEXT, mecenato_issued_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE audit_log (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID, user_id UUID,
    action TEXT, entity_type TEXT, entity_id UUID, details TEXT, ip_address TEXT, user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW());
  CREATE TABLE subscribers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT,
    anonymized_at TIMESTAMP, last_interaction_at TIMESTAMP DEFAULT NOW());
  INSERT INTO organizations (name, slug, contact_email) VALUES ('Casa Azul', 'casa-azul', 'contato@casazul.org.br');
`);
const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });
const q = async (sql, p) => (await poolFalso.query(sql, p)).rows;

const [casa] = await q(`SELECT * FROM organizations`);
const SENHA = 'senha-bem-comprida';
const hash = bcrypt.hashSync(SENHA, 4);

async function conta({ nome, cpf, email, superadmin = false }) {
  const [u] = await q(`INSERT INTO users (nome, cpf, email, phone, senha_hash, organization_id, is_superadmin,
                                          accepted_terms_version, email_verification_token, reset_token)
                       VALUES ($1,$2,$3,'61999990000',$4,$5,$6,'2026-09','tok-verif','tok-reset') RETURNING id`,
                      [nome, cpf, email, hash, casa.id, superadmin]);
  await q(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1,$2,'member')`, [casa.id, u.id]);
  return u.id;
}
async function destinacao(userId, status, ano = 2025) {
  await q(`INSERT INTO donations (user_id, organization_id, fiscal_year, donation_amount, ir_devido, status, pronac, projeto_titulo, receipt_filename)
           VALUES ($1,$2,$3,1000,50000,$4,'2511274','Mostra Casa Azul','comp.pdf')`, [userId, casa.id, ano, status]);
}
// O superadmin viaja no payload do JWT (isSuperadmin), como o login emite.
const tokenDe = (id, extra = {}) => jwt.sign({ userId: id, orgId: casa.id, ...extra }, 'teste', { expiresIn: '1h' });

const { default: meusDados } = await import('../src/routes/meusDados.js');
const { default: admin }     = await import('../src/routes/admin.js');
const { default: auth }      = await import('../src/routes/auth.js');
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.organization = casa; req.tenantSlug = 'casa-azul'; next(); });
app.use('/api/meus-dados', meusDados);
app.use('/api/admin', admin);
app.use('/api/auth', auth);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;
const pedir = async (metodo, caminho, token, corpo) => {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  return [r.status, await r.json()];
};

const ok = [], falhas = [];
const teste = async (nome, fn) => { try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); } };
const igual = (a, b, msg) => { if (a !== b) throw new Error(`${msg || ''} esperava ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };

// ── a conta da Maria: três destinações, uma delas só pendente ───────────────
const maria = await conta({ nome: 'Maria Aparecida', cpf: '12345678901', email: 'maria@exemplo.gov.br' });
await destinacao(maria, 'awaiting_confirmation', 2025);
await destinacao(maria, 'confirmed', 2024);
await destinacao(maria, 'pending', 2025);
const tMaria = tokenDe(maria);

await teste('exportar devolve cadastro, destinacoes, acessos e compartilhamento', async () => {
  const [status, corpo] = await pedir('GET', '/api/meus-dados', tMaria);
  igual(status, 200, 'status');
  igual(corpo.titular.nome, 'Maria Aparecida');
  igual(corpo.titular.cpf, '123.456.789-01', 'CPF formatado');
  igual(corpo.destinacoes.length, 3, 'destinacoes');
  if (!Array.isArray(corpo.acessos)) throw new Error('sem acessos');
  if (!/Recibo de Mecenato/.test(corpo.compartilhamento)) throw new Error('nao diz com quem compartilha');
  igual(corpo.privacidade.controlador, 'Casa Azul', 'controlador do tenant');
  const texto = JSON.stringify(corpo);
  for (const proibido of ['senha_hash', 'tok-verif', 'tok-reset', '$2a$', '$2b$']) {
    if (texto.includes(proibido)) throw new Error('vazou: ' + proibido);
  }
  const [log] = await q(`SELECT action FROM audit_log WHERE user_id = $1 AND action = 'user.exported'`, [maria]);
  if (!log) throw new Error('exportacao sem registro');
});

await teste('eliminar sem senha, ou com senha errada, nao muda nada', async () => {
  let [status] = await pedir('DELETE', '/api/meus-dados', tMaria, {});
  igual(status, 400, 'sem senha');
  [status] = await pedir('DELETE', '/api/meus-dados', tMaria, { senha: 'errada' });
  igual(status, 401, 'senha errada');
  const [u] = await q(`SELECT nome, email, encerrada_em FROM users WHERE id = $1`, [maria]);
  igual(u.email, 'maria@exemplo.gov.br');
  if (u.encerrada_em) throw new Error('encerrou com senha errada');
});

await teste('com registro fiscal: encerra, guarda nome e CPF, apaga o resto, diz ate quando', async () => {
  const [status, corpo] = await pedir('DELETE', '/api/meus-dados', tMaria, { senha: SENHA });
  igual(status, 200, 'status: ' + corpo.message);
  igual(corpo.resultado, 'encerrada');
  igual(corpo.registro_fiscal, 2, 'duas destinacoes fiscais');
  igual(corpo.guarda_ate, 2025 + 1 + 5, 'ultimo ano-base 2025');
  if (!/31\/12\/2031/.test(corpo.message)) throw new Error('a mensagem nao diz ate quando: ' + corpo.message);
  const [u] = await q(`SELECT * FROM users WHERE id = $1`, [maria]);
  igual(u.nome, 'Maria Aparecida', 'nome fica');
  igual(u.cpf, '12345678901', 'CPF fica');
  if (!u.email.startsWith('encerrada+')) throw new Error('e-mail ficou: ' + u.email);
  igual(u.phone, null, 'telefone');
  igual(u.senha_hash, '!encerrada', 'senha invalidada');
  igual(u.email_verification_token, null); igual(u.reset_token, null);
  if (!u.encerrada_em) throw new Error('sem encerrada_em');
  if (u.anonimizada_em) throw new Error('nao devia estar anonimizada');
  const dest = await q(`SELECT status FROM donations WHERE user_id = $1 ORDER BY status`, [maria]);
  igual(dest.map(d => d.status).join(','), 'awaiting_confirmation,confirmed', 'a pendente saiu, as fiscais ficam');
  const vinculos = await q(`SELECT 1 FROM organization_users WHERE user_id = $1`, [maria]);
  igual(vinculos.length, 0, 'vinculo com a organizacao');
});

await teste('o token que estava vivo morre na hora, em qualquer rota', async () => {
  const [status, corpo] = await pedir('GET', '/api/meus-dados', tMaria);
  igual(status, 401, 'status');
  if (!/encerrada/.test(corpo.message)) throw new Error(corpo.message);
});

await teste('o login por CPF tambem recusa a conta encerrada', async () => {
  const [status] = await pedir('POST', '/api/auth/login', null, { cpf: '123.456.789-01', senha: SENHA });
  if (![401, 403].includes(status)) throw new Error('status ' + status);
});

await teste('o registro de auditoria nao identifica: sem nome, CPF ou e-mail antigo', async () => {
  const [log] = await q(`SELECT details FROM audit_log WHERE user_id = $1 AND action = 'user.closed'`, [maria]);
  if (!log) throw new Error('sem registro user.closed');
  for (const proibido of ['Maria', '12345678901', 'maria@exemplo.gov.br']) {
    if (String(log.details).includes(proibido)) throw new Error('registro identifica: ' + proibido);
  }
  if (!/2031/.test(String(log.details))) throw new Error('registro nao guarda ate quando');
});

// ── o João: so simulou ──────────────────────────────────────────────────────
const joao = await conta({ nome: 'João Simulador', cpf: '98765432100', email: 'joao@exemplo.gov.br' });
await destinacao(joao, 'test_simulated');
await destinacao(joao, 'pending');

await teste('sem registro fiscal: anonimiza no ato, simulacoes somem', async () => {
  const [status, corpo] = await pedir('DELETE', '/api/meus-dados', tokenDe(joao), { senha: SENHA });
  igual(status, 200, 'status: ' + corpo.message);
  igual(corpo.resultado, 'anonimizada');
  const [u] = await q(`SELECT * FROM users WHERE id = $1`, [joao]);
  igual(u.nome, 'Titular anonimizado');
  igual(u.cpf, null, 'CPF');
  igual(u.phone, null, 'telefone');
  if (!u.email.startsWith('anonimizado+')) throw new Error('e-mail: ' + u.email);
  igual(u.senha_hash, '!anonimizada');
  if (!u.encerrada_em || !u.anonimizada_em) throw new Error('faltou marcar');
  igual((await q(`SELECT 1 FROM donations WHERE user_id = $1`, [joao])).length, 0, 'destinacoes');
  const [log] = await q(`SELECT action FROM audit_log WHERE user_id = $1 AND action = 'user.anonymized'`, [joao]);
  if (!log) throw new Error('sem registro user.anonymized');
});

await teste('em modo simulacao nada e registro fiscal: tudo anonimizado', async () => {
  process.env.SIMULATION_MODE = 'true';
  try {
    const ana = await conta({ nome: 'Ana', cpf: '11144477735', email: 'ana@exemplo.gov.br' });
    await destinacao(ana, 'confirmed');
    const [status, corpo] = await pedir('DELETE', '/api/meus-dados', tokenDe(ana), { senha: SENHA });
    igual(status, 200, corpo.message);
    igual(corpo.resultado, 'anonimizada');
    igual((await q(`SELECT 1 FROM donations WHERE user_id = $1`, [ana])).length, 0, 'destinacoes da simulacao');
  } finally { delete process.env.SIMULATION_MODE; }
});

await teste('superadmin nao se encerra por aqui', async () => {
  const chefe = await conta({ nome: 'Chefe', cpf: '52998224725', email: 'chefe@incentivabr.com.br', superadmin: true });
  const [status] = await pedir('DELETE', '/api/meus-dados', tokenDe(chefe), { senha: SENHA });
  igual(status, 409);
  const [u] = await q(`SELECT encerrada_em FROM users WHERE id = $1`, [chefe]);
  if (u.encerrada_em) throw new Error('encerrou o superadmin');
});

await teste('token de conta que nao existe mais passa pelo middleware e da 404, nao 500', async () => {
  const [status] = await pedir('GET', '/api/meus-dados', tokenDe(crypto.randomUUID()));
  igual(status, 404);
});

// ── o relatorio de retencao ─────────────────────────────────────────────────
await teste('/api/admin/retencao lista o que venceu e nao apaga nada', async () => {
  const chefe = (await q(`SELECT id FROM users WHERE is_superadmin`))[0].id;
  // Uma conta encerrada ha muito, com ano-base 2015: guarda ate 2021, ja venceu.
  const velha = await conta({ nome: 'Velha', cpf: '39053344705', email: 'velha@exemplo.gov.br' });
  await destinacao(velha, 'confirmed', 2015);
  await pedir('DELETE', '/api/meus-dados', tokenDe(velha), { senha: SENHA });
  // Um interessado parado ha 30 meses e outro recente.
  await q(`INSERT INTO subscribers (email, last_interaction_at) VALUES ('a@x', NOW() - INTERVAL '30 months'), ('b@x', NOW())`);

  const [status, corpo] = await pedir('GET', '/api/admin/retencao', tokenDe(chefe, { isSuperadmin: true }));
  igual(status, 200, corpo.message);
  igual(corpo.apaga_automaticamente, false);
  igual(corpo.contas_encerradas_vencidas.length, 1, 'vencidas');
  igual(corpo.contas_encerradas_vencidas[0].guarda_ate, 2021);
  igual(corpo.contas_encerradas_em_guarda, 1, 'a Maria, ate 2031');
  igual(corpo.interessados_inativos_vencidos, 1, 'interessados');
  const [u] = await q(`SELECT nome, anonimizada_em FROM users WHERE id = $1`, [velha]);
  igual(u.nome, 'Velha', 'o relatorio nao apagou');
});

await teste('gestor comum nao ve o relatorio de retencao', async () => {
  const gestor = await conta({ nome: 'Gestor', cpf: '15350946056', email: 'gestor@casazul.org.br' });
  const [status] = await pedir('GET', '/api/admin/retencao', tokenDe(gestor));
  igual(status, 403);
});

// ── a tela ──────────────────────────────────────────────────────────────────
await teste('a pagina existe, o painel a linka e a Politica a nomeia', () => {
  const pagina = fs.readFileSync(path.join(RAIZ, 'frontend/minha-conta.html'), 'utf8');
  for (const t of ['/api/meus-dados', 'meus-dados-incentivabr.json', 'id="senha"', 'data-privacidade="encarregado_email"', 'js/tenant.js']) {
    if (!pagina.includes(t)) throw new Error('minha-conta.html sem ' + t);
  }
  const painel = fs.readFileSync(path.join(RAIZ, 'frontend/dashboard.html'), 'utf8');
  if (!painel.includes('href="minha-conta.html"')) throw new Error('o painel nao linka minha-conta.html');
  const politica = fs.readFileSync(path.join(RAIZ, 'frontend/politica-privacidade.html'), 'utf8');
  if ((politica.match(/Minha conta/g) || []).length < 2) throw new Error('a Politica nao diz onde exercer os direitos');
  if (!/art\. 16, I/.test(politica)) throw new Error('a Politica nao explica a guarda de quem destinou');
});

await teste('a migration 042 existe e cria as duas colunas', () => {
  const sql = fs.readFileSync(path.join(RAIZ, 'backend/src/migrations/042_conta_encerrada.sql'), 'utf8');
  for (const c of ['encerrada_em', 'anonimizada_em']) if (!sql.includes(c)) throw new Error('042 sem ' + c);
});

servidor.close();
console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
