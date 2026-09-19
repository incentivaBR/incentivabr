// Ovo e galinha: a tela de clientes exige superadmin, e criar um superadmin
// exigiria outro superadmin. Sem porta de entrada, o sistema fica trancado por
// fora e a unica saida e editar o banco a mao.
//
// O que estes testes guardam e a parte que quebra em silencio: o sistema
// pergunta "e superadmin?" de DOIS jeitos — a flag em users, que vai para o
// token no login, e um vinculo em organization_users, que e o que
// podeGerirOrganizacao consulta. Gravar so uma deixa metade das telas fechadas
// com um erro que nao explica nada.
import { newDb } from 'pg-mem';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'test';

const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});

db.public.none(`
  CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, slug TEXT
  );
  CREATE TABLE users (encerrada_em TIMESTAMP, anonimizada_em TIMESTAMP, 
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpf TEXT UNIQUE, nome TEXT, email TEXT, senha_hash TEXT,
    email_verified BOOLEAN DEFAULT false, is_superadmin BOOLEAN DEFAULT false
  );
  CREATE TABLE organization_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL, user_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'member', accepted_at TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (organization_id, user_id)
  );
  INSERT INTO organizations (name, slug) VALUES ('IncentivaBR','www');
`);

const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });

const { promoveSuperadmin } = await import('../src/config/promoveSuperadmin.js');
const q = async (sql, p) => (await poolFalso.query(sql, p)).rows;

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  delete process.env.SUPERADMIN_EMAIL;
  delete process.env.SUPERADMIN_SENHA;
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

await teste('sem a variavel, nao mexe em ninguem', async () => {
  await q(`INSERT INTO users (cpf, nome, email, senha_hash) VALUES ('1','A','a@x.com','h')`);
  await promoveSuperadmin(poolReal);
  const [u] = await q(`SELECT is_superadmin FROM users WHERE email = 'a@x.com'`);
  if (u.is_superadmin) throw new Error('promoveu sem ninguem pedir');
});

await teste('promove uma conta que ja existe', async () => {
  await q(`INSERT INTO users (cpf, nome, email, senha_hash) VALUES ('2','Artur','artur@incentivabr.com.br','h')`);
  process.env.SUPERADMIN_EMAIL = 'Artur@IncentivaBR.com.BR';   // maiusculas de propósito
  await promoveSuperadmin(poolReal);

  const [u] = await q(`SELECT id, is_superadmin FROM users WHERE email = 'artur@incentivabr.com.br'`);
  if (!u.is_superadmin) throw new Error('a flag do token nao foi gravada');

  const [v] = await q(`SELECT role FROM organization_users WHERE user_id = $1`, [u.id]);
  if (!v) throw new Error('sem vinculo — podeGerirOrganizacao vai recusar');
  if (v.role !== 'superadmin') throw new Error('papel: ' + v.role);
});

await teste('as duas marcas sao gravadas, nao so uma', async () => {
  // E o defeito que quebra em silencio: com so a flag, a tela de clientes
  // abre e as rotas de convite recusam; com so o vinculo, o contrario.
  await q(`INSERT INTO users (cpf, nome, email, senha_hash) VALUES ('3','B','b@x.com','h')`);
  process.env.SUPERADMIN_EMAIL = 'b@x.com';
  await promoveSuperadmin(poolReal);

  const [u] = await q(`SELECT id, is_superadmin FROM users WHERE email = 'b@x.com'`);
  const [v] = await q(`SELECT role FROM organization_users WHERE user_id = $1`, [u.id]);
  if (!u.is_superadmin || v?.role !== 'superadmin') {
    throw new Error(`flag=${u.is_superadmin} vinculo=${v?.role}`);
  }
});

await teste('cria a conta quando nao existe e ha senha', async () => {
  process.env.SUPERADMIN_EMAIL = 'novo@incentivabr.com.br';
  process.env.SUPERADMIN_SENHA = 'uma-senha-longa';
  await promoveSuperadmin(poolReal);

  const [u] = await q(`SELECT senha_hash, is_superadmin FROM users WHERE email = 'novo@incentivabr.com.br'`);
  if (!u) throw new Error('nao criou');
  if (!u.is_superadmin) throw new Error('criou sem o poder');
  if (!(await bcrypt.compare('uma-senha-longa', u.senha_hash))) throw new Error('senha nao confere');
});

await teste('a senha vale para conta que ja existe, nao so na criacao', async () => {
  // Era o defeito que travou o acesso de verdade: o dono definia a variavel, a
  // conta ja existia, nada acontecia — e ele tentava entrar com uma senha que
  // o banco nunca recebeu, sem nada na tela explicando.
  const antes = await bcrypt.hash('senha-antiga-esquecida', 10);
  await q(`INSERT INTO users (cpf, nome, email, senha_hash) VALUES ('4','C','c@x.com',$1)`, [antes]);

  process.env.SUPERADMIN_EMAIL = 'c@x.com';
  process.env.SUPERADMIN_SENHA = 'senha-nova-que-eu-sei';
  await promoveSuperadmin(poolReal);

  const [u] = await q(`SELECT senha_hash FROM users WHERE email = 'c@x.com'`);
  if (!(await bcrypt.compare('senha-nova-que-eu-sei', u.senha_hash))) {
    throw new Error('a senha da variavel nao foi aplicada a conta existente');
  }
});

await teste('sem SUPERADMIN_SENHA, a senha existente nao e tocada', async () => {
  const antes = await bcrypt.hash('minha-senha', 10);
  await q(`INSERT INTO users (cpf, nome, email, senha_hash) VALUES ('5','D','d@x.com',$1)`, [antes]);
  process.env.SUPERADMIN_EMAIL = 'd@x.com';
  await promoveSuperadmin(poolReal);
  const [u] = await q(`SELECT senha_hash FROM users WHERE email = 'd@x.com'`);
  if (!(await bcrypt.compare('minha-senha', u.senha_hash))) {
    throw new Error('apagou a senha de quem nao pediu');
  }
});

await teste('sem conta e sem senha, nao inventa nada', async () => {
  process.env.SUPERADMIN_EMAIL = 'fantasma@incentivabr.com.br';
  await promoveSuperadmin(poolReal);
  const linhas = await q(`SELECT 1 FROM users WHERE email = 'fantasma@incentivabr.com.br'`);
  if (linhas.length) throw new Error('criou conta sem senha definida');
});

await teste('rodar de novo nao duplica o vinculo', async () => {
  process.env.SUPERADMIN_EMAIL = 'artur@incentivabr.com.br';
  await promoveSuperadmin(poolReal);
  await promoveSuperadmin(poolReal);
  const [u] = await q(`SELECT id FROM users WHERE email = 'artur@incentivabr.com.br'`);
  const v = await q(`SELECT id FROM organization_users WHERE user_id = $1`, [u.id]);
  if (v.length !== 1) throw new Error('vinculos: ' + v.length);
});

console.log('\n================================================================');
ok.forEach(n => console.log('  ok   ', n));
falhas.forEach(([n, e]) => console.log('  FALHA', n, '\n          ' + e));
console.log('================================================================');
console.log(`${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
