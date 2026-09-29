/**
 * Deixa a Casa Azul demonstrável em produção.
 *
 * O sistema estava pronto e não tinha como ser mostrado. Em produção existia
 * uma única organização — a própria IncentivaBR — então uma reunião de venda
 * exibiria o produto genérico, não *o sistema deles*, com o nome, a marca e o
 * projeto da Casa Azul na tela. Pior: a fila de conferência, que é justamente
 * a tela que interessa ao proponente, exige `org_admin`, e nenhum ponto do
 * sistema criava esse papel — o cadastro público insere sempre `member`.
 *
 * Os dados do projeto não são inventados: vieram da API do SALIC do Ministério
 * da Cultura. PRONAC 2511274, "Casa Azul Celebra: Ritmos que Transformam",
 * proponente ASSISTENCIA SOCIAL CASA AZUL, autorizada a captação total.
 *
 * TRAVA: só roda com SIMULATION_MODE=true. As destinações de exemplo são
 * ficção, e ficção não pode entrar numa fila onde alguém confirma dinheiro de
 * verdade. Quando a chave virar, este arquivo para de agir sozinho.
 *
 * É idempotente: roda em todo boot e não duplica nada.
 */
import bcrypt from 'bcryptjs';
import pool from '../../config/database.js';

const SLUG = 'casa-azul';
const PRONAC = '2511274';

// O azul-marinho da marca da Casa Azul. O laranja segue o da IncentivaBR: a
// marca deles é monocromática, e a cor de destaque precisa contrastar com o
// azul — usar o mesmo azul nos dois papéis apaga botões contra o fundo.
const CORES = { primaria: '#1E346B', secundaria: '#EE985C' };
// A marca da Casa Azul é um lockup vertical: símbolo em cima, "Casa Azul /
// Felipe Augusto" embaixo, 1122×1520. Os cabeçalhos do sistema renderizam a
// logo entre 18 e 36 pixels de ALTURA — nessa altura o lockup inteiro vira uma
// lasca de 13px de largura, com o nome ilegível. Por isso o cabeçalho usa só o
// símbolo (a casa com as mãos), que é quase quadrado e lê bem pequeno.
// A marca completa fica em `casa-azul-felipe-augusto.png`, para usos grandes.
const LOGO = '/assets/casa-azul-simbolo.png';

// Duas identidades, e confundi-las custa caro: a MARCA é o que aparece na tela
// do destinador; a RAZÃO SOCIAL é o que precisa constar no Recibo de Mecenato
// e é como o projeto está registrado no SALIC. Recibo com nome de fantasia não
// serve para a Receita.
const MARCA = 'Casa Azul Felipe Augusto';
const RAZAO_SOCIAL = 'ASSISTENCIA SOCIAL CASA AZUL';

/**
 * Os textos da página inicial do cliente (migration 039).
 *
 * Sem eles, o site da Casa Azul abre com o texto neutro da plataforma: correto,
 * e de quem ainda não cadastrou nada.
 *
 * O que está escrito aqui é só o que se sustenta: o que o PROJETO faz, palavra
 * por palavra da síntese aprovada pelo Ministério, e como o mecanismo funciona.
 *
 * O que NÃO está, de propósito: anos de atuação, número de atendidos, unidades,
 * selos. São afirmações plausíveis que chegaram por resumo de busca, e o site
 * de um cliente não é lugar para dado que não conferimos na fonte — é a mesma
 * regra que manteve os números do piloto fora da home. Quando a Casa Azul
 * mandar os números dela, eles entram pela tela de clientes, com fonte.
 *
 * E nenhum percentual aqui: teto é dado, e vive em `tetos_deducao`. Escrever
 * "6%" num texto de tenant criaria a cópia que não acompanha o banco.
 */
const TEXTOS = {
  hero_titulo:
    'Parte do seu imposto pode virar dança, música e futuro no Distrito Federal',
  hero_subtitulo:
    'Você não doa dinheiro a mais. Escolhe para onde vai uma parte do Imposto de ' +
    'Renda que já deve — e ela financia o projeto Casa Azul Celebra, aprovado ' +
    'pelo Ministério da Cultura pela Lei Rouanet.',
  sobre:
    'A Casa Azul Felipe Augusto é uma organização da sociedade civil do Distrito ' +
    'Federal. O projeto Casa Azul Celebra: Ritmos que Transformam realiza oficinas ' +
    'de expressão corporal com jovens atendidos pela instituição, culminando num ' +
    'espetáculo de dança com música ao vivo, de acesso gratuito ao público. O ' +
    'projeto está autorizado pelo Ministério da Cultura a captar a totalidade dos ' +
    'recursos, e cada destinação vai direto para a Conta de Captação dele.'
};

