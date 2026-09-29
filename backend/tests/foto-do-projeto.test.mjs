// A foto do projeto, e a autorização que ela exige.
//
// O white-label não tinha campo de imagem: a foto do projeto do piloto tinha
// sido tirada das páginas porque aparecia no site de QUALQUER cliente, e desde
// então o topo era só a paleta. Uma home sem imagem nenhuma não sustenta uma
// apresentação, e é por isso que o campo existe.
//
// O que estes testes guardam, em ordem de gravidade:
//
//   1. FOTO SEM AUTORIZAÇÃO DECLARADA NÃO É PUBLICADA. As fotos boas de uma
//      OSC que atende crianças são de crianças; o ECA (arts. 17 e 18) trata a
//      imagem como parte do direito ao respeito e a LGPD (art. 14) exige o
//      melhor interesse. A plataforma não pode conferir a autorização — pode
//      recusar-se a publicar sem que alguém a declare, com nome e data;
//   2. a rota da foto é escopada pelo tenant, sem id na URL: nenhum site pode
//      servir a foto do projeto de outro cliente;
//   3. só imagem sai pela rota da foto. O armazenamento é o mesmo dos
//      comprovantes, e entregar um comprovante bancário como "imagem" seria
//      vazar documento fiscal de servidor em rota pública;
//   4. a condição de publicar mora num lugar só.
import { newDb } from 'pg-mem';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

process.env.NODE_ENV = 'test';
process.env.SIMULATION_MODE = 'true';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};
const igual = (a, b, o) => {
  if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
};

// ───────────────────────────────────────────────────────────────────────────
// 1. A regra, pura
// ───────────────────────────────────────────────────────────────────────────
const {
  fotoPublicavel, enderecoDaFoto, fotoParaATela, declarouAutorizacao,
  PREFIXO, TIPOS_DE_IMAGEM
} = await import('../src/lib/fotoDoProjeto.js');

await teste('sem autorizacao declarada, a foto NAO e publicavel', () => {
  const guardada = { foto_chave: 'projetos/2026/09/projeto-x.jpg', foto_autorizacao_em: null };
  igual(fotoPublicavel(guardada), false, 'arquivo existe, autorização não');
  igual(enderecoDaFoto(guardada), null, 'endereço');
  igual(fotoParaATela(guardada), null, 'o que a tela recebe');
});

await teste('sem arquivo, autorizacao nao inventa foto', () => {
  igual(fotoPublicavel({ foto_chave: null, foto_autorizacao_em: new Date() }), false, 'sem chave');
  igual(fotoPublicavel(null), false, 'sem projeto');
  igual(fotoPublicavel({}), false, 'projeto vazio');
});

await teste('com as duas coisas, a foto sai com o credito', () => {
  const p = {
    foto_chave: 'projetos/2026/09/projeto-x.jpg',
    foto_autorizacao_em: new Date(),
    foto_sha256: 'abcdef1234567890',
    foto_credito: 'Acervo da instituição'
  };
  igual(fotoPublicavel(p), true, 'publicável');
  const t = fotoParaATela(p);
  igual(t.credito, 'Acervo da instituição', 'crédito');
  if (!t.url.startsWith('/api/salic/org-project/foto')) throw new Error('endereço inesperado: ' + t.url);
  if (!t.url.includes('v=abcdef12')) throw new Error('o endereço não muda quando a foto muda: ' + t.url);
});

await teste('o endereco da foto nao tem id de projeto', () => {
  // Com `/api/projetos/:id/foto`, o site de um cliente serviria a foto do
  // projeto de outro — e a separação white-label é o que não se pode furar.
  const url = enderecoDaFoto({
    foto_chave: 'k', foto_autorizacao_em: new Date(), foto_sha256: 'deadbeefcafe'
  });
  if (/[0-9a-f]{8}-[0-9a-f]{4}/.test(url)) throw new Error('o endereço carrega um id: ' + url);
});

await teste('checkbox nao marcado e NAO, nunca sim', () => {
  // Um checkbox desmarcado não manda campo nenhum. Ler ausência como "sim"
  // publicaria foto de criança por acidente.
  for (const v of [undefined, null, '', 'false', false, 'nao', '0', 0]) {
    igual(declarouAutorizacao(v), false, `valor ${JSON.stringify(v)}`);
  }
  for (const v of [true, 'true', 'on', '1']) {
    igual(declarouAutorizacao(v), true, `valor ${JSON.stringify(v)}`);
  }
});

await teste('so imagem entra como foto de capa', () => {
  if (TIPOS_DE_IMAGEM.includes('pdf')) throw new Error('PDF não é foto de capa');
  igual(PREFIXO, 'projetos', 'prefixo das chaves');
});

