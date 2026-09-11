import { Resend } from 'resend';
import nodemailer from 'nodemailer';

let resendClient = null;
let transporter = null;
let emailServiceStatus = {
  initialized: false,
  mode: null,
  host: null,
  user: null,
  error: null
};

export async function initEmailService() {
  try {
    // Produção: Resend API (HTTP — não bloqueado pelo Railway)
    if (process.env.RESEND_API_KEY || process.env.SMTP_PASS) {
      const apiKey = process.env.RESEND_API_KEY || process.env.SMTP_PASS;
      resendClient = new Resend(apiKey);

      emailServiceStatus = {
        initialized: true,
        mode: 'production',
        host: 'api.resend.com',
        user: 'resend-api',
        error: null
      };

      console.log('📧 Serviço de email inicializado (PRODUÇÃO via Resend API)');
    } else {
      // Desenvolvimento: Ethereal (emails fake)
      const testAccount = await nodemailer.createTestAccount();

      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass }
      });

      emailServiceStatus = {
        initialized: true,
        mode: 'test',
        host: 'smtp.ethereal.email',
        user: testAccount.user,
        port: 587,
        secure: false,
        etherealUrl: 'https://ethereal.email',
        error: null
      };

      console.log('📧 Serviço de email inicializado (TESTE - Ethereal)');
      console.log('📧 Usuário Ethereal:', testAccount.user);
    }

    return resendClient || transporter;
  } catch (error) {
    emailServiceStatus = { initialized: false, mode: null, host: null, user: null, error: error.message };
    throw error;
  }
}

export function getEmailStatus() {
  return {
    ...emailServiceStatus,
    // Expostos porque foi exatamente a invisibilidade disto que deixou passar
    // uma semana de e-mails com link morto: o envio dava certo, o clique não.
    appUrl: getAppUrl(),
    from:   getFromAddress()
  };
}

/** Domínio que realmente serve a aplicação. O apex fica fora: responde com
 *  falha de TLS (SEC_E_WRONG_PRINCIPAL). */
export const URL_CANONICA = 'https://www.incentivabr.com.br';

/**
 * Onde a aplicação realmente atende — é daqui que sai todo link de e-mail.
 *
 * NÃO usa BRAND_DOMAIN, e isso é deliberado. BRAND_DOMAIN é um valor de MARCA
 * (aparece em rodapé e remetente), não uma promessa de que aquele domínio
 * serve a aplicação. Em produção ele está como `destineai.com.br`, que responde
 * 404 — então enquanto essa função o usava, TODO link de e-mail chegava morto:
 * redefinição de senha, confirmação de cadastro, aviso ao proponente. O e-mail
 * saía, ninguém conseguia clicar, e nada denunciava.
 *
 * O padrão é o domínio de verdade, e localhost só entra quando o ambiente diz
 * explicitamente que é local. A versão anterior fazia o contrário — caía em
 * localhost sempre que NODE_ENV não fosse exatamente 'production' — e um
 * ambiente sem NODE_ENV definido mandaria todo link de e-mail para a máquina de
 * quem recebe, que é o pior desfecho possível para uma falha silenciosa.
 */
export const getAppUrl = () => {
  // trim() antes de qualquer coisa: espaco colado sem querer num painel de
  // variaveis vira %20 no link e quebra a URL inteira. Aconteceu em producao —
  // o valor era "https://www.incentivabr.com.br   " e o e-mail saia apontando
  // para ...com.br%20%20%20/confirmar-cadastro.html. Barras finais tambem caem.
  const definido = (process.env.APP_URL || '').trim();
  if (definido) return definido.replace(/\/+$/, '');
  if (['development', 'test', 'local'].includes(process.env.NODE_ENV)) {
    return `http://localhost:${process.env.PORT || 3000}`;
  }
  return URL_CANONICA;
};

/**
 * Remetente das mensagens.
 *
 * NÃO deriva de BRAND_DOMAIN. Esse valor existe para exibição — rodapé, nome do
 * domínio na tela — e hoje está como destineai.com.br, a marca aposentada; era
 * por isso que os e-mails chegavam assinados por ela. Quem manda no remetente é
 * a marca do core, e SMTP_FROM sobrepõe quando houver necessidade (uma white
 * label com domínio próprio verificado no provedor, por exemplo).
 *
 * Se o provedor recusar este domínio por não estar verificado, o doSend reenvia
 * pelo remetente anterior — a troca se completa sozinha quando
 * incentivabr.com.br for verificado no Resend.
 */
