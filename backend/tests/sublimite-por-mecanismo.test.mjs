// Sublimite por mecanismo, DENTRO do teto compartilhado.
//
// O CDCA/DF publica 3% para pessoa física (RN 125/2026, art. 2º, § 1º, II e
// § 3º); a plataforma calcula 6% pelo art. 22 da Lei 9.532/1997. Decisão de
// set/2026: seguir a RN 125, porque 3% é menor que 6% sob qualquer leitura e
// é o número do órgão que emite o recibo.
//
// A ARMADILHA que estes testes existem para travar: dar ao FDCA um teto
// PRÓPRIO de 3% quebraria o cruzamento com a Rouanet — `saldoDisponivel()`
// soma contra o mesmo `teto_codigo` — e liberaria 6% + 3% = 9%. Pior que não
// fazer nada.
//
// O que estes testes guardam:
//   - o FDCA continua somando contra o mesmo bolo da Rouanet;
//   - a fatia do FDCA para em 3%, mesmo com o bolo inteiro livre;
//   - destinar ao FDCA consome o bolo da Rouanet, e vice-versa;
//   - 6% de Rouanet + 3% de FDCA é RECUSADO;
//   - mecanismo sem sublimite (Rouanet) usa o teto inteiro;
//   - vale sempre o MENOR dos dois;
//   - a rota diz qual dos dois barrou.
import { newDb } from 'pg-mem';

process.env.NODE_ENV = 'test';

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};
const igual = (a, b, o) => {
  if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
};

const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});
db.public.none(`
  CREATE TABLE tetos_deducao (
    codigo TEXT PRIMARY KEY, descricao TEXT, percentual NUMERIC, base_legal TEXT,
    vigencia_inicio DATE, vigencia_fim DATE, confirmado_por_parecer BOOLEAN DEFAULT false);
  CREATE TABLE incentive_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT, name TEXT, teto_codigo TEXT,
    sublimite_pct NUMERIC, sublimite_base_legal TEXT);
  CREATE TABLE official_funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT, incentive_group_id UUID);
  CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, official_fund_id UUID,
    donation_amount NUMERIC, fiscal_year INT, status TEXT DEFAULT 'pending');
`);
const pgMem = db.adapters.createPg();
const pool = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => pool.query(...a);
poolReal.connect = async () => ({ query: (...a) => pool.query(...a), release() {} });

await pool.query(
  `INSERT INTO tetos_deducao (codigo, percentual, base_legal, vigencia_inicio)
   VALUES ('irpf_global_6', 6.00, 'Lei 9.532/1997, art. 22', '1998-01-01')`);

// Os dois mecanismos dividem o MESMO teto. O FDCA tem fatia; a Rouanet, não.
const { rows: [gRouanet] } = await pool.query(
  `INSERT INTO incentive_groups (code, name, teto_codigo, sublimite_pct)
   VALUES ('rouanet', 'Lei Rouanet', 'irpf_global_6', NULL) RETURNING id`);
const { rows: [gFdca] } = await pool.query(
  `INSERT INTO incentive_groups (code, name, teto_codigo, sublimite_pct, sublimite_base_legal)
   VALUES ('fia', 'FDCA', 'irpf_global_6', 3.00, 'RN CDCA/DF 125/2026, art. 2º, § 1º, II') RETURNING id`);
const { rows: [fRouanet] } = await pool.query(
  `INSERT INTO official_funds (code, incentive_group_id) VALUES ('FNC', $1) RETURNING id`, [gRouanet.id]);
const { rows: [fFdca] } = await pool.query(
  `INSERT INTO official_funds (code, incentive_group_id) VALUES ('FDCA-DF', $1) RETURNING id`, [gFdca.id]);

const { saldoDisponivel, limpaCache } = await import('../src/lib/tetos.js');

const IR = 10000;          // teto de 6% = R$ 600; fatia do FDCA (3%) = R$ 300
const ANO = 2026;
let contribuinte;

