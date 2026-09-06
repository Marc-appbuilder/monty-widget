import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Chatacus suspend endpoint — sets a Chatacus-provisioned client's status
 * to 'inactive' (already enforced by app/api/chat/route.ts since Step 3).
 *
 * Hard guard: only ever acts on a row with provisioned_via='chatacus-v1'.
 * Checked twice — once before touching anything, and again as part of the
 * update's own filter — so even a logic slip in the pre-check can't cause
 * a write to a hand-configured client like avenue-estates or tailor-made.
 */

const RATE_LIMIT = 20;
const WINDOW_MS  = 10 * 60 * 1000;
const ipCounts   = new Map<string, { count: number; resetAt: number }>();

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

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const secret = req.headers.get('x-chatacus-secret');
  if (!secret || secret !== process.env.CHATACUS_PROVISION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { agentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const agentId = body.agentId;
  if (!agentId?.trim()) {
    return NextResponse.json({ error: 'agentId is required' }, { status: 400 });
  }

  const { data: row, error: fetchError } = await supabase
    .from('clients')
    .select('agent_id, provisioned_via')
    .eq('agent_id', agentId)
    .maybeSingle();

  if (fetchError) {
    console.error('[chatacus/suspend] lookup error:', fetchError);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }

  if (!row || row.provisioned_via !== 'chatacus-v1') {
    return NextResponse.json({ error: 'Not a Chatacus-provisioned client' }, { status: 403 });
  }

  const { error: updateError } = await supabase
    .from('clients')
    .update({ status: 'inactive' })
    .eq('agent_id', agentId)
    .eq('provisioned_via', 'chatacus-v1');

  if (updateError) {
    console.error('[chatacus/suspend] update error:', updateError);
    return NextResponse.json({ error: 'Failed to suspend client' }, { status: 500 });
  }

  return NextResponse.json({ agentId, status: 'inactive' }, { status: 200 });
}
