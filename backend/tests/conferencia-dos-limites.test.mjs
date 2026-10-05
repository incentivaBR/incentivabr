// O validador deixa de ser a melhor página escondida do site.
//
// O PROBLEMA
//
// O "Validador Anti-Malha Fina" é a peça mais técnica do produto: entra o IR
// devido, saem os limites conferidos, sai um laudo imprimível. É exatamente o
// que acalma quem tem medo de errar na declaração — e era alcançável por um
// caminho só: Biblioteca Jurídica → validador, por um link que fala de "base
// legal das outras seis leis". Ninguém procura anti-malha-fina ali.
//
// Pior: o item "Contadores" saiu da barra do cliente (out/2026, e com razão —
// é canal da plataforma), o que encurtou ainda mais o caminho que já era
// torto.
//
// O QUE MUDOU
//
//   1. O validador aceita os números pela URL (`?ir=…&rouanet=…`) e abre com a
//      conferência pronta;
//   2. o assistente oferece a conferência na tela de conclusão — o momento de
//      maior disposição, porque a pessoa acabou de transferir e quer saber se
//      está certo — com os números desta destinação no link;
//   3. o painel tem o atalho, para quem volta quando a declaração se aproxima.
//
// A REGRA QUE NÃO SE QUEBRA
//
// O que entra pela URL é dado de fora, mesmo vindo do nosso próprio fluxo:
// vira número por `Number()`, nunca texto em `innerHTML`, e o que não for
// número finito e positivo é ignorado em silêncio. Link estragado não pode
// encher a tela de NaN — e um `?ir=abc` não pode produzir laudo nenhum.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
const FRONTEND = path.join(RAIZ, 'frontend');

const ok = [], falhas = [];
const teste = (nome, fn) => {
  try { fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};
const leia = (n) => fs.readFileSync(path.join(FRONTEND, n), 'utf8');

/**
 * Sem comentários e sem entidades.
 *
 * O comentário que explica uma regra cita a marca que a regra usa — foi assim
 * que uma guarda deste repositório passou cinco vezes com o defeito dentro.
 */
const legivel = (x) => x
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/&(a|e|i|o|u)(acute|grave|circ|tilde|uml);/gi, (_, v) => v)
  .replace(/&ccedil;/gi, 'c');

const VALIDADOR  = leia('validador.html');
const ASSISTENTE = leia('destinar-rouanet.html');
const PAINEL     = leia('dashboard.html');

// ───────────────────────────────────────────────────────────────────────────
// 1. O validador aceita os números pela URL
// ───────────────────────────────────────────────────────────────────────────

teste('o validador le ir e rouanet da URL', () => {
  const bloco = VALIDADOR.slice(VALIDADOR.indexOf('new URLSearchParams(location.search)'));
  if (!bloco) throw new Error('o validador nao le a URL');
  const corpo = bloco.slice(0, 1200);
  for (const chave of ['ir', 'rouanet']) {
    if (!new RegExp(`${chave}:`).test(corpo)) throw new Error('nao aceita ' + chave);
  }
  if (!/validar\(\)/.test(corpo)) throw new Error('nao roda a conferencia depois de preencher');
});

