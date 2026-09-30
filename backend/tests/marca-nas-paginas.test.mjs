// O nome da plataforma no corpo da página do cliente.
//
// O PROBLEMA, COMO APARECEU
//
// Rolando a página inicial de um cliente white-label, o visitante dele passava
// a ler "A IncentivaBR não recebe nem retém", "O IncentivaBR guia cada etapa",
// e chegava a um bloco que recruta contadores para um programa da IncentivaBR
// com o e-mail dela no botão. Na aba do navegador, "Casa Azul | IncentivaBR".
//
// Nada disso é ilegal nem falso. É a plataforma aparecendo na página de quem a
// contratou, para o público de quem a contratou. O cliente pagou para ter um
// site dele.
//
// POR QUE "A PLATAFORMA", E NÃO `.brand-name`
//
// A tentação é trocar o nome pelo do cliente, que é o que `.brand-name` faz. É
// a saída errada, e perigosa: "A Casa Azul não recebe nem retém o valor" é
// FALSO — a Casa Azul é a proponente, e o dinheiro entra na conta de captação
// dela. As frases sobre o que a plataforma faz e não faz têm de dizer "a
// plataforma", que é verdade nos dois sites e não pode virar mentira quando o
// nome trocado é o de quem recebe o dinheiro.
//
// O QUE FICA, DE PROPÓSITO
//
//   - o rodapé legal depois de <!-- incentivabr-legal -->, e qualquer bloco
//     marcado `data-aviso-legal`: registro no INPI e autoria do programa. É
//     fato sobre o software, e vale em qualquer site que o rode — como o aviso
//     de copyright num aparelho de outra marca. O marcador é explícito de
//     propósito: a isenção fica escrita no HTML, e não numa exceção no teste;
//   - `<head>`: o título vem de `tenant.js`, que troca o nome no site do
//     cliente (o `<title>` do arquivo é a reserva para quem abre sem script);
//   - comentários e `<script>`: não chegam ao leitor;
//   - o conteúdo de `.brand-name` e dos ganchos que `tenant.js` preenche
//     (`data-privacidade`, `data-tenant`, `data-termo`, `data-fiscal`,
//     `data-mecanismo`): é texto de reserva, trocado quando a marca chega.
//     "o IncentivaBR" dentro de `data-privacidade="controlador"` está certo —
//     na plataforma ela É a controladora, e no site do cliente a resposta da
//     API troca pelo nome dele;
//   - o que está dentro de `[data-so-plataforma]`: some no site do cliente.
//
// Este teste é estático de propósito: roda em `npm test`, sem navegador, e
// pega a frase no momento em que ela é escrita.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
const FRONTEND = path.join(RAIZ, 'frontend');

