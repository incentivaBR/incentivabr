-- Migration 038: tokens de redefinição de senha e de verificação de e-mail
-- passam a ser guardados como SHA-256, nunca em claro (Raio-X, risco 05).
--
-- Até aqui, users.reset_token e users.email_verification_token guardavam o
-- mesmo valor que ia no link do e-mail. Quem lesse a tabela (backup vazado,
-- acesso indevido, dump de suporte) trocava a senha de qualquer conta com um
-- token pendente. A partir desta migration, routes/auth.js grava só o hash e
-- procura pelo hash (lib/tokens.js).
--
-- Os valores em claro que ainda existirem são anulados, não convertidos:
-- um link de redefinição vale uma hora e quem precisar pede outro. O token de
-- verificação de e-mail nunca foi enviado a ninguém (o cadastro gera mas não
-- manda), então anular não tira nada de ninguém.

UPDATE users
   SET reset_token = NULL,
       reset_token_expires = NULL
 WHERE reset_token IS NOT NULL;

UPDATE users
   SET email_verification_token = NULL,
       email_verification_expires = NULL
 WHERE email_verification_token IS NOT NULL;
