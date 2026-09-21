import express from 'express';
import pool from '../../config/database.js';
import { tetoDoMecanismo } from '../lib/tetos.js';
import { codigoDoMecanismo } from '../lib/mecanismos.js';

const router = express.Router();

// Tabela IR 2026 (ano-calendário 2025)
const TABELA_IR_2026 = [
  { limite: 28467.20, aliquota: 0, deducao: 0 },
  { limite: 33919.80, aliquota: 0.075, deducao: 2135.04 },
  { limite: 45012.60, aliquota: 0.15, deducao: 4679.03 },
  { limite: 55976.16, aliquota: 0.225, deducao: 8054.97 },
  { limite: Infinity, aliquota: 0.275, deducao: 10853.78 }
];

// Constantes de dedução
const DEDUCAO_DEPENDENTE = 2275.08;
const DEDUCAO_EDUCACAO_MAX = 3561.50;

/**
 * Limite de destinação, em fração (0.06 = 6%).
 *
 * O percentual vem de `tetos_deducao`, não daqui. Ele estava escrito como
 * constante em três pontos do código — e é uma TESE JURÍDICA, não um fato do
 * sistema: a interação entre o art. 18 da Lei 8.313/91 e o teto do art. 22 da
 * Lei 9.532/97 ainda depende de parecer tributário. Enquanto morasse no código,
 * cada resposta do tributarista seria um deploy.
 *
 * A organização pode REDUZIR o teto, nunca aumentá-lo. Um cliente que queira ser
 * mais conservador pode; nenhum cliente pode liberar acima da lei.
 */
async function getOrganizationLimits(org) {
  const teto = await tetoDoMecanismo(codigoDoMecanismo(org));
  const tetoLegal = teto.percentual / 100;

  const maxPercent = org?.max_percentage
    ? parseFloat(org.max_percentage) / 100
    : tetoLegal;

  const efetivo = Math.min(maxPercent, tetoLegal);

  return {
    rouanet: efetivo,
    total_maximo: efetivo,
    teto: { codigo: teto.codigo, percentual: teto.percentual, base_legal: teto.base_legal }
  };
}

function calcularIRDevido(baseCalculo) {
  for (const faixa of TABELA_IR_2026) {
    if (baseCalculo <= faixa.limite) {
      const irBruto = baseCalculo * faixa.aliquota;
      const irDevido = Math.max(0, irBruto - faixa.deducao);
      return {
        ir_devido: Math.round(irDevido * 100) / 100,
        aliquota: faixa.aliquota,
        faixa_limite: faixa.limite
      };
    }
  }
  // Última faixa (acima de 55976.16)
  const ultimaFaixa = TABELA_IR_2026[TABELA_IR_2026.length - 1];
  const irBruto = baseCalculo * ultimaFaixa.aliquota;
  const irDevido = irBruto - ultimaFaixa.deducao;
  return {
    ir_devido: Math.round(irDevido * 100) / 100,
    aliquota: ultimaFaixa.aliquota,
    faixa_limite: ultimaFaixa.limite
  };
}

// POST /api/calculator/ir - Calcular IR e limites de doação (sempre declaração completa)
router.post('/ir', async (req, res) => {
  try {
    const {
      rendimentos_tributaveis,
      rendimento_13 = 0,
      dependentes = 0,
      deducao_saude = 0,
      deducao_educacao = 0,
      inss = 0,
      inss_13 = 0,
      previdencia_privada = 0
    } = req.body;

    // Validações básicas
    if (!rendimentos_tributaveis || rendimentos_tributaveis <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Rendimentos tributáveis deve ser maior que zero.'
      });
    }

    const rendimentosTotal = rendimentos_tributaveis + rendimento_13;

    // Declaração completa: deduções legais
    const deducaoDependentes = dependentes * DEDUCAO_DEPENDENTE;
    const deducaoEducacaoLimitada = Math.min(deducao_educacao, DEDUCAO_EDUCACAO_MAX * (dependentes + 1));

    const totalDeducoes =
      deducaoDependentes +
      deducao_saude +
      deducaoEducacaoLimitada +
      inss +
      inss_13 +
      previdencia_privada;

    const baseCalculo = Math.max(0, rendimentosTotal - totalDeducoes);

    const deducoesDetalhadas = {
      dependentes: Math.round(deducaoDependentes * 100) / 100,
      saude: Math.round(deducao_saude * 100) / 100,
      educacao: Math.round(deducaoEducacaoLimitada * 100) / 100,
      inss: Math.round(inss * 100) / 100,
      inss_13: Math.round(inss_13 * 100) / 100,
      previdencia_privada: Math.round(previdencia_privada * 100) / 100,
      total: Math.round(totalDeducoes * 100) / 100
    };

    // Calcular IR devido
    const { ir_devido, aliquota } = calcularIRDevido(baseCalculo);

    // Alíquota efetiva
    const aliquotaEfetiva = rendimentosTotal > 0
      ? Math.round((ir_devido / rendimentosTotal) * 10000) / 100
      : 0;

    // Obter limites baseado na organização/tenant
    const limites = await getOrganizationLimits(req.organization);

    // Calcular limites de doação via Lei Rouanet (6% IR)
    const limitesDoacao = {
      rouanet: Math.round(ir_devido * limites.rouanet * 100) / 100,
      total_maximo: Math.round(ir_devido * limites.total_maximo * 100) / 100
    };

    res.json({
      status: 'success',
      fiscal_year: 2026,
      calendar_year: 2025,
      tipo_declaracao: 'completa',
      pode_destinar: true,
      rendimentos_total: Math.round(rendimentosTotal * 100) / 100,
      deducoes: deducoesDetalhadas,
      base_calculo: Math.round(baseCalculo * 100) / 100,
      ir_devido,
      aliquota_nominal: aliquota * 100,
      aliquota_efetiva: aliquotaEfetiva,
      limites_doacao: limitesDoacao,
      organization: req.organization ? {
        name: req.organization.name,
        slug: req.organization.slug,
        fund_type: req.organization.fund_type,
        max_percentage: parseFloat(req.organization.max_percentage) || 6
      } : null
    });

  } catch (error) {
    console.error('Erro ao calcular IR:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Erro interno ao calcular IR.'
    });
  }
});

