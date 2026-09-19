// A lista de interessados é do cliente — e agora dá para lê-la.
//
// `organization_id` guarda quem captou cada inscrição desde a migration 027, e
// a decisão de setembro de 2026 e que a lista e do CLIENTE. So que nao existia
// rota que lesse a tabela: a lista era dele no banco e nao era dele em lugar
// nenhum.
//
// O que estes testes guardam:
//
//   - escopo por organizacao. O gestor de um cliente nunca ve a base do outro
//     — e esse e o unico erro aqui que nao tem conserto depois de acontecer;
//   - `access_token` NUNCA sai. Ele nao e identificador, e credencial: e o que
//     autentica o link de um clique que consulta, corrige e elimina os dados
//     da pessoa, sem login. Exportar a lista com ele dentro entrega junto a
//     chave da conta de cada inscrito;
//   - quem pediu eliminacao nao volta na lista;
//   - o telefone so sai para quem consentiu WhatsApp: foi so para isso que ele
//     foi pedido;
//   - a situacao de cada um aparece, senao quem exporta para disparar e-mail
//     nao distingue quem confirmou de quem nunca confirmou nem de quem saiu;
//   - o CSV nao carrega formula. Nome digitado como `=HYPERLINK(...)` executa
//     ao abrir a planilha, e o texto veio de fora;
//   - exportacao em lote deixa rastro.
import { newDb, DataType } from 'pg-mem';
import express from 'express';
import http from 'http';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'teste';

const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});
db.public.none(`
  CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, slug TEXT
  );
  CREATE TABLE users (encerrada_em TIMESTAMP, anonimizada_em TIMESTAMP, id UUID PRIMARY KEY DEFAULT gen_random_uuid(), nome TEXT);
  CREATE TABLE organization_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, user_id UUID, role TEXT, is_active BOOLEAN DEFAULT true
  );
  CREATE TABLE subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT, nome TEXT, phone TEXT, orgao TEXT, organization_id UUID,
    consent_prazos BOOLEAN DEFAULT FALSE, consent_projetos BOOLEAN DEFAULT FALSE,
    consent_whatsapp BOOLEAN DEFAULT FALSE,
    consent_text TEXT, consent_policy_version TEXT, consent_at TIMESTAMPTZ,
    confirm_token TEXT, confirmed_at TIMESTAMPTZ,
    access_token TEXT, revoked_at TIMESTAMPTZ, anonymized_at TIMESTAMPTZ,
    last_interaction_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE subscriber_consent_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), subscriber_id UUID, evento TEXT,
    consent_prazos BOOLEAN, consent_projetos BOOLEAN, consent_whatsapp BOOLEAN,
    consent_text TEXT, consent_policy_version TEXT, ip TEXT, user_agent TEXT,
    detalhe TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID, user_id UUID,
    action TEXT, entity_type TEXT, entity_id UUID, details TEXT,
    ip_address TEXT, user_agent TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
  );
  INSERT INTO organizations (name, slug) VALUES ('IncentivaBR', 'www');
  INSERT INTO organizations (name, slug) VALUES ('Casa Azul', 'casa-azul');
  INSERT INTO organizations (name, slug) VALUES ('Orquestra das Periferias', 'orquestra');
`);

const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });
const q = async (sql, p) => (await poolFalso.query(sql, p)).rows;

const [www]       = await q(`SELECT * FROM organizations WHERE slug = 'www'`);
const [casa]      = await q(`SELECT * FROM organizations WHERE slug = 'casa-azul'`);
const [orquestra] = await q(`SELECT * FROM organizations WHERE slug = 'orquestra'`);

const [gestorCasa] = await q(`INSERT INTO users (nome) VALUES ('Gestora da Casa Azul') RETURNING id`);
const [curioso]    = await q(`INSERT INTO users (nome) VALUES ('Pessoa sem papel') RETURNING id`);
const [chefe]      = await q(`INSERT INTO users (nome) VALUES ('Superadmin') RETURNING id`);
await q(`INSERT INTO organization_users (organization_id, user_id, role, is_active)
         VALUES ($1, $2, 'org_admin', true)`, [casa.id, gestorCasa.id]);

