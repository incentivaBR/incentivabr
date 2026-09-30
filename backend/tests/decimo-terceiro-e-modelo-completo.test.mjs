// O 13º não entra na base do ajuste anual, e o modelo completo é condição.
//
// DOIS DEFEITOS, O MESMO LUGAR
//
// 1. O 13º INFLAVA O TETO.
//
// A rota somava `rendimento_13` aos rendimentos tributáveis e `inss_13` às
// deduções, tudo na base do ajuste anual. Mas o 13º é tributado
// exclusivamente na fonte: vai na ficha "Rendimentos Sujeitos à Tributação
// Exclusiva/Definitiva", não compõe a base de cálculo da Declaração de Ajuste
// Anual e não gera novo ajuste.
//
// O erro não era de arredondamento. A base inflava, o IR devido inflava, e o
// teto de destinação — que é 6% do IR devido — inflava junto. É errar para
// MAIS, o lado da malha fina: a pessoa destina acima do que a lei permite e
// descobre na declaração.
//
// 2. A CONDIÇÃO ERA NOTA DE PÉ DE PÁGINA.
//
// O valor calculado só volta para quem declara no modelo completo. No desconto
// simplificado não há onde lançar a destinação: o dinheiro sai da conta e não
// abate nada. Isso estava escrito — num parágrafo cinza, embaixo do número,
// onde ninguém para. Quem já viu o valor vai direto ao botão.
//
// A plataforma atende pessoa física no modelo completo, e só. Não calculamos o
// cenário simplificado, de propósito: seria inventar comparação que não é
// nossa. O que fazemos é não deixar alguém destinar achando que abate.
import { newDb } from 'pg-mem';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
process.env.NODE_ENV = 'test';

const db = newDb();
db.public.none(`
  CREATE TABLE tetos_deducao (
    codigo TEXT PRIMARY KEY, descricao TEXT, percentual NUMERIC(5,2), base_legal TEXT,
    vigencia_inicio DATE, vigencia_fim DATE, confirmado_por_parecer BOOLEAN DEFAULT FALSE, observacao TEXT
  );
  CREATE TABLE laws (slug TEXT PRIMARY KEY, name TEXT, base_legal TEXT, orgao TEXT,
    sistema_oficial TEXT, sistema_url TEXT,
    termo_identificador TEXT, termo_beneficiario TEXT, termo_recibo TEXT, termo_recibo_emissor TEXT);
  CREATE TABLE incentive_groups (code TEXT UNIQUE, name TEXT, max_percentage NUMERIC(5,2), teto_codigo TEXT,
    identificador TEXT DEFAULT 'projeto_do_tenant', law_slug TEXT,
    disponivel_para_cliente BOOLEAN DEFAULT false, motivo_indisponivel TEXT,
    sublimite_pct NUMERIC, sublimite_base_legal TEXT);
  INSERT INTO tetos_deducao (codigo, descricao, percentual, base_legal, vigencia_inicio)
    VALUES ('irpf_global_6', 'Teto global', 6.00, 'Lei 9.532/1997, art. 22', '1998-01-01');
  INSERT INTO incentive_groups (code, name, max_percentage, teto_codigo)
    VALUES ('rouanet', 'Lei Rouanet', 6, 'irpf_global_6');
`);
const pgMem = db.adapters.createPg();
const poolFalso = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => poolFalso.query(...a);

const { default: calculatorRoutes } = await import('../src/routes/calculator.js');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.organization = { name: 'IncentivaBR', slug: 'www', incentive_group_code: 'rouanet' };
  next();
});
app.use('/api/calculator', calculatorRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

const calcula = (corpo) =>
  fetch(BASE + '/api/calculator/ir', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
  }).then(r => r.json());

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};
const igual = (a, b, o) => {
  if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
};

/** Um servidor típico: salário, 13º, INSS dos dois, sem dependentes. */
const CASO = {
  rendimentos_tributaveis: 120000,
  rendimento_13: 10000,
  inss: 13200,
  inss_13: 1100
};