async function organizacao(cliente) {
  const achou = await cliente.query('SELECT id FROM organizations WHERE slug = $1', [SLUG]);

  if (achou.rows.length) {
    // Converge a marca, em vez de só não duplicar.
    //
    // A primeira versão daqui apenas devolvia o id quando a linha existia. O
    // resultado foi que a Casa Azul nasceu com o lockup vertical no cabeçalho —
    // valor de um deploy anterior — e nenhum deploy seguinte corrigia. Semeador
    // idempotente que não converge deixa o erro cristalizado no banco, onde é
    // mais difícil de ver do que no código.
    //
    // Só a identidade visual é atualizada, e só enquanto SIMULATION_MODE está
    // ligado. Quando a chave virar, este arquivo para de agir e o que o cliente
    // ajustar pela tela fica de pé.
    await cliente.query(`
      UPDATE organizations
         SET name = $2, primary_color = $3, secondary_color = $4, logo_url = $5,
             hero_titulo = $6, hero_subtitulo = $7, sobre = $8
       WHERE id = $1`,
      [achou.rows[0].id, MARCA, CORES.primaria, CORES.secundaria, LOGO,
       TEXTOS.hero_titulo, TEXTOS.hero_subtitulo, TEXTOS.sobre]);
    return achou.rows[0].id;
  }

  const { rows } = await cliente.query(`
    INSERT INTO organizations (name, slug, cnpj, plan_type, fund_type, fund_name,
                               max_percentage, contact_email, primary_color, secondary_color,
                               logo_url, hero_titulo, hero_subtitulo, sobre,
                               contracted_at, is_active)
    VALUES ($1,$2,NULL,'basic','rouanet','Lei Rouanet — Lei 8.313/1991',
            6, NULL, $3, $4, $5, $6, $7, $8, NOW(), true)
    RETURNING id`,
    [MARCA, SLUG, CORES.primaria, CORES.secundaria, LOGO,
     TEXTOS.hero_titulo, TEXTOS.hero_subtitulo, TEXTOS.sobre]);
  console.log('🌱 Organização Casa Azul criada');
  return rows[0].id;
}

// Ficha do projeto, conferida contra a consulta do SALIC de setembro de 2026
// (PRONAC 2511274, situação E10 — autorizada a captação total).
//
// O segmento estava escrito como "Música" e o SALIC diz "Apresentação ou
// Performance de Dança": a síntese fala em oficinas de expressão corporal e
// espetáculo de dança COM música ao vivo, e a diferença é o que o destinador
// lê para decidir se aquele projeto é a causa dele.
const FICHA = {
  titulo:     'Casa Azul Celebra: Ritmos que Transformam',
  area:       'Artes Cênicas',
  segmento:   'Apresentação ou Performance de Dança',
  uf:         'DF',
  cnpj:       '33.486.911/0001-20',   // a MATRIZ; há filiais /0002-00 e /0003-91
  // A síntese oficial, como está no SALIC. É melhor do que qualquer resumo
  // nosso: foi ela que o Ministério aprovou.
  // Consulta ao SALIC de 29/09/2026. `valores_em` é o que impede este retrato
  // de ser apresentado como notícia daqui a três meses: passado o prazo de
  // validade, lib/captacao.js marca como defasado em vez de calar.
  valor_autorizado: 635728.50,
  valor_captado:    0,
  captacao_inicio:  '2026-01-01',
  captacao_fim:     '2026-12-31',
  valores_em:       '2026-09-29',
  descricao:
    'O projeto "Casa Azul Celebra" realizará oficinas de expressão corporal ' +
    'com jovens atendidos pela instituição, culminando na apresentação de um ' +
    'espetáculo de dança com música ao vivo. A proposta valoriza a inclusão ' +
    'sociocultural por meio da arte, promovendo protagonismo juvenil, formação ' +
    'artística e acesso gratuito ao público.'
};

async function projeto(cliente, orgId) {
  const achou = await cliente.query(
    'SELECT id FROM org_projects WHERE organization_id = $1 AND pronac = $2', [orgId, PRONAC]);

  // CONVERGE, não só "não duplica".
  //
  // A primeira versão daqui devolvia cedo quando a linha existia — o mesmo erro
  // que o comentário de organizacao() descreve, e com o mesmo resultado: o
  // segmento errado ("Música") ficou cristalizado no banco e nenhum deploy o
  // corrigia. Semeador que não converge esconde o erro onde é mais difícil de
  // ver do que no código.
  //
  // Os campos BANCÁRIOS ficam de fora, e é a parte que mais importa: conta de
  // captação, agência e chave PIX só a Casa Azul informa, pela tela. Um seed
  // que os tocasse apagaria, a cada deploy, o dado que faz o recibo existir —
  // e depósito na conta errada não gera recibo: o servidor perde a dedução e a
  // culpa é nossa.
  if (achou.rows.length) {
    await cliente.query(`
      UPDATE org_projects
         SET titulo = $2, area = $3, segmento = $4, descricao = $5, uf = $6,
             proponente_nome = $7, proponente_cnpj = $8,
             valor_autorizado = $9, valor_captado = $10,
             captacao_inicio = $11::date, captacao_fim = $12::date,
             valores_em = $13::date, updated_at = NOW()
       WHERE id = $1`,
      [achou.rows[0].id, FICHA.titulo, FICHA.area, FICHA.segmento, FICHA.descricao,
       FICHA.uf, RAZAO_SOCIAL, FICHA.cnpj,
       FICHA.valor_autorizado, FICHA.valor_captado,
       FICHA.captacao_inicio, FICHA.captacao_fim, FICHA.valores_em]);
    return;
  }

  await cliente.query(`
    INSERT INTO org_projects (organization_id, pronac, titulo, area, segmento, descricao, uf,
                              proponente_nome, proponente_cnpj,
                              valor_autorizado, valor_captado,
                              captacao_inicio, captacao_fim, valores_em,
                              is_active, is_featured)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::date,$13::date,$14::date,true,true)`,
    [orgId, PRONAC, FICHA.titulo, FICHA.area, FICHA.segmento, FICHA.descricao,
     FICHA.uf, RAZAO_SOCIAL, FICHA.cnpj,
     FICHA.valor_autorizado, FICHA.valor_captado,
     FICHA.captacao_inicio, FICHA.captacao_fim, FICHA.valores_em]);
  console.log(`🌱 Projeto ${PRONAC} vinculado à Casa Azul`);
}