const getFromAddress = () => {
  if (process.env.SMTP_FROM) return process.env.SMTP_FROM;
  const brand = process.env.BRAND_NAME || 'IncentivaBR';
  return `"${brand}" <contato@incentivabr.com.br>`;
};

/**
 * O botão de ação de uma mensagem, com estilo DIRETO na tag.
 *
 * Existe porque a classe `.button` do bloco `<style>` não sobrevive inteira no
 * Gmail: o fundo escuro chegava e a cor branca do texto não, deixando texto
 * escuro sobre fundo escuro. Sete mensagens saíam assim — inclusive o convite
 * de gestor e a confirmação de cadastro, onde o botão é a única saída.
 *
 * Não volte a usar `class="button"`.
 */
export const botaoEmail = (href, texto, org = null) => {
  const cor = org?.primary_color || process.env.BRAND_COLOR_PRIMARY || '#0F1E3D';
  return `<a href="${href}" style="display:inline-block;background:${cor};color:#ffffff;` +
         `padding:13px 26px;border-radius:8px;text-decoration:none;font-weight:bold;margin:18px 0">${texto}</a>`;
};

/**
 * @param {string} content
 * @param {Object} [org]
 * @param {string} [accessToken] - token do interessado. Informe SEMPRE que o
 *   destinatário estiver na lista de comunicação: é ele que faz o rodapé
 *   ganhar o link de cancelamento em um clique (LGPD, art. 8º §5º). E-mail de
 *   comunicação sem saída é o que transforma consentimento em armadilha.
 */
/**
 * A moldura de marca das mensagens: cabeçalho com o nome da organização,
 * o conteúdo no meio, rodapé com o endereço.
 *
 * Exportada porque `routes/auth.js` compõe as mensagens de conta — criação e
 * redefinição de senha — e elas precisam da mesma moldura das demais.
 *
 * Atenção ao estilar botão aqui dentro: o Gmail descarta parte do bloco
 * `<style>`, e a `.button` chegava com o fundo aplicado e a cor do texto não,
 * deixando texto escuro sobre fundo escuro. Botão leva estilo direto na tag.
 */
