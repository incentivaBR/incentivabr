// O semeador engole os proprios erros de proposito — ele e conveniencia de
// demonstracao, e nao pode derrubar o servidor. O preco desse desenho e que uma
// coluna com nome errado nao falha: ela vira uma linha de log e a Casa Azul
// simplesmente nao aparece. Voce descobre na reuniao de venda.
//
// Por isso este teste roda o semeador de verdade contra um Postgres em memoria
// com o formato das tabelas de producao, e depois confere o banco.
import { newDb } from 'pg-mem';

process.env.NODE_ENV = 'test';
process.env.SIMULATION_MODE = 'true';
process.env.DEMO_GESTOR_EMAIL = 'gestor@casazul.org.br';
process.env.DEMO_GESTOR_SENHA = 'senha-de-teste';

const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});

db.public.none(`
  CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT, slug TEXT UNIQUE, cnpj TEXT, plan_type TEXT,
    fund_type TEXT, fund_name TEXT, max_percentage NUMERIC,
    contact_email TEXT, primary_color TEXT, secondary_color TEXT,
    logo_url TEXT, contracted_at TIMESTAMP, is_active BOOLEAN DEFAULT true,
    -- migration 039: os textos da home do cliente.
    hero_titulo TEXT, hero_subtitulo TEXT, sobre TEXT
  );
  CREATE TABLE users (encerrada_em TIMESTAMP, anonimizada_em TIMESTAMP, 
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpf TEXT, nome TEXT, email TEXT, senha_hash TEXT,
    email_verified BOOLEAN DEFAULT false, organization_id UUID,
    total_donated NUMERIC DEFAULT 0
  );
  CREATE TABLE organization_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL, user_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    invited_at TIMESTAMP DEFAULT NOW(), accepted_at TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (organization_id, user_id)
  );
  CREATE TABLE org_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, pronac TEXT, titulo TEXT, area TEXT, segmento TEXT,
    descricao TEXT, uf TEXT, proponente_nome TEXT, proponente_cnpj TEXT,
    -- Os bancarios existem na tabela de verdade; sem eles aqui, a guarda de
    -- "ninguem inventou conta" leria undefined e passaria sem provar nada.
    bank_name TEXT, bank_code TEXT, bank_agency TEXT, bank_account TEXT,
    pix_key TEXT, pix_key_type TEXT,
    is_active BOOLEAN DEFAULT true, is_featured BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, organization_id UUID, donation_amount NUMERIC, ir_devido NUMERIC,
    fiscal_year INT, pronac TEXT, projeto_titulo TEXT, status TEXT DEFAULT 'pending',
    receipt_url TEXT, receipt_filename TEXT, created_at TIMESTAMP DEFAULT NOW()
  );
`);

const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);
poolReal.connect = async () => ({ query: (...a) => poolFalso.query(...a), release() {} });

const { semeiaCasaAzul } = await import('../src/config/semeiaCasaAzul.js');
const q = async (sql, p) => (await poolFalso.query(sql, p)).rows;

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

await semeiaCasaAzul(poolReal);

