/**
 * Cadastro de interessados — LGPD.
 *
 * Quem se cadastra aqui ainda não é usuário: quer receber aviso de prazo do IR
 * e de projetos novos. A base legal é o consentimento (art. 7º I), e todo o
 * desenho deste arquivo existe por causa de três artigos:
 *
 *   art. 6º III  — minimização: só e-mail é obrigatório. Sem CPF, sem senha.
 *   art. 8º §2º  — o ônus de provar o consentimento é do controlador. Por isso
 *                  guardamos o texto exibido, a versão da política, IP, UA e
 *                  carimbo de tempo, num log que só recebe INSERT.
 *   art. 8º §5º  — revogar tem que ser tão fácil quanto consentir. Daí o token
 *                  permanente e o link de um clique, sem login.
 *
 * E o art. 18, que garante acesso, correção, portabilidade e eliminação: as
 * rotas /meus-dados atendem isso sem obrigar ninguém a criar conta só para
 * exercer um direito.
 */

import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import pool from '../../config/database.js';
import { POLITICA_VERSAO, ENCARREGADO } from '../config/lgpd.js';
import { authenticateToken } from '../middleware/auth.js';
import { podeGerirOrganizacao } from '../lib/permissoes.js';
import * as emailService from '../services/emailService.js';

const router = express.Router();

// Cadastro é rota aberta que dispara e-mail. Sem limite, vira ferramenta de
// inundar caixa alheia usando nosso domínio como remetente.
const cadastroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { status: 'error', message: 'Muitas tentativas de cadastro. Tente novamente mais tarde.' }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const token = () => crypto.randomBytes(32).toString('hex');

/**
 * Registra o evento no log imutável.
 *
 * Nunca lança: perder o registro de auditoria é ruim, mas derrubar a operação
 * do titular por causa dele é pior — inclusive porque a operação pode ser
 * justamente uma revogação, que não pode falhar.
 */