// ───────────────────────────────────────────────────────────────────────────
// 1. O 13º fora da base anual
// ───────────────────────────────────────────────────────────────────────────

await teste('o 13o nao entra na base do ajuste anual', async () => {
  const r = await calcula(CASO);
  // 120.000 − 13.200 = 106.800. Nem o 13º nem o INSS dele aparecem.
  igual(r.base_calculo, 106800, 'base de calculo');
  igual(r.rendimentos_total, 120000, 'rendimentos do ajuste anual');
  igual(r.deducoes.total, 13200, 'deducoes');
});

await teste('o INSS do 13o nao e deduzido do rendimento anual', async () => {
  // Deduzir o INSS do 13º sem somar o 13º seria o erro espelhado: baixaria a
  // base e o teto sairia PARA MENOS. Nenhum dos dois entra.
  const semNada = await calcula({ rendimentos_tributaveis: 120000, inss: 13200 });
  const com13   = await calcula(CASO);
  igual(com13.base_calculo, semNada.base_calculo, 'a base nao pode mudar com o 13o');
  igual(com13.ir_devido, semNada.ir_devido, 'nem o IR devido');
  igual(com13.limites_doacao.total_maximo, semNada.limites_doacao.total_maximo, 'nem o teto');
});

await teste('o teto que o defeito inflava, pelo numero', async () => {
  // Como a rota calculava ate set/2026: base 130.000 − 14.300 = 115.700,
  // IR 20.963,72, teto 1.257,82. Como a lei da: base 106.800, IR 18.516,22,
  // teto 1.110,97. R$ 146,85 de folga que nao existe — 13% a mais.
  const r = await calcula(CASO);
  igual(r.ir_devido, 18516.22, 'IR devido');
  igual(r.limites_doacao.total_maximo, 1110.97, 'teto');
  if (r.limites_doacao.total_maximo >= 1257.82) {
    throw new Error('o teto voltou a ser o inflado pelo 13o');
  }
});

await teste('a aliquota efetiva nao e diluida pelo 13o', async () => {
  // Somar o 13º no denominador baixava a alíquota efetiva na tela, que é o
  // número que a pessoa usa para conferir se a conta faz sentido.
  const r = await calcula(CASO);
  igual(r.aliquota_efetiva, Math.round((18516.22 / 120000) * 10000) / 100, 'aliquota efetiva');
});

// ───────────────────────────────────────────────────────────────────────────
// 2. O 13º volta na resposta, dizendo por que ficou de fora
// ───────────────────────────────────────────────────────────────────────────

await teste('o 13o informado volta na resposta, com o motivo', async () => {
  // Fazer o número desaparecer da tela sem explicação é o caminho para a
  // pessoa achar que o campo não funcionou e digitar de novo em outro lugar.
  const r = await calcula(CASO);
  igual(r.decimo_terceiro.rendimento, 10000, 'rendimento');
  igual(r.decimo_terceiro.inss, 1100, 'inss');
  igual(r.decimo_terceiro.entra_no_ajuste, false, 'entra_no_ajuste');
  if (!/exclusiva na fonte/i.test(r.decimo_terceiro.motivo || '')) {
    throw new Error('o motivo nao diz o que e: ' + r.decimo_terceiro.motivo);
  }
});

await teste('a plataforma NAO calcula o imposto do 13o', async () => {
  // Seria outra tabela (a mensal, em separado) e um numero que nao muda o teto,
  // que e a unica coisa que esta rota existe para responder. Afirmar calculo
  // que nao e nosso e o que nao se faz aqui.
  const r = await calcula(CASO);
  const chaves = Object.keys(r.decimo_terceiro);
  for (const proibida of ['ir_fonte', 'imposto', 'ir_devido', 'base_calculo']) {
    if (chaves.includes(proibida)) throw new Error('a rota passou a afirmar ' + proibida + ' do 13o');
  }
});

