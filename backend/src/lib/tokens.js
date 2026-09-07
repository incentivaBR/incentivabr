/**
 * Tokens que viajam por e-mail: redefinição de senha, verificação de e-mail,
 * convite de gestor.
 *
 * A regra é uma só: o banco guarda o SHA-256, nunca o valor em claro. Quem
 * ler a tabela (backup vazado, acesso indevido, dump de suporte) não consegue
 * usar token nenhum, porque o que abre o link só existiu no e-mail enviado.
 * Raio-X de set/2026, risco 05.
 */
import crypto from 'crypto';

/** O par: `claro` vai no e-mail, `hash` vai no banco. */
export function geraToken() {
  const claro = crypto.randomBytes(32).toString('base64url');
  return { claro, hash: hashDoToken(claro) };
}

export function hashDoToken(claro) {
  return crypto.createHash('sha256').update(String(claro)).digest('hex');
}

/** Um instante `minutos` à frente, para a coluna `*_expires`. */
export function expiraEmMinutos(minutos, agora = new Date()) {
  return new Date(agora.getTime() + minutos * 60 * 1000);
}

export default { geraToken, hashDoToken, expiraEmMinutos };
