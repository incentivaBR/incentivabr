// Exercita a maquina de estados da conferencia contra um Postgres em memoria.
//
// O que importa aqui nao e "a query roda": e que os estados so andem para onde
// devem. Confirmar duas vezes nao pode reenviar aviso ao proponente; recusar
// nao pode matar a destinacao; e o UPDATE tem que ser a propria trava contra
// duas pessoas conferindo a mesma fila ao mesmo tempo.
import { newDb } from 'pg-mem';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const db = newDb();

db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});

db.public.none(`
  CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT,
    contact_email TEXT
  );
  CREATE TABLE users (encerrada_em TIMESTAMP, anonimizada_em TIMESTAMP, 
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT, cpf TEXT, email TEXT
  );
  CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    organization_id UUID REFERENCES organizations(id),
    donation_amount NUMERIC,
    fiscal_year INT,
    pronac TEXT,
    projeto_titulo TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    receipt_url TEXT,
    receipt_filename TEXT,
    confirmed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`);

const sql = fs.readFileSync(
  path.join(AQUI, '../src/migrations/029_conferencia_destinacao.sql'), 'utf8'
).replace(/^COMMENT ON[\s\S]*?;$/gm, '');

let ok = [], falhas = [];
const passo = (nome, fn) => {
  try { const r = fn(); ok.push(nome); return r; }
  catch (e) { falhas.push([nome, e.message]); return null; }
};

passo('migracao 029 aplica', () => db.public.none(sql));

const orgId = db.public.many(
  `INSERT INTO organizations (name, slug, contact_email)
   VALUES ('Casa Azul','casa-azul','contato@destineai.com.br') RETURNING id`)[0].id;
const userId = db.public.many(
  `INSERT INTO users (nome, cpf, email) VALUES ('Maria','12345678901','m@x.gov.br') RETURNING id`)[0].id;
const gestorId = db.public.many(
  `INSERT INTO users (nome, email) VALUES ('Gestor','g@casaazul.org') RETURNING id`)[0].id;

const nova = (status) => db.public.many(
  `INSERT INTO donations (user_id, organization_id, donation_amount, fiscal_year,
                          pronac, projeto_titulo, status, receipt_url, receipt_filename)
   VALUES ('${userId}','${orgId}',3200,2026,'2511274','Mostra Casa Azul','${status}',
           '/uploads/receipts/x.pdf','comprovante.pdf')
   RETURNING id`)[0].id;

// ── UPDATE da confirmacao ──────────────────────────────────────────────────
const confirmar = (id) => db.public.many(
  `UPDATE donations
      SET status = 'confirmed', confirmed_at = NOW(), confirmed_by = '${gestorId}',
          confirmation_note = 'extrato conferido',
          rejected_at = NULL, rejected_by = NULL, rejection_reason = NULL
    WHERE id = '${id}' AND status IN ('pending','awaiting_confirmation')
    RETURNING id, status, confirmed_at`);

passo('confirma a partir de awaiting_confirmation', () => {
  const id = nova('awaiting_confirmation');
  const r = confirmar(id);
  if (r.length !== 1) throw new Error('nao confirmou');
  if (r[0].status !== 'confirmed') throw new Error('estado errado: ' + r[0].status);
  if (!r[0].confirmed_at) throw new Error('confirmed_at vazio');
});

passo('confirma a partir de pending (transferencia conferida por fora)', () => {
  const id = nova('pending');
  if (confirmar(id).length !== 1) throw new Error('nao confirmou');
});

passo('confirmar de novo nao devolve linha (nao reenvia aviso)', () => {
  const id = nova('awaiting_confirmation');
  confirmar(id);
  const segunda = confirmar(id);
  if (segunda.length !== 0)
    throw new Error('segunda confirmacao passou — o proponente seria avisado duas vezes');
});

passo('nao confirma destinacao cancelada', () => {
  const id = nova('cancelled');
  if (confirmar(id).length !== 0) throw new Error('confirmou uma cancelada');
});

