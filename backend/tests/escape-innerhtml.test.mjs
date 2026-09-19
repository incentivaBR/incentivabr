// Dado de fora nunca vira HTML sem escape.
//
// O frontend monta trechos de tela com template literals e innerHTML. Onde o
// texto vem do banco, do SALIC ou de um formulário público — nome de quem se
// cadastrou, título do projeto, motivo de recusa —, ele tem de passar por
// `esc()`/`escapeHtml()` antes. Sem isso, um nome com <script> roda na tela
// do gestor. Havia 72 usos de innerHTML em 18 arquivos e nenhum teste que os
// vigiasse (Raio-X de set/2026, Onda 2: "escape obrigatório em todo
// innerHTML").
//
// Este teste lê o JavaScript de cada página e de js/*.js com um lexer
// pequeno — que entende string, comentário, regex e template aninhado — e
// aplica duas regras a cada template literal que contém uma tag HTML:
//
//   1. uma interpolação que é acesso a propriedade (`${d.nome}`,
//      `${p.titulo || '—'}`) tem de estar embrulhada: esc(...), escapeHtml(...).
//      Identificadores soltos (`${nome}`) não são julgados aqui — é o E2E,
//      com dados envenenados no fixture, que confere o resultado na tela;
//   2. em atributo que executa ou aponta (href, src, on*, id, data-*, style,
//      action), TODA interpolação tem de ser esc/escapeHtml/encodeURIComponent.
//
// Página sem fetch nem chamada de API só mostra o que está escrita nela
// mesma; essas ficam isentas — e o teste confere que continuam sem fetch.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.join(AQUI, '../../frontend');

// Isenções. '*' = a página inteira, só com dados dela mesma (conferido
// abaixo: sem fetch, sem api.). Lista = expressões confiáveis daquele arquivo.
const ISENTOS = {
  'agenda-fiscal.html':   '*',
  'espaco-contador.html': '*',
  'validador.html':       '*',
  'js/layout.js':         '*',
  // O avatar da TINA é HTML nosso, escrito no próprio arquivo. As respostas
  // do modelo passam por formataResposta(), que escapa.
  'js/tina.js':           ['config.botAvatar', 'config.userAvatar'],
};