// ───────────────────────────────────────────────────────────────────────────
// 2. A rota, com banco e armazenamento de mentira
// ───────────────────────────────────────────────────────────────────────────
const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});
db.public.none(`
  CREATE TABLE organizations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT, slug TEXT, pronac TEXT, max_percentage NUMERIC,
    contact_email TEXT, contact_phone TEXT, incentive_group_code TEXT);
  CREATE TABLE org_projects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, pronac TEXT, titulo TEXT, area TEXT, segmento TEXT,
    descricao TEXT, uf TEXT, proponente_nome TEXT, proponente_cnpj TEXT,
    bank_name TEXT, bank_code TEXT, bank_agency TEXT, bank_account TEXT,
    pix_key TEXT, pix_key_type TEXT,
    foto_chave TEXT, foto_credito TEXT, foto_sha256 TEXT, foto_bytes INT,
    foto_atualizada_em TIMESTAMP, foto_autorizacao_em TIMESTAMP, foto_autorizacao_por UUID,
    is_active BOOLEAN DEFAULT true, is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW());
`);
const pgMem = db.adapters.createPg();
const pool = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => pool.query(...a);

// Armazenamento de mentira: guarda em memória e devolve o tipo que recebeu.
// É o que permite provar a guarda do Content-Type sem subir S3 nem escrever
// em disco.
const guardados = new Map();
const { usaArmazenamento } = await import('../src/services/armazenamento.js');
usaArmazenamento({
  nome: 'memoria',
  async guarda(chave, buffer, contentType) {
    guardados.set(chave, { buffer, contentType });
    return { chave, sha256: 'f'.repeat(64), bytes: buffer.length };
  },
  async abre(chave) {
    const a = guardados.get(chave);
    if (!a) return null;
    const { Readable } = await import('stream');
    return { stream: Readable.from([a.buffer]), contentType: a.contentType, bytes: a.buffer.length };
  },
  async existe(chave) { return guardados.has(chave); },
  async apaga(chave) { guardados.delete(chave); }
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47]), Buffer.alloc(64, 7)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(64, 7)]);
guardados.set('projetos/2026/09/projeto-ok.png', { buffer: PNG, contentType: 'image/png' });
guardados.set('receipts/2026/09/receipt-de-alguem.pdf', { buffer: PDF, contentType: 'application/pdf' });

const { rows: [orgA] } = await pool.query(
  `INSERT INTO organizations (name, slug, incentive_group_code) VALUES ('Casa Azul','casa-azul','rouanet') RETURNING id`);
const { rows: [orgB] } = await pool.query(
  `INSERT INTO organizations (name, slug, incentive_group_code) VALUES ('Outro Cliente','outro','rouanet') RETURNING id`);

await pool.query(
  `INSERT INTO org_projects (organization_id, pronac, titulo, foto_chave, foto_sha256, foto_credito, foto_autorizacao_em)
   VALUES ($1,'2511274','Ritmos que Transformam','projetos/2026/09/projeto-ok.png','abcdef1234','Acervo',NOW())`,
  [orgA.id]);
await pool.query(
  `INSERT INTO org_projects (organization_id, pronac, titulo) VALUES ($1,'999999','Projeto sem foto')`,
  [orgB.id]);

const { default: salicRoutes } = await import('../src/routes/salic.js');

async function sobe(org) {
  const app = express();
  app.use((req, _res, next) => { req.organization = org; next(); });
  app.use('/api/salic', salicRoutes);
  const s = http.createServer(app);
  await new Promise(r => s.listen(0, r));
  return { s, base: `http://127.0.0.1:${s.address().port}` };
}

const a = await sobe({ id: orgA.id, slug: 'casa-azul' });
const b = await sobe({ id: orgB.id, slug: 'outro' });

await teste('a rota entrega a foto do projeto do tenant, inline e cacheavel', async () => {
  const r = await fetch(a.base + '/api/salic/org-project/foto');
  igual(r.status, 200, 'status');
  igual(r.headers.get('content-type'), 'image/png', 'tipo');
  // `attachment` faria o navegador baixar o arquivo em vez de desenhar a foto.
  if (/attachment/.test(r.headers.get('content-disposition') || '')) {
    throw new Error('a foto está sendo entregue como download');
  }
  if (!/public/.test(r.headers.get('cache-control') || '')) {
    throw new Error('a foto do site seria buscada de novo a cada navegação');
  }
});

await teste('o cliente sem foto recebe 404, e nao a foto do outro', async () => {
  const r = await fetch(b.base + '/api/salic/org-project/foto');
  igual(r.status, 404, 'status');
});

