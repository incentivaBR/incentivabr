// A TINA tinha duas verdades fiscais no mesmo prompt.
//
// A persona (SYSTEM_PROMPT, em routes/chat.js) dizia que Esporte tinha 7%
// "independente da Rouanet" e que o maximo teorico chegava a 13%; o nucleo
// (knowledge/nucleo.md), enviado no mesmo array, diz teto unico de 6%. O
// modelo escolhia uma das duas conforme a pergunta. Raio-X de set/2026,
// risco 04.
//
// Este teste le o prompt FINAL — persona + nucleo + tenant + lembrete, na
// ordem em que vai para a API — e falha se qualquer bloco voltar a afirmar
// limites que o nucleo nao afirma. O nucleo e a unica fonte de percentuais.
import { montaSystem } from '../src/routes/chat.js';

const ok = [], falhas = [];
const teste = (nome, fn) => {
  try { fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

const semTenant = montaSystem(null);
const comTenant = montaSystem({
  name: 'Casa Azul', slug: 'casa-azul', pronac: '2511274',
  pronac_titulo: 'Casa Azul Celebra', fund_name: 'Lei Rouanet', max_percentage: 6
});

const textoDe = (system) => system.map(b => b.text).join('\n');

teste('o prompt tem os quatro blocos, e o nucleo esta entre eles', () => {
  if (semTenant.length !== 4) throw new Error(`${semTenant.length} blocos; esperado 4 (persona, nucleo, tenant, formato)`);
  const nucleo = semTenant[1].text;
  if (!nucleo || nucleo.length < 5000) throw new Error('nucleo vazio ou curto demais — nucleo.md nao carregou');
});

// As duas frases que o Raio-X apontou. Se qualquer uma voltar, em qualquer
// bloco, a contradicao voltou.
for (const [rotulo, system] of [['sem tenant', semTenant], ['com tenant', comTenant]]) {
  const texto = textoDe(system);

  teste(`prompt final ${rotulo} nao contem "13%"`, () => {
    if (texto.includes('13%')) throw new Error('"13%" voltou ao prompt');
  });

  teste(`prompt final ${rotulo} nao contem "independente da Rouanet"`, () => {
    if (/independente da rouanet/i.test(texto)) throw new Error('"independente da Rouanet" voltou ao prompt');
  });

  teste(`prompt final ${rotulo} nao traz metricas internas sem fonte`, () => {
    for (const frase of ['NPS +', '88% de quem', '88% concluíram', 'separado da Rouanet']) {
      if (texto.includes(frase)) throw new Error(`"${frase}" voltou ao prompt`);
    }
  });
}

// A persona nao pode voltar a ter tabela de limites propria: e o bloco que
// divergia. Percentual de mecanismo so no nucleo.
// O widget (frontend/js/tina.js) escapa a resposta do modelo antes de mostrar.
// Enquanto a persona mandava responder em HTML, cada <br> e <strong> aparecia
// escrito na tela. O formato pedido tem de ser texto.
teste('a persona pede texto simples, nao HTML', () => {
  const persona = semTenant[0].text;
  if (/use HTML/i.test(persona)) throw new Error('a persona voltou a pedir resposta em HTML');
  if (!/NUNCA escreva tags HTML/i.test(persona)) throw new Error('faltou a proibicao de tags HTML');
});

// "Zero risco" e "milhoes fazem" sao promessas que ninguem consegue sustentar
// diante da Receita. O prompt inteiro (persona + nucleo) nao pode traze-las.
for (const [rotulo, texto] of [['sem tenant', textoDe(semTenant)], ['com tenant', textoDe(comTenant)]]) {
  teste(`prompt final ${rotulo} nao promete "zero risco" nem cita "milhoes"`, () => {
    // A persona proibe a frase entre aspas; o que nao pode voltar e a afirmacao.
    if (/zero risco (de|se|seguindo)/i.test(texto)) throw new Error('"zero risco" voltou ao prompt como afirmacao');
    if (/milh[oõ]es de brasileiros/i.test(texto)) throw new Error('"milhoes de brasileiros" voltou ao prompt');
  });
}

teste('a persona nao tem tabela de limites por mecanismo', () => {
  const persona = semTenant[0].text;
  if (/Limite PF/i.test(persona)) throw new Error('a persona voltou a listar "Limite PF" por mecanismo');
  if (/M[aá]ximo te[oó]rico/i.test(persona)) throw new Error('a persona voltou a falar em "maximo teorico"');
});

teste('a persona manda usar o nucleo como unica fonte de percentuais', () => {
  const persona = semTenant[0].text;
  if (!/ÚNICA\s+fonte/i.test(persona)) throw new Error('faltou a instrucao de fonte unica');
});

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
