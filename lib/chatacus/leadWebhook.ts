import type { LeadPayload } from '@/app/api/lead/route';

/**
 * Sends a captured lead to Chatacus's central notification system, for
 * Chatacus-provisioned clients only. Called from app/api/chat/route.ts
 * INSTEAD OF sendLeadEmail()/the WhatsApp fetch — never alongside them.
 *
 * If CHATACUS_WEBHOOK_URL isn't configured, this deliberately does NOT
 * fall back to Vaughan's own Resend/Twilio notifications — the intended
 * architecture is that Chatacus owns notifications for its own customers.
 * It logs a clear server-side error instead, and the lead is still saved
 * to the leads table regardless (that insert happens independently in
 * the caller) — a missing webhook URL never fails the chat request.
 */
export async function sendLeadWebhook(lead: LeadPayload, clientId: string): Promise<string> {
  const webhookUrl = process.env.CHATACUS_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error(
      `[chatacus-webhook] Lead captured for Chatacus-provisioned client "${clientId}" but ` +
      `CHATACUS_WEBHOOK_URL is not configured — no notification was sent. The lead itself is ` +
      `still being stored in the leads table.`
    );
    return 'webhook skipped (CHATACUS_WEBHOOK_URL not configured)';
  }

  const payload = {
    templateId:  'vaughan',
    agentId:     clientId,
    name:        lead.name,
    email:       lead.email,
    phone:       lead.phone,
    summary:     lead.summary,
    enquiryType: (lead as unknown as Record<string, unknown>).enquiry_type as string ?? null,
    capturedAt:  new Date().toISOString(),
  };

  try {
    const res = await fetch(`${webhookUrl.replace(/\/$/, '')}/api/webhooks/lead`, {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'X-Chatacus-Secret':  process.env.CHATACUS_PROVISION_SECRET ?? '',
      },
      body: JSON.stringify(payload),
    });
    return `webhook status ${res.status}: ${await res.text()}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[chatacus-webhook] failed to reach CHATACUS_WEBHOOK_URL for client "${clientId}":`, message);
    return `webhook fetch threw: ${message}`;
  }
}
