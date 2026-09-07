// Os documentos fiscais saem do disco do container (Raio-X, risco 02).
//
// Este teste cobre o adaptador em si: o backend local numa pasta temporaria,
// o backend S3 com um cliente falso que guarda em memoria, a traducao das
// chaves antigas e a decisao de tipo pelos primeiros bytes do arquivo.
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

process.env.NODE_ENV = 'test';

const { criaArmazenamento, resolveChave, novaChave, estadoDoArmazenamento, configuracaoDoAmbiente,
        verificaArmazenamento, usaArmazenamento } =
  await import('../src/services/armazenamento.js');
const { identificaArquivo, extensaoPermitida } = await import('../src/lib/validaArquivo.js');

const ok = [], falhas = [];
const teste = async (nome, fn) => { try { await fn(); ok.push(nome); } catch (e) { falhas.push([nome, e.message]); } };
const igual = (a, b, o) => { if (a !== b) throw new Error(`${o}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), crypto.randomBytes(64)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), crypto.randomBytes(64)]);
const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), crypto.randomBytes(64)]);
const lerTudo = (stream) => new Promise((res, rej) => {
  const partes = []; stream.on('data', p => partes.push(p)); stream.on('end', () => res(Buffer.concat(partes))); stream.on('error', rej);
});
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ── tipo pelo conteudo ─────────────────────────────────────────────────────
await teste('identifica PDF, PNG e JPG pelos primeiros bytes', () => {
  igual(identificaArquivo(PDF, 'c.pdf')?.mime, 'application/pdf', 'pdf');
  igual(identificaArquivo(PNG, 'c.png')?.mime, 'image/png', 'png');
  igual(identificaArquivo(JPG, 'c.jpeg')?.mime, 'image/jpeg', 'jpg');
});

await teste('conteudo de um tipo com extensao de outro e recusado', () => {
  igual(identificaArquivo(PNG, 'c.pdf'), null, 'png chamado de pdf');
  igual(identificaArquivo(Buffer.from('MZ\x90\x00 executavel qualquer coisa'), 'c.pdf'), null, 'exe chamado de pdf');
});

await teste('a extensao e conferida com ancora: .xpdf nao passa', () => {
  igual(extensaoPermitida('comprovante.xpdf'), false, 'xpdf');
  igual(extensaoPermitida('comprovante.pdf.exe'), false, 'pdf.exe');
  igual(extensaoPermitida('COMPROVANTE.PDF'), true, 'maiusculo');
});

// ── chaves ─────────────────────────────────────────────────────────────────
await teste('chave nova nao leva nada do usuario e tem prefixo/ano/mes', () => {
  const k = novaChave('receipts', '.pdf');
  if (!/^receipts\/\d{4}\/\d{2}\/receipt-[0-9a-f-]{36}\.pdf$/.test(k)) throw new Error(k);
});

await teste('valor legado /uploads/... vira chave; caminho com .. e recusado', () => {
  igual(resolveChave('/uploads/receipts/receipt-1.pdf'), 'receipts/receipt-1.pdf', 'legado');
  igual(resolveChave('receipts/2026/09/receipt-x.pdf'), 'receipts/2026/09/receipt-x.pdf', 'novo');
  igual(resolveChave('/uploads/../config/database.js'), null, 'escape');
  igual(resolveChave(null), null, 'nulo');
});

// ── backend local ──────────────────────────────────────────────────────────
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-'));
const local = await criaArmazenamento({ cfg: { backend: 'local', pasta } });

await teste('local: guarda, devolve sha256 e abre de volta com o tipo', async () => {
  const k = novaChave('receipts', '.pdf');
  const g = await local.guarda(k, PDF, 'application/pdf');
  igual(g.sha256, sha(PDF), 'sha256');
  igual(g.bytes, PDF.length, 'bytes');
  const a = await local.abre(k);
  igual(a.contentType, 'application/pdf', 'contentType');
  igual(Buffer.compare(await lerTudo(a.stream), PDF), 0, 'conteudo');
  igual(await local.existe(k), true, 'existe');
});

await teste('local: chave inexistente devolve null; chave fora da pasta e recusada', async () => {
  igual(await local.abre('receipts/nao-existe.pdf'), null, 'inexistente');
  let erro = null;
  try { await local.guarda('../fora.pdf', PDF, 'application/pdf'); } catch (e) { erro = e; }
  if (!erro) throw new Error('gravou fora da pasta');
});

await teste('local: le arquivo legado gravado sem o .tipo', async () => {
  fs.mkdirSync(path.join(pasta, 'receipts'), { recursive: true });
  fs.writeFileSync(path.join(pasta, 'receipts/receipt-legado.pdf'), PDF);
  const a = await local.abre(resolveChave('/uploads/receipts/receipt-legado.pdf'));
  if (!a) throw new Error('nao abriu o legado');
  igual(a.contentType, null, 'sem tipo conhecido');
});

// ── backend S3 com cliente falso ───────────────────────────────────────────
const objetos = new Map();
const clienteFalso = {
  async send(cmd) {
    const nome = cmd.constructor.name;
    const { Bucket, Key } = cmd.input;
    if (Bucket !== 'bucket-teste') throw new Error('bucket errado: ' + Bucket);
    if (nome === 'PutObjectCommand') { objetos.set(Key, { body: Buffer.from(cmd.input.Body), tipo: cmd.input.ContentType }); return {}; }
    const o = objetos.get(Key);
    if (nome === 'HeadObjectCommand') { if (!o) throw Object.assign(new Error('nf'), { name: 'NotFound' }); return {}; }
    if (nome === 'DeleteObjectCommand') { objetos.delete(Key); return {}; }
    if (nome === 'GetObjectCommand') {
      if (!o) throw Object.assign(new Error('nk'), { name: 'NoSuchKey' });
      const { Readable } = await import('stream');
      return { Body: Readable.from([o.body]), ContentType: o.tipo, ContentLength: o.body.length };
    }
    throw new Error('comando inesperado ' + nome);
  }
};
const s3 = await criaArmazenamento({
  cfg: { backend: 's3', bucket: 'bucket-teste', endpoint: 'https://x.r2.cloudflarestorage.com', regiao: 'auto', completa: false },
  cliente: clienteFalso
});

await teste('s3: guarda com ContentType e sha256, abre em stream', async () => {
  const k = novaChave('mecenato', '.png');
  const g = await s3.guarda(k, PNG, 'image/png');
  igual(g.sha256, sha(PNG), 'sha256');
  igual(objetos.get(k).tipo, 'image/png', 'ContentType enviado');
  const a = await s3.abre(k);
  igual(a.contentType, 'image/png', 'contentType');
  igual(a.bytes, PNG.length, 'bytes');
  igual(Buffer.compare(await lerTudo(a.stream), PNG), 0, 'conteudo');
  igual(await s3.existe(k), true, 'existe');
  igual(await s3.existe('mecenato/nao.png'), false, 'nao existe');
});

await teste('s3: chave inexistente devolve null, nao lanca', async () => {
  igual(await s3.abre('receipts/nao-existe.pdf'), null, 'abre');
});

// ── sonda: grava, le e apaga ───────────────────────────────────────────────
await teste('sonda no backend local: ok e nao deixa arquivo para tras', async () => {
  const v = await verificaArmazenamento(local);
  igual(v.ok, true, 'ok: ' + (v.erro || ''));
  igual(v.backend, 'local', 'backend');
  const sobras = fs.existsSync(path.join(pasta, '_diagnostico')) ? fs.readdirSync(path.join(pasta, '_diagnostico')) : [];
  igual(sobras.length, 0, 'arquivos de sonda restantes');
});

await teste('sonda no s3 falso: ok e apaga o objeto', async () => {
  const antes = objetos.size;
  const v = await verificaArmazenamento(s3);
  igual(v.ok, true, 'ok: ' + (v.erro || ''));
  igual(objetos.size, antes, 'objeto de sonda apagado');
});

await teste('sonda com chave recusada: erro nomeado, e o estado vira error', async () => {
  const recusa = { async send() { throw Object.assign(new Error('The AWS Access Key Id you provided does not exist'), { name: 'InvalidAccessKeyId' }); } };
  const quebrado = await criaArmazenamento({
    cfg: { backend: 's3', bucket: 'b', endpoint: 'https://x', regiao: 'auto', completa: false }, cliente: recusa
  });
  usaArmazenamento(quebrado);
  const v = await verificaArmazenamento();
  igual(v.ok, false, 'ok');
  if (!v.erro.startsWith('InvalidAccessKeyId')) throw new Error('erro sem o nome do SDK: ' + v.erro);
  const e = estadoDoArmazenamento({ NODE_ENV: 'production', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'a', S3_SECRET_ACCESS_KEY: 's' });
  igual(e.status, 'error', 'status');
  igual(e.verificado, false, 'verificado');
  if (!e.aviso.includes('InvalidAccessKeyId')) throw new Error('aviso sem o motivo: ' + e.aviso);
  usaArmazenamento(null);
});

// ── estado para o diagnostico ──────────────────────────────────────────────
await teste('producao sem S3_BUCKET e erro; com bucket e chaves e ok', () => {
  igual(estadoDoArmazenamento({ NODE_ENV: 'production' }).status, 'error', 'prod local');
  igual(estadoDoArmazenamento({ NODE_ENV: 'development' }).status, 'ok', 'dev local');
  igual(estadoDoArmazenamento({ NODE_ENV: 'production', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'a', S3_SECRET_ACCESS_KEY: 's' }).status, 'ok', 'prod s3');
  igual(estadoDoArmazenamento({ NODE_ENV: 'production', S3_BUCKET: 'b' }).status, 'error', 'bucket sem chaves');
  igual(configuracaoDoAmbiente({ S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'a', S3_SECRET_ACCESS_KEY: 's' }).backend, 's3', 'cfg');
});

await teste('s3 sem chaves e sem cliente injetado nao sobe', async () => {
  let erro = null;
  try { await criaArmazenamento({ cfg: { backend: 's3', bucket: 'b', completa: false } }); } catch (e) { erro = e; }
  if (!erro) throw new Error('subiu sem credenciais');
});

fs.rmSync(pasta, { recursive: true, force: true });

console.log('\n' + '='.repeat(64));
ok.forEach(n => console.log('  ok    ' + n));
falhas.forEach(([n, m]) => console.log('  FALHA ' + n + '\n          ' + m));
console.log('='.repeat(64));
console.log(`${ok.length} passaram, ${falhas.length} falharam`);
process.exit(falhas.length ? 1 : 0);