const inscreve = (email, org, extra = {}) => q(
  `INSERT INTO subscribers
     (email, nome, phone, orgao, organization_id, consent_prazos, consent_projetos,
      consent_whatsapp, confirmed_at, revoked_at, anonymized_at, access_token, confirm_token)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
  [email, extra.nome ?? 'Alguém', extra.phone ?? '61999990000', extra.orgao ?? 'TJDFT',
   org, extra.prazos ?? true, extra.projetos ?? false, extra.whatsapp ?? false,
   extra.confirmado === false ? null : new Date(), extra.revogado ?? null,
   extra.anonimizado ?? null, 'token-secreto-' + email, 'confirm-' + email]);

await inscreve('ativo@casazul.org', casa.id);
await inscreve('whats@casazul.org', casa.id, { whatsapp: true, phone: '61988887777' });
await inscreve('pendente@casazul.org', casa.id, { confirmado: false });
await inscreve('saiu@casazul.org', casa.id, { revogado: new Date() });
await inscreve('apagado@casazul.org', casa.id, { anonimizado: new Date() });
await inscreve('formula@casazul.org', casa.id, { nome: '=HYPERLINK("http://mau","clique")' });
await inscreve('daorquestra@exemplo.org', orquestra.id);
await inscreve('antigo@exemplo.org', null);

const { default: interessadosRoutes } = await import('../src/routes/interessados.js');
const jwt = (await import('jsonwebtoken')).default;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const slug = req.query.org || 'casa-azul';
  req.organization = [www, casa, orquestra].find(o => o.slug === slug) || null;
  next();
});
app.use('/api/interessados', interessadosRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

const cracha = (userId, org, superadmin = false) => 'Bearer ' + jwt.sign(
  { userId, orgId: org.id, orgSlug: org.slug, isSuperadmin: superadmin }, 'teste');

const pega = (caminho, autorizacao) =>
  fetch(BASE + caminho, autorizacao ? { headers: { Authorization: autorizacao } } : undefined);

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

await teste('sem token, a lista nao abre', async () => {
  const r = await pega('/api/interessados/lista');
  if (r.status !== 401) throw new Error('status ' + r.status);
});

await teste('quem nao gere a organizacao nao le a lista dela', async () => {
  const r = await pega('/api/interessados/lista', cracha(curioso.id, casa));
  if (r.status !== 403) throw new Error('status ' + r.status);
});

await teste('o gestor le a lista da organizacao dele', async () => {
  const r = await pega('/api/interessados/lista', cracha(gestorCasa.id, casa));
  if (r.status !== 200) throw new Error('status ' + r.status);
  const d = await r.json();
  const emails = d.interessados.map(s => s.email);
  if (!emails.includes('ativo@casazul.org')) throw new Error('faltou o inscrito: ' + emails);
});

await teste('o gestor de um cliente NAO ve a base do outro', async () => {
  // O unico erro aqui que nao tem conserto depois de acontecer.
  const d = await (await pega('/api/interessados/lista', cracha(gestorCasa.id, casa))).json();
  const vazados = d.interessados.filter(s => /orquestra/.test(s.email));
  if (vazados.length) throw new Error('vazou base alheia: ' + JSON.stringify(vazados));
});

await teste('nem pedindo a organizacao do outro pelo endereco', async () => {
  // O `?org=` decide o tenant; a permissao tem de ser conferida DEPOIS dele,
  // senao basta trocar o endereco para ler a base de qualquer cliente.
  const r = await pega('/api/interessados/lista?org=orquestra', cracha(gestorCasa.id, casa));
  if (r.status !== 403) throw new Error('status ' + r.status);
});

await teste('o access_token nunca sai na lista', async () => {
  // Nao e identificador: e a credencial do link de um clique que consulta,
  // corrige e elimina os dados da pessoa, sem login.
  const texto = await (await pega('/api/interessados/lista', cracha(gestorCasa.id, casa))).text();
  for (const credencial of ['token-secreto-', 'confirm-']) {
    if (texto.includes(credencial)) throw new Error('vazou ' + credencial);
  }
});

await teste('quem pediu eliminacao nao volta na lista', async () => {
  const d = await (await pega('/api/interessados/lista', cracha(gestorCasa.id, casa))).json();
  if (d.interessados.some(s => s.email === 'apagado@casazul.org')) {
    throw new Error('anonimizado reapareceu');
  }
});

await teste('o telefone so sai de quem consentiu WhatsApp', async () => {
  const d = await (await pega('/api/interessados/lista', cracha(gestorCasa.id, casa))).json();
  const com = d.interessados.find(s => s.email === 'whats@casazul.org');
  const sem = d.interessados.find(s => s.email === 'ativo@casazul.org');
  if (com.phone !== '61988887777') throw new Error('sumiu o telefone de quem consentiu');
  if (sem.phone !== null) throw new Error('telefone de quem nao consentiu: ' + sem.phone);
});

await teste('cada inscrito vem com a situacao, e o resumo bate', async () => {
  const d = await (await pega('/api/interessados/lista', cracha(gestorCasa.id, casa))).json();
  const situacao = e => d.interessados.find(s => s.email === e)?.situacao;
  if (situacao('ativo@casazul.org') !== 'ativo') throw new Error('ativo: ' + situacao('ativo@casazul.org'));
  if (situacao('pendente@casazul.org') !== 'pendente') throw new Error('pendente errado');
  if (situacao('saiu@casazul.org') !== 'revogado') throw new Error('revogado errado');
  if (d.resumo.pendentes !== 1 || d.resumo.revogados !== 1) {
    throw new Error('resumo: ' + JSON.stringify(d.resumo));
  }
  if (d.total !== d.interessados.length) throw new Error('total nao bate com a lista');
});

await teste('a plataforma leva tambem as inscricoes sem dono', async () => {
  // Inscricao anterior aos tenants tem organization_id nulo. Ela fica com a
  // plataforma; com um cliente, nunca.
  const d = await (await pega('/api/interessados/lista?org=www', cracha(chefe.id, www, true))).json();
  if (!d.interessados.some(s => s.email === 'antigo@exemplo.org')) {
    throw new Error('a inscricao orfa ficou invisivel para todo mundo');
  }
  const dCliente = await (await pega('/api/interessados/lista', cracha(gestorCasa.id, casa))).json();
  if (dCliente.interessados.some(s => s.email === 'antigo@exemplo.org')) {
    throw new Error('a inscricao orfa caiu na lista de um cliente');
  }
});

// ── CSV ─────────────────────────────────────────────────────────────────────

await teste('o CSV sai com cabecalho e BOM', async () => {
  const r = await pega('/api/interessados/lista.csv', cracha(gestorCasa.id, casa));
  if (r.status !== 200) throw new Error('status ' + r.status);
  if (!/text\/csv/.test(r.headers.get('content-type') || '')) throw new Error('tipo: ' + r.headers.get('content-type'));
  if (!/attachment/.test(r.headers.get('content-disposition') || '')) throw new Error('nao veio como download');
  // Sem o BOM, o Excel no Windows abre "João" como "JoÃ£o". E preciso olhar os
  // BYTES: `Response.text()` descarta o BOM ao decodificar, entao pelo texto
  // ele e invisivel — estivesse ou nao no arquivo.
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes[0] !== 0xEF || bytes[1] !== 0xBB || bytes[2] !== 0xBF) {
    throw new Error('sem BOM: ' + [...bytes.slice(0, 3)].map(b => b.toString(16)).join(' '));
  }
  const txt = new TextDecoder().decode(bytes);
  if (!txt.includes('email,nome,orgao,situacao')) throw new Error('cabecalho: ' + txt.slice(0, 80));
});

await teste('o CSV nao carrega formula para dentro da planilha', async () => {
  // O nome veio de um formulario aberto. `=HYPERLINK(...)` executa ao abrir.
  const txt = await (await pega('/api/interessados/lista.csv', cracha(gestorCasa.id, casa))).text();
  const linha = txt.split('\r\n').find(l => l.includes('formula@casazul.org'));
  if (!linha) throw new Error('sumiu a linha do teste');
  if (/,"=/.test(linha)) throw new Error('campo comeca com = : ' + linha);
  if (!linha.includes("'=HYPERLINK")) throw new Error('nao neutralizou: ' + linha);
});

await teste('o CSV tambem respeita o escopo e nao leva credencial', async () => {
  const txt = await (await pega('/api/interessados/lista.csv', cracha(gestorCasa.id, casa))).text();
  if (txt.includes('daorquestra@exemplo.org')) throw new Error('vazou base alheia no CSV');
  if (txt.includes('token-secreto-')) throw new Error('vazou credencial no CSV');
  if (txt.includes('apagado@casazul.org')) throw new Error('anonimizado no CSV');
});

await teste('exportar em lote deixa rastro', async () => {
  const antes = (await q(`SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'interessados.exportados'`))[0].n;
  await pega('/api/interessados/lista.csv', cracha(gestorCasa.id, casa));
  const [linha] = await q(
    `SELECT organization_id, user_id, details FROM audit_log
      WHERE action = 'interessados.exportados' ORDER BY created_at DESC LIMIT 1`);
  const depois = (await q(`SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'interessados.exportados'`))[0].n;
  if (depois !== antes + 1) throw new Error('nao registrou a exportacao');
  if (linha.organization_id !== casa.id) throw new Error('organizacao errada no registro');
  if (linha.user_id !== gestorCasa.id) throw new Error('usuario errado no registro');
  if (!/"quantidade"/.test(linha.details || '')) throw new Error('detalhe sem quantidade: ' + linha.details);
});

await teste('ler a lista em JSON nao gera registro de exportacao', async () => {
  // O rastro existe para dado saindo em lote; a tela consulta o tempo todo, e
  // um registro por abertura de tela transforma o log em ruido.
  const antes = (await q(`SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'interessados.exportados'`))[0].n;
  await pega('/api/interessados/lista', cracha(gestorCasa.id, casa));
  const depois = (await q(`SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'interessados.exportados'`))[0].n;
  if (depois !== antes) throw new Error('a leitura virou exportacao no log');
});

// ── a tela ──────────────────────────────────────────────────────────────────
// A rota existiu um dia sem tela nenhuma. Estas guardas prendem a tela ao
// padrao das outras de operacao: chega-se por atalho no dashboard, aceso pela
// propria rota; e o que vem do formulario aberto nunca entra em innerHTML sem
// escape.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../frontend');
const leia = nome => fs.readFileSync(path.join(FRONTEND, nome), 'utf8');

await teste('a tela existe, e fora dos buscadores', () => {
  const html = leia('interessados.html');
  if (!/<meta name="robots" content="noindex">/.test(html)) throw new Error('sem noindex — tem dado pessoal de terceiros');
  if (!/<script[^>]+src="js\/tenant\.js"/.test(html)) throw new Error('nao carrega o tenant.js');
  if (!/\/api\/interessados\/lista\b/.test(html)) throw new Error('nao chama a rota da lista');
  if (!/\/api\/interessados\/lista\.csv/.test(html)) throw new Error('nao oferece o CSV');
});

await teste('o dashboard leva ate a tela, e quem acende o atalho e a rota', () => {
  const dash = leia('dashboard.html');
  if (!/href="interessados\.html"/.test(dash)) throw new Error('sem atalho no dashboard');
  // O atalho nasce escondido e a RESPOSTA da rota o acende — nenhuma copia da
  // regra de permissao na tela, livre para divergir da do servidor.
  const atalho = dash.match(/<a href="interessados\.html"[^>]*>/)?.[0] || '';
  if (!/display:\s*none/.test(atalho)) throw new Error('o atalho nasce visivel: ' + atalho);
  if (!/fetch\('\/api\/interessados\/lista'/.test(dash)) throw new Error('o dashboard nao consulta a rota para acender o atalho');
});

await teste('nome, orgao e e-mail nunca entram em innerHTML sem escape', () => {
  // Vieram de um formulario aberto ao publico. `${s.nome}` cru executaria um
  // <script> na tela do gestor.
  const html = leia('interessados.html');
  const crus = [...html.matchAll(/\$\{s\.(nome|orgao|email|phone|situacao)[^}]*\}/g)]
    .map(m => m[0]).filter(m => !/esc\(/.test(m));
  if (crus.length) throw new Error('campo cru em template: ' + crus.join(' '));
  if (!/const esc = /.test(html)) throw new Error('a tela nao define esc()');
});

await teste('o CSV sai por fetch autenticado, nao por link direto', () => {
  // Link direto nao leva o token e daria 401.
  const html = leia('interessados.html');
  if (/<a[^>]+href="\/api\/interessados\/lista\.csv"/.test(html)) throw new Error('link direto para o CSV');
  if (!/URL\.createObjectURL/.test(html)) throw new Error('nao baixa por blob');
});

servidor.close();

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
