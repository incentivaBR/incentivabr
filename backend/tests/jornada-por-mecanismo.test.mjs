// A jornada deixa de ser Rouanet.
//
// A rota de registro exigia PRONAC de seis ou sete dígitos e carimbava toda
// destinação com o fundo 'FNC'. Um fundo municipal não tem PRONAC: tem CNPJ,
// uma OSC indicada pelo doador (RN 125/2026, art. 5º) e um recibo emitido
// pelo próprio Conselho. Enquanto aquelas duas linhas existissem, nenhum
// cliente fora da Rouanet registrava destinação.
//
// O que estes testes guardam:
//   - a Rouanet continua exigindo PRONAC, e recusando o inválido;
//   - um mecanismo de fundo registra SEM pronac;
//   - e RECUSA um pronac mandado à toa — número que a jornada não usa,
//     aceito calado, vira dado que ninguém sabe de onde veio;
//   - o fundo gravado é o do projeto do tenant, nunca o literal 'FNC';
//   - o título sai do projeto, não de "Projeto PRONAC undefined";
//   - o vocabulário vem do banco: nem a rota nem a tela escrevem "PRONAC"
//     ou "Recibo de Mecenato" à mão;
//   - `/registrar` e `/rouanet` respondem igual.
import { newDb, DataType } from 'pg-mem';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'teste';
process.env.SIMULATION_MODE = 'true';   // sem conta de captação exigida

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');

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
// O pg-mem não reproduz o advisory lock de verdade: aqui ele é uma função que
// não faz nada. A concorrência real foi conferida num Postgres 16, na Onda 1.
db.public.registerFunction({
  name: 'pg_advisory_xact_lock', args: [DataType.bigint], returns: DataType.bool,
  impure: true, implementation: () => true
});
db.public.none(`
  CREATE TABLE organizations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT, slug TEXT, incentive_group_code TEXT, mecenato_prazo_dias INT);
  CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT, email TEXT, cpf TEXT, phone TEXT, total_donated NUMERIC DEFAULT 0,
    encerrada_em TIMESTAMP, anonimizada_em TIMESTAMP);
  CREATE TABLE tetos_deducao (codigo TEXT PRIMARY KEY, descricao TEXT, percentual NUMERIC,
    base_legal TEXT, vigencia_inicio DATE, vigencia_fim DATE, confirmado_por_parecer BOOLEAN DEFAULT false);
  CREATE TABLE laws (slug TEXT PRIMARY KEY, name TEXT, base_legal TEXT, orgao TEXT,
    sistema_oficial TEXT, sistema_url TEXT,
    termo_identificador TEXT, termo_beneficiario TEXT, termo_recibo TEXT, termo_recibo_emissor TEXT);
  CREATE TABLE incentive_groups (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT, name TEXT, teto_codigo TEXT, sublimite_pct NUMERIC, sublimite_base_legal TEXT,
    law_slug TEXT, identificador TEXT DEFAULT 'projeto_do_tenant',
    disponivel_para_cliente BOOLEAN DEFAULT false, motivo_indisponivel TEXT);
  CREATE TABLE official_funds (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT, name TEXT, incentive_group_id UUID, is_active BOOLEAN DEFAULT true,
    prazo_comprovante_dias INT, prazo_comprovante_orgao TEXT, prazo_comprovante_base_legal TEXT,
    created_at TIMESTAMP DEFAULT NOW());
  CREATE TABLE org_projects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, official_fund_id UUID, pronac TEXT, fund_code TEXT, titulo TEXT,
    proponente_nome TEXT, proponente_cnpj TEXT,
    bank_name TEXT, bank_code TEXT, bank_agency TEXT, bank_account TEXT,
    pix_key TEXT, pix_key_type TEXT,
    is_active BOOLEAN DEFAULT true, is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW());
  CREATE TABLE donations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, organization_id UUID, official_fund_id UUID, pronac TEXT, projeto_titulo TEXT,
    ir_devido NUMERIC, donation_amount NUMERIC, fiscal_year INT, status TEXT DEFAULT 'pending',
    transferido_em DATE, created_at TIMESTAMP DEFAULT NOW());
`);
const pgMem = db.adapters.createPg();
const pool = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => pool.query(...a);
poolReal.connect = async () => ({ query: (...a) => pool.query(...a), release() {} });

