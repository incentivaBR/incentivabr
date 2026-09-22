/**
 * Rotas /api/admin — Super-admin IncentivaBR
 * Acesso exclusivo para usuários com is_superadmin = true.
 * Permite gerenciar clientes (orgs), planos, projetos e monitoramento.
 */

import express from 'express';
import pool from '../../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { mascaraCPF } from '../lib/cpf.js';
import { mecanismosDisponiveis, podeSerDoCliente, MECANISMO_PADRAO } from '../lib/mecanismos.js';
import { situacaoDoCertificado, fraseDoCertificado, validaCertificado } from '../lib/certificado.js';

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
export const LIMITE_TEXTOS = {
  hero_titulo: 160, hero_subtitulo: 400, sobre: 2000,
  // Encarregado de dados do cliente (migration 041). É ele que a Política de
  // Privacidade divulga no site dele, porque é ele o controlador (art. 41 §1º).
  encarregado_nome: 160, encarregado_email: 200
};
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
        o.plan_type, o.fund_type, o.fund_name, o.max_percentage, o.incentive_group_code,
        o.contact_email, o.contact_phone,
        o.primary_color, o.secondary_color, o.logo_url,
        o.hero_titulo, o.hero_subtitulo, o.sobre,
        o.encarregado_nome, o.encarregado_email,
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
        incentive_group_code: o.incentive_group_code,
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
      hero_titulo, hero_subtitulo, sobre,
      incentive_group_code = MECANISMO_PADRAO
    } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ status: 'error', message: 'name e slug são obrigatórios.' });
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ status: 'error', message: 'slug deve conter apenas letras minúsculas, números e hífens.' });
    }

    // Mecanismo sem teto resolvido não pode ir para um cliente: a rota de
    // registro cairia no teto global de 6%, que é permissivo demais para
    // quase todos (migration 043).
    const mecanismo = await podeSerDoCliente(incentive_group_code);
    if (!mecanismo.ok) {
      return res.status(400).json({ status: 'error', message: mecanismo.motivo });
    }

    const result = await pool.query(`
      INSERT INTO organizations (
        name, slug, custom_domain, website_url, cnpj,
        plan_type, fund_type, fund_name, max_percentage,
        contact_email, contact_phone,
        primary_color, secondary_color,
        hero_titulo, hero_subtitulo, sobre,
        incentive_group_code,
        contracted_at, is_active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),true)
      RETURNING id, name, slug, plan_type, incentive_group_code, created_at
    `, [name, slug, custom_domain || null, website_url || null, cnpj || null,
        plan_type, fund_type, fund_name, max_percentage,
        contact_email || null, contact_phone || null,
        primary_color, secondary_color,
        textoDoCliente(hero_titulo, 'hero_titulo') || null,
        textoDoCliente(hero_subtitulo, 'hero_subtitulo') || null,
        textoDoCliente(sobre, 'sobre') || null,
        incentive_group_code]);

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
      govbr_client_id, govbr_client_secret, govbr_redirect_uri,
      incentive_group_code
    } = req.body;

    // Só valida quando vem no corpo: `undefined` significa "não mexa".
    if (incentive_group_code !== undefined) {
      const mecanismo = await podeSerDoCliente(incentive_group_code);
      if (!mecanismo.ok) {
        return res.status(400).json({ status: 'error', message: mecanismo.motivo });
      }
    }

    // Os textos aceitam string vazia para apagar, e o COALESCE não distingue
    // "apagar" de "não mexer". Cada um vai em dois parâmetros: se muda, e
    // para o quê (NULL quando apaga).
    const textos = ['hero_titulo', 'hero_subtitulo', 'sobre',
                    'encarregado_nome', 'encarregado_email'].map(campo => {
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
        hero_titulo       = CASE WHEN $19 THEN $20::text ELSE hero_titulo       END,
        hero_subtitulo    = CASE WHEN $21 THEN $22::text ELSE hero_subtitulo    END,
        sobre             = CASE WHEN $23 THEN $24::text ELSE sobre             END,
        encarregado_nome  = CASE WHEN $25 THEN $26::text ELSE encarregado_nome  END,
        encarregado_email = CASE WHEN $27 THEN $28::text ELSE encarregado_email END,
        incentive_group_code = COALESCE($29, incentive_group_code)
      WHERE id = $18
      RETURNING id, name, slug, plan_type, incentive_group_code, is_active
    `, [name, custom_domain, website_url, cnpj,
        plan_type, fund_type, fund_name, max_percentage,
        contact_email, contact_phone,
        primary_color, secondary_color, logo_url,
        is_active, govbr_client_id, govbr_client_secret, govbr_redirect_uri,
        id,
        ...textos.flat(),
        incentive_group_code ?? null]);

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

    // A situação do certificado é calculada, não guardada: guardar um
    // "vencido" no banco exigiria alguém rodando todo dia para virá-lo.
    const projects = result.rows.map(p => {
      const certificado = situacaoDoCertificado(p);
      return { ...p, certificado, certificado_texto: fraseDoCertificado(certificado) };
    });

    res.json({ status: 'success', projects });
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

    // Certificado de Autorização para Captação (RN 125/2026, arts. 12 a 15).
    // Só o FDCA/DF usa; na Rouanet os campos ficam nulos e nada acende.
    const cert = validaCertificado(req.body);
    if (!cert.ok) {
      return res.status(400).json({ status: 'error', message: cert.erro });
    }
    const c = cert.valores;

    const result = await pool.query(`
      INSERT INTO org_projects (
        organization_id, pronac, fund_code, titulo, area, segmento, descricao, uf,
        proponente_nome, proponente_cnpj,
        bank_name, bank_code, bank_agency, bank_account,
        pix_key, pix_key_type, is_featured,
        certificado_numero, certificado_publicado_em, certificado_valido_ate,
        registro_osc_valido_ate, meta_captacao
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                $18,$19::date,$20::date,$21::date,$22)
      RETURNING *
    `, [id, pronac || null, fund_code || null, titulo || null,
        area || null, segmento || null, descricao || null, uf || null,
        proponente_nome || null, proponente_cnpj || null,
        bank_name || null, bank_code || null, bank_agency || null, bank_account || null,
        pix_key || null, pix_key_type || null, is_featured,
        c.certificado_numero, c.certificado_publicado_em, c.certificado_valido_ate,
        c.registro_osc_valido_ate, c.meta_captacao]);

    const projeto = result.rows[0];
    const certificado = situacaoDoCertificado(projeto);

    res.status(201).json({
      status: 'success',
      project: { ...projeto, certificado, certificado_texto: fraseDoCertificado(certificado) }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ status: 'error', message: 'Este PRONAC já está vinculado a este cliente.' });
    }
    console.error('[Admin] Erro ao vincular projeto:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/admin/orgs/:id/projects/:projectId — atualizar o certificado
//
// Existe por causa do art. 15: a autorização é PRORROGÁVEL por igual
// período, e a OSC pede a prorrogação antes do fim. Sem esta rota, prorrogar
// exigiria cadastrar o projeto de novo — duplicando o histórico de captação
// do projeto que continua sendo o mesmo.
//
// Mexe só no bloco do certificado. Título, conta e proponente continuam onde
// estavam: um endpoint que atualiza tudo de uma vez é um endpoint que apaga
// dado bancário por engano.
// ─────────────────────────────────────────────────────────────
router.put('/orgs/:id/projects/:projectId', async (req, res) => {
  try {
    const { id, projectId } = req.params;

    const cert = validaCertificado(req.body);
    if (!cert.ok) {
      return res.status(400).json({ status: 'error', message: cert.erro });
    }
    const c = cert.valores;

    // O projeto tem de ser deste cliente: o id do projeto sozinho permitiria
    // mexer no certificado de outro tenant.
    const { rows } = await pool.query(`
      UPDATE org_projects
         SET certificado_numero       = $3,
             certificado_publicado_em = $4::date,
             certificado_valido_ate   = $5::date,
             registro_osc_valido_ate  = $6::date,
             meta_captacao            = $7,
             updated_at               = NOW()
       WHERE id = $2 AND organization_id = $1
       RETURNING *`,
      [id, projectId, c.certificado_numero, c.certificado_publicado_em,
       c.certificado_valido_ate, c.registro_osc_valido_ate, c.meta_captacao]);

    if (!rows.length) {
      return res.status(404).json({ status: 'error', message: 'Projeto não encontrado neste cliente.' });
    }

    await pool.query(
      `INSERT INTO audit_log (organization_id, user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'projeto.certificado', 'org_project', $3, $4)`,
      [id, req.user.userId, projectId,
       JSON.stringify({ numero: c.certificado_numero, valido_ate: c.certificado_valido_ate })]);

    const certificado = situacaoDoCertificado(rows[0]);
    res.json({
      status: 'success',
      project: { ...rows[0], certificado, certificado_texto: fraseDoCertificado(certificado) }
    });
  } catch (error) {
    console.error('[Admin] Erro ao atualizar certificado:', error.message);
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

// ─────────────────────────────────────────────────────────────
// GET /api/admin/usuarios — contas cadastradas, para limpar as de teste
//
// Existe porque CPF e e-mail são únicos: quem está experimentando a
// plataforma esbarra em "CPF já cadastrado" na segunda tentativa e não tinha
// nenhum caminho no produto para desfazer. O CPF sai mascarado — o
// superadmin precisa reconhecer a conta, não ler o documento de ninguém.
// ─────────────────────────────────────────────────────────────
router.get('/usuarios', async (req, res) => {
  try {
    const busca = String(req.query.busca || '').trim();
    // A busca por CPF aceita com ou sem pontuação; por e-mail e nome, parte
    // do texto. Sem busca, as contas mais recentes primeiro.
    const cpfBuscado = busca.replace(/\D/g, '');
    const filtros = [];
    const params = [];
    if (busca) {
      params.push(`%${busca.toLowerCase()}%`);
      filtros.push(`(LOWER(u.email) LIKE $${params.length} OR LOWER(u.nome) LIKE $${params.length})`);
      if (cpfBuscado.length >= 3) {
        params.push(`%${cpfBuscado}%`);
        filtros.push(`u.cpf LIKE $${params.length}`);
      }
    }
    const onde = filtros.length ? 'WHERE ' + filtros.join(' OR ') : '';
    params.push(Math.min(parseInt(req.query.limit) || 50, 200));

    const r = await pool.query(`
      SELECT u.id, u.nome, u.email, u.cpf, u.is_superadmin, u.created_at,
             o.name AS org_name
      FROM users u
      LEFT JOIN organizations o ON o.id = u.organization_id
      ${onde}
      ORDER BY u.created_at DESC
      LIMIT $${params.length}
    `, params);

    // Contagem numa consulta à parte, não como subconsulta correlacionada:
    // é o mesmo resultado e roda igual no Postgres e no pg-mem dos testes.
    const contagem = await pool.query(
      `SELECT user_id, COUNT(*) AS n FROM donations GROUP BY user_id`);
    const porUsuario = new Map(contagem.rows.map(l => [l.user_id, parseInt(l.n) || 0]));

    res.json({
      status: 'success',
      total: r.rows.length,
      usuarios: r.rows.map(u => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        cpf_mascarado: mascaraCPF(u.cpf),
        is_superadmin: u.is_superadmin === true,
        org_name: u.org_name,
        destinacoes: porUsuario.get(u.id) || 0,
        created_at: u.created_at
      }))
    });
  } catch (error) {
    console.error('[Admin] Erro ao listar usuarios:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/admin/usuarios/:id — apaga UMA conta, com trava
//
// Uma de cada vez, de propósito: não existe rota que limpe a tabela. Duas
// travas, e nenhuma delas é opcional:
//
//   1. Superadmin nunca é apagado. Apagar o único superadmin tranca o
//      sistema por fora, e a saída seria editar o banco à mão.
//   2. Conta com destinação só é apagada em modo simulação, onde a
//      destinação é exercício. Fora dele, comprovante e recibo são registro
//      fiscal de alguém e não somem por clique de administrador.
//
// O audit_log sobrevive: `users.id` entra nele com ON DELETE SET NULL, então
// o histórico do que foi feito continua, sem apontar para a conta apagada.
// ─────────────────────────────────────────────────────────────
router.delete('/usuarios/:id', async (req, res) => {
  const client = await pool.connect().catch(() => null);
  if (!client) {
    return res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
  try {
    const { id } = req.params;

    const alvo = await client.query(
      `SELECT id, nome, email, is_superadmin, organization_id FROM users WHERE id = $1`, [id]);

    if (!alvo.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Conta não encontrada.' });
    }
    const u = alvo.rows[0];
    const doacoes = await client.query(`SELECT id FROM donations WHERE user_id = $1`, [id]);
    u.destinacoes = doacoes.rows.length;

    if (u.is_superadmin) {
      return res.status(409).json({
        status: 'error',
        message: 'Esta é uma conta de super-administrador e não pode ser apagada por aqui. ' +
                 'Tire o papel de superadmin antes, se for mesmo o caso.'
      });
    }

    const destinacoes = parseInt(u.destinacoes) || 0;
    const simulacao = process.env.SIMULATION_MODE === 'true';
    if (destinacoes > 0 && !simulacao) {
      return res.status(409).json({
        status: 'error',
        message: `Esta conta tem ${destinacoes} destinação(ões) registrada(s) fora do modo simulação. ` +
                 'Comprovante e recibo são registro fiscal: cancele as destinações antes de apagar a conta.'
      });
    }

    await client.query('BEGIN');
    // Em simulação, a destinação é exercício e sai junto — senão a chave
    // estrangeira de donations.user_id recusa a exclusão.
    if (destinacoes > 0) await client.query('DELETE FROM donations WHERE user_id = $1', [id]);
    await client.query('DELETE FROM organization_users WHERE user_id = $1', [id]);
    await client.query('DELETE FROM users WHERE id = $1', [id]);
    await client.query('COMMIT');

    // Quem apagou, quando e de onde. Sem CPF e sem o id apagado como FK.
    await pool.query(
      `INSERT INTO audit_log (organization_id, user_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES ($1, $2, 'user.deleted', 'user', $3, $4, $5, $6)`,
      [u.organization_id, req.user.userId, id,
       JSON.stringify({ email: u.email, destinacoes_removidas: destinacoes, simulacao }),
       req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null,
       req.headers['user-agent'] || null]
    ).catch(() => {});

    res.json({
      status: 'success',
      message: `Conta de ${u.nome || u.email} apagada. O CPF e o e-mail ficam livres para um novo cadastro.`,
      destinacoes_removidas: destinacoes
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Admin] Erro ao apagar usuario:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno ao apagar a conta.' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/mecanismos — o catálogo de mecanismos de incentivo
//
// Os bloqueados vêm junto, com o motivo. Esconder o Fundo do Idoso faria a
// tela parecer um sistema que só sabe Rouanet; mostrá-lo cinza, com o que
// falta decidir, diz a verdade.
// ─────────────────────────────────────────────────────────────
router.get('/mecanismos', async (req, res) => {
  try {
    res.json({ status: 'success', mecanismos: await mecanismosDisponiveis() });
  } catch (error) {
    console.error('[Admin] Erro ao listar mecanismos:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/retencao — o que já venceu o prazo de guarda
//
// A Política promete anonimizar depois do prazo (§7): 5 anos do registro
// fiscal de quem destinou, 24 meses sem interação para quem só pediu avisos.
// Nada roda apagando por prazo — e não vai rodar até o tributarista dizer de
// que data o prazo fiscal conta. Enquanto isso, esta rota LISTA o que já
// passou do prazo, para o superadmin ver o tamanho da fila e agir à mão.
// Só lê; não apaga nada.
// ─────────────────────────────────────────────────────────────
router.get('/retencao', async (req, res) => {
  try {
    const { RETENCAO_INTERESSADO_MESES, RETENCAO_FISCAL_ANOS, anoFinalDaGuarda,
            guardaVencida, ANONIMIZAR_ALCANCA_ARQUIVOS } =
      await import('../config/lgpd.js');

    // Contas encerradas a pedido, com registro fiscal: vencem quando o
    // último ano-base sai da guarda.
    const { rows: encerradas } = await pool.query(
      `SELECT u.id, u.encerrada_em, u.retencao_travada_em, u.retencao_travada_motivo,
              MAX(d.fiscal_year)::int AS ultimo_ano_base, COUNT(d.id)::int AS destinacoes
         FROM users u
         JOIN donations d ON d.user_id = u.id
        WHERE u.encerrada_em IS NOT NULL AND u.anonimizada_em IS NULL
        GROUP BY u.id, u.encerrada_em, u.retencao_travada_em, u.retencao_travada_motivo`);

    const comPrazo = encerradas.map(c => ({ ...c, guarda_ate: anoFinalDaGuarda(c.ultimo_ano_base) }));

    // Travado nunca vence. Sai da fila e entra numa lista própria, para o
    // superadmin ver que existe e por quê — e não para sumir do relatório.
    const travadas = comPrazo.filter(c => c.retencao_travada_em);
    const contasVencidas = comPrazo.filter(
      c => !c.retencao_travada_em && guardaVencida(c.ultimo_ano_base));

    const corte = new Date();
    corte.setMonth(corte.getMonth() - RETENCAO_INTERESSADO_MESES);
    const { rows: interessados } = await pool.query(
      `SELECT COUNT(*)::int AS quantos
         FROM subscribers
        WHERE anonymized_at IS NULL AND last_interaction_at < $1`,
      [corte]);

    res.json({
      status: 'success',
      regra: {
        fiscal_anos: RETENCAO_FISCAL_ANOS,
        contagem: 'a partir do ano seguinte ao ano-base; data exata a confirmar com o tributarista',
        marco: '31/12 do ano final — o prazo termina no último instante do ano, não no primeiro',
        interessado_meses: RETENCAO_INTERESSADO_MESES,
        anonimizar_alcanca_arquivos: ANONIMIZAR_ALCANCA_ARQUIVOS
      },
      contas_encerradas_vencidas: contasVencidas.map(c => ({
        id: c.id, encerrada_em: c.encerrada_em, ultimo_ano_base: c.ultimo_ano_base,
        guarda_ate: c.guarda_ate, destinacoes: c.destinacoes
      })),
      contas_encerradas_em_guarda: comPrazo.length - contasVencidas.length - travadas.length,
      contas_travadas: travadas.map(c => ({
        id: c.id, travada_em: c.retencao_travada_em, motivo: c.retencao_travada_motivo,
        ultimo_ano_base: c.ultimo_ano_base, guarda_ate: c.guarda_ate,
        destinacoes: c.destinacoes
      })),
      interessados_inativos_vencidos: interessados[0]?.quantos || 0,
      apaga_automaticamente: false
    });
  } catch (error) {
    console.error('[Admin] Erro no relatorio de retencao:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/admin/retencao/:userId/travar — o prazo para de correr
//
// Para quando houver fiscalização, impugnação ou processo sobre a destinação
// daquela pessoa. Enquanto travado, ela nunca aparece como vencida, e nenhuma
// rotina de eliminação futura pode alcançá-la.
//
// O motivo é obrigatório. Trava sem motivo escrito vira trava eterna: seis
// meses depois ninguém sabe se ainda vale, e no caso de dúvida ninguém destrava
// — o dado fica guardado para sempre, que é o oposto do que a LGPD quer.
// ─────────────────────────────────────────────────────────────
router.post('/retencao/:userId/travar', async (req, res) => {
  try {
    const motivo = String(req.body?.motivo || '').trim();
    if (motivo.length < 10) {
      return res.status(400).json({
        status: 'error',
        message: 'Escreva o motivo da trava (processo, ofício, fiscalização). Mínimo de 10 caracteres.'
      });
    }

    const { rows } = await pool.query(
      `UPDATE users
          SET retencao_travada_em     = COALESCE(retencao_travada_em, NOW()),
              retencao_travada_motivo = $2,
              retencao_travada_por    = $3
        WHERE id = $1 AND anonimizada_em IS NULL
        RETURNING id, retencao_travada_em, retencao_travada_motivo`,
      [req.params.userId, motivo, req.user.userId]);

    if (!rows.length) {
      return res.status(404).json({ status: 'error', message: 'Conta não encontrada ou já anonimizada.' });
    }

    await pool.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'retencao.travada', 'user', $2, $3)`,
      [req.user.userId, rows[0].id, JSON.stringify({ motivo })]);

    res.json({ status: 'success', trava: rows[0] });
  } catch (error) {
    console.error('[Admin] Erro ao travar retencao:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/admin/retencao/:userId/travar — o prazo volta a correr
//
// Destravar não apaga nada: só devolve a conta à fila normal, onde ela volta a
// contar o prazo. Como nada apaga por prazo hoje, o efeito imediato é apenas
// voltar a aparecer na lista de vencidas.
// ─────────────────────────────────────────────────────────────
router.delete('/retencao/:userId/travar', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users
          SET retencao_travada_em = NULL, retencao_travada_motivo = NULL,
              retencao_travada_por = NULL
        WHERE id = $1 AND retencao_travada_em IS NOT NULL
        RETURNING id`,
      [req.params.userId]);

    if (!rows.length) {
      return res.status(404).json({ status: 'error', message: 'Conta não encontrada ou não estava travada.' });
    }

    await pool.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id)
       VALUES ($1, 'retencao.destravada', 'user', $2)`,
      [req.user.userId, rows[0].id]);

    res.json({ status: 'success', id: rows[0].id });
  } catch (error) {
    console.error('[Admin] Erro ao destravar retencao:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

export default router;
