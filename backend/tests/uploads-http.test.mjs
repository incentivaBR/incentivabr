// As rotas de comprovante e de recibo, por HTTP, com o armazenamento numa
// pasta temporaria. O que importa aqui e o contrato com o cliente: o que e
// recusado, o que vai para o banco (chave + hash) e como o download sai.
import { newDb } from 'pg-mem';
import express from 'express';
import jwt from 'jsonwebtoken';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

process.env.JWT_SECRET = 'teste';
process.env.NODE_ENV = 'test';

const db = newDb();
db.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => crypto.randomUUID() });
db.public.none(`
  CREATE TABLE organizations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, slug TEXT,
    contact_person TEXT, contact_email TEXT, contact_whatsapp TEXT, mecenato_prazo_dias INT);
  CREATE TABLE users (encerrada_em TIMESTAMP, anonimizada_em TIMESTAMP, id UUID PRIMARY KEY DEFAULT gen_random_uuid(), nome TEXT, cpf TEXT, email TEXT);
  CREATE TABLE organization_users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, user_id UUID, role TEXT, is_active BOOLEAN DEFAULT true);
  CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, organization_id UUID,
    donation_amount NUMERIC, ir_devido NUMERIC, fiscal_year INT, pronac TEXT, projeto_titulo TEXT,
    status TEXT DEFAULT 'pending',
    receipt_url TEXT, receipt_filename TEXT, receipt_sha256 TEXT,
    mecenato_url TEXT, mecenato_filename TEXT, mecenato_sha256 TEXT,
    mecenato_issued_at TIMESTAMP, mecenato_issued_by UUID, proponente_notified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW());
`);
const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });

// Armazenamento local numa pasta temporaria, injetado no processo.
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
const { criaArmazenamento, usaArmazenamento } = await import('../src/services/armazenamento.js');
usaArmazenamento(await criaArmazenamento({ cfg: { backend: 'local', pasta } }));

const { default: uploadsRoutes } = await import('../src/routes/uploads.js');
const { default: mecenatoRoutes } = await import('../src/routes/mecenato.js');

