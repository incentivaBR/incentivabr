import express from 'express';
import pool from '../../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { gerarComprovante } from '../services/pdfGenerator.js';
import { notifyDestinationRegistered, notifyDestinationConfirmed, notifyAdminNewDonation, notifyProponenteMecenatoPendente } from '../services/notificationService.js';
import { podeGerirOrganizacao } from '../lib/permissoes.js';
import { saldoDisponivel, bloqueiaContribuinte } from '../lib/tetos.js';
import { limpaCPF, cpfValido } from '../lib/cpf.js';

const router = express.Router();

// Validar UUID
function isValidUUID(id) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Avisa o proponente que ha um Recibo de Mecenato a emitir.
 *
 * Chamado sempre que uma destinacao passa a confirmed — hoje pela rota de
 * simulacao, e pela rota de confirmacao real quando ela existir. Deixe esta
 * funcao como ponto unico: o campo proponente_notified_at e o que permite a
 * tela dizer ao destinador "a instituicao ja foi avisada", que e o que tira a
 * ansiedade de depender de terceiro para o documento da declaracao.
 *
 * Falha aqui NAO desfaz a confirmacao. Se o e-mail nao sair, o status fica em
 * confirmed e a destinacao continua aparecendo na fila do proponente — a
 * notificacao e conveniencia, a fila e a garantia.
 */
