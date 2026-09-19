#!/usr/bin/env node
/**
 * Regenera a base de conhecimento da TINA a partir das páginas do frontend.
 *
 *     node scripts/sync-nucleo-tina.mjs
 *
 * O `backend/src/knowledge/nucleo.md` é um SNAPSHOT das páginas listadas em
 * FONTES. Editar qualquer uma delas sem rodar este script deixa a TINA
 * respondendo com o texto antigo — e a divergência é silenciosa: nada quebra,
 * ela só passa a afirmar coisas que o site não diz mais. Foi assim que ela
 * seguiu citando o projeto do piloto cinco dias depois de ele sair das
 * páginas (set/2026). Desde então `backend/tests/nucleo-em-dia.test.mjs`
 * regenera em memória e falha se o arquivo estiver diferente: o CI não passa
 * com o retrato velho.
 *
 * Por que snapshot e não leitura em runtime: o núcleo é o prefixo cacheado do
 * prompt. Ele precisa ser byte a byte idêntico entre requisições — extrair de
 * HTML a cada chamada convidaria variação e mataria o cache.
 *
 * Uma fonte pode ser a página inteira ou só algumas seções (por id). O Espaço
 * do Contador entra só pelo FAQ: a calculadora é interativa, o material é
 * comercial, e a tabela de fichas da DIRPF diverge do guia do servidor — até
 * o tributarista dizer qual está certa, nenhuma das duas versões entra pela
 * segunda vez.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FRONTEND = path.join(__dirname, '..', 'frontend');
export const DESTINO = path.join(__dirname, '..', 'backend', 'src', 'knowledge', 'nucleo.md');

/**
 * [arquivo sem .html, título da seção no núcleo, ids de seção a usar (ou
 * null = página inteira), ids de elementos a descartar]
 *
 * O que se descarta é o que só existe para o JavaScript mostrar num estado
 * vazio ("Nenhuma pergunta encontrada"). Não dá para descartar "tudo o que
 * está escondido": as respostas do FAQ nascem colapsadas, e são justamente o
 * conhecimento.
 */
export const FONTES = [
  ['biblioteca-juridica', 'BASE LEGAL DOS MECANISMOS DE INCENTIVO'],
  ['guia-ir-servidor',    'GUIA DO IMPOSTO DE RENDA PARA O SERVIDOR'],
  ['como-funciona',       'COMO FUNCIONA A DESTINACAO'],
  ['passo-a-passo',       'PASSO A PASSO DA DESTINACAO'],
  ['faq',                 'PERGUNTAS FREQUENTES', null, ['noResults']],
  ['espaco-contador',     'PERGUNTAS QUE O CONTADOR FAZ', ['faq']],
];

/** Recorta do HTML só os <section id="..."> pedidos, na ordem pedida. */
function soAsSecoes(html, ids) {
  return ids.map(id => {
    const re = new RegExp(`<section\\b[^>]*\\bid="${id}"[^>]*>[\\s\\S]*?</section>`, 'i');
    const m = html.match(re);
    if (!m) throw new Error(`seção #${id} não encontrada`);
    return m[0];
  }).join('\n');
}

/**
 * Remove um elemento pelo id, com tudo o que tem dentro: acha a tag de
 * abertura e anda até o fechamento correspondente, contando as aninhadas.
 */
function removePorId(html, id) {
  const abre = new RegExp(`<(div|p|span|section|li|h[1-6])\\b[^>]*\\bid="${id}"[^>]*>`, 'i');
  const m = html.match(abre);
  if (!m) throw new Error(`elemento #${id} não encontrado`);
  const tag = m[1].toLowerCase();
  const par = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  par.lastIndex = m.index + m[0].length;
  let nivel = 1, t;
  while ((t = par.exec(html))) {
    nivel += t[1] ? -1 : 1;
    if (nivel === 0) return html.slice(0, m.index) + html.slice(t.index + t[0].length);
  }
  throw new Error(`elemento #${id} não fecha`);
}

export function extrai(arquivo, ids = null, descartar = []) {
  let h = fs.readFileSync(path.join(FRONTEND, arquivo + '.html'), 'utf-8');
  if (ids) h = soAsSecoes(h, ids);
  for (const id of descartar) h = removePorId(h, id);
  for (const tag of ['script', 'style', 'nav', 'footer', 'head', 'svg']) {
    h = h.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, 'gi'), '');
  }
  h = h.replace(/<!--[\s\S]*?-->/g, '');

  for (const nivel of [1, 2, 3, 4]) {
    h = h.replace(
      new RegExp(`<h${nivel}\\b[^>]*>([\\s\\S]*?)</h${nivel}>`, 'gi'),
      (_m, txt) => `\n${'#'.repeat(nivel + 1)} ${txt.replace(/<[^>]+>/g, '').trim()}\n`
    );
  }
  h = h.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi,
    (_m, txt) => `- ${txt.replace(/<[^>]+>/g, '').trim()}\n`);
  h = h.replace(/<\/(p|div|tr|section)>/gi, '\n');
  h = h.replace(/<[^>]+>/g, ' ');

  h = h.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
       .replace(/&rarr;|&#8594;/g, '->').replace(/&[a-z]+;|&#\d+;/gi, ' ');

  const saida = [];
  let anterior = '';
  for (const bruta of h.split('\n')) {
    // Tags removidas no meio da frase (os <span data-fiscal>) deixam espaço
    // antes de vírgula e depois de parêntese: "6% , informar ( 41 )".
    const l = bruta.replace(/[ \t]+/g, ' ').replace(/\s+([,.;:)])/g, '$1').replace(/\(\s+/g, '(').trim();
    if (!l || l === anterior) { anterior = l; continue; }
    if (l.length < 3 && !l.startsWith('#')) continue;
    saida.push(l);
    anterior = l;
  }
  return saida.join('\n');
}

/** O núcleo inteiro, como deve estar no arquivo. */
export function geraNucleo() {
  const partes = FONTES.map(([arq, titulo, ids, descartar]) =>
    `# ${titulo}\n<!-- fonte: frontend/${arq}.html${ids ? ' (#' + ids.join(', #') + ')' : ''} -->\n\n${extrai(arq, ids, descartar)}`
  );
  return partes.join('\n\n---\n\n');
}

// Só grava quando rodado como script; importado pelo teste, só expõe as funções.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const doc = geraNucleo();
  const anterior = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, 'utf-8') : '';
  fs.writeFileSync(DESTINO, doc, 'utf-8');

  console.log(anterior === doc ? 'nucleo.md já estava em dia' : 'nucleo.md regenerado');
  for (const [arq, , ids, descartar] of FONTES) {
    const t = extrai(arq, ids, descartar);
    console.log(`  ${arq.padEnd(22)} ${String(t.length).padStart(6)} chars  ~${Math.round(t.length / 4)} tokens`);
  }
  console.log(`  ${'TOTAL'.padEnd(22)} ${String(doc.length).padStart(6)} chars  ~${Math.round(doc.length / 4)} tokens`);

  if (Math.round(doc.length / 4) < 4096) {
    console.error('\nATENÇÃO: prefixo abaixo de 4.096 tokens — o Haiku 4.5 deixa de cachear em silêncio.');
    process.exit(1);
  }
}
