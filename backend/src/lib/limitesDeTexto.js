/**
 * O limite de cada campo de texto é dado, não constante.
 *
 * O PROBLEMA
 *
 * A tela de clientes grava o que o superadmin digita em colunas com limite
 * curto: `bank_account` tem 30, `bank_agency` e `contact_phone` têm 20. Colar
 * "Banco do Brasil agência 0000-0 conta 00000-0" no campo da conta derrubava o
 * cadastro com erro 22001, e a rota respondia o mesmo `Erro interno.` que
 * responde para qualquer outra falha. Quem estava cadastrando não descobria
 * qual campo tinha recusado — e tentava de novo, igual.
 *
 * POR QUE NÃO UMA LISTA NO CÓDIGO
 *
 * Escrever `{ bank_account: 30 }` aqui seria uma segunda cópia do schema, e
 * cópias divergem: no dia em que uma migration alargar a coluna, a validação
 * continuaria recusando pelo número velho. É a mesma razão pela qual o teto
 * fiscal vem de `tetos_deducao` e não de uma constante.
 *
 * Os limites vêm de `information_schema`, que é o próprio banco dizendo quanto
 * cabe. Lidos uma vez por processo e guardados em memória: o schema não muda
 * sem deploy, e uma consulta por requisição seria desperdício.
 *
 * O QUE ISTO NÃO É
 *
 * Não é validação de formato. Não sabe o que é uma agência nem um CNPJ —
 * sabe quanto cabe na coluna. Formato é outra conversa, e inventá-la aqui
 * recusaria dado legítimo que ainda não conhecemos.
 */
import pool from '../../config/database.js';

/** "tabela.coluna" → comprimento máximo. Preenchido na primeira consulta. */
let cache = null;

/**
 * Lê do banco o comprimento máximo de toda coluna de texto com limite.
 *
 * @param {{query: Function}} [executor]
 */
export async function limitesDeTexto(executor = pool) {
  if (cache) return cache;
  const { rows } = await executor.query(`
    SELECT table_name, column_name, character_maximum_length
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND character_maximum_length IS NOT NULL`);
  cache = new Map(rows.map(r => [`${r.table_name}.${r.column_name}`, r.character_maximum_length]));
  return cache;
}

/** Só para teste: a próxima chamada relê o schema. */
export function esqueceLimites() { cache = null; }

/**
 * Confere os campos de um corpo de requisição contra a tabela de destino.
 *
 * Campo ausente, nulo ou vazio não é conferido: quem decide se ele é
 * obrigatório é a rota, e `NOT NULL` é outra regra com outra mensagem.
 *
 * @param {string} tabela
 * @param {object} valores   - corpo da requisição (chave = nome da coluna)
 * @param {object} [rotulos] - nome do campo como a tela o chama
 * @returns {Promise<{ok: true} | {ok: false, campo: string, limite: number, tamanho: number, erro: string}>}
 */
export async function confereTamanhos(tabela, valores, rotulos = {}, executor = pool) {
  const limites = await limitesDeTexto(executor);
  for (const [coluna, valor] of Object.entries(valores || {})) {
    if (typeof valor !== 'string' || valor === '') continue;
    const limite = limites.get(`${tabela}.${coluna}`);
    if (!limite || valor.length <= limite) continue;
    const rotulo = rotulos[coluna] || coluna;
    return {
      ok: false,
      campo: coluna,
      limite,
      tamanho: valor.length,
      // A mensagem diz o campo, o limite e o que veio: sem os três, quem
      // está cadastrando tenta de novo igual.
      erro: `O campo "${rotulo}" aceita até ${limite} caracteres e recebeu ${valor.length}. ` +
            `Informe só o dado, sem o nome do banco nem texto em volta.`
    };
  }
  return { ok: true };
}

export default { limitesDeTexto, confereTamanhos, esqueceLimites };
