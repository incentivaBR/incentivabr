// A suite contra um Postgres DE VERDADE.
//
// Toda a suite roda em pg-mem, sem infraestrutura, e isso e uma virtude: um
// clone e `npm test`. Mas o pg-mem e tolerante onde o Postgres nao e, e essa
// diferenca ja custou caro: `WHERE email = $2` recebendo [null, email] passou
// verde no pg-mem e derrubou TODO cadastro sem CPF em producao ("could not
// determine data type of parameter $1"). Guardas de texto foram escritas
// depois, mas guarda de texto e remendo — o unico juiz do que o Postgres
// aceita e o Postgres.
//
// Este arquivo NAO entra no `npm test`. Roda no CI num container postgres:16
// (`.github/workflows/ci.yml`, job "Postgres de verdade") e localmente por
// `npm run test:postgres` com DATABASE_URL apontando para um banco de TESTE.
//
// O que ele guarda:
//   - schema.sql, seeds.sql, a 003 legada e TODAS as migrations aplicam num
//     Postgres real, em ordem, num banco vazio;
//   - o segundo boot nao reaplica nada (idempotencia de verdade, com ROLLBACK
//     de verdade — o que o migracoes.test.mjs so consegue fingir);
//   - o cadastro sem CPF — o defeito que motivou este arquivo — passa contra
//     o banco real, e e-mail repetido responde 409, nao 500;
//   - o login devolve sessao.
//
// Ele APAGA o schema public antes de comecar. Por isso so aceita banco cujo
// nome termine em _teste ou _test: apontar para producao por engano nao pode
// custar o banco.
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'teste';
process.env.APP_URL = 'https://www.incentivabr.com.br';

