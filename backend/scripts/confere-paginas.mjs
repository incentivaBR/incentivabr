/**
 * Abre cada página do frontend num Chromium de verdade, contra um servidor
 * local com a Content-Security-Policy ligada, e falha se:
 *
 *   - alguma página disparar violação de CSP (script, estilo, fonte, imagem
 *     ou conexão que a política não autoriza);
 *   - Tailwind, Font Awesome ou a fonte Montserrat não carregarem numa página
 *     que os usa (CDN fora da política, ou fora do ar);
 *   - alguma requisição da própria página falhar (fora da API, que sem banco
 *     falha de propósito).
 *
 * É o que impede a CSP de quebrar uma tela em produção sem ninguém ver.
 * Roda no CI (job "paginas" de ci.yml) e à mão:
 *
 *   node scripts/confere-paginas.mjs            # sobe o servidor sozinho
 *   BASE=http://127.0.0.1:3300 node scripts/confere-paginas.mjs
 *
 * Precisa do pacote `playwright` (npm i --no-save playwright && npx playwright
 * install chromium), ou de PW_MODULE apontando para um playwright-core.
 *
 * Num ambiente sem saída para os CDNs, defina SEM_CDN=1: as falhas de rede
 * para as origens autorizadas deixam de contar, mas violação de CSP continua
 * contando — o navegador decide bloquear antes de tentar a rede.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.join(AQUI, '../../frontend');
const SEM_CDN = process.env.SEM_CDN === '1';
const CDNS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

const { chromium } = await import(process.env.PW_MODULE || 'playwright');

// ── servidor ────────────────────────────────────────────────────────────────
let servidor = null;
let BASE = process.env.BASE;
if (!BASE) {
  const PORTA = 3301;
  BASE = `http://127.0.0.1:${PORTA}`;
  servidor = spawn(process.execPath, [path.join(AQUI, '../server.js')], {
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(PORTA), JWT_SECRET: 'teste',
      DATABASE_URL: 'postgresql://postgres:senha@banco-que-nao-existe.invalido:5432/railway',
      SIMULATION_MODE: 'true'
    },
    stdio: 'ignore'
  });
  let pronto = false;
  for (let i = 0; i < 80 && !pronto; i++) {
    try { await fetch(BASE + '/health'); pronto = true; } catch { await new Promise(r => setTimeout(r, 250)); }
  }
  if (!pronto) { console.error('o servidor não subiu'); servidor.kill(); process.exit(2); }
}

// ── navegador ───────────────────────────────────────────────────────────────
const paginas = fs.readdirSync(FRONTEND).filter(f => f.endsWith('.html')).sort();
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--no-sandbox']
});
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
await ctx.addInitScript(() => {
  window.__cspv = [];
  document.addEventListener('securitypolicyviolation', e => {
    window.__cspv.push(`${e.violatedDirective} bloqueou ${e.blockedURI || 'inline'} em ${e.sourceFile || e.documentURI}:${e.lineNumber || ''}`);
  });
});

const ehCdn = url => CDNS.some(h => url.includes(`://${h}/`) || url.includes(`://${h}?`) || url.endsWith(`://${h}`));

let comProblema = 0;
for (const p of paginas) {
  const page = await ctx.newPage();
  const falhas = [];
  const cdnForaDoAr = [];
  page.on('requestfailed', r => {
    const u = r.url();
    if (u.startsWith(BASE + '/api')) return;
    if (SEM_CDN && ehCdn(u)) { cdnForaDoAr.push(u.slice(0, 60)); return; }
    falhas.push(`${u.slice(0, 90)} :: ${r.failure()?.errorText}`);
  });
  const consoleCsp = [];
  page.on('console', m => {
    if (/Content Security Policy|Refused to/.test(m.text())) consoleCsp.push(m.text().slice(0, 220));
  });
  try {
    await page.goto(`${BASE}/${p}`, { waitUntil: 'networkidle', timeout: 60000 });
  } catch (e) {
    falhas.push('goto: ' + e.message.split('\n')[0]);
  }
  await page.waitForTimeout(400);

  const info = await page.evaluate(() => ({
    cspv: window.__cspv,
    html: document.documentElement.outerHTML.length,
    usaTailwind: !!document.querySelector('script[src*="cdn.tailwindcss.com"]'),
    tailwindOk: !!window.tailwind,
    usaFA: !!document.querySelector('link[href*="font-awesome"]'),
    faOk: [...document.fonts].some(f => /Font Awesome/i.test(f.family) && f.status === 'loaded'),
    usaMontserrat: !!document.querySelector('link[href*="fonts.googleapis"]'),
    montserratOk: [...document.fonts].some(f => /Montserrat/i.test(f.family) && f.status === 'loaded')
  }));

  const recursos = [];
  if (!SEM_CDN) {
    if (info.usaTailwind && !info.tailwindOk) recursos.push('Tailwind não carregou');
    if (info.usaFA && !info.faOk) recursos.push('Font Awesome não carregou');
    if (info.usaMontserrat && !info.montserratOk) recursos.push('Montserrat não carregou');
  }
  if (info.html < 500) falhas.push(`página vazia (${info.html} bytes)`);

  const ruim = info.cspv.length || consoleCsp.length || falhas.length || recursos.length;
  if (ruim) comProblema++;
  const rotulo = v => (SEM_CDN ? '(sem CDN)' : (v ? 'ok' : 'FALHOU'));
  console.log(`${ruim ? 'PROBLEMA' : 'ok      '} ${p.padEnd(28)}` +
    ` tailwind=${info.usaTailwind ? rotulo(info.tailwindOk) : '-'}` +
    ` fa=${info.usaFA ? rotulo(info.faOk) : '-'}` +
    ` montserrat=${info.usaMontserrat ? rotulo(info.montserratOk) : '-'}` +
    (cdnForaDoAr.length ? ` cdn-inalcançável=${cdnForaDoAr.length}` : ''));
  for (const v of info.cspv) console.log('    CSP: ' + v);
  for (const v of consoleCsp) console.log('    console: ' + v);
  for (const v of recursos) console.log('    recurso: ' + v);
  for (const v of falhas) console.log('    falha: ' + v);
  await page.close();
}

await browser.close();
if (servidor) servidor.kill();
console.log(`\n${paginas.length} páginas, ${comProblema} com problema${SEM_CDN ? ' (CDN não conferido: SEM_CDN=1)' : ''}`);
process.exit(comProblema ? 1 : 0);