// POST /api/calculator/limites-rapido - Calcular limites baseado no IR informado
router.post('/limites-rapido', async (req, res) => {
  try {
    const { ir_devido, fiscal_year = 2026 } = req.body;

    // Validações
    if (!ir_devido || ir_devido <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'IR devido deve ser maior que zero.'
      });
    }

    if (ir_devido > 1000000) {
      return res.status(400).json({
        status: 'error',
        message: 'IR devido não pode exceder R$ 1.000.000,00.'
      });
    }

    // Obter limites baseado na organização/tenant
    const limites = await getOrganizationLimits(req.organization);

    // Calcular limites via Lei Rouanet (6% IR)
    const limitesDoacao = {
      rouanet: Math.round(ir_devido * limites.rouanet * 100) / 100,
      total_maximo: Math.round(ir_devido * limites.total_maximo * 100) / 100
    };

    res.json({
      status: 'success',
      fiscal_year,
      calendar_year: fiscal_year - 1,
      ir_devido: Math.round(ir_devido * 100) / 100,
      tipo_declaracao: 'completa',
      pode_destinar: true,
      limites_doacao: limitesDoacao,
      organization: req.organization ? {
        name: req.organization.name,
        slug: req.organization.slug,
        fund_type: req.organization.fund_type,
        max_percentage: parseFloat(req.organization.max_percentage) || 6
      } : null
    });

  } catch (error) {
    console.error('Erro ao calcular limites rápido:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Erro interno ao calcular limites.'
    });
  }
});

// POST /api/calculator/distribuir - Validar distribuição de doação
router.post('/distribuir', async (req, res) => {
  try {
    const { ir_devido, distribuicao } = req.body;

    // Validações básicas
    if (!ir_devido || ir_devido <= 0) {
      return res.status(400).json({
        status: 'error',
        valid: false,
        message: 'IR devido deve ser maior que zero.'
      });
    }

    if (!distribuicao || !Array.isArray(distribuicao) || distribuicao.length === 0) {
      return res.status(400).json({
        status: 'error',
        valid: false,
        message: 'Distribuição deve conter pelo menos um fundo.'
      });
    }

    // Validar itens da distribuição
    const errors = [];
    let totalDistribuido = 0;
    const projetos = [];

    for (const item of distribuicao) {
      if (!item.pronac || !/^\d{6,7}$/.test(item.pronac)) {
        errors.push(`PRONAC inválido: ${item.pronac}`);
        continue;
      }
      if (!item.valor || item.valor <= 0) {
        errors.push(`Valor para PRONAC ${item.pronac} deve ser maior que zero.`);
        continue;
      }
      totalDistribuido += item.valor;
      projetos.push({ pronac: item.pronac, valor: item.valor });
    }

    // O teto vem do banco, pela mesma função dos demais pontos do cálculo —
    // três cópias do mesmo número era como uma delas ficava para trás.
    const limites = await getOrganizationLimits(req.organization);
    const limiteRouanet = Math.round(ir_devido * limites.total_maximo * 100) / 100;

    if (totalDistribuido > limiteRouanet) {
      errors.push(`Limite de R$ ${limiteRouanet.toFixed(2)} (${limites.teto.percentual}% do IR) excedido. Valor: R$ ${totalDistribuido.toFixed(2)}`);
    }

    const isValid = errors.length === 0;
    const percentageOfIR = ir_devido > 0 ? Math.round((totalDistribuido / ir_devido) * 10000) / 100 : 0;

    res.json({
      status: isValid ? 'success' : 'error',
      valid: isValid,
      total: Math.round(totalDistribuido * 100) / 100,
      percentage_of_ir: percentageOfIR,
      limite_rouanet: limiteRouanet,
      projetos,
      errors
    });

  } catch (error) {
    console.error('Erro ao validar distribuição:', error.message);
    res.status(500).json({
      status: 'error',
      valid: false,
      message: 'Erro interno ao validar distribuição.'
    });
  }
});

export default router;
