/**
 * "Este trecho está DENTRO de um elemento marcado com X?"
 *
 * Comparar posições no texto não responde isso: a marca pode estar num bloco
 * que já fechou antes do trecho. E procurar por linha também não: uma tag
 * pode ocupar duas linhas, e aí o atributo está numa e o texto na outra —
 * foi assim que uma guarda acusou vazamento onde não havia.
 *
 * Então aqui se percorre as tags mantendo a pilha de elementos abertos, que é
 * o que um navegador faz.
 */

const VAZIAS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img',
                        'input', 'link', 'meta', 'source', 'track', 'wbr']);

const emBranco = t => ' '.repeat(t.length);

/**
 * Some com o que o navegador não mostra, sem mover nada de lugar: conteúdo de
 * <script> e <style>, e comentários HTML. Cada trecho vira espaço do mesmo
 * tamanho, então as posições continuam valendo.
 *
 * Os comentários entram nesta lista porque os desta base explicam POR QUE uma
 * marca existe, e citam os nomes que a guarda procura. Sem apagá-los, a
 * guarda acusava o comentário que a documenta.
 */
export const semScripts = html =>
  html
    .replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi,
      (_m, abre, _tag, dentro, fecha) => abre + emBranco(dentro) + fecha)
    .replace(/<!--[\s\S]*?-->/g, emBranco);

/** Os elementos abertos na posição dada, do mais externo ao mais interno. */
export function pilhaEm(texto, posicao) {
  const pilha = [];
  const tags = /<(\/?)([a-z0-9-]+)([^>]*?)(\/?)>/gi;
  let m;
  while ((m = tags.exec(texto)) !== null) {
    if (m.index >= posicao) break;
    const [, barra, nome, atributos, fechaSozinha] = m;
    const tag = nome.toLowerCase();
    if (barra) {
      const i = pilha.map(e => e.nome).lastIndexOf(tag);
      if (i >= 0) pilha.length = i;
    } else if (!VAZIAS.has(tag) && !fechaSozinha) {
      pilha.push({ nome: tag, atributos });
    }
  }
  return pilha;
}

/**
 * @param {string} html   a página inteira
 * @param {string} marca  o atributo procurado, ex. 'data-so-plataforma'
 * @param {string} alvo   um trecho literal do HTML
 * @returns {boolean} se a PRIMEIRA ocorrência do alvo está sob a marca
 */
export function dentroDe(html, marca, alvo) {
  const texto = semScripts(html);
  const posicao = texto.indexOf(alvo);
  if (posicao < 0) throw new Error('não achei no HTML: ' + alvo);
  const procura = new RegExp('\\b' + marca + '\\b');
  return pilhaEm(texto, posicao).some(e => procura.test(e.atributos));
}

/**
 * Toda ocorrência do alvo está sob alguma das marcas?
 *
 * É a pergunta certa para "este nome nunca aparece solto": basta uma
 * ocorrência fora para o texto estar fixo em algum lugar. `marcas` aceita uma
 * marca ou várias — um nome pode ser legítimo tanto preenchido pelo tenant
 * (`data-privacidade`) quanto dentro do bloco que só a plataforma mostra
 * (`data-so-plataforma`).
 *
 * @returns {{total: number, fora: number, exemplo: string|null}}
 */
export function todasDentroDe(html, marcas, alvo) {
  const texto = semScripts(html);
  const procuras = (Array.isArray(marcas) ? marcas : [marcas])
    .map(m => new RegExp('\\b' + m + '\\b'));
  let total = 0, fora = 0, exemplo = null, de = 0, posicao;
  while ((posicao = texto.indexOf(alvo, de)) >= 0) {
    total++;
    const pilha = pilhaEm(texto, posicao);
    if (!pilha.some(e => procuras.some(p => p.test(e.atributos)))) {
      fora++;
      if (!exemplo) exemplo = texto.slice(Math.max(0, posicao - 60), posicao + 60).replace(/\s+/g, ' ');
    }
    de = posicao + alvo.length;
  }
  return { total, fora, exemplo };
}
