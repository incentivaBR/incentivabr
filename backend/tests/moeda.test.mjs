// Dinheiro na tela tem um formatador só: frontend/js/moeda.js.
//
// Havia nove (BRL, BRLs, formatBRL, fmtBRL, formatCurrency...) em oito
// arquivos, cada um com a sua ideia de casas decimais, de espaço depois do
// "R$" e do que fazer com valor nulo. O que estes testes guardam:
//   - moeda.js escreve o que promete, inclusive para nulo e texto;
//   - nenhum outro arquivo do frontend formata moeda por conta própria;
//   - toda página que chama BRL() ou utils.formatCurrency() carrega moeda.js.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.join(AQUI, '../../frontend');
const ler = f => fs.readFileSync(path.join(FRONTEND, f), 'utf8');

const ok = [], falhas = [];
const teste = (nome, fn) => { try { fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); } };
const igual = (a, b, msg) => { if (a !== b) throw new Error(`${msg || ''} esperava ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };

// Roda moeda.js como o navegador rodaria, num escopo limpo.
const escopo = { window: {} };
escopo.window.window = escopo.window;
vm.runInNewContext(ler('js/moeda.js'), escopo);
const BRL = escopo.window.BRL;

teste('BRL escreve reais com centavos, milhar com ponto e espaço comum', () => {
  igual(BRL(1234.5), 'R$ 1.234,50');
  igual(BRL(0), 'R$ 0,00');
  igual(BRL('2000000'), 'R$ 2.000.000,00', 'texto numérico');
  igual(BRL(0.005), 'R$ 0,01', 'arredonda');
  if (/ /.test(BRL(1))) throw new Error('espaço inflexível depois do R$');
});

teste('BRL.inteiro para metas e valores aprovados', () => {
  igual(BRL.inteiro(1234.4), 'R$ 1.234');
  igual(BRL.inteiro(1500000), 'R$ 1.500.000');
});

teste('valor que não veio é travessão, não zero', () => {
  igual(BRL(null), '—'); igual(BRL(undefined), '—'); igual(BRL(''), '—');
  igual(BRL('abc'), '—'); igual(BRL(NaN), '—'); igual(BRL.inteiro(null), '—');
});

const arquivos = [
  ...fs.readdirSync(FRONTEND).filter(f => f.endsWith('.html')),
  ...fs.readdirSync(path.join(FRONTEND, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f),
];
const semComentarios = s => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

teste('nenhum outro arquivo formata moeda por conta própria', () => {
  const proibidos = [
    /currency\s*:\s*['"]BRL['"]/,                   // Intl.NumberFormat de moeda
    /['"]R\$ ?['"]\s*\+/,                             // 'R$ ' + algo
    /R\$ \$\{/,                                       // R$ ${...} em template
    /\b(formatBRL|fmtBRL|BRLs|formatarMoeda)\s*\(/,   // os nomes antigos
  ];
  const culpados = [];
  for (const a of arquivos) {
    if (a === 'js/moeda.js') continue;
    const texto = semComentarios(ler(a));
    for (const re of proibidos) if (re.test(texto)) culpados.push(`${a}: ${re}`);
  }
  if (culpados.length) throw new Error('\n          ' + culpados.join('\n          '));
});

teste('toda página que escreve dinheiro carrega js/moeda.js', () => {
  const faltam = [];
  for (const a of arquivos.filter(f => f.endsWith('.html'))) {
    const texto = semComentarios(ler(a));
    const usa = /\bBRL(\.inteiro)?\s*\(/.test(texto) || /utils\.formatCurrency\s*\(/.test(texto);
    if (usa && !texto.includes('src="js/moeda.js"')) faltam.push(a);
  }
  if (faltam.length) throw new Error('sem moeda.js: ' + faltam.join(', '));
});

teste('moeda.js carrega antes de qualquer script que o use', () => {
  for (const a of arquivos.filter(f => f.endsWith('.html'))) {
    const texto = ler(a);
    const pos = texto.indexOf('src="js/moeda.js"');
    if (pos < 0) continue;
    // utils.js chama BRL() de dentro de formatCurrency: tem de vir depois.
    const utils = texto.indexOf('src="js/utils.js"');
    if (utils >= 0 && utils < pos) throw new Error(`${a}: utils.js antes de moeda.js`);
  }
});

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
