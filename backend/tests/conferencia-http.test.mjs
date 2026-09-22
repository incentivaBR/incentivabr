// Exercita as rotas de conferencia por HTTP, contra o Express de verdade.
//
// Os outros testes checam SQL. Este checa o que o cliente recebe: codigos de
// status, permissao, e a ordem de declaracao das rotas — /conferencia tem que
// ser fila, nao um identificador capturado por /:id.
//
// O banco e o pg-mem, injetado no lugar do pool via um adaptador minimo. Nao
// substitui o Postgres real, mas roda em qualquer maquina, sem servico.
import { newDb, DataType } from 'pg-mem';
import express from 'express';
import jwt from 'jsonwebtoken';
import http from 'http';

process.env.JWT_SECRET = 'teste';
process.env.NODE_ENV = 'test';

// ── banco em memoria ───────────────────────────────────────────────────────
const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});
// O lock por contribuinte da rota de registro (ver lib/tetos.js) nao existe
// no pg-mem: aqui e um no-op. A concorrencia real e conferida num Postgres.
db.public.registerFunction({
  name: 'pg_advisory_xact_lock', args: [DataType.bigint], returns: DataType.bool,
  impure: true, implementation: () => true
});

db.public.none(`
  CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT, slug TEXT, contact_email TEXT, contact_whatsapp TEXT,
    contact_person TEXT, mecenato_prazo_dias INT DEFAULT 10,
    primary_color TEXT, secondary_color TEXT, logo_url TEXT
  );
  CREATE TABLE users (encerrada_em TIMESTAMP, anonimizada_em TIMESTAMP, 
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT, cpf TEXT, email TEXT, phone TEXT,
    total_donated NUMERIC DEFAULT 0
  );
  CREATE TABLE org_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, pronac TEXT, titulo TEXT,
    proponente_nome TEXT, proponente_cnpj TEXT,
    bank_name TEXT, bank_code TEXT, bank_agency TEXT, bank_account TEXT,
    pix_key TEXT, pix_key_type TEXT,
    is_active BOOLEAN DEFAULT true, is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE incentive_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE, name TEXT, max_percentage NUMERIC(5,2),
    period_type TEXT, teto_codigo TEXT
  );
  CREATE TABLE tetos_deducao (
    codigo TEXT PRIMARY KEY, descricao TEXT, percentual NUMERIC(5,2),
    base_legal TEXT, vigencia_inicio DATE, vigencia_fim DATE,
    confirmado_por_parecer BOOLEAN DEFAULT FALSE, observacao TEXT
  );
  INSERT INTO tetos_deducao (codigo, descricao, percentual, base_legal, vigencia_inicio)
    VALUES ('irpf_global_6','Teto global',6.00,'Lei 9.532/1997, art. 22','1998-01-01');
  INSERT INTO incentive_groups (code, name, max_percentage, period_type, teto_codigo)
    VALUES ('ROUANET','Lei Rouanet',6.00,'annual','irpf_global_6');
  CREATE TABLE organization_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, user_id UUID, role TEXT, is_active BOOLEAN DEFAULT true
  );
  CREATE TABLE official_funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incentive_group_id UUID, code TEXT, name TEXT,
    -- migration 048: o prazo para apresentar o comprovante, por fundo.
    prazo_comprovante_dias INT, prazo_comprovante_orgao TEXT, prazo_comprovante_base_legal TEXT
  );
  CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, organization_id UUID, official_fund_id UUID,
    donation_amount NUMERIC, ir_devido NUMERIC, fiscal_year INT,
    pronac TEXT, projeto_titulo TEXT, status TEXT DEFAULT 'pending',
    receipt_url TEXT, receipt_filename TEXT, receipt_file_path TEXT,
    confirmed_at TIMESTAMP, proponente_notified_at TIMESTAMP,
    mecenato_url TEXT, mecenato_issued_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  );
  ALTER TABLE donations
    ADD COLUMN confirmed_by UUID,
    ADD COLUMN confirmation_note TEXT,
    ADD COLUMN rejected_at TIMESTAMP,
    ADD COLUMN rejected_by UUID,
    ADD COLUMN rejection_reason TEXT,
    -- migration 048: a data em que o dinheiro saiu, de onde correm os prazos.
    ADD COLUMN transferido_em DATE;
`);

const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();

// ── injeta o pool falso antes que as rotas carreguem o de verdade ─────────
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });

const { default: donationsRoutes, notificadores } = await import('../src/routes/donations.js');

// Troca o e-mail de confirmacao por um falso que so anota quem seria avisado.
const avisados = [];
notificadores.destinadorConfirmado = async (user, donation, project) => { avisados.push({ user, donation, project }); };

// ── dados ──────────────────────────────────────────────────────────────────
const q = async (sql) => (await poolFalso.query(sql)).rows;
const [{ id: orgId }] = await q(
  `INSERT INTO organizations (name, slug, contact_email) VALUES ('Casa Azul','casa-azul','x@y.org') RETURNING id`);
