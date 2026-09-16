/**
 * Quem responde pelos dados, em cada site.
 *
 * Um processo serve dois papéis. Na IncentivaBR (`www`), quem decide as
 * finalidades é a própria IncentivaBR: ela é a controladora. No site de um
 * cliente white-label, quem decide é o cliente — ele é o controlador, e a
 * IncentivaBR trata por conta e sob instrução dele, como operadora
 * (LGPD, art. 5º VI e VII).
 *
 * Isso não é rótulo de contrato: muda o que a página tem de dizer. O art. 41
 * §1º exige que o Encarregado seja divulgado publicamente, e o Encarregado é
 * o do CONTROLADOR. A Política servida sob a marca do cliente mostrava o
 * Encarregado da IncentivaBR — mandava o titular reclamar com quem não
 * responde por ele.
 *
 * Daqui sai um objeto só, que `GET /api/config/brand` devolve em `privacidade`
 * e `tenant.js` escreve nos `[data-privacidade="..."]` das páginas. Nenhuma
 * página escreve nome de controlador à mão.
 *
 * ATENÇÃO: isto descreve o desenho escolhido, não substitui parecer. O anexo
 * de operador do contrato é o que sustenta este arranjo juridicamente; ver
 * docs/juridico/papeis-lgpd.md.
 */
import { POLITICA_VERSAO, ENCARREGADO } from '../config/lgpd.js';

/**
 * @param {object|null} org  a organização do tenant, como vem do banco
 * @returns {{
 *   eh_plataforma: boolean,
 *   controlador: string,
 *   operador: string|null,
 *   encarregado_nome: string,
 *   encarregado_email: string,
 *   encarregado_completo: boolean,
 *   politica_versao: string
 * }}
 */
export function papeisDaPrivacidade(org) {
  const ehPlataforma = !org || org.slug === 'www';

  if (ehPlataforma) {
    return {
      eh_plataforma: true,
      controlador: 'IncentivaBR',
      operador: null,
      // Os Termos de Uso não falam de dados: falam de quem presta o serviço e
      // de quem é a tecnologia. Chamar a associação de "controlador" numa
      // cláusula de responsabilidade seria usar a palavra errada num
      // documento em que palavra errada custa caro. Mesmos valores, nomes que
      // dizem o que a cláusula trata.
      prestador: 'IncentivaBR',
      fornecedor: 'IncentivaBR',
      encarregado_nome: ENCARREGADO.nome,
      encarregado_email: ENCARREGADO.email,
      encarregado_completo: true,
      politica_versao: POLITICA_VERSAO
    };
  }

  // Cliente white-label. A escada de reserva existe para não deixar a página
  // sem contato nenhum — uma Política sem canal de exercício de direitos é
  // pior do que uma com o canal errado. Mas o certo é o cliente preencher, e
  // `encarregado_completo: false` é o que a tela de clientes usa para cobrar.
  // Cada degrau é aparado ANTES de decidir. Aparar só no fim fazia um campo
  // com espaço vencer o contato da organização e cair direto na IncentivaBR:
  // '  ' é verdadeiro, ganhava o `||`, e virava '' tarde demais.
  const texto = v => String(v ?? '').trim();
  const nomeProprio  = texto(org.encarregado_nome);
  const emailProprio = texto(org.encarregado_email);
  const email = emailProprio || texto(org.contact_email) || ENCARREGADO.email;

  return {
    eh_plataforma: false,
    controlador: org.name,
    operador: 'IncentivaBR',
    prestador: org.name,          // quem presta o serviço (Termos de Uso)
    fornecedor: 'IncentivaBR',    // de quem é a tecnologia (Termos de Uso)
    encarregado_nome: nomeProprio || org.name,
    encarregado_email: email,
    encarregado_completo: Boolean(nomeProprio && emailProprio),
    politica_versao: POLITICA_VERSAO
  };
}

export default { papeisDaPrivacidade };
