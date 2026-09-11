import * as emailService from './emailService.js';
import * as whatsappService from './whatsappService.js';

/**
 * Boas-vindas por WhatsApp.
 *
 * O e-mail saiu daqui: era uma segunda mensagem, na mesma hora da confirmação
 * de endereço, dizendo quase a mesma coisa. As duas viraram uma só, composta
 * em `routes/auth.js`, que é onde nasce o link de confirmação.
 */
export async function notifyWelcome(user) {
  const results = { email: null, whatsapp: null };

  if (user.phone) {
    results.whatsapp = whatsappService.sendWelcomeWhatsApp(user.phone, user.name);
  }

  return results;
}

// Notificar destinação registrada
export async function notifyDestinationRegistered(user, donation, project, org = null) {
  const results = { email: null, whatsapp: null };
  const valor = `R$ ${parseFloat(donation.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  // Email
  try {
    results.email = await emailService.sendDestinationRegisteredEmail(user, donation, project, org);
  } catch (err) {
    console.error('❌ Erro email destinação:', err.message);
  }

  // WhatsApp
  if (user.phone) {
    results.whatsapp = whatsappService.sendDestinationRegisteredWhatsApp(user.phone, user.name, valor, project.title);
  }

  return results;
}

// Notificar destinação confirmada
export async function notifyDestinationConfirmed(user, donation, project, org = null) {
  const results = { email: null, whatsapp: null };
  const valor = `R$ ${parseFloat(donation.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  // Email
  try {
    results.email = await emailService.sendDestinationConfirmedEmail(user, donation, project, org);
  } catch (err) {
    console.error('❌ Erro email confirmação:', err.message);
  }

  // WhatsApp
  if (user.phone) {
    results.whatsapp = whatsappService.sendDestinationConfirmedWhatsApp(user.phone, user.name, valor, project.title);
  }

  return results;
}

// Notificar admin sobre nova destinação
export async function notifyAdminNewDonation(adminEmail, adminPhone, user, donation, project, org = null) {
  const results = { email: null, whatsapp: null };
  const valor = `R$ ${parseFloat(donation.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  // Email
  if (adminEmail) {
    try {
      results.email = await emailService.sendNewDonationToAdminEmail(adminEmail, user, donation, project, org);
    } catch (err) {
      console.error('❌ Erro email admin:', err.message);
    }
  }

  // WhatsApp
  if (adminPhone) {
    results.whatsapp = whatsappService.sendAdminNotificationWhatsApp(adminPhone, user.name, valor, project.title);
  }

  return results;
}

/**
 * Notifica o proponente de que ha recibo a emitir.
 *
 * Devolve tambem um link de WhatsApp pronto, para quando a organizacao tiver
 * numero cadastrado — em ONG pequena o WhatsApp chega antes do e-mail.
 */
export async function notifyProponenteMecenatoPendente(org, user, donation, project) {
  const results = { email: null, whatsapp: null };

  try {
    results.email = await emailService.sendMecenatoPendenteEmail(org, user, donation, project);
  } catch (err) {
    console.error('❌ Erro email proponente:', err.message);
  }

  if (org?.contact_whatsapp) {
    const valor = parseFloat(donation.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const msg =
      `Nova destinação confirmada no projeto ${donation.projeto_titulo || project?.title || ''}` +
      ` (PRONAC ${donation.pronac || '—'}).\n\n` +
      `Destinador: ${user.nome || user.name}\nCPF: ${user.cpf || '—'}\nValor: ${valor}\n\n` +
      `Recibo de Mecenato a emitir.`;
    results.whatsapp = whatsappService.generateWhatsAppLink(org.contact_whatsapp, msg);
  }

  return results;
}
