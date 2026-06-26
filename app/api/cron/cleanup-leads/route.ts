import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const RETENTION_MONTHS = 24;

/** Vercel Cron — runs daily. Deletes leads older than the retention window. */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);

  const { data, error } = await supabase
    .from('leads')
    .delete()
    .lt('created_at', cutoff.toISOString())
    .select('id');

  if (error) {
    console.error('[cleanup-leads] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[cleanup-leads] deleted ${data?.length ?? 0} leads older than ${RETENTION_MONTHS} months`);
  return NextResponse.json({ deleted: data?.length ?? 0 });
}