teste('valor de URL vira NUMERO, e o que nao for e ignorado', () => {
  // `?ir=abc` ou `?ir=-5` nao podem produzir laudo nenhum. E o valor nunca
  // entra como texto: o unico destino dele e `.value` depois de BRL().
  const corpo = VALIDADOR.slice(VALIDADOR.indexOf('new URLSearchParams(location.search)'), VALIDADOR.indexOf('</script>', VALIDADOR.indexOf('new URLSearchParams(location.search)')));
  if (!/Number\(q\.get\(/.test(corpo)) throw new Error('o valor da URL nao passa por Number()');
  if (!/Number\.isFinite\(n\)\s*\|\|\s*n\s*<=\s*0/.test(corpo)) {
    throw new Error('aceita NaN, infinito ou negativo');
  }
  if (/innerHTML/.test(corpo)) throw new Error('valor de URL chegando a innerHTML');
});

teste('sem parametro, o validador abre como sempre', () => {
  // Quem chega pelo menu nao pode ver um laudo de zeros.
  const corpo = VALIDADOR.slice(VALIDADOR.indexOf('new URLSearchParams(location.search)'));
  if (!/if \(!veio\) return;/.test(corpo.slice(0, 1200))) {
    throw new Error('a tela roda a conferencia mesmo sem valor na URL');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 2. O assistente oferece a conferência no fim
// ───────────────────────────────────────────────────────────────────────────

teste('a conclusao do assistente oferece a conferencia', () => {
  const i = ASSISTENTE.indexOf('id="step6"');
  if (i === -1) throw new Error('a tela de conclusao mudou de nome');
  const fim = legivel(ASSISTENTE.slice(i, ASSISTENTE.indexOf('</div><!-- /wizard-body -->') + 1 || undefined));
  if (!/id="btnConferirLimites"/.test(fim)) {
    throw new Error('a conclusao nao oferece a conferencia');
  }
});

teste('o link da conferencia leva os numeros DESTA destinacao', () => {
  const fn = ASSISTENTE.slice(ASSISTENTE.indexOf('function apontaConferencia'));
  const corpo = fn.slice(0, 700);
  if (!/p\.set\('ir',\s*state\.ir_devido\)/.test(corpo))  throw new Error('nao leva o IR devido');
  if (!/p\.set\('rouanet',\s*state\.valor\)/.test(corpo)) throw new Error('nao leva o valor destinado');
  // Zero e nulo nao viajam: um `?ir=0` abriria um laudo de nada.
  if (!/state\.ir_devido > 0/.test(corpo) || !/state\.valor > 0/.test(corpo)) {
    throw new Error('valor ausente viajaria como zero');
  }
});

teste('o link da conferencia nao atravessa a fronteira do cliente', () => {
  // O reescritor de links do tenant.js ja passou quando esta tela aparece —
  // mesma razao do link de destinar. Sem o `org` a mao, a pessoa sai do site
  // do cliente para o da plataforma no ultimo passo.
  const fn = ASSISTENTE.slice(ASSISTENTE.indexOf('function apontaConferencia'));
  if (!/location\.search\)\.get\('org'\)/.test(fn.slice(0, 700))) {
    throw new Error('o link nao carrega a organizacao');
  }
});

teste('o link e montado quando a conclusao e desenhada', () => {
  // Montar no carregamento daria um link sem numeros: o state ainda esta
  // vazio quando a pagina abre.
  if (!/apontaConferencia\(\);/.test(ASSISTENTE)) {
    throw new Error('apontaConferencia nunca e chamada');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 3. O painel, para quem volta depois
// ───────────────────────────────────────────────────────────────────────────

teste('o painel tem o atalho da conferencia', () => {
  if (!/id="linkValidador"/.test(PAINEL)) throw new Error('o painel nao leva ao validador');
  const a = /<a[^>]*id="linkValidador"[^>]*>/.exec(PAINEL);
  if (!/href="validador\.html"/.test(a[0])) throw new Error('o atalho aponta para outro lugar');
  // E aparece para todo mundo: nao e tela de gestor.
  if (/style="display:none"/.test(a[0])) throw new Error('o atalho nasce escondido');
});

// ───────────────────────────────────────────────────────────────────────────
// 4. O caminho antigo continua existindo
// ───────────────────────────────────────────────────────────────────────────

teste('a Biblioteca Juridica segue levando ao validador', () => {
  // O caminho novo nao substitui o antigo: o contador chega por ali, e tirar
  // seria trocar um problema por outro.
  if (!/validador\.html/.test(leia('biblioteca-juridica.html'))) {
    throw new Error('a Biblioteca perdeu o link para o validador');
  }
});

console.log('\nA conferência dos limites deixa de ser escondida\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
