// Cada mecanismo diz o SEU limite, e o site não inventa teto compartilhado.
//
// O site afirmava, em quatro páginas e na base da TINA, que "PRONON e PRONAS
// compartilham 1% do IR devido". A Lei 12.715/2012 dá 1% a CADA um. O
// validador calculava com a versão errada: somava as duas destinações e
// conferia contra um só 1%, acusando excesso onde a lei permite o dobro.
//
// Errar para menos é a direção recuperável — o servidor destina abaixo do que
// podia e refaz no ano seguinte. Mas isto não era conservadorismo escolhido:
// era uma afirmação falsa, repetida em quatro lugares porque cada página
// guardava a própria cópia. Estes testes impedem que ela volte.
//
// O que NÃO está aqui: os 7% do esporte. O conjunto sobe a 7% com a LC
// 222/2025, mas o cálculo segue em 6% de propósito (migration 045) — só o
// texto das páginas registra o 7%, marcado como não confirmado.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
const FRONTEND = path.join(RAIZ, 'frontend');

const ok = [], falhas = [];
const teste = (nome, fn) => { try { fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); } };

/**
 * Apaga comentários (HTML e JS de linha) preservando o tamanho do arquivo.
 *
 * Sem isto, o comentário que EXPLICA a correção dispara a própria guarda —
 * exatamente o que aconteceu com a migration 044. Comentário não é o que o
 * servidor lê na tela.
 */
const semComentarios = texto => texto
  .replace(/<!--[\s\S]*?-->/g, c => ' '.repeat(c.length))
  .replace(/^[ \t]*\/\/.*$/gm, c => ' '.repeat(c.length));

/** Páginas do produto, já sem comentários. */
const paginas = fs.readdirSync(FRONTEND)
  .filter(f => f.endsWith('.html'))
  .map(f => [f, semComentarios(fs.readFileSync(path.join(FRONTEND, f), 'utf8'))]);

const nucleo = fs.readFileSync(path.join(RAIZ, 'backend/src/knowledge/nucleo.md'), 'utf8');

// ───────────────────────────────────────────────────────────────────────────
// 1. A afirmação falsa não volta a nenhuma página nem à base da TINA
// ───────────────────────────────────────────────────────────────────────────

/**
 * Frases que afirmam teto compartilhado entre os dois programas de saúde.
 *
 * Todas exigem que PRONON ou PRONAS apareça perto: "compartilha o teto de 6%"
 * é a frase CERTA sobre Rouanet, FDCA e Fundo do Idoso, e não pode disparar
 * aqui. O que se procura é a partilha entre os dois programas da Lei
 * 12.715/2012, que a lei não faz.
 */
const PERTO = '[\\s\\S]{0,140}';
const COMPARTILHAM = [
  new RegExp(`PRONON${PERTO}compartilham?\\s+(esse|o)\\s+(teto|limite)`, 'i'),
  new RegExp(`PRONAS${PERTO}compartilham?\\s+(esse|o)\\s+(teto|limite)`, 'i'),
  new RegExp(`limite\\s+conjunto${PERTO}PRONA?[SN]`, 'i'),
  new RegExp(`PRONA?[SN]${PERTO}limite\\s+conjunto`, 'i'),
  /PRONON\s*\+\s*PRONAS[^.]{0,60}(conjunto|somados|entre si)/i,
  /PRONON\s+e\s+PRONAS[^.]{0,80}(compartilham|dividem)\s/i,
  /1%\s+entre\s+si/i
];

teste('nenhuma página afirma que PRONON e PRONAS dividem um teto', () => {
  const culpadas = [];
  for (const [nome, html] of paginas) {
    for (const padrao of COMPARTILHAM) {
      const m = html.match(padrao);
      if (m) culpadas.push(`${nome}: "${m[0].trim()}"`);
    }
  }
  if (culpadas.length) {
    throw new Error(
      'A Lei 12.715/2012 dá 1% a CADA programa. Encontrado:\n  ' + culpadas.join('\n  ')
    );
  }
});

