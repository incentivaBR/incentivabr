// O redirecionamento tem de levar o cliente junto.
//
// O PROBLEMA
//
// Nove páginas do site são atalhos: existem para que endereços antigos
// continuem valendo (`calculadora-rapida.html` → `calculadora.html`,
// `projetos.html` → `projetos-rouanet.html`, e assim por diante). Todas
// trocavam de página com `location.replace('destino.html')` — perdendo a
// query.
//
// No site de um cliente alcançado por `?org=`, isso tira o visitante do site
// de quem contratou e o joga na versão da PLATAFORMA da página. O tenant some,
// `/api/salic/org-project` responde 404 (a organização `www` não tem projeto) e
// a tela fica sem projeto nenhum.
//
// O caso pior era o `calculadora-rapida.html`: o **botão principal da home**
// aponta para ele. No site da Casa Azul, "Calcular quanto posso destinar"
// levava a pessoa para a calculadora da IncentivaBR.
//
// POR QUE PASSOU DESPERCEBIDO
//
// Em produção com domínio próprio não acontece: o middleware resolve o tenant
// pelo hostname, então a query não faz falta. Acontece em `?org=` — que é o
// modo da DEMONSTRAÇÃO e o de qualquer cliente antes de apontar o domínio.
// Achado percorrendo as 36 páginas uma a uma como visitante do site do cliente.
//
// A REGRA
//
// Atalho que troca de endereço carrega `location.search`. E o hash junto:
// âncora também é endereço. O `<meta refresh>` fica como reserva para quem está
// sem JavaScript — ele não sabe carregar a query, e perder o tenant é menos
// ruim que não redirecionar.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.join(AQUI, '../../frontend');

const ok = [], falhas = [];
const teste = (nome, fn) => {
  try { fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

/** Páginas-atalho: as que trocam de endereço por JavaScript. */
function atalhos() {
  const achados = [];
  for (const nome of fs.readdirSync(FRONTEND).filter(n => n.endsWith('.html'))) {
    const texto = fs.readFileSync(path.join(FRONTEND, nome), 'utf8');
    const semComentario = texto.replace(/<!--[\s\S]*?-->/g, '');
    if (!/location\.replace\s*\(/.test(semComentario)) continue;
    achados.push({ nome, texto, corpo: semComentario });
  }
  return achados;
}

teste('os atalhos do site continuam existindo', () => {
  // Se um dia não houver nenhum, o resto desta suíte passaria por vacuidade.
  const quantos = atalhos().length;
  if (quantos < 5) throw new Error(`so ${quantos} atalhos encontrados; a varredura mudou de forma?`);
});

teste('todo atalho carrega a organizacao ao trocar de endereco', () => {
  const sem = [];
  for (const { nome, corpo } of atalhos()) {
    // A chamada de troca de endereço tem de ter `location.search` dentro dela.
    const chamadas = corpo.match(/location\.replace\s*\([^)]*\)/g) || [];
    if (!chamadas.length) continue;
    if (!chamadas.some(c => /location\.search/.test(c))) sem.push(nome);
  }
  if (sem.length) {
    throw new Error('atalho que perde o ?org= no caminho: ' + sem.join(', '));
  }
});

teste('o atalho tambem carrega a ancora', () => {
  // Âncora é endereço: `guia-ir-servidor.html#parte1` existe e é usado pelo
  // topo da home.
  const sem = [];
  for (const { nome, corpo } of atalhos()) {
    const chamadas = corpo.match(/location\.replace\s*\([^)]*\)/g) || [];
    if (chamadas.length && !chamadas.some(c => /location\.hash/.test(c))) sem.push(nome);
  }
  if (sem.length) throw new Error('atalho que perde a ancora: ' + sem.join(', '));
});

teste('o <meta refresh> continua la, como reserva sem JavaScript', () => {
  // Ele não sabe carregar a query — mas sem ele, quem está sem JavaScript fica
  // olhando uma página em branco. Perder o tenant é menos ruim que isso.
  const sem = [];
  for (const { nome, texto } of atalhos()) {
    if (!/http-equiv=["']refresh["']/i.test(texto)) sem.push(nome);
  }
  if (sem.length) throw new Error('atalho sem reserva para quem nao tem JavaScript: ' + sem.join(', '));
});

teste('o atalho aponta para pagina que existe', () => {
  const existe = new Set(fs.readdirSync(FRONTEND).filter(n => n.endsWith('.html')));
  const mortos = [];
  for (const { nome, corpo } of atalhos()) {
    for (const m of corpo.matchAll(/location\.replace\s*\(\s*['"]([^'"]+\.html)['"]/g)) {
      if (!existe.has(m[1])) mortos.push(`${nome} -> ${m[1]}`);
    }
  }
  if (mortos.length) throw new Error('atalho para pagina inexistente: ' + mortos.join(', '));
});

teste('o botao principal da home passa por um atalho que leva o tenant', () => {
  // É o caminho que a demonstração percorre: home do cliente → "Calcular
  // quanto posso destinar". Se este atalho perder o `?org=`, a pessoa sai do
  // site de quem contratou no primeiro clique.
  const home = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '');
  const m = /<a\s+href="([^"]+\.html)"\s+class="hero-cta-antes/.exec(home);
  if (!m) throw new Error('o botao principal da home mudou de forma');
  const alvo = path.join(FRONTEND, m[1]);
  if (!fs.existsSync(alvo)) throw new Error('o botao principal aponta para pagina inexistente: ' + m[1]);
  const destino = fs.readFileSync(alvo, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  if (/location\.replace\s*\(/.test(destino) && !/location\.search/.test(destino)) {
    throw new Error(`"${m[1]}" e atalho e perde o ?org=: o botao principal tira a pessoa do site do cliente`);
  }
});

console.log('\nO redirecionamento leva o cliente junto\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
