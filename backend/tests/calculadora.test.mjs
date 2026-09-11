// A calculadora tem de aplicar o teto sobre o IMPOSTO DEVIDO apurado na
// declaração — nunca sobre o rendimento — e o percentual tem de sair do
// banco (`tetos_deducao`), porque é tese jurídica pendente de parecer.
//
// O defeito que motivou estes testes estava na tela, não na conta: enquanto a
// pessoa digitava o rendimento, calculadora.html mostrava um limite estimado a
// partir de "IR ≈ 18% dos rendimentos". O atalho ignora a faixa isenta e a
// progressividade da tabela. Para R$ 36.000 no ano o limite real é R$ 43,26 e
// a prévia anunciava R$ 388,80 — nove vezes mais, justo na faixa de renda da
// maior parte do público; acima de R$ 150.000 errava para menos. A conta do
// backend sempre esteve certa.
import { newDb } from 'pg-mem';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
process.env.NODE_ENV = 'test';

const db = newDb();
db.public.none(`
  CREATE TABLE tetos_deducao (
    codigo TEXT PRIMARY KEY, descricao TEXT, percentual NUMERIC(5,2), base_legal TEXT,
    vigencia_inicio DATE, vigencia_fim DATE, confirmado_por_parecer BOOLEAN DEFAULT FALSE, observacao TEXT
  );
  CREATE TABLE incentive_groups (code TEXT UNIQUE, name TEXT, max_percentage NUMERIC(5,2), teto_codigo TEXT);
  INSERT INTO tetos_deducao (codigo, descricao, percentual, base_legal, vigencia_inicio)
    VALUES ('irpf_global_6', 'Teto global', 6.00, 'Lei 9.532/1997, art. 22', '1998-01-01');
  INSERT INTO incentive_groups (code, name, max_percentage, teto_codigo)
    VALUES ('ROUANET', 'Lei Rouanet', 6, 'irpf_global_6');
`);
const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);

const { limpaCache } = await import('../src/lib/tetos.js');
const { default: calculatorRoutes } = await import('../src/routes/calculator.js');

// O tenant da requisição é trocado entre os casos.
let organizacao = { name: 'IncentivaBR', slug: 'www', incentive_group_code: 'ROUANET' };
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.organization = organizacao; next(); });
app.use('/api/calculator', calculatorRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

const post = (rota, corpo) =>
  fetch(BASE + rota, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
  }).then(r => r.json());

const centavos = n => Math.round(n * 100) / 100;
const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

await teste('IR digitado direto: o limite e exatamente 6% do IR devido', async () => {
  for (const ir of [1000, 8500, 20000, 137.77]) {
    const r = await post('/api/calculator/limites-rapido', { ir_devido: ir });
    const esperado = centavos(ir * 0.06);
    if (r.limites_doacao.rouanet !== esperado) {
      throw new Error(`IR ${ir}: veio ${r.limites_doacao.rouanet}, esperado ${esperado}`);
    }
  }
});

await teste('calculo completo: o limite e 6% do IR devido, nao do rendimento', async () => {
  const r = await post('/api/calculator/ir', { rendimentos_tributaveis: 96000 });
  const esperado = centavos(r.ir_devido * 0.06);
  if (r.limites_doacao.rouanet !== esperado) {
    throw new Error(`veio ${r.limites_doacao.rouanet}, esperado ${esperado} (6% de ${r.ir_devido})`);
  }
  // A prova de que a base é o imposto, não a renda: 6% de 96.000 seria 5.760.
  if (r.limites_doacao.rouanet > 96000 * 0.06 * 0.5) {
    throw new Error('o teto parece estar incidindo sobre o rendimento: ' + r.limites_doacao.rouanet);
  }
});

await teste('faixa isenta: sem IR devido nao ha o que destinar', async () => {
  const r = await post('/api/calculator/ir', { rendimentos_tributaveis: 24000 });
  if (r.ir_devido !== 0) throw new Error('IR devido: ' + r.ir_devido);
  if (r.limites_doacao.rouanet !== 0) throw new Error('limite: ' + r.limites_doacao.rouanet);
});

await teste('a tabela e progressiva: dobrar o rendimento mais que dobra o limite', async () => {
  const a = await post('/api/calculator/ir', { rendimentos_tributaveis: 60000 });
  const b = await post('/api/calculator/ir', { rendimentos_tributaveis: 120000 });
  if (!(b.limites_doacao.rouanet > a.limites_doacao.rouanet * 2)) {
    throw new Error(`60k=${a.limites_doacao.rouanet} 120k=${b.limites_doacao.rouanet} — nao parece progressivo`);
  }
});

await teste('a organizacao pode REDUZIR o teto', async () => {
  organizacao = { ...organizacao, max_percentage: 3 };
  const r = await post('/api/calculator/limites-rapido', { ir_devido: 10000 });
  if (r.limites_doacao.rouanet !== 300) throw new Error('veio ' + r.limites_doacao.rouanet + ', esperado 300');
});

await teste('a organizacao NAO pode aumentar o teto acima da lei', async () => {
  organizacao = { ...organizacao, max_percentage: 20 };
  const r = await post('/api/calculator/limites-rapido', { ir_devido: 10000 });
  if (r.limites_doacao.rouanet !== 600) throw new Error('veio ' + r.limites_doacao.rouanet + ', esperado 600 (6%)');
  organizacao = { name: 'IncentivaBR', slug: 'www', incentive_group_code: 'ROUANET' };
});

await teste('o percentual vem do banco: mudar o teto muda a conta, sem deploy', async () => {
  await poolFalso.query(`UPDATE tetos_deducao SET percentual = 4.00 WHERE codigo = 'irpf_global_6'`);
  limpaCache();
  try {
    const r = await post('/api/calculator/limites-rapido', { ir_devido: 10000 });
    if (r.limites_doacao.rouanet !== 400) throw new Error('veio ' + r.limites_doacao.rouanet + ', esperado 400 (4%)');
  } finally {
    await poolFalso.query(`UPDATE tetos_deducao SET percentual = 6.00 WHERE codigo = 'irpf_global_6'`);
    limpaCache();
  }
});

// ── a tela ──────────────────────────────────────────────────────────────────
await teste('a calculadora nao estima o IR devido a partir do rendimento', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'frontend/calculadora.html'), 'utf8');
  // Só linhas de código: `0.18` também aparece em cores rgba de sombra.
  const suspeitas = html.split('\n').filter(l =>
    /\*\s*0?\.18|0?\.18\s*\*/.test(l) && !/rgba?\(/.test(l));
  if (suspeitas.length) {
    throw new Error('voltou a estimar o IR a partir do rendimento: ' + suspeitas[0].trim().slice(0, 90));
  }
});

await teste('a calculadora nao escreve o percentual do teto a mao', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'frontend/calculadora.html'), 'utf8');
  // O valor de reserva do window.TETO_FRACAO é legítimo; fora dele, não.
  const suspeitas = html.split('\n').filter(l =>
    /0\.06/.test(l) && !/TETO_FRACAO/.test(l));
  if (suspeitas.length) {
    throw new Error('percentual escrito a mao: ' + suspeitas[0].trim().slice(0, 90));
  }
});

servidor.close();
console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
