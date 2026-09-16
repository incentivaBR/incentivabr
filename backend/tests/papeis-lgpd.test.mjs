// Quem responde pelos dados, em cada site.
//
// Um processo serve dois papeis. Na IncentivaBR, ela e a controladora. No site
// de um cliente white-label o controlador e o CLIENTE, e a IncentivaBR e
// operadora — trata por conta e sob instrucao dele.
//
// Isso nao e rotulo: o art. 41 §1º manda divulgar o Encarregado, e o
// Encarregado e o do CONTROLADOR. A Politica servida sob a marca do cliente
// mostrava o Encarregado da IncentivaBR, ou seja, mandava o titular reclamar
// com quem nao responde por ele.
//
// O que estes testes guardam:
//
//   - a plataforma continua sendo controladora dela mesma;
//   - o cliente vira controlador, com o Encarregado dele;
//   - a escada de reserva (encarregado -> contato da org -> IncentivaBR) nunca
//     deixa a pagina sem canal, e `encarregado_completo` denuncia quando ela
//     foi usada, para a tela de clientes cobrar;
//   - as duas paginas legais carregam o tenant.js e marcam os trechos que
//     mudam. Sem o script, a Politica do cliente continuaria dizendo que a
//     controladora e a IncentivaBR;
//   - nenhuma pagina escreve "controlador" a mao;
//   - a versao da Politica no HTML e a mesma de config/lgpd.js. Se divergirem,
//     a prova do consentimento aponta para um documento que nao existe.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { papeisDaPrivacidade } from '../src/lib/papeisLgpd.js';
import { POLITICA_VERSAO, ENCARREGADO } from '../src/config/lgpd.js';
import { todasDentroDe } from './apoio/dentroDe.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
const FRONTEND = path.join(RAIZ, 'frontend');
const leia = nome => fs.readFileSync(path.join(FRONTEND, nome), 'utf8');

