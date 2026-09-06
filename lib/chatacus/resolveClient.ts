import { clients, type ClientConfig } from '@/lib/clients';
import { supabase } from '@/lib/supabase';

/**
 * Resolves a clientId to its config.
 *
 * Step 1 always wins: every hand-configured client in lib/clients.ts is
 * returned immediately, without ever querying Supabase. Existing clients
 * (avenue-estates, tailor-made, demo, etc.) are matched here and their
 * behaviour is completely unchanged from before this resolver existed.
 *
 * Only a clientId that is NOT in the hardcoded object falls through to
 * step 2 — a lookup for a Chatacus-provisioned row. That lookup requires
 * provisioned_via = 'chatacus-v1', so it can only ever match a row created
 * by the (not yet built) provisioning flow — never an existing client.
 *
 * If neither step finds anything, falls back to the demo client, matching
 * the pre-existing behaviour of lib/clients.ts's getClient().
 */
export async function resolveClient(clientId: string): Promise<ClientConfig> {
  if (clients[clientId]) return clients[clientId];

  const { data } = await supabase
    .from('clients')
    .select('name, email, notification_email, brand_color, system_prompt')
    .eq('agent_id', clientId)
    .eq('provisioned_via', 'chatacus-v1')
    .maybeSingle();

  if (data && data.system_prompt) {
    return {
      name: data.name,
      openingMessage: 'Hello! How can I help you today?',
      systemPrompt: data.system_prompt,
      agentEmail: data.notification_email ?? data.email ?? '',
      notificationEmail: data.notification_email ?? data.email ?? '',
      brandColour: data.brand_color ?? '#1a365d',
    };
  }

  return clients.demo;
}