const ok = [], falhas = [];
const teste = (nome, fn) => {
  try { fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

/**
 * As páginas que o público do cliente percorre.
 *
 * Fora da lista, e por quê: `para-associacoes.html` é recusada no servidor no
 * site do cliente (lib/paginasDaPlataforma.js); `termos-uso.html` e
 * `politica-privacidade.html` são documentos jurídicos da própria operadora, e
 * lá o nome dela é o conteúdo; `admin-clientes.html`, `interessados.html` e
 * `conferencia.html` são telas de gestor, não da jornada de quem destina.
 */
const PAGINAS = [
  'index.html',
  'como-funciona.html',
  'faq.html',
  'destinar-rouanet.html',
  'espaco-contador.html',
  'biblioteca-juridica.html',
  'dashboard.html',
  'guia-ir-servidor.html',
  'validador.html',
  'agenda-fiscal.html',
  'calculadora.html',
  'projetos-rouanet.html',
  'passo-a-passo.html',
  'cadastro-avisos.html',
  'login.html',
  'minha-conta.html'
];

/** Tudo a partir do marcador do rodapé legal sai fora. */
const semRodapeLegal = (html) => {
  const i = html.indexOf('<!-- incentivabr-legal -->');
  return i === -1 ? html : html.slice(0, i);
};

/**
 * Remove o elemento inteiro, da tag de abertura ao fechamento que casa.
 *
 * Contando profundidade pelo nome da tag — sem isto, um `</div>` interno
 * encerraria o corte no meio do bloco e a segunda metade continuaria sendo
 * lida. É o mínimo de parser que este teste precisa, e nada além.
 */
function removeElementos(html, achaAbertura) {
  let saida = html;
  for (;;) {
    const m = achaAbertura(saida);
    if (!m) return saida;
    const tag = m.tag;
    const fim = m.index + m.match.length;
    if (/\/>\s*$/.test(m.match)) {                 // <img ... /> não tem corpo
      saida = saida.slice(0, m.index) + saida.slice(fim);
      continue;
    }
    const re = new RegExp(`</?${tag}\\b`, 'gi');
    re.lastIndex = fim;
    let nivel = 1, fecha = -1, t;
    while ((t = re.exec(saida)) !== null) {
      nivel += t[0][1] === '/' ? -1 : 1;
      if (nivel === 0) { fecha = saida.indexOf('>', t.index) + 1; break; }
    }
    if (fecha <= 0) fecha = saida.length;          // HTML truncado: corta o resto
    saida = saida.slice(0, m.index) + saida.slice(fecha);
  }
}

const porAtributo = (attr) => (html) => {
  const re = new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\b${attr}\\b[^>]*>`, 'i');
  const m = re.exec(html);
  return m ? { match: m[0], index: m.index, tag: m[1] } : null;
};

const porClasse = (classe) => (html) => {
  const re = new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*class="[^"]*\\b${classe}\\b[^"]*"[^>]*>`, 'i');
  const m = re.exec(html);
  return m ? { match: m[0], index: m.index, tag: m[1] } : null;
};

/** Atributos cujo conteúdo é reserva: `tenant.js` troca quando a marca chega. */
const GANCHOS_DE_RESERVA = [
  'data-privacidade', 'data-tenant', 'data-termo', 'data-fiscal', 'data-mecanismo'
];

/** O que sobra é o que o visitante do site do cliente de fato lê. */
function textoVisivelNoCliente(html) {
  let t = semRodapeLegal(html);
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<head[\s\S]*?<\/head>/gi, '');
  t = t.replace(/<script[\s\S]*?<\/script>/gi, '');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, '');
  t = removeElementos(t, porAtributo('data-so-plataforma'));
  t = removeElementos(t, porAtributo('data-aviso-legal'));
  for (const gancho of GANCHOS_DE_RESERVA) t = removeElementos(t, porAtributo(gancho));
  t = removeElementos(t, porClasse('brand-name'));
  return t.replace(/<[^>]*>/g, ' ');
}

// ───────────────────────────────────────────────────────────────────────────
// 1. A guarda
// ───────────────────────────────────────────────────────────────────────────

for (const nome of PAGINAS) {
  teste(`${nome} nao nomeia a plataforma no corpo`, () => {
    const arquivo = path.join(FRONTEND, nome);
    if (!fs.existsSync(arquivo)) throw new Error('pagina nao existe');
    const texto = textoVisivelNoCliente(fs.readFileSync(arquivo, 'utf8'));
    const achados = texto.match(/IncentivaBR/gi);
    if (achados) {
      // Mostra o trecho, senão a falha manda procurar num arquivo de 2 mil linhas.
      const i = texto.search(/IncentivaBR/i);
      const volta = texto.slice(Math.max(0, i - 90), i + 90).replace(/\s+/g, ' ').trim();
      throw new Error(`${achados.length}x, a primeira em: …${volta}…`);
    }
  });
}

// ───────────────────────────────────────────────────────────────────────────
// 2. A prova de que a guarda funciona
// ───────────────────────────────────────────────────────────────────────────

