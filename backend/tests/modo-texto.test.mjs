// A pagina de destinacao fala em dois idiomas.
//
// Num deles nada e real e e preciso repetir isso o tempo todo. No outro ha
// dinheiro de servidor publico saindo de uma conta, e a mesma frase — "esta e
// uma simulacao" — vira mentira. Um aceite colhido sob descricao falsa nao e
// aceite (LGPD, art. 5o XII: livre, INFORMADO e inequivoco).
//
// A troca e feita por aplicaModo(), que le SIMULATION_MODE do servidor. O que
// este teste guarda sao as GARANTIAS ESTATICAS do arquivo — as que valem antes
// de qualquer JavaScript rodar, e que continuam valendo se o servidor nao
// responder. Sao elas que impedem que o texto errado apareca por acidente.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PAGINA = path.join(AQUI, '../../frontend/destinar-rouanet.html');
const html = fs.readFileSync(PAGINA, 'utf8');

const ok = [], falhas = [];
const teste = (nome, fn) => {
  try { fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

// Cada tag de abertura que carrega data-modo, com seus atributos.
const marcados = [...html.matchAll(/<[a-z]+\s[^>]*data-modo="(simulacao|producao)"[^>]*>/gi)]
  .map(m => ({ tag: m[0], modo: m[1] }));

teste('a pagina marca os dois modos', () => {
  const sim  = marcados.filter(m => m.modo === 'simulacao').length;
  const prod = marcados.filter(m => m.modo === 'producao').length;
  if (sim < 5)  throw new Error(`so ${sim} trechos de simulacao`);
  if (prod < 5) throw new Error(`so ${prod} trechos de producao`);
});

teste('todo trecho de modo comeca escondido', () => {
  // Sem isso os dois textos aparecem juntos no primeiro quadro, antes de
  // aplicaModo() rodar — e, se o servidor nao responder, ficam para sempre.
  const nus = marcados.filter(m => !/\shidden(\s|>|=)/i.test(m.tag));
  if (nus.length) {
    throw new Error(`${nus.length} sem hidden, ex.: ${nus[0].tag.slice(0, 90)}`);
  }
});

teste('o aceite comeca desabilitado', () => {
  const m = html.match(/<input[^>]*id="termsCheck"[^>]*>/i);
  if (!m) throw new Error('checkbox termsCheck sumiu');
  if (!/\sdisabled(\s|>|=)/i.test(m[0])) {
    throw new Error('termsCheck marcavel antes de a pagina saber o que declarar');
  }
});

teste('o rotulo neutro existe, e e o unico visivel de inicio', () => {
  if (!html.includes('id="modoIndefinido"')) {
    throw new Error('sem rotulo neutro, o aceite fica sem texto ate a config chegar');
  }
});

teste('so aplicaModo decide os trechos marcados com data-modo', () => {
  // Se outro ponto do codigo comecar a ligar/desligar esses trechos, a decisao
  // deixa de ter um dono unico e volta a ser possivel divergir do servidor.
  //
  // A guarda contava qualquer `.hidden =` da pagina. Era um proxy largo
  // demais: passou a acusar blocos sem nenhuma relacao com modo — o do CPF,
  // que a etapa de confirmacao mostra a quem ainda nao informou. O que
  // precisa de dono unico e a SELECAO de [data-modo], e e isso que se mede.
  const selecoes = [...html.matchAll(/\[data-modo\]/g)].map(m => m.index);
  if (selecoes.length !== 1) {
    throw new Error(`[data-modo] e selecionado em ${selecoes.length} pontos; so aplicaModo pode`);
  }
  const inicio = html.indexOf('function aplicaModo');
  if (inicio < 0) throw new Error('aplicaModo sumiu da pagina');
  const proximaFuncao = html.indexOf('\n    function ', inicio + 1);
  const fim = proximaFuncao < 0 ? html.length : proximaFuncao;
  if (selecoes[0] < inicio || selecoes[0] > fim) {
    throw new Error('[data-modo] e selecionado fora de aplicaModo');
  }
});

teste('o aceite de producao diz o que de fato acontece', () => {
  const bloco = html.split('id="termsCheck"')[1]?.split('</label>')[0] || '';
  const prod = bloco.split('data-modo="producao"')[1]?.split('</span>')[0] || '';
  for (const termo of ['modelo completo', 'CPF', 'proponente', 'Recibo de Mecenato']) {
    if (!prod.includes(termo)) throw new Error(`o aceite real nao menciona "${termo}"`);
  }
  // A palavra que tornaria o consentimento falso quando ha dinheiro real.
  if (/simula|demonstra/i.test(prod)) {
    throw new Error('o aceite de producao ainda fala em simulacao/demonstracao');
  }
});

teste('nenhuma mensagem de sucesso fala em simulacao sem checar o modo', () => {
  // successMsg e a ultima coisa que o destinador le. Se ela disser "nesta
  // simulacao" depois de uma transferencia real, desmente tudo o que veio antes.
  const trechos = html.split("getElementById('successMsg')").slice(1);
  if (!trechos.length) throw new Error('successMsg sumiu');
  trechos.forEach((t, i) => {
    const atribuicao = t.split(';')[0];
    if (/simula/i.test(atribuicao) && !/simulationMode/.test(atribuicao)) {
      throw new Error(`atribuicao ${i + 1} fala em simulacao sem consultar o modo`);
    }
  });
});

// ── Onda 1: o PDF vem do servidor, e o wizard tem porta de saída ────────────
teste('o PDF do navegador (jsPDF) saiu da pagina', () => {
  if (/jspdf/i.test(html)) throw new Error('jsPDF ainda e carregado');
  if (/gerarComprovantePDF/.test(html)) throw new Error('gerarComprovantePDF ainda existe');
  if (/SIMULACAO/.test(html)) throw new Error('a palavra SIMULACAO gravada a mao ainda esta na pagina');
});

teste('o botao de PDF existe e chama a rota autenticada do servidor', () => {
  const m = html.match(/<button[^>]*id="btnDownloadComprovante"[^>]*>/i);
  if (!m) throw new Error('btnDownloadComprovante nao existe — a funcao baixarComprovanteWizard nunca seria acionada');
  if (!/baixarComprovanteWizard\(\)/.test(m[0])) throw new Error('o botao nao chama baixarComprovanteWizard');
  if (!/\/api\/donations\/\$\{state\.donationId\}\/comprovante/.test(html)) throw new Error('a rota do PDF do servidor sumiu');
});

teste('a tela final tem "Ir para meu painel"', () => {
  const m = html.match(/<a[^>]*id="btnIrPainel"[^>]*>/i);
  if (!m) throw new Error('sem link para o painel');
  if (!/href="dashboard\.html"/.test(m[0])) throw new Error('o link nao vai para dashboard.html');
});

teste('o texto do registro em PDF tem os dois modos', () => {
  const bloco = html.split('id="btnDownloadComprovante"')[0].slice(-1600);
  if (!/data-modo="simulacao"/.test(bloco) || !/data-modo="producao"/.test(bloco)) {
    throw new Error('o texto sobre o PDF nao esta gateado por modo');
  }
  if (/Comprovante de mecenato dispon/i.test(html)) throw new Error('a pagina ainda chama o PDF de "comprovante de mecenato"');
});

teste('nenhum nome de projeto escrito a mao nas mensagens de sucesso', () => {
  // So as atribuicoes de successMsg: a foto do hero ainda e do projeto do
  // piloto (fica para a Onda 2, textos e imagens vindos do tenant).
  const trechos = html.split("getElementById('successMsg')").slice(1).map(t => t.split(';')[0]);
  if (!trechos.length) throw new Error('successMsg sumiu');
  for (const t of trechos) {
    if (/Orquestra|Casa Azul|Circuito do Forr/.test(t)) throw new Error('successMsg cita um projeto pelo nome: ' + t.slice(0, 80));
  }
  if (!trechos.some(t => /nomeDoProjeto\(\)/.test(t))) throw new Error('as mensagens nao usam nomeDoProjeto()');
});

console.log('\n================================================================');
ok.forEach(n => console.log('  ok   ', n));
falhas.forEach(([n, e]) => console.log('  FALHA', n, '\n          ' + e));
console.log('================================================================');
console.log(`${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
