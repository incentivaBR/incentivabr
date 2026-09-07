/**
 * Rotas /api/admin — Super-admin IncentivaBR
 * Acesso exclusivo para usuários com is_superadmin = true.
 * Permite gerenciar clientes (orgs), planos, projetos e monitoramento.
 */

import express from 'express';
import pool from '../../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Middleware: só superadmin passa
function requireSuperadmin(req, res, next) {
  if (!req.user?.isSuperadmin) {
    return res.status(403).json({
      status: 'error',
      message: 'Acesso restrito ao super-administrador IncentivaBR.'
    });
  }
  next();
}

router.use(authenticateToken, requireSuperadmin);

/**
 * Texto livre que o superadmin digita e a página inicial do cliente mostra.
 * Vai para a tela por textContent, então HTML não executa; o limite é para
 * um campo de formulário não virar um artigo. `undefined` mantém o valor
 * atual no COALESCE; string vazia apaga.
 */
export const LIMITE_TEXTOS = { hero_titulo: 160, hero_subtitulo: 400, sobre: 2000 };
function textoDoCliente(valor, campo) {
  if (valor === undefined) return undefined;
  if (valor === null) return '';
  const limpo = String(valor).trim();
  return limpo.slice(0, LIMITE_TEXTOS[campo]);
}