async function avisarProponente(donationId) {
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.donation_amount AS amount, d.pronac, d.projeto_titulo,
              d.confirmed_at, d.organization_id,
              u.nome, u.cpf, u.email, u.phone,
              o.name AS org_name, o.contact_email, o.contact_whatsapp,
              o.contact_person, o.mecenato_prazo_dias,
              o.primary_color, o.secondary_color, o.logo_url
         FROM donations d
         JOIN users u ON u.id = d.user_id
         LEFT JOIN organizations o ON o.id = d.organization_id
        WHERE d.id = $1`,
      [donationId]
    );
    if (!rows.length) return;

    const r = rows[0];
    const org = {
      name: r.org_name, contact_email: r.contact_email,
      contact_whatsapp: r.contact_whatsapp, contact_person: r.contact_person,
      mecenato_prazo_dias: r.mecenato_prazo_dias,
      primary_color: r.primary_color, secondary_color: r.secondary_color,
      logo_url: r.logo_url
    };

    const resultado = await notifyProponenteMecenatoPendente(
      org,
      { nome: r.nome, name: r.nome, cpf: r.cpf, email: r.email, phone: r.phone },
      { amount: r.amount, pronac: r.pronac, projeto_titulo: r.projeto_titulo, confirmed_at: r.confirmed_at },
      { title: r.projeto_titulo }
    );

    if (resultado?.email) {
      await pool.query(
        `UPDATE donations
            SET proponente_notified_at = NOW(), status = 'awaiting_mecenato'
          WHERE id = $1 AND status = 'confirmed'`,
        [donationId]
      );
      console.log(`[mecenato] proponente notificado — destinação ${donationId}`);
    } else {
      console.warn(`[mecenato] proponente NAO notificado — destinação ${donationId} segue na fila`);
    }
  } catch (erro) {
    console.error('[mecenato] falha ao avisar proponente:', erro.message);
  }
}

/**
 * Quem avisa quem. Objeto, e não import direto, para os testes poderem trocar
 * o notificador por um falso e conferir que a rota chamou — sem e-mail real.
 */
export const notificadores = {
  destinadorConfirmado: notifyDestinationConfirmed
};

/**
 * Avisa o DESTINADOR que a transferência dele foi conferida.
 *
 * A função de e-mail existia desde o início e nunca foi chamada (Raio-X,
 * risco 10). Sem este aviso, quem transferiu dinheiro só descobre que deu
 * certo entrando no painel — e o intervalo até o Recibo de Mecenato, que
 * depende do proponente, vira silêncio.
 *
 * Como avisarProponente(): falha aqui não desfaz a confirmação.
 */
async function avisarDestinador(donationId) {
  try {
    const { rows } = await pool.query(
      `SELECT d.donation_amount AS amount, d.projeto_titulo, d.pronac,
              u.nome, u.email, u.phone,
              o.name AS org_name, o.primary_color, o.secondary_color, o.logo_url, o.contact_email
         FROM donations d
         JOIN users u ON u.id = d.user_id
         LEFT JOIN organizations o ON o.id = d.organization_id
        WHERE d.id = $1`,
      [donationId]
    );
    if (!rows.length || !rows[0].email) return;
    const r = rows[0];
    await notificadores.destinadorConfirmado(
      { name: r.nome, nome: r.nome, email: r.email, phone: r.phone },
      { amount: r.amount, pronac: r.pronac },
      { title: r.projeto_titulo },
      r.org_name ? { name: r.org_name, primary_color: r.primary_color, secondary_color: r.secondary_color,
                     logo_url: r.logo_url, contact_email: r.contact_email } : null
    );
    console.log(`[conferência] destinador avisado — destinação ${donationId}`);
  } catch (erro) {
    console.error('[conferência] falha ao avisar o destinador:', erro.message);
  }
}

// O teto de dedução vem de `tetos_deducao` — ver src/lib/tetos.js.
//
// Ele era uma constante aqui, outra em calculator.js e uma terceira embutida na
// validação de /distribuir. Três cópias de um número que é TESE JURÍDICA, não
// fato do sistema: a interação entre o art. 18 da Lei 8.313/91 e o teto global
// do art. 22 da Lei 9.532/97 ainda depende de parecer tributário. Enquanto
// morava no código, cada revisão dessa tese seria um deploy.

// ─────────────────────────────────────────────────────────────
// POST /api/donations/rouanet
// Registra destinação para qualquer projeto SALIC (por PRONAC).
// ─────────────────────────────────────────────────────────────
router.post('/rouanet', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    const { pronac, projeto_titulo, donation_amount, fiscal_year } = req.body;
    const userId = req.user.userId;
    const org    = req.organization;

    // `ir_total` era o nome antigo do campo. Ele se lia como "total de
    // rendimentos", e quem integrasse pela API poderia mandar a renda bruta —
    // multiplicando o limite por dez. Renomeado para `ir_devido` na migração
    // 032; o nome antigo segue aceito por um ciclo, para que uma página em
    // cache durante o deploy não quebre.
    const ir_devido = req.body.ir_devido ?? req.body.ir_total;

    // Validações
    if (!pronac || !/^\d{6,7}$/.test(pronac)) {
      return res.status(400).json({ status: 'error', message: 'PRONAC inválido. Deve ter 6 ou 7 dígitos.' });
    }

    if (!ir_devido || ir_devido <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Informe o imposto devido apurado na declaração — deve ser maior que zero.'
      });
    }

    if (!donation_amount || donation_amount <= 0) {
      return res.status(400).json({ status: 'error', message: 'Valor da destinação deve ser maior que zero.' });
    }

    if (!fiscal_year || fiscal_year < 2024) {
      return res.status(400).json({ status: 'error', message: 'Ano fiscal inválido.' });
    }

    // O CPF é pedido AQUI, não no cadastro (migração 040).
    //
    // É neste ponto que ele serve para alguma coisa: vai no Recibo de
    // Mecenato que o proponente emite, e é por ele que a Receita liga a
    // dedução à pessoa. Quem já informou uma vez não informa de novo — o
    // valor guardado na conta é o que vale.
    const donoRes = await client.query('SELECT cpf FROM users WHERE id = $1', [userId]);
    if (!donoRes.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Conta não encontrada.' });
    }
    let cpfDoContribuinte = donoRes.rows[0].cpf || null;

    if (!cpfDoContribuinte) {
      const informado = limpaCPF(req.body.cpf || '');
      if (!informado) {
        return res.status(400).json({
          status: 'error',
          codigo: 'cpf_necessario',
          message: 'Informe seu CPF: ele vai no Recibo de Mecenato e é por ele que a dedução é lançada na sua declaração.'
        });
      }
      if (!cpfValido(informado)) {
        return res.status(400).json({ status: 'error', codigo: 'cpf_invalido', message: 'CPF inválido. Confira os 11 dígitos.' });
      }
      const emUso = await client.query('SELECT id FROM users WHERE cpf = $1 AND id <> $2', [informado, userId]);
      if (emUso.rows.length) {
        return res.status(409).json({
          status: 'error',
          codigo: 'cpf_em_uso',
          message: 'Este CPF já está em outra conta. Entre com ela ou fale com o suporte.'
        });
      }
      await client.query('UPDATE users SET cpf = $1 WHERE id = $2', [informado, userId]);
      cpfDoContribuinte = informado;
    }

    // O teto e o saldo são conferidos mais abaixo, DENTRO da transação e
    // depois de bloquear o contribuinte — ver src/lib/tetos.js.

    // Buscar fundo FNC (Lei Rouanet)
    const fncResult = await client.query(`SELECT id FROM official_funds WHERE code = 'FNC' LIMIT 1`);
    const fncId = fncResult.rows[0]?.id || null;

    // Dados bancários: só do projeto ativo da organização, nunca de outro lugar.
    //
    // Havia aqui uma cadeia de fallbacks — org_projects, depois organizations,
    // depois 'Banco do Brasil' / '001' / '—' escritos no código. A migração 022
    // deixou uma conta inventada na organização padrão, e esta rota a devolvia
    // como destino da transferência. Quem transferisse para ela não teria
    // Recibo de Mecenato e perderia a dedução (Raio-X, risco 01).
    //
    // Regra: conta de captação vem do banco, por tenant, e só de projeto ativo.
    // Sem ela, fora da simulação, a destinação não é registrada — a resposta
    // diz o porquê, para o destinador não transferir para conta nenhuma.
    const opResult = await client.query(
      `SELECT proponente_nome, proponente_cnpj, bank_name, bank_code, bank_agency, bank_account, pix_key, pix_key_type
       FROM org_projects WHERE organization_id = $1 AND is_active = true
       ORDER BY is_featured DESC, created_at DESC LIMIT 1`,
      [org?.id]
    );
    const op = opResult.rows[0];
    const contaPreenchida = Boolean(op && ((op.bank_agency && op.bank_account) || op.pix_key));

    if (!contaPreenchida && process.env.SIMULATION_MODE !== 'true') {
      return res.status(409).json({
        status: 'error',
        codigo: 'conta_captacao_ausente',
        message: !op
          ? 'Esta organização não tem projeto ativo cadastrado. A destinação não foi registrada — não faça nenhuma transferência.'
          : 'A Conta de Captação deste projeto ainda não foi informada pelo proponente. A destinação não foi registrada — não faça nenhuma transferência até a conta aparecer nesta etapa.'
      });
    }

    // ── Teto: dentro da transação, com o contribuinte bloqueado ────────────
    //
    // Antes, a rota somava só as destinações Rouanet, sem lock, com o IR devido
    // que veio nesta requisição, e nem isso em simulação (Raio-X, risco 05).
    // Agora:
    //   - o advisory lock serializa dois registros simultâneos do mesmo CPF;
    //   - o IR devido é FIXADO por ano: vale o menor entre o informado agora e
    //     os já gravados no ano. É autodeclarado; se mudar entre uma
    //     destinação e outra, errar para menos é o lado seguro. Quem informou
    //     a menos cancela a pendente e registra de novo; quem informa a mais
    //     depois não ganha teto;
    //   - saldoDisponivel() soma tudo que já conta contra o MESMO teto,
    //     inclusive por outros mecanismos;
    //   - a regra vale também em simulação. Um teste que não exercita o teto
    //     não testa o que importa.
    const codigoGrupo = org?.incentive_group_code || 'ROUANET';
    const valor = Number(donation_amount);

    await client.query('BEGIN');
    await bloqueiaContribuinte(client, userId);

    const { rows: [anterior] } = await client.query(
      `SELECT MIN(ir_devido) AS minimo FROM donations
        WHERE user_id = $1 AND fiscal_year = $2 AND status <> 'cancelled'`,
      [userId, fiscal_year]
    );
    const irBase = anterior?.minimo != null
      ? Math.min(Number(ir_devido), parseFloat(anterior.minimo))
      : Number(ir_devido);

    const saldo = await saldoDisponivel(userId, irBase, fiscal_year, codigoGrupo, client);
    const pct = saldo.teto.percentual;

    if (saldo.indisponivel) {
      await client.query('ROLLBACK');
      return res.status(503).json({
        status: 'error',
        message: 'Não foi possível conferir o que você já destinou neste ano. Nada foi registrado; tente novamente em instantes.'
      });
    }

    if (valor > saldo.disponivel) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        codigo: 'acima_do_teto',
        message: saldo.ja_destinado > 0
          ? `Valor acima do que ainda cabe no teto de ${pct}% do IR devido (R$ ${saldo.limite.toFixed(2)}). ` +
            `Já destinado em ${fiscal_year}: R$ ${saldo.ja_destinado.toFixed(2)}. Disponível: R$ ${saldo.disponivel.toFixed(2)}.`
          : `Valor excede o limite de ${pct}% do IR devido (R$ ${saldo.limite.toFixed(2)}).`,
        saldo: {
          teto_percentual: pct,
          base_legal:      saldo.teto.base_legal,
          ir_devido_base:  irBase,
          limite:          saldo.limite,
          ja_destinado:    saldo.ja_destinado,
          disponivel:      saldo.disponivel
        }
      });
    }

    const result = await client.query(`
      INSERT INTO donations (user_id, pronac, projeto_titulo, official_fund_id, organization_id, ir_devido, donation_amount, fiscal_year, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
      RETURNING id, created_at
    `, [userId, pronac, projeto_titulo || `Projeto PRONAC ${pronac}`, fncId, org?.id || null, irBase, valor, fiscal_year]);

    const donation = result.rows[0];

    await client.query('UPDATE users SET total_donated = total_donated + $1 WHERE id = $2', [donation_amount, userId]);

    await client.query('COMMIT');

    // Notificações (não bloqueia resposta)
    pool.query('SELECT nome, email, phone FROM users WHERE id = $1', [userId])
      .then(({ rows }) => {
        const user = rows[0];
        if (!user) return;
        notifyDestinationRegistered(
          { name: user.nome, email: user.email, phone: user.phone },
          { amount: donation_amount },
          { title: projeto_titulo || `Projeto PRONAC ${pronac}` },
          org
        ).catch(() => {});
      }).catch(() => {});

    res.status(201).json({
      status: 'success',
      message: 'Destinação Rouanet registrada com sucesso!',
      donation: {
        id:               donation.id,
        pronac,
        projeto_titulo:   projeto_titulo || `Projeto PRONAC ${pronac}`,
        ir_devido:        irBase,
        donation_amount:  valor,
        limite_rouanet:   saldo.limite,
        percentage_of_ir: Math.round((valor / irBase) * 10000) / 100,
        // O que sobra do teto depois desta destinação, e de onde o teto vem.
        saldo: {
          teto_percentual: pct,
          base_legal:      saldo.teto.base_legal,
          ir_devido_base:  irBase,
          limite:          saldo.limite,
          ja_destinado:    Math.round((saldo.ja_destinado + valor) * 100) / 100,
          disponivel:      Math.round((saldo.disponivel - valor) * 100) / 100
        },
        fiscal_year,
        status:           'pending',
        created_at:       donation.created_at,
        // Dados bancários do projeto ativo, exatamente como estão no cadastro.
        // Campo vazio vem vazio: em simulação isso é permitido (o projeto
        // semeado da Casa Azul não tem conta de propósito) e a tela mostra
        // "—"; fora da simulação a rota já recusou acima.
        banco: {
          beneficiary_name: op?.proponente_nome || null,
          beneficiary_cnpj: op?.proponente_cnpj || null,
          bank_name:        op?.bank_name       || null,
          bank_code:        op?.bank_code       || null,
          bank_agency:      op?.bank_agency     || null,
          bank_account:     op?.bank_account    || null,
          pix_key:          op?.pix_key         || null,
          pix_key_type:     op?.pix_key_type    || null,
          conta_preenchida: contaPreenchida,
          instrucoes:       'Identificar no comprovante: nome completo, CPF e PRONAC do projeto.'
        }
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao registrar destinação Rouanet:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno ao registrar destinação.' });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CONFERÊNCIA DA DESTINAÇÃO
//
// O passo que faltava para o sistema funcionar fora da simulação. Até aqui, a
// única rota que marcava `confirmed` era /:id/simulate, que recusa quando
// SIMULATION_MODE não é 'true' — então em produção o destinador registrava,
// transferia, anexava o comprovante, e a destinação parava ali para sempre.
//
// A conferência é humana de propósito: o dinheiro cai na Conta de Captação do
// projeto, no Banco do Brasil, fora do alcance da plataforma. Não há como
// conciliar sozinho sem integração bancária. Alguém abre o extrato, confere
// valor e data, e confirma — e fica registrado quem foi.
//
// Estas rotas vêm ANTES das que usam /:id. Declaradas depois, o Express
// entenderia "conferencia" como um identificador.
// ═══════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────
// GET /api/donations/conferencia — o que aguarda conferência
//
// Traz o comprovante bancário e o valor declarado lado a lado: é essa
// comparação que a pessoa precisa fazer, e ela não deveria ter que abrir duas
// telas para isso.
// ───────────────────────────────────────────────────────────────────────────
router.get('/conferencia', authenticateToken, async (req, res) => {
  try {
    const orgId = req.organization?.id || req.user?.orgId;
    if (!orgId) {
      return res.status(400).json({ status: 'error', message: 'Organização não identificada.' });
    }
    if (!(await podeGerirOrganizacao(req.user.userId, orgId, req.user))) {
      return res.status(403).json({
        status: 'error',
        message: 'Sem permissão para conferir destinações desta organização.'
      });
    }

    const { rows } = await pool.query(
      `SELECT d.id, d.donation_amount, d.fiscal_year, d.pronac, d.projeto_titulo,
              d.created_at, d.status, d.rejection_reason, d.rejected_at,
              d.receipt_filename,
              -- Caminho autenticado: a pasta de uploads não é publicada, e o
              -- comprovante traz nome, CPF e valor.
              CASE WHEN d.receipt_url IS NOT NULL
                   THEN '/api/uploads/receipt/' || d.id || '/arquivo' END AS comprovante_url,
              u.nome, u.cpf, u.email
         FROM donations d
         JOIN users u ON u.id = d.user_id
        WHERE d.organization_id = $1
          AND d.status = 'awaiting_confirmation'
        ORDER BY d.created_at`,
      [orgId]
    );

    res.json({ status: 'success', total: rows.length, aguardando: rows });
  } catch (erro) {
    console.error('Erro na fila de conferência:', erro.message);
    res.status(500).json({ status: 'error', message: 'Erro ao listar destinações a conferir.' });
  }
});

/**
 * Carrega a destinação e confere a permissão de quem está agindo.
 * Devolve { erro, destinacao } — quem chama só precisa repassar o erro.
 */
async function carregaParaConferencia(req, id) {
  if (!isValidUUID(id)) {
    return { erro: { codigo: 400, mensagem: 'ID inválido.' } };
  }

  const { rows } = await pool.query(
    'SELECT id, organization_id, status, user_id, donation_amount FROM donations WHERE id = $1',
    [id]
  );
  if (!rows.length) {
    return { erro: { codigo: 404, mensagem: 'Destinação não encontrada.' } };
  }
  const destinacao = rows[0];

  if (!(await podeGerirOrganizacao(req.user.userId, destinacao.organization_id, req.user))) {
    return { erro: { codigo: 403, mensagem: 'Sem permissão para conferir esta destinação.' } };
  }
  return { destinacao };
}

// ───────────────────────────────────────────────────────────────────────────
// POST /api/donations/:id/confirmar — o comprovante bate; libera o ciclo
// ───────────────────────────────────────────────────────────────────────────
router.post('/:id/confirmar', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const observacao = String(req.body?.observacao || '').slice(0, 1000) || null;

  try {
    const { erro, destinacao } = await carregaParaConferencia(req, id);
    if (erro) return res.status(erro.codigo).json({ status: 'error', message: erro.mensagem });

    // Já confirmada não é erro de quem clicou — é dupla conferência, ou dois
    // gestores olhando a mesma fila. Responde o estado atual sem reprocessar,
    // porque reprocessar reenviaria o aviso ao proponente.
    if (['confirmed', 'awaiting_mecenato', 'mecenato_issued'].includes(destinacao.status)) {
      return res.json({
        status: 'success',
        message: 'Esta destinação já estava confirmada.',
        ja_confirmada: true
      });
    }

    if (!['pending', 'awaiting_confirmation'].includes(destinacao.status)) {
      return res.status(409).json({
        status: 'error',
        message: `Não é possível confirmar uma destinação com situação "${destinacao.status}".`
      });
    }

    const { rows } = await pool.query(
      `UPDATE donations
          SET status            = 'confirmed',
              confirmed_at      = NOW(),
              confirmed_by      = $2,
              confirmation_note = $3,
              -- limpa uma recusa anterior: o comprovante novo foi aceito
              rejected_at       = NULL,
              rejected_by       = NULL,
              rejection_reason  = NULL
        WHERE id = $1
          AND status IN ('pending', 'awaiting_confirmation')
        RETURNING id, donation_amount, projeto_titulo, confirmed_at`,
      [id, req.user.userId, observacao]
    );

    // Perdeu a corrida para outra conferência simultânea. O resultado que
    // interessa — está confirmada — é o mesmo.
    if (!rows.length) {
      return res.json({
        status: 'success',
        message: 'Esta destinação já estava confirmada.',
        ja_confirmada: true
      });
    }

    console.log(`[conferência] destinação ${id} confirmada por ${req.user.userId}`);

    // Não aguarda: quem confere não deve esperar e-mail sair para ver a fila
    // atualizar. É a mesma função que a rota de simulação usa — ponto único.
    avisarProponente(id);
    avisarDestinador(id);

    res.json({
      status: 'success',
      message: 'Destinação confirmada. O proponente foi avisado para emitir o Recibo de Mecenato.',
      donation: rows[0]
    });
  } catch (erro) {
    console.error('Erro ao confirmar destinação:', erro.message);
    res.status(500).json({ status: 'error', message: 'Erro ao confirmar a destinação.' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// POST /api/donations/:id/recusar — o comprovante não bate
//
// Volta para `pending`, não para um estado morto: a destinação continua de pé,
// só o comprovante estava errado. O motivo é obrigatório — devolver sem dizer
// por quê deixa quem já transferiu dinheiro sem saber o que corrigir.
// ───────────────────────────────────────────────────────────────────────────
router.post('/:id/recusar', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const motivo = String(req.body?.motivo || '').trim().slice(0, 1000);

  if (motivo.length < 10) {
    return res.status(400).json({
      status: 'error',
      message: 'Descreva o motivo da recusa — é o que o destinador vai ler para corrigir.'
    });
  }

  try {
    const { erro, destinacao } = await carregaParaConferencia(req, id);
    if (erro) return res.status(erro.codigo).json({ status: 'error', message: erro.mensagem });

    if (destinacao.status !== 'awaiting_confirmation') {
      return res.status(409).json({
        status: 'error',
        message: `Só é possível recusar o comprovante de uma destinação aguardando conferência (situação atual: "${destinacao.status}").`
      });
    }

    const { rows } = await pool.query(
      `UPDATE donations
          SET status           = 'pending',
              rejected_at      = NOW(),
              rejected_by      = $2,
              rejection_reason = $3,
              -- o arquivo recusado sai do caminho: fica só o motivo, e o
              -- destinador anexa outro
              receipt_url      = NULL,
              receipt_filename = NULL
        WHERE id = $1 AND status = 'awaiting_confirmation'
        RETURNING id`,
      [id, req.user.userId, motivo]
    );

    if (!rows.length) {
      return res.status(409).json({
        status: 'error',
        message: 'A situação desta destinação mudou. Recarregue a fila.'
      });
    }

    console.log(`[conferência] comprovante da destinação ${id} recusado por ${req.user.userId}`);

    res.json({
      status: 'success',
      message: 'Comprovante recusado. O destinador poderá enviar outro.'
    });
  } catch (erro) {
    console.error('Erro ao recusar comprovante:', erro.message);
    res.status(500).json({ status: 'error', message: 'Erro ao recusar o comprovante.' });
  }
});

// DELETE /api/donations/:id — cancela destinação pendente (usuário pode remover simulação)
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.userId;

  if (!isValidUUID(id)) {
    return res.status(400).json({ status: 'error', message: 'ID inválido.' });
  }

  try {
    const result = await pool.query(
      `UPDATE donations SET status = 'cancelled'
       WHERE id = $1 AND user_id = $2 AND status = 'pending'
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Destinação não encontrada ou não pode ser cancelada.' });
    }

    res.json({ status: 'success', message: 'Destinação cancelada.' });
  } catch (error) {
    console.error('Erro ao cancelar destinação:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// POST /api/donations/:id/simulate — confirma pagamento fictício (apenas TEST_MODE)
router.post('/:id/simulate', authenticateToken, async (req, res) => {
  if (process.env.SIMULATION_MODE !== 'true') {
    return res.status(403).json({ status: 'error', message: 'Modo simulação não está ativo.' });
  }

  const { id } = req.params;
  const userId  = req.user.userId;

  if (!isValidUUID(id)) {
    return res.status(400).json({ status: 'error', message: 'ID inválido.' });
  }

  try {
    const result = await pool.query(
      `UPDATE donations
       SET status = 'confirmed', confirmed_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'pending'
       RETURNING id, donation_amount, projeto_titulo`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Destinação não encontrada ou já processada.' });
    }

    // Nao aguarda: o destinador nao deve esperar e-mail sair para ver a tela.
    avisarProponente(id);
    avisarDestinador(id);

    res.json({
      status:  'success',
      message: 'Pagamento fictício registrado. Comprovante disponível.',
      donation: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao simular pagamento:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// GET /api/donations - Listar destinações Rouanet do usuário
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { fiscal_year, status, limit = 20, offset = 0 } = req.query;

    let whereConditions = ['d.user_id = $1'];
    let params = [userId];
    let paramIndex = 2;

    if (fiscal_year) {
      whereConditions.push(`d.fiscal_year = $${paramIndex++}`);
      params.push(parseInt(fiscal_year));
    }

    if (status) {
      whereConditions.push(`d.status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause = 'WHERE ' + whereConditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM donations d ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(`
      SELECT
        d.id,
        d.pronac,
        d.projeto_titulo,
        d.ir_devido,
        d.donation_amount,
        d.fiscal_year,
        d.status,
        d.created_at,
        d.confirmed_at,
        -- receipt_url é a coluna que o upload grava; receipt_file_path é de uma
        -- migração anterior e ficou vazia. O mapeamento abaixo lia receipt_url
        -- sem que ele estivesse no SELECT, então vinha undefined sempre.
        d.receipt_url,
        d.receipt_file_path,
        -- Ciclo do Recibo de Mecenato, para a linha do tempo do destinador.
        -- Vem junto da listagem de propósito: uma requisição por card só para
        -- saber se o recibo saiu seria um pedido por destinação na tela.
        d.proponente_notified_at,
        d.mecenato_issued_at,
        d.mecenato_url,
        -- Recusa do comprovante. Sem trazer isto, a devolução é invisível: o
        -- destinador vê a destinação voltar para "aguardando pagamento" e não
        -- descobre que precisa reenviar, nem o quê corrigir.
        d.rejected_at,
        d.rejection_reason,
        o.name             AS proponente_nome,
        o.contact_person   AS proponente_responsavel,
        o.contact_email    AS proponente_email,
        o.contact_whatsapp AS proponente_whatsapp,
        o.mecenato_prazo_dias,
        f.code AS fund_code,
        f.name AS fund_name
      FROM donations d
      LEFT JOIN official_funds f ON d.official_fund_id = f.id
      LEFT JOIN organizations o ON o.id = d.organization_id
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, parseInt(limit), parseInt(offset)]);

    const totalsResult = await pool.query(`
      SELECT
        COALESCE(SUM(donation_amount), 0) AS total_donated,
        COUNT(*) AS total_donations
      FROM donations d
      ${whereClause} AND d.status != 'cancelled'
    `, params);

    const totals = totalsResult.rows[0];

    res.json({
      status: 'success',
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      summary: {
        total_donated:    parseFloat(totals.total_donated),
        total_donations:  parseInt(totals.total_donations)
      },
      donations: result.rows.map(d => ({
        id:               d.id,
        pronac:           d.pronac,
        projeto_titulo:   d.projeto_titulo,
        ir_devido:        parseFloat(d.ir_devido),
        donation_amount:  parseFloat(d.donation_amount),
        percentage_of_ir: parseFloat(d.ir_devido) > 0
          ? Math.round((parseFloat(d.donation_amount) / parseFloat(d.ir_devido)) * 10000) / 100
          : 0,
        fiscal_year:      d.fiscal_year,
        status:           d.status,
        created_at:       d.created_at,
        confirmed_at:     d.confirmed_at,
        receipt_url:      d.receipt_url,
        recusa: d.rejected_at
          ? { em: d.rejected_at, motivo: d.rejection_reason }
          : null,
        // O recibo em si sai por rota autenticada — aqui vai só o suficiente
        // para a tela dizer em que pé está e a quem recorrer.
        mecenato: {
          emitido:       Boolean(d.mecenato_url),
          emitido_em:    d.mecenato_issued_at,
          download_url:  d.mecenato_url ? `/api/mecenato/${d.id}/arquivo` : null,
          notificado_em: d.proponente_notified_at,
          prazo_dias:    d.mecenato_prazo_dias,
          proponente: {
            nome:        d.proponente_nome,
            responsavel: d.proponente_responsavel,
            email:       d.proponente_email,
            whatsapp:    d.proponente_whatsapp
          }
        },
        fund: { code: d.fund_code, name: d.fund_name }
      }))
    });

  } catch (error) {
    console.error('Erro ao listar destinações:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno ao listar destinações.' });
  }
});

// GET /api/donations/:id - Detalhes de uma destinação
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!isValidUUID(id)) {
      return res.status(400).json({ status: 'error', message: 'ID inválido.' });
    }

    const result = await pool.query(`
      SELECT
        d.*,
        f.code  AS fund_code,
        f.name  AS fund_name,
        f.cnpj  AS fund_cnpj,
        f.bank_code,
        f.agency,
        f.account
      FROM donations d
      LEFT JOIN official_funds f ON d.official_fund_id = f.id
      WHERE d.id = $1 AND d.user_id = $2
    `, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Destinação não encontrada.' });
    }

    const d = result.rows[0];

    res.json({
      status: 'success',
      donation: {
        id:               d.id,
        pronac:           d.pronac,
        projeto_titulo:   d.projeto_titulo,
        ir_devido:        parseFloat(d.ir_devido),
        donation_amount:  parseFloat(d.donation_amount),
        percentage_of_ir: parseFloat(d.ir_devido) > 0
          ? Math.round((parseFloat(d.donation_amount) / parseFloat(d.ir_devido)) * 10000) / 100
          : 0,
        fiscal_year:      d.fiscal_year,
        status:           d.status,
        created_at:       d.created_at,
        fund: {
          code:      d.fund_code,
          name:      d.fund_name,
          cnpj:      d.fund_cnpj,
          bank_code: d.bank_code,
          agency:    d.agency,
          account:   d.account
        }
      }
    });

  } catch (error) {
    console.error('Erro ao buscar destinação:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno ao buscar destinação.' });
  }
});

