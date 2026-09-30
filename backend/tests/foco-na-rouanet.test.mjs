// A jornada é da Rouanet. As outras seis leis são referência.
//
// POR QUE
//
// Das sete leis do catálogo, só a Rouanet tem `disponivel_para_cliente = TRUE`
// (migration 043). As outras seis estão lá com o motivo escrito, esperando
// parecer. Mas a página inicial mostrava as sete numa grade de cartões, com o
// percentual de cada uma — seis portas que a plataforma não abre, na tela que
// existe para levar alguém a destinar.
//
// Os dois piores eram os de 1%: para pessoa física, a faculdade do caput do
// art. 4º da Lei 12.715/2012 (redação da Lei 14.564/2023) foi até o
// ano-calendário de 2025. A home anunciava PRONON e PRONAS/PCD sem esse aviso,
// que o próprio FAQ da mesma plataforma dá. A home contradizia o FAQ.
//
// O QUE **NÃO** FOI APAGADO, DE PROPÓSITO
//
// O cálculo multi-mecanismo do validador. Ele é o conserto da migration 045,
// que achou um erro real: PRONON e PRONAS eram somados contra um só 1%, e a
// ferramenta acusava excesso onde a lei permite o dobro. Apagar lógica fiscal
// correta e testada para "focar" seria a troca errada. O validador abre só com
// a Rouanet; as outras ficam atrás de uma porta, e a checagem continua inteira.
//
// A fronteira: Biblioteca Jurídica e Espaço do Contador são material de
// consulta para o contador, e continuam com as sete. Quem nunca some é o
// catálogo no banco — quando um mecanismo ganhar parecer, volta à tela por
// dado, não por deploy.
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

const leia = (nome) => fs.readFileSync(path.join(FRONTEND, nome), 'utf8');

/**
 * O que o visitante lê, sem os comentários.
 *
 * Isto não é zelo: o comentário que EXPLICA por que os cartões saíram nomeia
 * PRONON e PRONAS. Procurar o nome cru acusaria justamente o texto que existe
 * para impedir a volta deles — erro que este repositório já cometeu três vezes
 * em guardas parecidas.
 */
const textoDaTela = (html) => html
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<head[\s\S]*?<\/head>/gi, '');

/**
 * As entidades que estas páginas usam, resolvidas.
 *
 * "n&atilde;o registra destina&ccedil;&atilde;o" é a mesma frase que "não
 * registra destinação", e uma guarda que só entende uma das duas obriga quem
 * escreve a adivinhar qual. O arquivo mistura as duas formas.
 */
const semEntidades = (t) => t
  .replace(/&(a|e|i|o|u)(acute|grave|circ|tilde|uml);/gi, (_, v) => v)
  .replace(/&ccedil;/gi, 'c')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&');

const OUTRAS_LEIS = ['PRONON', 'PRONAS', 'FDCA', 'Fundo do Idoso', 'Reciclagem', 'Esporte'];

// ───────────────────────────────────────────────────────────────────────────
// 1. A página inicial oferece uma porta
// ───────────────────────────────────────────────────────────────────────────

teste('a home nao nomeia outra lei de incentivo', () => {
  const t = textoDaTela(leia('index.html'));
  const achadas = OUTRAS_LEIS.filter(lei => t.includes(lei));
  if (achadas.length) {
    throw new Error('a home voltou a oferecer: ' + achadas.join(', '));
  }
});

teste('a home nao escreve 1% em lugar nenhum', () => {
  // O 1% do PRONON e do PRONAS era o numero mais perigoso da grade: em 2026
  // nao gera deducao para pessoa fisica, e estava sem aviso.
  const t = textoDaTela(leia('index.html'));
  if (/>\s*1%\s*</.test(t) || /\b1%\s+(do|de)\s+IR/i.test(t)) {
    throw new Error('o 1% voltou a aparecer na home');
  }
});

teste('a home leva a Biblioteca para quem quer o panorama', () => {
  // Focar nao e esconder: quem quiser as sete leis tem para onde ir, e o lugar
  // e a pagina que ja se apresenta como consulta.
  const t = leia('index.html');
  if (!/biblioteca-juridica\.html/.test(t)) {
    throw new Error('a home tirou a grade e nao deixou caminho para a base legal');
  }
});

