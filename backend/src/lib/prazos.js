/**
 * O prazo para apresentar o comprovante ao órgão que emite o recibo.
 *
 * A Resolução Normativa nº 125/2026 do CDCA/DF, art. 7º, dá ao contribuinte
 * 60 dias da data da doação para levar o comprovante de depósito à Secretaria
 * Executiva do CDCA/DF — e é isso que faz o recibo sair. Sem recibo não há
 * dedução, com o dinheiro já transferido.
 *
 * É o único prazo do produto que mata o benefício DEPOIS de a pessoa ter
 * pagado. A Rouanet não tem equivalente, e por isso `prazo_comprovante_dias`
 * é NULL no fundo dela: ausência de prazo é informação, não campo esquecido.
 *
 * O número não mora aqui. Quem fixa os 60 dias é o Conselho do DF, na
 * resolução dele; outro conselho pode fixar outro, e o mesmo conselho pode
 * mudar o seu. Vem de `official_funds`, como o teto vem de `tetos_deducao`.
 *
 * A plataforma não apresenta nada em nome de ninguém: ela conta, mostra e
 * avisa. Quem vai à Secretaria Executiva é o contribuinte.
 */
import pool from '../../config/database.js';

/** Um dia em milissegundos. */
const DIA = 24 * 60 * 60 * 1000;

/** Dias de antecedência em que a tela passa a tratar o prazo como urgente. */
export const AVISO_ANTECEDENCIA_DIAS = 15;

/**
 * Converte para uma data em UTC, no início do dia.
 *
 * A data da transferência é DATE no banco: dia, sem hora. Comparar isso com
 * `new Date()` no fuso local erraria por um dia perto da meia-noite, sempre
 * para o lado de achar que o prazo já venceu — ou pior, que ainda não.
 */
function diaUTC(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * O prazo de uma destinação, ou null quando não há prazo a contar.
 *
 * Devolve null — e não um objeto com campos vazios — nos três casos em que
 * não há o que mostrar: fundo sem prazo (Rouanet), transferência ainda não
 * informada, e recibo já emitido. Quem chama decide o que fazer com a
 * ausência; inventar "0 dias restantes" seria alarme falso.
 *
 * @param {{transferido_em?: any, prazo_comprovante_dias?: number,
 *          prazo_comprovante_orgao?: string, prazo_comprovante_base_legal?: string,
 *          mecenato_issued_at?: any}} d
 * @param {Date} [agora]
 */
export function prazoDoComprovante(d, agora = new Date()) {
  const dias = Number(d?.prazo_comprovante_dias);
  if (!Number.isFinite(dias) || dias <= 0) return null;

  const inicio = diaUTC(d?.transferido_em);
  if (!inicio) return null;

  // Recibo emitido encerra a contagem: o prazo existia para chegar até aqui.
  if (d?.mecenato_issued_at) return null;

  const vence = new Date(inicio.getTime() + dias * DIA);
  const hoje  = diaUTC(agora);
  const restam = Math.round((vence.getTime() - hoje.getTime()) / DIA);

  return {
    dias,
    transferido_em: inicio.toISOString().slice(0, 10),
    vence_em:       vence.toISOString().slice(0, 10),
    dias_restantes: restam,
    vencido:        restam < 0,
    urgente:        restam >= 0 && restam <= AVISO_ANTECEDENCIA_DIAS,
    orgao:      d?.prazo_comprovante_orgao || null,
    base_legal: d?.prazo_comprovante_base_legal || null
  };
}

/**
 * Uma frase pronta sobre o prazo, para tela e e-mail.
 *
 * Fica aqui, e não em cada página, pelo mesmo motivo do `moeda.js`: quatro
 * cópias de um texto viram quatro textos diferentes.
 */
export function frasePrazo(p) {
  if (!p) return null;
  const onde = p.orgao ? ` à ${p.orgao}` : '';
  if (p.vencido) {
    const dias = Math.abs(p.dias_restantes);
    return `O prazo de ${p.dias} dias para apresentar o comprovante${onde} venceu `
         + `em ${formataDia(p.vence_em)} — há ${dias} ${dias === 1 ? 'dia' : 'dias'}. `
         + `Procure o órgão: só ele pode dizer se ainda cabe emitir o recibo.`;
  }
  if (p.dias_restantes === 0) {
    return `Hoje é o último dia para apresentar o comprovante${onde}.`;
  }
  return `Faltam ${p.dias_restantes} ${p.dias_restantes === 1 ? 'dia' : 'dias'} para apresentar `
       + `o comprovante${onde}. O prazo vence em ${formataDia(p.vence_em)}.`;
}

/** "2026-09-22" → "22/09/2026". */
export function formataDia(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/**
 * O prazo do fundo que o tenant opera, para a tela poder avisar ANTES de a
 * pessoa transferir — que é quando o aviso ainda evita o problema.
 *
 * @param {string} organizationId
 * @param {{query: Function}} [executor]
 */
export async function prazoDaOrganizacao(organizationId, executor = pool) {
  if (!organizationId) return null;
  try {
    const { rows } = await executor.query(
      `SELECT f.prazo_comprovante_dias, f.prazo_comprovante_orgao, f.prazo_comprovante_base_legal
         FROM org_projects p
         JOIN official_funds f ON f.id = p.official_fund_id
        WHERE p.organization_id = $1 AND p.is_active = true
          AND f.prazo_comprovante_dias IS NOT NULL
        ORDER BY p.is_featured DESC, p.created_at DESC
        LIMIT 1`,
      [organizationId]
    );
    if (!rows.length) return null;
    return {
      dias:       rows[0].prazo_comprovante_dias,
      orgao:      rows[0].prazo_comprovante_orgao || null,
      base_legal: rows[0].prazo_comprovante_base_legal || null
    };
  } catch (erro) {
    console.error('[prazos] falha ao ler o prazo do fundo:', erro.message);
    return null;
  }
}

export default {
  prazoDoComprovante, frasePrazo, formataDia, prazoDaOrganizacao,
  AVISO_ANTECEDENCIA_DIAS
};
