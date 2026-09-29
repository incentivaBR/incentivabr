/**
 * Entrega um documento do armazenamento pela resposta HTTP, como download.
 *
 * Um só lugar para comprovante e recibo: resolve a chave (inclusive a legada
 * `/uploads/...`), abre o stream, põe os cabeçalhos e trata "não existe".
 */

import { armazenamento, resolveChave } from '../services/armazenamento.js';

/**
 * @returns {Promise<boolean>} true se respondeu; false se o arquivo não existe
 *   (quem chama decide a mensagem do 404)
 */
export async function entregaArquivo(res, valorNoBanco, nomeParaDownload) {
  const chave = resolveChave(valorNoBanco);
  if (!chave) return false;

  const arq = await (await armazenamento()).abre(chave);
  if (!arq) return false;

  const nome = String(nomeParaDownload || 'documento').replace(/[^\w.\-() áéíóúãõâêôçÁÉÍÓÚÃÕÂÊÔÇ]/g, '_');
  res.setHeader('Content-Type', arq.contentType || 'application/octet-stream');
  if (arq.bytes != null) res.setHeader('Content-Length', String(arq.bytes));
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"; filename*=UTF-8''${encodeURIComponent(nome)}`);
  res.setHeader('Cache-Control', 'private, no-store');

  await new Promise((resolve, reject) => {
    arq.stream.on('error', reject);
    res.on('finish', resolve);
    res.on('close', resolve);
    arq.stream.pipe(res);
  });
  return true;
}

/**
 * Entrega uma imagem para ser MOSTRADA na página, não baixada.
 *
 * Três diferenças em relação a `entregaArquivo`, e cada uma é o motivo de esta
 * função existir em vez de um parâmetro a mais:
 *
 *   - `inline`, não `attachment`: com attachment o navegador baixa o arquivo
 *     em vez de desenhar a foto;
 *   - `public`, com cache: a foto do projeto é a mesma para todo visitante e
 *     aparece em toda página. Com `private, no-store` ela seria buscada de
 *     novo a cada navegação;
 *   - só tipo de imagem sai daqui. O armazenamento é o mesmo dos comprovantes,
 *     e um erro de chave que servisse um comprovante bancário como "imagem"
 *     entregaria documento fiscal de servidor em rota pública. A conferência
 *     do Content-Type é a última linha antes disso.
 *
 * @returns {Promise<boolean>} false se não existe ou não é imagem
 */
export async function entregaImagem(res, valorNoBanco) {
  const chave = resolveChave(valorNoBanco);
  if (!chave) return false;

  const arq = await (await armazenamento()).abre(chave);
  if (!arq) return false;

  const tipo = arq.contentType || '';
  if (!/^image\/(jpeg|png)$/.test(tipo)) {
    console.error('[imagem] chave não é imagem, entrega recusada:', chave, tipo);
    return false;
  }

  res.setHeader('Content-Type', tipo);
  if (arq.bytes != null) res.setHeader('Content-Length', String(arq.bytes));
  res.setHeader('Content-Disposition', 'inline');
  // O endereço carrega ?v=<sha8>, então uma troca de foto é um endereço novo:
  // dá para guardar por muito tempo sem prender a imagem antiga na tela.
  res.setHeader('Cache-Control', 'public, max-age=86400');

  await new Promise((resolve, reject) => {
    arq.stream.on('error', reject);
    res.on('finish', resolve);
    res.on('close', resolve);
    arq.stream.pipe(res);
  });
  return true;
}
