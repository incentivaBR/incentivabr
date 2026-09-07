import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import pool, { testConnection } from './config/database.js';
import { runMigrations, statusDasMigracoes } from './src/config/migrate.js';
import { initEmailService, getEmailStatus } from './src/services/emailService.js';
import { escopoDaChaveResend } from './src/lib/resendEscopo.js';
import { consumoDeHoje } from './src/lib/consumoIA.js';
import { semeiaCasaAzul } from './src/config/semeiaCasaAzul.js';
import { promoveSuperadmin, estadoDoSuperadmin } from './src/config/promoveSuperadmin.js';
import { estadoDoArmazenamento, verificaArmazenamento } from './src/services/armazenamento.js';

// ES modules: criar __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import authRoutes from './src/routes/auth.js';
import calculatorRoutes from './src/routes/calculator.js';
import donationsRoutes from './src/routes/donations.js';
import uploadsRoutes from './src/routes/uploads.js';
import configRoutes from './src/routes/config.js';
import salicRoutes from './src/routes/salic.js';
import adminRoutes from './src/routes/admin.js';
import chatRoutes, { ultimaFalhaDaIA } from './src/routes/chat.js';
import mecenatoRoutes from './src/routes/mecenato.js';
import interessadosRoutes from './src/routes/interessados.js';
import convitesRoutes from './src/routes/convites.js';
import tenantMiddleware from './src/middleware/tenant.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Necessário para rate-limit funcionar corretamente atrás do proxy do Railway
app.set('trust proxy', 1);

// Domínios permitidos (IncentivaBR + white-labels)
const ALLOWED_ORIGINS = [
  // DestineAI — plataforma do usuário final
  'https://destineai.com.br',
  'https://www.destineai.com.br',
  'https://rouanet-production-4df2.up.railway.app',
  // IncentivaBR — institucional + admin (domínio mãe)
  'https://incentivabr.com.br',
  'https://www.incentivabr.com.br',
  // Desenvolvimento local
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:3000'
];

// Segurança HTTP — headers de proteção
app.use(helmet({
  contentSecurityPolicy: false // desabilitado para não quebrar o frontend HTML existente
}));

// CORS restrito aos domínios conhecidos
app.use(cors({
  origin: (origin, callback) => {
    // Permite sem origin (mobile, Postman, Railway health checks)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Permite subdomínios *.incentivabr.com.br (white-labels)
    if (/^https:\/\/[a-z0-9-]+\.incentivabr\.com\.br$/.test(origin)) return callback(null, true);
    callback(new Error(`CORS bloqueado: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Rate limiting global — proteção contra abuso
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { status: 'error', message: 'Muitas requisições. Tente novamente em 15 minutos.' }
});
app.use('/api/', globalLimiter);

// Rate limiting rigoroso para autenticação — anti brute-force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { status: 'error', message: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Redirect domínio sem www para www
app.use((req, res, next) => {
  const host = req.get('host');
  const brandDomain = process.env.BRAND_DOMAIN;
  if (brandDomain && host === brandDomain) {
    return res.redirect(301, `https://www.${brandDomain}${req.originalUrl}`);
  }
  next();
});

// Rota de health check — antes do tenant middleware para não depender do banco
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Multi-tenant middleware (detecta organização pelo subdomínio/query param)
app.use(tenantMiddleware);

// Servir arquivos estáticos do frontend
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));
console.log('Frontend path:', frontendPath);

// Rota de teste do banco de dados
app.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as current_time');
    res.json({
      status: 'ok',
      message: 'Conexão com banco de dados funcionando',
      serverTime: result.rows[0].current_time
    });
  } catch (error) {
    console.error('Erro no teste de DB:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Falha na conexão com banco de dados',
      error: error.message
    });
  }
});

/**
 * Quem pode ver o diagnóstico inteiro.
 *
 * Fora de produção, qualquer um — é uma máquina de desenvolvimento. Em
 * produção, só quem apresenta o DIAG_TOKEN. A comparação é feita em tempo
 * constante: comparar segredo com `===` vaza, pelo tempo de resposta, quantos
 * caracteres iniciais estavam certos.
 */
