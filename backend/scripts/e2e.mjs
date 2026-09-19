/**
 * Fluxos de ponta a ponta, num Chromium de verdade.
 *
 * A suíte do backend confere cada rota; o Postgres real confere o banco; o
 * conferidor de páginas confere que cada tela abre. Nenhum dos três confere
 * que as peças ENCAIXAM: que a calculadora leva ao projeto certo, que o
 * formulário de entrar chega ao painel, que o gestor vê a fila e o
 * destinador não. Foi esse tipo de defeito — a Política mostrando dois
 * controladores, a IncentivaBR "se comprometendo" no site do cliente — que
 * só apareceu renderizando as páginas à mão. Aqui a renderização à mão vira
 * automática, a cada push.
 *
 * Roda contra tests/servidor-memoria.mjs, que finge o site da Casa Azul com
 * dados plausíveis e sem banco de verdade. Os fluxos seguem
 * docs/operacao/fluxo-das-paginas.md: público, destinador, gestor.
 *
 *   node scripts/e2e.mjs                     # sobe o servidor sozinho
 *   BASE=http://127.0.0.1:3100 node scripts/e2e.mjs
 *
 * Precisa do pacote `playwright` (npm i --no-save playwright && npx playwright
 * install chromium), ou de PW_MODULE apontando para um playwright-core. Com
 * SEM_CDN=1, os CDNs são bloqueados, o Tailwind vira um dublê com as classes
 * de display (ver TAILWIND_DUBLE) e "tailwind is not defined" deixa de
 * contar como erro de página. No CI o Tailwind é o de verdade.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SEM_CDN = process.env.SEM_CDN === '1';
const CDNS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const SENHA = 'senha-bem-comprida';   // a do fixture
// O que o Tailwind de verdade faz e importa aqui: as classes de display têm
// a mesma especificidade de `[hidden]` e vêm depois, logo vencem.
const TAILWIND_DUBLE = `window.tailwind = window.tailwind || {};
(function(){var s=document.createElement('style');s.textContent=
'[hidden]{display:none}.block{display:block}.inline-block{display:inline-block}.flex{display:flex}'+
'.inline-flex{display:inline-flex}.grid{display:grid}.hidden{display:none}';
document.head.appendChild(s);})();`;

const { chromium } = await import(process.env.PW_MODULE || 'playwright');

// ── servidor ────────────────────────────────────────────────────────────────
let servidor = null;
let BASE = process.env.BASE;
if (!BASE) {
  const PORTA = 3302;
  BASE = `http://127.0.0.1:${PORTA}`;
  servidor = spawn(process.execPath, [path.join(AQUI, '../tests/servidor-memoria.mjs'), String(PORTA)],
                   { stdio: 'ignore' });
  let pronto = false;
  for (let i = 0; i < 80 && !pronto; i++) {
    try { if ((await fetch(BASE + '/api/config/brand')).ok) pronto = true; } catch {}
    if (!pronto) await new Promise(r => setTimeout(r, 250));
  }
  if (!pronto) { console.error('o servidor em memória não subiu'); servidor.kill(); process.exit(2); }
}

// ── navegador ───────────────────────────────────────────────────────────────
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  const ctx = await browser.newContext();
  const erros = [];
  const pg = await ctx.newPage();
  pg.on('pageerror', e => erros.push(e.message));
  if (SEM_CDN) {
    for (const cdn of CDNS) await pg.route(`**://${cdn}/**`, r => r.abort());
    // Sem rede, o Tailwind vira um dublê com o que interage com a página: as
    // classes de display. É a regra `.flex{display:flex}` do Tailwind de
    // verdade que vence o atributo `hidden` e mostrou o cartão "Associação /
    // ONG" no site do cliente — só no CI, onde o CDN responde. Sem o dublê o
    // teste passa aqui e falha lá.
    await pg.route('**://cdn.tailwindcss.com/**', r => r.fulfill({ contentType: 'application/javascript', body: TAILWIND_DUBLE }));
  }
  try {
    await fn(pg, ctx);
    const graves = erros.filter(m => !(SEM_CDN && /tailwind is not defined/.test(m)));
    if (graves.length) throw new Error('erro de página: ' + graves.join(' | '));
    // O fixture envenena nome, título, descrição e órgão com "><img
    // data-veneno>. Se o veneno virou elemento, alguma tela pôs dado de fora
    // em innerHTML sem escapar.
    if (await pg.evaluate(() => !!document.querySelector('[data-veneno]'))) {
      throw new Error('dado de fora virou HTML nesta tela (data-veneno)');
    }
    ok.push(nome);
  } catch (e) {
    falhas.push([nome, e.message.split('\n')[0]]);
  } finally {
    await ctx.close();
  }
};

/** Espera até `cond()` ser verdadeiro dentro da página, ou estoura. */
const ate = async (pg, cond, msg, ms = 8000) => {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (await pg.evaluate(cond)) return;
    await pg.waitForTimeout(150);
  }
  throw new Error(msg);
};
const visivel = sel => `!!document.querySelector('${sel}') && document.querySelector('${sel}').getClientRects().length > 0`;
const texto = async (pg, sel) => pg.evaluate(s => document.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim() || '', sel);
/** O veneno do fixture tem de chegar à tela como TEXTO — senão a guarda de [data-veneno] não prova nada. */
const chegouComoTexto = async (pg, sel) => {
  if (await pg.evaluate(() => !!document.querySelector('[data-veneno]'))) throw new Error('dado de fora virou HTML nesta tela (data-veneno)');
  if (!(await texto(pg, sel)).includes('data-veneno')) throw new Error(`o veneno do fixture não apareceu como texto em ${sel}`);
};
const ir = (pg, p) => pg.goto(BASE + '/' + p, { waitUntil: 'networkidle' });

