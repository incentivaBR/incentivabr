/**
 * Os direitos de quem tem conta — LGPD, art. 18.
 *
 * Quem só deixou o e-mail na lista de avisos exerce os direitos por
 * /api/interessados/meus-dados desde a migration 027. Quem criou conta e
 * destinou — justamente quem tem CPF, comprovante e recibo na base — não
 * tinha nada: a Política mandava "procurar a instituição". Aqui a conta
 * passa a exportar e eliminar os próprios dados sem pedir a ninguém.
 *
 *   GET    /api/meus-dados   acesso e portabilidade (art. 18 II e V)
 *   DELETE /api/meus-dados   eliminação (art. 18 VI), com a senha no corpo
 *
 * Correção (art. 18 III) já existe: PUT /api/auth/profile.
 *
 * A eliminação tem duas saídas, decididas em set/2026:
 *
 *   sem registro fiscal   nunca destinou, ou só simulou: anonimiza na hora,
 *                         como o interessado. Nome, CPF, e-mail, telefone e
 *                         senha somem; as simulações e o vínculo com a
 *                         organização são apagados. Fica a linha, sem
 *                         identificar ninguém, e o registro de que o pedido
 *                         foi atendido.
 *   com registro fiscal   destinação fora da simulação com comprovante ou
 *                         recibo: a conta é ENCERRADA — senha invalidada,
 *                         e-mail e telefone apagados, sem login e sem avisos.
 *                         Nome, CPF, valor, comprovante e recibo ficam até o
 *                         fim do prazo da Política (§7, LGPD art. 16 I), e a
 *                         resposta diz até quando. Depois disso a conta
 *                         aparece em /api/admin/retencao.
 *
 * A senha vai no corpo do DELETE de propósito: o JWT fica no localStorage e
 * vale 24 h; um aparelho aberto não pode apagar a conta de alguém.
 */
import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { formataCPF } from '../lib/cpf.js';
import { papeisDaPrivacidade } from '../lib/papeisLgpd.js';
import { POLITICA_VERSAO, anoFinalDaGuarda } from '../config/lgpd.js';

const router = express.Router();
router.use(authenticateToken);

// Status que NÃO geram documento fiscal: nada foi transferido, ou foi
// exercício. Todo o resto (comprovante enviado, confirmada, recibo) gera.
const SEM_REGISTRO_FISCAL = ['pending', 'cancelled', 'test_simulated'];
// Lista literal para o SQL: o pg-mem dos testes não entende `= ANY($n::text[])`.
const LISTA_SEM_FISCAL = SEM_REGISTRO_FISCAL.map(s => `'${s}'`).join(', ');

const ipDe = req => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;

function registra(orgId, userId, acao, detalhes, req) {
  return pool.query(
    `INSERT INTO audit_log (organization_id, user_id, action, entity_type, entity_id, details, ip_address, user_agent)
     VALUES ($1, $2, $3, 'user', $2, $4, $5, $6)`,
    [orgId, userId, acao, JSON.stringify(detalhes), ipDe(req), req.headers['user-agent'] || null]
  ).catch(() => {});
}

