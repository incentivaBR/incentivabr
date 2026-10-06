// O que entrou pela plataforma — o número que o cliente contratou para ver.
//
// O PROBLEMA
//
// A pergunta que decide a renovação do contrato é "o investimento valeu a
// pena?". Nenhuma tela respondia: o gestor via a FILA de conferência, que é
// trabalho pendente, e `GET /api/donations` lista as destinações DE QUEM ESTÁ
// LOGADO (`WHERE d.user_id = $1`) — serve ao destinador, não ao cliente.
//
// Somar é a parte fácil. O que estes testes travam são as distinções que um
// número de dinheiro na tela de um cliente tem de respeitar:
//
//   1. promessa não é dinheiro — `pending` e `awaiting_confirmation` ficam
//      fora do captado, cada uma na sua caixa;
//   2. ENSAIO NÃO É DINHEIRO — `simulada` (migration 055) fica fora de tudo;
//   3. o que entrou pela plataforma não é o que o projeto captou;
//   4. aqui zero é zero, ao contrário de `lib/captacao.js`.
//
// A ARMADILHA MAIOR é a 2. `POST /:id/simulate` grava o MESMO `confirmed` que
// o gestor escreve depois de abrir o extrato do banco. Sem a marca, a linha de
// ensaio soma como dinheiro — na demonstração e para sempre depois dela.
//
// E a armadilha de TESTE é o pg-mem, que já mentiu nesta casa: ele ignora
// `FILTER` de agregação sem reclamar e devolve a soma inteira (foi assim que o
// sublimite nasceu errado). Por isso a rota usa `SUM(CASE WHEN ...)`, e o
// cruzamento com o Postgres de verdade está em `postgres-real.test.mjs`.
import { newDb, DataType } from 'pg-mem';
import express from 'express';
import jwt from 'jsonwebtoken';
import http from 'http';
import { montaResultado, CONFIRMADAS, NA_FILA, SO_PROMESSA } from '../src/lib/resultadoDoCliente.js';

process.env.JWT_SECRET = 'teste';
process.env.NODE_ENV = 'test';
delete process.env.SIMULATION_MODE;

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};
const igual = (a, b, o) => {
  if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
};

// ── banco em memória ───────────────────────────────────────────────────────
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
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), nome TEXT, email TEXT,
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
    -- migration 053: a captação do projeto, que NÃO é o que entrou por aqui.
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
    receipt_url TEXT, receipt_filename TEXT, receipt_file_path TEXT,
    confirmed_at TIMESTAMP, confirmed_by UUID, confirmation_note TEXT,
    rejected_at TIMESTAMP, rejected_by UUID, rejection_reason TEXT,
    proponente_notified_at TIMESTAMP, mecenato_url TEXT, mecenato_issued_at TIMESTAMP,
    transferido_em DATE, created_at TIMESTAMP DEFAULT NOW(),
    -- migration 055: nasceu em modo simulação.
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
const [{ id: orgId }] = await q(
  `INSERT INTO organizations (name, slug) VALUES ('Casa Azul','casa-azul') RETURNING id`);
const [{ id: outraOrgId }] = await q(
  `INSERT INTO organizations (name, slug) VALUES ('Instituto Aurora','aurora') RETURNING id`);
const [{ id: gestorId }] = await q(
  `INSERT INTO users (nome, email) VALUES ('Gestora','g@casaazul.org') RETURNING id`);
const [{ id: estranhoId }] = await q(
  `INSERT INTO users (nome, email) VALUES ('Estranho','e@outro.org') RETURNING id`);
await q(`INSERT INTO organization_users (organization_id, user_id, role, is_active)
         VALUES ($1,$2,'org_admin',true)`, [orgId, gestorId]);

// Três contribuintes distintos, para o número de PESSOAS ter o que contar.
const pessoas = [];
for (const n of ['Ana', 'Bruno', 'Carla']) {
  pessoas.push((await q(
    `INSERT INTO users (nome, email) VALUES ($1,$2) RETURNING id`,
    [n, `${n.toLowerCase()}@servidor.gov.br`]))[0].id);
}

