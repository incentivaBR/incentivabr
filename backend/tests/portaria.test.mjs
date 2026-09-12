// O site inteiro atras de uma senha, enquanto nao abre ao publico.
//
// Sem isto, qualquer pessoa com o endereco usa tudo e o Google indexa — numa
// plataforma que fala de imposto, ainda em modo simulacao e sem o parecer do
// tributarista, isso e promessa que nao se pode cumprir.
//
// O que estes testes guardam:
//
//   - sem SITE_SENHA, nada muda: o site fica aberto, como sempre esteve;
//   - com SITE_SENHA, pagina e API pedem a senha;
//   - /health e /diagnostico ficam FORA da portaria. Se entrassem, a Railway
//     marcaria o deploy como falho e o monitor de uptime apitaria a cada
//     quinze minutos;
//   - depois de acertar a senha, o cookie sustenta a sessao. Isso importa
//     porque as chamadas de API mandam `Authorization: Bearer <token>`, que
//     SUBSTITUI o cabecalho da senha do site: sem o cookie, a pessoa entraria
//     na pagina e toda chamada de dados seria recusada;
//   - robots.txt acompanha a portaria, para nao sobrar um "Disallow: /"
//     esquecido no dia da abertura.
//
// Cada caso sobe o servidor de verdade, porque a portaria e um middleware de
// ordem: o que importa e onde ela fica na fila, nao o que a funcao devolve.
import { spawn } from 'child_process';

const PORTA = 3340;
const BASE = `http://127.0.0.1:${PORTA}`;
const SENHA = 'senha-do-site-para-teste';

const sobe = async (env) => {
  const servidor = spawn(process.execPath, [new URL('../server.js', import.meta.url).pathname], {
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(PORTA), JWT_SECRET: 'teste',
      DATABASE_URL: 'postgresql://p:s@banco-que-nao-existe.invalido:5432/x',
      SIMULATION_MODE: 'true', ...env
    },
    stdio: 'ignore'
  });
  for (let i = 0; i < 80; i++) {
    try { await fetch(BASE + '/health'); return servidor; } catch { await new Promise(r => setTimeout(r, 250)); }
  }
  servidor.kill();
  throw new Error('o servidor nao subiu');
};

const basic = senha => 'Basic ' + Buffer.from('site:' + senha).toString('base64');

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

// ── sem SITE_SENHA: o site segue aberto ─────────────────────────────────────
let servidor = await sobe({ SITE_SENHA: '' });

await teste('sem SITE_SENHA, a pagina abre sem pedir nada', async () => {
  const r = await fetch(BASE + '/index.html');
  if (r.status !== 200) throw new Error('status ' + r.status);
});

await teste('sem SITE_SENHA, nao existe robots.txt bloqueando', async () => {
  const r = await fetch(BASE + '/robots.txt');
  if (r.status === 200) {
    const txt = await r.text();
    if (/Disallow:\s*\/\s*$/m.test(txt)) throw new Error('robots.txt bloqueia com o site aberto');
  }
});

servidor.kill();
await new Promise(r => setTimeout(r, 400));

// ── com SITE_SENHA: portaria ligada ─────────────────────────────────────────
servidor = await sobe({ SITE_SENHA: SENHA });

await teste('a pagina pede a senha, e diz como', async () => {
  const r = await fetch(BASE + '/index.html');
  if (r.status !== 401) throw new Error('status ' + r.status);
  if (!/^Basic /.test(r.headers.get('www-authenticate') || '')) {
    throw new Error('sem o cabecalho que faz o navegador perguntar');
  }
});

await teste('a API tambem fica atras da portaria', async () => {
  const r = await fetch(BASE + '/api/config/brand');
  if (r.status !== 401) throw new Error('status ' + r.status);
});

await teste('senha errada nao passa', async () => {
  const r = await fetch(BASE + '/index.html', { headers: { Authorization: basic('outra-coisa') } });
  if (r.status !== 401) throw new Error('status ' + r.status);
});

await teste('/health fica FORA: e como a Railway sabe que o processo subiu', async () => {
  const r = await fetch(BASE + '/health');
  if (r.status !== 200) throw new Error('status ' + r.status);
});