await pool.query(
  `INSERT INTO tetos_deducao (codigo, percentual, base_legal, vigencia_inicio)
   VALUES ('irpf_global_6', 6.00, 'Lei 9.532/1997, art. 22', '1998-01-01')`);

await pool.query(
  `INSERT INTO laws (slug, name, termo_identificador, termo_beneficiario, termo_recibo, termo_recibo_emissor)
   VALUES ('rouanet','Lei Rouanet','PRONAC','proponente','Recibo de Mecenato','o proponente do projeto'),
          ('fia','FDCA', NULL, 'OSC', 'Recibo de Doação', 'a Secretaria Executiva do CDCA/DF')`);

const { rows: [gRou] } = await pool.query(
  `INSERT INTO incentive_groups (code, name, teto_codigo, law_slug, identificador, disponivel_para_cliente)
   VALUES ('rouanet','Lei Rouanet','irpf_global_6','rouanet','pronac',true) RETURNING id`);
const { rows: [gFdca] } = await pool.query(
  `INSERT INTO incentive_groups (code, name, teto_codigo, sublimite_pct, law_slug, identificador, disponivel_para_cliente)
   VALUES ('fia','FDCA','irpf_global_6',3.00,'fia','projeto_do_tenant',true) RETURNING id`);

const { rows: [fFnc] } = await pool.query(
  `INSERT INTO official_funds (code, name, incentive_group_id) VALUES ('FNC','Fundo Nacional de Cultura',$1) RETURNING id`, [gRou.id]);
const { rows: [fFdca] } = await pool.query(
  `INSERT INTO official_funds (code, name, incentive_group_id, prazo_comprovante_dias, prazo_comprovante_orgao)
   VALUES ('FDCA-DF','FDCA/DF',$1,60,'Secretaria Executiva do CDCA/DF') RETURNING id`, [gFdca.id]);

// Dois clientes: um Rouanet, um FDCA. Cada um com o seu projeto ativo.
const { rows: [orgRou] } = await pool.query(
  `INSERT INTO organizations (name, slug, incentive_group_code) VALUES ('Casa Azul','casa-azul','rouanet') RETURNING id`);
const { rows: [orgFdca] } = await pool.query(
  `INSERT INTO organizations (name, slug, incentive_group_code) VALUES ('Instituto Semear','semear','fia') RETURNING id`);
await pool.query(
  `INSERT INTO org_projects (organization_id, official_fund_id, pronac, titulo, proponente_nome, bank_agency, bank_account)
   VALUES ($1,$2,'2511274','Festival de Inverno','Casa Azul Cultural','3902-5','170500-8')`, [orgRou.id, fFnc.id]);
await pool.query(
  `INSERT INTO org_projects (organization_id, official_fund_id, titulo, proponente_nome, bank_agency, bank_account)
   VALUES ($1,$2,'Primeira Infância no Sol Nascente','Instituto Semear','100','044149-8')`, [orgFdca.id, fFdca.id]);

const { default: donationRoutes } = await import('../src/routes/donations.js');
const { default: configRoutes } = await import('../src/routes/config.js');

/** Monta um servidor cujo tenant é a organização dada. */
function servidorDe(org) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.organization = org; next(); });
  app.use('/api/donations', donationRoutes);
  app.use('/api/config', configRoutes);
  return app;
}

async function sobe(org) {
  const s = http.createServer(servidorDe(org));
  await new Promise(r => s.listen(0, r));
  return { s, base: `http://127.0.0.1:${s.address().port}` };
}

const { rows: [pessoa] } = await pool.query(
  `INSERT INTO users (nome, email, cpf) VALUES ('Fulana','f@x','39053344705') RETURNING id`);
const cracha = jwt.sign({ userId: pessoa.id }, 'teste');

async function registra(base, rota, corpo) {
  const r = await fetch(base + rota, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cracha}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  return { status: r.status, corpo: await r.json() };
}

const VALOR = { donation_amount: 100, ir_devido: 10000, fiscal_year: 2026 };

// ───────────────────────────────────────────────────────────────────────────
// 1. Rouanet: o PRONAC continua obrigatório
// ───────────────────────────────────────────────────────────────────────────

const rou = await sobe({ id: orgRou.id, slug: 'casa-azul', incentive_group_code: 'rouanet' });