await q(`INSERT INTO org_projects (organization_id, pronac, titulo, valor_autorizado,
                                   valor_captado, valores_em, is_active, is_featured)
         VALUES ($1,'2511274','Mostra Casa Azul', 500000, 120000, $2, true, true)`,
  [orgId, new Date().toISOString().slice(0, 10)]);

/** Uma destinação qualquer, com o estado e a marca que o teste precisar. */
const destinacao = ({ pessoa, valor, status, simulada = false, org = orgId }) => q(
  `INSERT INTO donations (user_id, organization_id, donation_amount, ir_devido,
                          fiscal_year, pronac, projeto_titulo, status, simulada)
   VALUES ($1,$2,$3,$4,2026,'2511274','Mostra Casa Azul',$5,$6) RETURNING id`,
  [pessoa, org, valor, valor / 0.06, status, simulada]);

const tokenDe = (userId, extra = {}) => jwt.sign({ userId, orgId, ...extra }, 'teste', { expiresIn: '1h' });

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.organization = { id: orgId }; next(); });
app.use('/api/donations', donationsRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

const pedir = async (token) => {
  const r = await fetch(base + '/api/donations/resultado',
    { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  return { http: r.status, corpo: await r.json().catch(() => ({})) };
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. A biblioteca: as regras, sem banco
// ═══════════════════════════════════════════════════════════════════════════

await teste('promessa nao entra no captado, e tem caixa propria', () => {
  const r = montaResultado({
    confirmado_valor: 3000, confirmado_qtd: 2, confirmado_pessoas: 2,
    fila_valor: 1500, fila_qtd: 1,
    promessa_valor: 800, promessa_qtd: 1
  });
  igual(r.confirmado.valor, 3000, 'captado');
  igual(r.na_fila.valor, 1500, 'na fila');
  igual(r.prometido.valor, 800, 'prometido');
  // O captado nao pode ter absorvido nenhuma das outras duas.
  if (r.confirmado.valor !== 3000) throw new Error('promessa entrou no captado');
});

await teste('ensaio fica fora de todos os totais de dinheiro', () => {
  const r = montaResultado({
    confirmado_valor: 0, confirmado_qtd: 0, confirmado_pessoas: 0,
    simulado_valor: 48000, simulado_qtd: 12
  });
  igual(r.confirmado.valor, 0, 'captado com ensaio dentro');
  igual(r.simulado.valor, 48000, 'caixa do ensaio');
  igual(r.tem_simulacao, true, 'a tela precisa saber que ha ensaio');
});

await teste('em simulacao a frase lidera com a simulacao, nao com o numero', () => {
  const r = montaResultado({ simulado_valor: 48000, simulado_qtd: 12 }, { modoSimulacao: true });
  if (!/simula/i.test(r.frase)) throw new Error('a frase nao avisa: ' + r.frase);
  igual(r.modo_simulacao, true, 'modo');
});

await teste('aqui zero e zero — e a frase diz isso', () => {
  // Ao contrario de lib/captacao.js, onde nulo e "ninguem conferiu". La o
  // numero vem de fora; aqui nos CONTAMOS as linhas.
  const r = montaResultado({});
  igual(r.confirmado.valor, 0, 'captado');
  igual(r.confirmado.quantidade, 0, 'quantidade');
  if (!/ainda n[aã]o h[aá]/i.test(r.frase)) throw new Error('frase: ' + r.frase);
});

await teste('o percentual do autorizado so sai com os dois numeros', () => {
  const semProjeto = montaResultado({ confirmado_valor: 1000, confirmado_qtd: 1 });
  igual(semProjeto.percentual_do_autorizado, null, 'sem projeto');
  const com = montaResultado(
    { confirmado_valor: 50000, confirmado_qtd: 10 },
    { captacaoDoProjeto: { autorizado: 500000, captado: 120000 } });
  igual(com.percentual_do_autorizado, 10, 'com projeto');
});

await teste('o que entrou pela plataforma nao vira o que o projeto captou', () => {
  // Os dois numeros convivem, separados e nomeados. Somar um no outro inflaria
  // o que a plataforma entregou — a afirmacao de que o contrato depende.
  const r = montaResultado(
    { confirmado_valor: 50000, confirmado_qtd: 10, confirmado_pessoas: 10 },
    { captacaoDoProjeto: { autorizado: 500000, captado: 120000, captado_conhecido: true } });
  igual(r.confirmado.valor, 50000, 'pela plataforma');
  igual(r.projeto.captado, 120000, 'pelo projeto');
  if (r.confirmado.valor === r.projeto.captado) throw new Error('os dois numeros viraram um so');
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. A rota: permissão, escopo e as somas contra o banco
// ═══════════════════════════════════════════════════════════════════════════

await teste('sem token, a rota nao responde', async () => {
  const { http } = await pedir(null);
  if (http !== 401 && http !== 403) throw new Error('respondeu ' + http);
});

await teste('quem nao administra a organizacao recebe 403', async () => {
  const { http } = await pedir(tokenDe(estranhoId));
  igual(http, 403, 'estranho');
});

await teste('sem destinacao nenhuma, o painel diz zero sem inventar', async () => {
  const { http, corpo } = await pedir(tokenDe(gestorId));
  igual(http, 200, 'status');
  igual(corpo.resultado.confirmado.valor, 0, 'captado');
  igual(corpo.resultado.confirmado.pessoas, 0, 'pessoas');
  if (!/ainda n[aã]o h[aá]/i.test(corpo.resultado.frase)) {
    throw new Error('frase: ' + corpo.resultado.frase);
  }
});

await teste('o ENSAIO confirmado nao entra no captado', async () => {
  // O caso que motivou a migration 055: /simulate grava o mesmo 'confirmed'
  // que o gestor escreve com o extrato na mao.
  await destinacao({ pessoa: pessoas[0], valor: 4000, status: 'confirmed', simulada: true });
  const { corpo } = await pedir(tokenDe(gestorId));
  igual(corpo.resultado.confirmado.valor, 0, 'captado com ensaio dentro');
  igual(corpo.resultado.simulado.valor, 4000, 'caixa do ensaio');
  igual(corpo.resultado.tem_simulacao, true, 'a tela precisa saber');
});

await teste('so o conferido pelo gestor entra no captado', async () => {
  await destinacao({ pessoa: pessoas[0], valor: 3000, status: 'confirmed' });
  await destinacao({ pessoa: pessoas[1], valor: 2000, status: 'mecenato_issued' });
  await destinacao({ pessoa: pessoas[2], valor: 1500, status: 'awaiting_confirmation' });
  await destinacao({ pessoa: pessoas[2], valor: 900,  status: 'pending' });
  const { corpo } = await pedir(tokenDe(gestorId));
  const r = corpo.resultado;
  igual(r.confirmado.valor, 5000, 'captado');
  igual(r.confirmado.quantidade, 2, 'quantas confirmadas');
  igual(r.na_fila.valor, 1500, 'na fila');
  igual(r.prometido.valor, 900, 'prometido');
});

await teste('pessoas conta gente, nao destinacoes', async () => {
  // Uma pessoa que destina duas vezes e uma pessoa. O numero que o cliente
  // mais olha e "quantos servidores", nao "quantos lancamentos".
  await destinacao({ pessoa: pessoas[0], valor: 1000, status: 'confirmed' });
  const { corpo } = await pedir(tokenDe(gestorId));
  igual(corpo.resultado.confirmado.quantidade, 3, 'destinacoes confirmadas');
  igual(corpo.resultado.confirmado.pessoas, 2, 'pessoas distintas');
});

await teste('a destinacao cancelada nao entra em caixa nenhuma', async () => {
  const antes = (await pedir(tokenDe(gestorId))).corpo.resultado;
  await destinacao({ pessoa: pessoas[1], valor: 7000, status: 'cancelled' });
  const depois = (await pedir(tokenDe(gestorId))).corpo.resultado;
  igual(depois.confirmado.valor, antes.confirmado.valor, 'captado');
  igual(depois.prometido.valor, antes.prometido.valor, 'prometido');
  igual(depois.simulado.valor, antes.simulado.valor, 'ensaio');
});

await teste('a destinacao de OUTRO cliente nao aparece aqui', async () => {
  const antes = (await pedir(tokenDe(gestorId))).corpo.resultado;
  await destinacao({ pessoa: pessoas[0], valor: 99000, status: 'confirmed', org: outraOrgId });
  const depois = (await pedir(tokenDe(gestorId))).corpo.resultado;
  igual(depois.confirmado.valor, antes.confirmado.valor, 'captado vazou entre clientes');
});

await teste('o projeto vem junto, e separado do que entrou por aqui', async () => {
  const { corpo } = await pedir(tokenDe(gestorId));
  const r = corpo.resultado;
  igual(r.projeto.autorizado, 500000, 'autorizado do projeto');
  igual(r.projeto.captado, 120000, 'captado do projeto');
  if (r.confirmado.valor === r.projeto.captado) throw new Error('os dois numeros viraram um so');
  // 6000 de 500000 = 1,2%
  igual(r.percentual_do_autorizado, 1.2, 'percentual do autorizado');
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. O pg-mem mente: a soma condicional tem de ser SUM(CASE WHEN)
// ═══════════════════════════════════════════════════════════════════════════

await teste('a rota nao usa FILTER, que o pg-mem ignora calado', async () => {
  const fs = await import('fs');
  const { fileURLToPath } = await import('url');
  const path = await import('path');
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const rota = fs.readFileSync(path.join(aqui, '../src/routes/donations.js'), 'utf8');
  const trecho = rota.slice(rota.indexOf("router.get('/resultado'"));
  const corpo = trecho.slice(0, trecho.indexOf("router.get('/'"));
  if (/\)\s*FILTER\s*\(/i.test(corpo)) {
    throw new Error('FILTER na rota: o pg-mem devolve a soma inteira e o ensaio vira dinheiro');
  }
  if (!/SUM\(CASE WHEN/.test(corpo)) throw new Error('a soma condicional sumiu');
});

await teste('o pg-mem de fato calcula o SUM(CASE WHEN) desta rota', async () => {
  // Nao basta nao usar FILTER: o resultado tem de bater com a conta feita a
  // mao, linha a linha, no mesmo banco.
  const linhas = await q(
    `SELECT donation_amount, status, simulada FROM donations WHERE organization_id = $1`, [orgId]);
  const aMao = linhas
    .filter(l => l.simulada === false && CONFIRMADAS.includes(l.status))
    .reduce((s, l) => s + Number(l.donation_amount), 0);
  const { corpo } = await pedir(tokenDe(gestorId));
  igual(corpo.resultado.confirmado.valor, aMao, 'soma da rota contra a conta a mao');
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. A marca nasce com a linha
// ═══════════════════════════════════════════════════════════════════════════

await teste('o vocabulario das situacoes nao se sobrepoe', () => {
  // Uma situacao em duas listas seria contada duas vezes — e o captado
  // passaria a incluir a fila sem ninguem perceber.
  const todas = [...CONFIRMADAS, ...NA_FILA, ...SO_PROMESSA];
  if (new Set(todas).size !== todas.length) {
    throw new Error('situacao repetida entre as listas: ' + todas.join(', '));
  }
});

await teste('/simulate marca a linha como ensaio', async () => {
  const fs = await import('fs');
  const { fileURLToPath } = await import('url');
  const path = await import('path');
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const rota = fs.readFileSync(path.join(aqui, '../src/routes/donations.js'), 'utf8')
    .replace(/\/\/.*$/gm, '');
  const trecho = rota.slice(rota.indexOf("router.post('/:id/simulate'"));
  const corpo = trecho.slice(0, 1400);
  if (!/simulada\s*=\s*true/.test(corpo)) {
    throw new Error('a rota de pagamento ficticio grava confirmed sem marcar o ensaio');
  }
});

await teste('o registro le o modo e marca a linha no INSERT', async () => {
  const fs = await import('fs');
  const { fileURLToPath } = await import('url');
  const path = await import('path');
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const rota = fs.readFileSync(path.join(aqui, '../src/routes/donations.js'), 'utf8');
  const insert = /INSERT INTO donations \(([^)]*)\)/.exec(rota);
  if (!insert || !/simulada/.test(insert[1])) {
    throw new Error('o INSERT de registro nao grava `simulada`');
  }
  if (!/SIMULATION_MODE === 'true'/.test(rota.slice(0, rota.indexOf('INSERT INTO donations')))) {
    throw new Error('o modo nao e lido antes do INSERT');
  }
});

servidor.close();
console.log('\nO que entrou pela plataforma: o resultado do cliente\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
