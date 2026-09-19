// O teto e conferido na rota de registro do jeito certo (Raio-X, risco 05).
//
// Antes: a rota somava so Rouanet, sem lock, com o IR devido que veio na
// requisicao, e nem isso em simulacao. Agora usa saldoDisponivel() dentro da
// transacao, com o contribuinte bloqueado, com o IR devido fixado por ano
// (vale o menor ja registrado) e com o percentual vindo de tetos_deducao.
//
// O que o pg-mem NAO reproduz e o advisory lock de verdade: aqui ele e uma
// funcao registrada que nao faz nada. A concorrencia real (dois POSTs
// simultaneos do mesmo CPF, um entra e o outro e recusado) foi conferida num
// Postgres 16; ver o PR da Onda 1.
import { newDb, DataType } from 'pg-mem';
import express from 'express';
import jwt from 'jsonwebtoken';
import http from 'http';

process.env.JWT_SECRET = 'teste';
process.env.NODE_ENV = 'test';
process.env.SIMULATION_MODE = 'true'; // a regra vale tambem em simulacao

const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: DataType.uuid, impure: true,
  implementation: () => crypto.randomUUID()
});
db.public.registerFunction({
  name: 'pg_advisory_xact_lock', args: [DataType.bigint], returns: DataType.bool,
  impure: true, implementation: () => true
});

db.public.none(`
  CREATE TABLE organizations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, slug TEXT);
  CREATE TABLE users (encerrada_em TIMESTAMP, anonimizada_em TIMESTAMP, id UUID PRIMARY KEY DEFAULT gen_random_uuid(), nome TEXT, cpf TEXT, email TEXT, phone TEXT, total_donated NUMERIC DEFAULT 0);
  CREATE TABLE org_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID, pronac TEXT, titulo TEXT,
    proponente_nome TEXT, proponente_cnpj TEXT, bank_name TEXT, bank_code TEXT, bank_agency TEXT, bank_account TEXT,
    pix_key TEXT, pix_key_type TEXT, is_active BOOLEAN DEFAULT true, is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW());
  CREATE TABLE tetos_deducao (codigo TEXT PRIMARY KEY, descricao TEXT, percentual NUMERIC(5,2), base_legal TEXT,
    vigencia_inicio DATE, vigencia_fim DATE, confirmado_por_parecer BOOLEAN DEFAULT FALSE, observacao TEXT);
  CREATE TABLE incentive_groups (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT UNIQUE, name TEXT,
    max_percentage NUMERIC(5,2), period_type TEXT, teto_codigo TEXT);
  CREATE TABLE official_funds (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incentive_group_id UUID, code TEXT, name TEXT);
  CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, organization_id UUID, official_fund_id UUID,
    donation_amount NUMERIC, ir_devido NUMERIC, fiscal_year INT, pronac TEXT, projeto_titulo TEXT,
    status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT NOW());
  INSERT INTO tetos_deducao (codigo, descricao, percentual, base_legal, vigencia_inicio)
    VALUES ('irpf_global_6','Teto global',6.00,'Lei 9.532/1997, art. 22','1998-01-01');
`);

const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });

const { default: donationsRoutes } = await import('../src/routes/donations.js');
const { limpaCache } = await import('../src/lib/tetos.js');

const q = async (sql) => (await poolFalso.query(sql)).rows;
const [{ id: grupoId }] = await q(`INSERT INTO incentive_groups (code, name, max_percentage, period_type, teto_codigo)
  VALUES ('ROUANET','Lei Rouanet',6.00,'annual','irpf_global_6') RETURNING id`);
await q(`INSERT INTO official_funds (incentive_group_id, code, name) VALUES ('${grupoId}','FNC','Fundo Nacional de Cultura')`);
const [{ id: orgId }] = await q(`INSERT INTO organizations (name, slug) VALUES ('Casa Azul','casa-azul') RETURNING id`);
await q(`INSERT INTO org_projects (organization_id, pronac, titulo, proponente_nome, bank_name, bank_code, bank_agency, bank_account, is_active, is_featured)
  VALUES ('${orgId}','2511274','Casa Azul Celebra','Casa Azul','Banco do Brasil','001','1234-5','98.765-4',true,true)`);

const novoUsuario = async (nome) =>
  (await q(`INSERT INTO users (nome, cpf, email) VALUES ('${nome}','000','${nome}@x.gov.br') RETURNING id`))[0].id;
const tokenDe = (userId) => jwt.sign({ userId, orgId }, 'teste', { expiresIn: '1h' });

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.organization = { id: orgId }; next(); });
app.use('/api/donations', donationsRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

const registrar = async (token, corpo) => {
  const r = await fetch(base + '/api/donations/rouanet', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ pronac: '2511274', projeto_titulo: 'Mostra', fiscal_year: 2026, ...corpo })
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};

const ok = [], falhas = [];
const teste = async (nome, fn) => { try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); } };
const igual = (a, b, o) => { if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };

// IR devido 10.000 → teto 6% = 600
{
  const token = tokenDe(await novoUsuario('maria'));

  await teste('primeira destinacao dentro do teto: 201, com saldo na resposta', async () => {
    const r = await registrar(token, { ir_devido: 10000, donation_amount: 400 });
    igual(r.status, 201, 'status ' + JSON.stringify(r.corpo));
    igual(r.corpo.donation.saldo.teto_percentual, 6, 'teto_percentual');
    igual(r.corpo.donation.saldo.limite, 600, 'limite');
    igual(r.corpo.donation.saldo.disponivel, 200, 'disponivel apos');
  });

  await teste('segunda que estoura o acumulado do ano: 400, mesmo em simulacao', async () => {
    const r = await registrar(token, { ir_devido: 10000, donation_amount: 300 });
    igual(r.status, 400, 'status');
    igual(r.corpo.codigo, 'acima_do_teto', 'codigo');
    if (!r.corpo.message.includes('6%')) throw new Error('mensagem sem o percentual do teto: ' + r.corpo.message);
    if (!r.corpo.message.includes('400,00') && !r.corpo.message.includes('400.00')) throw new Error('mensagem nao diz o ja destinado: ' + r.corpo.message);
    igual(r.corpo.saldo.disponivel, 200, 'disponivel');
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM donations`);
    igual(n, 1, 'nada gravado');
  });

  await teste('segunda que cabe no que sobrou: 201', async () => {
    const r = await registrar(token, { ir_devido: 10000, donation_amount: 200 });
    igual(r.status, 201, 'status ' + JSON.stringify(r.corpo));
    igual(r.corpo.donation.saldo.disponivel, 0, 'zerou');
  });

  await teste('informar IR devido maior depois nao aumenta o teto', async () => {
    const r = await registrar(token, { ir_devido: 100000, donation_amount: 100 });
    igual(r.status, 400, 'status');
    igual(r.corpo.saldo.ir_devido_base, 10000, 'ir_devido_base fixado no menor');
  });

  await teste('destinacao cancelada deixa de contar', async () => {
    await q(`UPDATE donations SET status = 'cancelled' WHERE donation_amount = 200`);
    const r = await registrar(token, { ir_devido: 10000, donation_amount: 200 });
    igual(r.status, 201, 'status ' + JSON.stringify(r.corpo));
  });
}

{
  const token = tokenDe(await novoUsuario('joao'));

  await teste('informar IR devido MENOR depois reduz o teto para todos', async () => {
    const a = await registrar(token, { ir_devido: 10000, donation_amount: 300 });
    igual(a.status, 201, 'primeira');
    // Agora declara 5.000: teto vira 300, e os 300 ja destinados o esgotam.
    const b = await registrar(token, { ir_devido: 5000, donation_amount: 1 });
    igual(b.status, 400, 'segunda');
    igual(b.corpo.saldo.limite, 300, 'limite recalculado sobre o menor IR devido');
  });

  await teste('a destinacao gravada leva o IR devido base, nao o informado', async () => {
    const [d] = await q(`SELECT ir_devido FROM donations WHERE user_id = (SELECT id FROM users WHERE nome='joao')`);
    igual(Number(d.ir_devido), 10000, 'ir_devido gravado');
  });
}

{
  const token = tokenDe(await novoUsuario('ana'));

  await teste('mudar o teto no banco muda a mensagem e o limite, sem deploy', async () => {
    await q(`UPDATE tetos_deducao SET percentual = 4.00 WHERE codigo = 'irpf_global_6'`);
    limpaCache();
    const r = await registrar(token, { ir_devido: 10000, donation_amount: 500 });
    igual(r.status, 400, 'status');
    if (!r.corpo.message.includes('4%')) throw new Error('mensagem ainda com percentual fixo: ' + r.corpo.message);
    igual(r.corpo.saldo.limite, 400, 'limite');
    await q(`UPDATE tetos_deducao SET percentual = 6.00 WHERE codigo = 'irpf_global_6'`);
    limpaCache();
  });

  await teste('destinacao a outro mecanismo do mesmo teto conta contra ele', async () => {
    // Um fundo de outro grupo, mas ligado ao mesmo teto global de 6%.
    const [{ id: fdiGrupo }] = await q(`INSERT INTO incentive_groups (code, name, max_percentage, period_type, teto_codigo)
      VALUES ('FDI','Fundo do Idoso',6.00,'annual','irpf_global_6') RETURNING id`);
    const [{ id: fdiFundo }] = await q(`INSERT INTO official_funds (incentive_group_id, code, name) VALUES ('${fdiGrupo}','FDI','Fundo do Idoso') RETURNING id`);
    const [{ id: userId }] = await q(`SELECT id FROM users WHERE nome='ana'`);
    await q(`INSERT INTO donations (user_id, official_fund_id, donation_amount, ir_devido, fiscal_year, status)
      VALUES ('${userId}','${fdiFundo}',500,10000,2026,'confirmed')`);
    const r = await registrar(token, { ir_devido: 10000, donation_amount: 200 });
    igual(r.status, 400, 'status');
    igual(r.corpo.saldo.ja_destinado, 500, 'ja_destinado inclui o FDI');
  });
}

servidor.close();

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
