// Um cliente white-label recebia a cor e a logo dele sobre o discurso da
// IncentivaBR. A migration 039 da tres textos a organizacao (frase principal,
// paragrafo, quem somos); GET /api/config/brand os devolve em `textos` e
// tenant.js escreve cada um em [data-tenant="…"] por textContent.
//
// O que estes testes guardam:
//   - a plataforma (`www`) nunca recebe textos, e o cliente recebe os dele;
//   - o superadmin grava, limita o tamanho e consegue apagar um texto;
//   - as paginas marcam o que precisa ser marcado, e sempre por textContent —
//     o texto do superadmin nao pode virar HTML.
import { newDb } from 'pg-mem';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'teste';

const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});
db.public.none(`
  CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT, slug TEXT, custom_domain TEXT, website_url TEXT, cnpj TEXT,
    plan_type TEXT, fund_type TEXT, fund_name TEXT, max_percentage NUMERIC(5,2),
    contact_email TEXT, contact_phone TEXT,
    primary_color TEXT, secondary_color TEXT, logo_url TEXT,
    hero_titulo TEXT, hero_subtitulo TEXT, sobre TEXT,
    is_active BOOLEAN DEFAULT true, contracted_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(),
    govbr_client_id TEXT, govbr_client_secret TEXT, govbr_redirect_uri TEXT,
    incentive_group_code TEXT, mecenato_prazo_dias INT
  );
  CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID);
  CREATE TABLE donations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, donation_amount NUMERIC, status TEXT);
  CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID, user_id UUID,
    action TEXT, entity_type TEXT, entity_id UUID, details TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE tetos_deducao (
    codigo TEXT PRIMARY KEY, descricao TEXT, percentual NUMERIC(5,2), base_legal TEXT,
    vigencia_inicio DATE, vigencia_fim DATE, confirmado_por_parecer BOOLEAN DEFAULT FALSE, observacao TEXT
  );
  CREATE TABLE incentive_groups (code TEXT UNIQUE, name TEXT, max_percentage NUMERIC(5,2), teto_codigo TEXT);
  INSERT INTO tetos_deducao (codigo, descricao, percentual, base_legal, vigencia_inicio)
    VALUES ('irpf_global_6', 'Teto global', 6.00, 'Lei 9.532/1997, art. 22', '1998-01-01');
  INSERT INTO incentive_groups (code, name, max_percentage, teto_codigo) VALUES ('ROUANET', 'Lei Rouanet', 6, 'irpf_global_6');
  INSERT INTO organizations (name, slug) VALUES ('IncentivaBR', 'www');
  INSERT INTO organizations (name, slug, contact_email, website_url, hero_titulo, sobre)
    VALUES ('Casa Azul', 'casa-azul', 'contato@casazul.org.br', 'https://casazul.org.br',
            'Seu imposto pode sustentar o teatro inclusivo.', 'Somos uma associação de Brasília.');
`);
const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });
const q = async (sql, p) => (await poolFalso.query(sql, p)).rows;

const { default: configRoutes } = await import('../src/routes/config.js');
const { default: adminRoutes, LIMITE_TEXTOS } = await import('../src/routes/admin.js');
const jwt = (await import('jsonwebtoken')).default;

const [www] = await q(`SELECT * FROM organizations WHERE slug = 'www'`);
const [casa] = await q(`SELECT * FROM organizations WHERE slug = 'casa-azul'`);

// Tenant decidido pelo ?org=, como o middleware real faz em desenvolvimento.
const app = express();
app.use(express.json());
app.use(async (req, _res, next) => {
  const slug = req.query.org || 'www';
  const [org] = await q(`SELECT * FROM organizations WHERE slug = $1`, [slug]);
  req.organization = org || null;
  next();
});
app.use('/api/config', configRoutes);
app.use('/api/admin', adminRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;
const superadmin = jwt.sign({ userId: crypto.randomUUID(), orgId: www.id, isSuperadmin: true }, 'teste');
const cab = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + superadmin };

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

await teste('a plataforma (www) e marcada como plataforma e nao leva textos', async () => {
  const b = await (await fetch(`${BASE}/api/config/brand`)).json();
  if (b.eh_plataforma !== true) throw new Error('eh_plataforma: ' + b.eh_plataforma);
  if (b.textos !== null) throw new Error('www recebeu textos: ' + JSON.stringify(b.textos));
  if (b.slug !== 'www') throw new Error('slug: ' + b.slug);
});

await teste('o cliente recebe os textos dele, o contato e o site', async () => {
  const b = await (await fetch(`${BASE}/api/config/brand?org=casa-azul`)).json();
  if (b.eh_plataforma !== false) throw new Error('cliente marcado como plataforma');
  if (b.textos.hero_titulo !== 'Seu imposto pode sustentar o teatro inclusivo.') throw new Error('hero_titulo: ' + b.textos.hero_titulo);
  if (b.textos.hero_subtitulo !== null) throw new Error('subtitulo vazio deveria vir null');
  if (b.textos.sobre !== 'Somos uma associação de Brasília.') throw new Error('sobre: ' + b.textos.sobre);
  if (b.textos.contato_email !== 'contato@casazul.org.br') throw new Error('contato: ' + b.textos.contato_email);
  if (b.textos.site !== 'https://casazul.org.br') throw new Error('site: ' + b.textos.site);
});