/** Entra pelo formulário, como uma pessoa. */
async function entrar(pg, email) {
  await ir(pg, 'login.html');
  await pg.fill('#loginCpfEmail', email);
  await pg.fill('#loginSenha', SENHA);
  await pg.click('#loginBtn');
  await pg.waitForURL(/dashboard\.html/, { timeout: 10000 });
  await pg.waitForLoadState('networkidle');
}

// ═══ Público — o site do cliente, sem conta ═════════════════════════════════

await teste('início: a página fala do projeto da Casa Azul, não da IncentivaBR', async pg => {
  await ir(pg, 'index.html');
  await ate(pg, () => document.querySelector('[data-projeto="titulo"]')?.textContent.includes('Mostra Casa Azul'),
            'o título do projeto do cliente não apareceu');
  await ate(pg, new Function(`return ${visivel('[data-so-cliente]')}`), 'o bloco do cliente ficou escondido');
  const plataforma = await pg.evaluate(() => [...document.querySelectorAll('[data-so-plataforma]')].some(e => e.getClientRects().length > 0));
  if (plataforma) throw new Error('um bloco só-da-plataforma apareceu no site do cliente');
});

await teste('calculadora: IR devido de R$ 20.000 → limite de R$ 1.200, e o botão leva ao projeto', async pg => {
  await ir(pg, 'calculadora.html');
  if (await pg.evaluate(() => !!document.querySelector('#tabRapida'))) await pg.click('#tabRapida');
  // O campo tem máscara de centavos: cada dígito entra pela direita, como num
  // caixa eletrônico. Digitar "2000000" é o que uma pessoa faz para chegar a
  // R$ 20.000,00 — `fill('20000')` daria R$ 200,00.
  await pg.click('#irDireto');
  await pg.type('#irDireto', '2000000');
  const digitado = await pg.inputValue('#irDireto');
  if (digitado !== '20.000,00') throw new Error('a máscara não formou R$ 20.000,00: ' + digitado);
  await pg.click('#calcRapidoBtn');
  await ate(pg, () => /1\.200/.test(document.querySelector('#limRouanet')?.textContent || ''),
            'o limite de R$ 1.200 não apareceu: ' + await texto(pg, '#limRouanet')
            + ' · toast: ' + await texto(pg, '.toast-container'));
  await ate(pg, () => (document.querySelector('a[data-destinar]')?.getAttribute('href') || '').includes('pronac=2511274'),
            'o botão de destinar não aponta para o projeto do cliente');
});

await teste('página do projeto: título, proponente e descrição vêm do cadastro', async pg => {
  await ir(pg, 'projetos-rouanet.html');
  await ate(pg, () => document.querySelector('[data-projeto="proponente"]')?.textContent.includes('Casa Azul Felipe Augusto'),
            'proponente não apareceu');
  const desc = await texto(pg, '[data-projeto="descricao"]');
  if (!desc.includes('teatro inclusivo')) throw new Error('descrição: ' + desc);
  const pronac = await texto(pg, '[data-projeto="pronac"]');
  if (pronac !== '2511274') throw new Error('pronac: ' + pronac);
  await chegouComoTexto(pg, '#projectsContainer');
});

await teste('política de privacidade: a Casa Azul é a controladora, a IncentivaBR a operadora', async pg => {
  await ir(pg, 'politica-privacidade.html');
  await ate(pg, () => [...document.querySelectorAll('[data-so-cliente]')].some(e => e.getClientRects().length > 0),
            'o lado do cliente não apareceu');
  const corpo = await pg.evaluate(() => document.body.innerText);
  if (!/Casa Azul Felipe Augusto é o controlador/.test(corpo)) throw new Error('não nomeia o cliente como controlador');
  if (/O IncentivaBR é o controlador/.test(corpo)) throw new Error('ainda diz que a IncentivaBR é a controladora');
  if (!/Encarregado: Casa Azul/.test(corpo)) throw new Error('o Encarregado não é o do cliente');
});

