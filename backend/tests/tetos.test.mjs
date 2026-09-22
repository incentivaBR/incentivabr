// O teto saiu do codigo e foi para o banco. O que NAO pode ter mudado e o
// numero que o servidor ve.
//
// Este teste roda a calculadora de verdade, por HTTP, contra um Postgres em
// memoria, e compara com o que a versao anterior produzia — 6% do IR devido,
// calculado a mao. Se divergir um centavo, alguem destinou errado.
import { newDb } from 'pg-mem';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
process.env.NODE_ENV = 'test';

const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});
db.public.registerFunction({
  name: 'uuid_generate_v4', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});

db.public.none(`
  -- migration 051: mecanismoDaOrg() junta laws para o vocabulario do mecanismo.
  CREATE TABLE laws (slug TEXT PRIMARY KEY, name TEXT, base_legal TEXT, orgao TEXT,
    sistema_oficial TEXT, sistema_url TEXT,
    termo_identificador TEXT, termo_beneficiario TEXT, termo_recibo TEXT, termo_recibo_emissor TEXT);
  CREATE TABLE incentive_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL, name TEXT,
    max_percentage NUMERIC(5,2), period_type TEXT,
    -- migration 051: o que identifica a destinacao neste mecanismo.
    identificador TEXT DEFAULT 'projeto_do_tenant',
    law_slug TEXT,
    disponivel_para_cliente BOOLEAN DEFAULT false,
    motivo_indisponivel TEXT,
    sublimite_pct NUMERIC,
    sublimite_base_legal TEXT
  );
  CREATE TABLE official_funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incentive_group_id UUID, code TEXT, name TEXT
  );
  CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, official_fund_id UUID,
    donation_amount NUMERIC, fiscal_year INT, status TEXT DEFAULT 'pending'
  );
  INSERT INTO incentive_groups (code, name, max_percentage, period_type)
    VALUES ('rouanet','Lei Rouanet',6.00,'annual');
  -- migration 051: a Rouanet e a unica com registro externo.
  UPDATE incentive_groups SET identificador = 'pronac' WHERE code = 'rouanet';
`);

const sql = fs.readFileSync(path.join(AQUI, '../src/migrations/030_tetos_deducao.sql'), 'utf8')
  .replace(/^COMMENT ON[\s\S]*?;$/gm, '');

const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

await teste('migracao 030 aplica', async () => { await poolFalso.query(sql); });

const { default: calculatorRoutes } = await import('../src/routes/calculator.js');
const { limpaCache } = await import('../src/lib/tetos.js');

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.organization = null; next(); });
app.use('/api/calculator', calculatorRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

const post = async (caminho, corpo) => {
  const r = await fetch(base + caminho, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};

// ── o numero nao pode ter mudado ───────────────────────────────────────────
await teste('limites-rapido devolve exatamente 6% do IR, como antes', async () => {
  const valores = [1000, 5432.10, 12500.55, 208342, 999999.99];
  for (const ir of valores) {
    const r = await post('/api/calculator/limites-rapido', { ir_devido: ir });
    if (r.status !== 200) throw new Error(`IR ${ir}: status ${r.status}`);
    const esperado = Math.round(ir * 0.06 * 100) / 100;   // a formula antiga
    const veio = r.corpo.limites_doacao.total_maximo;
    if (veio !== esperado)
      throw new Error(`IR ${ir}: esperado ${esperado}, veio ${veio}`);
  }
});

await teste('calculo completo de IR mantem o limite em 6%', async () => {
  const r = await post('/api/calculator/ir', {
    rendimentos_tributaveis: 120000, dependentes: 2, inss: 12000
  });
  if (r.status !== 200) throw new Error('status ' + r.status);
  const esperado = Math.round(r.corpo.ir_devido * 0.06 * 100) / 100;
  if (r.corpo.limites_doacao.total_maximo !== esperado)
    throw new Error(`esperado ${esperado}, veio ${r.corpo.limites_doacao.total_maximo}`);
});

await teste('/distribuir recusa acima do teto e aceita no teto', async () => {
  const ir = 100000;                       // teto = 6.000,00
  const dentro = await post('/api/calculator/distribuir', {
    ir_devido: ir, distribuicao: [{ pronac: '2511274', valor: 6000 }]
  });
  if (dentro.corpo.valid === false)
    throw new Error('recusou valor exatamente no teto: ' + JSON.stringify(dentro.corpo.errors));

  const fora = await post('/api/calculator/distribuir', {
    ir_devido: ir, distribuicao: [{ pronac: '2511274', valor: 6000.01 }]
  });
  if (fora.corpo.valid !== false) throw new Error('aceitou um centavo acima do teto');
});

// ── e agora o ganho: mudar o teto sem tocar em codigo ──────────────────────
await teste('alterar o teto no banco muda o calculo, sem deploy', async () => {
  await poolFalso.query(`UPDATE tetos_deducao SET percentual = 7.00 WHERE codigo = 'irpf_global_6'`);
  limpaCache();
  const r = await post('/api/calculator/limites-rapido', { ir_devido: 100000 });
  if (r.corpo.limites_doacao.total_maximo !== 7000)
    throw new Error('esperado 7000 apos o UPDATE, veio ' + r.corpo.limites_doacao.total_maximo);

  await poolFalso.query(`UPDATE tetos_deducao SET percentual = 6.00 WHERE codigo = 'irpf_global_6'`);
  limpaCache();
});

// ── seguranca: falhar nao pode liberar mais ────────────────────────────────
await teste('banco indisponivel cai no teto de seguranca, nao no ilimitado', async () => {
  const original = poolReal.query;
  poolReal.query = async () => { throw new Error('banco fora do ar'); };
  limpaCache();
  const r = await post('/api/calculator/limites-rapido', { ir_devido: 100000 });
  poolReal.query = original;
  limpaCache();
  if (r.status !== 200) throw new Error('a calculadora caiu junto com o banco');
  if (r.corpo.limites_doacao.total_maximo !== 6000)
    throw new Error('teto de seguranca errado: ' + r.corpo.limites_doacao.total_maximo);
});

await teste('teto do desporto esta cadastrado e separado do global', async () => {
  const { rows } = await poolFalso.query(
    `SELECT codigo, percentual FROM tetos_deducao ORDER BY codigo`);
  const mapa = Object.fromEntries(rows.map(r => [r.codigo, parseFloat(r.percentual)]));
  if (mapa['irpf_global_6'] !== 6) throw new Error('teto global: ' + mapa['irpf_global_6']);
  if (mapa['desporto_7'] !== 7)    throw new Error('teto do desporto: ' + mapa['desporto_7']);
});

servidor.close();

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
