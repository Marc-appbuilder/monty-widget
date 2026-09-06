import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/clients';
import { resolveClient } from '@/lib/chatacus/resolveClient';
import { Resend } from 'resend';
import { supabase } from '@/lib/supabase';
import type { LeadPayload } from '@/app/api/lead/route';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? 're_placeholder');
}

/* ── Rate limiting ──────────────────────────────────────────────────────── */
const RATE_LIMIT    = 30;          // max API calls per IP per window
const WINDOW_MS     = 10 * 60 * 1000;
const MAX_MSG_LEN   = 500;
const MAX_HISTORY   = 30;          // max messages in a single conversation

const ipCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now   = Date.now();
  const entry = ipCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

/* ── Lead tool definition ───────────────────────────────────────────────── */
const captureLeadTool: Anthropic.Tool = {
  name: 'capture_lead',
  description:
    'Call this tool once you have asked for ALL THREE of: name, email address, and phone number, ' +
    'and received a response to each — whether the user provided the value or declined to give it. ' +
    'Do NOT fire early just because you have name + one contact method. ' +
    'Always ask for email AND phone before calling this tool. ' +
    'If the user declines or ignores a field, treat it as declined and move on — then call this tool with whatever was collected. ' +
    'Never skip this tool because a field is missing.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name:         { type: 'string', description: 'Full name of the lead' },
      email:        { type: 'string', description: 'Email address, or omit if not provided' },
      phone:        { type: 'string', description: 'Phone number, or omit if not provided' },
      enquiry_type: { type: 'string', enum: ['vendor', 'landlord', 'buyer', 'tenant', 'other'], description: 'Best classification of what the lead is looking to do' },
      summary:      { type: 'string', description: 'One or two sentence summary of what they are looking for' },
    },
    required: ['name'],
  },
};