await teste('o superadmin grava os tres textos, e o excesso e cortado no limite', async () => {
  const longo = 'x'.repeat(LIMITE_TEXTOS.hero_titulo + 50);
  const r = await fetch(`${BASE}/api/admin/orgs/${casa.id}`, {
    method: 'PUT', headers: cab,
    body: JSON.stringify({ hero_titulo: '  ' + longo + '  ', hero_subtitulo: 'Sem custo a mais.', sobre: 'Nova apresentação.' })
  });
  if (r.status !== 200) throw new Error('status ' + r.status + ' ' + await r.text());
  const [o] = await q(`SELECT hero_titulo, hero_subtitulo, sobre, name FROM organizations WHERE id = $1`, [casa.id]);
  if (o.hero_titulo.length !== LIMITE_TEXTOS.hero_titulo) throw new Error('nao cortou: ' + o.hero_titulo.length);
  if (o.hero_subtitulo !== 'Sem custo a mais.') throw new Error('subtitulo: ' + o.hero_subtitulo);
  if (o.sobre !== 'Nova apresentação.') throw new Error('sobre: ' + o.sobre);
  if (o.name !== 'Casa Azul') throw new Error('o PUT so de textos mexeu no nome: ' + o.name);
});

await teste('string vazia apaga o texto; campo ausente mantem', async () => {
  const r = await fetch(`${BASE}/api/admin/orgs/${casa.id}`, {
    method: 'PUT', headers: cab, body: JSON.stringify({ hero_subtitulo: '' })
  });
  if (r.status !== 200) throw new Error('status ' + r.status);
  const [o] = await q(`SELECT hero_subtitulo, sobre FROM organizations WHERE id = $1`, [casa.id]);
  if (o.hero_subtitulo !== null) throw new Error('nao apagou: ' + JSON.stringify(o.hero_subtitulo));
  if (o.sobre !== 'Nova apresentação.') throw new Error('campo ausente foi alterado: ' + o.sobre);
});

// A listagem usa COUNT(...) FILTER (WHERE ...), que o pg-mem nao executa;
// a guarda aqui e no texto da rota: a consulta le as colunas e o JSON as
// devolve, senao a tela de clientes abre o formulario vazio.
await teste('a lista de clientes traz os textos, para a tela preencher o formulario', () => {
  const rota = fs.readFileSync(path.join(AQUI, '../src/routes/admin.js'), 'utf8');
  const lista = rota.slice(rota.indexOf("router.get('/orgs'"), rota.indexOf("router.post('/orgs'"));
  for (const c of ['o.hero_titulo', 'o.hero_subtitulo', 'o.sobre', 'hero_titulo:', 'sobre:']) {
    if (!lista.includes(c)) throw new Error('GET /orgs sem ' + c);
  }
});

await teste('sem superadmin, nada disso e gravado', async () => {
  const comum = jwt.sign({ userId: crypto.randomUUID(), orgId: casa.id }, 'teste');
  const r = await fetch(`${BASE}/api/admin/orgs/${casa.id}`, {
    method: 'PUT', headers: { ...cab, Authorization: 'Bearer ' + comum }, body: JSON.stringify({ sobre: 'invasao' })
  });
  if (r.status !== 403) throw new Error('status ' + r.status);
});

// ── as paginas ─────────────────────────────────────────────────────────────
const le = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

await teste('a pagina inicial marca titulo, paragrafo, quem somos e o projeto do cliente', () => {
  const html = le('frontend/index.html');
  for (const marca of ['data-tenant="hero_titulo"', 'data-tenant="hero_subtitulo"', 'data-tenant="sobre"',
                       'data-tenant="contato_email"', 'data-so-cliente', 'data-projeto="titulo"', 'data-destinar']) {
    if (!html.includes(marca)) throw new Error('index.html sem ' + marca);
  }
  if (!/<script[^>]+js\/tenant\.js/.test(html)) throw new Error('index.html nao carrega tenant.js');
});

await teste('o rodape unico tem a linha do cliente', () => {
  const js = le('frontend/js/layout.js');
  if (!js.includes('data-so-cliente')) throw new Error('layout.js sem data-so-cliente');
  if (!js.includes('data-tenant="contato_email"')) throw new Error('layout.js sem o contato do cliente');
});

await teste('tenant.js escreve os textos por textContent, nunca por innerHTML', () => {
  const js = le('frontend/js/tenant.js');
  const trecho = js.slice(js.indexOf('[data-tenant]'), js.indexOf('[data-tenant]') + 600);
  if (!trecho.includes('textContent')) throw new Error('bloco de [data-tenant] sem textContent');
  if (/innerHTML/.test(trecho)) throw new Error('bloco de [data-tenant] usa innerHTML');
  if (!js.includes('data-so-plataforma') || !js.includes('data-so-cliente')) throw new Error('tenant.js nao alterna os blocos so-cliente / so-plataforma');
});

await teste('a tela de clientes tem o formulario dos textos e salva por PUT', () => {
  const html = le('frontend/admin-clientes.html');
  for (const id of ['tTitulo', 'tSubtitulo', 'tSobre', 'formTextos']) {
    if (!html.includes(`id="${id}"`)) throw new Error('admin-clientes.html sem #' + id);
  }
  if (!/method:\s*'PUT'/.test(html)) throw new Error('admin-clientes.html nao salva por PUT');
});

await teste('a migration 039 cria as tres colunas e nada mais', () => {
  const sql = le('backend/src/migrations/039_textos_por_tenant.sql');
  for (const c of ['hero_titulo', 'hero_subtitulo', 'sobre']) {
    if (!new RegExp(`ADD COLUMN IF NOT EXISTS ${c}\\s+TEXT`).test(sql)) throw new Error('migration sem ' + c);
  }
  if (/UPDATE|DELETE|DROP/i.test(sql)) throw new Error('a migration mexe em dados');
});

servidor.close();
console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
