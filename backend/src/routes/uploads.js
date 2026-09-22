/**
 * Comprovante bancário da transferência — o documento que o gestor confere.
 *
 * O arquivo vai para o armazenamento (services/armazenamento.js): S3/R2 em
 * produção, disco local em desenvolvimento. O banco guarda a chave, o nome
 * original e o SHA-256 do conteúdo. Nada aqui é servido por caminho estático.
 */

import express from 'express';
import pool from '../../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { podeVerDadosDaOrganizacao } from '../lib/permissoes.js';
import { recebeArquivo } from '../lib/recebeArquivo.js';
import { entregaArquivo } from '../lib/entregaArquivo.js';
import { armazenamento, novaChave } from '../services/armazenamento.js';
import { prazoDoComprovante, frasePrazo } from '../lib/prazos.js';

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/uploads/receipt/:donationId - Upload de comprovante
router.post('/receipt/:donationId', authenticateToken, recebeArquivo('receipt'), async (req, res) => {
  try {
    const { donationId } = req.params;
    const userId = req.user.userId;

    if (!UUID.test(donationId)) {
      return res.status(400).json({ status: 'error', message: 'Identificador inválido.' });
    }
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'Nenhum arquivo enviado' });
    }

    // A destinação tem de ser deste usuário. Nada é gravado antes disso.
    const donationResult = await pool.query(
      'SELECT id, status FROM donations WHERE id = $1 AND user_id = $2',
      [donationId, userId]
    );
    if (donationResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Doação não encontrada' });
    }

    // A data em que o dinheiro saiu, lida do próprio comprovante.
    //
    // É deste dia que correm os prazos do fundo — no FDCA/DF, os 60 dias do
    // art. 7º da RN 125/2026 para apresentar o comprovante e receber o recibo.
    // Nem `created_at` nem `confirmed_at` servem: entre registrar, transferir
    // e o gestor conferir passam dias, e contar de qualquer uma delas daria
    // uma data errada para MAIS — o lado que faz alguém perder o prazo
    // achando que tem folga.
    //
    // Opcional: a Rouanet não tem prazo, e uma destinação antiga não teria
    // como informar. Quando vem, é conferida.
    const transferido = (req.body?.transferido_em || '').trim();
    let transferidoEm = null;
    if (transferido) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(transferido)) {
        return res.status(400).json({
          status: 'error',
          message: 'Data da transferência inválida. Use o formato AAAA-MM-DD, como está no comprovante.'
        });
      }
      const d = new Date(`${transferido}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ status: 'error', message: 'Data da transferência inválida.' });
      }
      // Transferência no futuro é engano de digitação, e o prazo sairia errado.
      const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000);
      if (d > amanha) {
        return res.status(400).json({
          status: 'error',
          message: 'A data da transferência não pode ser no futuro. Confira o comprovante.'
        });
      }
      transferidoEm = transferido;
    }

    const chave = novaChave('receipts', req.file.tipo.extensao);
    const gravado = await (await armazenamento()).guarda(chave, req.file.buffer, req.file.tipo.mime);

    await pool.query(`
      UPDATE donations
         SET receipt_url = $1, receipt_filename = $2, receipt_sha256 = $3,
             transferido_em = COALESCE($5::date, transferido_em),
             status = 'awaiting_confirmation'
       WHERE id = $4
    `, [gravado.chave, req.file.originalname, gravado.sha256, donationId, transferidoEm]);

    console.log(`[uploads] comprovante da destinação ${donationId}: ${gravado.chave} (${gravado.bytes} bytes)`);

    res.json({
      status: 'success',
      message: 'Comprovante enviado com sucesso',
      receipt_url: `/api/uploads/receipt/${donationId}/arquivo`,
      sha256: gravado.sha256,
      bytes: gravado.bytes
    });
  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao enviar comprovante' });
  }
});

// GET /api/uploads/receipt/:donationId - Situação do comprovante
router.get('/receipt/:donationId', authenticateToken, async (req, res) => {
  try {
    const { donationId } = req.params;
    const userId = req.user.userId;
    if (!UUID.test(donationId)) {
      return res.status(400).json({ status: 'error', message: 'Identificador inválido.' });
    }

    // Traz o prazo junto: é aqui que a tela do comprovante pergunta pela
    // situação, e é onde o aviso tem mais chance de ser lido a tempo.
    const result = await pool.query(
      `SELECT d.receipt_url, d.receipt_filename, d.receipt_sha256,
              d.transferido_em, d.mecenato_issued_at,
              f.prazo_comprovante_dias, f.prazo_comprovante_orgao, f.prazo_comprovante_base_legal
         FROM donations d
         LEFT JOIN org_projects p
                ON p.organization_id = d.organization_id AND p.is_active = true
         LEFT JOIN official_funds f ON f.id = p.official_fund_id
        WHERE d.id = $1 AND d.user_id = $2
        ORDER BY p.is_featured DESC NULLS LAST
        LIMIT 1`,
      [donationId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Doação não encontrada' });
    }
    const donation = result.rows[0];
    if (!donation.receipt_url) {
      return res.status(404).json({ status: 'error', message: 'Comprovante não encontrado' });
    }

    const prazo = prazoDoComprovante(donation);

    res.json({
      status: 'success',
      // Caminho autenticado, nunca a chave do armazenamento.
      receipt_url: `/api/uploads/receipt/${donationId}/arquivo`,
      receipt_filename: donation.receipt_filename,
      sha256: donation.receipt_sha256,
      transferido_em: donation.transferido_em
        ? new Date(donation.transferido_em).toISOString().slice(0, 10)
        : null,
      // null quando não há prazo a contar: fundo sem janela (Rouanet), data
      // da transferência ainda não informada, ou recibo já emitido.
      prazo,
      prazo_texto: frasePrazo(prazo)
    });
  } catch (error) {
    console.error('Erro ao buscar comprovante:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao buscar comprovante' });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/uploads/receipt/:donationId/arquivo — entrega o comprovante
//
// So o dono da destinacao e quem administra a organizacao dela podem baixar.
// ───────────────────────────────────────────────────────────────────────────
router.get('/receipt/:donationId/arquivo', authenticateToken, async (req, res) => {
  const { donationId } = req.params;
  try {
    if (!UUID.test(donationId)) {
      return res.status(400).json({ status: 'error', message: 'Identificador inválido.' });
    }
    const { rows } = await pool.query(
      `SELECT d.user_id, d.organization_id, d.receipt_url, d.receipt_filename
         FROM donations d WHERE d.id = $1`,
      [donationId]
    );
    if (!rows.length || !rows[0].receipt_url) {
      return res.status(404).json({ status: 'error', message: 'Comprovante não encontrado.' });
    }
    const d = rows[0];

    let autorizado = d.user_id === req.user.userId;
    if (!autorizado) {
      autorizado = await podeVerDadosDaOrganizacao(req.user.userId, d.organization_id, req.user);
    }
    if (!autorizado) {
      return res.status(403).json({ status: 'error', message: 'Sem permissão.' });
    }

    const entregue = await entregaArquivo(res, d.receipt_url, d.receipt_filename || 'comprovante');
    if (!entregue) {
      console.error('[uploads] arquivo ausente no armazenamento:', d.receipt_url);
      return res.status(404).json({ status: 'error', message: 'Arquivo não encontrado.' });
    }
  } catch (erro) {
    console.error('Erro ao entregar comprovante:', erro);
    if (!res.headersSent) res.status(500).json({ status: 'error', message: 'Erro ao entregar o comprovante.' });
  }
});

export default router;