teste('a base da TINA também não afirma', () => {
  for (const padrao of COMPARTILHAM) {
    const m = nucleo.match(padrao);
    if (m) {
      throw new Error(
        `nucleo.md ainda diz "${m[0].trim()}". Corrija a página-fonte e rode ` +
        'scripts/sync-nucleo-tina.mjs.'
      );
    }
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 2. E a afirmação certa está lá
// ───────────────────────────────────────────────────────────────────────────

teste('a biblioteca jurídica diz 1% para cada programa', () => {
  const html = fs.readFileSync(path.join(FRONTEND, 'biblioteca-juridica.html'), 'utf8');
  if (!/1%\s+(em\s+)?cada/i.test(html)) {
    throw new Error('a página não afirma o 1% por programa em lugar nenhum');
  }
  if (!/próprio do PRONON/i.test(html) || !/próprio do PRONAS/i.test(html)) {
    throw new Error('as fichas do PRONON e do PRONAS precisam dizer que o limite é próprio de cada um');
  }
});

// O texto do caput do art. 4º da Lei 12.715/2012 (redação da Lei 14.564/2023)
// faculta a dedução à PESSOA FÍSICA até o ano-calendário de 2025. Isto deixou
// de ser "vigência não confirmada" e virou prazo que o texto fixa: a plataforma
// opera pessoa física, então o mecanismo não pode ser oferecido hoje.
teste('as paginas avisam que a faculdade da pessoa fisica foi ate 2025', () => {
  const onde = ['biblioteca-juridica.html', 'espaco-contador.html', 'validador.html'];
  for (const nome of onde) {
    const html = fs.readFileSync(path.join(FRONTEND, nome), 'utf8');
    if (!/ano-calendário de 2025/.test(html)) {
      throw new Error(`${nome} não diz que a faculdade da pessoa física foi até 2025`);
    }
  }
  // A biblioteca e o Espaço do Contador também precisam dizer o efeito prático.
  for (const nome of ['biblioteca-juridica.html', 'espaco-contador.html']) {
    const html = fs.readFileSync(path.join(FRONTEND, nome), 'utf8');
    if (!/não gera dedução|não ofereça/i.test(html)) {
      throw new Error(`${nome} não diz o efeito: destinação de 2026 não gera dedução`);
    }
  }
});

// A procedência dos dois pontos que a 045 tinha marcado como fonte secundária.
teste('as paginas citam o dispositivo, e nao ha mais "nao confirmado" nesses dois pontos', () => {
  const biblioteca = fs.readFileSync(path.join(FRONTEND, 'biblioteca-juridica.html'), 'utf8');
  if (!/art\.\s*9º,\s*§\s*1º,\s*II/.test(biblioteca)) {
    throw new Error('falta a citação do art. 9º, § 1º, II, da LC 222/2025');
  }
  if (!/§\s*6º,\s*I,\s*"d"/.test(biblioteca)) {
    throw new Error('falta a citação do art. 4º, § 6º, I, "d", da Lei 12.715/2012');
  }

  // "não confirmado em fonte primária" continua valendo para os códigos da
  // DIRPF; o que não pode mais é aparecer ao lado do 7% ou do 1%.
  for (const [nome, html] of paginas) {
    for (const m of html.matchAll(/[^<>]{0,160}não confirmad[oa][^<>]{0,80}/gi)) {
      if (/7%|1%|LC 222|12\.715/.test(m[0])) {
        throw new Error(`${nome}: o dispositivo foi lido, tire a ressalva — "${m[0].trim()}"`);
      }
    }
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 3. O validador confere cada programa contra o SEU limite
// ───────────────────────────────────────────────────────────────────────────

teste('o validador tem um limite por programa, não um só', () => {
  const html = fs.readFileSync(path.join(FRONTEND, 'validador.html'), 'utf8');
  if (!/pronas:\s*ir\s*\*\s*0\.01/.test(html)) {
    throw new Error('L.pronas não existe: o PRONAS/PCD não tem limite próprio no cálculo');
  }
  if (/V\.pronon_pronas\s*>\s*L\.pronon/.test(html)) {
    throw new Error('o validador ainda soma os dois programas contra um só limite');
  }
  if (!/V\.pronon\s*>\s*L\.pronon/.test(html) || !/V\.pronas\s*>\s*L\.pronas/.test(html)) {
    throw new Error('cada programa precisa ser conferido contra o seu próprio limite');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 4. O teto do esporte é registro, não cálculo
// ───────────────────────────────────────────────────────────────────────────

teste('nenhuma página calcula com 7% — o cálculo segue no teto do banco', () => {
  const culpadas = [];
  for (const [nome, html] of paginas) {
    // Só o CÓDIGO importa aqui: texto pode (e deve) citar os 7%.
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
    for (const js of scripts) {
      if (/\*\s*0\.07\b/.test(js) || /TETO_FRACAO\s*\|\|\s*0\.07/.test(js)) {
        culpadas.push(nome);
      }
    }
  }
  if (culpadas.length) {
    throw new Error(
      'O teto condicional de 7% (LC 222/2025) não foi confirmado nem implementado em ' +
      `saldoDisponivel(). Página calculando com ele: ${culpadas.join(', ')}`
    );
  }
});

teste('a migration 045 registra o teto de 7% sem ninguém apontar para ele', () => {
  const sql = fs.readFileSync(
    path.join(RAIZ, 'backend/src/migrations/045_catalogo_pos_nota_tecnica.sql'), 'utf8'
  );
  if (!/irpf_global_7/.test(sql)) throw new Error('a 045 não cadastra o irpf_global_7');
  if (!/confirmado_por_parecer[\s\S]{0,400}FALSE/.test(sql)) {
    throw new Error('o teto de 7% não pode entrar como confirmado por parecer');
  }
  if (/teto_codigo\s*=\s*'irpf_global_7'/.test(sql)) {
    throw new Error('nenhum mecanismo deve apontar para o teto de 7% antes do parecer');
  }
});

teste('a 045 não libera mecanismo nenhum para cliente', () => {
  const sql = fs.readFileSync(
    path.join(RAIZ, 'backend/src/migrations/045_catalogo_pos_nota_tecnica.sql'), 'utf8'
  );
  if (/disponivel_para_cliente\s*=\s*TRUE/i.test(sql)) {
    throw new Error('nota de pesquisa não assinada não libera mecanismo para cliente');
  }
});

// ───────────────────────────────────────────────────────────────────────────

console.log('\nLimites por mecanismo\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