await teste('Rouanet sem PRONAC e recusada', async () => {
  const r = await registra(rou.base, '/api/donations/registrar', { ...VALOR });
  igual(r.status, 400, 'status');
  if (!/PRONAC/i.test(r.corpo.message)) throw new Error(`a mensagem nao cita o identificador: ${r.corpo.message}`);
});

await teste('Rouanet com PRONAC malformado e recusada', async () => {
  const r = await registra(rou.base, '/api/donations/registrar', { ...VALOR, pronac: 'abc' });
  igual(r.status, 400, 'status');
});

await teste('Rouanet com PRONAC valido registra, com o fundo do projeto', async () => {
  const r = await registra(rou.base, '/api/donations/registrar', { ...VALOR, pronac: '2511274' });
  igual(r.status, 201, 'status');
  igual(r.corpo.donation.pronac, '2511274', 'pronac gravado');

  const { rows } = await pool.query(
    'SELECT official_fund_id, projeto_titulo FROM donations WHERE id = $1', [r.corpo.donation.id]);
  igual(rows[0].official_fund_id, fFnc.id, 'o fundo veio do projeto do tenant');
  igual(rows[0].projeto_titulo, 'Festival de Inverno', 'o titulo veio do projeto');
});

await teste('o vocabulario da Rouanet vem do banco', async () => {
  const r = await registra(rou.base, '/api/donations/registrar', { ...VALOR, pronac: '2511274' });
  const v = r.corpo.donation.vocabulario;
  igual(v.identificador, 'PRONAC', 'identificador');
  igual(v.recibo, 'Recibo de Mecenato', 'recibo');
  igual(v.recibo_emissor, 'o proponente do projeto', 'emissor');
  if (!/PRONAC/.test(r.corpo.donation.banco.instrucoes)) {
    throw new Error('a instrucao do comprovante deveria citar o PRONAC');
  }
});

rou.s.close();

// ───────────────────────────────────────────────────────────────────────────
// 2. FDCA: sem PRONAC, e o fundo é o do projeto
// ───────────────────────────────────────────────────────────────────────────

const fdca = await sobe({ id: orgFdca.id, slug: 'semear', incentive_group_code: 'fia' });

await teste('FDCA registra SEM pronac', async () => {
  const r = await registra(fdca.base, '/api/donations/registrar', { ...VALOR });
  igual(r.status, 201, 'status');
  igual(r.corpo.donation.pronac, null, 'sem pronac');
  igual(r.corpo.donation.projeto_titulo, 'Primeira Infância no Sol Nascente', 'titulo do projeto do tenant');

  const { rows } = await pool.query(
    'SELECT official_fund_id FROM donations WHERE id = $1', [r.corpo.donation.id]);
  igual(rows[0].official_fund_id, fFdca.id, 'o fundo e o FDCA, nao o FNC');
});

await teste('FDCA RECUSA um pronac mandado a toa', async () => {
  const r = await registra(fdca.base, '/api/donations/registrar', { ...VALOR, pronac: '2511274' });
  igual(r.status, 400, 'status');
  if (!/não usa PRONAC/i.test(r.corpo.message)) {
    throw new Error(`a mensagem deveria explicar por que: ${r.corpo.message}`);
  }
});

await teste('o vocabulario do FDCA nao fala em PRONAC nem em Mecenato', async () => {
  const r = await registra(fdca.base, '/api/donations/registrar', { ...VALOR });
  const v = r.corpo.donation.vocabulario;
  igual(v.identificador, null, 'sem identificador');
  igual(v.beneficiario, 'OSC', 'beneficiario');
  igual(v.recibo, 'Recibo de Doação', 'recibo');
  igual(v.recibo_emissor, 'a Secretaria Executiva do CDCA/DF', 'emissor');
  if (/PRONAC/i.test(r.corpo.donation.banco.instrucoes)) {
    throw new Error(`a instrucao manda escrever PRONAC num fundo que nao tem: ${r.corpo.donation.banco.instrucoes}`);
  }
});

await teste('o sublimite de 3% do FDCA vale na rota', async () => {
  // IR de 10.000: bolo de 6% = 600, fatia do FDCA = 300. Já foram 3 x 100.
  const r = await registra(fdca.base, '/api/donations/registrar', { ...VALOR, donation_amount: 500 });
  igual(r.status, 400, 'recusado');
  igual(r.corpo.codigo, 'acima_do_sublimite', 'quem barrou');
  if (!/3%/.test(r.corpo.message)) throw new Error(`a mensagem deveria citar os 3%: ${r.corpo.message}`);
});