const [{ id: destinadorId }] = await q(
  `INSERT INTO users (nome, cpf, email) VALUES ('Maria','12345678901','m@x.gov.br') RETURNING id`);
const [{ id: gestorId }] = await q(
  `INSERT INTO users (nome, email) VALUES ('Gestor','g@casaazul.org') RETURNING id`);
const [{ id: estranhoId }] = await q(
  `INSERT INTO users (nome, email) VALUES ('Estranho','e@outro.org') RETURNING id`);
await q(`INSERT INTO organization_users (organization_id, user_id, role, is_active)
         VALUES ('${orgId}','${gestorId}','org_admin', true)`);
// Fora da simulacao, registrar exige projeto ativo com conta de captacao
// preenchida (ver conta-captacao.test.mjs). Os casos de POST abaixo precisam dela.
await q(`INSERT INTO org_projects (organization_id, pronac, titulo, proponente_nome, bank_name, bank_code, bank_agency, bank_account, is_active, is_featured)
         VALUES ('${orgId}','2511274','Mostra Casa Azul','Casa Azul','Banco do Brasil','001','1234-5','98.765-4',true,true)`);

const novaDestinacao = async (status = 'awaiting_confirmation') => (await q(
  `INSERT INTO donations (user_id, organization_id, donation_amount, ir_devido, fiscal_year,
                          pronac, projeto_titulo, status, receipt_url, receipt_filename)
   VALUES ('${destinadorId}','${orgId}',3200,208342,2026,'2511274','Mostra Casa Azul',
           '${status}','/uploads/receipts/x.pdf','comprovante.pdf') RETURNING id`))[0].id;

const tokenDe = (userId, extra = {}) =>
  jwt.sign({ userId, orgId, ...extra }, 'teste', { expiresIn: '1h' });

// ── servidor ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.organization = { id: orgId }; next(); });
app.use('/api/donations', donationsRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

const chamar = async (metodo, caminho, token, corpo) => {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};

// ── casos ──────────────────────────────────────────────────────────────────
const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); }
  catch (e) { falhas.push([nome, e.message]); }
};
const igual = (a, b, o) => { if (a !== b) throw new Error(`${o}: esperado ${b}, veio ${a}`); };

const tokenGestor = tokenDe(gestorId);
const tokenEstranho = tokenDe(estranhoId);
const tokenDestinador = tokenDe(destinadorId);

await teste('/conferencia e fila, nao capturada por /:id', async () => {
  const r = await chamar('GET', '/api/donations/conferencia', tokenGestor);
  igual(r.status, 200, 'status');
  if (!Array.isArray(r.corpo.aguardando)) throw new Error('sem lista — /:id capturou a rota');
});

await teste('sem token -> 401', async () => {
  const r = await chamar('GET', '/api/donations/conferencia', null);
  igual(r.status, 401, 'status');
});

await teste('quem nao administra a org -> 403', async () => {
  const r = await chamar('GET', '/api/donations/conferencia', tokenEstranho);
  igual(r.status, 403, 'status');
});

await teste('o proprio destinador nao confere a si mesmo -> 403', async () => {
  const id = await novaDestinacao();
  const r = await chamar('POST', `/api/donations/${id}/confirmar`, tokenDestinador);
  igual(r.status, 403, 'status');
});

await teste('fila traz CPF e valor para comparar com o extrato', async () => {
  await novaDestinacao();
  const r = await chamar('GET', '/api/donations/conferencia', tokenGestor);
  const item = r.corpo.aguardando[0];
  if (!item.cpf) throw new Error('sem CPF');
  if (!item.donation_amount) throw new Error('sem valor');
  if (!item.comprovante_url?.includes('/api/uploads/receipt/'))
    throw new Error('comprovante nao vem por caminho autenticado: ' + item.comprovante_url);
});

await teste('confirma e devolve a destinacao', async () => {
  const id = await novaDestinacao();
  const r = await chamar('POST', `/api/donations/${id}/confirmar`, tokenGestor, { observacao: 'conferido' });
  igual(r.status, 200, 'status');
  if (!r.corpo.donation?.confirmed_at) throw new Error('sem confirmed_at');
  const [d] = await q(`SELECT status, confirmed_by FROM donations WHERE id='${id}'`);
  if (!['confirmed', 'awaiting_mecenato'].includes(d.status))
    throw new Error('estado final inesperado: ' + d.status);
  if (d.confirmed_by !== gestorId) throw new Error('nao registrou quem confirmou');
});

await teste('confirmar avisa o destinador por e-mail, com valor e projeto', async () => {
  avisados.length = 0;
  const id = await novaDestinacao();
  await chamar('POST', `/api/donations/${id}/confirmar`, tokenGestor);
  // A notificacao nao e aguardada pela rota; da um tempo para ela rodar.
  for (let i = 0; i < 20 && !avisados.length; i++) await new Promise(r => setTimeout(r, 25));
  igual(avisados.length, 1, 'avisos');
  igual(avisados[0].user.email, 'm@x.gov.br', 'e-mail do destinador');
  igual(Number(avisados[0].donation.amount), 3200, 'valor');
  igual(avisados[0].project.title, 'Mostra Casa Azul', 'projeto');
});

