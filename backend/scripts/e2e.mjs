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

await teste('a conta está no topo da home, e o valor viaja até o assistente', async pg => {
  // O botão mandava para outra página, e o momento de maior interesse é este.
  // O que se mede: a pessoa digita, vê o número sem sair do lugar, e o valor
  // chega ao assistente junto do projeto — sem redigitar.
  await ir(pg, 'index.html');

  await pg.click('#heroIr');
  await pg.type('#heroIr', '2000000');        // R$ 20.000,00, dígito a dígito

  const digitado = await pg.inputValue('#heroIr');
  if (digitado !== 'R$ 20.000,00') throw new Error('a máscara não formou R$ 20.000,00: ' + digitado);

  await ate(pg, () => {
    const c = document.getElementById('heroResultado');
    return c && !c.hidden && /1\.200/.test(document.getElementById('heroLimite').textContent || '');
  }, 'o limite de R$ 1.200 não apareceu no topo: ' + await texto(pg, '#heroLimite'));

  // O percentual da frase vem do servidor, não da página.
  const frase = await texto(pg, '#heroResultado');
  if (!/6%/.test(frase)) throw new Error('o resultado não diz de onde sai o número: ' + frase);

  // E o link de destinar leva projeto E valor. Sem o valor, a pessoa que
  // acabou de ver "R$ 1.200" digita tudo de novo na etapa seguinte.
  await ate(pg, () => {
    const h = document.querySelector('a[data-destinar]')?.getAttribute('href') || '';
    return h.includes('pronac=2511274') && /valor=1200/.test(h);
  }, 'o link não carrega projeto e valor: ' + await pg.evaluate(
        () => document.querySelector('a[data-destinar]')?.getAttribute('href') || '(sem href)'));
});