await teste('/rouanet responde igual a /registrar', async () => {
  const r = await registra(fdca.base, '/api/donations/rouanet', { ...VALOR, donation_amount: 10 });
  igual(r.status, 201, 'o caminho antigo continua vivo');
  igual(r.corpo.donation.pronac, null, 'e com a jornada do mecanismo, nao a da Rouanet');
});

await teste('/api/config/brand leva a jornada para a tela', async () => {
  const marca = await (await fetch(fdca.base + '/api/config/brand')).json();
  igual(marca.mecanismo.identificador, 'projeto_do_tenant', 'o que identifica');
  igual(marca.mecanismo.vocabulario.recibo, 'Recibo de Doação', 'vocabulario');
  igual(marca.prazo_comprovante.dias, 60, 'e o prazo do fundo junto');
});

fdca.s.close();

// ───────────────────────────────────────────────────────────────────────────
// 3. Nada de literal de mecanismo no código
// ───────────────────────────────────────────────────────────────────────────

await teste('nenhuma rota procura o fundo pelo literal FNC', () => {
  const dir = path.join(RAIZ, 'backend/src');
  const culpados = [];
  (function anda(d) {
    for (const nome of fs.readdirSync(d)) {
      const p = path.join(d, nome);
      if (fs.statSync(p).isDirectory()) { anda(p); continue; }
      if (!nome.endsWith('.js')) continue;
      const texto = fs.readFileSync(p, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
      if (/code\s*=\s*'FNC'|code\s*=\s*"FNC"/.test(texto)) culpados.push(path.relative(RAIZ, p));
    }
  })(dir);
  if (culpados.length) {
    throw new Error('fundo escolhido por literal, e ele é dado do tenant: ' + culpados.join(', '));
  }
});

await teste('o assistente nao escreve o vocabulario da Rouanet a mao', () => {
  // Na tela o vocabulário tem dois lugares legítimos: o texto que já está no
  // HTML dentro de um [data-termo] (é o que aparece antes de a config chegar,
  // e aplicaMecanismo troca depois) e o TERMO_RESERVA único do script. Fora
  // desses dois, "PRONAC" ou "Recibo de Mecenato" escrito no JavaScript é a
  // quarta cópia da frase — a mesma dívida que o 'FNC' era.
  const pagina = fs.readFileSync(path.join(RAIZ, 'frontend/destinar-rouanet.html'), 'utf8');

  const script = pagina.slice(pagina.indexOf('<script>'))
    .replace(/\/\*[\s\S]*?\*\//g, '')       // comentários de bloco
    .replace(/^[ \t]*\/\/.*$/gm, '')        // comentários de linha
    .replace(/const TERMO_RESERVA[\s\S]*?\};/, '');   // a reserva única

  for (const palavra of ['PRONAC', 'Recibo de Mecenato']) {
    if (script.includes(palavra)) {
      const trecho = script.slice(Math.max(0, script.indexOf(palavra) - 70), script.indexOf(palavra) + 40);
      throw new Error(`"${palavra}" escrito a mao no script; use termo(): …${trecho.trim()}…`);
    }
  }

  // E o que está no HTML tem de estar marcado: um "Recibo de Mecenato" solto
  // no corpo da página nunca seria trocado num cliente que não é Rouanet.
  const corpo = pagina.slice(0, pagina.indexOf('<script>'))
    .replace(/<span data-termo="[^"]*">[^<]*<\/span>/g, '');
  if (/Recibo de Mecenato/.test(corpo)) {
    throw new Error('"Recibo de Mecenato" no corpo da pagina sem [data-termo]');
  }
});

await teste('a 051 marca so a Rouanet como pronac', () => {
  const sql = fs.readFileSync(path.join(RAIZ, 'backend/src/migrations/051_jornada_por_mecanismo.sql'), 'utf8');
  const semComentario = sql.replace(/^--.*$/gm, '');
  if (!/identificador\s*=\s*'pronac'[\s\S]{0,80}code\s*=\s*'rouanet'/.test(semComentario)) {
    throw new Error('a 051 precisa marcar a Rouanet como a do registro externo');
  }
  if (/identificador\s*=\s*'pronac'[\s\S]{0,80}code\s*=\s*'fia'/.test(semComentario)) {
    throw new Error('o FDCA nao tem PRONAC');
  }
});

console.log('\nJornada por mecanismo\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
