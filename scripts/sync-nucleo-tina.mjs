#!/usr/bin/env node
/**
 * Regenera a base de conhecimento da TINA a partir das páginas do frontend.
 *
 *     node scripts/sync-nucleo-tina.mjs
 *
 * O `backend/src/knowledge/nucleo.md` é um SNAPSHOT das cinco páginas listadas
 * em FONTES. Editar qualquer uma delas sem rodar este script deixa a TINA
 * respondendo com o texto antigo — e a divergência é silenciosa: nada quebra,
 * ela só passa a afirmar coisas que o site não diz mais.
 *
 * Rode sempre que mexer em biblioteca-juridica, guia-ir-servidor, como-funciona,
 * passo-a-passo ou faq.
 *
 * Por que snapshot e não leitura em runtime: o núcleo é o prefixo cacheado do
 * prompt. Ele precisa ser byte a byte idêntico entre requisições — extrair de
 * HTML a cada chamada convidaria variação e mataria o cache.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.join(__dirname, '..', 'frontend');
const DESTINO = path.join(__dirname, '..', 'backend', 'src', 'knowledge', 'nucleo.md');

const FONTES = [
  ['biblioteca-juridica', 'BASE LEGAL DOS MECANISMOS DE INCENTIVO'],
  ['guia-ir-servidor',    'GUIA DO IMPOSTO DE RENDA PARA O SERVIDOR'],
  ['como-funciona',       'COMO FUNCIONA A DESTINACAO'],
  ['passo-a-passo',       'PASSO A PASSO DA DESTINACAO'],
  ['faq',                 'PERGUNTAS FREQUENTES']
];

function extrai(arquivo) {
  let h = fs.readFileSync(path.join(FRONTEND, arquivo + '.html'), 'utf-8');

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

const partes = FONTES.map(([arq, titulo]) =>
  `# ${titulo}\n<!-- fonte: frontend/${arq}.html -->\n\n${extrai(arq)}`
);
const doc = partes.join('\n\n---\n\n');

const anterior = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, 'utf-8') : '';
fs.writeFileSync(DESTINO, doc, 'utf-8');

console.log(anterior === doc ? 'nucleo.md já estava em dia' : 'nucleo.md regenerado');
for (const [arq, titulo] of FONTES) {
  const t = extrai(arq);
  console.log(`  ${arq.padEnd(22)} ${String(t.length).padStart(6)} chars  ~${Math.round(t.length / 4)} tokens`);
}
console.log(`  ${'TOTAL'.padEnd(22)} ${String(doc.length).padStart(6)} chars  ~${Math.round(doc.length / 4)} tokens`);

if (Math.round(doc.length / 4) < 4096) {
  console.error('\nATENÇÃO: prefixo abaixo de 4.096 tokens — o Haiku 4.5 deixa de cachear em silêncio.');
  process.exit(1);
}