const url = process.env.DATABASE_URL || '';
if (!url) {
  console.log('postgres-real: DATABASE_URL nao definida — pulado (a suite padrao roda em pg-mem).');
  process.exit(0);
}
const nomeDoBanco = (() => { try { return new URL(url).pathname.replace(/^\//, ''); } catch { return ''; } })();
if (!/_teste?$/.test(nomeDoBanco)) {
  console.error(`postgres-real: recuso apagar o banco "${nomeDoBanco}". O nome precisa terminar em _teste ou _test.`);
  process.exit(2);
}

const { default: pool } = await import('../config/database.js');
const q = async (sql, p) => (await pool.query(sql, p)).rows;

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};
const igual = (a, b, o) => { if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };

// ── banco vazio, de verdade ──────────────────────────────────────────────────
await q('DROP SCHEMA public CASCADE');
await q('CREATE SCHEMA public');

const { runMigrations, statusDasMigracoes } = await import('../src/config/migrate.js');
const silencio = { log() {}, error() {} };
const migrationsNaPasta = fs.readdirSync(path.join(AQUI, '../src/migrations')).filter(f => f.endsWith('.sql')).length;

await teste('banco vazio: schema, seeds, 003 legada e todas as migrations aplicam num Postgres real', async () => {
  const r = await runMigrations({ log: silencio });
  igual(r.bootstrap, true, 'bootstrap');
  igual(r.aplicadas.length, migrationsNaPasta, 'migrations aplicadas');
});

await teste('nenhuma migration fica pendente', async () => {
  const s = await statusDasMigracoes();
  igual(s.pendentes.length, 0, 'pendentes: ' + s.pendentes.join(','));
  igual(s.aplicadas, migrationsNaPasta, 'aplicadas');
});

await teste('segundo boot: nada reaplica', async () => {
  const r = await runMigrations({ log: silencio });
  igual(r.bootstrap, false, 'bootstrap');
  igual(r.aplicadas.length, 0, 'reaplicou: ' + r.aplicadas.join(','));
});

await teste('as tabelas que o codigo supoe existem', async () => {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
  const tem = new Set(rows.map(r => r.table_name));
  for (const t of ['users', 'organizations', 'organization_users', 'donations', 'audit_log',
                   'subscribers', 'subscriber_consent_log', 'tetos_deducao', 'migrations_log']) {
    if (!tem.has(t)) throw new Error('falta a tabela ' + t);
  }
});

// ── o cadastro, contra o banco real ─────────────────────────────────────────
// A organizacao `www` nasce no boot do server.js (semeadura), nao nas
// migrations. Aqui sobe so a rota, entao ela e criada a mao quando falta.
let [www] = await q(`SELECT * FROM organizations WHERE slug = 'www'`);
if (!www) {
  [www] = await q(`INSERT INTO organizations (name, slug) VALUES ('IncentivaBR', 'www') RETURNING *`);
}

const { default: authRoutes, _trocaEnvioDeVerificacao } = await import('../src/routes/auth.js');
const enviados = [];
_trocaEnvioDeVerificacao(async (msg) => { enviados.push(msg); });

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.organization = www; next(); });
app.use('/api/auth', authRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;
const post = (rota, corpo) => fetch(BASE + rota, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
}).then(async r => [r.status, await r.json().catch(() => ({}))]);

const CONTA = { nome: 'Maria Aparecida de Souza', email: 'maria@exemplo.gov.br', senha: 'senha-bem-comprida', accepted_terms: true };

await teste('cadastro SEM CPF passa no Postgres real (o 500 de setembro)', async () => {
  // Foi exatamente isto que o pg-mem deixou passar verde.
  const [status, corpo] = await post('/api/auth/register', CONTA);
  if (status !== 201) throw new Error(`status ${status}: ${corpo.message}`);
  const [u] = await q(`SELECT cpf, email_verified FROM users WHERE email = $1`, [CONTA.email]);
  igual(u.cpf, null, 'cpf');
  igual(u.email_verified, false, 'email_verified');
  if (!enviados.some(m => m.to === CONTA.email)) throw new Error('a confirmacao de e-mail nao saiu');
});

await teste('e-mail repetido responde 409, nao 500', async () => {
  const [status, corpo] = await post('/api/auth/register', CONTA);
  igual(status, 409, 'status: ' + (corpo.message || ''));
  if (/cpf/i.test(corpo.message || '')) throw new Error('culpou o CPF: ' + corpo.message);
});

await teste('cadastro COM CPF valido passa, e CPF em uso responde 409', async () => {
  const [bom] = await post('/api/auth/register', { ...CONTA, email: 'comcpf@exemplo.gov.br', cpf: '529.982.247-25' });
  igual(bom, 201, 'com cpf');
  const [repetido, corpo] = await post('/api/auth/register', { ...CONTA, email: 'outro@exemplo.gov.br', cpf: '529.982.247-25' });
  igual(repetido, 409, 'cpf em uso: ' + (corpo.message || ''));
});

await teste('login devolve sessao', async () => {
  const [status, corpo] = await post('/api/auth/login', { email: CONTA.email, senha: CONTA.senha });
  igual(status, 200, 'status: ' + (corpo.message || ''));
  if (!corpo.token) throw new Error('sem token');
});

await teste('o audit_log registrou o login com IP e user-agent (colunas reais)', async () => {
  // A rota grava o audit_log sem esperar (logAudit nao e awaited: o login nao
  // deve atrasar por causa do log). A linha pode chegar depois da resposta —
  // num runner lento do CI chegou depois desta leitura, e o teste ficou
  // vermelho num run e verde no outro do mesmo commit. Espera ate 3 s.
  let linha;
  for (let i = 0; i < 30 && !linha; i++) {
    [linha] = await q(`SELECT action FROM audit_log WHERE action = 'user.login' ORDER BY created_at DESC LIMIT 1`);
    if (!linha) await new Promise(r => setTimeout(r, 100));
  }
  if (!linha) throw new Error('nenhuma linha de user.login em 3 s');
});

// ── coluna fantasma ─────────────────────────────────────────────────────────
//
// Quatro rotas escolhiam o mecanismo de incentivo lendo
// `org.incentive_group_code`. A coluna nunca existiu. `req.organization` vem
// de `SELECT * FROM organizations`, entao a leitura era sempre `undefined` e
// todo cliente caia na reserva 'ROUANET' — por mais de um ano, em silencio.
// Nada quebrava: em JavaScript, ler campo que nao existe nao e erro.
//
// Nenhum teste podia pegar isso em pg-mem, onde o schema e escrito a mao no
// proprio teste. So o Postgres real sabe quais colunas existem. Esta guarda
// cruza o que o codigo LE com o que a tabela TEM.
await teste('nenhuma rota le coluna de organizations que nao existe', async () => {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'organizations'`);
  const reais = new Set(rows.map(r => r.column_name));

  // Campos que o JavaScript acrescenta ao objeto depois de carrega-lo, ou que
  // sao metodos/propriedades da propria linguagem. Nao vem da tabela.
  const calculados = new Set(['rows', 'length', 'map', 'filter', 'find', 'toString', 'then']);

  // Apaga texto e comentario antes de procurar: 'org.created' e 'org.updated'
  // sao nomes de acao no audit_log, e '@casazul.org.br' e um e-mail. Nenhum
  // dos tres e leitura de coluna.
  const semTexto = js => js
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');

  const arquivos = [];
  const varre = dir => {
    for (const nome of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, nome.name);
      if (nome.isDirectory()) varre(caminho);
      else if (nome.name.endsWith('.js')) arquivos.push(caminho);
    }
  };
  varre(path.join(AQUI, '../src'));
  arquivos.push(path.join(AQUI, '../server.js'));

  const fantasmas = [];
  for (const caminho of arquivos) {
    const js = semTexto(fs.readFileSync(caminho, 'utf8'));
    for (const m of js.matchAll(/\b(?:req\.organization|org|organization)\s*\??\.\s*([a-z_][a-zA-Z0-9_]*)/g)) {
      const campo = m[1];
      if (reais.has(campo) || calculados.has(campo)) continue;
      const linha = js.slice(0, m.index).split('\n').length;
      fantasmas.push(`${path.relative(path.join(AQUI, '../..'), caminho)}:${linha}  org.${campo}`);
    }
  }
  if (fantasmas.length) {
    throw new Error('lendo coluna inexistente em organizations:\n          ' + [...new Set(fantasmas)].join('\n          '));
  }
});

await teste('o catalogo de mecanismos esta inteiro e sem duplicata', async () => {
  const grupos = await q('SELECT code, teto_codigo, disponivel_para_cliente FROM incentive_groups ORDER BY code');
  const codigos = grupos.map(g => g.code);
  if (codigos.length !== new Set(codigos).size) throw new Error('codigo repetido: ' + codigos.join(','));
  if (codigos.some(c => c !== c.toLowerCase())) throw new Error('codigo em maiuscula: ' + codigos.join(','));
  // Os sete de `laws` viraram grupo (migration 043).
  const leis = (await q('SELECT slug FROM laws')).map(l => l.slug);
  for (const slug of leis) {
    if (!codigos.includes(slug)) throw new Error(`a lei ${slug} nao virou mecanismo`);
  }
  // Quem esta disponivel para cliente tem teto declarado. Sem isso,
  // tetoDoMecanismo() cai no global de 6% — permissivo demais para quase todos.
  for (const g of grupos.filter(g => g.disponivel_para_cliente)) {
    if (!g.teto_codigo) throw new Error(`${g.code} esta disponivel para cliente e sem teto declarado`);
  }
  // E toda organizacao aponta para um mecanismo que existe (a chave
  // estrangeira garante, mas o teste diz qual quebrou se alguem a remover).
  const orfas = await q(
    `SELECT o.slug FROM organizations o
      LEFT JOIN incentive_groups g ON g.code = o.incentive_group_code
      WHERE g.code IS NULL`);
  if (orfas.length) throw new Error('organizacao com mecanismo inexistente: ' + orfas.map(o => o.slug).join(','));
});

await teste('o vocabulario do mecanismo existe no banco e esta completo (migration 051)', async () => {
  // Mesma armadilha de `org.incentive_group_code`: o codigo le `l.termo_*` e
  // `g.identificador` por JOIN. Se a coluna nao existir, o Postgres derruba a
  // consulta inteira; se existir vazia, a tela cai no texto de reserva sem
  // reclamar. As duas falhas sao silenciosas no pg-mem, que escreve o schema a
  // mao. Aqui o schema e o de verdade.
  const colunas = await q(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN
            (('incentive_groups','identificador'),
             ('laws','termo_identificador'), ('laws','termo_beneficiario'),
             ('laws','termo_recibo'), ('laws','termo_recibo_emissor'))`);
  if (colunas.length !== 5) {
    throw new Error(`faltam colunas do vocabulario: so ${colunas.length} das 5 existem`);
  }

  // Todo mecanismo que um cliente pode contratar precisa saber como chamar o
  // beneficiario e o recibo — sao as palavras que aparecem no aceite e no
  // e-mail, e reserva neutra em producao e texto vago sobre dinheiro real.
  const mudos = await q(
    `SELECT g.code FROM incentive_groups g
       LEFT JOIN laws l ON l.slug = g.law_slug
      WHERE g.disponivel_para_cliente = true
        AND (l.termo_beneficiario IS NULL OR l.termo_recibo IS NULL
             OR l.termo_recibo_emissor IS NULL)`);
  if (mudos.length) {
    throw new Error('mecanismo liberado sem vocabulario: ' + mudos.map(m => m.code).join(','));
  }

  // E quem diz usar registro externo tem de dizer como ele se chama: sem isso
  // identificaDestinacao() exige um numero que a tela nao sabe nomear.
  const sem = await q(
    `SELECT g.code FROM incentive_groups g
       LEFT JOIN laws l ON l.slug = g.law_slug
      WHERE g.identificador = 'pronac' AND l.termo_identificador IS NULL`);
  if (sem.length) {
    throw new Error('mecanismo com identificador externo e sem nome: ' + sem.map(m => m.code).join(','));
  }
});

