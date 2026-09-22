/**
 * O Certificado de Autorização para Captação, e o que a validade dele decide.
 *
 * No FDCA/DF a OSC só capta com autorização do CDCA/DF, formalizada em
 * resolução publicada no DODF e num certificado com prazo (RN 125/2026,
 * arts. 12 a 15). O prazo é de dois anos da emissão, prorrogável por igual
 * período.
 *
 * O que torna isto mais que um campo de data é o art. 15, § 2º, IV: desistir
 * formalmente OU deixar o prazo extinguir sem pedido de prorrogação faz os
 * recursos JÁ CAPTADOS irem para a universalidade da política distrital. A
 * OSC perde para o fundo geral o dinheiro que levantou — por decurso de
 * prazo, sem que ninguém precise fazer nada.
 *
 * Por isso a situação é calculada aqui e não em cada tela: é a mesma conta
 * que decide um aviso amarelo, um aviso vermelho e o que se diz ao Conselho.
 *
 * SOBRE A JANELA DE SEIS MESES
 *
 * O § 1º fala em requerer a prorrogação "com antecedência de até 6 (seis)
 * meses do fim do prazo". Isso comporta duas leituras — que a janela ABRE
 * seis meses antes, ou que o pedido precisa de no MÍNIMO seis meses de
 * antecedência — e a diferença decide se uma OSC com três meses restantes
 * ainda pode pedir.
 *
 * Não inventamos qual vale. A partir dos seis meses o aviso acende e manda
 * procurar o CDCA/DF; avisar cedo serve às duas leituras, e é o Conselho
 * quem responde qual é a certa.
 */

/** O § 1º do art. 15 fala em seis meses. Em dias, para a conta. */
export const JANELA_PRORROGACAO_DIAS = 180;

const DIA = 24 * 60 * 60 * 1000;

