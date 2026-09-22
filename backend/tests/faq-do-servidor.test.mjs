// A FAQ que a TINA come.
//
// Em setembro de 2026 chegou um roteiro de "passo a passo para destinar 6%",
// desses que circulam prontos. As perguntas eram boas — quem as escreveu
// conhece servidor público. As respostas tinham quatro erros que custariam
// dinheiro a quem seguisse:
//
//   1. listava PRONON e PRONAS/PCD como opção. Para pessoa física a faculdade
//      acabou no ano-calendário de 2025 (Lei 12.715/2012, art. 4º, caput, na
//      redação da Lei 14.564/2023): quem destinar em 2026 transfere e não
//      deduz;
//   2. "cada fundo tem sublimites específicos (geralmente 3% por tipo)" —
//      inventado. Os mecanismos dividem um teto só, e o 3% do FDCA é regra de
//      um conselho distrital, não regra geral;
//   3. mandava ANEXAR os recibos na declaração. Não se anexa; guarda-se;
//   4. "não há risco de cair na malha fina se mantiver a documentação".
//      Existe risco, e nós sabemos onde: o conflito entre o limite do conselho
//      e o teto geral ainda está na consulta ao tributarista.
//
// As perguntas entraram na `faq.html`, que é fonte do `nucleo.md` — então a
// TINA passa a responder o mesmo que o site, por construção. O que este
// arquivo guarda é que continue assim: que as perguntas do servidor tenham
// resposta, que a resposta chegue à base da TINA, e que os quatro erros não
// voltem por alguém "simplificando" o texto.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
const FRONTEND = path.join(RAIZ, 'frontend');

const faq = fs.readFileSync(path.join(FRONTEND, 'faq.html'), 'utf8');
const nucleo = fs.readFileSync(path.join(RAIZ, 'backend/src/knowledge/nucleo.md'), 'utf8');
const paginas = fs.readdirSync(FRONTEND).filter(f => f.endsWith('.html'))
  .map(f => [f, fs.readFileSync(path.join(FRONTEND, f), 'utf8')]);

