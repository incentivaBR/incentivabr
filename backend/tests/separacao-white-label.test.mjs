// O que é da IncentivaBR e o que é do cliente white-label.
//
// O mesmo processo serve a plataforma (organização `www`) e cada cliente. A
// maior parte da diferença é texto, e `tenant.js` resolve escondendo trechos
// marcados. Duas coisas não se resolvem no navegador:
//
//   - uma página inteira que só faz sentido na IncentivaBR (a carta de vendas
//     do white-label). Esconder um link não some com o endereço;
//   - um trecho que, sob a marca do cliente, vira afirmação falsa — os
//     depoimentos do piloto do DF não são da base dele.
//
// O que estes testes guardam:
//   - a guarda recusa a página da plataforma no domínio do cliente, e não
//     atrapalha a própria plataforma;
//   - ela roda ANTES do estático. Depois, o arquivo já teria saído daqui;
//   - o `?org=` sobrevive ao redirecionamento, senão testar um cliente em
//     desenvolvimento devolve sempre a página da IncentivaBR;
//   - toda página listada existe de verdade;
//   - na página inicial, o cartão que vende o white-label e os depoimentos do
//     piloto ficam dentro de `data-so-plataforma`.
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  PAGINAS_DA_PLATAFORMA,
  ehPaginaDaPlataforma,
  guardaDePaginasDaPlataforma
} from '../src/lib/paginasDaPlataforma.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
const FRONTEND = path.join(RAIZ, 'frontend');

// Um servidor mínimo com a mesma ordem do server.js: tenant, guarda, estático.
const app = express();
app.use((req, _res, next) => {
  const slug = req.query.org || 'www';
  req.organization = { slug };
  next();
});
app.use(guardaDePaginasDaPlataforma);
app.use(express.static(FRONTEND));
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

await teste('a pagina da plataforma abre normalmente na IncentivaBR', async () => {
  const r = await fetch(`${BASE}/para-associacoes.html`, { redirect: 'manual' });
  if (r.status !== 200) throw new Error('status ' + r.status);
});

await teste('no site do cliente, a pagina da plataforma nao abre', async () => {
  const r = await fetch(`${BASE}/para-associacoes.html?org=casa-azul`, { redirect: 'manual' });
  if (r.status !== 302) throw new Error('status ' + r.status);
  const destino = r.headers.get('location') || '';
  if (!destino.startsWith('/index.html')) throw new Error('foi para: ' + destino);
});

await teste('o redirecionamento leva o ?org= junto', async () => {
  const r = await fetch(`${BASE}/para-associacoes.html?org=casa-azul`, { redirect: 'manual' });
  if (!/[?&]org=casa-azul/.test(r.headers.get('location') || '')) {
    throw new Error('perdeu o org: ' + r.headers.get('location'));
  }
});

await teste('o resto do site segue igual para o cliente', async () => {
  const r = await fetch(`${BASE}/faq.html?org=casa-azul`, { redirect: 'manual' });
  if (r.status !== 200) throw new Error('a guarda pegou uma pagina que nao e dela: ' + r.status);
});

await teste('maiuscula no endereco nao burla a guarda', () => {
  if (!ehPaginaDaPlataforma('/Para-Associacoes.HTML')) throw new Error('passou');
});

await teste('toda pagina listada existe no frontend', () => {
  for (const pagina of PAGINAS_DA_PLATAFORMA) {
    const arquivo = path.join(FRONTEND, pagina.replace(/^\//, ''));
    if (!fs.existsSync(arquivo)) throw new Error('listada e inexistente: ' + pagina);
  }
});

await teste('a guarda roda depois do tenant e antes do estatico', () => {
  const server = fs.readFileSync(path.join(RAIZ, 'backend/server.js'), 'utf8');
  const tenant  = server.indexOf('app.use(tenantMiddleware)');
  const guarda  = server.indexOf('app.use(guardaDePaginasDaPlataforma)');
  const estatico = server.indexOf('app.use(express.static(frontendPath))');
  if (tenant < 0 || guarda < 0 || estatico < 0) throw new Error('faltou alguma linha no server.js');
  if (!(tenant < guarda && guarda < estatico)) {
    throw new Error(`ordem errada: tenant ${tenant}, guarda ${guarda}, estatico ${estatico}`);
  }
});

// ── a pagina inicial ────────────────────────────────────────────────────────
// Percorre as tags mantendo a pilha de elementos abertos, para responder se um
// trecho esta DENTRO de um bloco marcado. Comparar posicoes no texto nao
// bastaria: a marca pode estar num bloco que ja fechou antes do trecho.
const VAZIAS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr']);

const dentroDe = (html, marca, alvo) => {
  // O conteudo de <script>/<style> vira espaco do mesmo tamanho: assim um `<`
  // de javascript nao entra na conta e as posicoes continuam valendo.
  const texto = html.replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi,
    (_m, abre, _tag, dentro, fecha) => abre + ' '.repeat(dentro.length) + fecha);
  const posicao = texto.indexOf(alvo);
  if (posicao < 0) throw new Error('nao achei no HTML: ' + alvo);

  const pilha = [];
  const tags = /<(\/?)([a-z0-9-]+)([^>]*?)(\/?)>/gi;
  let m;
  while ((m = tags.exec(texto)) !== null) {
    if (m.index >= posicao) break;
    const [, barra, nome, atributos, fechaSozinha] = m;
    if (barra) {
      const i = pilha.map(e => e.nome).lastIndexOf(nome.toLowerCase());
      if (i >= 0) pilha.length = i;
    } else if (!VAZIAS.has(nome.toLowerCase()) && !fechaSozinha) {
      pilha.push({ nome: nome.toLowerCase(), marcado: new RegExp('\\b' + marca + '\\b').test(atributos) });
    }
  }
  return pilha.some(e => e.marcado);
};

const inicial = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');

await teste('o cartao que vende o white-label so aparece na IncentivaBR', () => {
  // No site de um cliente, este cartao ofereceria a plataforma ao publico
  // dele — a IncentivaBR passando na frente de quem a contratou.
  if (!dentroDe(inicial, 'data-so-plataforma', 'href="para-associacoes.html"')) {
    throw new Error('o link para a carta de vendas esta fora de um bloco data-so-plataforma');
  }
});

await teste('os depoimentos do piloto so aparecem na IncentivaBR', () => {
  if (!dentroDe(inicial, 'data-so-plataforma', 'Servidores que já simularam')) {
    throw new Error('a prova social do piloto apareceria sob a marca do cliente');
  }
});

await teste('os numeros do piloto so aparecem na IncentivaBR', () => {
  if (!dentroDe(inicial, 'data-so-plataforma', 'Piloto com servidores públicos do DF')) {
    throw new Error('os numeros do piloto apareceriam sob a marca do cliente');
  }
});

await teste('a pagina inicial so linka a carta de vendas de um lugar', () => {
  const quantos = (inicial.match(/href="para-associacoes\.html"/g) || []).length;
  if (quantos !== 1) throw new Error('links para a carta de vendas: ' + quantos);
});

servidor.close();

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
