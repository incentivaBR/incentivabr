// O projeto que as paginas publicas mostram e o do TENANT, nunca o do piloto.
//
// "Orquestra das Periferias do DF" — o projeto ficticio do piloto de maio de
// 2026 — ficou escrito a mao em cinco paginas publicas. O PRONAC ja vinha do
// cadastro (data-projeto), mas a narrativa nao: no site da Casa Azul,
// como-funciona.html pedia apoio a um projeto que nao era dela. Raio-X, risco
// 11 e item da Onda 2 ("textos fixos da Orquestra substituidos por dados do
// tenant").
//
// O que estes testes guardam:
//   - nenhuma pagina servida nomeia o projeto do piloto fora de comentario;
//   - onde o nome de um projeto aparece, ele vem de [data-projeto="titulo"],
//     com texto de reserva NEUTRO — reserva com nome de projeto e o mesmo
//     defeito com outra roupa;
//   - a pagina de projeto le descricao e proponente do cadastro;
//   - tenant.js aceita descricao com o resumo do SALIC como reserva, senao
//     fora da simulacao a pagina fica com o texto neutro para sempre;
//   - a tela de clientes envia a descricao;
//   - as fotos do projeto do piloto sairam: nao ha campo de imagem no cadastro,
//     e a foto de um projeto no site de outro e o mesmo erro em imagem.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
const FRONTEND = path.join(RAIZ, 'frontend');
const leia = nome => fs.readFileSync(path.join(FRONTEND, nome), 'utf8');
const semComentarios = html => html.replace(/<!--[\s\S]*?-->/g, '');

const ok = [], falhas = [];
const teste = (nome, fn) => {
  try { fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

const PAGINAS = fs.readdirSync(FRONTEND).filter(f => f.endsWith('.html'));

teste('nenhuma pagina servida nomeia o projeto do piloto', () => {
  const culpadas = PAGINAS.filter(p => /Orquestra das Periferias|Ceilândia|Samambaia/.test(semComentarios(leia(p))));
  if (culpadas.length) throw new Error('ainda nomeiam o projeto do piloto: ' + culpadas.join(', '));
  const js = fs.readdirSync(path.join(FRONTEND, 'js')).filter(f => f.endsWith('.js'));
  const emJs = js.filter(f => /Orquestra das Periferias/.test(
    fs.readFileSync(path.join(FRONTEND, 'js', f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
  if (emJs.length) throw new Error('em js: ' + emJs.join(', '));
});

teste('onde ha nome de projeto, ele vem de data-projeto="titulo"', () => {
  for (const p of ['calculadora.html', 'como-funciona.html', 'passo-a-passo.html', 'projetos-rouanet.html']) {
    if (!leia(p).includes('data-projeto="titulo"')) throw new Error(p + ' nao marca o titulo do projeto');
  }
});

teste('a reserva das marcacoes e neutra — nao e nome de projeto', () => {
  // Reserva com nome de projeto e o defeito original com outra roupa.
  for (const p of PAGINAS) {
    const html = semComentarios(leia(p));
    for (const m of html.matchAll(/data-projeto="(titulo|descricao|proponente)"[^>]*>([^<]{0,200})</g)) {
      const reserva = m[2].trim();
      if (/Orquestra|Casa Azul|Circuito|Forró/i.test(reserva)) {
        throw new Error(`${p}: reserva com nome de projeto: "${reserva}"`);
      }
    }
  }
});

teste('a pagina de projeto le descricao e proponente do cadastro', () => {
  const html = leia('projetos-rouanet.html');
  for (const campo of ['descricao', 'proponente', 'area', 'uf']) {
    if (!html.includes(`data-projeto="${campo}"`)) throw new Error('nao marca ' + campo);
  }
});

teste('tenant.js aceita descricao com resumo e objetivos do SALIC como reserva', () => {
  // Em simulacao o projeto vem do cadastro (descricao); com o SALIC, do
  // Ministerio (resumo, objetivos). Sem a reserva, fora da simulacao a pagina
  // fica com o texto neutro para sempre.
  const js = fs.readFileSync(path.join(FRONTEND, 'js/tenant.js'), 'utf8');
  if (!/projeto\.descricao\s*\|\|\s*projeto\.resumo\s*\|\|\s*projeto\.objetivos/.test(js)) {
    throw new Error('a descricao nao cai no resumo/objetivos do SALIC');
  }
  if (!/proponente\?\.nome/.test(js)) throw new Error('nao le o proponente');
});

teste('a tela de clientes pede e envia a descricao do projeto', () => {
  const html = leia('admin-clientes.html');
  if (!/id="pDescricao"/.test(html)) throw new Error('sem campo de descricao');
  if (!/descricao:\s*el\('pDescricao'\)/.test(html)) throw new Error('o formulario nao envia a descricao');
});

teste('as fotos do projeto do piloto sairam', () => {
  const sobras = fs.readdirSync(path.join(FRONTEND, 'assets')).filter(f => /orquestra/i.test(f));
  if (sobras.length) throw new Error('assets sobrando: ' + sobras.join(', '));
  const refs = PAGINAS.filter(p => /orquestra-(hero|card)/.test(leia(p)));
  if (refs.length) throw new Error('paginas referenciam a foto: ' + refs.join(', '));
});

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
