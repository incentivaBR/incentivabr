// Onde o contribuinte acha o IR devido — e o que fazer quem não mexe na
// própria declaração.
//
// O PROBLEMA
//
// O topo da home passou a pedir o Imposto Devido (out/2026, e com razão: o
// retido é maior e prometia limite acima da lei). Mas quem não sabe o número
// era mandado para a calculadora de oito campos — que ESTIMA, quando o valor
// exato está na declaração que a pessoa já tem em casa.
//
// O desenho do resumo da declaração, com o "Imposto Devido" destacado no meio
// das outras linhas, já existia no guia. Ninguém chegava nele.
//
// E havia um público inteiro sem saída: quem entrega os documentos ao contador
// e recebe o recibo pronto. Para essa pessoa, "procure a ficha Cálculo do
// Imposto" é um beco — ela não tem o arquivo e não vai pedir para ter. O que
// ela tem é o contador.
//
// O QUE MUDOU
//
//   1. o topo da home pergunta "onde eu acho esse número?" e leva ao guia;
//   2. o guia mostra o resumo da declaração com o campo destacado;
//   3. um bloco novo dá a mensagem pronta para mandar ao contador, com as
//      duas perguntas que só ele responde (o IR devido e se a declaração é
//      no modelo completo);
//   4. o método do contracheque deixou de calcular limite: era a quarta cópia
//      da conta pelo imposto retido, e a quinta estava no SIGEPE.
//
// AS REGRAS QUE NÃO SE QUEBRAM
//
//   - NADA SAI DAQUI. A mensagem fica na tela e a pessoa manda do aparelho
//     dela. Sem rota, sem e-mail de terceiro guardado, sem mudança no mapa de
//     dados pessoais. Um campo "e-mail do contador" nesta tela seria outro
//     produto, com consentimento e controlador a definir;
//   - o texto da mensagem é lido do DOM, nunca montado em JavaScript: assim
//     sai com o que o tenant.js preencheu e não há segunda cópia para
//     divergir;
//   - o endereço vem de `location.host`. Escrito à mão, mandaria o contador do
//     cliente para a página da plataforma, onde o projeto dele não está.
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

/** Sem comentários e sem entidades: o comentário cita o que a regra proíbe. */
const legivel = (x) => x
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/&(a|e|i|o|u)(acute|grave|circ|tilde|uml);/gi, (_, v) => v)
  .replace(/&ccedil;/gi, 'c')
  .replace(/&rarr;/gi, '->');

const GUIA = leia('guia-ir-servidor.html');
const HOME = leia('index.html');

/** O bloco do contador, da abertura ao fechamento que casa. */
function blocoContador(html) {
  const m = /<div[^>]*\bid="com-contador"[^>]*>/i.exec(html);
  if (!m) throw new Error('o bloco do contador nao existe');
  const re = /<\/?div\b/gi;
  re.lastIndex = m.index + m[0].length;
  let nivel = 1, t;
  while ((t = re.exec(html)) !== null) {
    nivel += t[0][1] === '/' ? -1 : 1;
    if (nivel === 0) return html.slice(m.index, html.indexOf('>', t.index) + 1);
  }
  throw new Error('o bloco do contador nao fecha');
}

// ───────────────────────────────────────────────────────────────────────────
// 1. O caminho até o guia
// ───────────────────────────────────────────────────────────────────────────

