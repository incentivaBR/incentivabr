// O prazo para apresentar o comprovante ao órgão que emite o recibo.
//
// A Resolução Normativa nº 125/2026 do CDCA/DF, art. 7º, dá ao contribuinte
// 60 dias DA DATA DA DOAÇÃO para levar o comprovante à Secretaria Executiva
// do CDCA/DF — e é isso que faz o recibo sair. Sem recibo não há dedução,
// com o dinheiro já transferido. É o único prazo do produto que mata o
// benefício depois de a pessoa ter pagado.
//
// O que estes testes guardam:
//   - o prazo conta da TRANSFERÊNCIA, não do registro nem da conferência;
//   - fundo sem prazo (Rouanet) não inventa contagem;
//   - sem a data da transferência não há prazo — e não um prazo zerado;
//   - recibo emitido encerra a contagem;
//   - o dia do vencimento ainda está dentro; o seguinte, não;
//   - o número dos dias vem do banco, não do código;
//   - a rota de upload recusa data no futuro e data malformada.
import { newDb } from 'pg-mem';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

process.env.NODE_ENV = 'test';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};
const igual = (a, b, o) => {
  if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
};

const { prazoDoComprovante, frasePrazo, formataDia, prazoDaOrganizacao, AVISO_ANTECEDENCIA_DIAS } =
  await import('../src/lib/prazos.js');

// O fundo do DF, como a migration 048 o cadastra.
const FDCA = {
  prazo_comprovante_dias: 60,
  prazo_comprovante_orgao: 'Secretaria Executiva do CDCA/DF',
  prazo_comprovante_base_legal: 'Resolução Normativa CDCA/DF nº 125, de 06/05/2026, art. 7º'
};
const em = iso => new Date(`${iso}T12:00:00Z`);

// ───────────────────────────────────────────────────────────────────────────
// 1. De que data o prazo conta
// ───────────────────────────────────────────────────────────────────────────

await teste('conta da transferencia, e 60 dias depois ainda esta dentro', () => {
  const p = prazoDoComprovante({ ...FDCA, transferido_em: '2026-03-01' }, em('2026-04-01'));
  igual(p.transferido_em, '2026-03-01', 'inicio');
  igual(p.vence_em, '2026-04-30', 'vencimento (1º de marco + 60 dias)');
  igual(p.dias_restantes, 29, 'dias restantes em 1º de abril');
  igual(p.vencido, false, 'nao vencido');
  igual(p.dias, 60, 'o numero de dias vem do fundo');
});

await teste('o dia do vencimento ainda conta; o seguinte, nao', () => {
  const base = { ...FDCA, transferido_em: '2026-03-01' };
  const noDia = prazoDoComprovante(base, em('2026-04-30'));
  igual(noDia.dias_restantes, 0, 'no dia do vencimento');
  igual(noDia.vencido, false, 'o ultimo dia ainda vale');

  const depois = prazoDoComprovante(base, em('2026-05-01'));
  igual(depois.dias_restantes, -1, 'um dia depois');
  igual(depois.vencido, true, 'venceu');
});

