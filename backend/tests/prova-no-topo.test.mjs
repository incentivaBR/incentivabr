// A prova de confiança sai do FAQ e sobe para o topo.
//
// O PROBLEMA
//
// A pergunta que decide não é "como funciona". É "isso é real? eu perco
// dinheiro? vocês ficam com ele?". A resposta existia e estava correta — no
// FAQ, no fim da home, dentro de um acordeão fechado. Quem tem a dúvida sai
// da página antes de chegar lá, e sair é o resultado padrão de quem nunca
// destinou: 98% das pessoas que a plataforma precisa atingir.
//
// O QUE MUDOU
//
// Três fatos logo abaixo do número, no topo:
//
//   1. custo líquido zero — o valor abate do imposto devido;
//   2. você transfere direto — a plataforma não recebe nem movimenta;
//   3. só vale no modelo completo.
//
// O terceiro é o que constrói confiança, justamente porque admite um limite.
// Quem declara no simplificado não tem onde lançar a dedução, e dizer isso
// ANTES da transferência é a diferença entre uma ressalva e um prejuízo.
//
// AS REGRAS QUE NÃO SE QUEBRAM
//
//   - percentual não se escreve à mão: vem de `/api/config/brand` por
//     `[data-fiscal]`, como todo número fiscal desta casa;
//   - a plataforma se chama "a plataforma". Trocar pelo nome do cliente
//     tornaria a segunda linha FALSA — é na conta de captação dele que o
//     dinheiro entra;
//   - os três fatos não dependem de JavaScript nem de janela de captação
//     aberta. Continuam verdadeiros com o projeto encerrado, então ficam
//     FORA de `[data-prazo-convite]`;
//   - o FAQ continua respondendo o mesmo: subir a prova não é apagar a
//     resposta de quem procura por ela.
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
 * O comentário que explica uma regra cita a marca que a regra usa, então uma
 * guarda que procura a marca crua passa mesmo com a marca fora do HTML. Já
 * aconteceu cinco vezes neste repositório.
 */
const legivel = (x) => x
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/&(a|e|i|o|u)(acute|grave|circ|tilde|uml);/gi, (_, v) => v)
  .replace(/&ccedil;/gi, 'c')
  .replace(/&mdash;|&ndash;/gi, '-')
  .replace(/&rarr;/gi, '->')
  .replace(/&ldquo;|&rdquo;|&quot;/gi, '"');

/**
 * Remove o elemento inteiro, da abertura ao fechamento que casa.
 *
 * Contando profundidade pelo nome da tag: sem isso um `</div>` interno
 * encerraria o corte no meio do bloco e a segunda metade continuaria sendo
 * lida. É o mínimo de parser que esta guarda precisa.
 */
