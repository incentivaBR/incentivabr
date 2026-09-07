import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, '../../../frontend/assets/logo-incentivabr.png');

/**
 * Gera codigo de verificacao unico para o comprovante
 */
function gerarCodigoVerificacao(donationId, createdAt) {
  const data = `${donationId}-${createdAt}-incentivabr`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16).toUpperCase();
}

/**
 * Formata valor em moeda brasileira
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

/**
 * Formata data no padrao brasileiro
 */
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Formata data e hora no padrao brasileiro
 */
function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Mascara CPF para exibicao parcial
 */
function maskCPF(cpf) {
  if (!cpf || cpf.length !== 11) return cpf;
  return `***.${cpf.substring(3, 6)}.${cpf.substring(6, 9)}-**`;
}

/**
 * Gera o documento em PDF da destinacao.
 *
 * ATENCAO ao que este documento NAO e. Na Lei Rouanet, o papel que o
 * contribuinte usa para deduzir e o RECIBO DE MECENATO, emitido pelo
 * PROPONENTE no modelo do Ministerio da Cultura, em tres vias. A plataforma
 * nao emite esse recibo e nao deve sugerir que emitira: o que ela produz e o
 * REGISTRO da operacao — util para controle pessoal e para pedir o recibo a
 * quem o emite, nao para substitui-lo.
 *
 * @param {Object} donation
 * @param {Object} user
 * @param {Object} project
 * @param {Object} fund
 * @param {Object} [opts]
 * @param {boolean} [opts.simulacao] - forca o modo; por padrao segue SIMULATION_MODE
 * @returns {PDFDocument}
 */