await teste('confirmar duas vezes responde ja_confirmada, sem reprocessar', async () => {
  const id = await novaDestinacao();
  await chamar('POST', `/api/donations/${id}/confirmar`, tokenGestor);
  const r = await chamar('POST', `/api/donations/${id}/confirmar`, tokenGestor);
  igual(r.status, 200, 'status');
  igual(r.corpo.ja_confirmada, true, 'ja_confirmada');
});

await teste('recusa sem motivo -> 400', async () => {
  const id = await novaDestinacao();
  const r = await chamar('POST', `/api/donations/${id}/recusar`, tokenGestor, { motivo: 'nao' });
  igual(r.status, 400, 'status');
});

await teste('recusa devolve para pending com o motivo guardado', async () => {
  const id = await novaDestinacao();
  const r = await chamar('POST', `/api/donations/${id}/recusar`, tokenGestor,
    { motivo: 'O valor do comprovante nao confere com o declarado' });
  igual(r.status, 200, 'status');
  const [d] = await q(`SELECT status, rejection_reason, receipt_url FROM donations WHERE id='${id}'`);
  igual(d.status, 'pending', 'status no banco');
  if (!d.rejection_reason) throw new Error('motivo nao guardado');
  if (d.receipt_url !== null) throw new Error('comprovante recusado continuou anexado');
});

await teste('nao recusa o que ja foi confirmado -> 409', async () => {
  const id = await novaDestinacao();
  await chamar('POST', `/api/donations/${id}/confirmar`, tokenGestor);
  const r = await chamar('POST', `/api/donations/${id}/recusar`, tokenGestor,
    { motivo: 'mudei de ideia depois de confirmar' });
  igual(r.status, 409, 'status');
});

await teste('id invalido -> 400', async () => {
  const r = await chamar('POST', '/api/donations/nao-e-uuid/confirmar', tokenGestor);
  igual(r.status, 400, 'status');
});

await teste('destinacao inexistente -> 404', async () => {
  const r = await chamar('POST', '/api/donations/11111111-2222-3333-4444-555555555555/confirmar', tokenGestor);
  igual(r.status, 404, 'status');
});

await teste('a listagem do destinador mostra o motivo da recusa', async () => {
  const id = await novaDestinacao();
  await chamar('POST', `/api/donations/${id}/recusar`, tokenGestor,
    { motivo: 'Comprovante ilegivel — reenvie em PDF' });
  const r = await chamar('GET', '/api/donations?limit=50', tokenDestinador);
  igual(r.status, 200, 'status');
  const alvo = (r.corpo.donations || []).find(d => d.id === id);
  if (!alvo) throw new Error('destinacao nao apareceu na listagem');
  if (!alvo.recusa?.motivo)
    throw new Error('sem o motivo: a devolucao seria invisivel para quem transferiu');
});

// ── renomeacao de ir_total para ir_devido ──────────────────────────────────
//
// Cada caso usa um ano-calendario proprio: os testes anteriores ja acumularam
// destinacoes para 2026, e a verificacao de teto anual — corretamente — recusa
// o excedente.
await teste('POST aceita ir_devido', async () => {
  const r = await chamar('POST', '/api/donations/rouanet', tokenDestinador, {
    pronac: '2511274', projeto_titulo: 'Mostra', ir_devido: 100000,
    donation_amount: 5000, fiscal_year: 2030
  });
  if (r.status !== 201) throw new Error('status ' + r.status + ': ' + JSON.stringify(r.corpo));
  const [d] = await q(`SELECT ir_devido FROM donations WHERE id='${r.corpo.donation.id}'`);
  igual(Number(d.ir_devido), 100000, 'gravado no banco');
});

await teste('POST ainda aceita ir_total, para pagina em cache no deploy', async () => {
  const r = await chamar('POST', '/api/donations/rouanet', tokenDestinador, {
    pronac: '2511274', projeto_titulo: 'Mostra', ir_total: 100000,
    donation_amount: 900, fiscal_year: 2031
  });
  igual(r.status, 201, 'status');
  const [d] = await q(`SELECT ir_devido FROM donations WHERE id='${r.corpo.donation.id}'`);
  igual(Number(d.ir_devido), 100000, 'nome antigo caiu na coluna certa');
});

await teste('sem nenhum dos dois -> 400', async () => {
  const r = await chamar('POST', '/api/donations/rouanet', tokenDestinador, {
    pronac: '2511274', donation_amount: 100, fiscal_year: 2032
  });
  igual(r.status, 400, 'status');
});

await teste('a resposta usa ir_devido, nao o nome antigo', async () => {
  const r = await chamar('GET', '/api/donations?limit=5', tokenDestinador);
  const d = (r.corpo.donations || [])[0];
  if (!d) throw new Error('sem destinacoes para conferir');
  if (!('ir_devido' in d)) throw new Error('resposta sem ir_devido');
  if ('ir_total' in d) throw new Error('resposta ainda expoe ir_total');
});

servidor.close();

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