function removeElementos(html, attr) {
  const abre = (h) => {
    const re = new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\b${attr}\\b[^>]*>`, 'i');
    const m = re.exec(h);
    return m ? { match: m[0], index: m.index, tag: m[1] } : null;
  };
  let saida = html;
  for (;;) {
    const m = abre(saida);
    if (!m) return saida;
    const fim = m.index + m.match.length;
    const re = new RegExp(`</?${m.tag}\\b`, 'gi');
    re.lastIndex = fim;
    let nivel = 1, fecha = -1, t;
    while ((t = re.exec(saida)) !== null) {
      nivel += t[0][1] === '/' ? -1 : 1;
      if (nivel === 0) { fecha = saida.indexOf('>', t.index) + 1; break; }
    }
    if (fecha <= 0) fecha = saida.length;
    saida = saida.slice(0, m.index) + saida.slice(fecha);
  }
}

/**
 * A abertura do bloco.
 *
 * `\bdata-prova\b` casaria com `data-prova-marca` (o hífen fecha a palavra) e
 * também com a regra `.prova-marca[...]` do CSS — foi assim que a primeira
 * versão desta guarda achou o estilo em vez do elemento. O corte é explícito.
 */
const ABERTURA = /<([a-z][a-z0-9]*)\b[^>]*\bdata-prova(?![-\w])[^>]*>/i;

/** O elemento `[data-prova]` inteiro, só ele — mesma contagem de profundidade. */
function bloco(html) {
  const m = ABERTURA.exec(html);
  if (!m) throw new Error('a home nao tem [data-prova]');
  const inicio = m.index, apos = m.index + m[0].length;
  const re = new RegExp(`</?${m[1]}\\b`, 'gi');
  re.lastIndex = apos;
  let nivel = 1, t;
  while ((t = re.exec(html)) !== null) {
    nivel += t[0][1] === '/' ? -1 : 1;
    if (nivel === 0) return html.slice(inicio, html.indexOf('>', t.index) + 1);
  }
  throw new Error('o bloco da prova nao fecha');
}

const HOME = leia('index.html');

// ───────────────────────────────────────────────────────────────────────────
// 1. Os três fatos estão no topo
// ───────────────────────────────────────────────────────────────────────────

teste('a home tem o bloco da prova', () => {
  if (!ABERTURA.test(legivel(HOME))) {
    throw new Error('a home nao tem [data-prova]');
  }
});

teste('a prova vem ANTES do FAQ', () => {
  const texto = legivel(HOME);
  const prova = texto.search(ABERTURA);
  const faq = texto.search(/toggleFaq|id="faq"/);
  if (faq === -1) throw new Error('o FAQ da home mudou de forma');
  if (prova > faq) throw new Error('a prova ficou depois do FAQ, onde ninguem chega');
});

teste('a prova vem DEPOIS do numero', () => {
  // Antes do resultado ela não tem a que se ancorar: a pessoa ainda não sabe
  // o valor de que o custo líquido zero fala.
  const texto = legivel(HOME);
  if (texto.search(ABERTURA) < texto.indexOf('id="heroResultado"')) {
    throw new Error('a prova aparece antes do numero');
  }
});

teste('os tres fatos estao escritos', () => {
  const b = legivel(bloco(HOME)).toLowerCase();
  const exigidos = [
    ['custo liquido zero',        /custo liquido zero/],
    ['voce transfere direto',     /transfere direto/],
    ['so vale no modelo completo', /modelo completo/]
  ];
  for (const [nome, re] of exigidos) {
    if (!re.test(b)) throw new Error('falta o fato: ' + nome);
  }
});

teste('o fato do dinheiro diz que a plataforma nao movimenta', () => {
  const b = legivel(bloco(HOME)).toLowerCase();
  if (!/nao recebe nem movimenta/.test(b)) {
    throw new Error('a prova nao afirma que a plataforma nao movimenta o dinheiro');
  }
});

teste('o limite do simplificado diz a consequencia, nao so a regra', () => {
  // "Vale para o modelo completo" é informação. "No simplificado o valor não
  // volta" é a consequência — é ela que impede a transferência perdida.
  const b = legivel(bloco(HOME)).toLowerCase();
  if (!/simplificado/.test(b)) throw new Error('a prova nao fala do simplificado');
  if (!/nao volta|nao retorna|perde/.test(b)) {
    throw new Error('a prova nao diz o que acontece com quem esta no simplificado');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Nenhum número fiscal escrito à mão
// ───────────────────────────────────────────────────────────────────────────

teste('todo percentual da prova vem de [data-fiscal]', () => {
  const b = legivel(bloco(HOME));
  // Tira o conteúdo dos elementos com data-fiscal: o que sobrar com "%" é
  // número escrito à mão.
  const semGancho = removeElementos(b, 'data-fiscal');
  if (/\d+\s*%/.test(semGancho)) {
    throw new Error('percentual escrito a mao na prova: ' + /\d+\s*%/.exec(semGancho)[0]);
  }
  if (!/data-fiscal="art18_pct"/.test(b)) {
    throw new Error('a prova nao usa o percentual do art. 18 do catalogo');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 3. A prova não depende de nada
// ───────────────────────────────────────────────────────────────────────────

teste('a prova nao nasce escondida', () => {
  const abertura = ABERTURA.exec(legivel(HOME));
  if (!abertura) throw new Error('a prova nao tem tag de abertura');
  if (/\bhidden\b/.test(abertura[0])) {
    throw new Error('a prova nasce hidden: sem JavaScript, ninguem le');
  }
  if (/display\s*:\s*none/.test(abertura[0])) {
    throw new Error('a prova nasce com display:none');
  }
});

teste('a prova sobrevive a janela de captacao encerrada', () => {
  // Os três fatos continuam verdadeiros com o projeto fechado. Se estivessem
  // dentro de [data-prazo-convite], sumiriam junto com o convite — e a
  // página ficaria sem resposta justamente para quem chegou e não pode
  // destinar hoje.
  const semConvite = legivel(removeElementos(HOME, 'data-prazo-convite'));
  if (!/custo liquido zero/i.test(semConvite)) {
    throw new Error('a prova esta dentro do convite e sai com ele');
  }
});

teste('a prova nao escreve o nome da plataforma', () => {
  // No corpo da página do cliente a plataforma se chama "a plataforma".
  // Trocar pelo nome do cliente tornaria a segunda linha falsa: é na conta de
  // captação dele que o dinheiro entra.
  const b = legivel(bloco(HOME));
  if (/incentivabr|destineai/i.test(b)) {
    throw new Error('a prova nomeia a plataforma');
  }
  if (/brand-name/.test(b)) {
    throw new Error('a prova usa .brand-name: viraria o nome do cliente');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 4. O FAQ continua respondendo
// ───────────────────────────────────────────────────────────────────────────

teste('o FAQ da home mantem as tres respostas', () => {
  const texto = legivel(HOME);
  for (const re of [/sai do meu bolso/i, /fica com o meu dinheiro/i, /quem pode destinar/i]) {
    if (!re.test(texto)) throw new Error('o FAQ perdeu uma resposta: ' + re);
  }
});

teste('a pagina do FAQ diz a condicao do modelo completo', () => {
  // A home dizia; esta pagina, nao — e e aqui que quem tem a duvida procura.
  const faq = legivel(leia('faq.html'));
  if (!/modelo completo|declaracao completa/i.test(faq)) {
    throw new Error('o FAQ nao diz que a deducao exige o modelo completo');
  }
  if (!/simplificado/i.test(faq)) {
    throw new Error('o FAQ nao diz o que acontece no simplificado');
  }
});

teste('nenhuma pagina ensina a conta pelo imposto RETIDO', () => {
  // Eram TRES copias da mesma conta errada — o topo da home, o FAQ e o
  // como-funciona, que a desmentia duas linhas acima dela. Para quem tem
  // saude, educacao ou previdencia privada o retido e MAIOR que o devido, e
  // a conta prometia limite maior que o da lei: o lado da malha fina.
  //
  // A guarda e do repositorio inteiro de proposito. Cada pagina guardava a
  // propria copia, e foi assim que as copias divergiram.
  const erros = [];
  for (const arquivo of fs.readdirSync(FRONTEND).filter(n => n.endsWith('.html'))) {
    const texto = legivel(leia(arquivo));
    if (/(retido|retencao)[^.<]{0,60}(x|×|\*)\s*(0,0?6|6\s*%|<span data-fiscal="teto_pct")/i.test(texto)) {
      erros.push(arquivo + ': multiplica o teto pelo imposto retido');
    }
    if (/retido[^.<]{0,40}(≈|=)[^.<]{0,40}devido/i.test(texto)) {
      erros.push(arquivo + ': iguala retido a devido');
    }
  }
  if (erros.length) throw new Error(erros.join('; '));
});

teste('a base da TINA nao carrega a conta errada', () => {
  // nucleo.md e retrato de seis paginas: a formula errada estava no prompt
  // dela tambem, e corrigir so o HTML deixaria a TINA repetindo o erro.
  const nucleo = fs.readFileSync(
    path.join(RAIZ, 'backend/src/knowledge/nucleo.md'), 'utf8');
  if (/(retido|retencao)[^.\n]{0,60}(x|×|\*)\s*(0,0?6|6\s*%)/i.test(nucleo)) {
    throw new Error('a base da TINA multiplica o teto pelo imposto retido');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 5. A aparência é do CSS
// ───────────────────────────────────────────────────────────────────────────

teste('a marca do limite e neutra, e quem decide e o CSS', () => {
  // O terceiro item é ressalva, não vantagem: não pode usar a mesma marca
  // verde-laranja dos dois primeiros. E a escolha é um atributo lido pelo
  // CSS, como o data-urgencia do relógio — nenhum estilo em JavaScript.
  const b = legivel(bloco(HOME));
  if (!/data-prova-marca="limite"/.test(b)) {
    throw new Error('o terceiro fato usa a marca de beneficio');
  }
  if (!/\.prova-marca\[data-prova-marca="limite"\]/.test(legivel(HOME))) {
    throw new Error('o CSS nao distingue a marca do limite');
  }
});

console.log('\nA prova de confiança no topo\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
