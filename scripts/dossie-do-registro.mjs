#!/usr/bin/env node
/**
 * Monta a documentação técnica do programa para registro no INPI, e o hash dela.
 *
 * POR QUE ISTO EXISTE
 *
 * O INPI não recebe o código-fonte. Ele recebe o RESUMO DIGITAL (hash) de uma
 * documentação técnica que o titular guarda consigo. O certificado do programa
 * registrado em fev/2025 (BR512025000647-0) traz "Algoritmo hash: SHA-256" e um
 * resumo digital — e nada além disso identifica o que foi depositado.
 *
 * Daí a única coisa que importa aqui: **o hash tem de ser re-derivável**. Num
 * litígio, anos depois, alguém precisa pegar o repositório no commit declarado,
 * rodar este script e obter o mesmo número. Se não obtiver, o depósito não prova
 * nada sobre este código.
 *
 * O QUE TORNA O RESULTADO DETERMINÍSTICO
 *
 *   1. A lista de arquivos vem de `git ls-files`, não do sistema de arquivos:
 *      o que está versionado no commit é o que entra, sem depender de o que
 *      sobrou no diretório de quem rodou.
 *   2. A ordenação é por byte do caminho, nunca pela ordem local (que muda com
 *      o locale do sistema).
 *   3. NÃO há data de geração no arquivo. Carimbo de tempo é a forma mais fácil
 *      de produzir um hash diferente a cada execução — e aí o número deixa de
 *      provar qualquer coisa. O que data o conteúdo é o commit, que é verificável.
 *   4. Fim de linha normalizado para LF. Um checkout em Windows converteria CRLF
 *      e mudaria o hash sem mudar uma linha de código.
 *
 * O QUE NÃO ENTRA, E POR QUÊ
 *
 *   - `archive/`: são TRÊS outros repositórios incorporados, com história
 *     própria. Depositá-los dentro de um registro deste programa descreveria
 *     mal o que se está registrando.
 *   - `docs/`: documentação de negócio e jurídica, não é o programa.
 *   - `node_modules/`: código de terceiros. Registrar obra alheia como própria
 *     é o oposto do que o registro serve para provar.
 *   - Qualquer `.env` que não seja o `.example`, chaves e certificados: o
 *     script ABORTA se encontrar, em vez de depositar segredo em documento que
 *     vai para a gaveta do INPI.
 *
 * Binário (imagem, PDF, fonte) não tem como entrar numa listagem de texto:
 * aparece no manifesto com o hash próprio, e o arquivo é guardado junto.
 *
 * USO
 *   node scripts/dossie-do-registro.mjs [caminho-de-saida]
 */

import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** O que é o programa. Tudo o que estiver fora destes prefixos fica de fora. */
const DENTRO = [
  'backend/',
  'frontend/',
  'scripts/',
  '.github/workflows/'
];

/** Dentro dos prefixos acima, o que ainda assim não entra. */
const FORA = [
  /(^|\/)node_modules\//,
  /(^|\/)uploads\//,
  /\.map$/
];

/** Se algum destes aparecer na lista, o script para. Segredo não se deposita. */
const PROIBIDO = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.(?!example)/,
  /\.pem$/,
  /\.key$/,
  /(^|\/)id_rsa/,
  /credenciais/i
];

/** Extensões tratadas como binário: entram no manifesto, não na listagem. */
const BINARIO = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.zip', '.gz'
]);

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();

/** LF sempre: um checkout em Windows mudaria o hash sem mudar o código. */
const normaliza = (texto) => texto.replace(/\r\n/g, '\n');

function arquivosVersionados() {
  const saida = execFileSync('git', ['-C', RAIZ, 'ls-files', '-z'], { maxBuffer: 64 * 1024 * 1024 });
  return saida.toString('utf8').split('\0').filter(Boolean);
}