export function gerarComprovante(donation, user, project, fund, opts = {}) {
  // O padrao vem do ambiente para que nenhum chamador esqueca de informar e
  // acabe emitindo um documento de producao a partir de dados ficticios.
  const simulacao = opts.simulacao !== undefined
    ? Boolean(opts.simulacao)
    : process.env.SIMULATION_MODE === 'true';

  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: {
      Title: simulacao
        ? 'Simulacao de Destinacao - IncentivaBR'
        : 'Registro de Destinacao - IncentivaBR',
      Author: 'IncentivaBR',
      Subject: simulacao
        ? 'Simulacao de destinacao de incentivo fiscal'
        : 'Registro de operacao - nao substitui o Recibo de Mecenato',
      Keywords: 'incentivo, fiscal, destinacao, rouanet, mecenato'
    }
  });

  const codigoVerificacao = gerarCodigoVerificacao(donation.id, donation.created_at);
  const dataEmissao = new Date().toLocaleString('pt-BR');

  // Paleta do manual da marca IncentivaBR. Os valores anteriores (#1E3A5F,
  // #F7941D) eram de um protótipo antigo e não constam do manual.
  const primaryColor   = '#0F1E3D';
  const secondaryColor = '#EE985C';
  const textColor      = '#333333';
  const mutedColor     = '#666666';

  // ===== CABECALHO =====
  try {
    doc.image(LOGO_PATH, { width: 180, align: 'center' });
    doc.moveDown(0.5);
  } catch (_) {
    doc.fontSize(24).fillColor(primaryColor).text('IncentivaBR', { align: 'center' });
    doc.moveDown(0.3);
  }

  doc.fontSize(10)
     .fillColor(mutedColor)
     .text('Transforme seu imposto em impacto social', { align: 'center' });

  doc.moveDown(0.8);

  // Linha separadora
  doc.strokeColor(secondaryColor)
     .lineWidth(2)
     .moveTo(50, doc.y)
     .lineTo(545, doc.y)
     .stroke();

  doc.moveDown(1);

  // ===== BOX DE NATUREZA DO DOCUMENTO =====
  // O que muda entre simulação e produção não é a estética: é o que o
  // documento afirma ser. Em produção ele precisa dizer, na cara, que não é o
  // Recibo de Mecenato — senão o destinador arquiva isto achando que tem o
  // documento da declaração e descobre em abril que não tem.
  const boxY = doc.y;
  const boxH = 125;
  doc.rect(50, boxY, 495, boxH).fillAndStroke('#0D1B3E', '#1a2f5e');

  // texto com y explícito para não depender do cursor após fillAndStroke
  doc.fontSize(11).fillColor('#FFD700')
     .text(simulacao
             ? 'DOCUMENTO DE SIMULAÇÃO — INCENTIVABR'
             : 'REGISTRO DE OPERAÇÃO — NÃO É O RECIBO DE MECENATO',
           70, boxY + 14, { width: 455, align: 'center' });

  doc.fontSize(9).fillColor('#FFFFFF')
     .text(simulacao
             ? 'Este documento foi gerado em modo de simulação. Nenhum valor foi ou será transferido.'
             : 'O documento que você usa na declaração é o Recibo de Mecenato, emitido pelo proponente.',
           70, boxY + 38, { width: 455, align: 'center' });

  doc.fontSize(9).fillColor('#AAC4E0')
     .text(
       simulacao
         ? 'Em produção, este documento traz seus dados reais e serve como registro pessoal da\n' +
           'operação — o recibo fiscal continua sendo emitido pelo proponente do projeto.'
         : 'Guarde este registro e o comprovante bancário: são eles que você apresenta ao\n' +
           'proponente para receber o Recibo de Mecenato, no modelo do Ministério da Cultura.',
       70, boxY + 60, { width: 455, align: 'center' }
     );

  // avança cursor para abaixo do box
  doc.text('', 50, boxY + boxH + 15);
  doc.moveDown(0.5);

  // ===== TITULO =====
  doc.fontSize(16)
     .fillColor(primaryColor)
     .text(simulacao ? 'COMPROVANTE DE SIMULAÇÃO' : 'REGISTRO DE DESTINAÇÃO', { align: 'center' });

  doc.fontSize(14)
     .text('Lei Rouanet — Destinação de IR', { align: 'center' });

  doc.moveDown(1.5);

  // ===== DADOS DO CONTRIBUINTE =====
  doc.fontSize(12)
     .fillColor(primaryColor)
     .text('DADOS DO CONTRIBUINTE', { underline: true });

  doc.moveDown(0.5);
  doc.fontSize(10)
     .fillColor(textColor);

  const cpfExibicao = maskCPF(user.cpf);

  doc.text(`Nome: ${user.nome}`);
  doc.text(`CPF: ${cpfExibicao}`);
  if (user.email) {
    doc.text(`Email: ${user.email}`);
  }

  doc.moveDown(1);

  // ===== DADOS DA DESTINACAO =====
  doc.fontSize(12)
     .fillColor(primaryColor)
     .text('DADOS DA DESTINACAO', { underline: true });

  doc.moveDown(0.5);
  doc.fontSize(10)
     .fillColor(textColor);

  const percentual = donation.ir_devido > 0
    ? ((donation.donation_amount / donation.ir_devido) * 100).toFixed(2)
    : '0.00';

  doc.text(`Valor Destinado: ${formatCurrency(donation.donation_amount)}`);
  // Dizia "IR Total Declarado", que se confunde com total de rendimentos. É o
  // imposto devido apurado na declaração — a base sobre a qual o limite incide.
  doc.text(`IR Devido Apurado: ${formatCurrency(donation.ir_devido)}`);
  doc.text(`Percentual do IR Devido: ${percentual}%`);
  doc.text(`Ano-Calendario: ${donation.fiscal_year}`);
  doc.text(`Data da Destinacao: ${formatDateTime(donation.created_at)}`);
  doc.text(`Data da Confirmacao: ${donation.confirmed_at ? formatDateTime(donation.confirmed_at) : 'N/A'}`);

  doc.moveDown(1);

  // ===== DADOS DO PROJETO =====
  if (project && project.title) {
    doc.fontSize(12)
       .fillColor(primaryColor)
       .text('PROJETO BENEFICIADO', { underline: true });

    doc.moveDown(0.5);
    doc.fontSize(10)
       .fillColor(textColor);

    doc.text(`Projeto: ${project.title}`);
    if (project.code) {
      doc.text(`Codigo: ${project.code}`);
    }
  }

  doc.moveDown(1);

  // ===== DADOS DO FUNDO =====
  doc.fontSize(12)
     .fillColor(primaryColor)
     .text('FUNDO DESTINATARIO', { underline: true });

  doc.moveDown(0.5);
  doc.fontSize(10)
     .fillColor(textColor);

  doc.text(`Fundo: ${fund.name || 'N/A'}`);
  if (fund.cnpj) {
    doc.text(`CNPJ: ${fund.cnpj}`);
  }
  if (fund.bank_code) {
    doc.text(`Dados Bancarios: Banco ${fund.bank_code} | Ag: ${fund.agency} | CC: ${fund.account}`);
  }

  // Base legal
  doc.moveDown(0.5);
  doc.fontSize(9)
     .fillColor(mutedColor);

  if (fund.code === 'FDCA') {
    doc.text('Base Legal: Art. 260 do ECA (Lei 8.069/90) — Dedução de até 3% do IR devido');
  } else if (fund.code === 'FDI') {
    doc.text('Base Legal: Art. 3º da Lei 12.213/10 — Dedução de até 3% do IR devido');
  } else if (fund.code === 'FNC' || project?.code) {
    // Destinação direta a projeto aprovado tem PRONAC; a base é o art. 18 da
    // Lei 8.313/91, com o limite global do art. 22 da Lei 9.532/97.
    doc.text('Base Legal: Lei 8.313/1991, art. 18 (Lei Rouanet) — Dedução do valor destinado,');
    doc.text('observado o limite global de 6% do IR devido (Lei 9.532/97, art. 22).');
  } else {
    doc.text('Base Legal: Legislação de incentivo fiscal vigente');
  }

  doc.moveDown(2);

  // ===== CODIGO DE VERIFICACAO =====
  doc.rect(50, doc.y, 495, 60)
     .fillAndStroke('#f5f5f5', '#ddd');

  doc.moveDown(0.3);
  doc.fontSize(10)
     .fillColor(primaryColor)
     .text('CODIGO DE VERIFICACAO', { align: 'center' });

  doc.moveDown(0.3);
  doc.fontSize(14)
     .fillColor(textColor)
     .text(codigoVerificacao, { align: 'center', characterSpacing: 2 });

  doc.moveDown(2);

  // ===== AVISO IMPORTANTE =====
  //
  // A versão anterior prometia que "quando você fizer uma destinação real, um
  // comprovante oficial com validade fiscal será emitido". A plataforma nunca
  // vai emitir esse documento: pela Lei 8.313/91 quem emite o Recibo de
  // Mecenato é o proponente do projeto, no modelo do Ministério da Cultura.
  // Manter a promessa seria criar uma expectativa que só se frustra na hora da
  // declaração — o pior momento possível.
  doc.moveDown(1);
  doc.rect(50, doc.y, 495, 70)
     .fillAndStroke('#fff3cd', '#ffc107');

  doc.moveDown(0.3);
  doc.fontSize(10)
     .fillColor('#856404')
     .text(simulacao
             ? 'SIMULAÇÃO — SEM VALIDADE FISCAL'
             : 'REGISTRO DE OPERAÇÃO — NÃO SUBSTITUI O RECIBO DE MECENATO',
           { align: 'center' });

  doc.moveDown(0.3);
  doc.fontSize(9);
  if (simulacao) {
    doc.text('Nenhum valor foi transferido. Este documento é gerado exclusivamente para', { align: 'center' });
    doc.text('demonstrar como funciona o fluxo de destinação.', { align: 'center' });
    doc.text('Numa destinação real, o recibo fiscal é emitido pelo proponente do projeto.', { align: 'center' });
  } else {
    doc.text('Este documento registra a operação realizada por meio da plataforma.', { align: 'center' });
    doc.text('O documento fiscal da dedução é o Recibo de Mecenato, emitido pelo proponente', { align: 'center' });
    doc.text('do projeto no modelo do Ministério da Cultura, em três vias.', { align: 'center' });
  }

  // ===== RODAPE =====
  doc.moveDown(3);
  doc.fontSize(8)
     .fillColor(mutedColor)
     .text(`Documento emitido em: ${dataEmissao}`, { align: 'center' });

  doc.text(`ID da Destinacao: ${donation.id}`, { align: 'center' });

  doc.moveDown(1);
  doc.fontSize(8)
     .text('IncentivaBR — Incentivos Fiscais Simplificados', { align: 'center' });
  doc.text('www.incentivabr.com.br', { align: 'center' });

  doc.moveDown(1);
  doc.fontSize(7)
     .fillColor('#999999')
     .text(
       // Fonte única do texto: scripts/sync-aviso-legal.mjs — mantenha em sincronia.
       '© 2026 Adacto Artur Dornas de Oliveira. Programa de computador registrado no INPI nº BR512025000647‑0. Marca mista depositada sob os processos nº 939403005 (NCL 35) e nº 939403110 (NCL 42). Documentação técnica registrada no 2º Ofício de RTD de Brasília/DF.',
       { align: 'center' }
     );
  doc.text('Reprodução não autorizada sujeita às sanções legais.', { align: 'center' });

  return doc;
}

export default { gerarComprovante };
