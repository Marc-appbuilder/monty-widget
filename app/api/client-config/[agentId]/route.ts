import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getClient } from '@/lib/clients';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  const { data } = await supabase
    .from('clients')
    .select('brand_color, teaser_text, border_colour, widget_position, widget_style, widget_theme')
    .eq('agent_id', agentId)
    .maybeSingle();

  const staticConfig = getClient(agentId);

  return NextResponse.json({
    brandColour:    data?.brand_color      ?? staticConfig.brandColour,
    teaserText:     data?.teaser_text      ?? staticConfig.teaserText      ?? null,
    borderColour:   data?.border_colour    ?? null,
    widgetPosition: data?.widget_position  ?? staticConfig.widgetPosition  ?? 'bottom-right',
    widgetStyle:    data?.widget_style     ?? staticConfig.widgetStyle     ?? 'v2',
    widgetTheme:    data?.widget_theme     ?? staticConfig.widgetTheme     ?? 'dark',
  });
}