const ok = [], falhas = [];
const teste = (nome, fn) => {
  try { fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

// ── os papeis ───────────────────────────────────────────────────────────────

teste('na IncentivaBR, ela e a controladora e nao ha operador', () => {
  for (const org of [null, { slug: 'www', name: 'IncentivaBR' }]) {
    const p = papeisDaPrivacidade(org);
    if (p.eh_plataforma !== true) throw new Error('nao reconheceu a plataforma');
    if (p.controlador !== 'IncentivaBR') throw new Error('controlador: ' + p.controlador);
    if (p.operador !== null) throw new Error('inventou operador: ' + p.operador);
    if (p.encarregado_email !== ENCARREGADO.email) throw new Error('encarregado: ' + p.encarregado_email);
  }
});

teste('no cliente, o controlador e o cliente e a IncentivaBR e operadora', () => {
  const p = papeisDaPrivacidade({
    slug: 'casa-azul', name: 'Casa Azul',
    encarregado_nome: 'Maria de Souza', encarregado_email: 'privacidade@casazul.org.br'
  });
  if (p.eh_plataforma !== false) throw new Error('tratou o cliente como plataforma');
  if (p.controlador !== 'Casa Azul') throw new Error('controlador: ' + p.controlador);
  if (p.operador !== 'IncentivaBR') throw new Error('operador: ' + p.operador);
  if (p.encarregado_nome !== 'Maria de Souza') throw new Error('nome: ' + p.encarregado_nome);
  if (p.encarregado_email !== 'privacidade@casazul.org.br') throw new Error('email: ' + p.encarregado_email);
  if (p.encarregado_completo !== true) throw new Error('deveria estar completo');
});

teste('sem Encarregado, cai no contato da organizacao e avisa que esta incompleto', () => {
  const p = papeisDaPrivacidade({ slug: 'casa-azul', name: 'Casa Azul', contact_email: 'contato@casazul.org.br' });
  if (p.encarregado_email !== 'contato@casazul.org.br') throw new Error('email: ' + p.encarregado_email);
  if (p.encarregado_nome !== 'Casa Azul') throw new Error('nome: ' + p.encarregado_nome);
  if (p.encarregado_completo !== false) throw new Error('deu por completo o que esta vazio');
});

teste('sem nada, cai no Encarregado da IncentivaBR — nunca sem canal', () => {
  const p = papeisDaPrivacidade({ slug: 'casa-azul', name: 'Casa Azul' });
  if (!p.encarregado_email) throw new Error('pagina ficaria sem canal de exercicio de direitos');
  if (p.encarregado_email !== ENCARREGADO.email) throw new Error('email: ' + p.encarregado_email);
  if (p.encarregado_completo !== false) throw new Error('deveria acusar incompleto');
});

teste('so espaco no campo conta como vazio', () => {
  const p = papeisDaPrivacidade({
    slug: 'casa-azul', name: 'Casa Azul',
    encarregado_nome: '   ', encarregado_email: '  ', contact_email: 'contato@casazul.org.br'
  });
  if (p.encarregado_completo !== false) throw new Error('espaco passou por preenchido');
  if (p.encarregado_email !== 'contato@casazul.org.br') throw new Error('email: ' + p.encarregado_email);
});

// ── as paginas ──────────────────────────────────────────────────────────────

const politica = leia('politica-privacidade.html');
const termos   = leia('termos-uso.html');

teste('as duas paginas legais carregam o tenant.js', () => {
  // A Politica nao carregava. Sob a marca de um cliente, ela continuava
  // dizendo que a controladora e a IncentivaBR — justamente o documento em
  // que isso nao pode estar errado.
  for (const [nome, html] of [['politica-privacidade', politica], ['termos-uso', termos]]) {
    if (!/<script[^>]+src="js\/tenant\.js"/.test(html)) {
      throw new Error(nome + ' nao carrega o tenant.js');
    }
  }
});

teste('a Politica marca controlador, operador e Encarregado', () => {
  for (const chave of ['controlador', 'operador', 'encarregado_nome', 'encarregado_email']) {
    if (!politica.includes(`data-privacidade="${chave}"`)) {
      throw new Error('a Politica nao marca ' + chave);
    }
  }
});

teste('a Politica tem os dois lados: o da plataforma e o do cliente', () => {
  if (!/data-so-plataforma/.test(politica)) throw new Error('sem o bloco da plataforma');
  if (!/data-so-cliente/.test(politica)) throw new Error('sem o bloco do cliente');
  // Todo bloco de cliente nasce escondido: a pagina e servida antes de o
  // tenant.js responder, e por um instante os dois apareceriam juntos.
  const abertos = politica.match(/data-so-cliente(?![^>]*\bhidden\b)[^>]*>/g) || [];
  if (abertos.length) throw new Error('bloco de cliente sem hidden: ' + abertos[0]);
});

teste('os Termos nao dizem que a marca do cliente e da plataforma', () => {
  // O texto unico dizia "Esta plataforma, incluindo sua marca... sao
  // protegidos": sob a marca do cliente, dizia que a marca dele e da
  // IncentivaBR.
  const trecho = termos.slice(termos.indexOf('7. Propriedade Intelectual'),
                             termos.indexOf('8. Suspensão'));
  if (!/data-so-cliente/.test(trecho)) throw new Error('a clausula de PI nao tem versao para o cliente');
  if (!/data-privacidade="fornecedor"/.test(trecho)) throw new Error('a versao do cliente nao nomeia o dono do codigo');
  if (!/data-privacidade="prestador"/.test(trecho)) throw new Error('a versao do cliente nao nomeia o dono da marca');
});

teste('nos Termos, "IncentivaBR" nunca aparece solto no corpo do documento', () => {
  // Esta e a guarda que o navegador entregou e nenhum teste de marcacao
  // pegaria: as secoes 5 e 6 diziam "O IncentivaBR se compromete" e "O
  // IncentivaBR nao se responsabiliza" na pagina do cliente. Clausula que
  // limita responsabilidade nomeando quem nao presta o servico nao protege
  // ninguem.
  //
  // O corpo vai ate os scripts: o rodape legal vem depois e nomeia a
  // IncentivaBR de proposito, como fornecedora do programa registrado.
  const inicio = termos.indexOf('class="legal-content"');
  const fim = termos.indexOf('<script src="js/auth.js"');
  const corpo = termos.slice(inicio, fim);
  const { total, fora, exemplo } = todasDentroDe(
    corpo, ['data-privacidade', 'data-so-plataforma'], 'IncentivaBR');
  if (total === 0) throw new Error('nenhuma mencao: o texto de reserva sumiu');
  if (fora > 0) throw new Error(`${fora} de ${total} fora de marca — ex.: ${exemplo}`);
});

teste('os papeis dos Termos existem dos dois lados', () => {
  // Os Termos falam de quem presta o servico e de quem e a tecnologia, nao de
  // dados. Chamar a associacao de "controlador" numa clausula de
  // responsabilidade seria a palavra errada no documento errado.
  for (const org of [null, { slug: 'casa-azul', name: 'Casa Azul' }]) {
    const p = papeisDaPrivacidade(org);
    if (!p.prestador) throw new Error('sem prestador: ' + JSON.stringify(p));
    if (p.fornecedor !== 'IncentivaBR') throw new Error('fornecedor: ' + p.fornecedor);
  }
  if (papeisDaPrivacidade({ slug: 'casa-azul', name: 'Casa Azul' }).prestador !== 'Casa Azul') {
    throw new Error('no cliente, quem presta o servico e o cliente');
  }
});

teste('o foro de Brasilia so vale no site da IncentivaBR', () => {
  // Eleger Brasilia/DF na pagina de um cliente mandaria o usuario DELE
  // litigar na comarca de um terceiro.
  const linha = termos.split('\n').find(l => /foro da comarca/.test(l));
  if (!linha) throw new Error('sumiu a clausula de foro');
  const antes = termos.slice(Math.max(0, termos.indexOf(linha) - 400), termos.indexOf(linha));
  if (!/data-so-plataforma/.test(antes)) throw new Error('o foro nao esta marcado como so da plataforma');
});

teste('a Politica nao escreve o Encarregado da IncentivaBR fora de marca', () => {
  // O e-mail pode aparecer como texto de reserva DENTRO do elemento marcado —
  // e o que sustenta a pagina sem JavaScript. Fora dele, e texto fixo, e no
  // site do cliente apontaria para quem nao responde por ele.
  const { total, fora } = todasDentroDe(politica, 'data-privacidade', ENCARREGADO.email);
  if (total === 0) throw new Error('sumiu o texto de reserva do Encarregado');
  if (fora > 0) throw new Error(`${fora} de ${total} ocorrencias fora de [data-privacidade]`);
});

teste('a versao da Politica no HTML e a mesma de config/lgpd.js', () => {
  // Se divergirem, a prova do consentimento (art. 8º §2º) aponta para um
  // documento que nao existe.
  if (!politica.includes(POLITICA_VERSAO)) {
    throw new Error(`a pagina nao mostra a versao ${POLITICA_VERSAO}`);
  }
});

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