/* ── Email helpers ──────────────────────────────────────────────────────── */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildHtml(lead: LeadPayload, clientName: string, brandColour: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/>
<style>
  body{font-family:Arial,sans-serif;color:#222;margin:0;padding:0;background:#f5f5f5}
  .wrapper{max-width:560px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .header{background:${brandColour};color:#fff;padding:24px 32px}
  .header h1{margin:0;font-size:20px;font-weight:700}
  .header p{margin:4px 0 0;font-size:13px;opacity:.8}
  .body{padding:28px 32px}
  table{border-collapse:collapse;width:100%}
  td{padding:10px 14px;border:1px solid #e8e8e8;vertical-align:top;font-size:14px}
  td:first-child{background:#f9f9f9;font-weight:600;width:120px;color:#555}
  .summary{margin-top:20px;background:#f9f9f9;border-left:4px solid ${brandColour};padding:14px 18px;border-radius:4px;font-size:14px;white-space:pre-wrap;color:#333}
  .footer{margin-top:24px;font-size:11px;color:#aaa}
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>New lead — ${escapeHtml(clientName)}</h1>
    <p>${new Date().toUTCString()}</p>
  </div>
  <div class="body">
    <table>
      <tr><td>Name</td><td>${escapeHtml(lead.name)}</td></tr>
      <tr><td>Email</td><td>${lead.email ? `<a href="mailto:${escapeHtml(lead.email)}" style="color:${brandColour}">${escapeHtml(lead.email)}</a>` : '<span style="color:#aaa">Not provided</span>'}</td></tr>
      <tr><td>Phone</td><td>${lead.phone ? `<a href="tel:${escapeHtml(lead.phone)}" style="color:${brandColour}">${escapeHtml(lead.phone)}</a>` : '<span style="color:#aaa">Not provided</span>'}</td></tr>
    </table>
    ${lead.summary ? `<div class="summary"><strong>What they were looking for:</strong>\n${escapeHtml(lead.summary)}</div>` : ''}
    <div class="footer">Sent automatically by Vaughan</div>
  </div>
</div>
</body></html>`;
}

async function sendLeadEmail(lead: LeadPayload, clientId: string) {
  const config = getClient(clientId);
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, error } = await getResend().emails.send({
      from: 'Vaughan <leads@vaughanai.co>',
      to: config.notificationEmail,
      ...(lead.email ? { replyTo: lead.email } : {}),
      subject: `New lead — ${config.name}`,
      html: buildHtml(lead, config.name, config.brandColour),
    });
    if (!error) {
      console.log(`[lead] email sent (attempt ${attempt}):`, data?.id, '→', config.notificationEmail);
      return;
    }
    lastError = error;
    console.error(`[lead] resend attempt ${attempt} failed:`, JSON.stringify(error));
    if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
  }
  throw lastError;
}

/* ── Types ──────────────────────────────────────────────────────────────── */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/* ── Chat route ─────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ rateLimited: true }, { status: 429 });
  }

  let clientId: string;
  let messages: ChatMessage[];

  try {
    ({ clientId, messages } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!clientId || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'clientId and messages are required' }, { status: 400 });
  }

  const config = await resolveClient(clientId);

  // Fetch language + status/provisioning flags from Supabase (one query, reused below)
  const { data: clientRow } = await supabase
    .from('clients')
    .select('language, status, provisioned_via')
    .eq('agent_id', clientId)
    .maybeSingle();

  // Only a Chatacus-provisioned client can be deactivated this way — existing
  // hand-configured clients have provisioned_via = null and are unaffected
  // regardless of what their `status` column says. 'inactive' is the only
  // value the clients_status_check constraint allows for this (there is no
  // separate 'suspended' state).
  if (clientRow?.provisioned_via === 'chatacus-v1' && clientRow?.status === 'inactive') {
    const encoder = new TextEncoder();
    const inactiveStream = new ReadableStream({
      start(controller) {
        const text = 'This assistant is currently unavailable. Please check back later.';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    return new Response(inactiveStream, {
      headers: {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache, no-transform',
        'Connection':         'keep-alive',
        'X-Accel-Buffering':  'no',
      },
    });
  }

  let languageInstruction = '';
  const language = clientRow?.language ?? 'english';
  if (language === 'welsh') {
    languageInstruction = '\n\nAlways respond in Welsh (Cymraeg) only regardless of what language the user writes in.';
  } else if (language === 'bilingual') {
    languageInstruction = '\n\nYou support English and Welsh languages only. Detect whether the user is writing in English or Welsh and respond in the same language. If unsure, default to English.';
  }
  const brandRule = '\n\nBrand rule: you are Vaughan — always introduce yourself as just "Vaughan", never as "Vaughan from [agency name]". The agency and Vaughan are separate. If asked who you are, say "I\'m Vaughan" only.';
  const systemPrompt = config.systemPrompt + brandRule + languageInstruction;

  const sanitisedMessages: Anthropic.MessageParam[] = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, MAX_MSG_LEN) }));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (text: string) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));

      try {
        /* ── First pass ── */
        const firstStream = anthropic.messages.stream({
          model:      'claude-sonnet-4-6',
          max_tokens: 512,
          system:     systemPrompt,
          messages:   sanitisedMessages,
          tools:      [captureLeadTool],
        });

        // Collect tool call input while streaming text
        let toolUseId    = '';
        let toolRawInput = '';
        let toolCalled   = false;

        for await (const event of firstStream) {
          if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
            toolUseId = event.content_block.id;
            toolRawInput = '';
            toolCalled = true;
          } else if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
            toolRawInput += event.delta.partial_json;
          } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            enqueue(event.delta.text);
          }
        }

        if (!toolCalled) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          return;
        }


        /* ── Tool called: parse input, fire email, continue ── */
        let toolInput: LeadPayload = { clientId, name: '', email: '' };
        try {
          const parsed = JSON.parse(toolRawInput);
          toolInput = { clientId, ...parsed };
        } catch {
          console.error('[chat] failed to parse tool input:', toolRawInput);
        }

        // Fire email and save to Supabase as long as we have name + at least one contact method
        if (toolInput.name && (toolInput.email || toolInput.phone)) {
          // Duplicate suppression: skip email if same email/phone already captured in last 24h
          const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          let isDuplicate = false;
          if (toolInput.email) {
            const { data } = await supabase.from('leads')
              .select('id').eq('agent_id', clientId).eq('email', toolInput.email)
              .gte('created_at', cutoff).limit(1);
            if (data && data.length > 0) isDuplicate = true;
          }
          if (!isDuplicate && toolInput.phone) {
            const { data } = await supabase.from('leads')
              .select('id').eq('agent_id', clientId).eq('phone', toolInput.phone)
              .gte('created_at', cutoff).limit(1);
            if (data && data.length > 0) isDuplicate = true;
          }
          let waDebug = 'skipped (duplicate)';
          if (!isDuplicate) {
            await sendLeadEmail(toolInput, clientId);
            waDebug = await fetch(new URL('/api/whatsapp', req.url).toString(), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                clientId,
                name:    toolInput.name,
                phone:   toolInput.phone,
                email:   toolInput.email,
                summary: toolInput.summary,
              }),
            })
              .then(async (r) => `status ${r.status}: ${await r.text()}`)
              .catch((e) => `fetch threw: ${e instanceof Error ? e.message : String(e)}`);
          }
          supabase.from('leads').insert({
            agent_id:         clientId,
            name:             toolInput.name,
            email:            toolInput.email ?? null,
            phone:            toolInput.phone ?? null,
            enquiry_type:     (toolInput as unknown as Record<string, unknown>).enquiry_type as string ?? null,
            notes:            `${toolInput.summary ?? ''} [wa-debug: ${waDebug}]`.trim(),
            raw_conversation: sanitisedMessages
              .map((m) => `${m.role}: ${m.content}`)
              .join('\n'),
          }).then(({ error }) => {
            if (error) console.error('[lead] supabase insert error:', error);
          });
        }

        /* ── Second pass: give Claude the tool result ── */
        const followUpMessages: Anthropic.MessageParam[] = [
          ...sanitisedMessages,
          {
            role: 'assistant',
            content: [{
              type: 'tool_use' as const,
              id:    toolUseId,
              name:  'capture_lead',
              input: toolInput,
            }],
          },
          {
            role: 'user',
            content: [{
              type:        'tool_result' as const,
              tool_use_id: toolUseId,
              content:     'Lead captured successfully. Give a single short warm closing line only — do not repeat anything already said, do not re-state contact promises, do not summarise the conversation.',
            }],
          },
        ];

        const followUpStream = anthropic.messages.stream({
          model:      'claude-sonnet-4-6',
          max_tokens: 256,
          system:     systemPrompt,
          messages:   followUpMessages,
          tools:      [captureLeadTool],
        });

        for await (const event of followUpStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            enqueue(event.delta.text);
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (err) {
        const message = err instanceof Anthropic.APIError ? err.message : 'Unexpected error';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':     'text/event-stream',
      'Cache-Control':    'no-cache, no-transform',
      'Connection':       'keep-alive',
      'X-Accel-Buffering':'no',
    },
  });
}