await teste('quem digita antes de a marca chegar não fica sem resposta', async pg => {
  // A corrida que o fluxo acima não reproduz: ele espera networkidle, então a
  // marca já chegou quando a digitação começa. Aqui /api/config/brand é
  // atrasada de propósito e a pessoa digita ANTES — que é o caso de quem abre
  // a home numa rede ruim e vai direto ao campo.
  //
  // Sem o aviso `brandCarregada`, o campo fica preenchido e o resultado nunca
  // aparece: a página tem o número e não sabe que já pode contar. A outra
  // saída seria escrever 0.06 na página, que é a cópia do percentual que o
  // projeto inteiro existe para não ter.
  await pg.route('**/api/config/brand*', async rota => {
    await new Promise(r => setTimeout(r, 1500));
    await rota.continue();
  });

  await pg.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await pg.click('#heroIr');
  await pg.type('#heroIr', '2000000');

  // Enquanto o teto não chegou, não há o que mostrar — e está certo assim.
  const cedo = await pg.evaluate(() => document.getElementById('heroResultado')?.hidden);
  if (cedo === false) throw new Error('mostrou um número antes de saber o percentual do servidor');

  await ate(pg, () => {
    const c = document.getElementById('heroResultado');
    return c && !c.hidden && /1\.200/.test(document.getElementById('heroLimite').textContent || '');
  }, 'o resultado nunca apareceu depois de a marca chegar', 12000);
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

// As duas telas do contador têm máscara de moeda no campo de IR. Com o
// formatador único (js/moeda.js) o campo passou a mostrar "R$ ", e o parser
// de uma delas devolvia zero — é isso que estes dois fluxos vigiam.
await teste('espaço do contador: digita o IR e a tabela de limites sai com o teto', async pg => {
  await ir(pg, 'espaco-contador.html');
  await pg.type('#ir-devido', '2000000');
  await ate(pg, () => /R\$ 20\.000,00/.test(document.querySelector('#ir-valor')?.textContent || ''),
            'IR devido não apareceu formatado: ' + await texto(pg, '#ir-valor'));
  const tabela = await texto(pg, '#tabela-limites');
  if (!/R\$ 1\.200,00/.test(tabela)) throw new Error('o teto único não apareceu na tabela: ' + tabela.slice(0, 120));
});

await teste('validador: digita o IR e o limite da Rouanet aparece em reais', async pg => {
  await ir(pg, 'validador.html');
  await pg.type('#ir-devido', '2000000');
  await ate(pg, () => /R\$ 1\.200,00/.test(document.querySelector('#lim-rouanet')?.textContent || ''),
            'limite: ' + await texto(pg, '#lim-rouanet'));
  const campo = await pg.inputValue('#ir-devido');
  if (campo !== 'R$ 20.000,00') throw new Error('máscara do campo: ' + campo);
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

await teste('a captação do projeto aparece na home, com a data do retrato', async pg => {
  // É o bloco que dá urgência ao projeto e que faz o proponente ver a
  // operação dele na tela. O que se mede aqui é o que um teste de unidade não
  // alcança: que o valor, a barra e a DATA do retrato chegam ao DOM.
  await ir(pg, 'index.html');

  await ate(pg, () => {
    const b = document.querySelector('[data-captacao-bloco]');
    return b && !b.hidden;
  }, 'o bloco da captação não apareceu');

  const estado = await pg.evaluate(() => ({
    autorizado: document.querySelector('[data-captacao="autorizado"]')?.textContent || '',
    frase:      document.querySelector('[data-captacao="frase"]')?.textContent || '',
    conferido:  document.querySelector('[data-captacao="conferido_em"]')?.textContent || '',
    dataVisivel: !document.querySelector('[data-captacao-conferido]')?.hidden,
    barraVisivel: !document.querySelector('[data-captacao-barra]')?.hidden
  }));

  if (!/635\.728/.test(estado.autorizado)) {
    throw new Error('o valor autorizado não chegou: ' + estado.autorizado);
  }
  if (!/dias para o fim da janela/.test(estado.frase)) {
    throw new Error('a frase do prazo não chegou: ' + estado.frase);
  }
  if (!estado.barraVisivel) throw new Error('a barra não apareceu com os dois números');

  // A data do retrato é o que separa informar de afirmar: sem ela, um zero de
  // setembro vira notícia em dezembro.
  if (!estado.dataVisivel) throw new Error('o número aparece sem a data em que foi conferido');
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(estado.conferido.trim())) {
    throw new Error('a data do retrato saiu fora do formato: ' + estado.conferido);
  }
});

await teste('o relógio do prazo chega ao topo da home, com a urgência', async pg => {
  // O site explicava o benefício e não dizia quando ele acaba. O que se mede
  // aqui é o que nenhum teste de unidade alcança: que o número de dias, a
  // frase e a CONSEQUÊNCIA chegam ao DOM, e que o nível de urgência vira
  // atributo — é dele que o CSS tira a cor, e um atributo vazio deixaria o
  // bloco cinza no último dia do ano.
  await ir(pg, 'index.html');

  await ate(pg, () => {
    const b = document.querySelector('[data-prazo-bloco]');
    return b && !b.hidden;
  }, 'o relógio do prazo não apareceu');

  const estado = await pg.evaluate(() => {
    const b = document.querySelector('[data-prazo-bloco]');
    return {
      dias:         document.querySelector('[data-prazo="dias"]')?.textContent?.trim() || '',
      frase:        document.querySelector('[data-prazo="frase"]')?.textContent || '',
      consequencia: document.querySelector('[data-prazo="consequencia"]')?.textContent || '',
      urgencia:     b?.dataset.urgencia || '',
      origem:       b?.dataset.origem || '',
      conviteVisivel: !document.querySelector('[data-prazo-convite]')?.hidden,
      fechadoVisivel: !document.querySelector('[data-prazo-fechado]')?.hidden
    };
  });

  if (!/^\d+$/.test(estado.dias)) throw new Error('os dias não chegaram: ' + estado.dias);
  if (!/Falta/.test(estado.frase)) throw new Error('a frase não chegou: ' + estado.frase);

  // A consequência é o que move quem lê: sem ela, o número é só um número.
  if (!/declara em \d{4}/.test(estado.consequencia)) {
    throw new Error('a consequência não nomeia o ano: ' + estado.consequencia);
  }
  if (!['baixo', 'medio', 'alto', 'critico', 'hoje', 'encerrado'].includes(estado.urgencia)) {
    throw new Error('a urgência não virou atributo: ' + JSON.stringify(estado.urgencia));
  }
  if (!estado.origem) throw new Error('a origem do prazo não chegou ao DOM');

  // O fixture tem janela aberta, então o convite fica e o aviso de encerrado
  // não. Se os dois aparecessem juntos, a tela se contradiria.
  if (!estado.conviteVisivel) throw new Error('o convite sumiu com a janela aberta');
  if (estado.fechadoVisivel) throw new Error('o aviso de encerrado apareceu com a janela aberta');
});

await teste('a foto do projeto do cliente chega à tela', async pg => {
  // Nenhum teste de unidade prova isto: eles provam que a rota entrega a
  // imagem e que o JSON a carrega. Que ela CHEGA ao elemento é trabalho de
  // aplicaFoto(), e um erro de digitação ali passaria por toda a suíte — a
  // home ficaria sem imagem só no dia da apresentação.
  await ir(pg, 'projetos-rouanet.html');

  await ate(pg, () => {
    const el = document.querySelector('[data-projeto-foto]');
    return el && /url\(/.test(el.style.backgroundImage || '');
  }, 'a foto não foi aplicada no elemento marcado');

  const estado = await pg.evaluate(() => {
    const foto = document.querySelector('[data-projeto-foto]');
    const cortina = document.querySelector('[data-projeto-foto-cortina]');
    return {
      fundo: foto.style.backgroundImage,
      opacidade: foto.style.opacity,
      cortina: cortina ? getComputedStyle(cortina).display : 'sem cortina'
    };
  });

  if (!estado.fundo.includes('/api/salic/org-project/foto')) {
    throw new Error('a foto não veio da rota do tenant: ' + estado.fundo);
  }
  // O endereço tem de trazer o ?v= do SHA: sem ele, trocar a foto não trocaria
  // o que o navegador já guardou.
  if (!/v=/.test(estado.fundo)) throw new Error('o endereço da foto não muda quando a foto muda');
  if (estado.opacidade !== '1') throw new Error('a foto ficou invisível: opacity ' + estado.opacidade);
  if (estado.cortina === 'none') throw new Error('a cortina não apareceu — o texto branco fica ilegível sobre a foto');

  // E a imagem tem de carregar de verdade, não só estar apontada.
  const resp = await pg.evaluate(async () => {
    const url = document.querySelector('[data-projeto-foto]').style.backgroundImage
      .replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
    const r = await fetch(url);
    return { status: r.status, tipo: r.headers.get('content-type') };
  });
  if (resp.status !== 200) throw new Error('a foto respondeu ' + resp.status);
  if (!/^image\//.test(resp.tipo || '')) throw new Error('a foto não veio como imagem: ' + resp.tipo);
});

await teste('assistente: o vocabulário da tela é o do mecanismo do cliente', async pg => {
  // A Casa Azul é Rouanet: tem registro externo, e o identificador se chama
  // PRONAC. Quem escreve essa palavra na tela é aplicaMecanismo(), a partir de
  // /api/config/brand — a página só guarda o texto de reserva. Se a ponte
  // quebrar, o chip e o aceite continuam parecendo certos AQUI (a reserva é a
  // da Rouanet) e ficam errados no primeiro cliente que não for Rouanet. Por
  // isso o teste confere a ponte, não a palavra: o que a API respondeu tem de
  // ser o que está na tela.
  await entrar(pg, 'maria@exemplo.gov.br');
  await ir(pg, 'destinar-rouanet.html');

  const daApi = await pg.evaluate(async () =>
    (await (await fetch('/api/config/brand')).json()).mecanismo);
  if (!daApi?.vocabulario?.recibo) throw new Error('/api/config/brand não trouxe o vocabulário');

  await ate(pg, () => document.querySelector('#s0Pronac')?.textContent.includes('2511274'),
            'o identificador do projeto não apareceu: ' + await texto(pg, '#s0Pronac'));

  const naTela = await texto(pg, '#s0Pronac');
  if (!naTela.startsWith(daApi.vocabulario.identificador)) {
    throw new Error(`a tela chama o identificador de "${naTela}", a API de "${daApi.vocabulario.identificador}"`);
  }

  // O recibo aparece no aceite, e é a palavra que vai no documento fiscal.
  const recibos = await pg.evaluate(() =>
    [...document.querySelectorAll('[data-termo="recibo"]')].map(e => e.textContent.trim()));
  if (!recibos.length) throw new Error('nenhum [data-termo="recibo"] na página');
  const divergentes = recibos.filter(t => t.toLowerCase() !== daApi.vocabulario.recibo.toLowerCase());
  if (divergentes.length) {
    throw new Error(`a tela diz "${divergentes[0]}" onde a API diz "${daApi.vocabulario.recibo}"`);
  }

  // E o que só existe quando há registro externo continua ligado. (O chip do
  // banner vive numa etapa adiante, então o que se mede é se aplicaMecanismo o
  // desligou — não se ele está na tela agora.)
  const desligados = await pg.evaluate(() => ({
    marcados: [...document.querySelectorAll('[data-so-pronac]')].filter(e => e.hidden).length,
    chip: document.getElementById('pronacChip')?.style.display === 'none'
  }));
  if (desligados.marcados || desligados.chip) {
    throw new Error('a tela desligou o identificador num mecanismo que tem um');
  }
});

await teste('minha conta: a destinadora vê o que existe sobre ela e baixa tudo em JSON', async pg => {
  await entrar(pg, 'maria@exemplo.gov.br');
  await ate(pg, () => getComputedStyle(document.querySelector('#linkMinhaConta')).display !== 'none',
            'o painel não mostra "Minha conta"');
  await ir(pg, 'minha-conta.html');
  await ate(pg, () => /Maria Aparecida/.test(document.querySelector('#dados')?.textContent || ''), 'os dados não apareceram');
  const dados = await texto(pg, '#dados');
  if (!/Destinações registradas\s*3/.test(dados)) throw new Error('destinações: ' + dados);
  // Três destinações com comprovante: a tela tem de avisar que nome e CPF ficam.
  const avisa = await pg.evaluate(() => document.querySelector('#avisoFiscal').getClientRects().length > 0);
  if (!avisa) throw new Error('não avisa da guarda fiscal antes de eliminar');
  await chegouComoTexto(pg, '#dados');
  // A exportação, como o botão faz: com o token da sessão.
  const exportado = await pg.evaluate(async () => {
    const r = await fetch('/api/meus-dados', { headers: { Authorization: 'Bearer ' + localStorage.getItem('incentivabr_token') } });
    return r.json();
  });
  if (exportado.destinacoes?.length !== 3) throw new Error('exportação sem as três destinações');
  if (JSON.stringify(exportado).includes('senha_hash')) throw new Error('a exportação vaza a senha');
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