/** Zera o histórico e começa um contribuinte novo, para cada caso isolado. */
async function novoContribuinte() {
  contribuinte = crypto.randomUUID();
  limpaCache();
  return contribuinte;
}
async function destina(fundo, valor) {
  await pool.query(
    `INSERT INTO donations (user_id, official_fund_id, donation_amount, fiscal_year)
     VALUES ($1, $2, $3, $4)`, [contribuinte, fundo, valor, ANO]);
}

// ───────────────────────────────────────────────────────────────────────────
// 1. A fatia do FDCA para em 3%, com o bolo inteiro livre
// ───────────────────────────────────────────────────────────────────────────

await teste('sem nada destinado, o FDCA ve 3% e nao 6%', async () => {
  await novoContribuinte();
  const s = await saldoDisponivel(contribuinte, IR, ANO, 'fia');
  igual(s.limite, 600, 'o bolo continua 6%');
  igual(s.sublimite.limite, 300, 'a fatia e 3%');
  igual(s.disponivel, 300, 'vale o menor');
  igual(s.limitado_por, 'sublimite', 'quem barra');
});

await teste('a Rouanet, sem sublimite, ve o teto inteiro', async () => {
  await novoContribuinte();
  const s = await saldoDisponivel(contribuinte, IR, ANO, 'rouanet');
  igual(s.limite, 600, 'bolo');
  igual(s.sublimite, null, 'sem fatia');
  igual(s.disponivel, 600, 'usa tudo');
  igual(s.limitado_por, 'teto', 'quem barra');
});

// ───────────────────────────────────────────────────────────────────────────
// 2. O cruzamento — o que a armadilha quebraria
// ───────────────────────────────────────────────────────────────────────────

await teste('destinar ao FDCA consome o bolo da Rouanet', async () => {
  await novoContribuinte();
  await destina(fFdca.id, 300);                        // esgota a fatia do FDCA
  const r = await saldoDisponivel(contribuinte, IR, ANO, 'rouanet');
  igual(r.ja_destinado, 300, 'a Rouanet enxerga o que foi ao FDCA');
  igual(r.disponivel, 300, 'sobra 300 no bolo, nao 600');
});

await teste('destinar a Rouanet consome a fatia disponivel do FDCA', async () => {
  await novoContribuinte();
  await destina(fRouanet.id, 500);                     // 500 dos 600 do bolo
  const f = await saldoDisponivel(contribuinte, IR, ANO, 'fia');
  igual(f.ja_destinado, 500, 'o FDCA enxerga o que foi a Rouanet');
  igual(f.sublimite.ja_destinado, 0, 'mas nao na fatia dele');
  igual(f.sublimite.disponivel, 300, 'a fatia continua inteira');
  igual(f.disponivel, 100, 'o bolo e quem aperta agora');
  igual(f.limitado_por, 'teto', 'quem barra mudou');
});

