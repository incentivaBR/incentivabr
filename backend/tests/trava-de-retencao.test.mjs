// A trava de retenção: o prazo não corre enquanto houver processo em aberto.
//
// `anoFinalDaGuarda()` diz até quando guardar, e /api/admin/retencao lista o
// que já passou. Hoje isso é só uma lista — nada apaga por prazo. Mas é o
// rascunho da fila de eliminação: quando a rotina for ligada, ela vai agir
// sobre exatamente estas linhas, e apagar o comprovante de alguém no meio de
// uma fiscalização destrói a prova de quem a plataforma deveria proteger.
//
// O que estes testes guardam:
//   - o prazo termina em 31/12, não em 1º de janeiro: a diferença é um ano
//     inteiro de documento apagado cedo demais;
//   - conta travada nunca aparece como vencida, e aparece na lista própria;
//   - travar exige motivo escrito — trava sem motivo vira trava eterna;
//   - travar e destravar ficam no audit_log, com dono;
//   - a rota continua sem apagar nada.
import { newDb } from 'pg-mem';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'teste';

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};
const igual = (a, b, o) => {
  if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
};

// ── o cálculo do prazo, sem banco ──────────────────────────────────────────
const { anoFinalDaGuarda, dataFinalDaGuarda, guardaVencida } =
  await import('../src/config/lgpd.js');

await teste('o prazo de um ano-base termina em 31/12 do ano final, nao no dia 1º', () => {
  igual(anoFinalDaGuarda(2026), 2032, 'ano final de 2026');

  const fim = dataFinalDaGuarda(2026);
  igual(fim.getUTCFullYear(), 2032, 'ano');
  igual(fim.getUTCMonth(), 11, 'mes (0-based: 11 = dezembro)');
  igual(fim.getUTCDate(), 31, 'dia');

  // O ponto todo: durante 2032 ainda está na guarda.
  igual(guardaVencida(2026, new Date('2032-01-01T00:00:00Z')), false, '1º de janeiro de 2032');
  igual(guardaVencida(2026, new Date('2032-07-15T00:00:00Z')), false, 'meio de 2032');
  igual(guardaVencida(2026, new Date('2033-01-01T00:00:00Z')), true, '1º de janeiro de 2033');
});

// ── a rota ─────────────────────────────────────────────────────────────────
const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});
db.public.none(`
  CREATE TABLE organizations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, slug TEXT);
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT, email TEXT, senha_hash TEXT,
    is_superadmin BOOLEAN DEFAULT false,
    encerrada_em TIMESTAMP, anonimizada_em TIMESTAMP,
    retencao_travada_em TIMESTAMP, retencao_travada_motivo TEXT, retencao_travada_por UUID
  );
  CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, fiscal_year INT, amount NUMERIC
  );
  CREATE TABLE subscribers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anonymized_at TIMESTAMP, last_interaction_at TIMESTAMP);
  -- migration 051: mecanismoDaOrg() junta laws para o vocabulario do mecanismo.
  CREATE TABLE laws (slug TEXT PRIMARY KEY, name TEXT, base_legal TEXT, orgao TEXT,
    sistema_oficial TEXT, sistema_url TEXT,
    termo_identificador TEXT, termo_beneficiario TEXT, termo_recibo TEXT, termo_recibo_emissor TEXT);
  CREATE TABLE incentive_groups (code TEXT, name TEXT, teto_codigo TEXT,
    disponivel_para_cliente BOOLEAN DEFAULT false, motivo_indisponivel TEXT, law_slug TEXT,
    -- migration 051: o que identifica a destinacao neste mecanismo.
    identificador TEXT DEFAULT 'projeto_do_tenant',
    sublimite_pct NUMERIC,
    sublimite_base_legal TEXT
  );
  CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, user_id UUID, action TEXT, entity_type TEXT, entity_id TEXT,
    details JSONB, ip_address TEXT, user_agent TEXT, created_at TIMESTAMP DEFAULT NOW()
  );
`);

const pgMem = db.adapters.createPg();
const pool = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => pool.query(...a);
poolReal.connect = async () => ({ query: (...a) => pool.query(...a), release() {} });

// Um ano-base seguramente vencido e um seguramente em guarda.
const anoAtual = new Date().getFullYear();
const anoVencido = anoAtual - 10;   // guarda terminou ha muito
const anoEmGuarda = anoAtual - 1;   // guarda vai ate anoAtual + 5

const { rows: [chefe] } = await pool.query(
  `INSERT INTO users (nome, email, is_superadmin) VALUES ('Chefe','chefe@x','t') RETURNING id`);

