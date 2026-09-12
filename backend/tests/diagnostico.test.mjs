// /diagnostico nunca teve autenticacao, e foi ganhando detalhe ate virar a
// planta da casa: host interno do banco, nome do banco, usuario, mensagem do
// commit, quais variaveis existem. Servido a qualquer um que soubesse a URL.
// Junto com uma DATABASE_URL vazada, e a diferenca entre ter a senha e saber
// onde usa-la.
//
// A rota nao podia simplesmente fechar: ela e o que responde durante uma queda,
// justamente quando login e banco estao fora. Entao o detalhe ficou atras de um
// token proprio, que nao depende de nenhum dos dois.
//
// O servidor sobe de verdade aqui, como filho, apontando para um banco que nao
// existe — que e o cenario em que essa rota mais e usada.
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PORTA = 3199;
const TOKEN = 'token-de-teste-nao-usar-em-producao';

const servidor = spawn(process.execPath, [path.join(AQUI, '../server.js')], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORTA),
    DIAG_TOKEN: TOKEN,
    DATABASE_URL: 'postgresql://postgres:senha@banco-que-nao-existe.invalido:5432/railway',
    RAILWAY_GIT_COMMIT_SHA: 'abcdef1234567890',
    RAILWAY_GIT_COMMIT_MESSAGE: 'mensagem que nao deve vazar',
    SIMULATION_MODE: 'true'
  },
  stdio: 'ignore'
});

const base = `http://127.0.0.1:${PORTA}`;
const pegar = async (cabecalhos) => {
  const r = await fetch(base + '/diagnostico', { headers: cabecalhos || {} });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};

// Espera o servidor atender. Ele sobe mesmo com o banco fora — de proposito.
let pronto = false;
for (let i = 0; i < 60 && !pronto; i++) {
  try { await pegar(); pronto = true; } catch { await new Promise(r => setTimeout(r, 250)); }
}

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

await teste('o servidor atende mesmo com o banco fora', () => {
  if (!pronto) throw new Error('nao subiu em 15s');
});

await teste('sem token, diz se esta no ar e mais nada', async () => {
  const { corpo } = await pegar();
  const texto = JSON.stringify(corpo);
  for (const vazamento of ['banco-que-nao-existe', 'railway', 'postgres',
                           'mensagem que nao deve vazar', 'DATABASE_URL']) {
    if (texto.includes(vazamento)) throw new Error(`vazou "${vazamento}"`);
  }
  if (!corpo.services?.database?.status) throw new Error('nem o status basico saiu');
  if (corpo.services.database.error) throw new Error('a mensagem de erro do banco vazou');
});

await teste('sem token, o status de cada servico continua visivel', async () => {
  const { corpo } = await pegar();
  for (const s of ['database', 'email', 'migrations']) {
    if (!(s in corpo.services)) throw new Error(`sumiu o status de ${s}`);
  }
  if (corpo.services.database.status !== 'error') {
    throw new Error('o banco esta fora e a rota publica nao diz');
  }
});

// Este servidor sobe sem SITE_SENHA. O caso da portaria ligada esta em
// portaria.test.mjs, que ja sobe os dois cenarios.
await teste('sem token, diz que o site esta aberto ao publico', async () => {
  const { corpo } = await pegar();
  if (!corpo.portaria) throw new Error('nao veio o bloco portaria');
  if (corpo.portaria.ligada !== false) throw new Error('ligada: ' + corpo.portaria.ligada);
  // Se entrasse em `services` com status de erro, o monitor de uptime
  // reprovaria o site por estar fechado — que e o estado que pedimos.
  if ('portaria' in corpo.services) throw new Error('a portaria entrou em services');
});

await teste('token errado nao abre', async () => {
  const { corpo } = await pegar({ 'x-diagnostico-token': 'chute' });
  if (corpo.build) throw new Error('abriu com token errado');
});

await teste('token com o prefixo certo tambem nao abre', async () => {
  // Se a comparacao fosse por prefixo — ou parasse no primeiro caractere
  // diferente — daria para descobrir o token a tentativas.
  const { corpo } = await pegar({ 'x-diagnostico-token': TOKEN.slice(0, -1) });
  if (corpo.build) throw new Error('aceitou token truncado');
});

await teste('com o token certo, o detalhe aparece', async () => {
  const { corpo } = await pegar({ 'x-diagnostico-token': TOKEN });
  if (!corpo.build) throw new Error('nao veio o bloco build');
  if (corpo.build.commit !== 'abcdef1') throw new Error('commit errado: ' + corpo.build.commit);
  if (!corpo.services.database.conexao) throw new Error('nao veio a descricao da conexao');
  if (!corpo.environment) throw new Error('nao veio o mapa de variaveis');
});

await teste('nem com o token a senha do banco aparece', async () => {
  const { corpo } = await pegar({ 'x-diagnostico-token': TOKEN });
  const texto = JSON.stringify(corpo);
  if (texto.includes('senha@') || /"senha"\s*:\s*"/.test(texto)) {
    throw new Error('a senha do banco saiu no diagnostico');
  }
  const c = corpo.services.database.conexao;
  if (c.host !== 'banco-que-nao-existe.invalido') throw new Error('host errado: ' + c.host);
  if (c.senha_com_espaco_nas_pontas !== false) throw new Error('sinal de espaco errado');
});

servidor.kill();

console.log('\n================================================================');
ok.forEach(n => console.log('  ok   ', n));
falhas.forEach(([n, e]) => console.log('  FALHA', n, '\n          ' + e));
console.log('================================================================');
console.log(`${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
