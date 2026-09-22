/**
 * Para onde vai a destinação, e como ela se chama na tela.
 *
 * A rota de registro nasceu Rouanet: exigia PRONAC de seis ou sete dígitos e
 * procurava o fundo pelo literal 'FNC'. Um fundo municipal não tem PRONAC —
 * tem CNPJ, uma OSC indicada pelo doador (RN 125/2026, art. 5º) e um recibo
 * emitido pelo próprio Conselho. Enquanto aquelas duas linhas existissem,
 * nenhum cliente fora da Rouanet registrava destinação.
 *
 * Este módulo responde às três perguntas que a rota precisa fazer sem saber
 * de que mecanismo se trata:
 *
 *   1. o que identifica esta destinação?   → identificaDestinacao()
 *   2. para qual fundo ela vai?            → fundoDaDestinacao()
 *   3. como isso se chama na tela?         → vocabulario()
 *
 * REGRA DESTE ARQUIVO: nada aqui decide sozinho. Tudo vem de
 * `incentive_groups` e `laws`, do mesmo jeito que o teto vem de
 * `tetos_deducao`. Um literal de mecanismo escrito aqui seria a mesma dívida
 * que o 'FNC' era.
 */
import pool from '../../config/database.js';

/** Vocabulário de reserva, quando o banco não responde. */
const NEUTRO = {
  identificador: null,
  beneficiario:  'a entidade beneficiária',
  recibo:        'recibo de doação',
  recibo_emissor: 'a entidade que emite o recibo'
};

/**
 * O vocabulário do mecanismo, para a tela e para os textos.
 *
 * Nenhuma página escreve "PRONAC" ou "Recibo de Mecenato" à mão — pela mesma
 * razão que nenhuma escreve percentual. Quatro cópias de uma palavra viram
 * quatro palavras diferentes no dia em que um cliente não for Rouanet.
 *
 * @param {object|null} mec - a linha de mecanismoDaOrg()
 */
export function vocabulario(mec) {
  if (!mec) return { ...NEUTRO };
  return {
    identificador:  mec.termo_identificador  || null,
    beneficiario:   mec.termo_beneficiario   || NEUTRO.beneficiario,
    recibo:         mec.termo_recibo         || NEUTRO.recibo,
    recibo_emissor: mec.termo_recibo_emissor || NEUTRO.recibo_emissor
  };
}

/**
 * Confere o identificador que veio no corpo da requisição.
 *
 * Devolve `{ ok, pronac, erro }`. Quando o mecanismo não usa registro externo,
 * `pronac` volta null e nada é exigido — não há número a digitar, e pedir um
 * faria o servidor inventar.
 *
 * @param {object|null} mec
 * @param {object} corpo - req.body
 */
export function identificaDestinacao(mec, corpo = {}) {
  const usaPronac = mec?.identificador === 'pronac';

  if (!usaPronac) {
    // A destinação aponta para o projeto ativo do tenant. Se o cliente mandar
    // um pronac assim mesmo, ele é ignorado em silêncio? Não: é recusado. Um
    // número que a jornada não usa, aceito calado, vira dado que ninguém sabe
    // de onde veio.
    if (corpo.pronac) {
      return {
        ok: false,
        erro: 'Este mecanismo não usa PRONAC. A destinação vai para o projeto cadastrado da organização.'
      };
    }
    return { ok: true, pronac: null };
  }

  const pronac = String(corpo.pronac || '').trim();
  if (!/^\d{6,7}$/.test(pronac)) {
    const nome = mec?.termo_identificador || 'identificador';
    return { ok: false, erro: `${nome} inválido. Deve ter 6 ou 7 dígitos.` };
  }
  return { ok: true, pronac };
}

/**
 * O fundo para o qual esta destinação vai.
 *
 * A ordem importa e é conservadora:
 *
 *   1. o fundo do projeto ativo do tenant — é o que a conta de captação
 *      acompanha, e o que o prazo do comprovante acompanha;
 *   2. o fundo ligado ao mecanismo no catálogo, quando o projeto não declara;
 *   3. null.
 *
 * Nunca um literal. Era `WHERE code = 'FNC'`, e por isso toda destinação de
 * todo cliente era carimbada como Rouanet — inclusive as que não fossem.
 *
 * @param {string} organizationId
 * @param {string} codigoGrupo
 * @param {{query: Function}} [executor]
 * @returns {Promise<string|null>} id de official_funds
 */
export async function fundoDaDestinacao(organizationId, codigoGrupo, executor = pool) {
  try {
    if (organizationId) {
      const { rows } = await executor.query(
        `SELECT official_fund_id FROM org_projects
          WHERE organization_id = $1 AND is_active = true AND official_fund_id IS NOT NULL
          ORDER BY is_featured DESC, created_at DESC LIMIT 1`,
        [organizationId]
      );
      if (rows[0]?.official_fund_id) return rows[0].official_fund_id;
    }

    if (codigoGrupo) {
      const { rows } = await executor.query(
        `SELECT f.id FROM official_funds f
           JOIN incentive_groups g ON g.id = f.incentive_group_id
          WHERE g.code = $1 AND COALESCE(f.is_active, true) = true
          ORDER BY f.created_at LIMIT 1`,
        [codigoGrupo]
      );
      if (rows[0]?.id) return rows[0].id;
    }
  } catch (erro) {
    console.error('[jornada] falha ao resolver o fundo da destinação:', erro.message);
  }
  return null;
}

/**
 * O título que a destinação guarda quando o cliente não manda um.
 *
 * Era `Projeto PRONAC ${pronac}` — literal da Rouanet, e sem sentido num fundo
 * que não tem PRONAC. Agora sai do projeto do tenant, e só cai no genérico
 * quando não há projeto cadastrado.
 *
 * @param {string} organizationId
 * @param {{query: Function}} [executor]
 */
export async function tituloPadrao(organizationId, executor = pool) {
  if (!organizationId) return null;
  try {
    const { rows } = await executor.query(
      `SELECT titulo FROM org_projects
        WHERE organization_id = $1 AND is_active = true
        ORDER BY is_featured DESC, created_at DESC LIMIT 1`,
      [organizationId]
    );
    return rows[0]?.titulo || null;
  } catch (erro) {
    console.error('[jornada] falha ao ler o título do projeto:', erro.message);
    return null;
  }
}

export default { vocabulario, identificaDestinacao, fundoDaDestinacao, tituloPadrao };
