// O mecanismo de incentivo é do cliente, não constante do código.
//
// Quatro rotas escolhiam o mecanismo lendo `org.incentive_group_code`, com
// reserva 'ROUANET'. A coluna não existia: `req.organization` vem de
// `SELECT *`, então a leitura era sempre undefined e todo cliente caía na
// reserva. O interruptor foi desenhado e nunca ligado (migration 043).
//
// O que estes testes guardam:
//   - a escolha do mecanismo tem uma fonte só (`lib/mecanismos.js`), e o
//     literal 'ROUANET' não volta a aparecer espalhado pelas rotas;
//   - um cliente com mecanismo próprio recebe o teto DELE;
//   - mecanismo sem teto resolvido é recusado ao criar e ao editar cliente —
//     `tetoDoMecanismo()` cairia no teto global de 6%, permissivo demais
//     para quase todos, e o erro seria liberar acima da lei;
//   - o catálogo mostra os bloqueados com o motivo, em vez de escondê-los;
//   - a marca (/api/config/brand) diz qual mecanismo o site está operando,
//     para a página não escrever "Rouanet" à mão.
import { newDb } from 'pg-mem';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'teste';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');

const db = newDb();
db.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID() });
db.public.none(`
  CREATE TABLE laws (
    slug TEXT PRIMARY KEY, name TEXT, nickname TEXT, base_legal TEXT,
    orgao TEXT, sistema_oficial TEXT, sistema_url TEXT, max_pf_percent NUMERIC
  );
  CREATE TABLE incentive_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL, name TEXT, max_percentage NUMERIC,
    period_type TEXT, description TEXT, teto_codigo TEXT, law_slug TEXT,
    disponivel_para_cliente BOOLEAN NOT NULL DEFAULT FALSE,
    motivo_indisponivel TEXT
  );
  CREATE TABLE tetos_deducao (
    codigo TEXT PRIMARY KEY, descricao TEXT, percentual NUMERIC, base_legal TEXT,
    vigencia_inicio DATE, vigencia_fim DATE, confirmado_por_parecer BOOLEAN, observacao TEXT
  );
  CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT, slug TEXT, contact_email TEXT, primary_color TEXT, secondary_color TEXT,
    plan_type TEXT, fund_type TEXT, fund_name TEXT, max_percentage NUMERIC,
    custom_domain TEXT, website_url TEXT, cnpj TEXT, contact_phone TEXT, logo_url TEXT,
    hero_titulo TEXT, hero_subtitulo TEXT, sobre TEXT,
    encarregado_nome TEXT, encarregado_email TEXT,
    govbr_client_id TEXT, govbr_client_secret TEXT, govbr_redirect_uri TEXT,
    incentive_group_code TEXT NOT NULL DEFAULT 'rouanet',
    is_active BOOLEAN DEFAULT true, contracted_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), nome TEXT,
    organization_id UUID, is_superadmin BOOLEAN DEFAULT false, cpf TEXT, encerrada_em TIMESTAMP);
  CREATE TABLE donations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID,
    donation_amount NUMERIC, fiscal_year INT, status TEXT, official_fund_id UUID);
  CREATE TABLE official_funds (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incentive_group_id UUID);
  CREATE TABLE audit_log (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID,
    user_id UUID, action TEXT, entity_type TEXT, entity_id UUID, details TEXT,
    ip_address TEXT, user_agent TEXT, created_at TIMESTAMP DEFAULT NOW());

  INSERT INTO tetos_deducao (codigo, descricao, percentual, base_legal, vigencia_inicio, confirmado_por_parecer)
  VALUES ('irpf_global_6','Teto global do IRPF',6.00,'Lei 9.532/1997, art. 22','1998-01-01',false),
         ('teste_3','Teto de teste, metade do global',3.00,'só para o teste','1998-01-01',false);

  INSERT INTO laws (slug, name, nickname, base_legal, orgao, sistema_oficial, max_pf_percent)
  VALUES ('rouanet','Lei Rouanet',NULL,'Lei 8.313/1991','Ministério da Cultura (MinC)','SALIC',6.00),
         ('idoso','Fundo dos Direitos da Pessoa Idosa','Fundo do Idoso','Lei 12.213/2010','Conselhos','—',6.00),
         ('pronon','PRONON','PRONON','Lei 12.715/2012','Ministério da Saúde','Transferegov',1.00);

  INSERT INTO incentive_groups (code, name, max_percentage, teto_codigo, law_slug, disponivel_para_cliente, motivo_indisponivel)
  VALUES ('rouanet','Lei Rouanet — Incentivo à Cultura',6.00,'irpf_global_6','rouanet',true,NULL),
         ('idoso','Fundo do Idoso',6.00,NULL,'idoso',false,'Item 11 da consulta ao tributarista.'),
         ('pronon','PRONON',1.00,NULL,'pronon',false,'Item 3 da consulta ao tributarista.'),
         -- Um mecanismo liberado e com teto PRÓPRIO, para provar que o teto
         -- segue o cliente e não é sempre o global.
         ('meia-cultura','Mecanismo de teste, teto de 3%',3.00,'teste_3','rouanet',true,NULL);

  INSERT INTO organizations (name, slug, incentive_group_code)
  VALUES ('IncentivaBR','www','rouanet'),
         ('Casa Azul','casa-azul','rouanet'),
         ('Cliente de Teste','meia','meia-cultura');
`);
const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });
const q = async (sql, p) => (await poolFalso.query(sql, p)).rows;