async function contaEncerradaCom(anoBase) {
  const { rows: [u] } = await pool.query(
    `INSERT INTO users (nome, email, encerrada_em) VALUES ('Fulana','f@x', NOW()) RETURNING id`);
  await pool.query(
    `INSERT INTO donations (user_id, fiscal_year, amount) VALUES ($1, $2, 100)`, [u.id, anoBase]);
  return u.id;
}

const idVencida  = await contaEncerradaCom(anoVencido);
const idEmGuarda = await contaEncerradaCom(anoEmGuarda);

const { default: adminRoutes } = await import('../src/routes/admin.js');
const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;
// `requireSuperadmin` le req.user.isSuperadmin, e authenticateToken devolve o
// proprio conteudo do token: a chave tem de ser camelCase.
const cracha = jwt.sign({ userId: chefe.id, isSuperadmin: true }, 'teste');
const chama = (metodo, rota, corpo) => fetch(base + rota, {
  method: metodo,
  headers: { Authorization: `Bearer ${cracha}`, 'Content-Type': 'application/json' },
  body: corpo ? JSON.stringify(corpo) : undefined
});

await teste('sem trava, a conta vencida aparece na fila e a outra nao', async () => {
  const r = await (await chama('GET', '/api/admin/retencao')).json();
  igual(r.status, 'success', 'status');
  const ids = r.contas_encerradas_vencidas.map(c => c.id);
  if (!ids.includes(idVencida))  throw new Error('a conta vencida nao apareceu na fila');
  if (ids.includes(idEmGuarda))  throw new Error('conta ainda em guarda apareceu como vencida');
  igual(r.contas_travadas.length, 0, 'nenhuma travada ainda');
  igual(r.apaga_automaticamente, false, 'a rota nao apaga');
  igual(r.regra.anonimizar_alcanca_arquivos, true, 'anonimizar tem de alcancar os arquivos');
});

await teste('travar sem motivo escrito e recusado', async () => {
  igual((await chama('POST', `/api/admin/retencao/${idVencida}/travar`, {})).status, 400, 'sem motivo');
  igual((await chama('POST', `/api/admin/retencao/${idVencida}/travar`, { motivo: 'processo' })).status,
        400, 'motivo curto demais');

  const { rows } = await pool.query('SELECT retencao_travada_em FROM users WHERE id = $1', [idVencida]);
  igual(rows[0].retencao_travada_em, null, 'nada travou');
});

await teste('travada sai da fila de vencidas e entra na lista propria, com o motivo', async () => {
  const motivo = 'Intimacao 123/2026 da Receita Federal sobre o ano-base';
  igual((await chama('POST', `/api/admin/retencao/${idVencida}/travar`, { motivo })).status, 200, 'travou');

  const r = await (await chama('GET', '/api/admin/retencao')).json();
  const vencidas = r.contas_encerradas_vencidas.map(c => c.id);
  if (vencidas.includes(idVencida)) throw new Error('conta travada continuou na fila de vencidas');

  const travada = r.contas_travadas.find(c => c.id === idVencida);
  if (!travada) throw new Error('conta travada nao apareceu na lista propria');
  igual(travada.motivo, motivo, 'motivo');
  if (!travada.travada_em) throw new Error('faltou a data da trava');
});

await teste('a trava tem dono e fica no audit_log', async () => {
  const { rows } = await pool.query(
    `SELECT user_id, entity_id, details FROM audit_log WHERE action = 'retencao.travada'`);
  igual(rows.length, 1, 'um registro');
  igual(rows[0].user_id, chefe.id, 'quem travou');
  igual(rows[0].entity_id, idVencida, 'quem foi travada');

  const { rows: quem } = await pool.query(
    'SELECT retencao_travada_por FROM users WHERE id = $1', [idVencida]);
  igual(quem[0].retencao_travada_por, chefe.id, 'a coluna tambem guarda o dono');
});

await teste('destravar devolve a conta a fila, sem apagar nada', async () => {
  igual((await chama('DELETE', `/api/admin/retencao/${idVencida}/travar`)).status, 200, 'destravou');

  const r = await (await chama('GET', '/api/admin/retencao')).json();
  if (!r.contas_encerradas_vencidas.map(c => c.id).includes(idVencida)) {
    throw new Error('a conta nao voltou para a fila depois de destravada');
  }
  igual(r.contas_travadas.length, 0, 'nao ha mais travadas');

  // Destravar nao e apagar: a destinacao continua la.
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM donations WHERE user_id = $1', [idVencida]);
  igual(rows[0].n, 1, 'a destinacao continua');

  const { rows: log } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'retencao.destravada'`);
  igual(log[0].n, 1, 'destravar tambem fica no log');
});

await teste('destravar o que nao estava travado responde 404', async () => {
  igual((await chama('DELETE', `/api/admin/retencao/${idEmGuarda}/travar`)).status, 404, 'nao estava travada');
});

servidor.close();

console.log('\nTrava de retenção\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