await teste('todo status que o codigo escreve CABE na coluna (migration 054)', async () => {
  // A licao da coluna que o codigo le sem existir, um nivel adiante: o valor
  // que o codigo ESCREVE tem de caber.
  //
  // `donations.status` nasceu VARCHAR(20) e o fluxo tem um status de 21 —
  // `awaiting_confirmation`, escrito quando o contribuinte anexa o
  // comprovante. O pg-mem nao aplica comprimento de VARCHAR, entao a suite
  // inteira passava verde. Num Postgres de verdade e erro 22001: a pessoa
  // transferia o dinheiro, anexava o comprovante, recebia "Erro ao enviar
  // comprovante" e a destinacao ficava em `pending` para sempre — fora da fila
  // do gestor, sem recibo, com o dinheiro ja fora da conta dela.
  const [{ character_maximum_length: largura }] = await q(
    `SELECT character_maximum_length FROM information_schema.columns
      WHERE table_schema='public' AND table_name='donations' AND column_name='status'`);

  // Os literais vem do CODIGO, nao de uma lista escrita aqui: uma lista a mao
  // envelhece no dia em que alguem acrescentar um status numa rota.
  const SRC = path.join(AQUI, '../src');
  const arquivos = [];
  (function varre(dir) {
    for (const nome of fs.readdirSync(dir)) {
      const alvo = path.join(dir, nome);
      if (fs.statSync(alvo).isDirectory()) varre(alvo);
      else if (nome.endsWith('.js')) arquivos.push(alvo);
    }
  })(SRC);

  const achados = new Map();          // status -> primeiro arquivo onde aparece
  for (const arq of arquivos) {
    const texto = fs.readFileSync(arq, 'utf8');
    texto.split('\n').forEach((linha) => {
      if (!/\bstatus\b/.test(linha)) return;
      if (/^\s*(\/\/|\*)/.test(linha)) return;        // comentario nao escreve nada
      for (const m of linha.matchAll(/'([a-z][a-z_]{2,})'/g)) {
        if (!achados.has(m[1])) achados.set(m[1], path.relative(SRC, arq));
      }
    });
  }

  // O vocabulario real esta no CHECK da coluna: o que o banco aceita e a
  // verdade, e cruzar com ele descarta os literais que so passavam perto da
  // palavra "status" na mesma linha.
  const [{ pg_get_constraintdef: regra }] = await q(
    `SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conname = 'donations_status_conhecido'`);
  const permitidos = new Set([...regra.matchAll(/'([a-z_]+)'/g)].map(m => m[1]));

  if (!permitidos.size) throw new Error('a coluna status nao declara o vocabulario (CHECK ausente)');

  const grandes = [...permitidos].filter(s => s.length > largura);
  if (grandes.length) {
    throw new Error(
      `status maior que a coluna VARCHAR(${largura}): ` +
      grandes.map(s => `${s} (${s.length})`).join(', '));
  }

  // E o caminho inverso: status escrito numa rota e desconhecido do banco
  // seria recusado pelo CHECK em producao, em silencio ate alguem tentar.
  const fora = [...achados].filter(([s]) =>
    /^(pending|awaiting_|confirmed|cancelled|mecenato_|error$)/.test(s) && !permitidos.has(s));
  if (fora.length) {
    throw new Error('status escrito no codigo e ausente do CHECK: ' +
      fora.map(([s, a]) => `${s} (${a})`).join(', '));
  }
});