await teste('a organizacao existe com a marca, nao com a razao social', async () => {
  const [org] = await q(`SELECT * FROM organizations WHERE slug = 'casa-azul'`);
  if (!org) throw new Error('a Casa Azul nao foi criada — o semeador engoliu algum erro');
  // A tela do destinador mostra a marca; a razao social e assunto do recibo.
  if (org.name !== 'Casa Azul Felipe Augusto') throw new Error('nome: ' + org.name);
  if (!org.logo_url) throw new Error('sem logo — a pagina sai com a marca errada');
  if (!/^#[0-9A-Fa-f]{6}$/.test(org.primary_color)) throw new Error('cor: ' + org.primary_color);
  if (org.primary_color === org.secondary_color) {
    throw new Error('cor de destaque igual a primaria — botoes somem no fundo');
  }
});

await teste('o projeto vinculado e o PRONAC real do SALIC', async () => {
  const [p] = await q(`SELECT * FROM org_projects WHERE pronac = '2511274'`);
  if (!p) throw new Error('projeto nao vinculado');
  if (p.proponente_nome !== 'ASSISTENCIA SOCIAL CASA AZUL') {
    throw new Error('o proponente tem que ser a razao social, veio: ' + p.proponente_nome);
  }
  if (!p.is_featured) throw new Error('nao esta em destaque — nao aparece na home');
});

await teste('a ficha do projeto e a do SALIC, nao a de memoria', async () => {
  // Consulta de set/2026 ao SALIC, PRONAC 2511274. O segmento estava escrito
  // como "Musica" e o oficial e danca: a sintese fala em oficinas de expressao
  // corporal e espetaculo de danca COM musica ao vivo. E o que o destinador le
  // para decidir se aquele projeto e a causa dele.
  const [p] = await q(`SELECT * FROM org_projects WHERE pronac = '2511274'`);
  if (p.segmento !== 'Apresentação ou Performance de Dança') {
    throw new Error('segmento fora do SALIC: ' + p.segmento);
  }
  if (p.area !== 'Artes Cênicas') throw new Error('area: ' + p.area);
  if (p.uf !== 'DF') throw new Error('uf: ' + p.uf);
  // O CNPJ da MATRIZ. Ha filiais /0002-00 e /0003-91, e recibo com o CNPJ
  // errado nao serve para a Receita.
  if (p.proponente_cnpj !== '33.486.911/0001-20') {
    throw new Error('cnpj: ' + p.proponente_cnpj);
  }
  // A descricao e a sintese aprovada pelo Ministerio, nao um resumo nosso.
  if (!/oficinas de expressão corporal/.test(p.descricao || '')) {
    throw new Error('a descricao nao e a sintese do SALIC: ' + (p.descricao || '').slice(0, 60));
  }
});

await teste('o seed CORRIGE um projeto que ficou errado num deploy anterior', async () => {
  // O mesmo defeito que organizacao() ja tinha: devolver cedo quando a linha
  // existe deixa o erro cristalizado no banco. Foi assim que "Musica" ficou em
  // producao depois de o cadastro ser corrigido no codigo.
  await q(`UPDATE org_projects
              SET segmento = 'Música', titulo = 'Titulo Velho', proponente_cnpj = NULL
            WHERE pronac = '2511274'`);
  await semeiaCasaAzul(poolReal);

  const [p] = await q(`SELECT * FROM org_projects WHERE pronac = '2511274'`);
  if (p.segmento === 'Música') throw new Error('nao corrigiu o segmento');
  if (p.titulo !== 'Casa Azul Celebra: Ritmos que Transformam') throw new Error('nao corrigiu o titulo');
  if (!p.proponente_cnpj) throw new Error('nao preencheu o CNPJ');
});

await teste('convergir NAO apaga o que so a Casa Azul informa', async () => {
  // Conta de captacao, agencia e PIX vem pela tela, e sao o que faz o recibo
  // existir. Um seed que os tocasse apagaria esse dado a cada deploy — e
  // deposito na conta errada nao gera recibo.
  await q(`UPDATE org_projects
              SET bank_name = 'Banco do Brasil', bank_agency = '2895-9',
                  bank_account = 'conta-informada-pela-tela', pix_key = 'chave-do-cliente'
            WHERE pronac = '2511274'`);
  await semeiaCasaAzul(poolReal);

  const [p] = await q(`SELECT * FROM org_projects WHERE pronac = '2511274'`);
  if (p.bank_account !== 'conta-informada-pela-tela') throw new Error('o seed apagou a conta de captacao');
  if (p.bank_agency !== '2895-9') throw new Error('o seed apagou a agencia');
  if (p.pix_key !== 'chave-do-cliente') throw new Error('o seed apagou a chave PIX');

  // Devolve ao estado limpo para as guardas seguintes.
  await q(`UPDATE org_projects
              SET bank_name = NULL, bank_agency = NULL, bank_account = NULL, pix_key = NULL
            WHERE pronac = '2511274'`);
});

await teste('a home do cliente tem texto proprio, e sem numero que nao conferimos', async () => {
  const [org] = await q(`SELECT * FROM organizations WHERE slug = 'casa-azul'`);
  for (const campo of ['hero_titulo', 'hero_subtitulo', 'sobre']) {
    if (!org[campo] || org[campo].length < 20) {
      throw new Error(`${campo} vazio — a home abre com o texto neutro da plataforma`);
    }
  }
  const tudo = [org.hero_titulo, org.hero_subtitulo, org.sobre].join(' ');

  // Anos de atuacao, atendidos, unidades e selos sao plausiveis e chegaram por
  // resumo de busca. Site de cliente nao e lugar para dado que nao conferimos
  // na fonte — a mesma regra que manteve os numeros do piloto fora da home.
  const numeros = tudo.match(/\b\d{2,}\b/g);
  if (numeros) throw new Error('numero sem fonte no texto do cliente: ' + numeros.join(', '));
  if (/melhores ONGs|selo|certifica/i.test(tudo)) {
    throw new Error('o texto afirma premio ou selo que nao conferimos na fonte');
  }

  // Percentual tem fonte unica em tetos_deducao. Escrito aqui, viraria a copia
  // que nao acompanha o banco.
  if (/%/.test(tudo)) throw new Error('percentual escrito no texto do tenant');
});

await teste('a conta de captacao fica em branco de proposito', async () => {
  const [p] = await q(`SELECT * FROM org_projects WHERE pronac = '2511274'`);
  // Deposito na conta errada nao gera recibo e o servidor perde a deducao.
  // So a Casa Azul pode informar a conta; inventar aqui seria pior que faltar.
  if (p.bank_account) throw new Error('alguem inventou uma conta bancaria');
});

await teste('existe um org_admin — sem ele a fila de conferencia nao abre', async () => {
  const [v] = await q(`
    SELECT ou.role, u.email FROM organization_users ou
    JOIN users u ON u.id = ou.user_id
    JOIN organizations o ON o.id = ou.organization_id
    WHERE o.slug = 'casa-azul' AND ou.role = 'org_admin'`);
  if (!v) throw new Error('nenhum org_admin — a tela que interessa ao cliente fica trancada');
  if (v.email !== 'gestor@casazul.org.br') throw new Error('email: ' + v.email);
});

await teste('a senha do gestor foi guardada com hash', async () => {
  const [u] = await q(`SELECT senha_hash FROM users WHERE email = 'gestor@casazul.org.br'`);
  if (!u.senha_hash?.startsWith('$2')) throw new Error('senha em claro no banco');
  if (u.senha_hash.includes('senha-de-teste')) throw new Error('a senha aparece no hash');
});

await teste('a fila de conferencia nao esta vazia', async () => {
  const linhas = await q(`
    SELECT d.* FROM donations d JOIN organizations o ON o.id = d.organization_id
    WHERE o.slug = 'casa-azul' AND d.status = 'awaiting_confirmation'`);
  if (linhas.length < 3) throw new Error('so ' + linhas.length + ' — tela vazia nao demonstra nada');
  if (linhas.some(l => !l.receipt_url)) throw new Error('destinacao sem comprovante para conferir');
});

await teste('corrige uma marca que ficou errada num deploy anterior', async () => {
  // Foi o que aconteceu de verdade: a organizacao nasceu com o lockup vertical
  // no cabeçalho, e nenhum deploy seguinte corrigia — semeador idempotente que
  // nao converge deixa o erro cristalizado no banco, mais dificil de ver que no
  // codigo.
  await q(`UPDATE organizations
              SET logo_url = '/assets/errado.png', primary_color = '#000000', name = 'Nome Velho'
            WHERE slug = 'casa-azul'`);
  await semeiaCasaAzul(poolReal);

  const [org] = await q(`SELECT * FROM organizations WHERE slug = 'casa-azul'`);
  if (org.logo_url === '/assets/errado.png') throw new Error('nao corrigiu a logo');
  if (org.primary_color !== '#1E346B') throw new Error('nao corrigiu a cor: ' + org.primary_color);
  if (org.name !== 'Casa Azul Felipe Augusto') throw new Error('nao corrigiu o nome');
});

await teste('a logo do cabecalho e o simbolo, nao o lockup vertical', async () => {
  // O lockup e 1122x1520; renderizado a 18px de ALTURA vira uma lasca de 13px
  // de largura, com o nome do cliente ilegivel na tela dele.
  const [org] = await q(`SELECT logo_url FROM organizations WHERE slug = 'casa-azul'`);
  if (!/simbolo/.test(org.logo_url)) throw new Error('logo do cabecalho: ' + org.logo_url);
});

await teste('rodar de novo nao duplica nada', async () => {
  await semeiaCasaAzul(poolReal);
  await semeiaCasaAzul(poolReal);
  const orgs = await q(`SELECT id FROM organizations WHERE slug = 'casa-azul'`);
  const projetos = await q(`SELECT id FROM org_projects WHERE pronac = '2511274'`);
  const fila = await q(`SELECT id FROM donations WHERE status = 'awaiting_confirmation'`);
  if (orgs.length !== 1) throw new Error('organizacoes: ' + orgs.length);
  if (projetos.length !== 1) throw new Error('projetos: ' + projetos.length);
  if (fila.length !== 3) throw new Error('fila cresceu para ' + fila.length + ' a cada boot');
});

await teste('com a chave de producao ligada, o semeador nao age', async () => {
  // Destinacao de ficcao numa fila onde alguem confirma dinheiro de verdade
  // seria o pior defeito possivel deste arquivo.
  process.env.SIMULATION_MODE = 'false';
  await q(`DELETE FROM donations`);
  await semeiaCasaAzul(poolReal);
  const fila = await q(`SELECT id FROM donations`);
  process.env.SIMULATION_MODE = 'true';
  if (fila.length) throw new Error('semeou ficcao com SIMULATION_MODE=false');
});

console.log('\n================================================================');
ok.forEach(n => console.log('  ok   ', n));
falhas.forEach(([n, e]) => console.log('  FALHA', n, '\n          ' + e));
console.log('================================================================');
console.log(`${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
