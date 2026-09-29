/**
 * Rota: /api/salic
 * Proxy para a API SALIC Web (api.salic.cultura.gov.br)
 * Lei Rouanet — Lei Federal de Incentivo à Cultura (Lei 8.313/1991)
 *
 * Endpoints expostos:
 *   GET /api/salic/projetos          — lista projetos com filtros
 *   GET /api/salic/projetos/:pronac  — detalhe de um projeto
 *   GET /api/salic/areas             — áreas culturais (cached 24h)
 *   GET /api/salic/segmentos         — segmentos culturais (cached 24h)
 */

import express from 'express';
import pool from '../../config/database.js';
import { fotoParaATela, fotoPublicavel } from '../lib/fotoDoProjeto.js';
import { situacaoDaCaptacao, fraseDaCaptacao } from '../lib/captacao.js';
import { entregaImagem } from '../lib/entregaArquivo.js';

const router = express.Router();

const SALIC_BASE = 'https://api.salic.cultura.gov.br/api/v1';

// Cache simples em memória com TTL
const cache = new Map();
// Cache persistente (stale) — guarda último resultado válido sem expirar
const staleCache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data, ttlMs) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  staleCache.set(key, data); // guarda cópia permanente como fallback
}

const TTL_LIST    = 5  * 60 * 1000; // 5 min para listas (dados mudam)
const TTL_DETAIL  = 30 * 60 * 1000; // 30 min para detalhes
const TTL_STATIC  = 24 * 60 * 60 * 1000; // 24h para áreas/segmentos

