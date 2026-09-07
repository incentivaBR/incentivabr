import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { notifyWelcome } from '../services/notificationService.js';
import { sendEmail } from '../services/emailService.js';
import { geraToken, hashDoToken, expiraEmMinutos } from '../lib/tokens.js';

const router = express.Router();

// Quanto vale cada link. A redefinição é curta porque o link abre a conta
// inteira; a verificação de e-mail só confirma que a caixa existe.
export const VALIDADE_REDEFINICAO_MIN = 60;
export const VALIDADE_VERIFICACAO_MIN = 24 * 60;

// O e-mail de redefinição sai por aqui. Os testes trocam a função para
// capturar o token em claro, que é a única vez que ele existe fora da caixa
// de entrada de quem pediu.
const escapaHtml = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let enviaRedefinicao = async ({ to, nome, link }) => sendEmail({
  to,
  subject: 'Redefinição de senha — IncentivaBR',
  html: `
    <p>Olá, <strong>${escapaHtml(nome)}</strong>!</p>
    <p>Recebemos uma solicitação para redefinir sua senha.</p>
    <p><a href="${link}" style="background:#0F1E3D;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Redefinir senha</a></p>
    <p>Este link expira em <strong>1 hora</strong> e só pode ser usado uma vez.</p>
    <p>Se você não solicitou, ignore este email. Sua senha continua a mesma.</p>
    <hr>
    <small>IncentivaBR — Incentivos Fiscais Simplificados</small>
  `
});
export function _trocaEnvioDeRedefinicao(fn) { enviaRedefinicao = fn; }

// ─────────────────────────────────────────────────────────────
// Utilitários de validação
// ─────────────────────────────────────────────────────────────

function cleanCPF(cpf) {
  return cpf.replace(/\D/g, '');
}

function isValidCPF(cpf) {
  const c = cleanCPF(cpf);
  if (c.length !== 11) return false;
  if (/^(\d)\1+$/.test(c)) return false; // ex: 111.111.111-11

  // Dígito verificador 1
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(c[i]) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(c[9])) return false;

  // Dígito verificador 2
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  if (d2 !== parseInt(c[10])) return false;

  return true;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongPassword(senha) {
  return senha.length >= 8;
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.ip
    || req.connection?.remoteAddress
    || null;
}

