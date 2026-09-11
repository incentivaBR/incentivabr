import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { notifyWelcome } from '../services/notificationService.js';
import { sendEmail } from '../services/emailService.js';
import { geraToken, hashDoToken, expiraEmMinutos } from '../lib/tokens.js';
import { limpaCPF, cpfValido } from '../lib/cpf.js';

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

// A confirmação de e-mail. O token era gerado e guardado como hash desde
// sempre, mas o valor em claro era descartado na mesma linha: nenhuma
// mensagem saía e não existia página que a recebesse. A conta ficava com
// `email_verified = false` para sempre, e ninguém tinha como provar que é
// dono da caixa — o que também é o que dá sentido à redefinição de senha.
let enviaVerificacao = async ({ to, nome, link }) => sendEmail({
  to,
  subject: 'Confirme seu e-mail — IncentivaBR',
  html: `
    <p>Olá, <strong>${escapaHtml(nome)}</strong>!</p>
    <p>Sua conta na IncentivaBR foi criada. Confirme que este e-mail é seu:</p>
    <p><a href="${link}" style="background:#0F1E3D;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Confirmar meu e-mail</a></p>
    <p>Este link expira em <strong>24 horas</strong> e só pode ser usado uma vez.</p>
    <p>Se não foi você quem criou a conta, ignore esta mensagem.</p>
    <hr>
    <small>IncentivaBR — Incentivos Fiscais Simplificados</small>
  `
});
export function _trocaEnvioDeVerificacao(fn) { enviaVerificacao = fn; }

/**
 * O endereço que abre a aplicação deste tenant, para montar links de e-mail.
 * Mesma regra da redefinição: domínio próprio do cliente quando houver,
 * senão o www — o apex responde com falha de TLS.
 */
function enderecoDoTenant(org) {
  const base = org?.custom_domain
    ? `https://${org.custom_domain}`
    : (process.env.APP_URL || 'https://www.incentivabr.com.br');
  const orgParam = org?.slug && !org?.custom_domain ? `&org=${encodeURIComponent(org.slug)}` : '';
  return { base, orgParam };
}

// ─────────────────────────────────────────────────────────────
// Utilitários de validação
// ─────────────────────────────────────────────────────────────