teste('a guarda pega a frase, e nao se engana com o que e legitimo', () => {
  const pega = (html) => /IncentivaBR/i.test(textoVisivelNoCliente(html));

  if (!pega('<body><p>A IncentivaBR confere o limite.</p></body>')) {
    throw new Error('deixou passar a frase no corpo');
  }
  if (pega('<body><!-- a IncentivaBR faz X --></body>')) throw new Error('acusou um comentario');
  if (pega('<head><title>Algo — IncentivaBR</title></head><body><p>ok</p></body>')) {
    throw new Error('acusou o title, que tenant.js troca');
  }
  if (pega('<body><script>const x = "IncentivaBR";</script></body>')) {
    throw new Error('acusou um script');
  }
  if (pega('<body>x<!-- incentivabr-legal --><p>IncentivaBR no INPI</p></body>')) {
    throw new Error('acusou o rodape legal');
  }
  if (pega('<body><span class="brand-name">IncentivaBR</span></body>')) {
    throw new Error('acusou a reserva de .brand-name');
  }
  if (pega('<body><span data-privacidade="controlador">o IncentivaBR</span></body>')) {
    throw new Error('acusou a reserva de um gancho do tenant');
  }
  if (pega('<body><div data-aviso-legal>IncentivaBR, registrado no INPI</div></body>')) {
    throw new Error('acusou um aviso de registro marcado');
  }
  // E o marcador não abre uma porta larga: vale o bloco dele, não o resto.
  if (!pega('<body><div data-aviso-legal>x</div><p>A IncentivaBR guia você.</p></body>')) {
    throw new Error('o marcador de aviso legal isentou a pagina inteira');
  }
  // E o corte de um bloco da plataforma vai até o fechamento que casa: um
  // </div> interno não pode encerrar o corte no meio do bloco.
  if (pega('<body><section data-so-plataforma><div>a</div><p>IncentivaBR</p></section></body>')) {
    throw new Error('o corte parou no </div> de dentro');
  }
  if (!pega('<body><section data-so-plataforma>x</section><p>IncentivaBR</p></body>')) {
    throw new Error('o corte comeu o que vem depois do bloco');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Os mecanismos que substituíram o nome escrito à mão
// ───────────────────────────────────────────────────────────────────────────

const TENANT = fs.readFileSync(path.join(FRONTEND, 'js/tenant.js'), 'utf8');

teste('tenant.js troca a marca no titulo da aba', () => {
  if (!/document\.title\s*=\s*trocaAMarca\(document\.title/.test(TENANT)) {
    throw new Error('o titulo voltou a ser montado a mao');
  }
  // E não voltou a ACRESCENTAR o nome da plataforma, que era o defeito.
  if (/document\.title\s*=\s*`[^`]*IncentivaBR/.test(TENANT)) {
    throw new Error('o titulo escreve a marca da plataforma de novo');
  }
});

teste('tenant.js troca o alt junto com a logo do cliente', () => {
  const trecho = TENANT.slice(TENANT.indexOf('brand-logo'));
  if (!/el\.alt\s*=/.test(trecho.slice(0, 900))) {
    throw new Error('a logo do cliente com alt="IncentivaBR" volta a ser anunciada errado');
  }
});

teste('o recrutamento de contador embaixador e so da plataforma', () => {
  const html = fs.readFileSync(path.join(FRONTEND, 'espaco-contador.html'), 'utf8');
  const m = /<section[^>]*id="selo"[^>]*>/.exec(html);
  if (!m) throw new Error('a secao do selo mudou de forma; confira a guarda');
  if (!/data-so-plataforma/.test(m[0])) throw new Error('o bloco abriria no site do cliente');
});

teste('o endereco da mensagem copiavel e o deste site', () => {
  // Estava "IncentivaBR.com.br" fixo: o contador copiava a mensagem no site do
  // cliente e mandava o cliente dele para a nossa página, onde o projeto do
  // cliente não está.
  const html = fs.readFileSync(path.join(FRONTEND, 'espaco-contador.html'), 'utf8');
  if (!/id="msg-wa-site"/.test(html)) throw new Error('o gancho do endereco saiu');
  if (!/msg-wa-site'\)[\s\S]{0,200}location\.host/.test(html)) {
    throw new Error('o endereco nao vem mais de location.host');
  }
});

teste('o nome da lei vem do catalogo, nao escrito a mao', () => {
  // "A IncentivaBR registra destinação apenas pela Lei Rouanet" ficou falso no
  // dia em que passou a haver um mecanismo por cliente (migration 043), e
  // nenhum cadastro corrigia: o nome estava no HTML.
  if (!/\[data-mecanismo\]/.test(TENANT)) throw new Error('tenant.js nao preenche [data-mecanismo]');
  for (const nome of ['espaco-contador.html', 'biblioteca-juridica.html']) {
    const html = fs.readFileSync(path.join(FRONTEND, nome), 'utf8');
    if (!/data-mecanismo="nome"/.test(html)) {
      throw new Error(`${nome} afirma a lei sem consultar o mecanismo do cliente`);
    }
  }
});

console.log('\nA marca da plataforma nas páginas do cliente\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