const EMBRULHOS = /^(esc|escapeHtml|encodeURIComponent)\s*\(/;
// `${d.nome}` ou `${d.nome || '—'}` — o acesso, com no máximo um "ou" simples.
const ACESSO = /^([\w$]+(?:\?\.|\.)([\w$]+))(\s*\|\|\s*('[^']*'|"[^"]*"|[\w$.]+))?$/;
const PROPRIEDADES_NUMERICAS = ['length'];
// `style` fica fora: a CSP já barra url(javascript:), e o que entra ali são
// larguras calculadas na página.
const ATRIBUTO = /[\s"'](href|src|action|formaction|srcdoc|id|data-[\w-]+|on\w+)\s*=\s*(["'])((?:(?!\2).)*)\2/gs;

// ── lexer ────────────────────────────────────────────────────────────────────
/** Devolve os template literals do JS: trecho fixo, interpolações e fonte. */
function templates(js) {
  const achados = [];
  let i = 0;

  const ehRegex = pos => {
    let k = pos - 1;
    while (k >= 0 && /\s/.test(js[k])) k--;
    if (k < 0) return true;
    if (/[(,=:\[!&|?{};+\-*%<>~^]/.test(js[k])) return true;
    return /\b(return|typeof|case|void|in|of|do|else)$/.test(js.slice(Math.max(0, k - 7), k + 1));
  };
  const pulaString = aspa => {
    i++;
    while (i < js.length && js[i] !== aspa && js[i] !== '\n') { if (js[i] === '\\') i++; i++; }
    i++;
  };
  const pulaRegex = () => {
    i++;
    let classe = false;
    while (i < js.length) {
      const c = js[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '[') classe = true;
      else if (c === ']') classe = false;
      else if (c === '/' && !classe) { i++; break; }
      else if (c === '\n') break;
      i++;
    }
    while (/[a-z]/.test(js[i] || '')) i++;
  };
  const codigo = dentroDeChaves => {
    let nivel = 0;
    while (i < js.length) {
      const c = js[i], d = js[i + 1];
      if (c === '/' && d === '/') { const f = js.indexOf('\n', i); i = f < 0 ? js.length : f; continue; }
      if (c === '/' && d === '*') { const f = js.indexOf('*/', i + 2); i = f < 0 ? js.length : f + 2; continue; }
      if (c === "'" || c === '"') { pulaString(c); continue; }
      if (c === '`') { template(); continue; }
      if (c === '/' && ehRegex(i)) { pulaRegex(); continue; }
      if (dentroDeChaves) {
        if (c === '{') nivel++;
        else if (c === '}') { if (nivel === 0) return; nivel--; }
      }
      i++;
    }
  };
  const template = () => {
    const inicio = i;
    i++;
    let fixo = '';
    const interpolacoes = [];
    while (i < js.length) {
      const c = js[i];
      if (c === '\\') { fixo += js[i + 1] || ''; i += 2; continue; }
      if (c === '`') { i++; break; }
      if (c === '$' && js[i + 1] === '{') {
        i += 2;
        const ini = i;
        codigo(true);
        interpolacoes.push({ expr: js.slice(ini, i).trim(), pos: ini });
        i++;
        continue;
      }
      fixo += c;
      i++;
    }
    achados.push({ inicio, fim: i, fixo, interpolacoes, fonte: js.slice(inicio, i) });
  };

  codigo(false);
  return achados;
}

/** Scripts embutidos de uma página (sem src), com o deslocamento no arquivo. */
function scriptsEmbutidos(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    out.push({ js: m[2], deslocamento: m.index + m[0].indexOf(m[2]) });
  }
  return out;
}

const temTag = fixo => /<[a-zA-Z]/.test(fixo);
const linhaDe = (texto, pos) => texto.slice(0, pos).split('\n').length;

/** Aplica as duas regras a um trecho de JS; devolve as infrações. */
function infracoes(js, confiaveis = []) {
  const vistas = new Set();
  const lista = [];
  const aponta = (pos, motivo) => {
    const chave = pos + '|' + motivo;
    if (vistas.has(chave)) return;   // template aninhado aparece também no de fora
    vistas.add(chave);
    lista.push({ pos, motivo });
  };
  for (const t of templates(js)) {
    if (!temTag(t.fixo)) continue;
    // Regra 1: acesso a propriedade sem embrulho, dentro de HTML.
    for (const { expr, pos } of t.interpolacoes) {
      const m = expr.match(ACESSO);
      if (!m || confiaveis.includes(m[1]) || PROPRIEDADES_NUMERICAS.includes(m[2])) continue;
      aponta(pos, `\${${expr}} entra em HTML sem esc()`);
    }
    // Regra 2: atributo que executa ou aponta, com interpolação sem embrulho.
    for (const a of t.fonte.matchAll(ATRIBUTO)) {
      const valor = a[3];
      if (!valor.includes('${')) continue;
      for (const e of valor.matchAll(/\$\{([^}]*)\}/g)) {
        const expr = e[1].trim();
        if (EMBRULHOS.test(expr) || confiaveis.includes(expr)) continue;
        aponta(t.inicio + a.index, `${a[1]}="…\${${expr}}…" sem esc()/encodeURIComponent()`);
      }
    }
  }
  return lista.sort((x, y) => x.pos - y.pos);
}

// ── os testes ────────────────────────────────────────────────────────────────
const ok = [], falhas = [];
const teste = (nome, fn) => { try { fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); } };

teste('o lexer reconhece o que deve e ignora o que não deve', () => {
  const amostra = `
    // comentário com \`crase\` e "aspas
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '"': '&quot;' }[c]));
    const a = \`<b>\${d.nome}</b>\`;                 // infração: regra 1
    const b = \`<b>\${esc(d.nome)}</b>\`;            // ok
    const c = \`<i>\${d.titulo || '—'}</i>\`;        // infração: regra 1
    const d2 = \`Olá \${p.nome}, tudo bem?\`;          // ok: sem tag
    const e = \`<a href="\${url}">x</a>\`;            // infração: regra 2
    const f = \`<a href="\${escapeHtml(url)}">x</a>\`; // ok
    const g = \`<p>\${x ? \`<b>\${esc(x.n)}</b>\` : ''}</p>\`; // ok, aninhado
    const h = \`<p>\${x ? \`<b>\${x.n}</b>\` : ''}</p>\`;      // infração: aninhado
    const j = \`<button onclick="f('\${d.id}', this)">\`;   // infração: regras 1 e 2
  `;
  const achadas = infracoes(amostra).map(i => linhaDe(amostra, i.pos));
  const esperadas = [4, 6, 8, 11, 12, 12];
  if (JSON.stringify(achadas) !== JSON.stringify(esperadas)) {
    throw new Error(`linhas apontadas ${JSON.stringify(achadas)}, esperava ${JSON.stringify(esperadas)}`);
  }
});

teste('página isenta continua sem buscar nada de fora', () => {
  for (const [arquivo, regra] of Object.entries(ISENTOS)) {
    if (regra !== '*') continue;
    const texto = fs.readFileSync(path.join(FRONTEND, arquivo), 'utf8');
    if (/\bfetch\s*\(|\bapi\.\w+\s*\(/.test(texto)) {
      throw new Error(`${arquivo} passou a buscar dados de fora; tire-o da lista de isentos`);
    }
  }
});

const arquivos = [
  ...fs.readdirSync(FRONTEND).filter(f => f.endsWith('.html')),
  ...fs.readdirSync(path.join(FRONTEND, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f),
];

teste('nenhum dado de fora entra em HTML sem escape', () => {
  const problemas = [];
  for (const arquivo of arquivos) {
    const regra = ISENTOS[arquivo];
    if (regra === '*') continue;
    const texto = fs.readFileSync(path.join(FRONTEND, arquivo), 'utf8');
    const trechos = arquivo.endsWith('.js')
      ? [{ js: texto, deslocamento: 0 }]
      : scriptsEmbutidos(texto);
    for (const { js, deslocamento } of trechos) {
      for (const inf of infracoes(js, regra || [])) {
        problemas.push(`${arquivo}:${linhaDe(texto, deslocamento + inf.pos)}  ${inf.motivo}`);
      }
    }
  }
  if (problemas.length) throw new Error('\n          ' + problemas.join('\n          '));
});

teste('o teste olha as páginas que têm innerHTML', () => {
  const comInnerHTML = arquivos.filter(a =>
    /innerHTML\s*[+]?=/.test(fs.readFileSync(path.join(FRONTEND, a), 'utf8')));
  if (comInnerHTML.length < 15) throw new Error('só ' + comInnerHTML.length + ' arquivos com innerHTML; o filtro quebrou?');
});

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