async function logAudit(organizationId, userId, action, entityType, entityId, details, ip, userAgent) {
  pool.query(
    `INSERT INTO audit_log (organization_id, user_id, action, entity_type, entity_id, details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [organizationId, userId, action, entityType, entityId,
     details ? JSON.stringify(details) : null, ip, userAgent]
  ).catch(() => {});
}

// ─────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const client = await pool.connect();
  try {
    const { cpf, nome, email, phone, senha, accepted_terms } = req.body;
    const org = req.organization;
    const ip = getClientIP(req);
    const ua = req.headers['user-agent'];

    // Validações básicas
    if (!cpf || !nome || !email || !senha) {
      return res.status(400).json({ status: 'error', message: 'Campos obrigatórios: cpf, nome, email, senha.' });
    }
    if (!accepted_terms) {
      return res.status(400).json({ status: 'error', message: 'Você deve aceitar os Termos de Uso e a Política de Privacidade.' });
    }

    const cleanedCPF = cleanCPF(cpf);

    if (!isValidCPF(cleanedCPF)) {
      return res.status(400).json({ status: 'error', message: 'CPF inválido.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ status: 'error', message: 'Email inválido.' });
    }
    if (!isStrongPassword(senha)) {
      return res.status(400).json({ status: 'error', message: 'Senha deve ter no mínimo 8 caracteres.' });
    }
    if (nome.trim().length < 3) {
      return res.status(400).json({ status: 'error', message: 'Nome deve ter no mínimo 3 caracteres.' });
    }

    // Verificar duplicidade
    const dup = await client.query(
      'SELECT id, cpf, email FROM users WHERE cpf = $1 OR email = $2',
      [cleanedCPF, email.toLowerCase()]
    );
    if (dup.rows.length > 0) {
      const campo = dup.rows[0].cpf === cleanedCPF ? 'CPF' : 'Email';
      return res.status(409).json({ status: 'error', message: `${campo} já cadastrado.` });
    }

    // Token de verificação de email. Só o hash vai para o banco. O valor em
    // claro ainda não é enviado a ninguém: o e-mail de boas-vindas não o
    // inclui e não existe página que o receba. Fica gerado do jeito certo
    // para quando o fluxo for ligado.
    const { hash: emailTokenHash } = geraToken();
    const emailTokenExpiry = expiraEmMinutos(VALIDADE_VERIFICACAO_MIN);

    const senhaHash = await bcrypt.hash(senha, 10);

    await client.query('BEGIN');

    // Inserir usuário
    const userResult = await client.query(
      `INSERT INTO users (
        cpf, nome, email, phone, senha_hash,
        organization_id,
        accepted_terms_at, accepted_terms_version,
        email_verified,
        email_verification_token, email_verification_expires
      ) VALUES ($1,$2,$3,$4,$5,$6,NOW(),'1.0',false,$7,$8)
      RETURNING id, nome, email, cpf, created_at`,
      [cleanedCPF, nome.trim(), email.toLowerCase(), phone || null,
       senhaHash, org?.id || null, emailTokenHash, emailTokenExpiry]
    );

    const user = userResult.rows[0];

    // Vincular à organização na tabela organization_users
    if (org?.id) {
      await client.query(
        `INSERT INTO organization_users (organization_id, user_id, role, accepted_at)
         VALUES ($1, $2, 'member', NOW())
         ON CONFLICT (organization_id, user_id) DO NOTHING`,
        [org.id, user.id]
      );
    }

    await client.query('COMMIT');

    // Audit log — LGPD: registrar cadastro com IP
    logAudit(org?.id, user.id, 'user.register', 'user', user.id,
      { email: user.email, org_slug: org?.slug }, ip, ua);

    // Notificações assíncronas
    notifyWelcome({ name: user.nome, email: user.email, phone: phone || null })
      .catch(() => {});

    res.status(201).json({
      status: 'success',
      message: 'Cadastro realizado! Verifique seu email para ativar a conta.',
      user: { id: user.id, nome: user.nome, email: user.email, cpf: user.cpf }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Auth] Erro no registro:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno ao registrar.' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { cpf, email, senha } = req.body;
    const ip = getClientIP(req);
    const ua = req.headers['user-agent'];

    if ((!cpf && !email) || !senha) {
      return res.status(400).json({ status: 'error', message: 'Informe CPF ou email e senha.' });
    }

    const field = cpf ? 'cpf' : 'email';
    const param = cpf ? cleanCPF(cpf) : email.toLowerCase();

    const result = await pool.query(
      `SELECT
        u.id, u.cpf, u.nome, u.email, u.phone, u.senha_hash,
        u.total_donated, u.is_admin, u.is_superadmin, u.is_org_admin,
        u.organization_id, u.email_verified, u.created_at,
        o.slug AS org_slug, o.name AS org_name
       FROM users u
       LEFT JOIN organizations o ON u.organization_id = o.id
       WHERE u.${field} = $1`,
      [param]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(senha, user.senha_hash))) {
      return res.status(401).json({ status: 'error', message: 'Credenciais inválidas.' });
    }

    // O JWT vai em todo pedido e fica no localStorage do navegador; qualquer
    // um decodifica o payload sem a chave. Por isso leva só identificadores e
    // papéis, nunca o CPF: quem precisa do CPF busca no banco pelo userId
    // (Raio-X, risco 05).
    const token = jwt.sign(
      {
        userId:       user.id,
        orgId:        user.organization_id,
        orgSlug:      user.org_slug,
        isSuperadmin: user.is_superadmin,
        isOrgAdmin:   user.is_org_admin
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    logAudit(user.organization_id, user.id, 'user.login', 'user', user.id, null, ip, ua);

    res.json({
      status: 'success',
      message: 'Login realizado com sucesso!',
      token,
      user: {
        id:            user.id,
        nome:          user.nome,
        email:         user.email,
        cpf:           user.cpf,
        email_verified: user.email_verified,
        total_donated: parseFloat(user.total_donated) || 0,
        is_admin:      user.is_admin      || false,
        is_superadmin: user.is_superadmin || false,
        is_org_admin:  user.is_org_admin  || false,
        organization: {
          id:   user.organization_id,
          slug: user.org_slug,
          name: user.org_name
        }
      }
    });

  } catch (error) {
    console.error('[Auth] Erro no login:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno ao fazer login.' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────
router.post('/logout', authenticateToken, async (req, res) => {
  const ip = getClientIP(req);
  const ua = req.headers['user-agent'];
  logAudit(req.user.orgId, req.user.userId, 'user.logout', 'user', req.user.userId, null, ip, ua);
  res.json({ status: 'success', message: 'Logout registrado.' });
});

// ─────────────────────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        u.id, u.cpf, u.nome, u.email, u.phone,
        u.email_verified, u.total_donated,
        u.is_admin, u.is_superadmin, u.is_org_admin,
        u.organization_id, u.accepted_terms_at, u.created_at,
        o.slug AS org_slug, o.name AS org_name,
        o.primary_color, o.secondary_color, o.fund_type
       FROM users u
       LEFT JOIN organizations o ON u.organization_id = o.id
       WHERE u.id = $1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Usuário não encontrado.' });
    }

    const u = result.rows[0];

    res.json({
      status: 'success',
      user: {
        id:             u.id,
        cpf:            u.cpf,
        nome:           u.nome,
        email:          u.email,
        phone:          u.phone,
        email_verified: u.email_verified,
        total_donated:  parseFloat(u.total_donated) || 0,
        is_admin:       u.is_admin      || false,
        is_superadmin:  u.is_superadmin || false,
        is_org_admin:   u.is_org_admin  || false,
        accepted_terms_at: u.accepted_terms_at,
        created_at:     u.created_at,
        organization: {
          id:            u.organization_id,
          slug:          u.org_slug,
          name:          u.org_name,
          primary_color: u.primary_color,
          secondary_color: u.secondary_color,
          fund_type:     u.fund_type
        }
      }
    });

  } catch (error) {
    console.error('[Auth] Erro ao buscar /me:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/auth/profile — atualiza email e/ou nome do usuário
// ─────────────────────────────────────────────────────────────
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { nome, email } = req.body;
    if (!nome && !email) {
      return res.status(400).json({ status: 'error', message: 'Informe nome ou email para atualizar.' });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ status: 'error', message: 'Email inválido.' });
    }
    if (email) {
      const conflict = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id <> $2',
        [email.toLowerCase(), req.user.userId]
      );
      if (conflict.rows.length > 0) {
        return res.status(409).json({ status: 'error', message: 'Email já está em uso por outra conta.' });
      }
    }
    const fields = [];
    const values = [];
    if (nome) { fields.push(`nome = $${fields.length + 1}`); values.push(nome.trim()); }
    if (email) { fields.push(`email = $${fields.length + 1}`); values.push(email.toLowerCase()); }
    values.push(req.user.userId);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING id, nome, email`,
      values
    );
    res.json({ status: 'success', message: 'Perfil atualizado.', user: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro ao atualizar perfil.' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
// ─────────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ status: 'error', message: 'Email inválido.' });
    }

    const result = await pool.query(
      'SELECT id, nome, email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // Sempre responder com sucesso — não revelar se email existe (segurança)
    if (result.rows.length === 0) {
      return res.json({ status: 'success', message: 'Se o email estiver cadastrado, você receberá as instruções.' });
    }

    const user = result.rows[0];
    // Só o hash vai para o banco; o valor em claro vai para o e-mail e para
    // mais lugar nenhum.
    const { claro, hash } = geraToken();
    const expiry = expiraEmMinutos(VALIDADE_REDEFINICAO_MIN);

    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [hash, expiry, user.id]
    );

    const org = req.organization;
    // O fallback tem que ser um domínio que realmente sirva a aplicação.
    // destineai.com.br é apêndice da marca, não o core, e o apex
    // incentivabr.com.br responde com falha de TLS (SEC_E_WRONG_PRINCIPAL) —
    // por isso o www. Link de redefinição que não abre é conta perdida.
    const baseUrl = org?.custom_domain
      ? `https://${org.custom_domain}`
      : (process.env.APP_URL || 'https://www.incentivabr.com.br');

    // A página lê `t`; `org` mantém a marca do tenant em quem não tem domínio
    // próprio (tenant.js). Sem esse parâmetro o link abriria como www.
    const orgParam = org?.slug && !org?.custom_domain ? `&org=${encodeURIComponent(org.slug)}` : '';
    const resetLink = `${baseUrl}/redefinir-senha.html?t=${encodeURIComponent(claro)}${orgParam}`;

    await enviaRedefinicao({ to: user.email, nome: user.nome, link: resetLink }).catch(() => {});

    res.json({ status: 'success', message: 'Se o email estiver cadastrado, você receberá as instruções.' });

  } catch (error) {
    console.error('[Auth] Erro no forgot-password:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/reset-password
// ─────────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, senha } = req.body;

    if (!token || !senha) {
      return res.status(400).json({ status: 'error', message: 'Token e senha são obrigatórios.' });
    }
    if (!isStrongPassword(senha)) {
      return res.status(400).json({ status: 'error', message: 'Senha deve ter no mínimo 8 caracteres.' });
    }

    // Procura pelo hash: o banco nunca viu o valor em claro. Um token tirado
    // da tabela (o próprio hash) não abre nada, porque seria re-hasheado.
    const result = await pool.query(
      `SELECT id, nome, email, organization_id FROM users
       WHERE reset_token = $1 AND reset_token_expires > NOW()`,
      [hashDoToken(token)]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Token inválido ou expirado.' });
    }

    const user = result.rows[0];
    const senhaHash = await bcrypt.hash(senha, 10);

    await pool.query(
      `UPDATE users SET senha_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2`,
      [senhaHash, user.id]
    );

    logAudit(user.organization_id, user.id, 'user.password_reset', 'user', user.id,
      null, getClientIP(req), req.headers['user-agent']);

    res.json({ status: 'success', message: 'Senha redefinida com sucesso! Faça login.' });

  } catch (error) {
    console.error('[Auth] Erro no reset-password:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/verify-email
// ─────────────────────────────────────────────────────────────
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ status: 'error', message: 'Token obrigatório.' });
    }

    const result = await pool.query(
      `SELECT id, nome, email, organization_id FROM users
       WHERE email_verification_token = $1
         AND email_verification_expires > NOW()
         AND email_verified = false`,
      [hashDoToken(token)]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Token inválido, expirado ou email já verificado.' });
    }

    const user = result.rows[0];

    await pool.query(
      `UPDATE users SET
        email_verified = true,
        email_verification_token = NULL,
        email_verification_expires = NULL
       WHERE id = $1`,
      [user.id]
    );

    logAudit(user.organization_id, user.id, 'user.email_verified', 'user', user.id,
      null, getClientIP(req), req.headers['user-agent']);

    res.json({ status: 'success', message: 'Email verificado com sucesso! Você já pode fazer login.' });

  } catch (error) {
    console.error('[Auth] Erro no verify-email:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

export default router;
