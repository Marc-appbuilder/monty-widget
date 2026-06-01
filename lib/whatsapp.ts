import twilio from 'twilio';
import type { LeadPayload } from '@/app/api/lead/route';
import { getClient } from '@/lib/clients';

const FROM = 'whatsapp:+12365069129';

function getClient_() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('Twilio credentials not configured');
  return twilio(sid, token);
}

export async function sendWhatsAppNotification(lead: LeadPayload, clientId: string): Promise<void> {
  const config = getClient(clientId);
  if (!config.agentWhatsApp) return;

  const time = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
  });

  const body =
    `🏡 New Vaughan lead\n` +
    `Name: ${lead.name}\n` +
    `Phone: ${lead.phone || 'Not provided'}\n` +
    `Email: ${lead.email || 'Not provided'}\n` +
    `Enquiry: ${lead.summary || 'Not provided'}\n` +
    `Time: ${time}`;

  await getClient_().messages.create({
    from: FROM,
    to:   `whatsapp:${config.agentWhatsApp}`,
    body,
  });
}
