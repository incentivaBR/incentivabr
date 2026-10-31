// Achar os documentos que a plataforma gerou.
//
// O PROBLEMA
//
// Toda rota de documento é POR DESTINAÇÃO (`/:id/arquivo`): para baixar um
// comprovante é preciso já saber o id dele. Quem destina chega pelo painel,
// que lista as destinações dele. Quem administra a organização não tinha
// caminho nenhum — `/conferencia` mostra só o que aguarda conferência, e
// `/resultado` dá totais, não a lista.
//
// Aparece na hora em que o contador pede os documentos do ano: não havia onde
// encontrá-los.
//
// O QUE ESTA ROTA NÃO É
//
// Ela não faz prestação de contas, e não deve prometer isso. Entrega a lista e
// os links para quem vai fazer. O conteúdo dos arquivos continua saindo pelas
// rotas autenticadas que já existem, uma a uma.
//
// O QUE ESTES TESTES TRAVAM
//
//   - escopo: só a organização de quem pede, e só quem a administra;
//   - cancelada não entra — não é documento de nada;
//   - o ensaio aparece MARCADO, nunca escondido nem misturado;
//   - os filtros (ano, situação, com documento) e a recusa de valor inventado;
//   - o CSV não vira fórmula na máquina de quem abre.
import { newDb, DataType } from 'pg-mem';
import express from 'express';
import jwt from 'jsonwebtoken';
import http from 'http';

process.env.JWT_SECRET = 'teste';
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
db.public.registerFunction({
  name: 'pg_advisory_xact_lock', args: [DataType.bigint], returns: DataType.bool,
  impure: true, implementation: () => true
});

db.public.none(`
  CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, slug TEXT,
    contact_email TEXT, mecenato_prazo_dias INT DEFAULT 10
  );
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), nome TEXT, cpf TEXT, email TEXT,
    total_donated NUMERIC DEFAULT 0, encerrada_em TIMESTAMP, anonimizada_em TIMESTAMP
  );
  CREATE TABLE organization_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, user_id UUID, role TEXT, is_active BOOLEAN DEFAULT true
  );
  CREATE TABLE org_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID,
    pronac TEXT, titulo TEXT, is_active BOOLEAN DEFAULT true, is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    valor_autorizado NUMERIC, valor_captado NUMERIC,
    captacao_inicio DATE, captacao_fim DATE, valores_em DATE
  );
  CREATE TABLE laws (slug TEXT PRIMARY KEY, name TEXT, base_legal TEXT, orgao TEXT,
    sistema_oficial TEXT, sistema_url TEXT, termo_identificador TEXT,
    termo_beneficiario TEXT, termo_recibo TEXT, termo_recibo_emissor TEXT);
  CREATE TABLE incentive_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT UNIQUE, name TEXT,
    teto_codigo TEXT, law_slug TEXT, identificador TEXT DEFAULT 'projeto_do_tenant',
    sublimite_pct NUMERIC, disponivel_para_cliente BOOLEAN DEFAULT false, motivo_indisponivel TEXT);
  CREATE TABLE tetos_deducao (
    codigo TEXT PRIMARY KEY, descricao TEXT, percentual NUMERIC(5,2),
    base_legal TEXT, vigencia_inicio DATE, vigencia_fim DATE,
    confirmado_por_parecer BOOLEAN DEFAULT FALSE, observacao TEXT);
  CREATE TABLE official_funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incentive_group_id UUID,
    code TEXT, name TEXT, prazo_comprovante_dias INT,
    prazo_comprovante_orgao TEXT, prazo_comprovante_base_legal TEXT);
  CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, organization_id UUID, official_fund_id UUID,
    donation_amount NUMERIC, ir_devido NUMERIC, fiscal_year INT,
    pronac TEXT, projeto_titulo TEXT, status TEXT DEFAULT 'pending',
    receipt_url TEXT, receipt_filename TEXT, receipt_file_path TEXT, receipt_sha256 TEXT,
    confirmed_at TIMESTAMP, confirmed_by UUID, confirmation_note TEXT,
    rejected_at TIMESTAMP, rejected_by UUID, rejection_reason TEXT,
    proponente_notified_at TIMESTAMP,
    mecenato_url TEXT, mecenato_filename TEXT, mecenato_sha256 TEXT, mecenato_issued_at TIMESTAMP,
    transferido_em DATE, created_at TIMESTAMP DEFAULT NOW(),
    simulada BOOLEAN DEFAULT false
  );
  INSERT INTO tetos_deducao (codigo, percentual, base_legal, vigencia_inicio)
    VALUES ('irpf_global_6', 6.00, 'Lei 9.532/1997, art. 22', '1998-01-01');
  INSERT INTO incentive_groups (code, name, teto_codigo, identificador)
    VALUES ('rouanet','Lei Rouanet','irpf_global_6','pronac');
`);

