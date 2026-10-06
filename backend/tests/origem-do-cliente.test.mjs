// O domínio próprio do cliente fala com a API.
//
// O PROBLEMA
//
// A lista de origens permitidas vivia escrita à mão no `server.js`: os domínios
// da plataforma, mais um regex para `*.incentivabr.com.br`. Cliente em
// subdomínio nosso passava; cliente com DOMÍNIO PRÓPRIO, não.
//
// E `organizations.custom_domain` existe justamente para domínio próprio: o
// middleware de tenant resolve a organização por ele. O sistema aceitava o
// domínio do cliente na ENTRADA e o recusava na SAÍDA. Provado contra um
// Postgres real, antes do conserto:
//
//   Origin: https://casa-azul.incentivabr.com.br  → 200
//   Origin: https://casaazul.org.br               → 500
//
// Duas cópias da mesma verdade — a lista no código e a coluna no banco — e elas
// divergiam. É o mesmo modo de falha do teto fiscal, dos códigos da DIRPF e dos
// limites de texto, e o conserto é o mesmo: dado de cliente vem do banco.
//
// E o 500 era parte do defeito. "Erro interno do servidor" enganou a própria
// auditoria que achou isto; para quem está com o site do cliente no ar, não diz
// nada. Origem recusada responde 403 nomeando o que fazer.
//
// O QUE ISTO NÃO AFROUXA
//
// Só entra o domínio que NÓS cadastramos, de organização ATIVA. Sem curinga,
// sem "qualquer origem", e campo vazio nunca vira permissão — um `custom_domain`
// em branco não pode abrir a porta para `https://`.
import {
  origemPermitida, origensDosClientes, esqueceOrigens, ORIGENS_FIXAS
} from '../src/lib/origensPermitidas.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

/** Banco de mentira: responde o que `organizations` responderia. */
const banco = (linhas) => ({
  chamadas: 0,
  async query() { this.chamadas++; return { rows: linhas }; }
});

const CLIENTES = [
  { custom_domain: 'casaazul.org.br',        admin_domain: null },
  { custom_domain: 'www.institutoaurora.org', admin_domain: 'admin.institutoaurora.org' },
  { custom_domain: null,                      admin_domain: null },
  { custom_domain: '',                        admin_domain: '   ' }
];

await teste('o dominio proprio do cliente passa, com e sem www', async () => {
  esqueceOrigens();
  const b = banco(CLIENTES);
  for (const origem of ['https://casaazul.org.br', 'https://www.casaazul.org.br']) {
    const r = await origemPermitida(origem, b);
    if (!r.ok) throw new Error('recusou o dominio cadastrado: ' + origem);
  }
});

await teste('o dominio ADMIN do cliente tambem passa', async () => {
  esqueceOrigens();
  const r = await origemPermitida('https://admin.institutoaurora.org', banco(CLIENTES));
  if (!r.ok) throw new Error('recusou o admin_domain cadastrado');
});

await teste('dominio cadastrado com www vale sem www tambem', async () => {
  // O cadastro pode vir de qualquer jeito; o navegador manda o que o visitante
  // digitou. As duas formas são o mesmo site.
  esqueceOrigens();
  const r = await origemPermitida('https://institutoaurora.org', banco(CLIENTES));
  if (!r.ok) throw new Error('cadastro com www nao cobriu a forma sem www');
});

await teste('origem NAO cadastrada e recusada, com motivo', async () => {
  esqueceOrigens();
  const r = await origemPermitida('https://site-de-terceiro.com', banco(CLIENTES));
  if (r.ok) throw new Error('aceitou origem de terceiro');
  if (!/n[ãa]o cadastrada/i.test(r.motivo || '')) throw new Error('recusou sem dizer por que: ' + r.motivo);
});

await teste('campo vazio ou nulo NUNCA vira permissao', async () => {
  // Um `custom_domain` em branco não pode abrir `https://` nem `https://www.`.
  esqueceOrigens();
  const origens = await origensDosClientes(banco(CLIENTES));
  for (const ruim of ['https://', 'https://www.', 'https://   ', '']) {
    if (origens.has(ruim)) throw new Error('campo vazio virou origem: ' + JSON.stringify(ruim));
  }
  // E nada sem ponto entra: "localhost" cadastrado por engano não abre a porta.
  esqueceOrigens();
  const soLixo = await origensDosClientes(banco([{ custom_domain: 'intranet', admin_domain: 'x' }]));
  if (soLixo.size) throw new Error('dominio sem ponto entrou: ' + [...soLixo].join(','));
});

await teste('a plataforma e o subdominio nosso continuam valendo', async () => {
  esqueceOrigens();
  const b = banco([]);
  for (const origem of [...ORIGENS_FIXAS, 'https://casa-azul.incentivabr.com.br']) {
    const r = await origemPermitida(origem, b);
    if (!r.ok) throw new Error('recusou origem da casa: ' + origem);
  }
});

await teste('sem Origin passa: curl, app nativo e healthcheck nao sao navegador', async () => {
  esqueceOrigens();
  const r = await origemPermitida(undefined, banco([]));
  if (!r.ok) throw new Error('recusou requisicao sem Origin');
});

await teste('o banco e consultado com cache, nao a cada pedido', async () => {
  esqueceOrigens();
  const b = banco(CLIENTES);
  for (let i = 0; i < 5; i++) await origemPermitida('https://casaazul.org.br', b);
  if (b.chamadas !== 1) throw new Error('consultou o banco ' + b.chamadas + ' vezes');
});

await teste('falha no banco nao abre a porta nem derruba a API', async () => {
  esqueceOrigens();
  const quebrado = { async query() { throw new Error('banco fora'); } };
  const r = await origemPermitida('https://site-de-terceiro.com', quebrado);
  if (r.ok) throw new Error('falha de banco virou permissao');
  const fixa = await origemPermitida('https://incentivabr.com.br', quebrado);
  if (!fixa.ok) throw new Error('falha de banco derrubou as origens fixas');
});

await teste('o server.js nao guarda mais a lista a mao', async () => {
  const server = fs.readFileSync(path.join(AQUI, '../server.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if (/const ALLOWED_ORIGINS\s*=/.test(server)) {
    throw new Error('a lista de origens voltou para o server.js');
  }
  if (!/origemPermitida\(/.test(server)) throw new Error('o server.js nao usa origemPermitida()');
  // E origem recusada responde 403, não o 500 que enganou a auditoria.
  if (!/origem_nao_cadastrada/.test(server)) {
    throw new Error('origem recusada nao responde 403 com codigo proprio');
  }
});

console.log('\nO domínio próprio do cliente fala com a API\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
