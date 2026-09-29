// A captação do projeto: o que falta, e quanto tempo falta.
//
// O site mostrava o projeto e não mostrava a única coisa que dá urgência a
// ele: o prazo. Um projeto com R$ 635 mil autorizados e três meses de janela é
// uma situação; o mesmo projeto sem data é um cartaz.
//
// As duas regras que estes testes guardam são sobre honestidade com número de
// dinheiro numa página que pede transferência:
//
//   1. NÃO SABER NÃO É ZERO. `valor_captado` nulo significa "ninguém
//      conferiu". Escrever "R$ 0 captado" nesse caso é afirmar ausência de
//      doador quando houve ausência de consulta — e é o tipo de erro que o
//      proponente percebe no primeiro extrato;
//   2. RETRATO VELHO NÃO É NOTÍCIA. Em simulação a plataforma não consulta o
//      SALIC: os valores são um retrato digitado, com data. Passado o prazo de
//      validade, ele continua aparecendo — marcado, e com a data ao lado.
import { situacaoDaCaptacao, fraseDaCaptacao, validaCaptacao, VALIDADE_DO_RETRATO_DIAS }
  from '../src/lib/captacao.js';
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

const HOJE = new Date('2026-09-29T12:00:00Z');

/** O projeto da Casa Azul, como o SALIC respondeu em setembro de 2026. */
const CASA_AZUL = {
  valor_autorizado: 635728.50,
  valor_captado: 0,
  captacao_inicio: '2026-01-01',
  captacao_fim: '2026-12-31',
  valores_em: '2026-09-29'
};

// ───────────────────────────────────────────────────────────────────────────
// 1. Regra 1 — não saber não é zero
// ───────────────────────────────────────────────────────────────────────────

teste('captado nulo nao vira zero', () => {
  const c = situacaoDaCaptacao({ ...CASA_AZUL, valor_captado: null, valores_em: null }, HOJE);
  igual(c.captado, null, 'captado');
  igual(c.captado_conhecido, false, 'a tela precisa saber que nao sabemos');
  igual(c.falta, null, 'falta');
  igual(c.percentual, null, 'sem os dois numeros, a barra desenharia proporcao inventada');
  // Mas o prazo continua sendo fato, e continua aparecendo.
  igual(c.dias_restantes, 93, 'o prazo nao depende do captado');
});