const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });

const { default: donationsRoutes } = await import('../src/routes/donations.js');

const q = async (sql, p) => (await poolFalso.query(sql, p)).rows;
const [{ id: orgId }] = await q(`INSERT INTO organizations (name, slug) VALUES ('Casa Azul','casa-azul') RETURNING id`);
const [{ id: outraOrg }] = await q(`INSERT INTO organizations (name, slug) VALUES ('Instituto Aurora','aurora') RETURNING id`);
const [{ id: gestorId }] = await q(`INSERT INTO users (nome, email) VALUES ('Gestora','g@casaazul.org') RETURNING id`);
const [{ id: estranhoId }] = await q(`INSERT INTO users (nome, email) VALUES ('Estranho','e@outro.org') RETURNING id`);
await q(`INSERT INTO organization_users (organization_id, user_id, role, is_active)
         VALUES ($1,$2,'org_admin',true)`, [orgId, gestorId]);

// O nome do contribuinte com uma fórmula dentro: é o que o CSV precisa neutralizar.
const NOME_FORMULA = '=HYPERLINK("http://mau.example","clique")';
const [{ id: ana }]   = await q(`INSERT INTO users (nome, cpf, email) VALUES ('Ana Lima','11111111111','ana@x.gov.br') RETURNING id`);
const [{ id: bruno }] = await q(`INSERT INTO users (nome, cpf, email) VALUES ($1,'22222222222','b@x.gov.br') RETURNING id`, [NOME_FORMULA]);

const destinacao = (o) => q(
  `INSERT INTO donations (user_id, organization_id, donation_amount, ir_devido, fiscal_year,
                          pronac, projeto_titulo, status, simulada,
                          receipt_url, receipt_filename, receipt_sha256,
                          mecenato_url, mecenato_filename, mecenato_sha256, mecenato_issued_at,
                          transferido_em, confirmed_at)
   VALUES ($1,$2,$3,$4,$5,'2511274','Mostra Casa Azul',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
   RETURNING id`,
  [o.pessoa, o.org || orgId, o.valor, o.valor / 0.06, o.ano || 2026, o.status, o.simulada === true,
   o.comprovante ? '/up/c.pdf' : null, o.comprovante ? 'comprovante.pdf' : null, o.comprovante ? 'abc123' : null,
   o.recibo ? '/up/r.pdf' : null, o.recibo ? 'recibo.pdf' : null, o.recibo ? 'def456' : null,
   o.recibo ? new Date('2026-03-10') : null,
   o.transferida || null, o.status === 'confirmed' || o.status === 'mecenato_issued' ? new Date('2026-02-01') : null]);

await destinacao({ pessoa: ana,   valor: 3000, status: 'mecenato_issued', comprovante: true, recibo: true, transferida: '2026-01-20' });
await destinacao({ pessoa: bruno, valor: 1500, status: 'confirmed',       comprovante: true, transferida: '2026-01-25' });
await destinacao({ pessoa: ana,   valor: 800,  status: 'pending' });
await destinacao({ pessoa: ana,   valor: 9000, status: 'cancelled',       comprovante: true });
await destinacao({ pessoa: bruno, valor: 4000, status: 'confirmed',       comprovante: true, simulada: true });
await destinacao({ pessoa: ana,   valor: 2200, status: 'confirmed',       comprovante: true, ano: 2025, transferida: '2025-11-03' });
await destinacao({ pessoa: ana,   valor: 7777, status: 'confirmed',       comprovante: true, org: outraOrg });