teste('o teto da home continua vindo do banco', () => {
  // A grade nova nao pode ter trazido de volta um "6%" escrito a mao: o
  // percentual e tese juridica pendente de parecer e mora em `tetos_deducao`.
  const t = textoDaTela(leia('index.html'));
  const semGancho = t.replace(/<span data-fiscal="teto_pct">[^<]*<\/span>/g, '');
  if (/\b6%/.test(semGancho)) throw new Error('ha 6% escrito a mao na home');
});

// ───────────────────────────────────────────────────────────────────────────
// 2. O validador abre na Rouanet, e não perde o cálculo cruzado
// ───────────────────────────────────────────────────────────────────────────

const VALIDADOR = leia('validador.html');

teste('a Rouanet esta fora da porta, e as outras quatro dentro', () => {
  const i = VALIDADOR.indexOf('<details');
  const f = VALIDADOR.indexOf('</details>');
  if (i === -1 || f === -1) throw new Error('a porta nao existe');
  if (VALIDADOR.indexOf('id="card-rouanet"') > i) {
    throw new Error('a Rouanet ficou dentro da porta');
  }
  const dentro = VALIDADOR.slice(i, f);
  for (const card of ['card-esporte', 'card-fidfia', 'card-reciclagem', 'card-pronon']) {
    if (!dentro.includes(card)) throw new Error(card + ' ficou fora da porta');
  }
});

teste('a porta nasce fechada', () => {
  const abertura = VALIDADOR.slice(VALIDADOR.indexOf('<details'), VALIDADOR.indexOf('>', VALIDADOR.indexOf('<details')) + 1);
  if (/\bopen\b/.test(abertura)) throw new Error('a porta nasce aberta: ' + abertura);
});

teste('o calculo cruzado continua inteiro', () => {
  // Esta e a razao de a logica nao ter sido apagada. Se algum destes campos
  // desaparecer, o conserto da migration 045 vai com ele.
  for (const id of ['v-esporte', 'v-fia', 'v-fdi', 'v-reciclagem', 'v-pronon', 'v-pronas']) {
    if (!VALIDADOR.includes(`id="${id}"`)) throw new Error('o campo ' + id + ' foi apagado');
  }
  // E cada um dos dois programas de saude continua com o SEU 1%.
  if (!/pronon:\s*ir\s*\*\s*0\.01/.test(VALIDADOR)) throw new Error('o 1% do PRONON saiu');
  if (!/pronas:\s*ir\s*\*\s*0\.01/.test(VALIDADOR)) throw new Error('o 1% do PRONAS saiu');
});

teste('valor digitado nas outras leis abre a porta', () => {
  // Sem isto, quem preenchesse o Esporte e fechasse o bloco veria um laudo
  // acusando estouro do teto com o numero que o causou escondido — e o teto e
  // compartilhado, entao a causa esta justamente ali.
  const v = VALIDADOR.slice(VALIDADOR.indexOf('function validar'));
  if (!/outras\.open\s*=\s*true/.test(v.slice(0, 1200))) {
    throw new Error('um valor escondido pode governar um laudo visivel');
  }
});