await teste('a carta de vendas do white-label não abre no site do cliente', async pg => {
  await ir(pg, 'para-associacoes.html');
  if (!/index\.html/.test(pg.url())) throw new Error('não redirecionou: ' + pg.url());
});

// ═══ Destinador — entra e vê o que é dele ═══════════════════════════════════

await teste('senha errada não entra, e a tela diz isso', async pg => {
  await ir(pg, 'login.html');
  await pg.fill('#loginCpfEmail', 'maria@exemplo.gov.br');
  await pg.fill('#loginSenha', 'errada-de-proposito');
  await pg.click('#loginBtn');
  // O erro chega por toast (js/toast.js), não por um bloco fixo na página.
  await ate(pg, () => {
    const t = document.querySelector('.toast-container');
    return !!t && t.getClientRects().length > 0 && /erro|credenciais|inválid/i.test(t.textContent);
  }, 'nenhum aviso de erro apareceu no toast', 6000);
  await pg.waitForTimeout(1200);
  if (/dashboard/.test(pg.url())) throw new Error('entrou com senha errada');
});

await teste('destinadora entra pelo formulário e vê as três destinações dela', async pg => {
  await entrar(pg, 'maria@exemplo.gov.br');
  await ate(pg, () => (document.querySelector('#donationsList')?.textContent.match(/Mostra Casa Azul/g) || []).length >= 3,
            'as três destinações não apareceram no painel');
  await chegouComoTexto(pg, '#donationsList');
  await pg.waitForTimeout(800);   // os atalhos de operação acendem depois da resposta da API
  const veConferencia = await pg.evaluate(() => getComputedStyle(document.querySelector('#linkConferencia')).display !== 'none');
  if (veConferencia) throw new Error('destinadora comum vê o atalho da conferência');
});

await teste('assistente de destinação: o projeto do cliente já vem preenchido', async pg => {
  await entrar(pg, 'maria@exemplo.gov.br');
  await ir(pg, 'destinar-rouanet.html');
  await ate(pg, () => document.querySelector('#s0Title')?.textContent.includes('Mostra Casa Azul'), 'título não apareceu');
  const desc = await texto(pg, '#s0Desc');
  if (!desc.includes('teatro inclusivo')) throw new Error('a descrição não veio do cadastro: ' + desc);
});

// ═══ Gestor — os atalhos acendem pela rota, e as telas de operação abrem ════

await teste('gestora entra e o painel acende Conferência (3) e Interessados', async pg => {
  await entrar(pg, 'gestor@casazul.org.br');
  await ate(pg, () => /Conferência \(3\)/.test(document.querySelector('#qtdConferencia')?.textContent || ''),
            'o atalho da conferência não acendeu com a contagem: ' + await texto(pg, '#qtdConferencia'));
  await ate(pg, () => getComputedStyle(document.querySelector('#linkInteressados')).display !== 'none',
            'o atalho de interessados não acendeu');
});

await teste('conferência: as três destinações aguardam, com comprovante', async pg => {
  await entrar(pg, 'gestor@casazul.org.br');
  await ir(pg, 'conferencia.html');
  await ate(pg, () => /3 aguardando/.test(document.querySelector('#contagem')?.textContent || ''),
            'contagem: ' + await texto(pg, '#contagem'));
  const botoes = await pg.evaluate(() => document.querySelectorAll('.btn-conf').length);
  if (botoes !== 3) throw new Error('botões de confirmar: ' + botoes);
  await chegouComoTexto(pg, '#lista');
});

await teste('interessados: a lista da organização, com a situação de cada pessoa', async pg => {
  await entrar(pg, 'gestor@casazul.org.br');
  await ir(pg, 'interessados.html');
  await ate(pg, () => document.querySelector('#nAtivos')?.textContent === '1', 'resumo: ' + await texto(pg, '#resumo'));
  const linha = await texto(pg, 'tbody tr');
  if (!/joao@exemplo\.gov\.br/.test(linha) || !/ativo/.test(linha)) throw new Error('linha: ' + linha);
  await chegouComoTexto(pg, 'tbody tr');
});

await teste('a tela de clientes recusa quem não é da plataforma', async pg => {
  await entrar(pg, 'gestor@casazul.org.br');
  await ir(pg, 'admin-clientes.html');
  await pg.waitForTimeout(800);
  const conteudo = await pg.evaluate(() => { const c = document.querySelector('#conteudo'); return !!c && !c.hidden; });
  if (conteudo) throw new Error('gestora de cliente abriu a tela de clientes da plataforma');
});

// ── encerramento ────────────────────────────────────────────────────────────
await browser.close();
if (servidor) servidor.kill();

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} fluxos passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