await teste('o comprovante avanca a destinacao num Postgres de verdade', async () => {
  // O teste acima guarda a regra; este guarda o efeito, que e o que importa:
  // depois do upload a destinacao tem de SAIR de `pending`, senao ela nunca
  // chega a fila do gestor. Escrito como o banco ve, sem passar pela rota, de
  // proposito — e o UPDATE que falhava, nao o multer.
  const [org] = await q(`SELECT id FROM organizations LIMIT 1`);
  const [pessoa] = await q(
    `INSERT INTO users (cpf, nome, email, senha_hash, email_verified, organization_id)
     VALUES ('11144477735','Auditoria','auditoria-status@exemplo.invalido','!',true,$1)
     ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome
     RETURNING id`, [org.id]);
  const [d] = await q(
    `INSERT INTO donations (user_id, organization_id, donation_amount, ir_devido, fiscal_year, status)
     VALUES ($1,$2,100,2000,2026,'pending') RETURNING id`, [pessoa.id, org.id]);

  try {
    await q(`UPDATE donations SET status = 'awaiting_confirmation' WHERE id = $1`, [d.id]);
    const [depois] = await q(`SELECT status FROM donations WHERE id = $1`, [d.id]);
    igual(depois.status, 'awaiting_confirmation', 'status apos o comprovante');
  } finally {
    // Sem o finally, uma falha aqui deixava a pessoa no banco e o teste
    // seguinte morria com "CPF ja esta em outra conta" — o defeito de verdade
    // escondido atras de um 409 que nao era sobre ele.
    await q(`DELETE FROM donations WHERE id = $1`, [d.id]);
    await q(`DELETE FROM users WHERE id = $1`, [pessoa.id]);
  }
});