await teste('/diagnostico fica FORA: e o que o monitor de uptime le', async () => {
  const r = await fetch(BASE + '/diagnostico');
  if (r.status === 401) throw new Error('a portaria cobriu o diagnostico');
});

await teste('com a senha certa, a pagina abre e devolve o cookie', async () => {
  const r = await fetch(BASE + '/index.html', { headers: { Authorization: basic(SENHA) } });
  if (r.status !== 200) throw new Error('status ' + r.status);
  const cookie = r.headers.get('set-cookie') || '';
  if (!/incentivabr_portaria=/.test(cookie)) throw new Error('sem cookie: ' + cookie);
  if (!/HttpOnly/i.test(cookie)) throw new Error('cookie sem HttpOnly');
});

await teste('o cookie sustenta a chamada de API que manda Bearer', async () => {
  // O caso que motivou o cookie: `Authorization: Bearer` substitui o
  // cabecalho da senha do site. So o cookie mantem a pessoa do lado de
  // dentro depois que a pagina carrega.
  const entrada = await fetch(BASE + '/index.html', { headers: { Authorization: basic(SENHA) } });
  const cookie = (entrada.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) throw new Error('nao veio cookie para testar');

  const r = await fetch(BASE + '/api/config/brand', {
    headers: { Cookie: cookie, Authorization: 'Bearer um-token-qualquer' }
  });
  if (r.status === 401) throw new Error('a portaria recusou mesmo com o cookie');
});

await teste('cookie inventado nao passa', async () => {
  const r = await fetch(BASE + '/index.html', { headers: { Cookie: 'incentivabr_portaria=chute' } });
  if (r.status !== 401) throw new Error('status ' + r.status);
});

await teste('o /diagnostico diz que a portaria esta fechada', async () => {
  // Com a portaria ligada, toda pagina responde 401 e de fora isso e
  // indistinguivel de site fora do ar. Sem este campo, a resposta a "por que
  // o dominio caiu?" so dava para deduzir.
  const d = await (await fetch(BASE + '/diagnostico')).json();
  if (!d.portaria) throw new Error('nao veio o bloco portaria');
  if (d.portaria.ligada !== true) throw new Error('ligada: ' + d.portaria.ligada);
});

await teste('o /diagnostico nao entrega a senha do site', async () => {
  const texto = JSON.stringify(await (await fetch(BASE + '/diagnostico')).json());
  if (texto.includes(SENHA)) throw new Error('a senha do site saiu no diagnostico');
  // Nem o tamanho: com ele, quem for tentar por forca bruta comeca sabendo
  // quantos caracteres procurar.
  if (new RegExp('"(tamanho|comprimento|length)"\\s*:').test(texto)) {
    throw new Error('saiu o tamanho da senha');
  }
});

await teste('com a portaria ligada, o robots.txt bloqueia todo mundo', async () => {
  const r = await fetch(BASE + '/robots.txt');
  if (r.status !== 200) throw new Error('status ' + r.status);
  const txt = await r.text();
  if (!/User-agent:\s*\*/.test(txt) || !/Disallow:\s*\//.test(txt)) throw new Error('conteudo: ' + txt);
});

servidor.kill();
await new Promise(r => setTimeout(r, 400));

// ── SITE_SENHA so com espaco: a armadilha silenciosa ────────────────────────
// A senha e lida com .trim(). Uma variavel so de espaco liga nada: a pessoa
// preenche no painel, o site segue aberto e parece que a portaria quebrou.
servidor = await sobe({ SITE_SENHA: '   ' });

await teste('senha so de espaco deixa o site aberto, e o diagnostico avisa', async () => {
  const r = await fetch(BASE + '/index.html');
  if (r.status !== 200) throw new Error('trancou com senha vazia: status ' + r.status);
  const d = await (await fetch(BASE + '/diagnostico')).json();
  if (d.portaria.ligada !== false) throw new Error('ligada: ' + d.portaria.ligada);
  if (!d.portaria.aviso) throw new Error('nao avisou que a variavel esta so com espaco');
});

servidor.kill();

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