const tokenDe = (userId) => jwt.sign({ userId, orgId }, 'teste', { expiresIn: '1h' });

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.organization = { id: orgId }; next(); });
app.use('/api/donations', donationsRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

const pedir = async (caminho, token) => {
  const r = await fetch(base + caminho, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  const texto = await r.text();
  let corpo = {};
  try { corpo = JSON.parse(texto); } catch (_) { corpo = { texto }; }
  return { http: r.status, corpo, texto, tipo: r.headers.get('content-type') || '' };
};

// ═══════════════════════════════ PERMISSÃO ═══════════════════════════════

await teste('sem token, a lista nao responde', async () => {
  const { http } = await pedir('/api/donations/documentos', null);
  if (http !== 401 && http !== 403) throw new Error('respondeu ' + http);
});

await teste('quem nao administra a organizacao recebe 403', async () => {
  igual((await pedir('/api/donations/documentos', tokenDe(estranhoId))).http, 403, 'estranho');
  igual((await pedir('/api/donations/documentos.csv', tokenDe(estranhoId))).http, 403, 'estranho no csv');
});

// ═══════════════════════════════ ESCOPO ═══════════════════════════════

await teste('a lista traz as destinacoes da organizacao, e so dela', async () => {
  const { http, corpo } = await pedir('/api/donations/documentos', tokenDe(gestorId));
  igual(http, 200, 'status');
  // 7 criadas: uma cancelada e uma de outra organizacao ficam fora.
  igual(corpo.total, 5, 'quantas aparecem');
  const titulos = corpo.destinacoes.map(d => d.valor);
  if (titulos.includes(7777)) throw new Error('vazou destinacao de outro cliente');
});

await teste('cancelada nao entra — nao e documento de nada', async () => {
  const { corpo } = await pedir('/api/donations/documentos', tokenDe(gestorId));
  if (corpo.destinacoes.some(d => d.situacao === 'cancelled')) {
    throw new Error('a cancelada apareceu na lista');
  }
});

// ═══════════════════════════════ OS DOCUMENTOS ═══════════════════════════

await teste('cada linha diz quais documentos existem, e onde buscar', async () => {
  const { corpo } = await pedir('/api/donations/documentos', tokenDe(gestorId));
  const comRecibo = corpo.destinacoes.find(d => d.valor === 3000);
  if (!comRecibo.documentos.comprovante) throw new Error('comprovante ausente');
  if (!comRecibo.documentos.recibo) throw new Error('recibo ausente');
  igual(comRecibo.documentos.comprovante.url, `/api/uploads/receipt/${comRecibo.id}/arquivo`, 'link do comprovante');
  igual(comRecibo.documentos.recibo.url, `/api/mecenato/${comRecibo.id}/arquivo`, 'link do recibo');
  igual(comRecibo.documentos.comprovante.sha256, 'abc123', 'hash do comprovante');
  igual(comRecibo.documentos.recibo.emitido_em, '2026-03-10', 'data de emissao do recibo');
});

await teste('quem nao tem documento diz que nao tem, em vez de sumir', async () => {
  const { corpo } = await pedir('/api/donations/documentos', tokenDe(gestorId));
  const semNada = corpo.destinacoes.find(d => d.valor === 800);
  if (!semNada) throw new Error('a destinacao sem documento sumiu da lista');
  igual(semNada.documentos.comprovante, null, 'comprovante');
  igual(semNada.documentos.recibo, null, 'recibo');
});

await teste('o resumo conta o que existe e o que falta', async () => {
  const { corpo } = await pedir('/api/donations/documentos', tokenDe(gestorId));
  igual(corpo.resumo.com_comprovante, 4, 'com comprovante');
  igual(corpo.resumo.com_recibo, 1, 'com recibo');
  igual(corpo.resumo.sem_documento, 1, 'sem documento nenhum');
});

await teste('a rota NAO entrega o conteudo do arquivo', async () => {
  // A lista diz onde buscar; o arquivo sai pelas rotas autenticadas que ja
  // existem. Devolver bytes aqui driblaria a conferencia de permissao delas.
  const { texto } = await pedir('/api/donations/documentos', tokenDe(gestorId));
  if (/%PDF|base64,/i.test(texto)) throw new Error('a lista carrega conteudo de arquivo');
});

// ═══════════════════════════════ O ENSAIO ═══════════════════════════════

await teste('o ensaio aparece MARCADO, nem escondido nem misturado', async () => {
  const { corpo } = await pedir('/api/donations/documentos', tokenDe(gestorId));
  const ensaio = corpo.destinacoes.find(d => d.valor === 4000);
  if (!ensaio) throw new Error('a destinacao de ensaio sumiu da lista');
  igual(ensaio.simulada, true, 'marca do ensaio');
  const real = corpo.destinacoes.find(d => d.valor === 3000);
  igual(real.simulada, false, 'a real nao pode vir marcada');
});

// ═══════════════════════════════ FILTROS ═══════════════════════════════

await teste('filtra por ano, e lista os anos que existem', async () => {
  const { corpo } = await pedir('/api/donations/documentos?ano=2025', tokenDe(gestorId));
  igual(corpo.total, 1, 'de 2025');
  igual(corpo.destinacoes[0].valor, 2200, 'qual');
  const todos = await pedir('/api/donations/documentos', tokenDe(gestorId));
  igual(JSON.stringify(todos.corpo.anos), JSON.stringify([2026, 2025]), 'anos, do mais novo');
});

await teste('filtra por situacao, e ignora situacao inventada', async () => {
  const conf = await pedir('/api/donations/documentos?situacao=confirmed', tokenDe(gestorId));
  if (conf.corpo.destinacoes.some(d => d.situacao !== 'confirmed')) {
    throw new Error('o filtro de situacao deixou passar outra');
  }
  // Valor fora da lista conhecida nao vira consulta: devolve tudo.
  const inventada = await pedir('/api/donations/documentos?situacao=bananas', tokenDe(gestorId));
  igual(inventada.http, 200, 'situacao inventada');
  igual(inventada.corpo.total, 5, 'situacao inventada deve ser ignorada, nao filtrar');
});

await teste('filtra so o que ja tem documento', async () => {
  const { corpo } = await pedir('/api/donations/documentos?com_documento=sim', tokenDe(gestorId));
  igual(corpo.total, 4, 'com documento');
  if (corpo.destinacoes.some(d => !d.documentos.comprovante && !d.documentos.recibo)) {
    throw new Error('entrou destinacao sem documento nenhum');
  }
});

// ═══════════════════════════════ O CSV ═══════════════════════════════

await teste('o CSV sai como CSV, com cabecalho e BOM', async () => {
  const { http, texto, tipo } = await pedir('/api/donations/documentos.csv', tokenDe(gestorId));
  igual(http, 200, 'status');
  if (!/text\/csv/.test(tipo)) throw new Error('content-type: ' + tipo);

  // O BOM tem de ser conferido nos BYTES. `fetch().text()` decodifica UTF-8 e
  // REMOVE o BOM pelo caminho — procurá-lo na string acusaria a ausência de
  // algo que está lá. Foi o que este teste fez na primeira versão.
  const bytes = new Uint8Array(await (await fetch(base + '/api/donations/documentos.csv',
    { headers: { Authorization: 'Bearer ' + tokenDe(gestorId) } })).arrayBuffer());
  if (!(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF)) {
    throw new Error('sem BOM — o Excel abre o acento errado');
  }

  const linhas = texto.replace(/^﻿/, '').trim().split('\r\n');
  if (!/"ano","nome","cpf"/.test(linhas[0])) throw new Error('cabecalho: ' + linhas[0]);
  igual(linhas.length, 6, 'cabecalho + 5 destinacoes');
});

await teste('nome com formula nao vira formula na planilha', async () => {
  // O nome do contribuinte veio de um formulario. `=HYPERLINK(...)` executa
  // na maquina de quem abre o arquivo. Mesma licao da lista de interessados.
  const { texto } = await pedir('/api/donations/documentos.csv', tokenDe(gestorId));
  if (!texto.includes("\"'=HYPERLINK")) {
    throw new Error('o apostrofo de protecao nao entrou — a formula vai executar');
  }
});

await teste('o CSV leva o hash e marca o ensaio', async () => {
  const { texto } = await pedir('/api/donations/documentos.csv', tokenDe(gestorId));
  if (!texto.includes('abc123')) throw new Error('o hash do comprovante nao entrou');
  if (!texto.includes('def456')) throw new Error('o hash do recibo nao entrou');
  const linhaEnsaio = texto.split('\r\n').find(l => l.includes('4000,00'));
  if (!linhaEnsaio || !/"sim"/.test(linhaEnsaio)) {
    throw new Error('o ensaio nao esta marcado no CSV: ' + linhaEnsaio);
  }
});

await teste('o valor sai com virgula decimal, que e como a planilha le', async () => {
  const { texto } = await pedir('/api/donations/documentos.csv', tokenDe(gestorId));
  if (!texto.includes('3000,00')) throw new Error('valor sem virgula decimal');
});

await teste('o filtro vale no CSV tambem', async () => {
  const { texto } = await pedir('/api/donations/documentos.csv?ano=2025', tokenDe(gestorId));
  const linhas = texto.replace(/^﻿/, '').trim().split('\r\n');
  igual(linhas.length, 2, 'cabecalho + a unica de 2025');
});

servidor.close();
console.log('\nAchar os documentos que a plataforma gerou\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