const q = async (sql) => (await poolFalso.query(sql)).rows;
const [{ id: orgId }] = await q(`INSERT INTO organizations (name, slug) VALUES ('Casa Azul','casa-azul') RETURNING id`);
const [{ id: donoId }] = await q(`INSERT INTO users (nome, cpf, email) VALUES ('Maria','1','m@x') RETURNING id`);
const [{ id: gestorId }] = await q(`INSERT INTO users (nome, email) VALUES ('Gestor','g@x') RETURNING id`);
const [{ id: outroId }] = await q(`INSERT INTO users (nome, email) VALUES ('Outro','o@x') RETURNING id`);
await q(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ('${orgId}','${gestorId}','org_admin')`);
const [{ id: donationId }] = await q(`INSERT INTO donations (user_id, organization_id, donation_amount, ir_devido, fiscal_year, pronac, projeto_titulo, status)
  VALUES ('${donoId}','${orgId}',300,10000,2026,'2511274','Mostra','pending') RETURNING id`);

const tokenDe = (userId) => jwt.sign({ userId, orgId }, 'teste', { expiresIn: '1h' });
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.organization = { id: orgId }; next(); });
app.use('/api/uploads', uploadsRoutes);
app.use('/api/mecenato', mecenatoRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), crypto.randomBytes(200)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), crypto.randomBytes(200)]);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const envia = async (caminho, campo, token, buffer, nome, tipo = 'application/pdf') => {
  const fd = new FormData();
  fd.append(campo, new Blob([buffer], { type: tipo }), nome);
  const r = await fetch(base + caminho, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};
const baixa = async (caminho, token) => {
  const r = await fetch(base + caminho, { headers: { Authorization: 'Bearer ' + token } });
  return { status: r.status, cabecalhos: r.headers, corpo: Buffer.from(await r.arrayBuffer()) };
};

const ok = [], falhas = [];
const teste = async (nome, fn) => { try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); } };
const igual = (a, b, o) => { if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };

await teste('PNG com nome .pdf e recusado com 400, nada gravado', async () => {
  const r = await envia(`/api/uploads/receipt/${donationId}`, 'receipt', tokenDe(donoId), PNG, 'comprovante.pdf');
  igual(r.status, 400, 'status');
  const [d] = await q(`SELECT receipt_url FROM donations WHERE id='${donationId}'`);
  igual(d.receipt_url, null, 'receipt_url');
});

await teste('extensao fora da lista e recusada com 400 (nao 500)', async () => {
  const r = await envia(`/api/uploads/receipt/${donationId}`, 'receipt', tokenDe(donoId), PDF, 'comprovante.xpdf');
  igual(r.status, 400, 'status');
});

await teste('destinacao de outro usuario -> 404, nada gravado', async () => {
  const r = await envia(`/api/uploads/receipt/${donationId}`, 'receipt', tokenDe(outroId), PDF, 'comprovante.pdf');
  igual(r.status, 404, 'status');
  igual(fs.existsSync(path.join(pasta, 'receipts')), false, 'pasta receipts nao foi criada');
});

await teste('comprovante valido: grava chave nova e sha256, muda o status', async () => {
  const r = await envia(`/api/uploads/receipt/${donationId}`, 'receipt', tokenDe(donoId), PDF, 'meu comprovante.pdf');
  igual(r.status, 200, 'status ' + JSON.stringify(r.corpo));
  igual(r.corpo.sha256, sha(PDF), 'sha256 na resposta');
  igual(r.corpo.receipt_url, `/api/uploads/receipt/${donationId}/arquivo`, 'resposta aponta para a rota autenticada');
  const [d] = await q(`SELECT receipt_url, receipt_filename, receipt_sha256, status FROM donations WHERE id='${donationId}'`);
  if (!/^receipts\/\d{4}\/\d{2}\/receipt-[0-9a-f-]{36}\.pdf$/.test(d.receipt_url)) throw new Error('chave: ' + d.receipt_url);
  igual(d.receipt_filename, 'meu comprovante.pdf', 'nome original');
  igual(d.receipt_sha256, sha(PDF), 'sha256 no banco');
  igual(d.status, 'awaiting_confirmation', 'status');
});

await teste('o dono baixa o arquivo identico, com nome e tipo', async () => {
  const r = await baixa(`/api/uploads/receipt/${donationId}/arquivo`, tokenDe(donoId));
  igual(r.status, 200, 'status');
  igual(r.cabecalhos.get('content-type'), 'application/pdf', 'content-type');
  if (!r.cabecalhos.get('content-disposition').includes('meu comprovante.pdf')) throw new Error(r.cabecalhos.get('content-disposition'));
  igual(sha(r.corpo), sha(PDF), 'conteudo identico');
});

await teste('o gestor da organizacao baixa; um estranho nao', async () => {
  igual((await baixa(`/api/uploads/receipt/${donationId}/arquivo`, tokenDe(gestorId))).status, 200, 'gestor');
  igual((await baixa(`/api/uploads/receipt/${donationId}/arquivo`, tokenDe(outroId))).status, 403, 'estranho');
});

await teste('valor legado /uploads/receipts/x.pdf ainda e servido', async () => {
  fs.mkdirSync(path.join(pasta, 'receipts'), { recursive: true });
  fs.writeFileSync(path.join(pasta, 'receipts/receipt-legado.pdf'), PDF);
  await q(`UPDATE donations SET receipt_url='/uploads/receipts/receipt-legado.pdf' WHERE id='${donationId}'`);
  const r = await baixa(`/api/uploads/receipt/${donationId}/arquivo`, tokenDe(donoId));
  igual(r.status, 200, 'status');
  igual(sha(r.corpo), sha(PDF), 'conteudo');
});

await teste('arquivo que sumiu do armazenamento -> 404 com mensagem, nao 500', async () => {
  await q(`UPDATE donations SET receipt_url='/uploads/receipts/receipt-perdido.pdf' WHERE id='${donationId}'`);
  const r = await baixa(`/api/uploads/receipt/${donationId}/arquivo`, tokenDe(donoId));
  igual(r.status, 404, 'status');
});

await teste('recibo de mecenato: gestor anexa apos confirmacao, dono baixa', async () => {
  await q(`UPDATE donations SET status='confirmed' WHERE id='${donationId}'`);
  const r = await envia(`/api/mecenato/${donationId}`, 'mecenato', tokenDe(gestorId), PDF, 'recibo.pdf');
  igual(r.status, 200, 'status ' + JSON.stringify(r.corpo));
  const [d] = await q(`SELECT mecenato_url, mecenato_sha256, status FROM donations WHERE id='${donationId}'`);
  if (!/^mecenato\//.test(d.mecenato_url)) throw new Error('chave: ' + d.mecenato_url);
  igual(d.mecenato_sha256, sha(PDF), 'sha256');
  igual(d.status, 'mecenato_issued', 'status');
  const b = await baixa(`/api/mecenato/${donationId}/arquivo`, tokenDe(donoId));
  igual(b.status, 200, 'download');
  igual(sha(b.corpo), sha(PDF), 'conteudo');
});

servidor.close();
fs.rmSync(pasta, { recursive: true, force: true });

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