await teste('tirar a autorizacao tira a foto do ar na hora', async () => {
  await pool.query('UPDATE org_projects SET foto_autorizacao_em = NULL WHERE organization_id = $1', [orgA.id]);
  const r = await fetch(a.base + '/api/salic/org-project/foto');
  igual(r.status, 404, 'status com a autorização retirada');

  const marca = await (await fetch(a.base + '/api/salic/org-project')).json();
  igual(marca.projeto.foto, null, 'o JSON também deixa de trazer a foto');

  await pool.query('UPDATE org_projects SET foto_autorizacao_em = NOW() WHERE organization_id = $1', [orgA.id]);
});

await teste('org-project leva a foto para a tela', async () => {
  const d = await (await fetch(a.base + '/api/salic/org-project')).json();
  if (!d.projeto?.foto?.url) throw new Error('o JSON não traz a foto');
  igual(d.projeto.foto.credito, 'Acervo', 'crédito');
});

await teste('a rota da foto RECUSA entregar um comprovante', async () => {
  // O armazenamento é o mesmo dos comprovantes. Se uma chave errada apontasse
  // para um PDF de comprovante bancário, esta rota pública entregaria documento
  // fiscal de servidor. A conferência do tipo é a última linha antes disso.
  await pool.query(
    `UPDATE org_projects SET foto_chave = 'receipts/2026/09/receipt-de-alguem.pdf' WHERE organization_id = $1`,
    [orgA.id]);
  const r = await fetch(a.base + '/api/salic/org-project/foto');
  igual(r.status, 404, 'um PDF de comprovante não sai pela rota da foto');

  await pool.query(
    `UPDATE org_projects SET foto_chave = 'projetos/2026/09/projeto-ok.png' WHERE organization_id = $1`,
    [orgA.id]);
});

a.s.close();
b.s.close();

// ───────────────────────────────────────────────────────────────────────────
// 3. A condição mora num lugar só
// ───────────────────────────────────────────────────────────────────────────

await teste('nenhuma rota repete a condicao de publicar a foto', () => {
  // "tem chave e tem autorização" escrito duas vezes é uma cópia que um dia
  // esquece a segunda metade — e aí publica.
  const dir = path.join(RAIZ, 'backend/src');
  const culpados = [];
  (function anda(d) {
    for (const nome of fs.readdirSync(d)) {
      const p = path.join(d, nome);
      if (fs.statSync(p).isDirectory()) { anda(p); continue; }
      if (!nome.endsWith('.js') || nome === 'fotoDoProjeto.js') continue;
      const texto = fs.readFileSync(p, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
      if (/foto_chave[^;]{0,80}foto_autorizacao_em\s*(&&|IS NOT NULL)/i.test(texto)
          || /foto_autorizacao_em[^;]{0,60}&&[^;]{0,60}foto_chave/i.test(texto)) {
        culpados.push(path.relative(RAIZ, p));
      }
    }
  })(dir);
  if (culpados.length) {
    throw new Error('a condição foi copiada para: ' + culpados.join(', ') + ' — use fotoPublicavel()');
  }
});

await teste('a migration 052 pede a autorizacao e explica por que', () => {
  const sql = fs.readFileSync(path.join(RAIZ, 'backend/src/migrations/052_foto_do_projeto.sql'), 'utf8');
  for (const coluna of ['foto_chave', 'foto_credito', 'foto_autorizacao_em', 'foto_autorizacao_por']) {
    if (!sql.includes(coluna)) throw new Error(`a 052 não cria ${coluna}`);
  }
  // A base legal fica escrita onde a coluna nasce: sem isso, a próxima pessoa
  // acha a autorização burocracia nossa e tira.
  if (!/ECA|8\.069/.test(sql)) throw new Error('a 052 não cita o ECA');
  if (!/art\.\s*14/.test(sql)) throw new Error('a 052 não cita o art. 14 da LGPD');
  // URL de terceiro foi recusada de propósito.
  if (!/chave/i.test(sql)) throw new Error('a 052 deveria guardar a chave, não uma URL');
});

await teste('a pagina nao volta a ter foto escrita a mao', () => {
  // Era a foto do piloto no site de todo cliente. A marcação existe para que o
  // arquivo venha do cadastro; um `background-image` com caminho de asset de
  // projeto seria a volta do mesmo defeito.
  const paginas = ['index.html', 'projetos-rouanet.html', 'destinar-rouanet.html'];
  for (const nome of paginas) {
    const html = fs.readFileSync(path.join(RAIZ, 'frontend', nome), 'utf8');
    if (!/data-projeto-foto/.test(html)) {
      throw new Error(`${nome} não marca onde entra a foto do projeto`);
    }
    const m = html.match(/background-image\s*:\s*url\(\s*["']?(?!\$|data:)[^)]*\.(jpg|jpeg|png|webp)/i);
    if (m) throw new Error(`${nome} tem foto escrita à mão: ${m[0]}`);
  }
});

console.log('\nFoto do projeto\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