teste('o aviso do standby de PRONON e PRONAS segue na tela', () => {
  // A porta escondeu os campos; nao pode ter escondido o aviso de que, para
  // pessoa fisica, destinacao de 2026 nao gera deducao.
  const t = textoDaTela(VALIDADOR);
  if (!/ano-calendário de <strong>2025<\/strong>/.test(t)) {
    throw new Error('o aviso do caput do art. 4o saiu do validador');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 3. A agenda diz o que a plataforma faz e o que é referência
// ───────────────────────────────────────────────────────────────────────────

const AGENDA = leia('agenda-fiscal.html');

teste('so a Rouanet e marcada como disponivel na agenda', () => {
  const marcas = AGENDA.match(/naPlataforma:\s*true/g) || [];
  if (marcas.length !== 1) {
    throw new Error(`${marcas.length} modalidades marcadas como disponiveis; tem de ser 1`);
  }
  // E a marca tem de estar na Rouanet, nao em outra.
  const iRouanet = AGENDA.indexOf("nome: 'Lei Rouanet");
  const iEsporte = AGENDA.indexOf("nome: 'Lei do Esporte'");
  const iMarca = AGENDA.indexOf('naPlataforma: true');
  if (!(iRouanet < iMarca && iMarca < iEsporte)) {
    throw new Error('a marca de disponivel nao esta na Rouanet');
  }
});

teste('a modalidade sem caminho diz que nao tem caminho', () => {
  if (!/m\.naPlataforma/.test(AGENDA)) throw new Error('o cartao nao le a marca');
  if (!/n[ãa]o registra destinacao/.test(semEntidades(AGENDA))) {
    throw new Error('o cartao de referencia nao avisa que nao da para fazer aqui');
  }
});

teste('a agenda nao anuncia cinco caminhos como se existissem', () => {
  // Era: "Você pode destinar para FDCA, FDI, Rouanet, Esporte e Saúde."
  if (/destinar para FDCA, FDI, Rouanet/.test(AGENDA)) {
    throw new Error('o marco voltou a anunciar cinco caminhos');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 4. A referência não foi levada junto
// ───────────────────────────────────────────────────────────────────────────

teste('Biblioteca e Espaco do Contador seguem com as sete leis', () => {
  // Focar a jornada nao e apagar o conhecimento. Se estas duas encolherem, o
  // contador perde o quadro completo — que e o que elas existem para dar.
  for (const nome of ['biblioteca-juridica.html', 'espaco-contador.html']) {
    const t = textoDaTela(leia(nome));
    const faltando = ['PRONON', 'PRONAS', 'Esporte'].filter(lei => !t.includes(lei));
    if (faltando.length) {
      throw new Error(`${nome} perdeu: ${faltando.join(', ')}`);
    }
  }
});

teste('o catalogo no banco segue com os sete mecanismos', () => {
  // O caminho de volta de um mecanismo é dado, não deploy: quando o parecer
  // sair, `disponivel_para_cliente` vira TRUE e ele reaparece na tela sem que
  // ninguém escreva HTML. Isso só funciona se as sete linhas existirem.
  //
  // A primeira versão desta guarda recusava qualquer `DELETE FROM
  // incentive_groups` — e acusou a migration 043, onde o DELETE é legítimo:
  // desfaz a duplicata ROUANET/rouanet, repontando a chave estrangeira antes.
  // Guardar a AUSÊNCIA de um comando é grosso; o que importa é a presença das
  // linhas, e é isso que se confere.
  const dir = path.join(RAIZ, 'backend/src/migrations');
  const sql = fs.readdirSync(dir).filter(f => f.endsWith('.sql'))
    .map(f => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n')
    .replace(/^--.*$/gm, '');
  for (const code of ['rouanet', 'lie', 'fia', 'idoso', 'lir', 'pronon', 'pronas']) {
    if (!sql.includes(`'${code}'`)) {
      throw new Error(`o mecanismo ${code} saiu do catalogo`);
    }
  }
  if (/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?incentive_groups/i.test(sql)) {
    throw new Error('uma migration derruba a tabela do catalogo');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Número de estudo na home vem com a fonte
// ───────────────────────────────────────────────────────────────────────────

teste('os numeros do estudo na home citam a fonte', () => {
  // O 76% e o "< 4%" apareciam na home sem fonte, e o "< 4%" como "taxa de
  // aproveitamento atual" — generalizando para o Brasil um numero que o Espaco
  // do Contador cita como sendo do DF.
  const t = textoDaTela(leia('index.html'));
  for (const numero of ['76%', '4%']) {
    const i = t.indexOf(numero);
    if (i === -1) continue;                       // saiu da home: tambem resolve
    const volta = t.slice(Math.max(0, i - 400), i + 400);
    if (!/CRC-DF/.test(volta)) {
      throw new Error(`${numero} na home sem a fonte ao lado`);
    }
  }
});

console.log('\nA jornada é da Rouanet; as outras seis são referência\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