// ── O CAMINHO DO DINHEIRO, INTEIRO ──────────────────────────────────────────
//
// Por que isto existe: em out/2026 o primeiro elo deste caminho estava
// QUEBRADO em producao e a suite inteira passava verde. `donations.status` era
// VARCHAR(20) e o upload do comprovante escreve `awaiting_confirmation`, que
// tem 21 — erro 22001 no Postgres, silencio no pg-mem.
//
// O defeito foi achado percorrendo o caminho a mao contra um Postgres de
// verdade. Este teste e aquela caminhada, para que ninguem precise repeti-la:
//
//   registrar -> comprovante -> fila do gestor -> conferir -> recibo do
//   proponente -> o destinador baixa o recibo dele
//
// Cada elo acontece DEPOIS de o dinheiro ter saido da conta de alguem. Um elo
// quebrado aqui nao e tela feia: e uma pessoa que pagou e nao tem prova.
await teste('o caminho do dinheiro vai de ponta a ponta num Postgres real', async () => {
  const { default: tenantMiddleware } = await import('../src/middleware/tenant.js');
  const { default: donationsRoutes } = await import('../src/routes/donations.js');
  const { default: uploadsRoutes } = await import('../src/routes/uploads.js');
  const { default: mecenatoRoutes } = await import('../src/routes/mecenato.js');

  // Um cliente com projeto E conta de captacao: sem conta, a rota recusa fora
  // da simulacao, e e justamente fora da simulacao que isto precisa valer.
  const [org] = await q(
    `INSERT INTO organizations (name, slug, incentive_group_code)
     VALUES ('Casa de Teste','casa-de-teste','rouanet')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING *`);
  await q(
    `INSERT INTO org_projects (organization_id, pronac, titulo, proponente_nome, uf,
                               bank_name, bank_code, bank_agency, bank_account,
                               is_active, is_featured)
     VALUES ($1,'9999999','Projeto de Teste','Proponente de Teste','DF',
             'Banco de Teste','001','0000-0','00000-0',true,true)
     ON CONFLICT DO NOTHING`, [org.id]);

  const app2 = express();
  app2.use(express.json());
  app2.use(tenantMiddleware);
  app2.use('/api/auth', authRoutes);
  app2.use('/api/donations', donationsRoutes);
  app2.use('/api/uploads', uploadsRoutes);
  app2.use('/api/mecenato', mecenatoRoutes);
  const srv2 = http.createServer(app2);
  await new Promise(r => srv2.listen(0, r));
  const B2 = `http://127.0.0.1:${srv2.address().port}`;
  const comOrg = (rota) => B2 + rota + (rota.includes('?') ? '&' : '?') + 'org=casa-de-teste';

  const entra = async (email) => {
    const r = await fetch(comOrg('/api/auth/login'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha: 'senha-bem-comprida' })
    });
    const corpo = await r.json();
    if (!corpo.token) throw new Error(`login de ${email}: ${corpo.message || r.status}`);
    return corpo.token;
  };
  const comJson = (rota, token, corpo) => fetch(comOrg(rota), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(corpo || {})
  }).then(async r => [r.status, await r.json().catch(() => ({}))]);
  const comArquivo = (rota, token, campo, extras = {}) => {
    const fd = new FormData();
    // Os bytes decidem o tipo do arquivo, entao o PDF tem de comecar com %PDF.
    fd.append(campo, new Blob([new TextEncoder().encode('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')],
      { type: 'application/pdf' }), 'arquivo.pdf');
    for (const [k, v] of Object.entries(extras)) fd.append(k, v);
    return fetch(comOrg(rota), { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd })
      .then(async r => [r.status, await r.json().catch(() => ({}))]);
  };

  try {
    // Quem destina e quem confere.
    const destinador = { nome: 'Servidor do Caminho', email: 'caminho@exemplo.invalido', senha: 'senha-bem-comprida', accepted_terms: true };
    const gestora    = { nome: 'Gestora do Caminho', email: 'gestora-caminho@exemplo.invalido', senha: 'senha-bem-comprida', accepted_terms: true };
    for (const conta of [destinador, gestora]) {
      await fetch(comOrg('/api/auth/register'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(conta)
      });
    }
    const [gid] = await q(`SELECT id FROM users WHERE email = $1`, [gestora.email]);
    await q(`INSERT INTO organization_users (organization_id, user_id, role, accepted_at, is_active)
             VALUES ($1,$2,'org_admin',NOW(),true)
             ON CONFLICT (organization_id, user_id) DO UPDATE SET role='org_admin', is_active=true`,
            [org.id, gid.id]);
    await q(`UPDATE users SET organization_id = $1 WHERE id = $2`, [org.id, gid.id]);

    const tokenDestinador = await entra(destinador.email);
    const tokenGestora    = await entra(gestora.email);

    // 1. registrar
    const [s1, r1] = await comJson('/api/donations/registrar', tokenDestinador, {
      pronac: '9999999', donation_amount: 500, ir_devido: 20000,
      cpf: '123.456.789-09', fiscal_year: 2026, modelo_completo: true
    });
    igual(s1, 201, 'registrar: ' + (r1.message || ''));
    const id = r1.donation?.id;
    if (!id) throw new Error('a destinacao nao voltou com id');

    // 2. o comprovante — o elo que estava quebrado
    const [s2, r2] = await comArquivo(`/api/uploads/receipt/${id}`, tokenDestinador, 'receipt',
      { transferido_em: '2026-10-02' });
    igual(s2, 200, 'comprovante: ' + (r2.message || ''));
    const [d2] = await q(`SELECT status, transferido_em FROM donations WHERE id = $1`, [id]);
    igual(d2.status, 'awaiting_confirmation', 'status apos o comprovante');
    if (!d2.transferido_em) throw new Error('a data da transferencia nao foi guardada');

    // 3. a fila do gestor — se a destinacao nao aparece aqui, ela sumiu
    const fila = await fetch(comOrg('/api/donations/conferencia'), {
      headers: { Authorization: 'Bearer ' + tokenGestora }
    }).then(r => r.json());
    if (!(fila.aguardando || []).some(d => d.id === id)) {
      throw new Error('a destinacao nao apareceu na fila do gestor');
    }

    // 4. conferir
    const [s4, r4] = await comJson(`/api/donations/${id}/confirmar`, tokenGestora);
    igual(s4, 200, 'confirmar: ' + (r4.message || ''));
    const [d4] = await q(`SELECT status, confirmed_at FROM donations WHERE id = $1`, [id]);
    igual(d4.status, 'confirmed', 'status apos a conferencia');
    if (!d4.confirmed_at) throw new Error('a conferencia nao marcou quando foi');

    // 5. o recibo do proponente — o documento que vale na declaracao
    const [s5, r5] = await comArquivo(`/api/mecenato/${id}`, tokenGestora, 'mecenato');
    igual(s5, 200, 'recibo: ' + (r5.message || ''));
    const [d5] = await q(`SELECT status, mecenato_filename FROM donations WHERE id = $1`, [id]);
    igual(d5.status, 'mecenato_issued', 'status apos o recibo');
    if (!d5.mecenato_filename) throw new Error('o recibo nao ficou registrado');

    // 6. e o destinador consegue baixar o recibo DELE
    const baixa = await fetch(comOrg(`/api/mecenato/${id}/arquivo`), {
      headers: { Authorization: 'Bearer ' + tokenDestinador }
    });
    igual(baixa.status, 200, 'o destinador nao baixa o proprio recibo');
    const bytes = (await baixa.arrayBuffer()).byteLength;
    if (bytes < 10) throw new Error('o recibo baixado veio vazio');

    // 7. e o CLIENTE ve o que entrou — num Postgres de verdade.
    //
    // O painel do cliente soma com SUM(CASE WHEN ...), e a suite normal roda
    // no pg-mem, que ja ignorou FILTER calado nesta casa e devolveu a soma
    // inteira. Aqui a conta e conferida contra o Postgres: a destinacao que
    // acabou de percorrer o caminho inteiro tem de aparecer no captado, e o
    // ENSAIO tem de ficar de fora dele.
    const resultado = async () => (await fetch(comOrg('/api/donations/resultado'), {
      headers: { Authorization: 'Bearer ' + tokenGestora }
    }).then(r => r.json())).resultado;

    const r7 = await resultado();
    if (!r7) throw new Error('a rota do resultado nao respondeu');
    if (Number(r7.confirmado.valor) < 500) {
      throw new Error(`a destinacao conferida nao entrou no captado: ${r7.confirmado.valor}`);
    }
    if (Number(r7.confirmado.pessoas) < 1) throw new Error('nenhuma pessoa contada');

    const captadoAntes = Number(r7.confirmado.valor);
    const [dest] = await q(`SELECT user_id FROM donations WHERE id = $1`, [id]);
    await q(
      `INSERT INTO donations (user_id, organization_id, donation_amount, ir_devido,
                              fiscal_year, pronac, projeto_titulo, status, simulada)
       VALUES ($1,$2,99999,1000000,2026,'9999999','Projeto de Teste','confirmed',true)`,
      [dest.user_id, org.id]);

    const r7b = await resultado();
    igual(Number(r7b.confirmado.valor), captadoAntes,
      'o ensaio entrou no captado num Postgres de verdade');
    igual(Number(r7b.simulado.valor), 99999, 'o ensaio nao foi para a caixa dele');
    if (!r7b.tem_simulacao) throw new Error('o painel nao avisa que ha ensaio dentro');
  } finally {
    srv2.close();
  }
});

servidor.close();
await pool.end();

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam  (Postgres real: ${nomeDoBanco})`);
process.exit(falhas.length ? 1 : 0);
