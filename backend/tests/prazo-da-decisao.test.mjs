// Quanto tempo a pessoa tem — e qual dos dois prazos manda.
//
// O PROBLEMA
//
// O site explicava o benefício e não dizia quando ele acaba. Quem entende e
// concorda sai da página para decidir depois, e "depois" é onde a destinação
// morre: nada na tela marcava a hora em que a oportunidade deixa de existir.
//
// SÃO DOIS PRAZOS
//
//   1. O FIM DO ANO-CALENDÁRIO. A dedução é do valor efetivamente pago dentro
//      do ano-calendário, então transferência de 2 de janeiro entra na
//      declaração de dois anos depois. Vale para TODA pessoa, tenha ou não
//      projeto cadastrado — é o prazo mais forte justamente por não depender
//      de nada que o cliente tenha preenchido;
//   2. A JANELA DE CAPTAÇÃO DO PROJETO (migration 053). Depois dela o projeto
//      não capta, e a plataforma estaria pedindo transferência para uma conta
//      que não pode receber.
//
// O que vence primeiro manda — a mesma regra do sublimite em `lib/tetos.js` e
// das duas validades em `lib/certificado.js`. Aqui ela importa porque os dois
// correm em velocidades diferentes: o do ano é previsível, o do projeto pode
// acabar em março.
//
// E O QUE NÃO SE FAZ
//
// Inventar prazo. Sem `captacao_fim` só o ano conta, e a tela não ganha aviso
// sobre janela que não existe — pela razão escrita em `lib/prazos.js`: aviso
// inventado onde não há prazo treina a pessoa a ignorar o aviso onde há.
import {
  prazoQueManda, fimDoAnoCalendario, DIAS_CRITICO, DIAS_ALTO, DIAS_MEDIO
} from '../src/lib/prazoDaDecisao.js';
import { situacaoDaCaptacao, PRAZO_APERTADO_DIAS } from '../src/lib/captacao.js';
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

const EM = (iso) => new Date(iso + 'T12:00:00Z');

/** O projeto da Casa Azul, como o SALIC respondeu em setembro de 2026. */
const CASA_AZUL = {
  valor_autorizado: 635728.50, valor_captado: 0,
  captacao_inicio: '2026-01-01', captacao_fim: '2026-12-31',
  valores_em: '2026-09-29'
};
const captacaoDe = (p, agora) => situacaoDaCaptacao(p, agora);

// ───────────────────────────────────────────────────────────────────────────
// 1. O ano-calendário, que nunca falta
// ───────────────────────────────────────────────────────────────────────────

teste('sem projeto, o ano-calendario manda e o relogio existe', () => {
  // Este é o caso do cliente que ainda não preencheu os valores do projeto.
  // Se o prazo morasse dentro de `captacao`, ele ficaria sem relógio — e é
  // justamente quem mais precisa dele na tela.
  const p = prazoQueManda(null, EM('2026-10-03'));
  igual(p.origem, 'ano_calendario', 'origem');
  igual(p.fim, '2026-12-31', 'fim');
  igual(p.dias, 89, 'dias ate 31/12/2026');
  igual(p.projeto, null, 'projeto');
  if (!/89 dias/.test(p.frase)) throw new Error('frase: ' + p.frase);
});

teste('a consequencia diz o ANO que se perde, nao "voce perde o beneficio"', () => {
  // "Perde o beneficio" e vago e por isso nao move ninguem. O que move e
  // saber que a restituicao sai um ano depois.
  const p = prazoQueManda(null, EM('2026-10-03'));
  if (!/2028/.test(p.consequencia) || !/2027/.test(p.consequencia)) {
    throw new Error('a consequencia nao nomeia os dois anos: ' + p.consequencia);
  }
});

teste('fimDoAnoCalendario e 31/12, nao 31/05', () => {
  // 31/05 e o prazo da DECLARACAO, outra coisa. A agenda fiscal dizia 31/mai
  // em "quando destinar" nas seis modalidades — errando para o lado que faz
  // perder o ano achando que ha folga.
  igual(new Date(fimDoAnoCalendario(EM('2026-03-01'))).toISOString().slice(0, 10),
        '2026-12-31', 'fim do ano');
});

teste('o ultimo dia do ano tem frase propria', () => {
  const p = prazoQueManda(null, EM('2026-12-31'));
  igual(p.dias, 0, 'dias');
  igual(p.urgencia, 'hoje', 'urgencia');
  if (!/último dia/i.test(p.frase)) throw new Error('frase: ' + p.frase);
});

