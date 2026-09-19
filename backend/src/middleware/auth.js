import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import pool from '../../config/database.js';

dotenv.config();

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({
      status: 'error',
      message: 'Token de autenticação não fornecido'
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token expirado. Faça login novamente.'
      });
    }

    return res.status(401).json({
      status: 'error',
      message: 'Token inválido'
    });
  }

  // O JWT vale 24 h e não é revogável por si. Quando o titular encerra a
  // conta (LGPD, art. 18 VI), "a conta some na hora" tem de ser verdade
  // também para um token que ainda esteja vivo neste ou noutro aparelho —
  // por isso a consulta a cada pedido autenticado. Conta que não existe mais
  // (apagada pelo superadmin) passa: as rotas dela não encontram nada.
  try {
    const { rows } = await pool.query(
      'SELECT encerrada_em FROM users WHERE id = $1', [decoded.userId]);
    if (rows[0]?.encerrada_em) {
      return res.status(401).json({
        status: 'error',
        message: 'Esta conta foi encerrada a pedido do titular.'
      });
    }
  } catch (error) {
    console.error('[Auth] Erro ao conferir a conta:', error.message);
    return res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }

  req.user = decoded;
  next();
}