passo('nao confirma quando ja esta em awaiting_mecenato', () => {
  const id = nova('awaiting_mecenato');
  if (confirmar(id).length !== 0) throw new Error('reconfirmou apos o proponente ja avisado');
});

// ── UPDATE da recusa ───────────────────────────────────────────────────────
const recusar = (id, motivo) => db.public.many(
  `UPDATE donations
      SET status = 'pending', rejected_at = NOW(), rejected_by = '${gestorId}',
          rejection_reason = '${motivo}', receipt_url = NULL, receipt_filename = NULL
    WHERE id = '${id}' AND status = 'awaiting_confirmation'
    RETURNING id, status, rejection_reason, receipt_url`);

passo('recusa devolve para pending e guarda o motivo', () => {
  const id = nova('awaiting_confirmation');
  const r = recusar(id, 'Valor do comprovante nao confere com o declarado');
  if (r.length !== 1) throw new Error('nao recusou');
  if (r[0].status !== 'pending') throw new Error('estado errado: ' + r[0].status);
  if (!r[0].rejection_reason) throw new Error('motivo perdido');
  if (r[0].receipt_url !== null) throw new Error('comprovante recusado continuou anexado');
});

passo('nao recusa o que ja foi confirmado', () => {
  const id = nova('awaiting_confirmation');
  confirmar(id);
  if (recusar(id, 'tarde demais').length !== 0)
    throw new Error('recusou uma destinacao ja confirmada');
});

passo('confirmar depois de recusar limpa a recusa', () => {
  const id = nova('awaiting_confirmation');
  recusar(id, 'comprovante ilegivel');
  // destinador reenvia
  db.public.none(`UPDATE donations SET status='awaiting_confirmation',
                  receipt_url='/uploads/receipts/y.pdf' WHERE id='${id}'`);
  const r = confirmar(id);
  if (r.length !== 1) throw new Error('nao confirmou apos reenvio');
  const d = db.public.many(
    `SELECT rejection_reason, rejected_at FROM donations WHERE id='${id}'`)[0];
  if (d.rejection_reason || d.rejected_at)
    throw new Error('recusa antiga sobrou e o destinador veria um motivo obsoleto');
});

// ── fila de conferencia ────────────────────────────────────────────────────
passo('fila lista so o que aguarda conferencia', () => {
  const antes = db.public.many(
    `SELECT COUNT(*)::int AS n FROM donations WHERE status='awaiting_confirmation'`)[0].n;
  nova('awaiting_confirmation');
  nova('confirmed');
  nova('pending');
  const r = db.public.many(
    `SELECT d.id, d.donation_amount, d.pronac, d.receipt_filename, u.nome, u.cpf
       FROM donations d JOIN users u ON u.id = d.user_id
      WHERE d.organization_id = '${orgId}' AND d.status = 'awaiting_confirmation'
      ORDER BY d.created_at`);
  if (r.length !== antes + 1)
    throw new Error(`fila trouxe ${r.length}, esperado ${antes + 1}`);
  if (!r[0].cpf) throw new Error('fila sem o CPF — quem confere precisa comparar com o extrato');
});

// ── correcao do e-mail de contato ──────────────────────────────────────────
passo('migracao troca o contato do dominio aposentado', () => {
  db.public.none(`INSERT INTO organizations (name, slug, contact_email)
                  VALUES ('IncentivaBR','www','contato@destineai.com.br')`);
  db.public.none(`UPDATE organizations SET contact_email = 'contato@incentivabr.com.br'
                   WHERE slug = 'www' AND contact_email = 'contato@destineai.com.br'`);
  const www = db.public.many(`SELECT contact_email FROM organizations WHERE slug='www'`)[0];
  if (www.contact_email !== 'contato@incentivabr.com.br')
    throw new Error('nao trocou: ' + www.contact_email);
  const outra = db.public.many(`SELECT contact_email FROM organizations WHERE slug='casa-azul'`)[0];
  if (outra.contact_email !== 'contato@destineai.com.br')
    throw new Error('mexeu em organizacao que nao era para mexer');
});

console.log('\n' + '='.repeat(62));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(62));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