async function registraEvento(client, subscriberId, evento, dados = {}) {
  try {
    await (client || pool).query(
      `INSERT INTO subscriber_consent_log
         (subscriber_id, evento, consent_prazos, consent_projetos, consent_whatsapp,
          consent_text, consent_policy_version, ip, user_agent, detalhe)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [subscriberId, evento,
       dados.prazos ?? null, dados.projetos ?? null, dados.whatsapp ?? null,
       dados.texto ?? null, dados.versao ?? null,
       dados.ip ?? null, dados.userAgent ?? null, dados.detalhe ?? null]
    );
  } catch (erro) {
    console.error('[lgpd] falha ao registrar evento de consentimento:', erro.message);
  }
}

const contexto = req => ({
  ip: req.ip || null,
  userAgent: (req.get('user-agent') || '').slice(0, 500)
});

// ───────────────────────────────────────────────────────────────────────────
// POST /api/interessados — cadastro
//
// Responde igual para e-mail novo e e-mail já cadastrado. Diferenciar
// transformaria a rota num verificador de "esta pessoa está na base?", que é
// vazamento de dado pessoal para qualquer um que saiba um endereço.
// ───────────────────────────────────────────────────────────────────────────
router.post('/', cadastroLimiter, async (req, res) => {
  const { email, nome, phone, orgao, consent_prazos, consent_projetos, consent_whatsapp, consent_text } = req.body || {};
  const { ip, userAgent } = contexto(req);

  const emailLimpo = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(emailLimpo) || emailLimpo.length > 254) {
    return res.status(400).json({ status: 'error', message: 'Informe um e-mail válido.' });
  }

  const prazos   = Boolean(consent_prazos);
  const projetos = Boolean(consent_projetos);
  const whatsapp = Boolean(consent_whatsapp);

  // Consentimento genérico é nulo (art. 8º §4º). Se a pessoa não escolheu
  // nenhuma finalidade, não há a que consentir — e cadastrar assim mesmo seria
  // tratar dado sem base legal.
  if (!prazos && !projetos) {
    return res.status(400).json({
      status: 'error',
      message: 'Escolha ao menos um tipo de comunicação que deseja receber.'
    });
  }

  // WhatsApp é canal, não finalidade: sem telefone não há o que consentir.
  const telefone = String(phone || '').replace(/\D/g, '');
  const querWhats = whatsapp && telefone.length >= 10;

  const confirmToken = token();
  const accessToken  = token();
  const orgId = req.organization?.id || null;

  // Uma resposta só, para os três desfechos abaixo. Se a mensagem variasse
  // entre "cadastro criado" e "você já estava cadastrado", esta rota viraria um
  // verificador de presença na base para quem souber um endereço qualquer.
  const RESPOSTA = {
    status: 'success',
    message: 'Se este e-mail puder ser cadastrado, você receberá uma mensagem para confirmar. ' +
             'O cadastro só vale depois desse clique.'
  };

  try {
    // Quem foi anonimizado não aparece aqui: a eliminação reescreve o próprio
    // e-mail. Um pedido novo com o mesmo endereço nasce como cadastro novo, que
    // é o correto — o vínculo anterior foi eliminado a pedido do titular.
    const { rows: existentes } = await pool.query(
      'SELECT id, confirmed_at, access_token FROM subscribers WHERE email = $1',
      [emailLimpo]
    );
    const atual = existentes[0];

    // ── Já confirmado ──────────────────────────────────────────────────────
    // Não aplica nada vindo daqui. Quem já confirmou tem um vínculo
    // estabelecido, e este endpoint é aberto: aceitar a alteração deixaria
    // qualquer um que saiba o endereço reescrever as preferências da pessoa.
    // O caminho legítimo é o link autenticado, que só chega na caixa dela.
    if (atual && atual.confirmed_at) {
      await emailService.sendGerenciarPreferenciasEmail(
        req.organization, { email: emailLimpo }, atual.access_token
      ).catch(erro => console.error('[lgpd] falha ao enviar link de preferências:', erro.message));
      return res.status(200).json(RESPOSTA);
    }

    let subscriberId;

    if (atual) {
      // ── Existe mas nunca confirmou ───────────────────────────────────────
      // Ainda não há vínculo estabelecido, então este é um pedido novo e pode
      // reescrever o anterior. E nada foi enviado a essa pessoa até aqui.
      const { rows } = await pool.query(
        `UPDATE subscribers SET
           nome = COALESCE($2, nome), phone = $3, orgao = COALESCE($4, orgao),
           organization_id        = COALESCE($5, organization_id),
           consent_prazos = $6, consent_projetos = $7, consent_whatsapp = $8,
           consent_text = $9, consent_policy_version = $10,
           consent_ip = $11, consent_user_agent = $12, consent_at = NOW(),
           confirm_token = $13, confirm_token_expires = (NOW() + INTERVAL '7 days')::timestamp,
           last_interaction_at = NOW(), updated_at = NOW()
         WHERE id = $1
         RETURNING id`,
        [atual.id, nome || null, querWhats ? telefone : null, orgao || null, orgId,
         prazos, projetos, querWhats, consent_text || null, POLITICA_VERSAO,
         ip, userAgent, confirmToken]
      );
      subscriberId = rows[0].id;
    } else {
      const { rows } = await pool.query(
        `INSERT INTO subscribers
           (email, nome, phone, organization_id, orgao,
            consent_prazos, consent_projetos, consent_whatsapp,
            consent_text, consent_policy_version, consent_ip, consent_user_agent, consent_at,
            confirm_token, confirm_token_expires, access_token, last_interaction_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),$13,(NOW() + INTERVAL '7 days')::timestamp,$14,NOW())
         RETURNING id`,
        [emailLimpo, nome || null, querWhats ? telefone : null, orgId, orgao || null,
         prazos, projetos, querWhats, consent_text || null, POLITICA_VERSAO,
         ip, userAgent, confirmToken, accessToken]
      );
      subscriberId = rows[0].id;
    }

    await registraEvento(null, subscriberId, 'granted', {
      prazos, projetos, whatsapp: querWhats,
      texto: consent_text, versao: POLITICA_VERSAO, ip, userAgent
    });

    // Duplo opt-in: nada é enviado antes do clique. Sem isso, qualquer um
    // cadastra o e-mail de outra pessoa e ela passa a receber o que não pediu.
    await emailService.sendConfirmacaoCadastroEmail(
      req.organization, { email: emailLimpo, nome }, confirmToken
    ).catch(erro => console.error('[lgpd] falha ao enviar confirmação:', erro.message));

    res.status(201).json(RESPOSTA);
  } catch (erro) {
    // 23505 = dois cadastros do mesmo e-mail chegando ao mesmo tempo. O
    // segundo perde a corrida; do ponto de vista de quem pediu, nada mudou.
    if (erro.code === '23505') return res.status(200).json(RESPOSTA);
    console.error('Erro ao cadastrar interessado:', erro.message);
    res.status(500).json({ status: 'error', message: 'Não foi possível concluir o cadastro.' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// POST /api/interessados/confirmar/:token — duplo opt-in
// ───────────────────────────────────────────────────────────────────────────
router.post('/confirmar/:token', async (req, res) => {
  const { ip, userAgent } = contexto(req);
  try {
    const { rows } = await pool.query(
      `UPDATE subscribers
          SET confirmed_at          = COALESCE(confirmed_at, NOW()),
              confirm_token         = NULL,
              confirm_token_expires = NULL,
              revoked_at            = NULL,
              last_interaction_at   = NOW(),
              updated_at            = NOW()
        WHERE confirm_token = $1
          -- NOW() e timestamptz e a coluna e timestamp. O Postgres converte
          -- sozinho usando o fuso da sessao, o que faz a validade do link
          -- depender de uma configuracao do servidor. Explicito nao depende.
          AND confirm_token_expires > NOW()::timestamp
        RETURNING id, email, nome, access_token,
                  consent_prazos, consent_projetos, consent_whatsapp`,
      [req.params.token]
    );

    if (!rows.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Este link de confirmação é inválido ou expirou. Faça o cadastro novamente.'
      });
    }

    const s = rows[0];
    await registraEvento(null, s.id, 'confirmed', {
      prazos: s.consent_prazos, projetos: s.consent_projetos, whatsapp: s.consent_whatsapp,
      versao: POLITICA_VERSAO, ip, userAgent
    });

    res.json({
      status: 'success',
      message: 'Cadastro confirmado.',
      // Devolvido para que a página possa oferecer, ali mesmo, o link de
      // gerenciar e o de descadastrar — sem obrigar a esperar o próximo e-mail.
      access_token: s.access_token,
      nome: s.nome
    });
  } catch (erro) {
    console.error('Erro ao confirmar cadastro:', erro.message);
    res.status(500).json({ status: 'error', message: 'Erro ao confirmar o cadastro.' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// POST /api/interessados/descadastrar/:token — revogação (art. 8º §5º)
//
// É POST, não GET, de propósito. Scanners de e-mail corporativo e o
// pré-carregamento de link do navegador visitam URLs sem que ninguém tenha
// clicado — com GET, a pessoa seria descadastrada sozinha e nunca saberia por
// quê. A página de descadastro faz o POST com um clique.
// ───────────────────────────────────────────────────────────────────────────
router.post('/descadastrar/:token', async (req, res) => {
  const { ip, userAgent } = contexto(req);
  const motivo = String(req.body?.motivo || '').slice(0, 500) || null;
  try {
    const { rows } = await pool.query(
      `UPDATE subscribers
          SET revoked_at          = NOW(),
              revoke_reason       = $2,
              consent_prazos      = FALSE,
              consent_projetos    = FALSE,
              consent_whatsapp    = FALSE,
              last_interaction_at = NOW(),
              updated_at          = NOW()
        WHERE access_token = $1 AND anonymized_at IS NULL
        RETURNING id, email`,
      [req.params.token, motivo]
    );

    if (!rows.length) {
      return res.status(404).json({ status: 'error', message: 'Link inválido.' });
    }

    await registraEvento(null, rows[0].id, 'revoked', {
      prazos: false, projetos: false, whatsapp: false,
      versao: POLITICA_VERSAO, ip, userAgent, detalhe: motivo
    });

    res.json({
      status: 'success',
      message: 'Consentimento revogado. Você não receberá mais nossas comunicações.'
    });
  } catch (erro) {
    console.error('Erro ao revogar consentimento:', erro.message);
    res.status(500).json({ status: 'error', message: 'Erro ao processar a revogação.' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/interessados/meus-dados/:token — art. 18, I, II e V
//
// Acesso, confirmação de tratamento e portabilidade. Formato aberto (JSON),
// como exige o art. 18 V, e sem exigir criação de conta: obrigar alguém a se
// cadastrar para exercer um direito seria criar obstáculo ao próprio direito.
// ───────────────────────────────────────────────────────────────────────────
router.get('/meus-dados/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.email, s.nome, s.phone, s.orgao,
              s.consent_prazos, s.consent_projetos, s.consent_whatsapp,
              s.consent_text, s.consent_policy_version, s.consent_at,
              s.confirmed_at, s.revoked_at, s.created_at, s.last_interaction_at,
              o.name AS organizacao
         FROM subscribers s
         LEFT JOIN organizations o ON o.id = s.organization_id
        WHERE s.access_token = $1 AND s.anonymized_at IS NULL`,
      [req.params.token]
    );
    if (!rows.length) {
      return res.status(404).json({ status: 'error', message: 'Link inválido.' });
    }
    const s = rows[0];

    const { rows: historico } = await pool.query(
      `SELECT evento, consent_prazos, consent_projetos, consent_whatsapp,
              consent_policy_version, created_at
         FROM subscriber_consent_log
        WHERE subscriber_id = $1
        ORDER BY created_at`,
      [s.id]
    );

    await registraEvento(null, s.id, 'exported', { ...contexto(req), versao: POLITICA_VERSAO });

    res.json({
      status: 'success',
      titular: {
        email: s.email, nome: s.nome, telefone: s.phone, orgao: s.orgao,
        organizacao_origem: s.organizacao
      },
      consentimento_atual: {
        avisos_de_prazo: s.consent_prazos,
        novos_projetos:  s.consent_projetos,
        whatsapp:        s.consent_whatsapp,
        concedido_em:    s.consent_at,
        confirmado_em:   s.confirmed_at,
        revogado_em:     s.revoked_at,
        texto_aceito:    s.consent_text,
        versao_politica: s.consent_policy_version
      },
      historico,
      // O art. 18 dá direito a saber com quem os dados foram compartilhados.
      compartilhamento: 'Nenhum. Os dados deste cadastro não são compartilhados com terceiros, ' +
                        'salvo os prestadores de infraestrutura e envio de e-mail necessários à operação.',
      encarregado: ENCARREGADO
    });
  } catch (erro) {
    console.error('Erro ao exportar dados do titular:', erro.message);
    res.status(500).json({ status: 'error', message: 'Erro ao recuperar seus dados.' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// PATCH /api/interessados/meus-dados/:token — art. 18 III (correção)
// ───────────────────────────────────────────────────────────────────────────
router.patch('/meus-dados/:token', async (req, res) => {
  const { nome, phone, orgao, consent_prazos, consent_projetos, consent_whatsapp } = req.body || {};
  const { ip, userAgent } = contexto(req);

  const prazos   = Boolean(consent_prazos);
  const projetos = Boolean(consent_projetos);
  const telefone = phone === undefined ? undefined : String(phone || '').replace(/\D/g, '');
  const querWhats = Boolean(consent_whatsapp) && (telefone ? telefone.length >= 10 : true);

  try {
    const { rows } = await pool.query(
      `UPDATE subscribers
          SET nome                = COALESCE($2, nome),
              phone               = COALESCE($3, phone),
              orgao               = COALESCE($4, orgao),
              consent_prazos      = $5,
              consent_projetos    = $6,
              consent_whatsapp    = $7,
              -- Desmarcar tudo é revogar. Manter o cadastro "ativo" sem
              -- nenhuma finalidade seria guardar dado sem base legal.
              revoked_at          = CASE WHEN $5 OR $6 THEN NULL ELSE NOW() END,
              last_interaction_at = NOW(),
              updated_at          = NOW()
        WHERE access_token = $1 AND anonymized_at IS NULL
        RETURNING id`,
      [req.params.token, nome ?? null, telefone ?? null, orgao ?? null, prazos, projetos, querWhats]
    );
    if (!rows.length) {
      return res.status(404).json({ status: 'error', message: 'Link inválido.' });
    }

    await registraEvento(null, rows[0].id, prazos || projetos ? 'updated' : 'revoked', {
      prazos, projetos, whatsapp: querWhats, versao: POLITICA_VERSAO, ip, userAgent
    });

    res.json({ status: 'success', message: 'Preferências atualizadas.' });
  } catch (erro) {
    console.error('Erro ao atualizar preferências:', erro.message);
    res.status(500).json({ status: 'error', message: 'Erro ao atualizar as preferências.' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// DELETE /api/interessados/meus-dados/:token — art. 18 VI (eliminação)
//
// Anonimiza em vez de apagar a linha. O art. 16 permite conservar o mínimo
// para cumprimento de obrigação legal, e o log de consentimento é justamente
// a prova de que houve consentimento e de que ele foi eliminado a pedido —
// apagar tudo destruiria a prova de ter atendido o pedido.
// ───────────────────────────────────────────────────────────────────────────
router.delete('/meus-dados/:token', async (req, res) => {
  const { ip, userAgent } = contexto(req);
  try {
    const { rows } = await pool.query(
      `UPDATE subscribers
          SET email            = 'anonimizado+' || id || '@invalido.local',
              nome             = NULL,
              phone            = NULL,
              orgao            = NULL,
              consent_prazos   = FALSE,
              consent_projetos = FALSE,
              consent_whatsapp = FALSE,
              consent_ip       = NULL,
              consent_user_agent = NULL,
              consent_text     = NULL,
              access_token     = 'anonimizado-' || id,
              confirm_token    = NULL,
              revoked_at       = COALESCE(revoked_at, NOW()),
              anonymized_at    = NOW(),
              updated_at       = NOW()
        WHERE access_token = $1 AND anonymized_at IS NULL
        RETURNING id`,
      [req.params.token]
    );
    if (!rows.length) {
      return res.status(404).json({ status: 'error', message: 'Link inválido.' });
    }

    await registraEvento(null, rows[0].id, 'anonymized', {
      versao: POLITICA_VERSAO, ip, userAgent, detalhe: 'Eliminação a pedido do titular (art. 18 VI)'
    });

    res.json({
      status: 'success',
      message: 'Seus dados foram eliminados. Guardamos apenas o registro de que o pedido foi atendido, sem identificá-lo.'
    });
  } catch (erro) {
    console.error('Erro ao eliminar dados do titular:', erro.message);
    res.status(500).json({ status: 'error', message: 'Erro ao eliminar os dados.' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// A lista da organização
//
// `organization_id` guarda quem captou cada inscrição desde a migration 027,
// e a decisão de setembro de 2026 é que a lista é do CLIENTE: se a
// IncentivaBR é operadora, captar leads no site dele para a base dela seria
// decidir finalidade própria sobre a base dele — que é o que transforma
// operador em controlador de fato (docs/juridico/papeis-lgpd.md).
//
// Só que não existia rota que lesse essa tabela. A lista era do cliente no
// banco e não era dele em lugar nenhum: promessa correta e não entregável.
//
// Regras que o desenho abaixo cumpre, e o motivo de cada uma:
//
//   - escopo pela organização, sempre. O gestor da Casa Azul não enxerga
//     quem se cadastrou pela Orquestra;
//   - `access_token` e `confirm_token` NUNCA saem. Não são identificadores:
//     são credenciais. O primeiro autentica o link de um clique que consulta,
//     corrige e elimina os dados da pessoa, sem login. Exportar a lista com
//     ele dentro entrega, junto, a chave da conta de cada inscrito;
//   - quem pediu eliminação não volta na lista (`anonymized_at`);
//   - o telefone só sai para quem consentiu WhatsApp, porque foi só para isso
//     que ele foi pedido (art. 6º I, finalidade);
//   - cada exportação vira registro. Dado pessoal saindo do sistema em lote é
//     exatamente o que precisa deixar rastro.
// ───────────────────────────────────────────────────────────────────────────

/** O que a lista mostra de cada inscrito, e nada além disso. */
const COLUNAS_DA_LISTA = `
  s.id, s.email, s.nome, s.orgao,
  s.consent_prazos, s.consent_projetos, s.consent_whatsapp,
  CASE WHEN s.consent_whatsapp THEN s.phone ELSE NULL END AS phone,
  s.confirmed_at, s.revoked_at, s.created_at, s.last_interaction_at`;

/**
 * Em que pé está cada inscrito. Sem isto, a lista mistura quem pode receber
 * mensagem com quem nunca confirmou e com quem pediu para sair — e quem
 * exporta para disparar e-mail não tem como saber a diferença.
 */
const situacao = s =>
  s.revoked_at   ? 'revogado'
  : !s.confirmed_at ? 'pendente'
  : 'ativo';

/**
 * De quem é a lista que este pedido pode ler.
 *
 * Devolve `{ orgId, incluiSemDono }` ou `null` quando não pode.
 * `incluiSemDono` existe porque inscrição anterior aos tenants pode ter
 * `organization_id` nulo; essa fica com a plataforma, nunca com um cliente.
 */
async function escopoDaLista(req) {
  const orgId = req.organization?.id || req.user?.orgId || null;
  if (!orgId) return null;
  if (!(await podeGerirOrganizacao(req.user.userId, orgId, req.user))) return null;
  const ehPlataforma = (req.organization?.slug || req.user?.orgSlug) === 'www';
  return { orgId, incluiSemDono: ehPlataforma };
}

const consultaDaLista = ({ orgId, incluiSemDono }) => ({
  sql: `SELECT ${COLUNAS_DA_LISTA}
          FROM subscribers s
         WHERE s.anonymized_at IS NULL
           AND (s.organization_id = $1${incluiSemDono ? ' OR s.organization_id IS NULL' : ''})
         ORDER BY s.created_at DESC`,
  params: [orgId]
});

const semPermissao = res => res.status(403).json({
  status: 'error',
  message: 'Sem permissão para ver os interessados desta organização.'
});

// GET /api/interessados/lista — a lista em JSON
router.get('/lista', authenticateToken, async (req, res) => {
  try {
    const escopo = await escopoDaLista(req);
    if (!escopo) return semPermissao(res);

    const { sql, params } = consultaDaLista(escopo);
    const { rows } = await pool.query(sql, params);
    const lista = rows.map(s => ({ ...s, situacao: situacao(s) }));

    res.json({
      status: 'success',
      total: lista.length,
      // O resumo é o que a tela mostra primeiro: exportar uma lista de 400
      // para descobrir que 380 nunca confirmaram é descobrir tarde.
      resumo: {
        ativos:    lista.filter(s => s.situacao === 'ativo').length,
        pendentes: lista.filter(s => s.situacao === 'pendente').length,
        revogados: lista.filter(s => s.situacao === 'revogado').length
      },
      interessados: lista
    });
  } catch (erro) {
    console.error('Erro ao listar interessados:', erro.message);
    res.status(500).json({ status: 'error', message: 'Erro ao listar os interessados.' });
  }
});

// GET /api/interessados/lista.csv — a mesma lista, para abrir em planilha
router.get('/lista.csv', authenticateToken, async (req, res) => {
  try {
    const escopo = await escopoDaLista(req);
    if (!escopo) return semPermissao(res);

    const { sql, params } = consultaDaLista(escopo);
    const { rows } = await pool.query(sql, params);

    // Campo que começa com = + - @ é lido como fórmula pelo Excel e pelo
    // Sheets. Um nome digitado como `=HYPERLINK(...)` viraria fórmula ao
    // abrir o arquivo — injeção que vem de fora e executa na máquina de quem
    // abre. O apóstrofo à frente neutraliza, e some na exibição.
    const campo = v => {
      if (v == null) return '';
      const texto = String(v);
      const seguro = /^[=+\-@\t\r]/.test(texto) ? "'" + texto : texto;
      return '"' + seguro.replace(/"/g, '""') + '"';
    };
    const data = d => (d ? new Date(d).toISOString().slice(0, 10) : '');

    const cabecalho = ['email', 'nome', 'orgao', 'situacao', 'avisos_de_prazo',
                       'projetos_novos', 'whatsapp', 'telefone', 'confirmado_em', 'cadastrado_em'];
    const linhas = rows.map(s => [
      s.email, s.nome, s.orgao, situacao(s),
      s.consent_prazos ? 'sim' : 'não',
      s.consent_projetos ? 'sim' : 'não',
      s.consent_whatsapp ? 'sim' : 'não',
      s.phone, data(s.confirmed_at), data(s.created_at)
    ].map(campo).join(','));

    await registraExportacaoEmLote(req, escopo.orgId, rows.length);

    // BOM: sem ele o Excel no Windows abre "João" como "JoÃ£o".
    res.type('text/csv; charset=utf-8')
       .set('Content-Disposition', 'attachment; filename="interessados.csv"')
       .send('﻿' + [cabecalho.join(','), ...linhas].join('\r\n') + '\r\n');
  } catch (erro) {
    console.error('Erro ao exportar interessados:', erro.message);
    res.status(500).json({ status: 'error', message: 'Erro ao exportar os interessados.' });
  }
});

/**
 * Dado pessoal saindo em lote deixa rastro: quem exportou, de qual
 * organização, quantas linhas, quando e de onde.
 */
async function registraExportacaoEmLote(req, orgId, quantidade) {
  try {
    await pool.query(
      `INSERT INTO audit_log (organization_id, user_id, action, entity_type, details, ip_address, user_agent)
       VALUES ($1, $2, 'interessados.exportados', 'subscribers', $3, $4, $5)`,
      [orgId, req.user.userId, JSON.stringify({ quantidade }),
       req.ip || null, req.get('user-agent') || null]
    );
  } catch (erro) {
    console.error('[lgpd] falha ao registrar exportação da lista:', erro.message);
  }
}

export default router;
