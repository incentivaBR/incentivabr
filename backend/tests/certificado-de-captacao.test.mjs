// O Certificado de Autorização para Captação, e o que a validade dele decide.
//
// No FDCA/DF a OSC só capta com autorização do CDCA/DF, com prazo de dois
// anos prorrogáveis (RN 125/2026, arts. 12 a 15). O que torna isto mais que
// um campo de data é o art. 15, § 2º, IV: deixar o prazo extinguir sem pedido
// de prorrogação manda os recursos JÁ CAPTADOS para a universalidade da
// política distrital. A OSC perde o dinheiro que levantou, por decurso de
// prazo, sem que ninguém faça nada.
//
// O que estes testes guardam:
//   - projeto sem certificado não inventa situação (a Rouanet não usa);
//   - as DUAS validades contam, e a que vence primeiro manda;
//   - a tela sabe QUAL venceu — registro da OSC ou autorização;
//   - a janela dos seis meses acende o aviso;
//   - o aviso de vencido diz o que acontece com o dinheiro;
//   - data invertida é recusada no cadastro;
//   - a rota de prorrogação existe e não deixa mexer em projeto de outro
//     cliente.
import { newDb } from 'pg-mem';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'teste';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');

const ok = [], falhas = [];
const teste = async (nome, fn) => {
  try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); }
};
const igual = (a, b, o) => {
  if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
};

const { situacaoDoCertificado, fraseDoCertificado, validaCertificado, JANELA_PRORROGACAO_DIAS } =
  await import('../src/lib/certificado.js');

const em = iso => new Date(`${iso}T12:00:00Z`);

// ───────────────────────────────────────────────────────────────────────────
// 1. Sem certificado não há situação
// ───────────────────────────────────────────────────────────────────────────

await teste('projeto sem certificado nao inventa situacao', () => {
  igual(situacaoDoCertificado({}), null, 'vazio');
  igual(situacaoDoCertificado({ pronac: '123456', titulo: 'Projeto Rouanet' }), null, 'Rouanet');
  igual(situacaoDoCertificado({ certificado_numero: 'RES 10/2026' }), null, 'numero sem validade nao basta');
  igual(fraseDoCertificado(null), null, 'sem situacao, sem frase');
});

// ───────────────────────────────────────────────────────────────────────────
// 2. As duas validades, e a que vence primeiro
// ───────────────────────────────────────────────────────────────────────────

await teste('vigente quando as duas validades estao longe', () => {
  const c = situacaoDoCertificado({
    certificado_valido_ate: '2028-05-10', registro_osc_valido_ate: '2028-09-30'
  }, em('2026-09-22'));
  igual(c.situacao, 'vigente', 'situacao');
  igual(c.o_que_vence, 'autorizacao', 'a autorizacao vence primeiro');
  igual(c.vence_em, '2028-05-10', 'data');
  igual(c.pode_prorrogar, false, 'longe demais para a janela');
});

await teste('o registro da OSC vencendo antes e quem manda', () => {
  // A autorização vale mais dois anos, mas o registro da entidade vence já.
  const c = situacaoDoCertificado({
    certificado_valido_ate: '2028-05-10', registro_osc_valido_ate: '2026-11-30'
  }, em('2026-09-22'));
  igual(c.o_que_vence, 'registro', 'quem vence primeiro');
  igual(c.vence_em, '2026-11-30', 'data do registro');
  igual(c.situacao, 'vence_em_breve', 'dentro da janela');

  // E a frase precisa dizer QUAL venceu: "autorização vencida" seria mentira.
  const f = fraseDoCertificado(c);
  if (!/registro da OSC/i.test(f)) throw new Error(`a frase nao diz que e o registro: ${f}`);
});

await teste('so uma das duas datas ja basta para haver situacao', () => {
  igual(situacaoDoCertificado({ certificado_valido_ate: '2028-01-01' }, em('2026-09-22')).situacao,
        'vigente', 'so autorizacao');
  igual(situacaoDoCertificado({ registro_osc_valido_ate: '2028-01-01' }, em('2026-09-22')).o_que_vence,
        'registro', 'so registro');
});

// ───────────────────────────────────────────────────────────────────────────
// 3. A janela do art. 15, § 1º
// ───────────────────────────────────────────────────────────────────────────

await teste('a janela dos seis meses acende o aviso', () => {
  const base = { certificado_valido_ate: '2027-03-31' };
  const fora  = situacaoDoCertificado(base, em('2026-06-01'));
  const dentro = situacaoDoCertificado(base, em('2026-12-01'));

  igual(fora.situacao, 'vigente', 'antes da janela');
  igual(fora.pode_prorrogar, false, 'ainda nao');
  igual(dentro.situacao, 'vence_em_breve', 'dentro da janela');
  igual(dentro.pode_prorrogar, true, 'e hora de pedir');
  igual(JANELA_PRORROGACAO_DIAS, 180, 'seis meses do § 1º');
});