await teste('NAO conta do registro na plataforma nem da conferencia', () => {
  // Registrada em janeiro, transferida em março: o prazo é de março.
  const p = prazoDoComprovante(
    { ...FDCA, transferido_em: '2026-03-01', created_at: '2026-01-05', confirmed_at: '2026-03-20' },
    em('2026-04-01')
  );
  igual(p.vence_em, '2026-04-30', 'o vencimento segue a transferencia');
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Quando NÃO há prazo — e a ausência é informação, não campo vazio
// ───────────────────────────────────────────────────────────────────────────

await teste('fundo sem prazo (Rouanet) nao inventa contagem', () => {
  igual(prazoDoComprovante({ transferido_em: '2026-03-01' }), null, 'sem prazo_comprovante_dias');
  igual(prazoDoComprovante({ prazo_comprovante_dias: null, transferido_em: '2026-03-01' }), null, 'nulo');
  igual(prazoDoComprovante({ prazo_comprovante_dias: 0, transferido_em: '2026-03-01' }), null, 'zero');
});

await teste('sem a data da transferencia nao ha prazo, e nao um prazo zerado', () => {
  igual(prazoDoComprovante({ ...FDCA }), null, 'sem data');
  igual(prazoDoComprovante({ ...FDCA, transferido_em: null }), null, 'data nula');
  igual(prazoDoComprovante({ ...FDCA, transferido_em: 'nao é data' }), null, 'data invalida');
});

await teste('recibo emitido encerra a contagem', () => {
  const p = prazoDoComprovante(
    { ...FDCA, transferido_em: '2026-03-01', mecenato_issued_at: '2026-03-10' },
    em('2026-09-01')
  );
  igual(p, null, 'com recibo emitido nao ha prazo a cobrar');
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Urgência e texto
// ───────────────────────────────────────────────────────────────────────────

await teste('urgente so perto do fim, e nunca depois de vencer', () => {
  const base = { ...FDCA, transferido_em: '2026-03-01' };  // vence 30/04
  igual(prazoDoComprovante(base, em('2026-03-10')).urgente, false, 'longe do fim');
  igual(prazoDoComprovante(base, em('2026-04-20')).urgente, true, 'faltando 10 dias');
  igual(prazoDoComprovante(base, em('2026-05-10')).urgente, false, 'ja vencido nao e urgente, e vencido');
  if (AVISO_ANTECEDENCIA_DIAS <= 0) throw new Error('a antecedencia do aviso precisa ser positiva');
});

await teste('a frase diz o orgao, a data e quanto falta', () => {
  const p = prazoDoComprovante({ ...FDCA, transferido_em: '2026-03-01' }, em('2026-04-01'));
  const f = frasePrazo(p);
  if (!f.includes('29 dias'))                         throw new Error(`faltou o prazo: ${f}`);
  if (!f.includes('Secretaria Executiva do CDCA/DF')) throw new Error(`faltou o orgao: ${f}`);
  if (!f.includes('30/04/2026'))                      throw new Error(`faltou a data: ${f}`);

  const vencido = frasePrazo(prazoDoComprovante({ ...FDCA, transferido_em: '2026-03-01' }, em('2026-05-06')));
  if (!/venceu/.test(vencido))  throw new Error(`a frase de vencido nao avisa: ${vencido}`);
  if (!/6 dias/.test(vencido))  throw new Error(`nao diz ha quanto tempo venceu: ${vencido}`);

  const hoje = frasePrazo(prazoDoComprovante({ ...FDCA, transferido_em: '2026-03-01' }, em('2026-04-30')));
  if (!/último dia/i.test(hoje)) throw new Error(`o ultimo dia precisa ser dito: ${hoje}`);

  igual(frasePrazo(null), null, 'sem prazo, sem frase');
  igual(formataDia('2026-04-30'), '30/04/2026', 'formato brasileiro');
  igual(formataDia('lixo'), '', 'data invalida vira vazio');
});

// ───────────────────────────────────────────────────────────────────────────
// 4. O número vem do banco, não do código
// ───────────────────────────────────────────────────────────────────────────

await teste('outro conselho com outro prazo é respeitado', () => {
  const p = prazoDoComprovante(
    { prazo_comprovante_dias: 30, prazo_comprovante_orgao: 'Conselho de outro municipio',
      transferido_em: '2026-03-01' },
    em('2026-03-11')
  );
  igual(p.dias, 30, 'usa o prazo do fundo');
  igual(p.vence_em, '2026-03-31', '1º de marco + 30 dias');
});

await teste('nenhum arquivo do backend escreve 60 dias a mao', () => {
  const dir = path.join(RAIZ, 'backend/src');
  const arquivos = [];
  (function anda(d) {
    for (const nome of fs.readdirSync(d)) {
      const p = path.join(d, nome);
      const s = fs.statSync(p);
      if (s.isDirectory()) anda(p);
      else if (nome.endsWith('.js')) arquivos.push(p);
    }
  })(dir);

  const culpados = [];
  for (const a of arquivos) {
    const texto = fs.readFileSync(a, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')          // comentários de bloco
      .replace(/^[ \t]*\/\/.*$/gm, '')           // comentários de linha
      // Conversão de tempo — "1000 * 60 * 60 * 24" é milissegundo, não prazo.
      // Sem apagar isto, a guarda acusa toda conta de data do backend.
      .replace(/\b\d+\s*(\*\s*\d+\s*)+/g, ' ');

    // O que se procura é o 60 como PRAZO: na mesma linha que a palavra, ou
    // atribuído a algo que se chama prazo.
    for (const linha of texto.split('\n')) {
      if (!/\b60\b/.test(linha)) continue;
      if (/prazo|comprovante|dias/i.test(linha)) culpados.push(`${path.relative(RAIZ, a)}: ${linha.trim()}`);
    }
  }
  if (culpados.length) {
    throw new Error('prazo escrito no código, e ele é dado do fundo: ' + culpados.join(', '));
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 5. A migration cadastra o fundo com o prazo, e sem dado bancário
// ───────────────────────────────────────────────────────────────────────────

await teste('a 048 cadastra o FDCA-DF com prazo, orgao e base legal', () => {
  const sql = fs.readFileSync(
    path.join(RAIZ, 'backend/src/migrations/048_prazo_do_comprovante.sql'), 'utf8');
  for (const trecho of ['FDCA-DF', '60', 'Secretaria Executiva do CDCA/DF', 'nº 125', 'art. 7º']) {
    if (!sql.includes(trecho)) throw new Error(`a migration nao registra "${trecho}"`);
  }
});

await teste('a 048 NAO grava agencia, conta nem CNPJ do fundo', () => {
  const sql = fs.readFileSync(
    path.join(RAIZ, 'backend/src/migrations/048_prazo_do_comprovante.sql'), 'utf8');
  const semComentario = sql.replace(/^--.*$/gm, '');

  // Os números publicados na RN 125. Dado bancário vem do banco, por tenant.
  for (const proibido of ['044149', '15.558.339', '15558339']) {
    if (semComentario.includes(proibido)) {
      throw new Error(`dado bancario do fundo gravado em migration: ${proibido}`);
    }
  }
  if (/INSERT INTO official_funds[\s\S]{0,600}\b(bank_code|agency|account|cnpj)\b/i.test(semComentario)) {
    throw new Error('o INSERT do fundo toca em coluna bancaria');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 6. O prazo do tenant, para avisar ANTES de a pessoa transferir
// ───────────────────────────────────────────────────────────────────────────

const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});
db.public.none(`
  CREATE TABLE official_funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT, name TEXT,
    prazo_comprovante_dias INT, prazo_comprovante_orgao TEXT, prazo_comprovante_base_legal TEXT);
  CREATE TABLE org_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID,
    official_fund_id UUID, is_active BOOLEAN DEFAULT true, is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW());
`);
const pgMem = db.adapters.createPg();
const pool = new pgMem.Pool();

const orgComPrazo = crypto.randomUUID();
const orgSemPrazo = crypto.randomUUID();
const { rows: [fdca] } = await pool.query(
  `INSERT INTO official_funds (code, prazo_comprovante_dias, prazo_comprovante_orgao, prazo_comprovante_base_legal)
   VALUES ('FDCA-DF', 60, 'Secretaria Executiva do CDCA/DF', 'RN 125/2026, art. 7º') RETURNING id`);
const { rows: [fnc] } = await pool.query(
  `INSERT INTO official_funds (code, prazo_comprovante_dias) VALUES ('FNC', NULL) RETURNING id`);
await pool.query(`INSERT INTO org_projects (organization_id, official_fund_id) VALUES ($1, $2)`,
  [orgComPrazo, fdca.id]);
await pool.query(`INSERT INTO org_projects (organization_id, official_fund_id) VALUES ($1, $2)`,
  [orgSemPrazo, fnc.id]);

await teste('a organizacao do FDCA sabe o prazo antes de qualquer destinacao', async () => {
  const p = await prazoDaOrganizacao(orgComPrazo, pool);
  igual(p.dias, 60, 'dias');
  igual(p.orgao, 'Secretaria Executiva do CDCA/DF', 'orgao');
  if (!p.base_legal) throw new Error('faltou a base legal');
});

await teste('a organizacao da Rouanet nao tem prazo, e diz isso com null', async () => {
  igual(await prazoDaOrganizacao(orgSemPrazo, pool), null, 'sem prazo');
  igual(await prazoDaOrganizacao(null, pool), null, 'sem organizacao');
});

console.log('\nPrazo do comprovante\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
