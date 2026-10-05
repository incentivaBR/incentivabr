// O campo longo demais diz QUAL campo é.
//
// O PROBLEMA
//
// A tela de clientes grava o que o superadmin digita em colunas com limite
// curto. Colar "Banco do Brasil agência 0000-0 conta 00000-0" no campo da
// conta derrubava o cadastro com erro 22001 do Postgres, e a rota respondia o
// mesmo `Erro interno.` que responde para qualquer outra falha — são 18 no
// arquivo. Quem estava cadastrando não descobria qual campo recusou, e tentava
// de novo igual.
//
// Achado percorrendo o cadastro de um cliente do zero contra um Postgres real.
//
// A ESCOLHA QUE IMPORTA
//
// O limite vem do BANCO (`information_schema`), não de uma lista aqui. Uma
// lista `{ bank_account: 30 }` no código seria uma segunda cópia do schema, e
// cópias divergem: no dia em que uma migration alargar a coluna, a validação
// continuaria recusando pelo número velho. É a mesma razão pela qual o teto
// fiscal vem de `tetos_deducao` e não de uma constante.
//
// E não é validação de formato: a função não sabe o que é uma agência, sabe
// quanto cabe. Inventar formato aqui recusaria dado legítimo que ainda não
// conhecemos.
import { confereTamanhos, limitesDeTexto, esqueceLimites } from '../src/lib/limitesDeTexto.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};

/** Um banco de mentira que responde só o que `information_schema` responderia. */
const bancoFalso = (colunas) => ({
  chamadas: 0,
  async query() {
    this.chamadas++;
    return { rows: colunas };
  }
});

const COLUNAS = [
  { table_name: 'org_projects',  column_name: 'bank_account',  character_maximum_length: 30 },
  { table_name: 'org_projects',  column_name: 'bank_agency',   character_maximum_length: 20 },
  { table_name: 'org_projects',  column_name: 'uf',            character_maximum_length: 2 },
  { table_name: 'organizations', column_name: 'contact_phone', character_maximum_length: 20 }
];

await teste('campo que cabe passa', async () => {
  esqueceLimites();
  const r = await confereTamanhos('org_projects', { bank_account: '00000-0', uf: 'DF' }, {}, bancoFalso(COLUNAS));
  if (!r.ok) throw new Error('recusou valor que cabe: ' + r.erro);
});

await teste('campo longo demais e recusado dizendo QUAL, quanto cabe e quanto veio', async () => {
  esqueceLimites();
  const colado = 'Banco do Brasil agencia 0000-0 conta corrente 00000-0 de captacao';
  const r = await confereTamanhos('org_projects', { bank_account: colado },
    { bank_account: 'Conta' }, bancoFalso(COLUNAS));
  if (r.ok) throw new Error('aceitou 65 caracteres numa coluna de 30');
  if (r.campo !== 'bank_account') throw new Error('nao disse qual campo: ' + r.campo);
  if (!/Conta/.test(r.erro))  throw new Error('nao usou o nome da tela: ' + r.erro);
  if (!/30/.test(r.erro))     throw new Error('nao disse quanto cabe: ' + r.erro);
  if (!/65/.test(r.erro))     throw new Error('nao disse quanto veio: ' + r.erro);
});

await teste('o limite vem do BANCO, nao de uma lista no codigo', async () => {
  // A prova: com o schema dizendo 80, o mesmo valor que antes era recusado
  // passa. Uma lista escrita no codigo nao mudaria de ideia.
  esqueceLimites();
  const largo = COLUNAS.map(c =>
    c.column_name === 'bank_account' ? { ...c, character_maximum_length: 80 } : c);
  const r = await confereTamanhos('org_projects',
    { bank_account: 'Banco do Brasil agencia 0000-0 conta corrente 00000-0 de captacao' },
    {}, bancoFalso(largo));
  if (!r.ok) throw new Error('ignorou o limite do schema: ' + r.erro);

  // E nenhum numero de coluna esta escrito no modulo.
  const fonte = fs.readFileSync(path.join(AQUI, '../src/lib/limitesDeTexto.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if (/bank_account|bank_agency|contact_phone|:\s*(20|30)\b/.test(fonte)) {
    throw new Error('ha limite ou nome de coluna escrito no modulo');
  }
});

await teste('o schema e lido uma vez por processo, nao a cada requisicao', async () => {
  esqueceLimites();
  const banco = bancoFalso(COLUNAS);
  await confereTamanhos('org_projects', { bank_account: 'a' }, {}, banco);
  await confereTamanhos('org_projects', { bank_account: 'b' }, {}, banco);
  await limitesDeTexto(banco);
  if (banco.chamadas !== 1) throw new Error('consultou o schema ' + banco.chamadas + ' vezes');
});

await teste('campo vazio, nulo ou ausente nao e conferido', async () => {
  // Obrigatoriedade e outra regra, com outra mensagem: NOT NULL nao se
  // confunde com "nao cabe".
  esqueceLimites();
  const r = await confereTamanhos('org_projects',
    { bank_account: '', bank_agency: null, uf: undefined }, {}, bancoFalso(COLUNAS));
  if (!r.ok) throw new Error('reclamou de campo vazio: ' + r.erro);
});

await teste('coluna sem limite (TEXT) nao e conferida', async () => {
  esqueceLimites();
  const r = await confereTamanhos('org_projects',
    { descricao: 'x'.repeat(5000) }, {}, bancoFalso(COLUNAS));
  if (!r.ok) throw new Error('inventou limite para coluna sem limite: ' + r.erro);
});

await teste('as rotas que gravam texto digitado conferem antes de escrever', async () => {
  const rotas = fs.readFileSync(path.join(AQUI, '../src/routes/admin.js'), 'utf8');
  const semComentario = rotas.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if (!/confereTamanhos\('organizations'/.test(semComentario)) {
    throw new Error('o cadastro de cliente nao confere os tamanhos');
  }
  if (!/confereTamanhos\('org_projects'/.test(semComentario)) {
    throw new Error('o cadastro de projeto nao confere os tamanhos');
  }
  // E a conferencia vem ANTES do INSERT: depois dele seria o 22001 de novo.
  for (const tabela of ['organizations', 'org_projects']) {
    const confere = semComentario.indexOf(`confereTamanhos('${tabela}'`);
    const insere  = semComentario.indexOf(`INSERT INTO ${tabela} (`);
    if (confere === -1 || insere === -1 || confere > insere) {
      throw new Error(`a conferencia de ${tabela} nao vem antes do INSERT`);
    }
  }
});

console.log('\nO campo longo demais diz qual campo é\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