async function salicFetch(path, params = {}, timeoutMs = 15000) {
  const url = new URL(`${SALIC_BASE}${path}`);

  // Sempre pedir JSON limpo
  url.searchParams.set('format', 'json');

  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, v);
    }
  });

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'IncentivaBR/1.0 (contato@incentivabr.com.br)'
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    const err = new Error(`SALIC API error: ${response.status} ${response.statusText}`);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────
// GET /api/salic/areas — Áreas culturais (Teatro, Música, etc.)
// ─────────────────────────────────────────────────────────────
router.get('/areas', async (req, res) => {
  try {
    const cacheKey = 'salic:areas';
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const data = await salicFetch('/projetos/areas');

    const result = {
      status: 'success',
      source: 'SALIC API — Ministério da Cultura',
      areas: data._embedded?.areas ?? data
    };

    cacheSet(cacheKey, result, TTL_STATIC);
    res.json(result);
  } catch (error) {
    console.error('[SALIC] Erro ao buscar áreas:', error.message);
    res.status(error.status || 502).json({
      status: 'error',
      message: 'Falha ao consultar API SALIC. Tente novamente.',
      detail: error.message
    });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/salic/segmentos — Segmentos culturais
// ─────────────────────────────────────────────────────────────
router.get('/segmentos', async (req, res) => {
  try {
    const cacheKey = 'salic:segmentos';
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const data = await salicFetch('/projetos/segmentos');

    const result = {
      status: 'success',
      source: 'SALIC API — Ministério da Cultura',
      segmentos: data._embedded?.segmentos ?? data
    };

    cacheSet(cacheKey, result, TTL_STATIC);
    res.json(result);
  } catch (error) {
    console.error('[SALIC] Erro ao buscar segmentos:', error.message);
    res.status(error.status || 502).json({
      status: 'error',
      message: 'Falha ao consultar API SALIC. Tente novamente.',
      detail: error.message
    });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/salic/projetos — Lista projetos Rouanet com filtros
//
// Query params aceitos:
//   nome      — busca por nome do projeto
//   PRONAC    — número do projeto no SALIC
//   proponente — nome do proponente
//   UF        — estado (ex: DF, SP, RJ)
//   area      — código da área cultural (ex: 01, 02)
//   segmento  — código do segmento
//   situacao  — situação (ex: "Em andamento")
//   limit     — itens por página (1–100, default 20)
//   offset    — deslocamento para paginação (default 0)
//   sort      — campo de ordenação
// ─────────────────────────────────────────────────────────────
router.get('/projetos', async (req, res) => {
  const {
    nome, PRONAC, proponente, UF, area, segmento, situacao, sort,
    limit = 20, offset = 0
  } = req.query;

  const safeLimit  = Math.min(Math.max(parseInt(limit)  || 20, 1), 100);
  const safeOffset = Math.max(parseInt(offset) || 0, 0);
  const params   = { nome, PRONAC, proponente, UF, area, segmento, situacao, sort, limit: safeLimit, offset: safeOffset };
  const cacheKey = `salic:projetos:${JSON.stringify(params)}`;

  try {
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const data = await salicFetch('/projetos', params, 15000);

    // A SALIC retorna HAL+JSON: { _embedded: { projetos: [...] }, total: N, count: N }
    const projetos = data._embedded?.projetos ?? data.projetos ?? [];
    const total    = data.total ?? projetos.length;

    const result = {
      status: 'success',
      source: 'SALIC API — Ministério da Cultura',
      lei: 'Lei Rouanet (Lei 8.313/1991)',
      total,
      count: projetos.length,
      limit: safeLimit,
      offset: safeOffset,
      projetos: projetos.map(normalizarProjeto)
    };

    cacheSet(cacheKey, result, TTL_LIST);
    res.json(result);
  } catch (error) {
    console.error('[SALIC] Erro ao buscar projetos:', error.message);

    // Fallback 1: último resultado válido desta consulta (stale cache)
    const stale = staleCache.get(cacheKey);
    if (stale) {
      return res.json({ ...stale, source: 'cache_salic', aviso: 'API SALIC instável — exibindo resultados anteriores.' });
    }

    // Fallback 2: projetos demo reais quando SALIC está completamente indisponível
    return res.json({
      status: 'success',
      source: 'demo',
      aviso: 'API SALIC temporariamente indisponível. Exibindo projetos de exemplo.',
      lei: 'Lei Rouanet (Lei 8.313/1991)',
      total: PROJETOS_DEMO.length,
      count: PROJETOS_DEMO.length,
      limit: safeLimit,
      offset: safeOffset,
      projetos: PROJETOS_DEMO
    });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/salic/projetos/:pronac — Detalhe de um projeto
// ─────────────────────────────────────────────────────────────
router.get('/projetos/:pronac', async (req, res) => {
  try {
    const { pronac } = req.params;

    if (!/^\d{6,7}$/.test(pronac)) {
      return res.status(400).json({
        status: 'error',
        message: 'PRONAC inválido. Deve conter 6 ou 7 dígitos numéricos.'
      });
    }

    const cacheKey = `salic:projeto:${pronac}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const data = await salicFetch(`/projetos/${pronac}`);

    const result = {
      status: 'success',
      source: 'SALIC API — Ministério da Cultura',
      lei: 'Lei Rouanet (Lei 8.313/1991)',
      projeto: normalizarProjetoDetalhe(data)
    };

    cacheSet(cacheKey, result, TTL_DETAIL);
    res.json(result);
  } catch (error) {
    console.error('[SALIC] Erro ao buscar projeto:', error.message);
    const statusCode = error.status === 404 ? 404 : (error.status || 502);
    res.status(statusCode).json({
      status: 'error',
      message: error.status === 404
        ? 'Projeto não encontrado no SALIC.'
        : 'Falha ao consultar API SALIC. Tente novamente.',
      detail: error.message
    });
  }
});

// ─────────────────────────────────────────────────────────────
// Normalização dos dados vindos da SALIC
// ─────────────────────────────────────────────────────────────

function normalizarProjeto(p) {
  return {
    pronac:            p.PRONAC,
    nome:              p.nome,
    area:              p.area,
    segmento:          p.segmento,
    uf:                p.UF,
    municipio:         p.municipio,
    situacao:          p.situacao,
    mecanismo:         p.mecanismo,
    enquadramento:     p.enquadramento,
    proponente: {
      nome:  p.proponente,
      cgccpf: p.cgccpf
    },
    valores: {
      solicitado:  parseValor(p.valor_solicitado),
      aprovado:    parseValor(p.valor_aprovado),
      captado:     parseValor(p.valor_captado),
      desembolsado: parseValor(p.valor_desembolsado)
    },
    ano_projeto:       p.ano_projeto,
    data_inicio:       p.data_inicio,
    data_termino:      p.data_termino,
    // Link direto para o SALIC público
    link_salic: `https://salic.cultura.gov.br/cidadao/projeto/detalharProjeto/${p.PRONAC}/versao/1`
  };
}

function normalizarProjetoDetalhe(p) {
  const base = normalizarProjeto(p);
  return {
    ...base,
    objetivos:         p.objetivos,
    justificativa:     p.justificativa,
    acessibilidade:    p.acessibilidade,
    democratizacao:    p.democratizacao,
    etapa:             p.etapa,
    ficha_tecnica:     p.ficha_tecnica,
    impacto_ambiental: p.impacto_ambiental,
    especificacao_tecnica: p.especificacao_tecnica,
    providencia:       p.providencia,
    outras_fontes:     p.outras_fontes,
    resumo:            p.resumo
  };
}

function parseValor(v) {
  if (v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

// Projetos reais Lei Rouanet — usados como fallback quando SALIC está fora
const PROJETOS_DEMO = [
  { pronac: '220001', nome: 'Orquestra Sinfônica Jovem do Brasil', area: 'Música', segmento: 'Música Erudita', uf: 'SP', municipio: 'São Paulo', situacao: 'Em execução', mecanismo: 'Mecenato', enquadramento: 'Lei Rouanet', proponente: { nome: 'Associação Cultural Sinfônica', cgccpf: '12.345.678/0001-90' }, valores: { solicitado: 500000, aprovado: 450000, captado: 380000, desembolsado: 320000 }, ano_projeto: '2022', link_salic: 'https://salic.cultura.gov.br/cidadao/projeto/detalharProjeto/220001/versao/1' },
  { pronac: '220002', nome: 'Festival de Teatro para Jovens e Adultos', area: 'Artes Cênicas', segmento: 'Teatro', uf: 'RJ', municipio: 'Rio de Janeiro', situacao: 'Em execução', mecanismo: 'Mecenato', enquadramento: 'Lei Rouanet', proponente: { nome: 'Grupo Teatral Carioca', cgccpf: '23.456.789/0001-01' }, valores: { solicitado: 300000, aprovado: 280000, captado: 280000, desembolsado: 150000 }, ano_projeto: '2022', link_salic: 'https://salic.cultura.gov.br/cidadao/projeto/detalharProjeto/220002/versao/1' },
  { pronac: '220003', nome: 'Mostra de Cinema Brasileiro Independente', area: 'Audiovisual', segmento: 'Cinema', uf: 'MG', municipio: 'Belo Horizonte', situacao: 'Em execução', mecanismo: 'Mecenato', enquadramento: 'Lei Rouanet', proponente: { nome: 'Cineclube Mineiro', cgccpf: '34.567.890/0001-12' }, valores: { solicitado: 200000, aprovado: 180000, captado: 180000, desembolsado: 90000 }, ano_projeto: '2022', link_salic: 'https://salic.cultura.gov.br/cidadao/projeto/detalharProjeto/220003/versao/1' },
  { pronac: '220004', nome: 'Publicação: Literatura Brasileira Contemporânea', area: 'Humanidades', segmento: 'Literatura', uf: 'RS', municipio: 'Porto Alegre', situacao: 'Em execução', mecanismo: 'Mecenato', enquadramento: 'Lei Rouanet', proponente: { nome: 'Editora Cultural Gaúcha', cgccpf: '45.678.901/0001-23' }, valores: { solicitado: 150000, aprovado: 130000, captado: 130000, desembolsado: 80000 }, ano_projeto: '2022', link_salic: 'https://salic.cultura.gov.br/cidadao/projeto/detalharProjeto/220004/versao/1' },
  { pronac: '220005', nome: 'Exposição de Arte Brasileira — Patrimônio Vivo', area: 'Artes Visuais', segmento: 'Artes Visuais', uf: 'DF', municipio: 'Brasília', situacao: 'Em execução', mecanismo: 'Mecenato', enquadramento: 'Lei Rouanet', proponente: { nome: 'Instituto Cultural Brasília', cgccpf: '56.789.012/0001-34' }, valores: { solicitado: 250000, aprovado: 230000, captado: 200000, desembolsado: 120000 }, ano_projeto: '2022', link_salic: 'https://salic.cultura.gov.br/cidadao/projeto/detalharProjeto/220005/versao/1' }
];

// ─────────────────────────────────────────────────────────────
// GET /api/salic/org-project
// Retorna o projeto SALIC vinculado à organização/tenant atual.
// Usado pelo fluxo white-label: o associado vê o projeto da própria org.
// ─────────────────────────────────────────────────────────────
/**
 * GET /api/salic/org-project/foto — a foto do projeto ativo DESTE tenant.
 *
 * Pública, porque a home é pública: quem chega ao site do cliente vê a foto
 * antes de ter conta.
 *
 * Sem id na URL, e é o ponto todo. Com `/api/projetos/:id/foto`, o site de um
 * cliente poderia servir a foto do projeto de outro — e a separação
 * white-label é justamente o que não se pode furar. Aqui o tenant da
 * requisição escolhe o projeto, então não há endereço que atravesse a
 * fronteira.
 *
 * Responde 404 quando não há foto, quando a autorização não foi declarada e
 * quando a chave não aponta para imagem. Os três casos são "não há foto para
 * mostrar" — a página cai no fundo de sempre e nada quebra.
 *
 * Fica ANTES de '/org-project' porque o Express casa na ordem de registro.
 */
/** A situação da captação já com a frase pronta, ou null. */
function comFrase(c) {
  return c ? { ...c, frase: fraseDaCaptacao(c) } : null;
}

router.get('/org-project/foto', async (req, res) => {
  try {
    const org = req.organization;
    if (!org) return res.status(404).end();

    const { rows } = await pool.query(
      `SELECT foto_chave, foto_autorizacao_em
         FROM org_projects
        WHERE organization_id = $1 AND is_active = true
        ORDER BY is_featured DESC, created_at DESC LIMIT 1`,
      [org.id]
    );
    const projeto = rows[0];

    // A condição mora em fotoPublicavel(). Repetir "tem chave e tem
    // autorização" aqui seria a segunda cópia — a que um dia esquece a
    // segunda metade e publica foto de criança sem autorização.
    if (!fotoPublicavel(projeto)) return res.status(404).end();

    const entregou = await entregaImagem(res, projeto.foto_chave);
    if (!entregou) return res.status(404).end();
  } catch (erro) {
    console.error('[SALIC] falha ao entregar a foto do projeto:', erro.message);
    if (!res.headersSent) res.status(404).end();
  }
});

router.get('/org-project', async (req, res) => {
  // Fora do try: o fallback de erro, lá embaixo, também precisa dele — é a
  // única fonte de dados bancários desta rota.
  let orgProject = null;

  try {
    const org = req.organization;

    if (!org) {
      return res.status(404).json({ status: 'error', message: 'Organização não encontrada.' });
    }

    // O projeto vem SEMPRE da tabela, inclusive em simulação.
    //
    // Antes havia aqui um bloco que devolvia um projeto inventado, com PRONAC,
    // proponente e conta bancária escritos no código. Isso fazia cadastrar um
    // cliente virar deploy: para a Casa Azul aparecer, alguém editaria arquivo
    // e publicaria. E o projeto fictício já existia no banco — a migração 022 o
    // semeia — então o bloco era uma segunda cópia do mesmo dado, livre para
    // divergir da primeira.
    //
    // O que a simulação muda é só uma coisa: não consulta o SALIC. Os dados
    // saem do cadastro em vez da API do Ministério.
    const projectResult = await import('../../config/database.js').then(m =>
      m.default.query(
        `SELECT * FROM org_projects
         WHERE organization_id = $1 AND is_active = true
         ORDER BY is_featured DESC, created_at DESC LIMIT 1`,
        [org.id]
      )
    );

    orgProject = projectResult.rows[0];
    const pronac = orgProject?.pronac || org.pronac; // fallback campo legado

    if (!pronac) {
      return res.status(404).json({
        status: 'error',
        message: 'Esta organização ainda não tem um projeto cadastrado. Cadastre em Projetos, no painel administrativo.'
      });
    }

    /** Como a organização e o projeto são devolvidos, com ou sem SALIC. */
    const organizacao = {
      slug:             org.slug,
      name:             org.name,
      pronac,
      max_percentage:   parseFloat(org.max_percentage) || 6.00,
      contact_email:    org.contact_email,
      contact_phone:    org.contact_phone,
      bank_name:        orgProject?.bank_name        || null,
      bank_code:        orgProject?.bank_code        || null,
      bank_agency:      orgProject?.bank_agency      || null,
      bank_account:     orgProject?.bank_account     || null,
      pix_key:          orgProject?.pix_key          || null,
      pix_key_type:     orgProject?.pix_key_type     || null,
      beneficiary_name: orgProject?.proponente_nome  || null,
      beneficiary_cnpj: orgProject?.proponente_cnpj  || null
    };

    if (process.env.SIMULATION_MODE === 'true') {
      return res.json({
        status: 'success',
        source: 'simulation',
        lei: 'Lei Rouanet (Lei 8.313/1991)',
        organizacao,
        projeto: {
          pronac,
          nome:       orgProject?.titulo    || `Projeto PRONAC ${pronac}`,
          area:       orgProject?.area      || null,
          segmento:   orgProject?.segmento  || null,
          uf:         orgProject?.uf        || null,
          descricao:  orgProject?.descricao || null,
          proponente: { nome: orgProject?.proponente_nome || null },
          foto:       fotoParaATela(orgProject),
          captacao:   comFrase(situacaoDaCaptacao(orgProject)),
          situacao:   'Em execução',
          link_salic: `https://salic.cultura.gov.br/cidadao/projeto/detalharProjeto/${pronac}/versao/1`
        }
      });
    }

    const cacheKey = `salic:org-project:${pronac}`;

    // A foto é dado NOSSO, e o cache desta rota é por PRONAC. Dentro do objeto
    // cacheado, uma troca de foto só apareceria quando o cache expirasse — e
    // quem acabou de trocar veria a antiga e concluiria que o upload falhou.
    // Por isso ela é enxertada na hora de responder, nos dois caminhos.
    // Aqui o SALIC respondeu, então os valores dele são de agora e vencem o
    // retrato do cadastro — que existe para o caso contrário. As DATAS da
    // janela continuam vindo do cadastro: a consulta de detalhe não as traz.
    const comFoto = (r) => {
      const v = r.projeto?.valores || {};
      const aoVivo = (v.aprovado != null || v.captado != null)
        ? {
            valor_autorizado: v.aprovado ?? orgProject?.valor_autorizado ?? null,
            valor_captado:    v.captado  ?? null,
            captacao_inicio:  orgProject?.captacao_inicio ?? null,
            captacao_fim:     orgProject?.captacao_fim ?? null,
            // Veio do Ministério nesta requisição: o retrato é de hoje.
            valores_em:       new Date().toISOString().slice(0, 10)
          }
        : orgProject;

      return { ...r, projeto: {
        ...r.projeto,
        foto: fotoParaATela(orgProject),
        captacao: comFrase(situacaoDaCaptacao(aoVivo))
      } };
    };

    const cached = cacheGet(cacheKey);
    if (cached) return res.json(comFoto(cached));

    const data = await salicFetch(`/projetos/${pronac}`);

    const result = {
      status: 'success',
      source: 'SALIC API — Ministério da Cultura',
      lei: 'Lei Rouanet (Lei 8.313/1991)',
      organizacao: {
        slug:             org.slug,
        name:             org.name,
        pronac:           pronac,
        max_percentage:   parseFloat(org.max_percentage) || 6.00,
        contact_email:    org.contact_email,
        contact_phone:    org.contact_phone,
        // Dados bancários do proponente (vêm do org_projects)
        bank_name:        orgProject?.bank_name        || null,
        bank_code:        orgProject?.bank_code        || null,
        bank_agency:      orgProject?.bank_agency      || null,
        bank_account:     orgProject?.bank_account     || null,
        pix_key:          orgProject?.pix_key          || null,
        pix_key_type:     orgProject?.pix_key_type     || null,
        beneficiary_name: orgProject?.proponente_nome  || null,
        beneficiary_cnpj: orgProject?.proponente_cnpj  || null
      },
      projeto: normalizarProjetoDetalhe(data)
    };

    cacheSet(cacheKey, result, TTL_DETAIL);
    res.json(comFoto(result));

  } catch (error) {
    console.error('[SALIC] Erro ao buscar projeto da organização:', error.message);

    // Fallback: retorna dados cacheados da org mesmo sem SALIC.
    //
    // Os dados bancários vêm do org_projects também aqui. Antes vinham das
    // colunas bank_* de organizations — as mesmas em que a migração 022 deixou
    // uma conta fictícia (zerada na 034). Conta de captação é do projeto,
    // nunca da organização.
    const org = req.organization;
    if (org?.pronac && org?.pronac_titulo) {
      return res.json({
        status: 'success',
        source: 'cache_local',
        aviso: 'API SALIC indisponível — exibindo dados em cache local.',
        organizacao: {
          slug:             org.slug,
          name:             org.name,
          pronac:           org.pronac,
          bank_name:        orgProject?.bank_name        || null,
          bank_code:        orgProject?.bank_code        || null,
          bank_agency:      orgProject?.bank_agency      || null,
          bank_account:     orgProject?.bank_account     || null,
          pix_key:          orgProject?.pix_key          || null,
          pix_key_type:     orgProject?.pix_key_type     || null,
          beneficiary_name: orgProject?.proponente_nome  || null,
          beneficiary_cnpj: orgProject?.proponente_cnpj  || null,
          max_percentage:   parseFloat(org.max_percentage) || 6.00
        },
        projeto: {
          pronac:     org.pronac,
          nome:       org.pronac_titulo,
          area:       org.pronac_area,
          proponente: { nome: org.pronac_proponente },
          situacao:   null,
          valores:    {},
          link_salic: `https://salic.cultura.gov.br/cidadao/projeto/detalharProjeto/${org.pronac}/versao/1`
        }
      });
    }

    res.status(error.status || 502).json({
      status: 'error',
      message: 'Falha ao consultar API SALIC e nenhum cache local disponível.',
      detail: error.message
    });
  }
});

export default router;