teste('captado zero conferido E zero, e diz isso', () => {
  const c = situacaoDaCaptacao(CASA_AZUL, HOJE);
  igual(c.captado, 0, 'captado');
  igual(c.captado_conhecido, true, 'este zero foi conferido');
  igual(c.falta, 635728.50, 'falta');
  igual(c.percentual, 0, 'percentual');
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Regra 2 — retrato velho não é notícia
// ───────────────────────────────────────────────────────────────────────────

teste('retrato recente nao e marcado', () => {
  const c = situacaoDaCaptacao(CASA_AZUL, HOJE);
  igual(c.defasado, false, 'conferido hoje');
  igual(c.conferido_em, '2026-09-29', 'a data acompanha o numero');
});

teste('retrato velho continua aparecendo, MARCADO', () => {
  // Calar seria pior: o proponente veria um bloco sem numero e concluiria que
  // o sistema nao sabe. Mostrar sem marcar seria mentir. Mostra-se marcado.
  const velho = new Date('2026-12-15T12:00:00Z');   // 77 dias depois
  const c = situacaoDaCaptacao(CASA_AZUL, velho);
  igual(c.defasado, true, `passou de ${VALIDADE_DO_RETRATO_DIAS} dias`);
  igual(c.captado, 0, 'o numero nao some');
  igual(c.conferido_em, '2026-09-29', 'e a data fica a vista');
});

teste('numero sem data e defasado por definicao', () => {
  const c = situacaoDaCaptacao({ ...CASA_AZUL, valores_em: null }, HOJE);
  igual(c.defasado, true, 'nao da para afirmar que e atual');
});

teste('data vinda do banco como Date sai em AAAA-MM-DD', () => {
  // O driver do Postgres devolve coluna DATE como objeto Date, nao como texto.
  // A primeira versao fazia String(data).slice(0,10) e o JSON da rota saiu com
  // "Tue Sep 29" — as contas de dias certas, e o texto da tela errado. So
  // apareceu rodando a rota de verdade; com string no teste, passava.
  const comDate = situacaoDaCaptacao({
    valor_autorizado: 100, valor_captado: 0,
    captacao_fim: new Date('2026-12-31T00:00:00Z'),
    valores_em:   new Date('2026-09-29T00:00:00Z')
  }, HOJE);
  igual(comDate.fim, '2026-12-31', 'fim');
  igual(comDate.conferido_em, '2026-09-29', 'conferido_em');
  igual(comDate.dias_restantes, 93, 'dias');

  // E o mesmo resultado com texto, que e como o pg-mem devolve.
  const comTexto = situacaoDaCaptacao({
    valor_autorizado: 100, valor_captado: 0,
    captacao_fim: '2026-12-31', valores_em: '2026-09-29'
  }, HOJE);
  igual(comTexto.fim, comDate.fim, 'os dois caminhos tem de dar o mesmo texto');
  igual(comTexto.conferido_em, comDate.conferido_em, 'idem');
});

teste('o prazo nao envelhece como o retrato', () => {
  // Uma data de fim e fato do projeto, nao medicao. Continua verdadeira com um
  // ano — so o captado e que e foto de um instante.
  const c = situacaoDaCaptacao(
    { valor_autorizado: null, valor_captado: null, captacao_fim: '2026-12-31' }, HOJE);
  igual(c.dias_restantes, 93, 'dias');
  igual(c.defasado, false, 'sem numero conferido, nao ha retrato a envelhecer');
});

// ───────────────────────────────────────────────────────────────────────────
// 3. O prazo, que é o que move quem lê
// ───────────────────────────────────────────────────────────────────────────

teste('a janela da Casa Azul termina junto com o ano-calendario', () => {
  const c = situacaoDaCaptacao(CASA_AZUL, HOJE);
  igual(c.dias_restantes, 93, 'dias ate 31/12/2026');
  igual(c.encerrada, false, 'ainda aberta');
  igual(c.apertado, true, 'menos de quatro meses');
  if (!/93 dias/.test(fraseDaCaptacao(c))) throw new Error('frase: ' + fraseDaCaptacao(c));
});

teste('a frase muda no singular, no ultimo dia e depois dele', () => {
  const de = (fim, quando) => fraseDaCaptacao(
    situacaoDaCaptacao({ ...CASA_AZUL, captacao_fim: fim }, new Date(quando)));
  if (!/Falta 1 dia/.test(de('2026-12-31', '2026-12-30T12:00:00Z'))) throw new Error('singular');
  if (!/[Hh]oje é o último dia/.test(de('2026-12-31', '2026-12-31T12:00:00Z'))) throw new Error('ultimo dia');
  if (!/encerrada/.test(de('2026-12-31', '2027-01-02T12:00:00Z'))) throw new Error('encerrada');
});

teste('sem valor e sem prazo, nao ha bloco', () => {
  // Barra vazia numa pagina que pede transferencia e pior do que nada.
  igual(situacaoDaCaptacao({}, HOJE), null, 'projeto sem dados');
  igual(situacaoDaCaptacao(null, HOJE), null, 'sem projeto');
});

teste('a frase fala do PRAZO, nunca do captado', () => {
  // O prazo e fato estavel; o captado e retrato. Uma frase pronta dizendo
  // "ninguem doou ainda" seria a leitura mais fraca do mesmo dado — e
  // envelheceria junto com o numero.
  const c = situacaoDaCaptacao(CASA_AZUL, HOJE);
  const f = fraseDaCaptacao(c);
  if (/captad|doa[dç]|zero|R\$/i.test(f)) throw new Error('a frase fala de dinheiro: ' + f);
});

// ───────────────────────────────────────────────────────────────────────────
// 4. O que entra pelo formulário
// ───────────────────────────────────────────────────────────────────────────

teste('captado sem data de conferencia e RECUSADO', () => {
  // E a porta por onde o retrato velho entraria sem ninguem notar.
  const r = validaCaptacao({ valor_autorizado: '635728.50', valor_captado: '1000' });
  igual(r.ok, false, 'deveria recusar');
  if (!/conferid/i.test(r.erro)) throw new Error('a mensagem nao diz o que falta: ' + r.erro);
});

teste('captado maior que autorizado e recusado', () => {
  const r = validaCaptacao({
    valor_autorizado: '100', valor_captado: '200', valores_em: '2026-09-29' });
  igual(r.ok, false, 'deveria recusar');
});

teste('data fora do formato e recusada', () => {
  igual(validaCaptacao({ captacao_fim: '31/12/2026' }).ok, false, 'dd/mm/aaaa');
  igual(validaCaptacao({ captacao_fim: '2026-12-31' }).ok, true, 'aaaa-mm-dd');
});

teste('valor negativo e recusado, e vazio vira null', () => {
  igual(validaCaptacao({ valor_autorizado: '-5' }).ok, false, 'negativo');
  const r = validaCaptacao({ valor_autorizado: '', captacao_fim: '' });
  igual(r.ok, true, 'vazio e valido');
  igual(r.valores.valor_autorizado, null, 'vazio vira null, nao zero');
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Onde os números moram
// ───────────────────────────────────────────────────────────────────────────

teste('nenhuma pagina escreve o valor do projeto a mao', () => {
  // "R$ 635.728,50" escrito numa pagina seria a copia que nao acompanha o
  // cadastro — e o valor de um cliente aparecendo no site de outro, que e o
  // erro que a foto do piloto ja cometeu em imagem.
  const dir = path.join(RAIZ, 'frontend');
  const culpadas = [];
  for (const nome of fs.readdirSync(dir).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(dir, nome), 'utf8');
    if (/635[.\s]?728/.test(html)) culpadas.push(nome);
  }
  if (culpadas.length) throw new Error('valor do projeto escrito a mao em: ' + culpadas.join(', '));
});

teste('a migration 053 nao reaproveita a coluna do certificado', () => {
  // certificado_valido_ate e do FDCA (RN 125/2026, art. 15). A janela da
  // Rouanet e outra lei, com outro efeito ao vencer. Juntas numa coluna so,
  // as duas regras se misturam no dia em que um cliente tiver as duas.
  const sql = fs.readFileSync(path.join(RAIZ, 'backend/src/migrations/053_captacao_do_projeto.sql'), 'utf8');
  for (const coluna of ['valor_autorizado', 'valor_captado', 'captacao_fim', 'valores_em']) {
    if (!sql.includes(coluna)) throw new Error(`a 053 nao cria ${coluna}`);
  }
  // O proprio arquivo EXPLICA por que nao reusa a coluna do FDCA, e a
  // explicacao cita o nome dela — em comentario e em COMMENT ON. Procurar o
  // nome cru acusaria o texto que existe para impedir o reuso. Sobra o SQL
  // que de fato executa.
  const executavel = sql
    .replace(/^--.*$/gm, '')
    .replace(/COMMENT ON[\s\S]*?;/g, '');
  if (/certificado_valido_ate/.test(executavel)) {
    throw new Error('a 053 mexe na coluna do certificado do FDCA');
  }
});

console.log('\nCaptação do projeto\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