await teste('6% de Rouanet mais 3% de FDCA e RECUSADO (a armadilha)', async () => {
  await novoContribuinte();
  await destina(fRouanet.id, 600);                     // bolo cheio
  const f = await saldoDisponivel(contribuinte, IR, ANO, 'fia');
  igual(f.disponivel, 0, 'nao sobra nada para o FDCA');
  if (f.disponivel > 0) throw new Error('liberou acima de 6% no total');
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Dentro da própria fatia
// ───────────────────────────────────────────────────────────────────────────

await teste('a fatia do FDCA se esgota sozinha, com bolo de sobra', async () => {
  await novoContribuinte();
  await destina(fFdca.id, 200);
  const f = await saldoDisponivel(contribuinte, IR, ANO, 'fia');
  igual(f.disponivel, 100, 'sobra so o que resta da fatia');
  igual(f.limitado_por, 'sublimite', 'quem barra');

  await destina(fFdca.id, 100);
  const cheio = await saldoDisponivel(contribuinte, IR, ANO, 'fia');
  igual(cheio.disponivel, 0, 'fatia esgotada');
  igual(cheio.limite - cheio.ja_destinado, 300, 'e ainda havia 300 no bolo');
});

await teste('destinacao cancelada nao conta em nenhum dos dois', async () => {
  await novoContribuinte();
  await destina(fFdca.id, 300);
  await pool.query(`UPDATE donations SET status = 'cancelled' WHERE user_id = $1`, [contribuinte]);
  const f = await saldoDisponivel(contribuinte, IR, ANO, 'fia');
  igual(f.ja_destinado, 0, 'bolo');
  igual(f.sublimite.ja_destinado, 0, 'fatia');
  igual(f.disponivel, 300, 'tudo de volta');
});

await teste('outro ano-calendario nao mistura', async () => {
  await novoContribuinte();
  await pool.query(
    `INSERT INTO donations (user_id, official_fund_id, donation_amount, fiscal_year)
     VALUES ($1, $2, 300, 2025)`, [contribuinte, fFdca.id]);
  const f = await saldoDisponivel(contribuinte, IR, ANO, 'fia');
  igual(f.sublimite.disponivel, 300, 'o ano anterior nao consome a fatia deste');
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Destinação sem fundo identificado — o lado conservador
// ───────────────────────────────────────────────────────────────────────────

await teste('destinacao sem fundo conta nos dois, pelo lado seguro', async () => {
  await novoContribuinte();
  await pool.query(
    `INSERT INTO donations (user_id, official_fund_id, donation_amount, fiscal_year)
     VALUES ($1, NULL, 100, $2)`, [contribuinte, ANO]);
  const f = await saldoDisponivel(contribuinte, IR, ANO, 'fia');
  igual(f.ja_destinado, 100, 'conta no bolo');
  igual(f.sublimite.ja_destinado, 100, 'e na fatia: nao saber a que mecanismo e nao ignorar');
  igual(f.disponivel, 200, 'sobra da fatia');
});

// ───────────────────────────────────────────────────────────────────────────
// 5. A migration
// ───────────────────────────────────────────────────────────────────────────

const fs = await import('fs');
const path = await import('path');
const { fileURLToPath } = await import('url');
const RAIZ = path.dirname(fileURLToPath(import.meta.url)) + '/../..';

await teste('a 050 mantem o FDCA no teto compartilhado', () => {
  const sql = fs.readFileSync(path.join(RAIZ, 'backend/src/migrations/050_sublimite_por_mecanismo.sql'), 'utf8');
  const semComentario = sql.replace(/^--.*$/gm, '');

  if (!/sublimite_pct\s*=\s*3\.00/.test(semComentario)) throw new Error('a 050 nao fixa os 3% do FDCA');
  if (!/teto_codigo\s*=\s*'irpf_global_6'/.test(semComentario)) {
    throw new Error('a 050 precisa REAFIRMAR o teto compartilhado do FDCA');
  }
  // A armadilha: um teto proprio para o FDCA quebraria o cruzamento.
  if (/INSERT INTO tetos_deducao/i.test(semComentario)) {
    throw new Error('a 050 criou um teto novo — o sublimite NAO e um teto separado');
  }
  if (!/CDCA\/DF nº 125/.test(semComentario)) throw new Error('falta a base legal do sublimite');
});

await teste('a 050 NAO aplica o sublimite ao Fundo do Idoso', () => {
  const sql = fs.readFileSync(path.join(RAIZ, 'backend/src/migrations/050_sublimite_por_mecanismo.sql'), 'utf8');
  const semComentario = sql.replace(/^--.*$/gm, '');
  if (/sublimite_pct[^;]*WHERE code = 'idoso'/s.test(semComentario)) {
    throw new Error('a RN 125 e do conselho da crianca: aplicar ao Idoso seria inventar limite sem fonte');
  }
});

await teste('a 050 nao libera mecanismo para cliente', () => {
  const sql = fs.readFileSync(path.join(RAIZ, 'backend/src/migrations/050_sublimite_por_mecanismo.sql'), 'utf8');
  if (/disponivel_para_cliente\s*=\s*TRUE/i.test(sql.replace(/^--.*$/gm, ''))) {
    throw new Error('o sublimite nao acende mecanismo nenhum');
  }
});

console.log('\nSublimite por mecanismo\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
