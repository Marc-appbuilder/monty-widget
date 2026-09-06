import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/clients';

export interface LeadPayload {
  clientId: string;
  name: string;
  email?: string;
  phone?: string;
  summary?: string;
}

function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? 're_placeholder');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(lead: LeadPayload, clientName: string, brandColour: string, displayName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #222; margin: 0; padding: 0; background: #f5f5f5; }
    .wrapper { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .header { background: ${brandColour}; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.8; }
    .body { padding: 28px 32px; }
    table { border-collapse: collapse; width: 100%; }
    td { padding: 10px 14px; border: 1px solid #e8e8e8; vertical-align: top; font-size: 14px; }
    td:first-child { background: #f9f9f9; font-weight: 600; width: 120px; color: #555; }
    .summary { margin-top: 20px; background: #f9f9f9; border-left: 4px solid ${brandColour}; padding: 14px 18px; border-radius: 4px; font-size: 14px; white-space: pre-wrap; color: #333; }
    .footer { margin-top: 24px; font-size: 11px; color: #aaa; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>New lead from ${escapeHtml(displayName)} — ${escapeHtml(clientName)}</h1>
      <p>${new Date().toUTCString()}</p>
    </div>
    <div class="body">
      <table>
        <tr><td>Name</td><td>${escapeHtml(lead.name)}</td></tr>
        <tr><td>Email</td><td>${lead.email ? `<a href="mailto:${escapeHtml(lead.email)}" style="color:${brandColour}">${escapeHtml(lead.email)}</a>` : '<span style="color:#aaa">Not provided</span>'}</td></tr>
        <tr><td>Phone</td><td>${lead.phone ? `<a href="tel:${escapeHtml(lead.phone)}" style="color:${brandColour}">${escapeHtml(lead.phone)}</a>` : '<span style="color:#aaa">Not provided</span>'}</td></tr>
      </table>
      ${lead.summary ? `<div class="summary"><strong>What they were looking for:</strong>\n${escapeHtml(lead.summary)}</div>` : ''}
      <div class="footer">Sent automatically by ${escapeHtml(displayName)}</div>
    </div>
  </div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  let body: LeadPayload;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { clientId, name, email, phone, summary } = body;

  if (!clientId || !name?.trim() || (!email?.trim() && !phone?.trim())) {
    return NextResponse.json(
      { error: 'clientId, name, and at least one of email or phone are required' },
      { status: 400 }
    );
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  const config = getClient(clientId);
  const displayName = config.assistantDisplayName || 'Chatacus';

  const { error } = await getResend().emails.send({
    from: `${displayName} <leads@notifications.vaughan.ai>`,
    to: config.notificationEmail,
    ...(email ? { replyTo: email } : {}),
    subject: `New lead from ${displayName} — ${config.name}`,
    html: buildHtml({ clientId, name, email, phone, summary }, config.name, config.brandColour, displayName),
  });

  if (error) {
    console.error('[lead] resend error:', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
