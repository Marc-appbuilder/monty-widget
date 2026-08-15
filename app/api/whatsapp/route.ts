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

    const body =
      `🏡 New Vaughan lead\n` +
      `Name: ${name || 'Not provided'}\n` +
      `Phone: ${phone || 'Not provided'}\n` +
      `Email: ${email || 'Not provided'}\n` +
      `Enquiry: ${summary || 'Not provided'}\n` +
      `Time: ${time}`;

    const client = twilio(sid, token);

    try {
      await client.messages.create({ from: FROM, to: `whatsapp:${config.agentWhatsApp}`, body });
      console.log('[whatsapp] sent to', config.agentWhatsApp);
    } catch (waErr) {
      console.error('[whatsapp] WhatsApp failed, falling back to SMS:', waErr);
      await client.messages.create({ from: FROM.replace('whatsapp:', ''), to: config.agentWhatsApp, body });
      console.log('[whatsapp] SMS fallback sent to', config.agentWhatsApp);
    }

    return NextResponse.json({ ok: true }, { status: 200 });

  } catch (err) {
    console.error('[whatsapp] error:', err);
    return NextResponse.json({ ok: false }, { status: 200 }); // always 200 — caller never retries
  }
}
