import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { getClient } from '@/lib/clients';

const FROM = process.env.TWILIO_WHATSAPP_FROM
  ? 'whatsapp:' + process.env.TWILIO_WHATSAPP_FROM.replace(/^whatsapp:/, '')
  : 'whatsapp:+12365069129';

export async function POST(req: NextRequest) {
  try {
    const { clientId, name, phone, email, summary } = await req.json();

    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      console.error('[whatsapp] missing Twilio credentials');
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    const config = getClient(clientId);
    if (!config.agentWhatsApp) {
      return NextResponse.json({ ok: false, reason: 'no agentWhatsApp configured' }, { status: 200 });
    }

    const time = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
    });

    const displayName = config.assistantDisplayName || 'Chatacus';
    const body =
      `🏡 New ${displayName} lead\n` +
      `Name: ${name || 'Not provided'}\n` +
      `Phone: ${phone || 'Not provided'}\n` +
      `Email: ${email || 'Not provided'}\n` +
      `Enquiry: ${summary || 'Not provided'}\n` +
      `Time: ${time}`;

    const client      = twilio(sid, token);
    const templateSid = process.env.TWILIO_TEMPLATE_SID;

    console.log('[whatsapp] firing — to:', config.agentWhatsApp, 'templateSid:', templateSid || 'none');

    if (templateSid) {
      const msg = await client.messages.create({
        from:             FROM,
        to:               `whatsapp:${config.agentWhatsApp}`,
        contentSid:       templateSid,
        contentVariables: JSON.stringify({
          '1': name    || 'Not provided',
          '2': phone   || 'Not provided',
          '3': email   || 'Not provided',
          '4': summary || 'Not provided',
          '5': time,
        }),
      });
      console.log('[whatsapp] sent — sid:', msg.sid, 'status:', msg.status);
    } else {
      const msg = await client.messages.create({ from: FROM.replace('whatsapp:', ''), to: config.agentWhatsApp, body });
      console.log('[sms] sent — sid:', msg.sid, 'status:', msg.status);
    }

    return NextResponse.json({ ok: true }, { status: 200 });

  } catch (err) {
    console.error('[whatsapp] error:', err);
    return NextResponse.json({ ok: false }, { status: 200 }); // always 200 — caller never retries
  }
}