// ───────────────────────────────────────────────────────────────────────────
// 2. O que vence primeiro manda
// ───────────────────────────────────────────────────────────────────────────

teste('janela do projeto que fecha antes do ano manda', () => {
  const agora = EM('2026-10-03');
  const c = captacaoDe({ ...CASA_AZUL, captacao_fim: '2026-11-15' }, agora);
  const p = prazoQueManda(c, agora);
  igual(p.origem, 'captacao_do_projeto', 'origem');
  igual(p.dias, 43, 'dias ate 15/11');
  igual(p.ano_calendario.dias, 89, 'o do ano continua visivel');
  if (!/n[ãa]o capta mais/.test(p.consequencia)) throw new Error('consequencia: ' + p.consequencia);
});

teste('janela que vai ate o fim do ano deixa o ano mandar', () => {
  // A da Casa Azul termina em 31/12, junto com o ano-calendario. Empate vai
  // para o ano: e o prazo que vale para qualquer pessoa, e a frase dele nao
  // depende de cadastro.
  const agora = EM('2026-10-03');
  const p = prazoQueManda(captacaoDe(CASA_AZUL, agora), agora);
  igual(p.origem, 'ano_calendario', 'origem');
  igual(p.dias, 89, 'dias');
});

teste('janela que passa do ano nao estende o prazo', () => {
  // Projeto autorizado a captar ate marco de 2027: quem destinar em janeiro
  // ajuda o projeto, mas abate so na declaracao de 2028. O relogio da tela
  // tem de falar do ano, nao da janela.
  const agora = EM('2026-10-03');
  const c = captacaoDe({ ...CASA_AZUL, captacao_fim: '2027-03-31' }, agora);
  const p = prazoQueManda(c, agora);
  igual(p.origem, 'ano_calendario', 'origem');
  igual(p.dias, 89, 'dias');
  igual(p.projeto.dias, 179, 'o do projeto continua no objeto');
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Projeto encerrado: a tela para de convidar
// ───────────────────────────────────────────────────────────────────────────

teste('janela encerrada marca projeto_encerrado', () => {
  // Continuar oferecendo "destinar" para um projeto que nao pode receber e o
  // pior resultado possivel desta tela.
  const agora = EM('2026-10-03');
  const c = captacaoDe({ ...CASA_AZUL, captacao_fim: '2026-08-31' }, agora);
  const p = prazoQueManda(c, agora);
  igual(p.projeto_encerrado, true, 'projeto_encerrado');
  igual(p.urgencia, 'encerrado', 'urgencia');
  if (!/encerrada/i.test(p.frase)) throw new Error('frase: ' + p.frase);
});

teste('ano aberto nao mascara projeto fechado', () => {
  // Faltam 89 dias de ano-calendario, mas o projeto fechou em agosto. Se o
  // ano mandasse, a tela diria "faltam 89 dias" para quem nao pode destinar.
  const agora = EM('2026-10-03');
  const c = captacaoDe({ ...CASA_AZUL, captacao_fim: '2026-08-31' }, agora);
  const p = prazoQueManda(c, agora);
  igual(p.origem, 'captacao_do_projeto', 'o projeto fechado tem de mandar');
  if (/89/.test(p.frase)) throw new Error('a frase do ano venceu a do projeto: ' + p.frase);
});

teste('sem projeto, projeto_encerrado e falso — nao nulo nem verdadeiro', () => {
  igual(prazoQueManda(null, EM('2026-10-03')).projeto_encerrado, false, 'projeto_encerrado');
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Os níveis de urgência
// ───────────────────────────────────────────────────────────────────────────

teste('a urgencia sobe conforme o prazo encurta', () => {
  const nivel = (dias) => {
    // Um 31/12 a `dias` de distancia.
    const alvo = new Date(Date.UTC(2026, 11, 31) - dias * 86400000);
    return prazoQueManda(null, alvo).urgencia;
  };
  igual(nivel(200), 'baixo', '200 dias');
  igual(nivel(DIAS_MEDIO), 'medio', `${DIAS_MEDIO} dias`);
  igual(nivel(DIAS_ALTO), 'alto', `${DIAS_ALTO} dias`);
  igual(nivel(DIAS_CRITICO), 'critico', `${DIAS_CRITICO} dias`);
  igual(nivel(1), 'critico', '1 dia');
  igual(nivel(0), 'hoje', 'hoje');
});

teste('a regua do medio e a mesma da captacao, nao uma segunda', () => {
  // Duas constantes para a mesma ideia divergem na primeira vez que alguem
  // mexe numa delas.
  igual(DIAS_MEDIO, PRAZO_APERTADO_DIAS, 'DIAS_MEDIO');
});

teste('o singular aparece quando falta um dia', () => {
  const p = prazoQueManda(null, EM('2026-12-30'));
  if (!/Falta 1 dia/.test(p.frase)) throw new Error('frase: ' + p.frase);
});

// ───────────────────────────────────────────────────────────────────────────
// 5. A tela
// ───────────────────────────────────────────────────────────────────────────

const leia = (n) => fs.readFileSync(path.join(RAIZ, 'frontend', n), 'utf8');
const PAGINAS_COM_RELOGIO = ['index.html', 'projetos-rouanet.html', 'calculadora.html', 'destinar-rouanet.html'];

teste('as paginas que pedem acao tem o relogio', () => {
  for (const nome of PAGINAS_COM_RELOGIO) {
    const t = leia(nome);
    if (!/data-prazo-bloco/.test(t)) throw new Error(nome + ' nao tem o bloco');
    for (const chave of ['dias', 'frase', 'consequencia']) {
      if (!t.includes(`data-prazo="${chave}"`)) throw new Error(`${nome} nao mostra ${chave}`);
    }
  }
});

teste('o bloco nasce hidden: contador zerado e pior que nenhum', () => {
  for (const nome of PAGINAS_COM_RELOGIO) {
    const abertura = /<div data-prazo-bloco[^>]*>/.exec(leia(nome));
    if (!abertura) throw new Error(nome + ': bloco nao encontrado');
    if (!/\bhidden\b/.test(abertura[0])) throw new Error(nome + ': o bloco nasce visivel');
  }
});

teste('nenhuma pagina escreve o numero de dias a mao', () => {
  // Um "Faltam 89 dias" no HTML seria a copia que nao acompanha o calendario —
  // e envelheceria no dia seguinte.
  for (const nome of PAGINAS_COM_RELOGIO) {
    const t = leia(nome).replace(/<!--[\s\S]*?-->/g, '');
    if (/Falta[m]?\s+\d+\s+dias?/.test(t)) throw new Error(nome + ' escreve os dias a mao');
  }
});

teste('a cor da urgencia sai de CSS, nao de JavaScript', () => {
  // Se o JavaScript escolhesse a cor, o nivel de alarme poderia discordar do
  // numero de dias. O tenant.js escreve o atributo; o CSS decide a aparencia.
  const tenant = leia('js/tenant.js');
  const trecho = tenant.slice(tenant.indexOf('function aplicaPrazo'));
  const corpo = trecho.slice(0, trecho.indexOf('\n}'));
  if (/background|color\s*=|#[0-9a-f]{6}/i.test(corpo)) {
    throw new Error('aplicaPrazo escolhe estilo');
  }
  if (!/dataset\.urgencia/.test(corpo)) throw new Error('aplicaPrazo nao publica a urgencia');
  for (const nome of PAGINAS_COM_RELOGIO) {
    if (!/\[data-urgencia="critico"\]/.test(leia(nome))) {
      throw new Error(nome + ' nao estiliza a urgencia critica');
    }
  }
});

teste('a home esconde o convite quando o projeto fechou', () => {
  const t = leia('index.html');
  if (!/data-prazo-convite/.test(t)) throw new Error('o convite nao esta marcado');
  if (!/data-prazo-fechado/.test(t)) throw new Error('nao ha saida para projeto encerrado');
  const tenant = leia('js/tenant.js');
  if (!/data-prazo-convite'\]',\s*!p\.projeto_encerrado/.test(tenant.replace(/\s+/g, ' '))
      && !/mostra\('\[data-prazo-convite\]', !p\.projeto_encerrado\)/.test(tenant)) {
    throw new Error('o convite nao depende de projeto_encerrado');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 6. O assistente: o relógio, a porta fechada e a data que vale
// ───────────────────────────────────────────────────────────────────────────

const ASSISTENTE = leia('destinar-rouanet.html');

teste('o assistente nao comeca com a janela encerrada', () => {
  // A rota tambem recusa (`captacao_encerrada`), porque esconder o botao nao
  // fecha o endereco. Mas deixar o botao convidando para uma recusa seria
  // desperdicar a confianca de quem clicou.
  if (!/data-prazo-fechado/.test(ASSISTENTE)) throw new Error('nao ha porta fechada');
  if (!/data-prazo-convite/.test(ASSISTENTE)) throw new Error('o convite nao esta marcado');

  // O botao que inicia o assistente tem de estar DENTRO do convite.
  const i = ASSISTENTE.indexOf('data-prazo-convite');
  const j = ASSISTENTE.indexOf('/data-prazo-convite');
  if (!(i > 0 && j > i)) throw new Error('o convite nao fecha');
  if (!ASSISTENTE.slice(i, j).includes('confirmarProjeto()')) {
    throw new Error('o botao de comecar ficou fora do convite');
  }
});

teste('a porta fechada diz por que, nao so que fechou', () => {
  const i = ASSISTENTE.indexOf('data-prazo-fechado');
  const trecho = ASSISTENTE.slice(i, i + 1400);
  if (!/n[ãa]o faça nenhuma transfer[êe]ncia/i.test(trecho)) {
    throw new Error('a porta fechada nao manda parar a transferencia');
  }
  if (!/data-termo="recibo"/.test(trecho)) {
    throw new Error('a porta fechada escreve o nome do recibo a mao');
  }
});

teste('o passo do pagamento fala da data da TRANSFERENCIA', () => {
  // `donations.transferido_em` (migration 048) existe por isto: quem registra
  // em 30 de dezembro e transfere em 2 de janeiro destinou no ano seguinte.
  const i = ASSISTENTE.indexOf('id="step4"');
  if (i === -1) throw new Error('o passo do pagamento mudou de nome');
  const passo = ASSISTENTE.slice(i, ASSISTENTE.indexOf('id="step5"'));
  if (!/data-prazo-bloco/.test(passo)) throw new Error('o passo do pagamento nao tem o prazo');
  if (!/sai da sua conta/.test(passo)) {
    throw new Error('o passo do pagamento nao diz qual data vale');
  }
});

teste('a rota recusa janela encerrada, em qualquer modo', () => {
  // A guarda de tela e meia guarda. Esta linha e a outra metade.
  const rota = fs.readFileSync(path.join(RAIZ, 'backend/src/routes/donations.js'), 'utf8');
  if (!/captacao_encerrada/.test(rota)) throw new Error('a rota nao recusa janela encerrada');
  if (!/captacao_fim/.test(rota)) throw new Error('a rota nao le a coluna da janela');

  // A recusa NAO pode estar presa a SIMULATION_MODE: janela fechada e fato do
  // projeto. E o corte tem de ser `>`, nunca `>=`, senao fecha um dia antes.
  const i = rota.indexOf('captacao_encerrada');
  const bloco = rota.slice(rota.lastIndexOf('if (op?.captacao_fim)', i), i);
  if (/SIMULATION_MODE/.test(bloco)) throw new Error('a recusa foi presa ao modo simulacao');
  if (!/hojeUtc\s*>\s*fimUtc/.test(bloco)) {
    throw new Error('o corte da janela nao e estritamente depois do ultimo dia');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 7. A agenda fiscal, que discordava do resto do site
// ───────────────────────────────────────────────────────────────────────────

teste('a agenda nao diz mais que da para destinar ate 31/mai', () => {
  const t = leia('agenda-fiscal.html').replace(/^\s*\/\/.*$/gm, '');
  if (/janela:\s*`[^`]*31\/mai/.test(t)) {
    throw new Error('"quando destinar" voltou a apontar o prazo da declaracao');
  }
  if (!/janela:\s*`1º\/jan a 31\/dez/.test(t)) {
    throw new Error('a janela de destinacao nao e o ano-calendario');
  }
});

teste('o site nao se contradiz sobre o prazo de destinar', () => {
  // O FAQ e o como-funciona diziam 31 de dezembro; so a agenda discordava.
  for (const nome of ['faq.html', 'como-funciona.html']) {
    const t = leia(nome);
    if (!/31 de dezembro/.test(t)) throw new Error(nome + ' perdeu o prazo de 31/12');
  }
});

console.log('\nO prazo que manda: ano-calendário × janela do projeto\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
