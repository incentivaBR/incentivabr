// A fonte unica dos textos fiscais (Raio-X, risco 04): o mesmo objeto sai em
// /api/config/brand (para as paginas, via tenant.js) e entra no prompt da
// TINA (no bloco do tenant). E as paginas nao podem voltar a escrever o
// percentual do teto a mao.
import { newDb } from 'pg-mem';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
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
  INSERT INTO tetos_deducao (codigo, descricao, percentual, base_legal, vigencia_inicio)
    VALUES ('pronon_pronas_1', 'PRONON e PRONAS', 1.00, 'Lei 12.715/2012', '2012-01-01');
  INSERT INTO incentive_groups (code, name, max_percentage, teto_codigo) VALUES ('ROUANET', 'Lei Rouanet', 6, 'irpf_global_6');
  INSERT INTO incentive_groups (code, name, max_percentage, teto_codigo) VALUES ('FIA', 'Fundo da Crianca', 6, 'irpf_global_6');
  INSERT INTO incentive_groups (code, name, max_percentage, teto_codigo) VALUES ('PRONON', 'PRONON', 1, 'pronon_pronas_1');
`);
const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });

const { textosFiscais, resumoParaPrompt } = await import('../src/lib/textosFiscais.js');
const { montaSystem } = await import('../src/routes/chat.js');
const { default: configRoutes } = await import('../src/routes/config.js');

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};
const igual = (a, b, o) => { if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };

let fiscal;
await teste('o objeto sai do banco: teto, mecanismos, ficha, recibo', async () => {
  fiscal = await textosFiscais({ mecenato_prazo_dias: 12 });
  igual(fiscal.teto.percentual, 6, 'teto.percentual');
  igual(fiscal.teto.percentual_texto, '6%', 'teto.percentual_texto');
  igual(fiscal.teto.fracao, 0.06, 'teto.fracao');
  igual(fiscal.teto.confirmado_por_parecer, false, 'parecer pendente');
  igual(fiscal.recibo.prazo_dias, 12, 'prazo do recibo vem da organizacao');
  igual(fiscal.recibo.emissor, 'proponente', 'quem emite');
  igual(fiscal.dirpf.codigos.cultura, 41, 'codigo cultura');
  igual(fiscal.dirpf.codigos.idoso !== fiscal.dirpf.codigos.cultura, true, 'idoso e cultura nao podem ter o mesmo codigo');
  igual(fiscal.dirpf.confirmado, false, 'ficha marcada como nao confirmada');
  const rouanet = fiscal.mecanismos.find(m => m.code === 'ROUANET');
  const pronon = fiscal.mecanismos.find(m => m.code === 'PRONON');
  igual(rouanet.compoe_teto_global, true, 'rouanet no teto global');
  igual(pronon.compoe_teto_global, false, 'pronon fora do teto global');
  igual(pronon.percentual, 1, 'pronon 1%');
});

await teste('sem organizacao, o prazo cai no padrao de 10 dias', async () => {
  const f = await textosFiscais(null);
  igual(f.recibo.prazo_dias, 10, 'prazo padrao');
});

await teste('o resumo para o prompt tem teto, ficha, recibo e aviso, e nada que o Raio-X proibiu', () => {
  const r = resumoParaPrompt(fiscal);
  for (const trecho of ['6% do imposto devido', 'Lei 9.532/1997', '41 cultura', '12 dias', 'art. 18 abate 100%', 'art. 26 abate 80%', 'Parecer do tributarista: pendente', 'não substitui contador']) {
    if (!r.includes(trecho)) throw new Error(`faltou "${trecho}" em:\n${r}`);
  }
  if (r.includes('13%') || /independente da rouanet/i.test(r) || r.includes('7%')) throw new Error('o resumo trouxe de volta um percentual proibido');
});

await teste('o prompt da TINA leva o resumo no bloco do tenant, com e sem organizacao', () => {
  const com = montaSystem({ name: 'Casa Azul', slug: 'casa-azul' }, fiscal);
  const sem = montaSystem(null, fiscal);
  igual(com.length, 4, 'blocos com org');
  if (!com[2].text.includes('Valores fiscais vigentes')) throw new Error('resumo ausente do bloco do tenant (com org)');
  if (!sem[2].text.includes('Valores fiscais vigentes')) throw new Error('resumo ausente do bloco do tenant (sem org)');
  if (com[1].text.includes('Valores fiscais vigentes')) throw new Error('o resumo vazou para o nucleo cacheado');
  const antigo = montaSystem(null);
  if (antigo[2].text.includes('Valores fiscais vigentes')) throw new Error('sem fiscal, o bloco nao deveria ter resumo');
});

// ── /api/config/brand ───────────────────────────────────────────────────────
const app = express();
app.use((req, _res, next) => { req.organization = { name: 'Casa Azul', slug: 'casa-azul', mecenato_prazo_dias: 12 }; next(); });
app.use('/api/config', configRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

await teste('/api/config/brand entrega o mesmo objeto em `fiscal`', async () => {
  const r = await fetch(base + '/api/config/brand');
  const b = await r.json();
  igual(r.status, 200, 'status');
  igual(b.teto_percentual, 6, 'teto_percentual (compatibilidade)');
  igual(b.fiscal.teto.percentual_texto, '6%', 'fiscal.teto');
  igual(b.fiscal.recibo.prazo_dias, 12, 'fiscal.recibo.prazo_dias');
  igual(b.fiscal.dirpf.ficha, 'Doações Efetuadas', 'fiscal.dirpf.ficha');
});
servidor.close();

// ── as paginas nao escrevem o teto a mao ───────────────────────────────────
const FRONTEND = path.join(AQUI, '../../frontend');
const paginas = fs.readdirSync(FRONTEND).filter(f => f.endsWith('.html'));

await teste('nenhuma pagina traz "6%" fora de um [data-fiscal] (fora de <script> e <meta>)', () => {
  const soltos = [];
  for (const p of paginas) {
    let dentro = false;
    fs.readFileSync(path.join(FRONTEND, p), 'utf8').split('\n').forEach((l, i) => {
      if (/<script\b/.test(l)) dentro = true;
      if (dentro) { if (l.includes('</script>')) dentro = false; return; }
      if (l.includes('<meta')) return;
      const resto = l.replace(/data-fiscal="teto_pct">6%<\/span>/g, '');
      if (/(?<![\d.,])6%/.test(resto)) soltos.push(`${p}:${i + 1}`);
    });
  }
  if (soltos.length) throw new Error('6% escrito a mao em: ' + soltos.join(', '));
});

await teste('nenhuma pagina afirma "7%" do IR (o esporte concorre no teto unico, migration 031)', () => {
  const achados = [];
  for (const p of paginas) {
    fs.readFileSync(path.join(FRONTEND, p), 'utf8').split('\n').forEach((l, i) => {
      if (l.trim().startsWith('//')) return;
      if (/(?<![\d.,%])7%\s*do\s+IR/i.test(l) || /at[ée]\s+7%/i.test(l)) achados.push(`${p}:${i + 1}`);
    });
  }
  if (achados.length) throw new Error('"7% do IR" em: ' + achados.join(', '));
});

await teste('toda pagina com [data-fiscal] carrega o tenant.js que o preenche', () => {
  const sem = paginas.filter(p => {
    const h = fs.readFileSync(path.join(FRONTEND, p), 'utf8');
    return h.includes('data-fiscal=') && !h.includes('js/tenant.js');
  });
  if (sem.length) throw new Error('data-fiscal sem tenant.js em: ' + sem.join(', '));
});

await teste('o nucleo da TINA esta em dia com as paginas e sem conta bancaria', () => {
  const nucleo = fs.readFileSync(path.join(AQUI, '../src/knowledge/nucleo.md'), 'utf8');
  if (/1419-2|36\.068-6/.test(nucleo)) throw new Error('o nucleo ainda traz a conta bancaria antiga');
  if (/IncentivaBR emite/i.test(nucleo)) throw new Error('o nucleo diz que a plataforma emite o recibo');
  if (/Código 41 — Estatuto/i.test(nucleo)) throw new Error('o nucleo mistura o codigo da Rouanet com o do ECA');
});

console.log('\n================================================================');
for (const n of ok) console.log(`  ok    ${n}`);
for (const [n, e] of falhas) console.log(`  FALHA ${n}\n        ${e}`);
console.log('================================================================');
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