/** Data em UTC, início do dia — as colunas são DATE, sem hora. */
function diaUTC(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function diasAte(alvo, agora) {
  return Math.round((alvo.getTime() - diaUTC(agora).getTime()) / DIA);
}

/**
 * A situação do certificado de um projeto, ou null quando não há certificado.
 *
 * null — e não um objeto "sem certificado" — porque a maioria dos projetos
 * não tem: a Rouanet não usa certificado nenhum. Quem chama decide o que
 * fazer com a ausência.
 *
 * As duas validades são conferidas separadamente e a que vence primeiro
 * manda: o registro da OSC pode vencer antes da autorização, e aí a captação
 * para pela entidade, não pelo projeto.
 *
 * @param {{certificado_numero?: string, certificado_publicado_em?: any,
 *          certificado_valido_ate?: any, registro_osc_valido_ate?: any,
 *          meta_captacao?: any}} p
 * @param {Date} [agora]
 */
export function situacaoDoCertificado(p, agora = new Date()) {
  const ateAutorizacao = diaUTC(p?.certificado_valido_ate);
  const ateRegistro    = diaUTC(p?.registro_osc_valido_ate);
  if (!ateAutorizacao && !ateRegistro) return null;

  // O que vence primeiro é o que manda — captar exige as duas coisas vivas.
  const candidatos = [
    ateAutorizacao && { o_que: 'autorizacao', em: ateAutorizacao },
    ateRegistro    && { o_que: 'registro',    em: ateRegistro }
  ].filter(Boolean).sort((a, b) => a.em - b.em);

  const primeiro = candidatos[0];
  const dias = diasAte(primeiro.em, agora);

  const situacao = dias < 0 ? 'vencido'
                 : dias <= JANELA_PRORROGACAO_DIAS ? 'vence_em_breve'
                 : 'vigente';

  return {
    situacao,
    // Qual das duas validades está mandando, para a tela não dizer
    // "autorização vencida" quando o que venceu foi o registro da entidade.
    o_que_vence:     primeiro.o_que,
    vence_em:        primeiro.em.toISOString().slice(0, 10),
    dias_restantes:  dias,
    pode_prorrogar:  situacao === 'vence_em_breve',
    numero:          p?.certificado_numero || null,
    publicado_em:    diaUTC(p?.certificado_publicado_em)?.toISOString().slice(0, 10) || null,
    autorizacao_ate: ateAutorizacao?.toISOString().slice(0, 10) || null,
    registro_ate:    ateRegistro?.toISOString().slice(0, 10) || null,
    meta_captacao:   p?.meta_captacao != null ? Number(p.meta_captacao) : null
  };
}

/**
 * A frase que a tela mostra. Uma só, aqui, pelo mesmo motivo do `moeda.js`.
 *
 * O texto do vencimento diz o que a norma faz com o dinheiro, porque é a
 * única parte que a pessoa precisa entender sem ler a resolução.
 */
export function fraseDoCertificado(c) {
  if (!c) return null;

  const oQue = c.o_que_vence === 'registro'
    ? 'o registro da OSC no CDCA/DF'
    : 'a autorização para captar';

  if (c.situacao === 'vencido') {
    const dias = Math.abs(c.dias_restantes);
    const perda = c.o_que_vence === 'autorizacao'
      ? ' Pelo art. 15, § 2º, IV, o prazo extinto sem pedido de prorrogação manda os recursos '
        + 'já captados para a universalidade da política distrital.'
      : '';
    return `Vencido há ${dias} ${dias === 1 ? 'dia' : 'dias'}: ${oQue} valeu até `
         + `${formataDia(c.vence_em)}.${perda} Procure o CDCA/DF.`;
  }

  if (c.situacao === 'vence_em_breve') {
    return `${oQue.charAt(0).toUpperCase()}${oQue.slice(1)} vence em `
         + `${formataDia(c.vence_em)} — faltam ${c.dias_restantes} `
         + `${c.dias_restantes === 1 ? 'dia' : 'dias'}. O art. 15, § 1º trata da prorrogação `
         + `em seis meses de antecedência: procure o CDCA/DF agora, porque deixar o prazo `
         + `extinguir sem pedido leva os recursos já captados para a universalidade da política.`;
  }

  return `${oQue.charAt(0).toUpperCase()}${oQue.slice(1)} vale até ${formataDia(c.vence_em)}.`;
}

/** "2026-09-22" → "22/09/2026". */
export function formataDia(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/**
 * Valida o que veio do formulário antes de gravar.
 *
 * Devolve `{ ok: true, valores }` ou `{ ok: false, erro }`. Data mal digitada
 * aqui vira aviso que não acende ou acende na hora errada, e o custo do erro
 * é o dinheiro da OSC.
 */
export function validaCertificado(corpo = {}) {
  const valores = {};

  for (const campo of ['certificado_publicado_em', 'certificado_valido_ate', 'registro_osc_valido_ate']) {
    const bruto = (corpo[campo] ?? '').toString().trim();
    if (!bruto) { valores[campo] = null; continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto) || Number.isNaN(new Date(`${bruto}T00:00:00Z`).getTime())) {
      return { ok: false, erro: `Data inválida em ${campo}. Use AAAA-MM-DD.` };
    }
    valores[campo] = bruto;
  }

  // Autorização que termina antes de ser publicada é erro de digitação, e
  // produziria um "vencido" falso no dia seguinte ao cadastro.
  const { certificado_publicado_em: pub, certificado_valido_ate: ate } = valores;
  if (pub && ate && ate < pub) {
    return { ok: false, erro: 'A validade da autorização é anterior à publicação da resolução. Confira as datas.' };
  }

  const numero = (corpo.certificado_numero ?? '').toString().trim();
  valores.certificado_numero = numero || null;

  const meta = corpo.meta_captacao;
  if (meta === undefined || meta === null || meta === '') {
    valores.meta_captacao = null;
  } else {
    const n = Number(meta);
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, erro: 'A meta de captação precisa ser um valor maior que zero.' };
    }
    valores.meta_captacao = n;
  }

  return { ok: true, valores };
}

export default {
  situacaoDoCertificado, fraseDoCertificado, formataDia, validaCertificado,
  JANELA_PRORROGACAO_DIAS
};