await teste('sem 13o informado, a resposta nao inventa valor', async () => {
  const r = await calcula({ rendimentos_tributaveis: 120000, inss: 13200 });
  igual(r.decimo_terceiro.rendimento, 0, 'rendimento');
  igual(r.decimo_terceiro.inss, 0, 'inss');
});

// ───────────────────────────────────────────────────────────────────────────
// 3. O modelo completo é condição, não nota de pé
// ───────────────────────────────────────────────────────────────────────────

const CALCULADORA = fs.readFileSync(path.join(RAIZ, 'frontend/calculadora.html'), 'utf8');

await teste('o botao de destinar so aparece depois da pergunta', async () => {
  if (!/id="portaoCompleta"/.test(CALCULADORA)) throw new Error('o portao saiu da pagina');
  // A cada cálculo o portão volta a aparecer e as ações voltam a sumir: quem
  // recalcula com outros números responde de novo.
  const trecho = CALCULADORA.slice(CALCULADORA.indexOf('function mostrarResultado'));
  if (!/getElementById\('actionsCompleta'\)\.classList\.add\('hidden'\)[\s\S]{0,300}getElementById\('portaoCompleta'\)\.classList\.remove\('hidden'\)/.test(trecho)) {
    throw new Error('o resultado nao volta a esconder o botao e a mostrar o portao');
  }
});

await teste('as duas respostas existem, e a de risco nao libera o botao', async () => {
  for (const id of ['btnSouCompleta', 'btnNaoSei', 'btnConfirmeiCompleta']) {
    if (!CALCULADORA.includes(`id="${id}"`)) throw new Error('falta o botao ' + id);
  }
  // "Simplificado, ou não sei" tem de ESCONDER as ações, nunca liberar.
  const bloco = CALCULADORA.slice(CALCULADORA.indexOf("getElementById('btnNaoSei')"));
  const ate = bloco.slice(0, bloco.indexOf('});') + 3);
  if (/acoes\.classList\.remove\('hidden'\)/.test(ate)) {
    throw new Error('a resposta de risco libera a destinacao');
  }
  if (!/acoes\.classList\.add\('hidden'\)/.test(ate)) {
    throw new Error('a resposta de risco nao esconde a destinacao');
  }
});

await teste('o aviso diz que o valor NAO volta, nao so que "vale para o completo"', async () => {
  // "Este valor vale para quem declara pelo modelo completo" é verdade e não
  // assusta ninguém. O que a pessoa precisa ler é a consequência.
  const aviso = CALCULADORA.slice(
    CALCULADORA.indexOf('id="avisoSimplificada"'),
    CALCULADORA.indexOf('id="avisoSimplificada"') + 1200);
  if (!/n[ãa]o volta para voc[êe]|n[ãa]o abateria nada|sem abater nada/i.test(aviso)) {
    throw new Error('o aviso nao diz a consequencia');
  }
});

await teste('a pagina nao promete comparar completo x simplificado', async () => {
  // Nao calculamos o cenario simplificado, e a pagina nao pode sugerir que
  // calcula: seria oferecer numero que nao existe.
  const limpo = CALCULADORA.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, '');
  if (/(compar|simul)[a-zç]*\s+(o\s+)?(seu\s+)?(desconto\s+)?simplificad/i.test(limpo)) {
    throw new Error('a pagina sugere que compara os dois modelos');
  }
});

await teste('a nota do 13o esta na tela, e so com valor informado', async () => {
  if (!/id="nota13"/.test(CALCULADORA)) throw new Error('a nota do 13o saiu da pagina');
  const js = CALCULADORA.slice(CALCULADORA.indexOf("const t13 = result.decimo_terceiro"));
  if (!/classList\.toggle\('hidden', !temValor\)/.test(js.slice(0, 600))) {
    throw new Error('a nota apareceria com 13o zerado');
  }
});

console.log('\nO 13º fora da base, e o modelo completo como condição\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
