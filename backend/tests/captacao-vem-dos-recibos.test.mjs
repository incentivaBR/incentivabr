// A captação do projeto vem da SOMA DOS RECIBOS, não do campo com esse nome.
//
// O DEFEITO QUE ESTES TESTES GUARDAM
//
// A rota do projeto do tenant lia `valores.captado`, que vem do campo
// `valor_captado` do detalhe do projeto na API do SALIC. No código aberto da
// API esse rótulo é aplicado sobre a função `fnCustoProjeto` — o CUSTO do
// projeto —, e não existe nenhuma função de captação no arquivo. Três telas
// desenhavam a barra de captação com esse número: o assistente, duas vezes, e
// a página do projeto.
//
// O efeito é o pior possível numa página que pede transferência: "captado"
// valendo o custo encosta a barra em 100% e diz a quem chegou que o projeto já
// está financiado. Quem ia destinar, não destina. E nunca apareceu em
// simulação, porque nesse modo a rota não monta `valores` — ou seja, o defeito
// esperava a virada para produção para só então aparecer.
//
// A captação de verdade é CaptacaoReal, uma linha por recibo, em
// /projetos/:PRONAC/captacoes. A soma dessas linhas é o que a tela recebe.
import {
  resumoDasCaptacoes, resumoDaResposta, linhasDeCaptacao, zeroConferido,
  ZERO_CONFERIDO, SEM_CAPTACAO_MESSAGE_CODE
} from '../src/lib/captacaoDoSalic.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');

