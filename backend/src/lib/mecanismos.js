/**
 * O mecanismo de incentivo de um cliente — uma fonte só.
 *
 * Quatro rotas escolhiam o mecanismo repetindo `org?.incentive_group_code ||
 * 'ROUANET'`. A coluna não existia (migration 043 a criou) e o literal estava
 * em maiúscula, que não é como o catálogo grava. Duas formas de errar a mesma
 * decisão, em quatro lugares. Agora é aqui.
 *
 * Um mecanismo por cliente (decisão de set/2026). O servidor que entra no site
 * de um cliente vê o mecanismo daquele cliente, e só ele.
 */
import pool from '../../config/database.js';

/**
 * O que um cliente é quando ninguém disse o contrário.
 *
 * Coincide com o DEFAULT da coluna (migration 043) e com o que a plataforma
 * operou desde sempre. Continua existindo para o caso sem tenant — a
 * calculadora aberta, por exemplo, que responde sem organização nenhuma.
 */
export const MECANISMO_PADRAO = 'rouanet';

/** O código do mecanismo desta organização. Não vai ao banco. */
export function codigoDoMecanismo(org) {
  const codigo = org?.incentive_group_code;
  return (typeof codigo === 'string' && codigo.trim()) ? codigo.trim() : MECANISMO_PADRAO;
}

/**
 * O mecanismo inteiro: o que o cálculo usa (`incentive_groups`) somado ao que
 * a página mostra (`laws` — base legal, órgão, sistema oficial).
 *
 * Devolve null se o catálogo não responder. Quem chama decide o que fazer com
 * isso; nenhuma tela deve quebrar por não saber o nome de uma lei.
 */
export async function mecanismoDaOrg(org, executor = pool) {
  const codigo = codigoDoMecanismo(org);
  try {
    const { rows } = await executor.query(
      `SELECT g.code, g.name, g.teto_codigo, g.disponivel_para_cliente, g.pendencia_parecer,
              l.base_legal, l.orgao, l.sistema_oficial, l.sistema_url
         FROM incentive_groups g
         LEFT JOIN laws l ON l.slug = g.law_slug
        WHERE g.code = $1
        LIMIT 1`,
      [codigo]
    );
    return rows[0] || null;
  } catch (erro) {
    console.error('[mecanismos] falha ao ler o mecanismo da organização:', erro.message);
    return null;
  }
}

/**
 * O catálogo para a tela do superadmin: todos, com a razão de quem não pode
 * ser escolhido.
 *
 * Mostrar os bloqueados, e não escondê-los, é de propósito: o superadmin
 * precisa saber que o Fundo do Idoso existe no sistema e o que falta para
 * liberá-lo. Uma lista com um item só parece um sistema que só sabe Rouanet.
 */
export async function mecanismosDisponiveis(executor = pool) {
  const { rows } = await executor.query(
    `SELECT g.code, g.name, g.disponivel_para_cliente, g.pendencia_parecer,
            l.base_legal, l.orgao
       FROM incentive_groups g
       LEFT JOIN laws l ON l.slug = g.law_slug
      ORDER BY g.disponivel_para_cliente DESC, g.name`
  );
  return rows;
}

/**
 * Este código pode ser atribuído a um cliente?
 *
 * Mecanismo sem teto resolvido cairia no teto global de 6% dentro de
 * `tetoDoMecanismo()` — permissivo demais para quase todos. Recusar aqui é o
 * que impede um cliente de sair oferecendo o dobro do que a lei permite.
 */
export async function podeSerDoCliente(codigo, executor = pool) {
  if (!codigo) return { ok: false, motivo: 'Informe o mecanismo de incentivo.' };
  const { rows } = await executor.query(
    'SELECT name, disponivel_para_cliente, pendencia_parecer FROM incentive_groups WHERE code = $1 LIMIT 1',
    [codigo]
  );
  const m = rows[0];
  if (!m) return { ok: false, motivo: `Mecanismo desconhecido: ${codigo}.` };
  if (!m.disponivel_para_cliente) {
    return {
      ok: false,
      motivo: `${m.name} ainda não pode ser atribuído a um cliente. ` +
              (m.pendencia_parecer || 'Falta resolver o teto aplicável.')
    };
  }
  return { ok: true };
}

export default {
  MECANISMO_PADRAO, codigoDoMecanismo, mecanismoDaOrg,
  mecanismosDisponiveis, podeSerDoCliente
};