const ok = [], falhas = [];
const teste = (nome, fn) => {
  try { fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

// ───────────────────────────────────────────────────────────────────────────
// 1. As perguntas do servidor têm resposta — e a TINA recebeu todas
// ───────────────────────────────────────────────────────────────────────────

// O que cada pergunta precisa dizer. O trecho é curto de propósito: prende o
// conteúdo, não a redação.
const PERGUNTAS = [
  ['dividir entre leis',   /dividir o limite entre leis/i,              /não se somam|mesmo.{0,15}teto/i],
  ['consignação em folha', /desconto em folha para uma entidade/i,      /não é doação incentivada/i],
  ['SIGEPE',               /Uso o SIGEPE/i,                             /comprovante de rendimentos/i],
  ['projeto recomendado',  /projeto recomendado para servidores/i,      /a escolha é sua/i],
  ['anexar comprovante',   /anexar os comprovantes na declaração/i,     /não tem campo para anexar/i],
  ['retificação',          /retificar a declaração/i,                   /imposto devido/i]
];

teste('a FAQ responde as perguntas que o servidor faz', () => {
  const mudas = PERGUNTAS.filter(([, pergunta]) => !pergunta.test(faq)).map(([n]) => n);
  if (mudas.length) throw new Error('sem pergunta na FAQ: ' + mudas.join(', '));

  const vazias = PERGUNTAS.filter(([, , resposta]) => !resposta.test(faq)).map(([n]) => n);
  if (vazias.length) throw new Error('pergunta sem o conteúdo que importa: ' + vazias.join(', '));
});

teste('a base da TINA recebeu as mesmas respostas', () => {
  // Se a FAQ mudar e ninguém rodar scripts/sync-nucleo-tina.mjs, a TINA segue
  // respondendo o texto velho e nada quebra — a divergência é silenciosa.
  // (nucleo-em-dia.test.mjs pega o arquivo desatualizado; aqui se mede que o
  // conteúdo destas perguntas chegou de fato.)
  const faltando = PERGUNTAS.filter(([, pergunta]) => !pergunta.test(nucleo)).map(([n]) => n);
  if (faltando.length) {
    throw new Error(
      'a TINA não recebeu: ' + faltando.join(', ') +
      '. Rode scripts/sync-nucleo-tina.mjs.'
    );
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Os quatro erros não voltam
// ───────────────────────────────────────────────────────────────────────────

teste('nenhuma página afirma sublimite de "3% por tipo" como regra geral', () => {
  // O 3% existe, mas é do CDCA/DF (RN 125/2026, art. 2º, § 1º, II), para o
  // fundo da criança no DF. Generalizar para "cada fundo tem o seu 3%" é
  // inventar limite — e, pior, inventar para MAIS: sugere que dá para somar
  // 3% aqui e 3% ali além do teto.
  const GENERALIZA = [
    /3%\s+por\s+(tipo|fundo|lei|categoria)/i,
    /(cada|todo)\s+(fundo|lei|mecanismo)[^.]{0,40}3%/i,
    /geralmente\s+3%/i
  ];
  const culpadas = [];
  for (const [nome, html] of [...paginas, ['nucleo.md', nucleo]]) {
    for (const padrao of GENERALIZA) {
      const m = html.match(padrao);
      if (m) culpadas.push(`${nome}: "${m[0].trim()}"`);
    }
  }
  if (culpadas.length) {
    throw new Error('sublimite generalizado sem fonte:\n  ' + culpadas.join('\n  '));
  }
});

teste('nenhuma página manda anexar comprovante na declaração', () => {
  const MANDA = /anexe?\s+(os\s+)?(recibos?|comprovantes?)[^.]{0,40}declara/i;
  const culpadas = [];
  for (const [nome, html] of [...paginas, ['nucleo.md', nucleo]]) {
    const m = html.match(MANDA);
    if (m) culpadas.push(`${nome}: "${m[0].trim()}"`);
  }
  if (culpadas.length) {
    throw new Error(
      'A DIRPF não tem campo para anexar recibo — guarda-se. Encontrado:\n  ' +
      culpadas.join('\n  ')
    );
  }
});

teste('nenhuma página promete que não há risco de malha fina', () => {
  // Existe risco, e ele tem nome: o limite do conselho contra o teto geral,
  // pergunta 1 da consulta ao tributarista. Prometer ausência de risco é a
  // afirmação que o material comercial não sustenta — e é a que volta contra
  // a plataforma quando alguém for notificado.
  const PROMETE = [
    /n[ãa]o\s+h[áa]\s+risco/i,
    /sem\s+risco\s+(de\s+)?malha/i,
    /risco\s+zero/i
  ];
  const culpadas = [];
  for (const [nome, html] of [...paginas, ['nucleo.md', nucleo]]) {
    for (const padrao of PROMETE) {
      const m = html.match(padrao);
      if (m) culpadas.push(`${nome}: "${m[0].trim()}"`);
    }
  }
  if (culpadas.length) {
    throw new Error('promessa de ausência de risco:\n  ' + culpadas.join('\n  '));
  }
});

teste('a FAQ avisa que PRONON e PRONAS nao servem mais a pessoa fisica', () => {
  if (!/ano-calendário de 2025/.test(faq)) {
    throw new Error('a FAQ cita PRONON/PRONAS sem dizer que a faculdade da pessoa física acabou');
  }
  if (!/não gera dedução/i.test(faq)) {
    throw new Error('a FAQ não diz o efeito prático: destinação de 2026 não deduz');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 3. O que não está confirmado continua marcado
// ───────────────────────────────────────────────────────────────────────────

teste('a FAQ marca o que depende de parecer', () => {
  const marcas = faq.match(/Não confirmado por parecer/g) || [];
  if (marcas.length < 2) {
    throw new Error(
      `só ${marcas.length} aviso(s) de "não confirmado" na FAQ. O limite do ` +
      'conselho e o efeito da retificação dependem de parecer, e dizer isso ' +
      'é o que separa informar de aconselhar.'
    );
  }
});

teste('a FAQ nao escreve o ano a mao na conta do contracheque', () => {
  // "IR retido em 2024 × 0,06" envelhece calado: em 2026 a conta segue na
  // tela, com o ano errado, e ninguém vê nada quebrar.
  const m = faq.match(/IR retido em\s+20\d\d/i);
  if (m) throw new Error(`ano fixo na estimativa: "${m[0]}" — use "no ano anterior"`);
});

console.log('\nFAQ do servidor\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
