/**
 * Quais origens o navegador pode usar para falar com a API.
 *
 * O PROBLEMA
 *
 * A lista vivia escrita à mão no `server.js`: os domínios da plataforma, mais
 * um regex para `*.incentivabr.com.br`. Cliente em subdomínio nosso passava;
 * cliente com **domínio próprio**, não — e `organizations.custom_domain` existe
 * justamente para suportar domínio próprio: o middleware de tenant resolve a
 * organização por ele.
 *
 * Ou seja, o sistema aceitava o domínio do cliente na entrada e o recusava na
 * saída. Provado contra um Postgres real:
 *
 *   Origin: https://casa-azul.incentivabr.com.br  → 200
 *   Origin: https://casaazul.org.br               → 500
 *
 * Duas cópias da mesma verdade — a lista no código e a coluna no banco — e elas
 * divergiam. A regra da casa já diz o conserto: dado de cliente vem do banco.
 *
 * O QUE ISTO NÃO AFROUXA
 *
 * Só entra na lista o domínio que NÓS cadastramos, de organização ativa. Não há
 * curinga, não há "qualquer origem", e campo vazio nunca vira permissão. Um
 * domínio cadastrado errado é um erro de cadastro, não um buraco aberto: a tela
 * de clientes é do superadmin.
 *
 * O cache é curto de propósito. Cadastrar um cliente não pode exigir deploy, e
 * consultar o banco a cada preflight seria desperdício — o mesmo equilíbrio dos
 * tetos fiscais.
 */
import pool from '../../config/database.js';

/** Domínios da própria plataforma e do desenvolvimento local. */
export const ORIGENS_FIXAS = [
  // DestineAI — vitrine
  'https://destineai.com.br',
  'https://www.destineai.com.br',
  'https://rouanet-production-4df2.up.railway.app',
  // IncentivaBR — institucional e admin
  'https://incentivabr.com.br',
  'https://www.incentivabr.com.br',
  // Desenvolvimento local
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:3000'
];

/** Subdomínio nosso: `casa-azul.incentivabr.com.br`. */
const SUBDOMINIO_NOSSO = /^https:\/\/[a-z0-9-]+\.incentivabr\.com\.br$/;

const CACHE_MS = 60_000;
let cache = { quando: 0, origens: new Set() };

/** Um domínio cadastrado vira as duas origens que o navegador pode mandar. */
function origensDoDominio(dominio) {
  const limpo = String(dominio || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  // Sem ponto não é domínio, e string vazia nunca pode virar permissão.
  if (!limpo || !limpo.includes('.')) return [];
  const semWww = limpo.replace(/^www\./, '');
  return [`https://${semWww}`, `https://www.${semWww}`];
}

/**
 * Os domínios próprios dos clientes ativos, do banco.
 *
 * Falha de consulta NÃO derruba a API nem abre a porta: devolve o cache
 * anterior (ou vazio), e as origens fixas continuam valendo.
 */
export async function origensDosClientes(executor = pool) {
  const agora = Date.now();
  if (agora - cache.quando < CACHE_MS) return cache.origens;
  try {
    const { rows } = await executor.query(
      `SELECT custom_domain, admin_domain FROM organizations WHERE is_active = true`);
    const origens = new Set();
    for (const r of rows) {
      for (const d of [r.custom_domain, r.admin_domain]) {
        for (const o of origensDoDominio(d)) origens.add(o);
      }
    }
    cache = { quando: agora, origens };
  } catch (erro) {
    console.error('[cors] falha ao ler domínios dos clientes:', erro.message);
    cache = { quando: agora, origens: cache.origens };
  }
  return cache.origens;
}

/** Só para teste: a próxima chamada relê o banco. */
export function esqueceOrigens() { cache = { quando: 0, origens: new Set() }; }

/**
 * A origem pode falar com a API?
 *
 * @returns {Promise<{ok: boolean, motivo?: string}>}
 */
export async function origemPermitida(origin, executor = pool) {
  // Sem origin: app nativo, curl, healthcheck da Railway. Não é navegador, e
  // CORS só existe para navegador.
  if (!origin) return { ok: true };
  if (ORIGENS_FIXAS.includes(origin)) return { ok: true };
  if (SUBDOMINIO_NOSSO.test(origin)) return { ok: true };
  if ((await origensDosClientes(executor)).has(origin)) return { ok: true };
  return { ok: false, motivo: `origem não cadastrada: ${origin}` };
}

export default { origemPermitida, origensDosClientes, esqueceOrigens, ORIGENS_FIXAS };
