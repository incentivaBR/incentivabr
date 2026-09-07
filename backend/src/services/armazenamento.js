/**
 * Armazenamento dos documentos fiscais: comprovante bancário do destinador e
 * Recibo de Mecenato do proponente.
 *
 * Até aqui os dois iam para backend/uploads/, no disco do container. Na
 * Railway esse disco é efêmero: cada deploy apaga tudo. O servidor perdia o
 * comprovante da própria dedução a cada publicação (Raio-X, risco 02).
 *
 * Agora há dois backends com a mesma interface:
 *
 *   s3     qualquer serviço compatível com S3 (Cloudflare R2, AWS S3, Backblaze
 *          B2, MinIO). Ligado quando S3_BUCKET está definido. É o que produção
 *          tem de usar.
 *   local  a pasta backend/uploads/, como antes. Serve para desenvolvimento e
 *          para os testes. Em produção é aceito, mas o boot avisa em vermelho
 *          e /diagnostico marca erro.
 *
 * Toda gravação devolve o SHA-256 do conteúdo, que vai para o banco. Um hash
 * que não bate na hora de baixar é documento trocado ou corrompido.
 *
 * Chaves: `receipts/<uuid>.pdf`, `mecenato/<uuid>.pdf`. Os valores antigos no
 * banco (`/uploads/receipts/x.pdf`) continuam sendo lidos — ver resolveChave.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASTA_LOCAL_PADRAO = path.join(__dirname, '../../uploads');

/** `receipts/2026/09/receipt-<uuid>.pdf` — sem nada vindo do usuário no nome. */
export function novaChave(prefixo, extensao) {
  const d = new Date();
  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${prefixo}/${ano}/${mes}/${prefixo.replace(/s$/, '')}-${crypto.randomUUID()}${extensao}`;
}

/**
 * Traduz o que está no banco para a chave do backend.
 *   /uploads/receipts/receipt-1.pdf  →  receipts/receipt-1.pdf   (legado)
 *   receipts/2026/09/receipt-x.pdf   →  igual                     (novo)
 * Rejeita qualquer coisa com `..` ou barra inicial fora do padrão legado.
 */
export function resolveChave(valorNoBanco) {
  if (!valorNoBanco) return null;
  let chave = String(valorNoBanco).replace(/^\/uploads\//, '');
  chave = chave.replace(/^\/+/, '');
  if (chave.split('/').some(p => p === '..' || p === '')) return null;
  return chave;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ── backend local ──────────────────────────────────────────────────────────
function backendLocal(pasta) {
  const caminhoDe = (chave) => {
    const alvo = path.resolve(pasta, chave);
    if (!alvo.startsWith(path.resolve(pasta) + path.sep)) throw new Error('chave fora da pasta de uploads');
    return alvo;
  };
  return {
    nome: 'local',
    descricao: pasta,
    async guarda(chave, buffer, contentType) {
      const alvo = caminhoDe(chave);
      await fs.promises.mkdir(path.dirname(alvo), { recursive: true });
      await fs.promises.writeFile(alvo, buffer);
      // O tipo fica ao lado, num arquivo pequeno: o disco não guarda MIME.
      await fs.promises.writeFile(alvo + '.tipo', contentType || '');
      return { chave, sha256: sha256(buffer), bytes: buffer.length };
    },
    async abre(chave) {
      const alvo = caminhoDe(chave);
      let stat;
      try { stat = await fs.promises.stat(alvo); } catch { return null; }
      let contentType = null;
      try { contentType = (await fs.promises.readFile(alvo + '.tipo', 'utf8')).trim() || null; } catch { /* legado sem .tipo */ }
      return { stream: fs.createReadStream(alvo), contentType, bytes: stat.size };
    },
    async existe(chave) {
      try { await fs.promises.access(caminhoDe(chave)); return true; } catch { return false; }
    },
    async apaga(chave) {
      const alvo = caminhoDe(chave);
      await fs.promises.rm(alvo, { force: true });
      await fs.promises.rm(alvo + '.tipo', { force: true });
    }
  };
}

// ── backend S3 ─────────────────────────────────────────────────────────────
async function backendS3(cfg, clienteInjetado) {
  let cliente = clienteInjetado;
  let comandos;
  const sdk = await import('@aws-sdk/client-s3');
  comandos = sdk;
  if (!cliente) {
    cliente = new sdk.S3Client({
      region: cfg.regiao || 'auto',
      endpoint: cfg.endpoint || undefined,
      forcePathStyle: Boolean(cfg.endpoint),   // R2, MinIO e B2 querem path-style
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
    });
  }
  const Bucket = cfg.bucket;
  return {
    nome: 's3',
    descricao: `${cfg.endpoint || 's3'}/${Bucket}`,
    async guarda(chave, buffer, contentType) {
      const hash = sha256(buffer);
      await cliente.send(new comandos.PutObjectCommand({
        Bucket, Key: chave, Body: buffer, ContentType: contentType,
        ChecksumSHA256: Buffer.from(hash, 'hex').toString('base64'),
        Metadata: { sha256: hash }
      }));
      return { chave, sha256: hash, bytes: buffer.length };
    },
    async abre(chave) {
      try {
        const r = await cliente.send(new comandos.GetObjectCommand({ Bucket, Key: chave }));
        const corpo = r.Body;
        const stream = typeof corpo?.pipe === 'function' ? corpo
          : Readable.from(corpo?.transformToByteArray ? [await corpo.transformToByteArray()] : [corpo]);
        return { stream, contentType: r.ContentType || null, bytes: r.ContentLength ?? null };
      } catch (erro) {
        if (erro?.name === 'NoSuchKey' || erro?.$metadata?.httpStatusCode === 404) return null;
        throw erro;
      }
    },
    async existe(chave) {
      try { await cliente.send(new comandos.HeadObjectCommand({ Bucket, Key: chave })); return true; }
      catch (erro) {
        if (erro?.name === 'NotFound' || erro?.$metadata?.httpStatusCode === 404) return false;
        throw erro;
      }
    },
    async apaga(chave) {
      await cliente.send(new comandos.DeleteObjectCommand({ Bucket, Key: chave }));
    }
  };
}

/** Lê a configuração do ambiente. Exportada para /diagnostico. */
export function configuracaoDoAmbiente(env = process.env) {
  if (env.S3_BUCKET) {
    return {
      backend: 's3',
      bucket: env.S3_BUCKET,
      endpoint: env.S3_ENDPOINT || null,
      regiao: env.S3_REGION || 'auto',
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      completa: Boolean(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY)
    };
  }
  return { backend: 'local', pasta: env.UPLOADS_DIR || PASTA_LOCAL_PADRAO, completa: true };
}

/**
 * Monta um armazenamento. Sem argumentos, lê o ambiente. Os testes injetam
 * `cliente` (um S3Client falso) ou `pasta`.
 */
export async function criaArmazenamento({ cfg = configuracaoDoAmbiente(), cliente } = {}) {
  if (cfg.backend === 's3') {
    if (!cfg.completa && !cliente) {
      throw new Error('S3_BUCKET definido sem S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY');
    }
    return backendS3(cfg, cliente);
  }
  return backendLocal(cfg.pasta);
}

// Instância única do processo, criada na primeira chamada.
let instancia = null;
export async function armazenamento() {
  if (!instancia) instancia = await criaArmazenamento();
  return instancia;
}

/** Só para testes: troca a instância do processo. */
export function usaArmazenamento(a) { instancia = a; ultimaVerificacao = null; }

// ── sonda: o armazenamento funciona de verdade? ────────────────────────────
//
// Ter S3_BUCKET e as chaves definidas não prova nada: chave trocada, endpoint
// com o nome do bucket no fim ou token sem permissão de escrita só aparecem
// no primeiro upload de um servidor público. Então o servidor faz o upload
// ele mesmo, na subida: grava um arquivo de sonda, lê de volta e apaga. O
// resultado vai para /diagnostico e para o log.
let ultimaVerificacao = null;

export async function verificaArmazenamento(arm) {
  const inicio = new Date().toISOString();
  try {
    arm = arm || await armazenamento();
    const chave = `_diagnostico/sonda-${crypto.randomUUID()}.txt`;
    const corpo = Buffer.from(`sonda ${inicio}`);
    const gravado = await arm.guarda(chave, corpo, 'text/plain');

    const lido = await arm.abre(chave);
    if (!lido) throw new Error('gravou, mas não conseguiu ler de volta');
    const partes = [];
    await new Promise((res, rej) => {
      lido.stream.on('data', p => partes.push(p));
      lido.stream.on('end', res);
      lido.stream.on('error', rej);
    });
    if (sha256(Buffer.concat(partes)) !== gravado.sha256) throw new Error('conteúdo lido difere do gravado');

    await arm.apaga(chave);
    ultimaVerificacao = { ok: true, em: inicio, backend: arm.nome };
  } catch (erro) {
    ultimaVerificacao = {
      ok: false, em: inicio, backend: arm?.nome || null,
      // Nome do erro do SDK (AccessDenied, NoSuchBucket, InvalidAccessKeyId…)
      // é o que diagnostica; a mensagem completa pode trazer o endpoint.
      erro: `${erro?.name || 'Erro'}: ${String(erro?.message || erro).slice(0, 200)}`
    };
  }
  return ultimaVerificacao;
}

/** A última sonda, para o /diagnostico. null = ainda não rodou. */
export function ultimaVerificacaoDoArmazenamento() { return ultimaVerificacao; }

/**
 * Estado para o /diagnostico e para o aviso de boot. Em produção com backend
 * local, é erro: os documentos somem no próximo deploy.
 */
export function estadoDoArmazenamento(env = process.env) {
  const cfg = configuracaoDoAmbiente(env);
  const producao = env.NODE_ENV === 'production';
  if (cfg.backend === 's3') {
    const v = ultimaVerificacao;
    let status = cfg.completa ? 'ok' : 'error';
    let aviso = cfg.completa ? null : 'S3_BUCKET definido sem as chaves de acesso';
    if (cfg.completa && v && !v.ok) {
      status = 'error';
      aviso = `A sonda de gravação no bucket falhou: ${v.erro}. Confira S3_ENDPOINT (sem o nome do bucket no fim), as chaves e a permissão do token.`;
    }
    return {
      status,
      backend: 's3',
      bucket: cfg.bucket,
      endpoint: cfg.endpoint,
      verificado: v ? v.ok : null,
      verificado_em: v?.em || null,
      aviso
    };
  }
  return {
    status: producao ? 'error' : 'ok',
    backend: 'local',
    aviso: producao
      ? 'Documentos no disco do container: somem a cada deploy. Configure S3_BUCKET (ver docs/operacao/armazenamento.md).'
      : null
  };
}