await teste('o aviso da janela manda procurar o CDCA e explica o risco', () => {
  const c = situacaoDoCertificado({ certificado_valido_ate: '2027-03-31' }, em('2026-12-01'));
  const f = fraseDoCertificado(c);
  if (!/CDCA\/DF/.test(f))                 throw new Error(`nao manda procurar o Conselho: ${f}`);
  if (!/art\. 15/.test(f))                 throw new Error(`nao cita o dispositivo: ${f}`);
  if (!/universalidade da política/i.test(f)) throw new Error(`nao diz o que acontece com o dinheiro: ${f}`);
  if (!/31\/03\/2027/.test(f))             throw new Error(`nao diz a data: ${f}`);
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Vencido — e o que a norma faz com o dinheiro
// ───────────────────────────────────────────────────────────────────────────

await teste('vencido conta os dias e diz para onde vai o dinheiro', () => {
  const c = situacaoDoCertificado({ certificado_valido_ate: '2026-09-01' }, em('2026-09-22'));
  igual(c.situacao, 'vencido', 'situacao');
  igual(c.dias_restantes, -21, 'dias negativos');

  const f = fraseDoCertificado(c);
  if (!/21 dias/.test(f))                     throw new Error(`nao diz ha quanto venceu: ${f}`);
  if (!/universalidade da política/i.test(f)) throw new Error(`nao diz o destino dos recursos: ${f}`);
  if (!/§ 2º, IV/.test(f))                    throw new Error(`nao cita o dispositivo: ${f}`);
});

await teste('registro vencido NAO promete perda dos recursos', () => {
  // O art. 15, § 2º, IV fala do prazo de CAPTAÇÃO. Dizer a mesma coisa quando
  // o que venceu foi o registro da entidade seria inventar consequência.
  const c = situacaoDoCertificado({ registro_osc_valido_ate: '2026-09-01' }, em('2026-09-22'));
  const f = fraseDoCertificado(c);
  if (/universalidade/i.test(f)) throw new Error(`atribuiu ao registro uma consequencia da autorizacao: ${f}`);
  if (!/CDCA\/DF/.test(f))       throw new Error(`deveria mandar procurar o Conselho: ${f}`);
});

await teste('o dia do vencimento ainda conta como dentro', () => {
  const c = situacaoDoCertificado({ certificado_valido_ate: '2026-09-22' }, em('2026-09-22'));
  igual(c.dias_restantes, 0, 'zero');
  igual(c.situacao, 'vence_em_breve', 'no ultimo dia ainda da para agir');
});

// ───────────────────────────────────────────────────────────────────────────
// 5. O que é recusado no cadastro
// ───────────────────────────────────────────────────────────────────────────

await teste('datas malformadas e invertidas sao recusadas', () => {
  igual(validaCertificado({ certificado_valido_ate: '31/03/2027' }).ok, false, 'formato brasileiro');
  igual(validaCertificado({ certificado_valido_ate: 'amanha' }).ok, false, 'texto');
  const invertida = validaCertificado({
    certificado_publicado_em: '2026-05-06', certificado_valido_ate: '2026-01-01'
  });
  igual(invertida.ok, false, 'validade antes da publicacao');
  if (!/anterior à publicação/i.test(invertida.erro)) throw new Error(`erro pouco claro: ${invertida.erro}`);
});

await teste('meta de captacao precisa ser positiva, e vazio e nulo', () => {
  igual(validaCertificado({ meta_captacao: '-5' }).ok, false, 'negativa');
  igual(validaCertificado({ meta_captacao: '0' }).ok, false, 'zero');
  igual(validaCertificado({ meta_captacao: 'muito' }).ok, false, 'texto');
  igual(validaCertificado({ meta_captacao: '' }).valores.meta_captacao, null, 'vazio vira nulo');
  igual(validaCertificado({ meta_captacao: '150000.50' }).valores.meta_captacao, 150000.5, 'valor');
});

await teste('projeto sem certificado nenhum passa (a Rouanet nao usa)', () => {
  const r = validaCertificado({});
  igual(r.ok, true, 'aceita');
  igual(r.valores.certificado_valido_ate, null, 'nulo');
  igual(r.valores.certificado_numero, null, 'nulo');
});

// ───────────────────────────────────────────────────────────────────────────
// 6. A migration
// ───────────────────────────────────────────────────────────────────────────

await teste('a 049 cadastra as duas validades e cita os dispositivos', () => {
  const sql = fs.readFileSync(
    path.join(RAIZ, 'backend/src/migrations/049_certificado_de_captacao.sql'), 'utf8');
  for (const campo of ['certificado_numero', 'certificado_publicado_em', 'certificado_valido_ate',
                       'registro_osc_valido_ate', 'meta_captacao']) {
    if (!sql.includes(campo)) throw new Error(`falta a coluna ${campo}`);
  }
  for (const citacao of ['art. 14', 'art. 15', '§ 2º, IV', 'art. 12, III']) {
    if (!sql.includes(citacao)) throw new Error(`falta a citacao de ${citacao}`);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 7. A rota de prorrogação
// ───────────────────────────────────────────────────────────────────────────

const db = newDb();
db.public.registerFunction({
  name: 'gen_random_uuid', returns: 'uuid', impure: true,
  implementation: () => crypto.randomUUID()
});
db.public.none(`
  CREATE TABLE organizations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, slug TEXT);
  CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), nome TEXT, email TEXT,
    is_superadmin BOOLEAN DEFAULT false, encerrada_em TIMESTAMP, anonimizada_em TIMESTAMP);
  CREATE TABLE org_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID,
    pronac TEXT, fund_code TEXT, titulo TEXT, is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    certificado_numero TEXT, certificado_publicado_em DATE, certificado_valido_ate DATE,
    registro_osc_valido_ate DATE, meta_captacao NUMERIC,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());
  CREATE TABLE incentive_groups (code TEXT, name TEXT, teto_codigo TEXT,
    disponivel_para_cliente BOOLEAN DEFAULT false, motivo_indisponivel TEXT, law_slug TEXT);
  CREATE TABLE audit_log (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID, user_id UUID, action TEXT, entity_type TEXT, entity_id TEXT,
    details JSONB, ip_address TEXT, user_agent TEXT, created_at TIMESTAMP DEFAULT NOW());
`);
const pgMem = db.adapters.createPg();
const pool = new pgMem.Pool();
const { default: poolReal } = await import('../config/database.js');
poolReal.query = (...a) => pool.query(...a);
poolReal.connect = async () => ({ query: (...a) => pool.query(...a), release() {} });

const { rows: [chefe] } = await pool.query(
  `INSERT INTO users (nome, email, is_superadmin) VALUES ('Chefe','c@x','t') RETURNING id`);
const { rows: [orgA] } = await pool.query(`INSERT INTO organizations (name) VALUES ('Casa A') RETURNING id`);
const { rows: [orgB] } = await pool.query(`INSERT INTO organizations (name) VALUES ('Casa B') RETURNING id`);
const { rows: [projA] } = await pool.query(
  `INSERT INTO org_projects (organization_id, fund_code, titulo, certificado_valido_ate)
   VALUES ($1, 'FDCA-DF', 'Projeto da Casa A', '2027-01-31') RETURNING id`, [orgA.id]);

const { default: adminRoutes } = await import('../src/routes/admin.js');
const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);
const servidor = http.createServer(app);
await new Promise(r => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const cracha = jwt.sign({ userId: chefe.id, isSuperadmin: true }, 'teste');
const chama = (metodo, rota, corpo) => fetch(base + rota, {
  method: metodo,
  headers: { Authorization: `Bearer ${cracha}`, 'Content-Type': 'application/json' },
  body: corpo ? JSON.stringify(corpo) : undefined
});

await teste('prorrogar move a validade e fica no audit_log', async () => {
  const r = await chama('PUT', `/api/admin/orgs/${orgA.id}/projects/${projA.id}`,
    { certificado_numero: 'Resolução 88/2027', certificado_valido_ate: '2029-01-31',
      certificado_publicado_em: '2026-11-10', meta_captacao: 250000 });
  igual(r.status, 200, 'status');
  const corpo = await r.json();
  igual(corpo.project.certificado_valido_ate.slice(0, 10), '2029-01-31', 'nova validade');
  igual(corpo.certificado?.situacao ?? corpo.project.certificado.situacao, 'vigente', 'volta a vigente');

  const { rows } = await pool.query(
    `SELECT entity_id FROM audit_log WHERE action = 'projeto.certificado'`);
  igual(rows.length, 1, 'um registro');
  igual(rows[0].entity_id, projA.id, 'o projeto certo');
});

await teste('nao da para mexer no certificado de projeto de outro cliente', async () => {
  const r = await chama('PUT', `/api/admin/orgs/${orgB.id}/projects/${projA.id}`,
    { certificado_valido_ate: '2030-01-01' });
  igual(r.status, 404, 'recusado');

  const { rows } = await pool.query(
    'SELECT certificado_valido_ate FROM org_projects WHERE id = $1', [projA.id]);
  igual(rows[0].certificado_valido_ate.toISOString().slice(0, 10), '2029-01-31', 'nada mudou');
});

await teste('a listagem devolve a situacao calculada, nao guardada', async () => {
  const corpo = await (await chama('GET', `/api/admin/orgs/${orgA.id}/projects`)).json();
  const p = corpo.projects[0];
  if (!p.certificado) throw new Error('a listagem nao trouxe a situacao');
  igual(p.certificado.numero, 'Resolução 88/2027', 'numero');
  if (!p.certificado_texto) throw new Error('faltou a frase para a tela');
});

servidor.close();

console.log('\nCertificado de Autorização para Captação\n');
ok.forEach(n => console.log('  ok   ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n         ' + m));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam\n`);
process.exit(falhas.length ? 1 : 0);