function main() {
  const destino = process.argv[2] || path.join(RAIZ, 'REGISTRO-INPI.txt');

  const commit = execFileSync('git', ['-C', RAIZ, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const sujo = execFileSync('git', ['-C', RAIZ, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
  if (sujo) {
    console.error('\nABORTADO: a árvore de trabalho tem alterações não commitadas.\n');
    console.error('O hash precisa apontar para um commit. Com arquivo modificado fora do');
    console.error('commit, ninguém consegue re-derivar o número depois.\n');
    console.error(sujo.split('\n').slice(0, 10).join('\n'));
    process.exit(1);
  }

  const todos = arquivosVersionados();

  const selecionados = todos
    .filter(p => DENTRO.some(d => p.startsWith(d)))
    .filter(p => !FORA.some(r => r.test(p)))
    .sort();                       // ordem de byte do caminho, não do locale

  const perigosos = selecionados.filter(p => PROIBIDO.some(r => r.test(p)));
  if (perigosos.length) {
    console.error('\nABORTADO: arquivo que pode conter segredo entrou na seleção:\n');
    perigosos.forEach(p => console.error('  ' + p));
    console.error('\nSegredo não vai para documento depositado. Ajuste a seleção.\n');
    process.exit(1);
  }

  if (!selecionados.length) {
    console.error('ABORTADO: nenhum arquivo selecionado.');
    process.exit(1);
  }

  const manifesto = [];
  const listagem = [];
  let linhas = 0;
  let binarios = 0;

  for (const rel of selecionados) {
    const bruto = fs.readFileSync(path.join(RAIZ, rel));
    const ext = path.extname(rel).toLowerCase();

    if (BINARIO.has(ext)) {
      manifesto.push(`${sha256(bruto)}  ${rel}  [binário, ${bruto.length} bytes]`);
      binarios++;
      continue;
    }

    const texto = normaliza(bruto.toString('utf8'));
    manifesto.push(`${sha256(Buffer.from(texto, 'utf8'))}  ${rel}`);
    linhas += texto.split('\n').length;

    listagem.push(`----- INÍCIO: ${rel} -----`);
    listagem.push(texto.replace(/\n$/, ''));
    listagem.push(`----- FIM: ${rel} -----`);
    listagem.push('');
  }

  const cabecalho = [
    'INCENTIVABR',
    'DOCUMENTAÇÃO TÉCNICA PARA REGISTRO DE PROGRAMA DE COMPUTADOR',
    '',
    'Titular e autor: ADACTO ARTUR DORNAS DE OLIVEIRA',
    '',
    `Commit: ${commit}`,
    `Arquivos: ${selecionados.length} (${binarios} binários, listados só no manifesto)`,
    `Linhas de código: ${linhas}`,
    '',
    'Este arquivo é gerado por scripts/dossie-do-registro.mjs a partir do commit',
    'acima. Rodar o script no mesmo commit produz um arquivo idêntico, byte a',
    'byte, e portanto o mesmo resumo digital. Não há data de geração aqui de',
    'propósito: ela tornaria cada execução diferente da anterior.',
    '',
    '='.repeat(78),
    'MANIFESTO — SHA-256 de cada arquivo, em ordem de caminho',
    '='.repeat(78),
    '',
    ...manifesto,
    '',
    '='.repeat(78),
    'LISTAGEM DO CÓDIGO-FONTE',
    '='.repeat(78),
    ''
  ];

  const conteudo = [...cabecalho, ...listagem].join('\n') + '\n';
  fs.writeFileSync(destino, conteudo, 'utf8');

  const resumo = sha256(Buffer.from(conteudo, 'utf8'));

  console.log('');
  console.log('Documentação técnica gerada.');
  console.log('');
  console.log('  Arquivo .......... ' + destino);
  console.log('  Tamanho .......... ' + (conteudo.length / 1024 / 1024).toFixed(2) + ' MB');
  console.log('  Arquivos ......... ' + selecionados.length + ' (' + binarios + ' binários)');
  console.log('  Linhas ........... ' + linhas);
  console.log('  Commit ........... ' + commit);
  console.log('');
  console.log('  Algoritmo hash ... SHA-256');
  console.log('  Resumo digital ... ' + resumo);
  console.log('');
  console.log('É este resumo que vai no formulário do INPI. Guarde o arquivo:');
  console.log('sem ele, o hash não prova nada.');
  console.log('');
}

main();
