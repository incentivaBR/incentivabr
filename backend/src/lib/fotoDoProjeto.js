/**
 * A foto do projeto: uma regra só, num lugar só.
 *
 * A regra é curta e não tem exceção: **foto sem autorização declarada não é
 * publicada.** O arquivo pode estar guardado, o cadastro pode estar completo,
 * a home pode ficar sem imagem — e fica. Enquanto ninguém declarar, com nome e
 * data, que existe autorização de uso de imagem das pessoas retratadas, a foto
 * não sai na tela.
 *
 * Por que tão firme: as fotos boas de uma OSC que atende crianças são de
 * crianças. O ECA (arts. 17 e 18) trata a imagem como parte do direito ao
 * respeito, e a LGPD (art. 14) exige que o tratamento de dado de criança seja
 * no melhor interesse dela. Nada disso a plataforma pode conferir — quem
 * conhece as famílias e guarda os termos é a organização. O que a plataforma
 * pode é não publicar sem que alguém assuma a afirmação.
 *
 * Este módulo é a fonte única de três coisas:
 *
 *   1. a foto é publicável?        → fotoPublicavel()
 *   2. de que endereço ela vem?    → enderecoDaFoto()
 *   3. o que a tela recebe?        → fotoParaATela()
 *
 * Nenhuma rota e nenhuma página repete a condição. Uma segunda cópia de
 * "tem chave e tem autorização" é uma cópia que um dia esquece a segunda
 * metade — e aí publica.
 */

/** Prefixo das chaves no armazenamento: `projetos/2026/09/projeto-<uuid>.jpg` */
export const PREFIXO = 'projetos';

/** O endereço é o mesmo para todo tenant; quem responde é o projeto ativo DELE. */
const CAMINHO = '/api/salic/org-project/foto';

/** Só imagem. PDF é documento, e documento não é foto de capa. */
export const TIPOS_DE_IMAGEM = ['jpeg', 'png'];

export const MENSAGEM_SEM_AUTORIZACAO =
  'Para publicar a foto, declare que a organização tem a autorização de uso de ' +
  'imagem das pessoas retratadas. Sem essa declaração a imagem fica guardada e ' +
  'não aparece no site.';

export const MENSAGEM_TIPO =
  'A foto do projeto tem de ser JPG ou PNG, e ser mesmo desse tipo — não só ter ' +
  'a extensão. PDF não serve como foto de capa.';

/**
 * A foto deste projeto pode aparecer na tela?
 *
 * @param {object|null} projeto - linha de org_projects
 */
export function fotoPublicavel(projeto) {
  return Boolean(projeto?.foto_chave && projeto?.foto_autorizacao_em);
}

/**
 * O endereço da foto, com um sufixo que muda quando a imagem muda.
 *
 * O caminho é fixo (um por tenant), então o navegador guardaria a foto antiga
 * para sempre depois de uma troca. Os oito primeiros dígitos do SHA-256
 * resolvem isso sem revelar nada: é o resumo de um arquivo que a própria
 * página vai mostrar.
 */
export function enderecoDaFoto(projeto) {
  if (!fotoPublicavel(projeto)) return null;
  const v = String(projeto.foto_sha256 || '').slice(0, 8);
  return v ? `${CAMINHO}?v=${v}` : CAMINHO;
}

/**
 * O que vai no JSON que a tela consome, ou null.
 *
 * Devolve objeto em vez de string porque o crédito anda junto: foto publicada
 * sem crédito é o começo de "de quem era essa imagem?".
 */
export function fotoParaATela(projeto) {
  const url = enderecoDaFoto(projeto);
  if (!url) return null;
  return { url, credito: projeto.foto_credito || null };
}

/**
 * Lê a declaração de autorização que veio do formulário.
 *
 * Só `true` de verdade conta. A string 'false', vazia ou ausente é NÃO — e é
 * assim de propósito: um checkbox que não foi marcado não manda campo nenhum,
 * e interpretar ausência como "sim" publicaria por acidente.
 */
export function declarouAutorizacao(valor) {
  return valor === true || valor === 'true' || valor === 'on' || valor === '1';
}

export default {
  PREFIXO, TIPOS_DE_IMAGEM, MENSAGEM_SEM_AUTORIZACAO, MENSAGEM_TIPO,
  fotoPublicavel, enderecoDaFoto, fotoParaATela, declarouAutorizacao
};
