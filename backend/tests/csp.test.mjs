// A Content-Security-Policy e o que impede um script de outro dominio de
// rodar na pagina, um iframe de terceiro de embutir o site e um <base>
// trocado de redirecionar tudo (Raio-X, risco 05). Este teste garante que o
// cabecalho sai, com as origens certas e sem as brechas que anulariam a
// politica. A conferencia visual (nenhuma pagina quebrada pela CSP) foi feita
// no Chromium antes de a politica entrar; ver o PR da Onda 2.
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PORTA = 3198;

const servidor = spawn(process.execPath, [path.join(AQUI, '../server.js')], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORTA),
    DATABASE_URL: 'postgresql://postgres:senha@banco-que-nao-existe.invalido:5432/railway',
    SIMULATION_MODE: 'true'
  },
  stdio: 'ignore'
});

const base = `http://127.0.0.1:${PORTA}`;
let pronto = false;
for (let i = 0; i < 60 && !pronto; i++) {
  try { await fetch(base + '/health'); pronto = true; } catch { await new Promise(r => setTimeout(r, 250)); }
}

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

const diretivas = (csp) => Object.fromEntries(
  csp.split(';').map(s => s.trim()).filter(Boolean).map(s => {
    const [nome, ...valores] = s.split(/\s+/);
    return [nome, valores];
  }));

await teste('o servidor subiu', () => { if (!pronto) throw new Error('nao subiu em 15s'); });

let csp = null;
await teste('toda pagina sai com Content-Security-Policy', async () => {
  for (const caminho of ['/', '/index.html', '/login.html', '/destinar-rouanet.html', '/api/config/brand']) {
    const r = await fetch(base + caminho);
    const c = r.headers.get('content-security-policy');
    if (!c) throw new Error(`${caminho} sem CSP`);
    csp = csp || c;
  }
});

await teste('fecha o que importa: origem propria, sem iframe, sem plugin, sem base trocado', () => {
  const d = diretivas(csp);
  const exige = (nome, valor) => {
    if (!d[nome]) throw new Error(`falta ${nome}`);
    if (!d[nome].includes(valor)) throw new Error(`${nome} sem ${valor}: ${d[nome].join(' ')}`);
  };
  exige('default-src', "'self'");
  exige('frame-ancestors', "'none'");
  exige('frame-src', "'none'");
  exige('object-src', "'none'");
  exige('base-uri', "'self'");
  exige('form-action', "'self'");
  exige('connect-src', "'self'");
  if (!('upgrade-insecure-requests' in d)) throw new Error('falta upgrade-insecure-requests');
});

await teste('script so da origem propria e dos dois CDNs em uso', () => {
  const d = diretivas(csp);
  const esperado = ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdnjs.cloudflare.com'];
  const extra = d['script-src'].filter(v => !esperado.includes(v));
  const faltando = esperado.filter(v => !d['script-src'].includes(v));
  if (extra.length) throw new Error('script-src com origem a mais: ' + extra.join(' '));
  if (faltando.length) throw new Error('script-src sem: ' + faltando.join(' '));
  if (d['script-src'].includes("'unsafe-eval'")) throw new Error("'unsafe-eval' anula a politica");
  if (d['script-src'].includes('*') || d['script-src'].includes('https:')) throw new Error('script-src aberto');
});

await teste('estilo e fonte: Google Fonts e cdnjs; imagem: qualquer https (logo de tenant)', () => {
  const d = diretivas(csp);
  for (const v of ["'self'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com']) {
    if (!d['style-src'].includes(v)) throw new Error('style-src sem ' + v);
  }
  for (const v of ['https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com']) {
    if (!d['font-src'].includes(v)) throw new Error('font-src sem ' + v);
  }
  for (const v of ["'self'", 'data:', 'blob:', 'https:']) {
    if (!d['img-src'].includes(v)) throw new Error('img-src sem ' + v);
  }
});

await teste('os outros cabecalhos do helmet continuam', async () => {
  const r = await fetch(base + '/index.html');
  for (const h of ['strict-transport-security', 'x-content-type-options', 'referrer-policy']) {
    if (!r.headers.get(h)) throw new Error('sem ' + h);
  }
  if (r.headers.get('cross-origin-embedder-policy')) throw new Error('COEP ligado quebra o PDF em nova aba');
});

servidor.kill();
console.log('\n================================================================');
for (const n of ok) console.log(`  ok    ${n}`);
for (const [n, e] of falhas) console.log(`  FALHA ${n}\n        ${e}`);
console.log('================================================================');
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