async function gestor(cliente, orgId) {
  const email = (process.env.DEMO_GESTOR_EMAIL || '').trim().toLowerCase();
  if (!email) {
    console.log('🌱 DEMO_GESTOR_EMAIL não definido — fila de conferência seguirá sem gestor');
    return;
  }

  let { rows } = await cliente.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);

  if (!rows.length) {
    const senha = process.env.DEMO_GESTOR_SENHA;
    if (!senha) {
      console.log(`🌱 usuário ${email} não existe e DEMO_GESTOR_SENHA não foi definida`);
      return;
    }
    ({ rows } = await cliente.query(`
      INSERT INTO users (cpf, nome, email, senha_hash, email_verified, organization_id)
      VALUES ($1,$2,$3,$4,true,$5) RETURNING id`,
      [`demo${Date.now()}`.slice(0, 11), 'Gestor Casa Azul', email,
       await bcrypt.hash(senha, 10), orgId]));
    console.log(`🌱 Gestor ${email} criado`);
  }

  // ON CONFLICT: promove quem já era `member` — é o caso de quem se cadastrou
  // pela tela pública antes de virar gestor.
  await cliente.query(`
    INSERT INTO organization_users (organization_id, user_id, role, accepted_at, is_active)
    VALUES ($1,$2,'org_admin',NOW(),true)
    ON CONFLICT (organization_id, user_id)
    DO UPDATE SET role = 'org_admin', is_active = true`,
    [orgId, rows[0].id]);
  console.log(`🌱 ${email} é org_admin da Casa Azul`);
}

async function filaDeExemplo(cliente, orgId) {
  // Uma fila vazia não demonstra nada — e uma fila com dado plantado por cima
  // de destinação real seria muito pior. Só semeia se estiver realmente vazia.
  const { rows: existentes } = await cliente.query(
    'SELECT 1 FROM donations WHERE organization_id = $1 LIMIT 1', [orgId]);
  if (existentes.length) return;

  const { rows: pessoas } = await cliente.query(`
    INSERT INTO users (cpf, nome, email, senha_hash, email_verified, organization_id)
    VALUES ('00000000191','Maria Aparecida de Souza (exemplo)','exemplo1@demonstracao.invalido','!',true,$1),
           ('00000000272','João Batista Ferreira (exemplo)','exemplo2@demonstracao.invalido','!',true,$1),
           ('00000000353','Rita de Cássia Nunes (exemplo)','exemplo3@demonstracao.invalido','!',true,$1)
    ON CONFLICT DO NOTHING
    RETURNING id`, [orgId]);
  if (!pessoas.length) return;

  const valores = [3200, 12500.5, 800];
  for (let i = 0; i < pessoas.length; i++) {
    await cliente.query(`
      INSERT INTO donations (user_id, organization_id, donation_amount, ir_devido, fiscal_year,
                             pronac, projeto_titulo, status, receipt_url, receipt_filename)
      VALUES ($1,$2,$3,$4,2026,$5,$6,'awaiting_confirmation',
              '/uploads/receipts/exemplo.pdf',$7)`,
      [pessoas[i].id, orgId, valores[i], valores[i] / 0.06, PRONAC,
       'Casa Azul Celebra: Ritmos que Transformam', `comprovante-exemplo-${i + 1}.pdf`]);
  }
  console.log(`🌱 ${pessoas.length} destinações de exemplo na fila de conferência`);
}

export async function semeiaCasaAzul(conexao = pool) {
  if (process.env.SIMULATION_MODE !== 'true') return;

  const cliente = await conexao.connect();
  try {
    const orgId = await organizacao(cliente);
    await projeto(cliente, orgId);
    await gestor(cliente, orgId);
    await filaDeExemplo(cliente, orgId);
  } catch (erro) {
    // Falhar aqui não pode derrubar o servidor: isto é conveniência de
    // demonstração, não caminho crítico.
    console.error('⚠️  Semeadura da Casa Azul:', erro.message);
  } finally {
    cliente.release();
  }
}

export default semeiaCasaAzul;