// ─────────────────────────────────────────────────────────────
// GET /api/admin/orgs — Lista todos os clientes (white-labels)
// ─────────────────────────────────────────────────────────────
router.get('/orgs', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        o.id, o.name, o.slug, o.custom_domain, o.website_url, o.cnpj,
        o.plan_type, o.fund_type, o.fund_name, o.max_percentage,
        o.contact_email, o.contact_phone,
        o.primary_color, o.secondary_color, o.logo_url,
        o.hero_titulo, o.hero_subtitulo, o.sobre,
        o.is_active, o.contracted_at, o.created_at,
        o.govbr_client_id,
        COUNT(DISTINCT u.id)  FILTER (WHERE u.organization_id = o.id) AS total_users,
        COUNT(DISTINCT d.id)  AS total_destinacoes,
        COALESCE(SUM(d.donation_amount) FILTER (WHERE d.status != 'cancelled'), 0) AS volume_total
      FROM organizations o
      LEFT JOIN users u ON u.organization_id = o.id
      LEFT JOIN donations d ON d.user_id = u.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);

    res.json({
      status: 'success',
      total: result.rows.length,
      orgs: result.rows.map(o => ({
        id:             o.id,
        name:           o.name,
        slug:           o.slug,
        custom_domain:  o.custom_domain,
        website_url:    o.website_url,
        cnpj:           o.cnpj,
        plan_type:      o.plan_type,
        fund_type:      o.fund_type,
        fund_name:      o.fund_name,
        max_percentage: parseFloat(o.max_percentage),
        contact_email:  o.contact_email,
        contact_phone:  o.contact_phone,
        primary_color:  o.primary_color,
        secondary_color: o.secondary_color,
        logo_url:       o.logo_url,
        hero_titulo:    o.hero_titulo,
        hero_subtitulo: o.hero_subtitulo,
        sobre:          o.sobre,
        is_active:      o.is_active,
        contracted_at:  o.contracted_at,
        created_at:     o.created_at,
        has_govbr:      !!o.govbr_client_id,
        stats: {
          total_users:       parseInt(o.total_users),
          total_destinacoes: parseInt(o.total_destinacoes),
          volume_total:      parseFloat(o.volume_total)
        }
      }))
    });
  } catch (error) {
    console.error('[Admin] Erro ao listar orgs:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/admin/orgs — Criar novo cliente (white-label)
// ─────────────────────────────────────────────────────────────
router.post('/orgs', async (req, res) => {
  try {
    const {
      name, slug, custom_domain, website_url, cnpj,
      plan_type = 'basic',
      fund_type = 'rouanet',
      fund_name = 'Lei Rouanet — Lei 8.313/1991',
      max_percentage = 6,
      contact_email, contact_phone,
      primary_color = '#0F1E3D',
      secondary_color = '#EE985C',
      hero_titulo, hero_subtitulo, sobre
    } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ status: 'error', message: 'name e slug são obrigatórios.' });
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ status: 'error', message: 'slug deve conter apenas letras minúsculas, números e hífens.' });
    }

    const result = await pool.query(`
      INSERT INTO organizations (
        name, slug, custom_domain, website_url, cnpj,
        plan_type, fund_type, fund_name, max_percentage,
        contact_email, contact_phone,
        primary_color, secondary_color,
        hero_titulo, hero_subtitulo, sobre,
        contracted_at, is_active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),true)
      RETURNING id, name, slug, plan_type, created_at
    `, [name, slug, custom_domain || null, website_url || null, cnpj || null,
        plan_type, fund_type, fund_name, max_percentage,
        contact_email || null, contact_phone || null,
        primary_color, secondary_color,
        textoDoCliente(hero_titulo, 'hero_titulo') || null,
        textoDoCliente(hero_subtitulo, 'hero_subtitulo') || null,
        textoDoCliente(sobre, 'sobre') || null]);

    const org = result.rows[0];

    // Registrar no audit_log
    await pool.query(
      `INSERT INTO audit_log (organization_id, user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'org.created', 'organization', $3, $4)`,
      [org.id, req.user.userId, org.id, JSON.stringify({ name, slug, plan_type })]
    );

    res.status(201).json({
      status: 'success',
      message: `Cliente "${name}" criado com sucesso!`,
      org
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ status: 'error', message: 'Slug ou domínio já existe.' });
    }
    console.error('[Admin] Erro ao criar org:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/admin/orgs/:id — Atualizar cliente
// ─────────────────────────────────────────────────────────────
router.put('/orgs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, custom_domain, website_url, cnpj,
      plan_type, fund_type, fund_name, max_percentage,
      contact_email, contact_phone,
      primary_color, secondary_color, logo_url,
      is_active,
      govbr_client_id, govbr_client_secret, govbr_redirect_uri
    } = req.body;

    // Os textos aceitam string vazia para apagar, e o COALESCE não distingue
    // "apagar" de "não mexer". Cada um vai em dois parâmetros: se muda, e
    // para o quê (NULL quando apaga).
    const textos = ['hero_titulo', 'hero_subtitulo', 'sobre'].map(campo => {
      const v = textoDoCliente(req.body[campo], campo);
      return v === undefined ? [false, null] : [true, v || null];
    });
    const result = await pool.query(`
      UPDATE organizations SET
        name             = COALESCE($1, name),
        custom_domain    = COALESCE($2, custom_domain),
        website_url      = COALESCE($3, website_url),
        cnpj             = COALESCE($4, cnpj),
        plan_type        = COALESCE($5, plan_type),
        fund_type        = COALESCE($6, fund_type),
        fund_name        = COALESCE($7, fund_name),
        max_percentage   = COALESCE($8, max_percentage),
        contact_email    = COALESCE($9, contact_email),
        contact_phone    = COALESCE($10, contact_phone),
        primary_color    = COALESCE($11, primary_color),
        secondary_color  = COALESCE($12, secondary_color),
        logo_url         = COALESCE($13, logo_url),
        is_active        = COALESCE($14, is_active),
        govbr_client_id  = COALESCE($15, govbr_client_id),
        govbr_client_secret = COALESCE($16, govbr_client_secret),
        govbr_redirect_uri  = COALESCE($17, govbr_redirect_uri),
        hero_titulo      = CASE WHEN $19 THEN $20::text ELSE hero_titulo    END,
        hero_subtitulo   = CASE WHEN $21 THEN $22::text ELSE hero_subtitulo END,
        sobre            = CASE WHEN $23 THEN $24::text ELSE sobre          END
      WHERE id = $18
      RETURNING id, name, slug, plan_type, is_active
    `, [name, custom_domain, website_url, cnpj,
        plan_type, fund_type, fund_name, max_percentage,
        contact_email, contact_phone,
        primary_color, secondary_color, logo_url,
        is_active, govbr_client_id, govbr_client_secret, govbr_redirect_uri,
        id,
        ...textos.flat()]);

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Cliente não encontrado.' });
    }

    await pool.query(
      `INSERT INTO audit_log (organization_id, user_id, action, entity_type, entity_id)
       VALUES ($1, $2, 'org.updated', 'organization', $3)`,
      [id, req.user.userId, id]
    );

    res.json({ status: 'success', org: result.rows[0] });
  } catch (error) {
    console.error('[Admin] Erro ao atualizar org:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/orgs/:id/projects — Projetos de um cliente
// ─────────────────────────────────────────────────────────────
router.get('/orgs/:id/projects', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM org_projects WHERE organization_id = $1 ORDER BY is_featured DESC, created_at DESC',
      [id]
    );
    res.json({ status: 'success', projects: result.rows });
  } catch (error) {
    console.error('[Admin] Erro ao listar projetos:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/admin/orgs/:id/projects — Vincular projeto a cliente
// ─────────────────────────────────────────────────────────────
router.post('/orgs/:id/projects', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      pronac, fund_code, titulo, area, segmento, descricao, uf,
      proponente_nome, proponente_cnpj,
      bank_name, bank_code, bank_agency, bank_account,
      pix_key, pix_key_type,
      is_featured = false
    } = req.body;

    if (!pronac && !fund_code) {
      return res.status(400).json({ status: 'error', message: 'Informe pronac ou fund_code.' });
    }

    const result = await pool.query(`
      INSERT INTO org_projects (
        organization_id, pronac, fund_code, titulo, area, segmento, descricao, uf,
        proponente_nome, proponente_cnpj,
        bank_name, bank_code, bank_agency, bank_account,
        pix_key, pix_key_type, is_featured
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [id, pronac || null, fund_code || null, titulo || null,
        area || null, segmento || null, descricao || null, uf || null,
        proponente_nome || null, proponente_cnpj || null,
        bank_name || null, bank_code || null, bank_agency || null, bank_account || null,
        pix_key || null, pix_key_type || null, is_featured]);

    res.status(201).json({ status: 'success', project: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ status: 'error', message: 'Este PRONAC já está vinculado a este cliente.' });
    }
    console.error('[Admin] Erro ao vincular projeto:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/dashboard — Visão geral da plataforma
// ─────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const [orgs, users, donations, audit] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS ativos,
                  COUNT(*) FILTER (WHERE plan_type = 'free') AS free,
                  COUNT(*) FILTER (WHERE plan_type != 'free') AS pagantes
                  FROM organizations`),
      pool.query(`SELECT COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS novos_30d
                  FROM users WHERE cpf != '00000000000'`),
      pool.query(`SELECT COUNT(*) AS total,
                  COALESCE(SUM(donation_amount) FILTER (WHERE status != 'cancelled'), 0) AS volume,
                  -- awaiting_mecenato e mecenato_issued são POSTERIORES à confirmação:
                  -- a transferência já foi conferida, falta só o recibo do proponente.
                  -- Contar apenas 'confirmed' subestimaria o número justamente na
                  -- medida em que o ciclo do recibo passa a funcionar.
                  COUNT(*) FILTER (WHERE status IN ('confirmed','awaiting_mecenato','mecenato_issued')) AS confirmadas,
                  COUNT(*) FILTER (WHERE status = 'pending') AS pendentes,
                  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS novas_30d
                  FROM donations`),
      pool.query(`SELECT action, COUNT(*) AS total FROM audit_log
                  WHERE created_at > NOW() - INTERVAL '7 days'
                  GROUP BY action ORDER BY total DESC LIMIT 10`)
    ]);

    res.json({
      status: 'success',
      dashboard: {
        clientes: {
          total:    parseInt(orgs.rows[0].total),
          ativos:   parseInt(orgs.rows[0].ativos),
          free:     parseInt(orgs.rows[0].free),
          pagantes: parseInt(orgs.rows[0].pagantes)
        },
        usuarios: {
          total:     parseInt(users.rows[0].total),
          novos_30d: parseInt(users.rows[0].novos_30d)
        },
        destinacoes: {
          total:        parseInt(donations.rows[0].total),
          volume_total: parseFloat(donations.rows[0].volume),
          confirmadas:  parseInt(donations.rows[0].confirmadas),
          pendentes:    parseInt(donations.rows[0].pendentes),
          novas_30d:    parseInt(donations.rows[0].novas_30d)
        },
        atividade_7d: audit.rows
      }
    });
  } catch (error) {
    console.error('[Admin] Erro no dashboard:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/audit — Log de auditoria
// ─────────────────────────────────────────────────────────────
router.get('/audit', async (req, res) => {
  try {
    const { org_id, user_id, action, limit = 50, offset = 0 } = req.query;

    let where = [];
    let params = [];
    let i = 1;

    if (org_id)  { where.push(`a.organization_id = $${i++}`); params.push(org_id); }
    if (user_id) { where.push(`a.user_id = $${i++}`); params.push(user_id); }
    if (action)  { where.push(`a.action = $${i++}`); params.push(action); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const result = await pool.query(`
      SELECT
        a.id, a.action, a.entity_type, a.entity_id,
        a.details, a.ip_address, a.created_at,
        u.nome AS user_nome, u.email AS user_email,
        o.name AS org_name, o.slug AS org_slug
      FROM audit_log a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN organizations o ON a.organization_id = o.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `, [...params, parseInt(limit), parseInt(offset)]);

    res.json({ status: 'success', total: result.rows.length, logs: result.rows });
  } catch (error) {
    console.error('[Admin] Erro no audit log:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

export default router;