export function getEmailTemplate(content, org = null, accessToken = null) {
  const orgName       = org?.name           || process.env.BRAND_NAME          || 'IncentivaBR';
  const primaryColor  = org?.primary_color  || process.env.BRAND_COLOR_PRIMARY || '#0F1E3D';
  const appUrl        = getAppUrl();

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${primaryColor}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        /* Sem .button aqui: o Gmail descarta parte deste bloco e o texto do
           botao sumia no fundo. Use o helper botaoEmail(), que estila na tag. */
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        .highlight { background: #EEF2FF; padding: 15px; border-radius: 5px; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${orgName}</h1>
          <p>Incentivos Fiscais Simplificados · Powered by IncentivaBR</p>
        </div>
        <div class="content">${content}</div>
        <div class="footer">
          <p>Este é um email automático do ${orgName}.</p>
          <p><a href="${appUrl}" style="color:#0F1E3D">${appUrl.replace('https://', '')}</a></p>
          ${accessToken ? `
          <p style="margin-top:14px">
            <a href="${appUrl}/minhas-preferencias.html?t=${encodeURIComponent(accessToken)}" style="color:#8B96A8">
              Gerenciar preferências ou cancelar o recebimento
            </a>
          </p>` : ''}
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Remetente que já sabemos funcionar.
 *
 * O provedor (Resend) só aceita enviar de domínio verificado nele. Hoje o
 * verificado é o destineai.com.br — por isso o e-mail chega com um remetente da
 * marca aposentada. Trocar o padrão sem verificar incentivabr.com.br no Resend
 * derrubaria TODO o envio de uma vez, e em silêncio.
 */
const REMETENTE_ANTERIOR = '"IncentivaBR" <contato@destineai.com.br>';

/** O provedor recusou porque o domínio do remetente não está verificado? */
const dominioNaoVerificado = (msg = '') =>
  /domain|verif|not allowed|sender|from address/i.test(msg);

async function doSend({ to, subject, html }) {
  if (resendClient) {
    const from = getFromAddress();
    const result = await resendClient.emails.send({ from, to, subject, html });

    // Tenta o remetente da marca certa e, se o provedor recusar o domínio,
    // reenvia pelo que já funciona em vez de perder a mensagem. Assim a troca
    // acontece sozinha no dia em que incentivabr.com.br for verificado no
    // Resend, sem precisar mexer em código nem arriscar um apagão de e-mail.
    if (result.error && dominioNaoVerificado(result.error.message) && from !== REMETENTE_ANTERIOR) {
      console.warn(
        `[email] remetente ${from} recusado pelo provedor (${result.error.message}). ` +
        `Reenviando por ${REMETENTE_ANTERIOR}. ` +
        `Para usar o domínio da marca: verifique incentivabr.com.br no Resend e defina SMTP_FROM.`
      );
      const retorno = await resendClient.emails.send({
        from: REMETENTE_ANTERIOR, to, subject, html
      });
      if (retorno.error) throw new Error(retorno.error.message);
      console.log('📧 Email enviado (remetente anterior):', retorno.data?.id);
      return;
    }

    if (result.error) throw new Error(result.error.message);
    console.log('📧 Email enviado:', result.data?.id);
    return;
  }
  if (transporter) {
    const info = await transporter.sendMail({ from: getFromAddress(), to, subject, html });
    if (emailServiceStatus.mode === 'test') {
      console.log('📧 Email de teste:', nodemailer.getTestMessageUrl(info));
    }
    return info;
  }
}

export async function sendEmail({ to, subject, html }) {
  if (!resendClient && !transporter) return;
  try {
    await doSend({ to, subject, html });
  } catch (error) {
    console.error('Erro ao enviar email:', error.message);
  }
}

// O e-mail de boas-vindas era enviado aqui, separado do de confirmação: quem
// criava conta recebia duas mensagens na mesma hora dizendo quase a mesma
// coisa. As duas viraram uma só, composta em `routes/auth.js`, onde nasce o
// link de confirmação.

export async function sendDestinationRegisteredEmail(user, donation, project, org = null) {
  if (!resendClient && !transporter) return null;

  const valor = parseFloat(donation.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const content = `
    <h2>Destinação Registrada! 📝</h2>
    <p>Olá, ${user.name}!</p>
    <div class="highlight">
      <strong>Projeto:</strong> ${project.title}<br>
      <strong>Valor:</strong> ${valor}<br>
      <strong>Status:</strong> ⏳ Aguardando confirmação do depósito
    </div>
    ${botaoEmail(`${getAppUrl()}/dashboard.html`, 'Ver minhas destinações', org)}
  `;

  try {
    await doSend({
      to: user.email,
      subject: `Destinação registrada — ${project.title}`,
      html: getEmailTemplate(content, org)
    });
  } catch (error) {
    console.error('Erro ao enviar email de destinação:', error.message);
  }
}

export async function sendDestinationConfirmedEmail(user, donation, project, org = null) {
  if (!resendClient && !transporter) return null;

  const valor = parseFloat(donation.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const content = `
    <h2>Destinação Confirmada! ✅</h2>
    <p>Olá, ${user.name}!</p>
    <div class="highlight">
      <strong>Projeto:</strong> ${project.title}<br>
      <strong>Valor:</strong> ${valor}<br>
      <strong>Status:</strong> ✅ Confirmado
    </div>
    <p>Acesse seu dashboard para baixar os documentos.</p>
    ${botaoEmail(`${getAppUrl()}/dashboard.html`, 'Baixar documentos', org)}
    <p style="margin-top: 20px; color: #00A859; font-weight: bold;">
      🎉 Obrigado por transformar seu imposto em impacto social!
    </p>
  `;

  try {
    await doSend({
      to: user.email,
      subject: `✅ Destinação confirmada - ${project.title}`,
      html: getEmailTemplate(content, org)
    });
  } catch (error) {
    console.error('Erro ao enviar email de confirmação:', error.message);
  }
}

export async function sendNewDonationToAdminEmail(adminEmail, user, donation, project, org = null) {
  if (!resendClient && !transporter) return null;

  const valor = parseFloat(donation.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const content = `
    <h2>Nova Destinação Pendente! 🔔</h2>
    <div class="highlight">
      <strong>Contribuinte:</strong> ${user.name}<br>
      <strong>Email:</strong> ${user.email}<br>
      <strong>Projeto:</strong> ${project.title}<br>
      <strong>Valor:</strong> ${valor}<br>
      <strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>
    ${botaoEmail(`${getAppUrl()}/admin.html`, 'Acessar Painel Admin', org)}
  `;

  try {
    await doSend({
      to: adminEmail,
      subject: `🔔 Nova destinação pendente - ${valor}`,
      html: getEmailTemplate(content, org)
    });
  } catch (error) {
    console.error('Erro ao enviar email para admin:', error.message);
  }
}

/**
 * Avisa o proponente que ha um Recibo de Mecenato a emitir.
 *
 * Quem emite o recibo e o proponente, no modelo oficial do MinC. Este e-mail
 * existe para que o destinador nao precise correr atras: ele transfere, e a
 * instituicao ja e avisada com todos os campos que o modelo exige.
 */
export async function sendMecenatoPendenteEmail(org, user, donation, project) {
  if (!resendClient && !transporter) return null;
  const destino = org?.contact_email;
  if (!destino) {
    console.warn('[mecenato] organização sem contact_email — proponente não notificado');
    return null;
  }

  const valor = parseFloat(donation.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const prazo = org?.mecenato_prazo_dias || 10;

  const content = `
    <h2>Recibo de Mecenato a emitir 📄</h2>
    <p>Uma destinação foi confirmada e aguarda o recibo.</p>
    <div class="highlight">
      <strong>Destinador:</strong> ${user.nome || user.name}<br>
      <strong>CPF:</strong> ${user.cpf || '—'}<br>
      <strong>Valor:</strong> ${valor}<br>
      <strong>Projeto:</strong> ${project?.title || donation.projeto_titulo || '—'}<br>
      <strong>PRONAC:</strong> ${donation.pronac || '—'}<br>
      <strong>Data:</strong> ${new Date(donation.confirmed_at || Date.now()).toLocaleDateString('pt-BR')}
    </div>
    <p>Estes são os campos exigidos pelo modelo do Ministério da Cultura. Emita o
    recibo em três vias — Ministério, instituição e destinador — e anexe a via do
    destinador na plataforma: ele baixa direto da conta dele.</p>
    ${botaoEmail(`${getAppUrl()}/dashboard.html`, 'Anexar recibo', org)}
    <p style="margin-top:18px;color:#666;font-size:13px">
      O destinador foi informado de que o recibo costuma sair em até ${prazo} dias úteis.
    </p>
  `;

  try {
    await doSend({
      to: destino,
      subject: `📄 Recibo de Mecenato a emitir — ${valor}`,
      html: getEmailTemplate(content, org)
    });
    return true;
  } catch (error) {
    console.error('Erro ao notificar proponente:', error.message);
    return null;
  }
}


// ───────────────────────────────────────────────────────────────────────────
// Cadastro de interessados (LGPD)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Confirmacao de cadastro — duplo opt-in.
 *
 * Este e-mail e a unica coisa que a pessoa recebe antes de confirmar. Se ela
 * nao pediu o cadastro, ele precisa deixar isso obvio e nao custar nada:
 * ignorar ja resolve, porque sem o clique o cadastro nao vale.
 */
export async function sendConfirmacaoCadastroEmail(org, user, confirmToken) {
  if (!resendClient && !transporter) return null;
  if (!user?.email) return null;

  const link = `${getAppUrl()}/confirmar-cadastro.html?t=${encodeURIComponent(confirmToken)}`;
  const saudacao = user.nome ? `Ola, ${user.nome}!` : 'Ola!';

  const content = `
    <h2>Confirme seu cadastro</h2>
    <p>${saudacao}</p>
    <p>Voce pediu para receber avisos sobre destinacao de Imposto de Renda.
    Para valer, falta so confirmar — e um clique:</p>
    ${botaoEmail(`${link}`, 'Confirmar meu cadastro', org)}
    <p style="margin-top:18px;color:#666;font-size:13px">
      Nao foi voce? Entao ignore esta mensagem. Sem esse clique o cadastro nao
      se completa e voce nao recebera mais nada de nossa parte.
    </p>
    <p style="color:#666;font-size:13px">Este link vale por 7 dias.</p>
  `;

  try {
    await doSend({
      to: user.email,
      subject: 'Confirme seu cadastro',
      html: getEmailTemplate(content, org)
    });
    return true;
  } catch (error) {
    console.error('Erro ao enviar confirmacao de cadastro:', error.message);
    return null;
  }
}

/**
 * Link para gerenciar preferencias.
 *
 * Enviado quando alguem tenta se cadastrar com um e-mail que ja confirmou. O
 * endpoint de cadastro e aberto, entao ele nao pode alterar o consentimento de
 * quem ja tem vinculo — quem chega por ali recebe o caminho autenticado, que
 * so cai na caixa da propria pessoa.
 */
export async function sendGerenciarPreferenciasEmail(org, user, accessToken) {
  if (!resendClient && !transporter) return null;
  if (!user?.email) return null;

  const base = `${getAppUrl()}/minhas-preferencias.html?t=${encodeURIComponent(accessToken)}`;

  const content = `
    <h2>Suas preferencias de comunicacao</h2>
    <p>Recebemos um pedido de cadastro com este e-mail, que ja esta na nossa
    lista. Nada foi alterado.</p>
    <p>Para mudar o que voce recebe — ou para sair da lista — use o link abaixo:</p>
    ${botaoEmail(`${base}`, 'Gerenciar minhas preferencias', org)}
    <p style="margin-top:18px;color:#666;font-size:13px">
      Se nao foi voce quem pediu, nao ha nada a fazer: nenhuma preferencia sua
      foi modificada.
    </p>
  `;

  try {
    await doSend({
      to: user.email,
      subject: 'Suas preferencias de comunicacao',
      html: getEmailTemplate(content, org)
    });
    return true;
  } catch (error) {
    console.error('Erro ao enviar link de preferencias:', error.message);
    return null;
  }
}

/**
 * Convite para operar uma organização.
 *
 * Não é o mesmo que confirmar um cadastro. Quem aceita este link passa a poder
 * conferir comprovantes e confirmar destinações — dinheiro de terceiros. Por
 * isso o texto diz explicitamente qual é o poder que está sendo entregue, e o
 * prazo é curto o bastante para que um convite esquecido não fique aberto.
 */
export async function sendConviteGestorEmail(org, convite, tokenClaro, quemConvidou) {
  if (!resendClient && !transporter) return null;
  if (!convite?.email) return null;

  const link = `${getAppUrl()}/aceitar-convite.html?t=${encodeURIComponent(tokenClaro)}` +
               (org?.slug ? `&org=${encodeURIComponent(org.slug)}` : '');
  const marca = org?.name || 'a instituição';
  const saudacao = convite.nome ? `Olá, ${convite.nome}!` : 'Olá!';
  const porQuem = quemConvidou ? ` por ${quemConvidou}` : '';

  const content = `
    <h2>Você foi convidado a gerenciar ${marca}</h2>
    <p>${saudacao}</p>
    <p>Você recebeu${porQuem} um acesso de gestor à plataforma de destinação de
    Imposto de Renda de <strong>${marca}</strong>.</p>
    <p>Com esse acesso você vai:</p>
    <ul style="color:#333;line-height:1.7">
      <li>ver quem destinou para o projeto e quanto;</li>
      <li>conferir os comprovantes de transferência;</li>
      <li><strong>confirmar</strong> cada destinação, o que dispara a emissão do
          Recibo de Mecenato em nome do destinador.</li>
    </ul>
    ${botaoEmail(`${link}`, 'Criar minha senha e entrar', org)}
    <p style="margin-top:18px;color:#666;font-size:13px">
      Este link vale por 48 horas e só pode ser usado uma vez. Depois disso,
      peça um novo a quem te convidou.
    </p>
    <p style="color:#666;font-size:13px">
      Não esperava este convite? Ignore esta mensagem e avise quem te enviou —
      sem o clique, nenhum acesso é criado.
    </p>
  `;

  try {
    await doSend({
      to: convite.email,
      subject: `Seu acesso de gestor — ${marca}`,
      html: getEmailTemplate(content, org)
    });
    return true;
  } catch (error) {
    console.error('Erro ao enviar convite de gestor:', error.message);
    return null;
  }
}