// GET /api/donations/:id/comprovante - Gerar PDF do comprovante
router.get('/:id/comprovante', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!isValidUUID(id)) {
      return res.status(400).json({ status: 'error', message: 'ID inválido.' });
    }

    const result = await pool.query(`
      SELECT
        d.*,
        u.nome  AS user_nome,
        u.cpf   AS user_cpf,
        u.email AS user_email,
        f.name  AS fund_name,
        f.code  AS fund_code,
        f.cnpj  AS fund_cnpj,
        f.bank_code,
        f.agency,
        f.account
      FROM donations d
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN official_funds f ON d.official_fund_id = f.id
      WHERE d.id = $1 AND d.user_id = $2
    `, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Destinação não encontrada.' });
    }

    const row = result.rows[0];

    if (row.status === 'cancelled') {
      return res.status(400).json({
        status: 'error',
        message: 'Comprovante não disponível para destinações canceladas.'
      });
    }

    const donation = {
      id:             row.id,
      donation_amount: parseFloat(row.donation_amount),
      ir_devido:      parseFloat(row.ir_devido),
      fiscal_year:    row.fiscal_year,
      created_at:     row.created_at,
      confirmed_at:   row.confirmed_at
    };

    const user    = { nome: row.user_nome, cpf: row.user_cpf, email: row.user_email };
    const project = { title: row.projeto_titulo, code: row.pronac };
    const fund    = {
      name:      row.fund_name,
      code:      row.fund_code,
      cnpj:      row.fund_cnpj,
      bank_code: row.bank_code,
      agency:    row.agency,
      account:   row.account
    };

    const doc = gerarComprovante(donation, user, project, fund);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="comprovante-rouanet-${id.substring(0, 8)}.pdf"`);
    doc.pipe(res);
    doc.end();

  } catch (error) {
    console.error('Erro ao gerar comprovante:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno ao gerar comprovante.' });
  }
});

export default router;