/** As destinações da conta que são registro fiscal, e até que ano ficam. */
async function registroFiscal(client, userId) {
  if (process.env.SIMULATION_MODE === 'true') return { quantas: 0, guardaAte: null };
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS quantas, MAX(fiscal_year)::int AS ultimo_ano
       FROM donations
      WHERE user_id = $1 AND status NOT IN (${LISTA_SEM_FISCAL})`,
    [userId]);
  const quantas = rows[0]?.quantas || 0;
  return { quantas, guardaAte: quantas ? anoFinalDaGuarda(rows[0].ultimo_ano) : null };
}

// ─────────────────────────────────────────────────────────────
// GET /api/meus-dados — tudo o que a plataforma guarda sobre a conta
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.cpf, u.email, u.phone, u.email_verified, u.created_at,
              u.accepted_terms_at, u.accepted_terms_version, u.organization_id,
              o.name AS organizacao
         FROM users u
         LEFT JOIN organizations o ON o.id = u.organization_id
        WHERE u.id = $1`, [req.user.userId]);
    if (!rows.length) return res.status(404).json({ status: 'error', message: 'Conta não encontrada.' });
    const u = rows[0];

    const { rows: destinacoes } = await pool.query(
      `SELECT id, fiscal_year, donation_amount, ir_devido, status, pronac, projeto_titulo,
              created_at, confirmed_at, rejected_at, rejection_reason,
              receipt_filename, mecenato_filename, mecenato_issued_at
         FROM donations
        WHERE user_id = $1
        ORDER BY created_at`, [req.user.userId]);

    // O que a conta fez e de onde: o art. 18 II cobre também o registro de
    // acesso. Sem o detalhe de operações de terceiros sobre a conta.
    const { rows: acessos } = await pool.query(
      `SELECT action, ip_address, user_agent, created_at
         FROM audit_log
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 200`, [req.user.userId]);

    await registra(u.organization_id, u.id, 'user.exported', { versao: POLITICA_VERSAO }, req);

    res.json({
      status: 'success',
      exportado_em: new Date().toISOString(),
      titular: {
        nome: u.nome,
        cpf: u.cpf ? formataCPF(u.cpf) : null,
        email: u.email,
        telefone: u.phone,
        email_confirmado: Boolean(u.email_verified),
        conta_criada_em: u.created_at,
        termos_aceitos_em: u.accepted_terms_at,
        termos_versao: u.accepted_terms_version,
        organizacao: u.organizacao
      },
      destinacoes: destinacoes.map(d => ({
        id: d.id,
        ano_base: d.fiscal_year,
        valor: Number(d.donation_amount),
        ir_devido_informado: d.ir_devido == null ? null : Number(d.ir_devido),
        situacao: d.status,
        pronac: d.pronac,
        projeto: d.projeto_titulo,
        registrada_em: d.created_at,
        confirmada_em: d.confirmed_at,
        comprovante_recusado_em: d.rejected_at,
        motivo_da_recusa: d.rejection_reason,
        comprovante_arquivo: d.receipt_filename,
        recibo_arquivo: d.mecenato_filename,
        recibo_emitido_em: d.mecenato_issued_at
      })),
      acessos,
      // Art. 18 VII: com quem os dados foram compartilhados.
      compartilhamento:
        'Nome, CPF e valor de cada destinação confirmada vão ao proponente do projeto, ' +
        'que emite o Recibo de Mecenato (Lei 8.313/1991). Fora isso, só os prestadores de ' +
        'infraestrutura e envio de e-mail necessários à operação.',
      privacidade: papeisDaPrivacidade(req.organization),
      politica_versao: POLITICA_VERSAO
    });
  } catch (erro) {
    console.error('[MeusDados] Erro ao exportar:', erro.message);
    res.status(500).json({ status: 'error', message: 'Erro ao recuperar seus dados.' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/meus-dados — eliminar (anonimizar) ou encerrar a conta
// ─────────────────────────────────────────────────────────────
router.delete('/', async (req, res) => {
  const senha = req.body?.senha;
  if (!senha) return res.status(400).json({ status: 'error', message: 'Confirme com a sua senha.' });

  const client = await pool.connect().catch(() => null);
  if (!client) return res.status(500).json({ status: 'error', message: 'Erro interno.' });
  try {
    const { rows } = await client.query(
      `SELECT id, nome, email, senha_hash, is_superadmin, organization_id, encerrada_em
         FROM users WHERE id = $1`, [req.user.userId]);
    if (!rows.length) return res.status(404).json({ status: 'error', message: 'Conta não encontrada.' });
    const u = rows[0];

    if (!(await bcrypt.compare(senha, u.senha_hash))) {
      return res.status(401).json({ status: 'error', message: 'Senha incorreta.' });
    }
    if (u.is_superadmin) {
      return res.status(409).json({
        status: 'error',
        message: 'Uma conta de super-administrador não se encerra por aqui. Tire o papel antes.'
      });
    }

    const fiscal = await registroFiscal(client, u.id);

    await client.query('BEGIN');
    // O que não é registro fiscal sai: simulações, destinações sem
    // transferência, canceladas. O vínculo de gestor também.
    await client.query(
      `DELETE FROM donations WHERE user_id = $1 AND status IN (${LISTA_SEM_FISCAL})`,
      [u.id]);
    if (process.env.SIMULATION_MODE === 'true') {
      await client.query('DELETE FROM donations WHERE user_id = $1', [u.id]);
    }
    await client.query('DELETE FROM organization_users WHERE user_id = $1', [u.id]);

    if (fiscal.quantas === 0) {
      await client.query(
        `UPDATE users
            SET email = 'anonimizado+' || id || '@invalido.local',
                nome = 'Titular anonimizado', cpf = NULL, phone = NULL,
                senha_hash = '!anonimizada',
                email_verification_token = NULL, reset_token = NULL,
                is_admin = FALSE, is_org_admin = FALSE,
                encerrada_em = NOW(), anonimizada_em = NOW(), updated_at = NOW()
          WHERE id = $1`, [u.id]);
    } else {
      await client.query(
        `UPDATE users
            SET email = 'encerrada+' || id || '@invalido.local',
                phone = NULL,
                senha_hash = '!encerrada',
                email_verification_token = NULL, reset_token = NULL,
                is_admin = FALSE, is_org_admin = FALSE,
                encerrada_em = NOW(), updated_at = NOW()
          WHERE id = $1`, [u.id]);
    }
    await client.query('COMMIT');

    // O registro não identifica: sem nome, sem CPF, sem o e-mail antigo.
    await registra(u.organization_id, u.id,
      fiscal.quantas ? 'user.closed' : 'user.anonymized',
      { versao: POLITICA_VERSAO, registro_fiscal: fiscal.quantas, guarda_ate: fiscal.guardaAte }, req);

    if (fiscal.quantas === 0) {
      return res.json({
        status: 'success',
        resultado: 'anonimizada',
        message: 'Seus dados foram eliminados. Guardamos apenas o registro de que o pedido foi atendido, sem identificá-lo.'
      });
    }
    res.json({
      status: 'success',
      resultado: 'encerrada',
      guarda_ate: fiscal.guardaAte,
      registro_fiscal: fiscal.quantas,
      message:
        `Sua conta foi encerrada: e-mail, telefone e senha foram apagados e ninguém mais entra nela. ` +
        `Nome, CPF, valor, comprovante e recibo de ${fiscal.quantas} destinação(ões) ficam guardados ` +
        `até 31/12/${fiscal.guardaAte}, por obrigação legal (Política de Privacidade, seção 7). ` +
        `Depois disso, são anonimizados.`
    });
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[MeusDados] Erro ao eliminar:', erro.message);
    res.status(500).json({ status: 'error', message: 'Erro ao eliminar os dados.' });
  } finally {
    client.release();
  }
});

export default router;
