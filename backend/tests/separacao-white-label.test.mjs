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
//   - na página inicial, o cartão que vende o white-label fica dentro de
//     `data-so-plataforma`; números e depoimentos do piloto não voltam sem
//     fonte (sairam em set/2026 — docs/auditoria/afirmacoes-comerciais.md).
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
import { dentroDe } from './apoio/dentroDe.mjs';

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
// `dentroDe` responde se um trecho esta sob um bloco marcado, percorrendo as
// tags como o navegador faz. Vive em tests/apoio porque a guarda dos papeis
// de LGPD faz a mesma pergunta sobre a Politica de Privacidade.
const inicial = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');

await teste('o cartao que vende o white-label so aparece na IncentivaBR', () => {
  // No site de um cliente, este cartao ofereceria a plataforma ao publico
  // dele — a IncentivaBR passando na frente de quem a contratou.
  if (!dentroDe(inicial, 'data-so-plataforma', 'href="para-associacoes.html"')) {
    throw new Error('o link para a carta de vendas esta fora de um bloco data-so-plataforma');
  }
});

await teste('tenant.js esconde por display em linha, nao so pelo atributo hidden', () => {
  // O cartao acima tem classe `flex`. Com o Tailwind carregado, `.flex`
  // vence `[hidden]` (mesma especificidade, vem depois) e o cartao aparece
  // no site do cliente — o E2E do CI pegou isso em set/2026, e so la, porque
  // localmente o CDN nao responde. `el.style.display = 'none'` vence tudo.
  const tenant = fs.readFileSync(path.join(FRONTEND, 'js/tenant.js'), 'utf8');
  const trecho = tenant.slice(tenant.indexOf('[data-so-cliente]'), tenant.indexOf('[data-tenant]'));
  if (!trecho || !/style\.display\s*=/.test(trecho)) {
    throw new Error('o bloco que liga [data-so-cliente]/[data-so-plataforma] nao mexe em style.display');
  }
});

await teste('numeros e depoimentos do piloto nao voltam para a home sem fonte', () => {
  // Sairam em setembro de 2026: nao existe no repositorio a planilha de onde
  // teriam saido (docs/auditoria/afirmacoes-comerciais.md). Voltam quando
  // docs/piloto-fgv/resultados.md existir — e ai esta guarda muda junto.
  const semFonte = ['NPS', 'concluíram', 'Servidores que já simularam', 'Piloto com servidores', 'Piloto IncentivaBR'];
  // A home e o Espaco do Contador, que trazia "73% — Piloto IncentivaBR, 2026"
  // ate set/2026, e alimenta a TINA.
  for (const pagina of ['index.html', 'espaco-contador.html']) {
    const texto = fs.readFileSync(path.join(FRONTEND, pagina), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const t of semFonte) {
      if (texto.includes(t)) throw new Error(`voltou sem fonte em ${pagina}: ${t}`);
    }
  }
  if (!fs.existsSync(path.join(RAIZ, 'docs/auditoria/afirmacoes-comerciais.md'))) {
    throw new Error('sumiu a tabela que explica por que sairam');
  }
});

await teste('a pagina inicial so linka a carta de vendas de um lugar', () => {
  const quantos = (inicial.match(/href="para-associacoes\.html"/g) || []).length;
  if (quantos !== 1) throw new Error('links para a carta de vendas: ' + quantos);
});

// ── O roteiro da demonstracao envelhece calado ─────────────────────────────
//
// A versao de ago/2026 mandava NAO abrir a index.html, porque na epoca ela
// saia com a marca da plataforma. Em set/2026 ela virou a melhor parte da
// demonstracao — e o roteiro seguiu mandando pular, por oito semanas, sem
// nada quebrar. Documento de apresentacao nao tem CI: estas duas guardas sao
// o que ele tem.
const ROTEIRO = path.join(RAIZ, 'docs/apresentacao/ROTEIRO-CASA-AZUL.md');

await teste('o roteiro nao manda pular a home, que hoje e do cliente', () => {
  const texto = fs.readFileSync(ROTEIRO, 'utf8');
  const manda = /n[aã]o\s+(comece|abra)[^.]{0,40}index\.html|nunca\s+comece[^.]{0,40}index/i.exec(texto);
  if (manda) throw new Error('o roteiro ainda manda evitar a home: "' + manda[0].trim() + '"');

  // E a home tem de continuar sendo do cliente, senao a instrucao nova e que
  // fica errada. O E2E prova na tela; aqui se prova a marcacao.
  const inicial = fs.readFileSync(path.join(RAIZ, 'frontend/index.html'), 'utf8');
  for (const marca of ['data-tenant="hero_titulo"', 'data-so-cliente', 'data-projeto=']) {
    if (!inicial.includes(marca)) {
      throw new Error(`index.html perdeu ${marca} — o roteiro manda abri-la primeiro`);
    }
  }
});

await teste('o roteiro avisa da portaria antes de tudo', () => {
  // Com SITE_SENHA ligada, toda pagina responde 401. Quem apresenta nao ve a
  // tela de senha (o cookie dura 30 dias na maquina dele) e descobre na frente
  // do cliente, noutra maquina. E o erro mais caro e mais facil de evitar.
  const texto = fs.readFileSync(ROTEIRO, 'utf8');
  if (!/SITE_SENHA/.test(texto)) throw new Error('o roteiro nao cita a senha do site');
  if (!/401/.test(texto)) throw new Error('o roteiro nao diz o que acontece sem a senha');

  // O aviso tem de vir antes das abas: depois da lista, ninguem le.
  if (texto.indexOf('SITE_SENHA') > texto.indexOf('| 1 |')) {
    throw new Error('o aviso da senha esta depois da lista de abas');
  }
});

await teste('o roteiro nao promete SALIC ao vivo em modo simulacao', () => {
  // routes/salic.js: "O que a simulacao muda e so uma coisa: nao consulta o
  // SALIC." Dizer "vem do Ministerio agora" na frente do cliente e o tipo de
  // detalhe que derruba a credibilidade se alguem checar.
  // A propria instrucao do roteiro e "nao diga que vem da API do SALIC agora".
  // Procurar a frase crua acusaria o aviso que existe para impedi-la — foi o
  // que aconteceu na primeira versao desta guarda. Apaga-se a sentenca negada
  // antes de procurar a afirmada.
  // O negrito do markdown entra no meio das palavras ("a plataforma **nao**
  // consulta o SALIC"), e um \s+ nao atravessa asterisco. Tira-se a enfase
  // antes de procurar frase.
  const texto = fs.readFileSync(ROTEIRO, 'utf8')
    .replace(/\*+/g, '')
    .replace(/n[ãa]o\s+(diga|afirme|prometa)[^.]*\./gi, ' ');
  const promete = /(vem|v[eê]m)\s+da\s+API\s+do\s+SALIC[^.]{0,30}agora/i.exec(texto);
  if (promete) throw new Error('o roteiro promete consulta ao vivo: "' + promete[0].trim() + '"');
  if (!/n[aã]o\s+consulta\s+o\s+SALIC/i.test(texto)) {
    throw new Error('o roteiro nao avisa que em simulacao o SALIC nao e consultado');
  }
});

servidor.close();

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
