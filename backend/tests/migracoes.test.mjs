// O runner de migrations tem tres garantias (Raio-X, risco 08):
//
//   1. schema e seeds so entram em banco vazio — nunca de novo num banco que
//      ja tem tabelas, porque o schema recriava o que a migration 014 apagou;
//   2. cada migration e uma transacao: falhou, nada dela fica, nem o registro;
//   3. a primeira falha interrompe e e relancada — e o server.js que decide
//      abortar o boot.
//
// Roda contra o pg-mem, com uma pasta temporaria de migrations inventadas.
// O que o pg-mem nao reproduz (o ROLLBACK de verdade num Postgres real) foi
// conferido a mao num Postgres 16 antes de este teste entrar na suite; ver o
// PR da Onda 1.
import { newDb } from 'pg-mem';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.NODE_ENV = 'test';

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};
const igual = (a, b, o) => { if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };

// ── banco em memoria, novo a cada cenario ──────────────────────────────────
function bancoNovo() {
  const db = newDb();
  db.public.registerFunction({
    name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => crypto.randomUUID()
  });
  const pg = db.adapters.createPg();
  const pool = new pg.Pool();
  return {
    pool,
    q: async (sql) => (await pool.query(sql)).rows,
    // A interface que o runner usa: connect() com query/release, e query().
    db: { connect: async () => ({ query: (...a) => pool.query(...a), release() {} }),
          query: (...a) => pool.query(...a) }
  };
}

// ── pasta temporaria com schema, seeds e migrations inventados ─────────────
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'migracoes-'));
const configDir     = path.join(raiz, 'config');
const legacyDir     = path.join(raiz, 'legacy');
const migrationsDir = path.join(raiz, 'migrations');
for (const d of [configDir, legacyDir, migrationsDir]) fs.mkdirSync(d);

fs.writeFileSync(path.join(configDir, 'schema.sql'),
  `CREATE TABLE IF NOT EXISTS users (encerrada_em TIMESTAMP, anonimizada_em TIMESTAMP, id SERIAL PRIMARY KEY, nome TEXT);
   CREATE TABLE IF NOT EXISTS tabela_apagada_pela_014 (id SERIAL PRIMARY KEY);`);
fs.writeFileSync(path.join(configDir, 'seeds.sql'),
  `INSERT INTO users (nome) VALUES ('semente');`);
fs.writeFileSync(path.join(legacyDir, '003_multi_tenant.sql'),
  `CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, slug TEXT);`);
fs.writeFileSync(path.join(migrationsDir, '010_primeira.sql'),
  `ALTER TABLE users ADD COLUMN email TEXT;`);
fs.writeFileSync(path.join(migrationsDir, '014_limpeza.sql'),
  `DROP TABLE IF EXISTS tabela_apagada_pela_014;`);

const silencio = { log() {}, error() {} };
const { runMigrations, statusDasMigracoes, ErroDeMigracao } = await import('../src/config/migrate.js');
const opcoes = (db) => ({ migrationsDir, configDir, legacyDir, db, log: silencio });

// ── cenario 1: banco vazio recebe schema, seeds, 003 e as migrations ───────
{
  const { db, q } = bancoNovo();

  await teste('banco vazio: bootstrap roda e as migrations entram em ordem', async () => {
    const r = await runMigrations(opcoes(db));
    igual(r.bootstrap, true, 'bootstrap');
    igual(r.aplicadas.join(','), '010_primeira.sql,014_limpeza.sql', 'aplicadas');
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM users`);
    igual(n, 1, 'seed inserido');
    const orgs = await q(`SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations'`);
    igual(orgs.length > 0, true, 'legada 003 aplicada');
  });

  await teste('segundo boot: schema e seeds NAO rodam de novo', async () => {
    // A 014 apagou a tabela. Se o schema rodasse de novo, ela voltaria.
    const r = await runMigrations(opcoes(db));
    igual(r.bootstrap, false, 'bootstrap');
    igual(r.aplicadas.length, 0, 'nada novo');
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM users`);
    igual(n, 1, 'seed nao duplicou');
    const volta = await q(`SELECT 1 FROM information_schema.tables WHERE table_name = 'tabela_apagada_pela_014'`);
    igual(volta.length, 0, 'tabela apagada pela 014 continuou apagada');
  });

  await teste('status nao acusa pendencia', async () => {
    const s = await statusDasMigracoes({ migrationsDir, db });
    igual(s.pendentes.length, 0, 'pendentes');
    igual(s.ultima, '014_limpeza.sql', 'ultima');
  });
}

// ── cenario 2: migration quebrada interrompe, nao registra, nao segue ──────
fs.writeFileSync(path.join(migrationsDir, '020_quebrada.sql'),
  `ALTER TABLE users ADD COLUMN cpf TEXT;
   ALTER TABLE tabela_que_nao_existe ADD COLUMN x TEXT;`);
fs.writeFileSync(path.join(migrationsDir, '021_depois.sql'),
  `ALTER TABLE users ADD COLUMN telefone TEXT;`);

{
  const { db, q } = bancoNovo();

  await teste('migration quebrada: erro nomeia o arquivo', async () => {
    let erro = null;
    try { await runMigrations(opcoes(db)); } catch (e) { erro = e; }
    if (!(erro instanceof ErroDeMigracao)) throw new Error('nao lancou ErroDeMigracao: ' + (erro && erro.message));
    igual(erro.arquivo, '020_quebrada.sql', 'arquivo');
  });

  await teste('a quebrada nao fica registrada e a seguinte nao roda', async () => {
    const log = (await q(`SELECT filename FROM migrations_log ORDER BY filename`)).map(r => r.filename);
    igual(log.join(','), '010_primeira.sql,014_limpeza.sql', 'migrations_log');
    const s = await statusDasMigracoes({ migrationsDir, db });
    igual(s.pendentes.join(','), '020_quebrada.sql,021_depois.sql', 'pendentes');
  });

  await teste('corrigida a migration, o boot seguinte termina o trabalho', async () => {
    // IF NOT EXISTS porque o pg-mem nao desfaz DDL no ROLLBACK; num Postgres
    // real a coluna cpf nao existe neste ponto (conferido a mao, ver o PR).
    fs.writeFileSync(path.join(migrationsDir, '020_quebrada.sql'), `ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf TEXT;`);
    const r = await runMigrations(opcoes(db));
    igual(r.aplicadas.join(','), '020_quebrada.sql,021_depois.sql', 'aplicadas');
  });
}

fs.rmSync(raiz, { recursive: true, force: true });

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