// Limpeza e validação de CPF vêm de lib/cpf.js — antes eram uma cópia aqui e
// outra em frontend/js/utils.js.
const cleanCPF = limpaCPF;
const isValidCPF = cpfValido;

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
  // A conexão é pedida DENTRO do try. Fora dele, um banco indisponível
  // rejeitava a promessa do próprio handler, e o Express 4 não encaminha
  // rejeição de função async para o tratador de erro: a requisição ficava
  // sem resposta e a tela girava até o navegador desistir.
  let client;
  try {
    client = await pool.connect();
    const { cpf, nome, email, phone, senha, accepted_terms } = req.body;
    const org = req.organization;
    const ip = getClientIP(req);
    const ua = req.headers['user-agent'];

    // Validações básicas
    //
    // O CPF NÃO entra aqui. Ele é pedido no momento de registrar a
    // destinação, que é quando serve para alguma coisa: vai no Recibo de
    // Mecenato. Pedir documento na primeira tela, antes de a pessoa entender
    // o que a plataforma faz, é atrito e é guardar dado sem finalidade
    // imediata. Quem mandar o campo mesmo assim (uma integração antiga) tem
    // ele aceito e validado — só não é mais obrigatório.
    if (!nome || !email || !senha) {
      return res.status(400).json({ status: 'error', message: 'Campos obrigatórios: nome, email, senha.' });
    }
    if (!accepted_terms) {
      return res.status(400).json({ status: 'error', message: 'Você deve aceitar os Termos de Uso e a Política de Privacidade.' });
    }

    const cleanedCPF = cpf ? cleanCPF(cpf) : null;

    if (cleanedCPF && !isValidCPF(cleanedCPF)) {
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

    // Verificar duplicidade.
    //
    // Sem CPF, a consulta é só pelo e-mail: `cpf = NULL` nunca é verdadeiro em
    // SQL. E o campo a apontar na mensagem sai de uma comparação explícita —
    // com os dois lados nulos, `dup.cpf === cleanedCPF` dava verdadeiro e a
    // tela dizia "CPF já cadastrado" para quem repetiu o e-mail.
    // A versão sem CPF usa $1 e recebe UM parâmetro. Ela já mandou dois para
    // uma consulta de um: o Postgres recusa a ligação ("bind message supplies
    // 2 parameters, but prepared statement requires 1") e todo cadastro
    // respondia 500. O pg-mem dos testes aceita a sobra, então o defeito só
    // apareceu em produção — o teste passou a conferir a contagem.
    const dup = cleanedCPF
      ? await client.query(
          'SELECT id, cpf, email FROM users WHERE cpf = $1 OR email = $2',
          [cleanedCPF, email.toLowerCase()])
      : await client.query(
          'SELECT id, cpf, email FROM users WHERE email = $1',
          [email.toLowerCase()]);
    if (dup.rows.length > 0) {
      const ehOCpf = !!cleanedCPF && dup.rows[0].cpf === cleanedCPF;
      return res.status(409).json({
        status: 'error',
        message: ehOCpf ? 'CPF já cadastrado.' : 'Email já cadastrado.'
      });
    }

    // Token de confirmação do e-mail. O banco fica só com o SHA-256; o valor
    // em claro existe nesta variável e na caixa de entrada de quem se
    // cadastrou, em nenhum outro lugar.
    const { claro: emailTokenClaro, hash: emailTokenHash } = geraToken();
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

    // A confirmação do e-mail. Falha de envio não derruba o cadastro — a
    // conta já existe e o link pode ser pedido de novo em
    // POST /api/auth/reenviar-verificacao.
    const { base, orgParam } = enderecoDoTenant(org);
    enviaVerificacao({
      to: user.email,
      nome: user.nome,
      link: `${base}/verificar-email.html?t=${encodeURIComponent(emailTokenClaro)}${orgParam}`
    }).catch(erro => console.error('[Auth] falha ao enviar confirmação de e-mail:', erro.message));

    res.status(201).json({
      status: 'success',
      // A mensagem diz o que de fato acontece: a confirmação sai por e-mail,
      // e entrar não depende dela. Já prometeu "verifique seu email para
      // ativar a conta" quando nenhuma mensagem saía.
      message: 'Conta criada! Enviamos um e-mail para você confirmar o endereço. Você já pode entrar.',
      user: { id: user.id, nome: user.nome, email: user.email, cpf: user.cpf }
    });

  } catch (error) {
    // Pode não haver conexão (falha no connect) nem transação aberta (erro
    // antes do BEGIN): nenhum dos dois casos pode virar um segundo erro aqui
    // e deixar a requisição sem resposta.
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[Auth] Erro no registro:', error.message);
    res.status(500).json({ status: 'error', message: 'Erro interno ao registrar.' });
  } finally {
    client?.release();
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
// POST /api/auth/reenviar-verificacao — pede o link de confirmação de novo
//
// Autenticada: quem pede é a própria pessoa, já dentro da conta. O token
// anterior é substituído, então um link antigo que ficou na caixa de entrada
// para de valer — é o que se espera de "me manda outro".
// ─────────────────────────────────────────────────────────────
router.post('/reenviar-verificacao', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, nome, email, email_verified FROM users WHERE id = $1', [req.user.userId]);
    const user = r.rows[0];
    if (!user) return res.status(404).json({ status: 'error', message: 'Conta não encontrada.' });

    if (user.email_verified) {
      return res.json({ status: 'success', message: 'Seu e-mail já está confirmado.' });
    }

    const { claro, hash } = geraToken();
    await pool.query(
      `UPDATE users SET email_verification_token = $1, email_verification_expires = $2 WHERE id = $3`,
      [hash, expiraEmMinutos(VALIDADE_VERIFICACAO_MIN), user.id]
    );

    const { base, orgParam } = enderecoDoTenant(req.organization);
    await enviaVerificacao({
      to: user.email,
      nome: user.nome,
      link: `${base}/verificar-email.html?t=${encodeURIComponent(claro)}${orgParam}`
    }).catch(erro => console.error('[Auth] falha ao reenviar confirmação:', erro.message));

    res.json({ status: 'success', message: `Enviamos um novo link para ${user.email}.` });
  } catch (error) {
    console.error('[Auth] Erro ao reenviar verificacao:', error.message);
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
