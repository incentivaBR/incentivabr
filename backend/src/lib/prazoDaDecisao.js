/**
 * Quanto tempo a pessoa tem — e qual dos dois prazos manda.
 *
 * POR QUE ISTO EXISTE
 *
 * O site explicava o benefício e não dizia quando ele acaba. Quem entende e
 * concorda sai da página para decidir depois, e "depois" é onde a destinação
 * morre: não há nada que marque a hora em que a oportunidade deixa de existir.
 *
 * SÃO DOIS PRAZOS, E O QUE VENCE PRIMEIRO MANDA
 *
 * 1. O ANO-CALENDÁRIO. A dedução é do valor efetivamente pago dentro do
 *    ano-calendário. Transferência feita em 2 de janeiro não entra na
 *    declaração do ano seguinte — entra na de dois anos depois. Este prazo
 *    existe para TODO visitante, tenha ou não projeto cadastrado, e é o mais
 *    forte dos dois justamente por isso: não depende de nada que o cliente
 *    tenha preenchido.
 *
 * 2. A JANELA DE CAPTAÇÃO DO PROJETO (`org_projects.captacao_fim`, migration
 *    053). Depois dela o projeto não capta — e a plataforma estaria pedindo
 *    transferência para uma conta que não pode mais recebê-la.
 *
 * A regra de "o menor manda" é a mesma de `lib/tetos.js` com o sublimite e a
 * de `lib/certificado.js` com as duas validades. Aqui ela importa porque os
 * dois prazos correm em velocidades diferentes: o do ano é previsível, o do
 * projeto pode acabar em março.
 *
 * O QUE ESTE MÓDULO NÃO FAZ
 *
 * Não inventa prazo. Sem `captacao_fim` só o ano-calendário conta, e a tela
 * não ganha um aviso sobre janela que não existe — pela mesma razão escrita em
 * `lib/prazos.js`: aviso inventado onde não há prazo treina a pessoa a ignorar
 * o aviso onde há.
 *
 * E não decide a tipografia. Este módulo diz quantos dias faltam, qual prazo
 * manda e o que se perde; se isso vira um número grande no topo ou uma linha
 * no rodapé é escolha da página.
 */

import { PRAZO_APERTADO_DIAS } from './captacao.js';

/** Daqui para baixo o prazo é a notícia, não um detalhe. */
export const DIAS_CRITICO = 7;
export const DIAS_ALTO    = 30;

/** Acima disto o prazo é informação, não pressão. Mesma régua da captação. */
export const DIAS_MEDIO = PRAZO_APERTADO_DIAS;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Meia-noite UTC do dia, para contar dias sem depender de fuso. */
const dia = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).slice(0, 10) + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? null : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const iso = (t) => (t == null ? null : new Date(t).toISOString().slice(0, 10));

/** 31 de dezembro do ano-calendário corrente. */
export function fimDoAnoCalendario(agora = new Date()) {
  return Date.UTC(agora.getUTCFullYear(), 11, 31);
}

const urgenciaDe = (dias) => {
  if (dias == null) return 'baixo';
  if (dias < 0) return 'encerrado';
  if (dias === 0) return 'hoje';
  if (dias <= DIAS_CRITICO) return 'critico';
  if (dias <= DIAS_ALTO) return 'alto';
  if (dias <= DIAS_MEDIO) return 'medio';
  return 'baixo';
};

const plural = (n) => (n === 1 ? 'Falta 1 dia' : `Faltam ${n} dias`);
const diaMes = (t) => {
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};

/**
 * @param {object|null} captacao - o que `situacaoDaCaptacao()` devolveu
 * @param {Date} [agora]
 * @returns {object} sempre um objeto: o prazo do ano-calendário nunca falta
 */
export function prazoQueManda(captacao, agora = new Date()) {
  const hoje = dia(agora);

  const fimAno = fimDoAnoCalendario(agora);
  const diasAno = Math.round((fimAno - hoje) / DIA_MS);

  const fimProjeto = dia(captacao?.fim);
  const diasProjeto = fimProjeto == null ? null : Math.round((fimProjeto - hoje) / DIA_MS);

  // O que vence primeiro manda. Empate vai para o ano-calendário: é o prazo
  // que vale para qualquer pessoa, e a frase dele não depende de cadastro.
  const projetoManda = diasProjeto != null && diasProjeto < diasAno;
  const dias   = projetoManda ? diasProjeto : diasAno;
  const fim    = projetoManda ? fimProjeto : fimAno;
  const origem = projetoManda ? 'captacao_do_projeto' : 'ano_calendario';

  const anoDestinacao = agora.getUTCFullYear();

  let frase, consequencia;
  if (origem === 'captacao_do_projeto') {
    if (dias < 0) {
      frase = 'A janela de captação deste projeto está encerrada.';
      consequencia = 'Enquanto o prazo não for prorrogado, este projeto não pode receber destinação.';
    } else if (dias === 0) {
      frase = 'Hoje é o último dia de captação deste projeto.';
      consequencia = `Depois de hoje, ele não capta mais.`;
    } else {
      frase = `${plural(dias)} de captação deste projeto.`;
      consequencia = `Depois de ${diaMes(fim)}, ele não capta mais.`;
    }
  } else {
    if (dias === 0) {
      frase = 'Hoje é o último dia do ano-calendário.';
      consequencia = `Amanhã a destinação já conta para o imposto que você declara em ${anoDestinacao + 2}.`;
    } else {
      frase = `${plural(dias)} para o fim do ano-calendário.`;
      consequencia = `Destinação feita depois de ${diaMes(fimAno)} abate no imposto que você declara em `
                   + `${anoDestinacao + 2}, não em ${anoDestinacao + 1}.`;
    }
  }

  return {
    dias,
    fim: iso(fim),
    origem,
    urgencia: urgenciaDe(dias),
    frase,
    consequencia,
    ano_calendario:    { fim: iso(fimAno), dias: diasAno, ano: anoDestinacao },
    projeto: fimProjeto == null ? null : { fim: iso(fimProjeto), dias: diasProjeto },
    // A tela precisa saber que o projeto fechou ANTES do ano: nesse caso não
    // há o que pedir, e o botão de destinar não pode continuar convidando.
    projeto_encerrado: diasProjeto != null && diasProjeto < 0
  };
}

export default { prazoQueManda, fimDoAnoCalendario, DIAS_CRITICO, DIAS_ALTO, DIAS_MEDIO };