const ok = [], falhas = [];
const teste = (nome, fn) => {
  try { fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};
const igual = (a, b, o) => {
  if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
};

/** Como a API devolve: HAL, com nome e documento do doador em cada linha. */
const COMO_A_API_RESPONDE = {
  _embedded: {
    captacoes: [
      { PRONAC: '220001', valor: '5000.00',  data_recibo: '2026-03-14',
        nome_projeto: 'Projeto', cgccpf: '***.456.789-**', nome_doador: 'Maria de Souza' },
      { PRONAC: '220001', valor: '12500.50', data_recibo: '2026-09-02',
        nome_projeto: 'Projeto', cgccpf: '***.111.222-**', nome_doador: 'João Pereira' },
      { PRONAC: '220001', valor: '2000',     data_recibo: '2026-07-21',
        nome_projeto: 'Projeto', cgccpf: '***.333.444-**', nome_doador: 'Ana Lima' }
    ]
  }
};

/** O HTML sem comentários — a lição que esta casa já aprendeu seis vezes. */
const semComentario = (texto) => texto
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

// ───────────────────────────────────────────────────────────────────────────
// 1. A soma
// ───────────────────────────────────────────────────────────────────────────

teste('a captacao e a soma dos recibos', () => {
  const r = resumoDaResposta(COMO_A_API_RESPONDE);
  igual(r.captado, 19500.50, 'captado');
  igual(r.recibos, 3, 'recibos');
});

teste('o ultimo recibo e o mais recente, nao o ultimo da lista', () => {
  // A API não garante ordem, e a lista do fixture está fora de ordem de
  // propósito: pegar o último elemento daria 21/07.
  igual(resumoDaResposta(COMO_A_API_RESPONDE).ultimo_recibo, '2026-09-02', 'ultimo_recibo');
});

teste('valor com virgula decimal e lido', () => {
  // Campo de valor do SALIC já veio com vírgula; o modelo da API o declara
  // como String, então o formato não é garantido.
  const r = resumoDasCaptacoes([{ valor: '1.234,50', data_recibo: '2026-01-02' }]);
  igual(r, null, 'ponto de milhar com virgula decimal e ambiguo: nao se adivinha');
  igual(resumoDasCaptacoes([{ valor: '1234,50' }]).captado, 1234.50, 'virgula simples');
});

teste('linha com valor ilegivel NAO produz soma parcial', () => {
  // Pular a linha somaria MENOS que a verdade e apresentaria isso como o
  // total. Um número de dinheiro só se afirma inteiro.
  const r = resumoDasCaptacoes([
    { valor: '5000', data_recibo: '2026-03-14' },
    { valor: 'indisponível', data_recibo: '2026-04-01' }
  ]);
  igual(r, null, 'deveria recusar o total');
});

teste('valor negativo e recusado', () => {
  igual(resumoDasCaptacoes([{ valor: '-100' }]), null, 'negativo');
});

// ───────────────────────────────────────────────────────────────────────────
// 2. O que não sai daqui: dado pessoal de terceiro
// ───────────────────────────────────────────────────────────────────────────

teste('nome e documento do doador NUNCA saem no resumo', () => {
  // Cada linha de captação traz o nome do doador e o CPF dele. É dado pessoal
  // de terceiro que não nos serve para nada — a tela mostra um total e uma
  // data. Guardá-lo nos tornaria controladores de dado que não pedimos
  // (LGPD, art. 6º, III).
  const r = resumoDaResposta(COMO_A_API_RESPONDE);
  const json = JSON.stringify(r);
  for (const vazamento of ['Maria', 'João', 'Ana', 'cgccpf', '456.789', 'nome_doador', 'PRONAC']) {
    if (json.includes(vazamento)) {
      throw new Error(`"${vazamento}" chegou ao resumo: ${json}`);
    }
  }
  igual(Object.keys(r).sort().join(','), 'captado,recibos,ultimo_recibo', 'chaves do resumo');
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Os invólucros e os casos de borda
// ───────────────────────────────────────────────────────────────────────────

teste('o involucro HAL e a lista crua sao entendidos', () => {
  igual(linhasDeCaptacao(COMO_A_API_RESPONDE).length, 3, 'HAL');
  igual(linhasDeCaptacao([{ valor: '1' }]).length, 1, 'lista crua');
  igual(linhasDeCaptacao({ captacoes: [{ valor: '1' }] }).length, 1, 'chave no topo');
});

teste('involucro desconhecido e NAO SEI, nunca zero', () => {
  // Errar o invólucro produziria zero silencioso: a página diria que ninguém
  // doou porque nós lemos a resposta errado.
  igual(linhasDeCaptacao({ resultado: { itens: [] } }), null, 'desconhecido');
  igual(resumoDaResposta({ resultado: {} }), null, 'resumo');
  igual(resumoDaResposta(null), null, 'nulo');
});

teste('lista vazia E zero conferido', () => {
  // Aqui perguntamos e o Ministério respondeu: não há recibo. Diferente de
  // não ter perguntado.
  const r = resumoDaResposta({ _embedded: { captacoes: [] } });
  igual(r.captado, 0, 'captado');
  igual(r.recibos, 0, 'recibos');
  igual(r.ultimo_recibo, null, 'sem recibo, sem data');
});

teste('404 com o codigo da API e zero; 404 sem corpo e NAO SEI', () => {
  // A API responde 404 com message_code 11 para "este projeto não tem
  // captação". Mas 404 também é o que responde um endereço que não existe —
  // e tratar isso como zero afirmaria que ninguém doou porque nós erramos a
  // URL. Só o código separa os dois.
  igual(zeroConferido({ message_code: SEM_CAPTACAO_MESSAGE_CODE }).captado, 0, 'zero conferido');
  igual(zeroConferido(undefined), null, '404 sem corpo');
  igual(zeroConferido({ message: 'Not Found' }), null, '404 de outra coisa');
  igual(zeroConferido({ message_code: 13 }), null, 'erro interno da API');
});

teste('o zero conferido nao pode ser modificado por quem recebe', () => {
  // A constante é devolvida como cópia: um chamador que escrevesse nela
  // contaminaria todos os projetos seguintes do mesmo processo.
  const a = zeroConferido({ message_code: SEM_CAPTACAO_MESSAGE_CODE });
  a.captado = 999;
  igual(ZERO_CONFERIDO.captado, 0, 'a constante');
  igual(zeroConferido({ message_code: SEM_CAPTACAO_MESSAGE_CODE }).captado, 0, 'o proximo projeto');
});

// ───────────────────────────────────────────────────────────────────────────
// 4. A fonte errada não volta
// ───────────────────────────────────────────────────────────────────────────

teste('a rota nao devolve mais `captado` dentro de `valores`', () => {
  const js = semComentario(
    fs.readFileSync(path.join(RAIZ, 'backend/src/routes/salic.js'), 'utf8'));
  // Dentro do objeto `valores` do normalizador não pode haver a chave.
  const bloco = js.match(/valores:\s*\{[\s\S]*?\}/);
  if (!bloco) throw new Error('nao achei o objeto `valores` do normalizador');
  if (/\bcaptado\s*:/.test(bloco[0])) {
    throw new Error('`valores.captado` voltou — e ele e o custo do projeto: ' + bloco[0]);
  }
  if (/valor_captado\s*:\s*(?!.*recibos)/.test(js) && !/recibos\s*\?\s*recibos\.captado/.test(js)) {
    throw new Error('o caminho ao vivo nao monta o captado a partir dos recibos');
  }
});

teste('nenhuma pagina desenha captacao a partir de valores.captado', () => {
  // Lido SEM COMENTARIOS: o comentario que explica esta regra cita o campo
  // proibido nas duas paginas que foram consertadas. Uma guarda que procura o
  // nome cru acusaria justamente a explicacao — e e a setima vez que isso
  // acontece nesta casa.
  const dir = path.join(RAIZ, 'frontend');
  const culpadas = [];
  for (const nome of fs.readdirSync(dir).filter(f => f.endsWith('.html'))) {
    const html = semComentario(fs.readFileSync(path.join(dir, nome), 'utf8'));
    if (/valores\s*\??\s*\.\s*captado/.test(html)) culpadas.push(nome);
  }
  if (culpadas.length) {
    throw new Error('captacao desenhada com o custo do projeto em: ' + culpadas.join(', '));
  }
});

teste('a limpeza de comentarios nao cega as duas guardas acima', () => {
  const visivel = 'const cap = pct(p.valores?.captado, 1);';
  if (!/valores\s*\??\s*\.\s*captado/.test(semComentario(visivel))) {
    throw new Error('a limpeza apagou codigo que esta VIVO');
  }
  const comentado = '// a captacao nao vem de valores.captado\nconst x = 1;';
  if (/valores\s*\??\s*\.\s*captado/.test(semComentario(comentado))) {
    throw new Error('o comentario continua sendo lido');
  }
});

teste('o percentual da captacao e calculado em um lugar so', () => {
  // As duas paginas tinham a propria funcao pct(captado, aprovado). Uma conta
  // local precisa de um "captado" para multiplicar, e foi um captado errado
  // que desenhou a barra em 100%. O numero chega pronto do backend.
  const culpadas = [];
  for (const nome of ['destinar-rouanet.html', 'projetos-rouanet.html']) {
    const html = semComentario(
      fs.readFileSync(path.join(RAIZ, 'frontend', nome), 'utf8'));
    if (/function\s+pct\s*\(/.test(html)) culpadas.push(nome);
  }
  if (culpadas.length) throw new Error('conta propria de percentual em: ' + culpadas.join(', '));
});

teste('o corpo do erro da API chega a quem decide', () => {
  // Sem o corpo, 404 "nao ha captacao" e 404 "endereco errado" sao o mesmo
  // erro — e um deles viraria zero na tela.
  const js = semComentario(
    fs.readFileSync(path.join(RAIZ, 'backend/src/routes/salic.js'), 'utf8'));
  if (!/err\.corpo\s*=/.test(js)) throw new Error('salicFetch nao anexa o corpo do erro');
  if (!/zeroConferido\(\s*erro\.corpo\s*\)/.test(js)) {
    throw new Error('a rota nao consulta o corpo do erro para decidir');
  }
});

console.log('\nA captação vem dos recibos\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
