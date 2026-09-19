// A base de conhecimento da TINA é um retrato das páginas, e o retrato tem
// de estar em dia.
//
// nucleo.md é gerado por scripts/sync-nucleo-tina.mjs a partir de seis
// páginas do frontend. Ninguém rodava o script: em set/2026 o projeto do
// piloto saiu das páginas (PR #44) e a TINA seguiu citando "Orquestra das
// Periferias do DF" dez vezes, no site de qualquer cliente, por cinco dias.
// Nada quebrou, porque nada conferia.
//
// O que estes testes guardam:
//   - o arquivo é exatamente o que o script geraria hoje das páginas atuais;
//   - o retrato não traz o projeto do piloto nem texto de estado vazio;
//   - as perguntas do contador entraram, e a tabela de fichas da DIRPF do
//     Espaço do Contador não (diverge do guia; tributarista decide);
//   - o prefixo continua grande o bastante para o Haiku cachear.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geraNucleo, DESTINO, FONTES } from '../../scripts/sync-nucleo-tina.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');

const ok = [], falhas = [];
const teste = (nome, fn) => { try { fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); } };

const arquivo = fs.readFileSync(DESTINO, 'utf-8');
const gerado = geraNucleo();

teste('nucleo.md e o retrato atual das paginas (rode scripts/sync-nucleo-tina.mjs)', () => {
  if (arquivo !== gerado) {
    const a = arquivo.split('\n'), g = gerado.split('\n');
    const i = a.findIndex((l, k) => l !== g[k]);
    throw new Error(`difere a partir da linha ${i + 1}:\n          arquivo: ${(a[i] || '').slice(0, 90)}\n          paginas: ${(g[i] || '').slice(0, 90)}`);
  }
});

teste('o retrato nao cita o projeto do piloto nem numero de piloto sem fonte', () => {
  for (const t of ['Orquestra das Periferias', 'Ceilândia', 'Piloto IncentivaBR']) {
    if (arquivo.includes(t)) throw new Error('a TINA ainda diz: ' + t);
  }
});

teste('texto de estado vazio nao vira conhecimento', () => {
  if (arquivo.includes('Nenhuma pergunta encontrada')) throw new Error('"Nenhuma pergunta encontrada" esta no nucleo');
});

teste('as perguntas do contador entraram, e as respostas do FAQ tambem', () => {
  for (const t of ['PERGUNTAS QUE O CONTADOR FAZ', 'Art. 18 e Art. 26', 'O limite é sobre o IR Devido']) {
    if (!arquivo.includes(t)) throw new Error('faltou: ' + t);
  }
  // As respostas do FAQ nascem colapsadas (classe hidden). Um filtro de
  // "esconde tudo o que esta hidden" as apagava: 6.600 chars viravam 850.
  const faq = arquivo.slice(arquivo.indexOf('# PERGUNTAS FREQUENTES'), arquivo.indexOf('# PERGUNTAS QUE O CONTADOR FAZ'));
  if (faq.length < 4000) throw new Error(`o FAQ veio curto demais (${faq.length} chars): as respostas sumiram?`);
});

teste('a tabela de fichas da DIRPF do Espaco do Contador fica de fora ate o parecer', () => {
  const contador = FONTES.find(f => f[0] === 'espaco-contador');
  if (!contador || !contador[2] || contador[2].includes('documentacao')) {
    throw new Error('espaco-contador entra inteiro ou com #documentacao; a tabela diverge do guia do servidor');
  }
  const secao = arquivo.slice(arquivo.indexOf('# PERGUNTAS QUE O CONTADOR FAZ'));
  if (/Incentivos Fiscais\s*->?\s*PRONAC/.test(secao)) throw new Error('a tabela de fichas entrou no nucleo');
});

teste('o prefixo continua acima do minimo que o Haiku cacheia', () => {
  const tokens = Math.round(arquivo.length / 4);
  if (tokens < 4096) throw new Error(`~${tokens} tokens; abaixo de 4.096 o cache falha em silencio`);
});

teste('toda fonte listada existe', () => {
  for (const [arq] of FONTES) {
    if (!fs.existsSync(path.join(RAIZ, 'frontend', arq + '.html'))) throw new Error('fonte inexistente: ' + arq);
  }
});

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