function temAcessoAoDetalhe(req) {
  if (process.env.NODE_ENV !== 'production') return true;

  const esperado = (process.env.DIAG_TOKEN || '').trim();
  if (!esperado) return false;   // sem token configurado, ninguém vê o detalhe

  const recebido = String(req.get('x-diagnostico-token') || '').trim();
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Descreve a DATABASE_URL sem revelar a senha.
 *
 * Devolve para onde a conexão aponta e duas características do valor da senha
 * — espaço nas pontas e caractere que quebra a URL — que são as duas causas
 * reais de "password authentication failed" quando a senha acabou de ser
 * trocada. Nenhum trecho da senha sai daqui.
 */
function descreveConexao() {
  const bruta = process.env.DATABASE_URL;
  if (!bruta) return { origem: 'DATABASE_URL ausente' };

  // O valor pode ter vindo com espaço colado — variável mal colada no painel.
  const limpa = bruta.trim();
  const resultado = { url_com_espaco_nas_pontas: bruta !== limpa };

  if (limpa.includes('${{')) {
    // Railway resolve referências antes de injetar. Se o texto ainda está aqui,
    // a referência não foi resolvida — nome do serviço errado, ou outro projeto.
    resultado.origem = 'referencia nao resolvida — o texto ${{...}} chegou cru';
    return resultado;
  }

  try {
    const u = new URL(limpa);
    const senha = decodeURIComponent(u.password || '');
    return {
      ...resultado,
      host: u.hostname,
      porta: u.port || '(padrao)',
      usuario: u.username,
      banco: u.pathname.replace(/^\//, ''),
      senha_vazia: senha.length === 0,
      senha_com_espaco_nas_pontas: senha !== senha.trim(),
      senha_com_caractere_que_quebra_url: /[@:/#?[\]]/.test(senha)
    };
  } catch {
    return { ...resultado, origem: 'DATABASE_URL nao e uma URL valida' };
  }
}

// Rota de diagnóstico completo do sistema
app.get('/diagnostico', async (req, res) => {
  const diagnostico = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    node_env: process.env.NODE_ENV || 'not set',
    services: {}
  };

  // Status do banco de dados
  try {
    const dbResult = await pool.query('SELECT NOW() as time, current_database() as db');
    diagnostico.services.database = {
      status: 'ok',
      database: dbResult.rows[0].db,
      serverTime: dbResult.rows[0].time
    };
  } catch (error) {
    diagnostico.services.database = {
      status: 'error',
      error: error.message,
      // Para onde estamos discando, e com que cara de senha.
      //
      // "password authentication failed" sozinho nao distingue tres coisas
      // muito diferentes: a variavel nao pegou, pegou o valor errado, ou pegou
      // o valor certo com um espaco grudado na ponta. Sem isso, o conserto vira
      // tentativa e erro no painel do Railway. A senha em si nunca aparece —
      // so o formato dela.
      conexao: descreveConexao()
    };
  }

  // Estado das migrations. Uma que falha aborta o boot (ver o fim deste
  // arquivo), então `pendentes` só aparece não vazio se alguém subiu com
  // PERMITE_BOOT_SEM_MIGRACOES=true — e aí o banco não tem a forma que este
  // código supõe.
  try {
    diagnostico.services.migrations = await statusDasMigracoes();
    diagnostico.services.migrations.status =
      diagnostico.services.migrations.pendentes.length === 0 ? 'ok' : 'error';
  } catch (error) {
    diagnostico.services.migrations = { status: 'error', error: error.message };
  }

  // Onde os documentos fiscais estão guardados. Em produção com backend
  // local é erro: somem no próximo deploy (Raio-X, risco 02).
  diagnostico.services.armazenamento = estadoDoArmazenamento();

  // Status do serviço de email
  const emailStatus = getEmailStatus();
  diagnostico.services.email = {
    status: emailStatus.initialized ? 'ok' : 'error',
    mode: emailStatus.mode === 'production' ? 'PRODUCAO (SMTP)' : 'TESTE (Ethereal)',
    host: emailStatus.host,
    user: emailStatus.user,
    port: emailStatus.port,
    secure: emailStatus.secure,
    // De onde saem os links e quem assina as mensagens. Ficaram invisíveis por
    // um tempo e isso custou caro: o envio dava certo, o e-mail chegava, e só o
    // clique falhava — sem nada no log denunciando.
    appUrl: emailStatus.appUrl,
    from:   emailStatus.from,
    error: emailStatus.error
  };

  // Qual código está realmente rodando.
  //
  // O Railway injeta estas variáveis a cada deploy. Sem elas, descobrir se uma
  // publicação subiu vira adivinhação a partir de sintomas — e adivinhar errado
  // manda alguém reconectar repositório à toa, que foi o que aconteceu aqui.
  diagnostico.build = {
    commit:    process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || '(desconhecido)',
    branch:    process.env.RAILWAY_GIT_BRANCH || '(desconhecida)',
    mensagem:  process.env.RAILWAY_GIT_COMMIT_MESSAGE || null,
    deployId:  process.env.RAILWAY_DEPLOYMENT_ID || null
  };
  if (emailStatus.etherealUrl) {
    diagnostico.services.email.etherealUrl = emailStatus.etherealUrl;
  }

  // Verificar variáveis de ambiente importantes (sem expor valores sensíveis)
  diagnostico.environment = {
    SMTP_HOST: process.env.SMTP_HOST ? '✅ configurado' : '❌ não configurado',
    SMTP_USER: process.env.SMTP_USER ? '✅ configurado' : '❌ não configurado',
    SMTP_PASS: process.env.SMTP_PASS ? '✅ configurado' : '❌ não configurado',
    JWT_SECRET: process.env.JWT_SECRET ? '✅ configurado' : '❌ não configurado',
    DATABASE_URL: process.env.DATABASE_URL ? '✅ configurado' : '❌ não configurado'
  };

  // Quem pergunta tem direito a saber se está no ar. Não a saber como.
  //
  // Esta rota nunca teve autenticação, e hoje ela ganhou o host interno do
  // banco, o nome do banco, o usuário e a mensagem do commit — desenho de
  // dentro de casa, servido a qualquer um que soubesse a URL. Junto com uma
  // DATABASE_URL vazada, é a diferença entre ter a senha e saber onde usá-la.
  //
  // O detalhe continua existindo, e continua acessível durante uma queda
  // (não depende do banco nem de login, que é justamente quando falta). Só
  // que agora pede o DIAG_TOKEN.
  if (temAcessoAoDetalhe(req)) {
    // Só aqui: é chamada de rede, e a resposta diz respeito à segurança da conta.
    diagnostico.services.email.chave = await escopoDaChaveResend();
    // Uma assistente morta é indistinguível de uma ociosa até alguém reclamar.
    diagnostico.services.assistente = {
      status: ultimaFalhaDaIA() ? 'error' : 'ok',
      chave: process.env.ANTHROPIC_API_KEY ? 'configurada' : 'ausente',
      ultima_falha: ultimaFalhaDaIA(),
      // A chave é uma só, da IncentivaBR: toda pergunta em qualquer white label
      // sai da mesma conta. Sem esta quebra por organização não há como
      // responder "quanto me custa este cliente?" — que é a pergunta que decide
      // se o custo cabe no setup ou vira linha na proposta.
      consumo: consumoDeHoje()
    };
    // Sem isto, um login que nao funciona e indistinguivel de senha errada,
    // conta inexistente, variavel nao lida e promocao que falhou — quatro
    // causas com quatro consertos diferentes.
    diagnostico.services.superadmin = estadoDoSuperadmin();
    return res.json(diagnostico);
  }

  res.json({
    status: 'ok',
    uptime: diagnostico.uptime,
    commit: diagnostico.build.commit,
    services: Object.fromEntries(
      Object.entries(diagnostico.services).map(([nome, s]) => [nome, { status: s.status }])
    ),
    detalhe: 'restrito — envie o cabecalho x-diagnostico-token'
  });
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/calculator', calculatorRoutes);
app.use('/api/donations', donationsRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/config', configRoutes);
app.use('/api/salic', salicRoutes);   // Lei Rouanet — proxy SALIC API
app.use('/api/admin', adminRoutes);   // Super-admin IncentivaBR
app.use('/api/convites', convitesRoutes);   // acesso de gestor a uma organização
app.use('/api/chat', chatRoutes);     // TINA — assistente virtual IA
app.use('/api/mecenato', mecenatoRoutes); // Recibo de Mecenato — emitido pelo proponente
app.use('/api/interessados', interessadosRoutes); // Cadastro de comunicação — consentimento LGPD

// A pasta de uploads NAO e publicada.
//
// Ate aqui havia um express.static sobre /uploads, servindo comprovantes
// bancarios e recibos sem qualquer autenticacao: bastava ter o nome do arquivo
// para baixar documento alheio — e eles trazem nome, CPF e valor. O nome tem
// componente aleatorio, mas isso e seguranca por obscuridade, e sob a LGPD e
// dado pessoal em caminho publico.
//
// Conferido antes de remover: nada consumia esse caminho. O frontend faz POST
// em /api/uploads/receipt/:id e le apenas o status; o painel admin nao usa.
//
// Os arquivos passam a ser entregues por rotas autenticadas, que verificam se
// quem pede e o dono da destinacao ou o proponente:
//   GET /api/uploads/receipt/:id/arquivo   — comprovante bancario
//   GET /api/mecenato/:id/arquivo          — recibo de mecenato

// Rota catch-all: serve index.html para rotas não-API (SPA)
app.get('*', (req, res, next) => {
  // Se for rota de API, retorna 404 JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      status: 'error',
      message: 'Rota de API não encontrada'
    });
  }
  // Para outras rotas, serve o index.html do frontend
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// Tratamento de erros global
app.use((err, req, res, next) => {
  console.error('Erro:', err.message);
  res.status(500).json({
    status: 'error',
    message: 'Erro interno do servidor'
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Subida do servidor
//
// As migrations rodam ANTES de o processo começar a ouvir a porta. Antes
// rodavam depois, dentro do callback do listen: o healthcheck da Railway
// passava com o banco ainda por migrar, e uma migration quebrada virava uma
// linha de log num deploy já publicado (Raio-X, risco 08).
//
// Agora, se uma migration FALHA (erro de SQL), o processo sai com código 1.
// Na Railway isso é o caminho seguro: o healthcheck nunca passa, o deploy é
// descartado e a versão anterior continua no ar, com o banco como estava. O
// log do deploy diz qual arquivo falhou e por quê.
//
// Banco INACESSÍVEL é outro caso: não há o que migrar, e /diagnostico é
// justamente a tela que se usa numa queda dessas. O servidor sobe, avisa no
// log, e as rotas que dependem do banco respondem erro até ele voltar.
//
// PERMITE_BOOT_SEM_MIGRACOES=true é a saída de emergência para o primeiro
// caso: sobe mesmo com migration quebrada, para poder olhar /diagnostico.
// Não é para ficar ligada.
// ─────────────────────────────────────────────────────────────────────────
if (await testConnection()) {
  try {
    await runMigrations();
  } catch (erro) {
    console.error('❌ Boot abortado —', erro.message);
    if (process.env.PERMITE_BOOT_SEM_MIGRACOES === 'true') {
      console.error('⚠️  PERMITE_BOOT_SEM_MIGRACOES=true — subindo mesmo assim. Corrija e desligue a variável.');
    } else {
      process.exit(1);
    }
  }
} else {
  console.error('⚠️  Banco inacessível na subida: migrations não rodaram. Veja /diagnostico.');
}

app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);

  const arm = estadoDoArmazenamento();
  if (arm.status === 'error') console.error(`❌ ARMAZENAMENTO: ${arm.aviso}`);
  else console.log(`📦 Armazenamento: ${arm.backend}${arm.bucket ? ' (' + arm.bucket + ')' : ''}`);

  // Sonda: grava, lê e apaga um arquivo no armazenamento configurado. É o
  // que separa "variáveis definidas" de "bucket funcionando". Não bloqueia
  // a subida; o resultado aparece no log e em /diagnostico.
  if (arm.status !== 'error') {
    verificaArmazenamento().then(v => {
      if (v.ok) console.log(`📦 Armazenamento verificado: gravação e leitura no backend ${v.backend} ok`);
      else console.error(`❌ ARMAZENAMENTO: sonda falhou no backend ${v.backend}: ${v.erro}`);
    }).catch(e => console.error('❌ ARMAZENAMENTO: sonda não rodou:', e.message));
  }

  // Deixa a Casa Azul demonstrável. Só age com SIMULATION_MODE=true, e é
  // idempotente — roda em todo boot sem duplicar nada.
  // Sem um superadmin nao ha como cadastrar cliente pela tela — e criar o
  // primeiro exigiria outro superadmin. Esta e a porta de entrada.
  await promoveSuperadmin().catch(err => console.error('Erro ao promover superadmin:', err));

  await semeiaCasaAzul().catch(err => console.error('Erro na semeadura:', err));

  // Inicializar serviço de email
  initEmailService().catch(err => console.error('Erro ao inicializar email:', err));
});