const {
  MECANISMO_PADRAO, codigoDoMecanismo, mecanismoDaOrg, mecanismosDisponiveis, podeSerDoCliente
} = await import('../src/lib/mecanismos.js');
const { tetoDoMecanismo, limpaCache } = await import('../src/lib/tetos.js');
const { default: admin } = await import('../src/routes/admin.js');
const { default: config } = await import('../src/routes/config.js');

const [www]  = await q(`SELECT * FROM organizations WHERE slug='www'`);
const [meia] = await q(`SELECT * FROM organizations WHERE slug='meia'`);
const [chefe] = await q(
  `INSERT INTO users (nome, organization_id, is_superadmin) VALUES ('Chefe',$1,true) RETURNING id`, [www.id]);

let orgDaRequisicao = www;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.organization = orgDaRequisicao; req.tenantSlug = orgDaRequisicao.slug; next(); });
app.use('/api/admin', admin);
app.use('/api/config', config);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;
const token = jwt.sign({ userId: chefe.id, isSuperadmin: true }, 'teste', { expiresIn: '1h' });
const pedir = async (metodo, caminho, corpo) => {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  return [r.status, await r.json()];
};

const ok = [], falhas = [];
const teste = async (nome, fn) => { try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); } };
const igual = (a, b, msg) => { if (a !== b) throw new Error(`${msg || ''} esperava ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };

// ── a fonte única ───────────────────────────────────────────────────────────
await teste('codigoDoMecanismo devolve o do cliente, e o padrao quando nao ha', () => {
  igual(codigoDoMecanismo({ incentive_group_code: 'idoso' }), 'idoso');
  igual(codigoDoMecanismo({ incentive_group_code: '  rouanet  ' }), 'rouanet', 'com espaco');
  igual(codigoDoMecanismo(null), MECANISMO_PADRAO, 'sem organizacao');
  igual(codigoDoMecanismo({}), MECANISMO_PADRAO, 'organizacao sem a coluna');
  igual(codigoDoMecanismo({ incentive_group_code: '   ' }), MECANISMO_PADRAO, 'so espaco');
  igual(MECANISMO_PADRAO, 'rouanet', 'o padrao e minusculo, como o catalogo grava');
});

await teste('as rotas nao repetem mais o literal ROUANET', () => {
  // Era 'ROUANET' em maiuscula em quatro arquivos — e o catalogo grava em
  // minuscula. Duas formas de errar a mesma decisao.
  const arquivos = ['src/lib/textosFiscais.js', 'src/routes/calculator.js',
                    'src/routes/donations.js', 'src/routes/config.js'];
  for (const a of arquivos) {
    const texto = fs.readFileSync(path.join(RAIZ, 'backend', a), 'utf8');
    if (/'ROUANET'|"ROUANET"/.test(texto)) throw new Error(`${a} ainda escreve 'ROUANET' a mao`);
    if (!texto.includes('codigoDoMecanismo')) throw new Error(`${a} nao usa a fonte unica`);
  }
});

// ── o teto segue o cliente ──────────────────────────────────────────────────
await teste('o teto do cliente e o do mecanismo DELE, nao o global sempre', async () => {
  limpaCache();
  const daCasa = await tetoDoMecanismo(codigoDoMecanismo({ incentive_group_code: 'rouanet' }));
  igual(daCasa.percentual, 6, 'rouanet');
  const daMeia = await tetoDoMecanismo(codigoDoMecanismo(meia));
  igual(daMeia.percentual, 3, 'o cliente de teto proprio');
  igual(daMeia.codigo, 'teste_3');
});

await teste('mecanismo sem teto declarado cai no global — errar para menos', async () => {
  limpaCache();
  const t = await tetoDoMecanismo('pronon');
  igual(t.codigo, 'irpf_global_6', 'sem teto_codigo, volta ao global');
  // E e justamente por isso que ele nao pode ser atribuido a um cliente:
  // 6% seria seis vezes o 1% do PRONON.
  const pode = await podeSerDoCliente('pronon');
  igual(pode.ok, false);
});

await teste('mecanismoDaOrg junta o calculo com a lei (orgao, base legal)', async () => {
  const m = await mecanismoDaOrg({ incentive_group_code: 'rouanet' });
  igual(m.code, 'rouanet');
  igual(m.base_legal, 'Lei 8.313/1991');
  igual(m.orgao, 'Ministério da Cultura (MinC)');
  igual(m.sistema_oficial, 'SALIC');
});

// ── o que pode e o que nao pode ir para um cliente ──────────────────────────
await teste('podeSerDoCliente: libera o resolvido, recusa o pendente e o inexistente', async () => {
  igual((await podeSerDoCliente('rouanet')).ok, true);
  const idoso = await podeSerDoCliente('idoso');
  igual(idoso.ok, false);
  if (!/Item 11/.test(idoso.motivo)) throw new Error('o motivo nao diz o que falta: ' + idoso.motivo);
  const nada = await podeSerDoCliente('inventado');
  igual(nada.ok, false);
  if (!/desconhecido/i.test(nada.motivo)) throw new Error(nada.motivo);
  igual((await podeSerDoCliente('')).ok, false, 'vazio');
});

await teste('o catalogo mostra os bloqueados, com o motivo', async () => {
  const lista = await mecanismosDisponiveis();
  if (lista.length < 4) throw new Error('catalogo curto: ' + lista.length);
  igual(lista[0].disponivel_para_cliente, true, 'os liberados vem primeiro');
  const bloqueados = lista.filter(m => !m.disponivel_para_cliente);
  if (!bloqueados.length) throw new Error('nenhum bloqueado aparece');
  for (const b of bloqueados) {
    if (!b.motivo_indisponivel) throw new Error(`${b.code} bloqueado sem motivo escrito`);
  }
});

// ── a tela do superadmin ────────────────────────────────────────────────────
await teste('GET /api/admin/mecanismos lista tudo', async () => {
  const [status, corpo] = await pedir('GET', '/api/admin/mecanismos');
  igual(status, 200, corpo.message);
  if (!corpo.mecanismos.some(m => m.code === 'idoso')) throw new Error('o Fundo do Idoso sumiu da lista');
});

await teste('criar cliente com mecanismo pendente e recusado', async () => {
  const [status, corpo] = await pedir('POST', '/api/admin/orgs',
    { name: 'Cliente Idoso', slug: 'cliente-idoso', incentive_group_code: 'idoso' });
  igual(status, 400, 'status');
  if (!/Item 11/.test(corpo.message)) throw new Error('mensagem sem o motivo: ' + corpo.message);
  igual((await q(`SELECT 1 FROM organizations WHERE slug='cliente-idoso'`)).length, 0, 'nao gravou');
});

await teste('criar cliente com mecanismo liberado grava o mecanismo', async () => {
  const [status, corpo] = await pedir('POST', '/api/admin/orgs',
    { name: 'Cliente Meia', slug: 'cliente-meia', incentive_group_code: 'meia-cultura' });
  igual(status, 201, corpo.message);
  igual(corpo.org.incentive_group_code, 'meia-cultura');
});

await teste('criar cliente sem informar mecanismo cai no padrao', async () => {
  const [status, corpo] = await pedir('POST', '/api/admin/orgs', { name: 'Padrao', slug: 'padrao' });
  igual(status, 201, corpo.message);
  igual(corpo.org.incentive_group_code, MECANISMO_PADRAO);
});

await teste('editar para um mecanismo pendente e recusado, e nao muda o que ja estava', async () => {
  const [alvo] = await q(`SELECT id, incentive_group_code FROM organizations WHERE slug='cliente-meia'`);
  const [status] = await pedir('PUT', `/api/admin/orgs/${alvo.id}`, { incentive_group_code: 'pronon' });
  igual(status, 400);
  const [depois] = await q(`SELECT incentive_group_code FROM organizations WHERE id=$1`, [alvo.id]);
  igual(depois.incentive_group_code, 'meia-cultura', 'o mecanismo anterior ficou');
});

await teste('editar sem mencionar o mecanismo nao mexe nele', async () => {
  const [alvo] = await q(`SELECT id FROM organizations WHERE slug='cliente-meia'`);
  const [status] = await pedir('PUT', `/api/admin/orgs/${alvo.id}`, { name: 'Outro nome' });
  igual(status, 200);
  const [depois] = await q(`SELECT incentive_group_code, name FROM organizations WHERE id=$1`, [alvo.id]);
  igual(depois.incentive_group_code, 'meia-cultura');
  igual(depois.name, 'Outro nome');
});

// ── a marca diz qual lei o site opera ───────────────────────────────────────
await teste('/api/config/brand traz o mecanismo do tenant', async () => {
  orgDaRequisicao = meia;
  try {
    // A rota devolve a marca direto, sem embrulho.
    const [status, marca] = await pedir('GET', '/api/config/brand');
    igual(status, 200, marca.message);
    igual(marca.mecanismo.codigo, 'meia-cultura');
    igual(marca.mecanismo.orgao, 'Ministério da Cultura (MinC)', 'o orgao vem de laws');
    igual(marca.teto_percentual, 3, 'o teto da marca acompanha o mecanismo');
  } finally { orgDaRequisicao = www; }
});

// ── a tela ──────────────────────────────────────────────────────────────────
await teste('a tela de clientes oferece o seletor e o manda ao servidor', () => {
  const tela = fs.readFileSync(path.join(RAIZ, 'frontend/admin-clientes.html'), 'utf8');
  for (const t of ['id="cMecanismo"', '/api/admin/mecanismos', 'incentive_group_code: el(\'cMecanismo\').value']) {
    if (!tela.includes(t)) throw new Error('admin-clientes.html sem ' + t);
  }
});

await teste('a migration 043 cria a coluna que o codigo lia', () => {
  const sql = fs.readFileSync(path.join(RAIZ, 'backend/src/migrations/043_mecanismo_por_cliente.sql'), 'utf8');
  for (const t of ['incentive_group_code', 'disponivel_para_cliente', 'law_slug']) {
    if (!sql.includes(t)) throw new Error('043 sem ' + t);
  }
});

await teste('a migration 044 corrige o 3%/6% invertido e renomeia o motivo', () => {
  const sql = fs.readFileSync(path.join(RAIZ, 'backend/src/migrations/044_fdca_idoso_teto_corrigido.sql'), 'utf8');
  if (!/RENAME COLUMN pendencia_parecer TO motivo_indisponivel/.test(sql)) {
    throw new Error('044 nao renomeia a coluna');
  }
  // O teto de FDCA e Idoso e o global de 6% durante o ano — os 3% sao a via
  // do art. 260-A, que esta plataforma nao opera. O catalogo dizia o inverso.
  if (!/teto_codigo = 'irpf_global_6'[\s\S]{0,400}'fia', 'idoso'/.test(sql)) {
    throw new Error('044 nao aponta fia/idoso para o teto global');
  }
  if (!/260-A/.test(sql)) throw new Error('044 nao registra de onde vem os 3%');
});

await teste('o que a 044 GRAVA no banco nao repete o 3%/6% invertido', () => {
  // "destinação durante o ano até 3%" foi semeado na 018 e repetido na 043.
  // A guarda olha o que a migration AFIRMA — as linhas de SQL —, nao os
  // comentarios, que precisam citar o texto errado para explicar a correcao.
  const sql = fs.readFileSync(path.join(RAIZ, 'backend/src/migrations/044_fdca_idoso_teto_corrigido.sql'), 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  const invertido = /durante o ano[^.]{0,40}at[ée] 3%|Destina[çc][ãa]o 3% no ano-calend/i;
  if (invertido.test(sql)) throw new Error('a 044 grava o 3% durante o ano');
  // E grava o certo: 6% durante o ano, no teto compartilhado.
  if (!/6% durante o ano/.test(sql)) throw new Error('a 044 nao grava o 6% durante o ano');
});

servidor.close();
console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