teste('o topo da home leva a onde se acha o numero', () => {
  const texto = legivel(HOME);
  const i = texto.indexOf('id="heroIrAjuda"');
  if (i === -1) throw new Error('a ajuda do campo do topo mudou de nome');
  const ajuda = texto.slice(i, i + 700);
  if (!/guia-ir-servidor\.html/.test(ajuda)) {
    throw new Error('o topo nao leva ao guia de onde achar o IR devido');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 2. O modelo do resumo da declaração
// ───────────────────────────────────────────────────────────────────────────

teste('o guia desenha o resumo da declaracao com o campo destacado', () => {
  const texto = legivel(GUIA);
  if (!/Resumo da Declara\S*\s*[-—]\s*C\S*lculo do Imposto/i.test(texto)) {
    throw new Error('o guia nao mostra o resumo da declaracao');
  }
  // O destaque é o que faz o desenho servir: sem ele são seis linhas iguais.
  // E tem de estar NA LINHA do Imposto Devido — destacar o retido ensinaria
  // justamente o erro que o resto desta suíte existe para impedir.
  // A âncora é o CABEÇALHO DO DESENHO, não a primeira menção ao resumo: o
  // passo 3 já diz "abra o Resumo da Declaração" muito antes, e ancorar ali
  // fazia a guarda ler o texto do passo em vez do quadro.
  const cab = /Resumo da Declara\S*\s*[-—]\s*C\S*lculo do Imposto/i.exec(texto);
  const quadro = texto.slice(cab.index, cab.index + 2600);
  if (!/Imposto Devido/.test(quadro)) throw new Error('o desenho nao nomeia o Imposto Devido');
  const linha = quadro.split('\n').find(l => /Imposto Devido/.test(l)) || '';
  if (!/sm-highlight/.test(linha)) {
    throw new Error('o Imposto Devido nao e o campo destacado no desenho');
  }
  for (const outra of quadro.split('\n')) {
    if (/sm-highlight/.test(outra) && !/Imposto Devido/.test(outra)) {
      throw new Error('outro campo tambem esta destacado: ' + outra.trim().slice(0, 60));
    }
  }
  // E as linhas vizinhas têm de estar lá: o valor do desenho é mostrar o
  // campo CERTO no meio dos parecidos (retido, restituir).
  for (const vizinha of [/Retido na Fonte/i, /Restituir/i, /Base de C\S*lculo/i]) {
    if (!vizinha.test(quadro)) throw new Error('o desenho perdeu uma linha vizinha: ' + vizinha);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 3. O guia não calcula limite sobre o imposto retido
// ───────────────────────────────────────────────────────────────────────────

teste('nenhum metodo do guia tira o limite do imposto retido', () => {
  // Eram duas cópias aqui — o método do contracheque ("use o IRRF acumulado
  // como estimativa do IR Devido", × 6%) e o do SIGEPE ("a soma dos IRRF é a
  // base de estimativa"). A guarda dos textos fiscais não as pegou porque
  // elas dizem IRRF, não "retido".
  const texto = legivel(GUIA);
  const proibidos = [
    [/(IRRF|retid\w+)[^.<]{0,80}(×|\bx\b|\*)\s*(0,0?\d|<span data-fiscal="teto_pct")/i,
     'multiplica o teto pelo imposto retido'],
    [/(IRRF|retid\w+)[^.<]{0,60}(estimativa|base) d[eo] IR Devido/i,
     'apresenta o retido como estimativa ou base do IR devido'],
    [/limite estimado\s*=\s*R\$\s*[\d.]+\s*(×|\bx\b)/i,
     'calcula "limite estimado" a partir de um valor retido']
  ];
  for (const [re, porque] of proibidos) {
    const m = re.exec(texto);
    if (m) throw new Error(porque + ': "' + m[0].slice(0, 70).trim() + '"');
  }
});

teste('o guia diz para que o contracheque SERVE', () => {
  // Tirar a conta errada e não pôr nada no lugar deixaria o método sem razão
  // de existir — e um método vazio volta a ser preenchido com a conta errada.
  const texto = legivel(GUIA).toLowerCase();
  if (!/se voc[eê] paga ir|tem irrf/.test(texto)) {
    throw new Error('o metodo do contracheque nao diz para que serve');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 4. O bloco do contador
// ───────────────────────────────────────────────────────────────────────────

teste('o guia tem o bloco de quem faz a declaracao com contador', () => {
  const b = legivel(blocoContador(GUIA));
  if (!/contador/i.test(b)) throw new Error('o bloco nao fala do contador');
});

teste('a mensagem faz as DUAS perguntas que so o contador responde', () => {
  const b = legivel(blocoContador(GUIA)).toLowerCase();
  if (!/imposto devido/.test(b)) throw new Error('a mensagem nao pergunta o imposto devido');
  if (!/modelo completo/.test(b)) throw new Error('a mensagem nao pergunta o modelo da declaracao');
  // A consequência do simplificado é o que impede a transferência perdida.
  if (!/simplificado/.test(b)) throw new Error('a mensagem nao avisa sobre o simplificado');
});

teste('a mensagem nao escreve a mao o que vem do catalogo', () => {
  const b = legivel(blocoContador(GUIA));
  // Sem o conteúdo dos ganchos (que é reserva), nada de percentual, nome de
  // lei ou nome de recibo pode sobrar escrito.
  const semGancho = b.replace(
    /<(span|strong|b|em)[^>]*\bdata-(fiscal|termo|mecanismo)="[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, '');
  if (/\d+\s*%/.test(semGancho)) {
    throw new Error('percentual a mao na mensagem: ' + /\d+\s*%/.exec(semGancho)[0]);
  }
  if (/Recibo de Mecenato/i.test(semGancho)) {
    throw new Error('"Recibo de Mecenato" a mao: em outro mecanismo o documento tem outro nome');
  }
  if (/Lei Rouanet/i.test(semGancho)) {
    throw new Error('o nome da lei a mao: o site opera a lei do cadastro do cliente');
  }
  for (const gancho of ['data-mecanismo="nome"', 'data-termo="recibo"', 'data-fiscal="teto_pct"']) {
    if (!b.includes(gancho)) throw new Error('a mensagem nao usa ' + gancho);
  }
});

teste('o endereco da mensagem vem de location.host', () => {
  // Escrito à mão, mandaria o contador do cliente para a página da
  // plataforma, onde o projeto do cliente não está. Mesma lição da mensagem
  // do Espaço do Contador.
  if (!/id="msg-contador-site"/.test(GUIA)) {
    throw new Error('a mensagem nao tem o lugar do endereco');
  }
  // O id aparece duas vezes — no span e no script que o preenche. A segunda é
  // a que importa, e procurar a partir da primeira acha só o texto de reserva.
  const i = GUIA.lastIndexOf('msg-contador-site');
  if (!/location\.host/.test(GUIA.slice(i, i + 400))) {
    throw new Error('o endereco da mensagem nao vem de location.host');
  }
});

teste('NADA e enviado por aqui', () => {
  // A escolha foi mensagem copiável, não envio pela plataforma: um campo de
  // e-mail do contador nesta tela faria dele destinatário de dado pessoal, com
  // consentimento e controlador a definir. Se isso for construído um dia, será
  // com rota, mapa de dados e esta guarda reescrita de propósito.
  const b = blocoContador(GUIA);
  if (/<input|<form/i.test(b)) throw new Error('ha formulario no bloco do contador');
  if (/fetch\(|XMLHttpRequest/i.test(b)) throw new Error('o bloco do contador chama o servidor');
  const script = GUIA.slice(GUIA.indexOf('A MENSAGEM PARA O CONTADOR'));
  if (/fetch\(|\/api\//.test(script)) {
    throw new Error('o script da mensagem fala com o servidor');
  }
});

teste('o texto da mensagem e lido do DOM, nao montado em JavaScript', () => {
  // Montado no script, seria uma segunda cópia da mensagem — e as cópias
  // divergem. Lido do DOM, sai com o que o tenant.js já preencheu.
  const script = GUIA.slice(GUIA.indexOf('A MENSAGEM PARA O CONTADOR'));
  if (!/innerText/.test(script.slice(0, 2500))) {
    throw new Error('o script nao le o texto da tela');
  }
});

teste('os links de WhatsApp e e-mail escapam o texto', () => {
  const script = GUIA.slice(GUIA.indexOf('A MENSAGEM PARA O CONTADOR'), GUIA.indexOf('</script>', GUIA.indexOf('A MENSAGEM PARA O CONTADOR')));
  if (!/wa\.me\/\?text='\s*\+\s*t\b/.test(script)) throw new Error('o link do WhatsApp nao usa o texto escapado');
  if (!/encodeURIComponent/.test(script)) throw new Error('o texto entra na URL sem encodeURIComponent');
  if (/href\s*=\s*['"`]https?:\/\/[^'"`]*\$\{/.test(script)) {
    throw new Error('texto cru interpolado direto no href');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 5. O gancho do vocabulário funciona fora do assistente
// ───────────────────────────────────────────────────────────────────────────

teste('o tenant.js preenche [data-termo] em qualquer pagina', () => {
  // O gancho existe desde a migration 051 e só o assistente o preenchia: fora
  // dele ficava parado na reserva, com cara de dado e sem ser dado.
  const tenant = fs.readFileSync(path.join(FRONTEND, 'js/tenant.js'), 'utf8');
  if (!/\[data-termo="\$\{|data-termo="\$\{chave\}/.test(tenant)) {
    throw new Error('tenant.js nao preenche [data-termo]');
  }
  if (!/vocabulario/.test(tenant)) {
    throw new Error('tenant.js nao le o vocabulario do mecanismo');
  }
});

console.log('\nOnde o contribuinte acha o IR devido\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
