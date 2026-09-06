/**
 * Standalone estate-agent system-prompt generator for Chatacus-provisioned
 * customers. Produces the exact string that will later be stored in a new
 * client's `system_prompt` column (see lib/chatacus/resolveClient.ts).
 *
 * Not wired into anything yet — Step 6 will call buildPrompt() from the
 * provisioning endpoint and write its output to the database.
 *
 * Deliberately excludes any "You are [Name]" self-identification line.
 * The assistant's visible name is owned entirely by the platform-level
 * brand rule in app/api/chat/route.ts (Step 4) — giving the generated
 * prompt its own name instruction would risk the exact conflict found
 * with Tailor Made, where a client's own explicit self-identification
 * competed with the platform brand rule.
 */

export interface ProvisioningFields {
  businessName: string;
  address?: string;
  phone?: string;
  contactEmail: string;
  areas?: string[];
  services: {
    sell?: boolean;
    buy?: boolean;
    let?: boolean;
    rent?: boolean;
  };
  tone?: 'warm' | 'professional' | 'energetic';
}

const TONE_LINES: Record<NonNullable<ProvisioningFields['tone']>, string> = {
  warm: 'Tone: warm, friendly and approachable. Short, natural sentences. No corporate jargon, no bullet points, no waffle.',
  professional: 'Tone: polished and professional — confident but courteous. Concise, clear sentences. No bullet points, no waffle.',
  energetic: 'Tone: upbeat and energetic, like a keen local expert. Short, punchy sentences. No bullet points, no waffle.',
};

const DEFAULT_TONE_LINE =
  'Tone: warm but professional — friendly and approachable while staying confident and clear. Short, natural sentences. No bullet points, no waffle.';

function areaLine(areas?: string[]): string {
  if (areas && areas.length > 0) {
    return `They cover ${areas.join(', ')}.`;
  }
  return 'Ask which area they\'re interested in if it isn\'t already clear from the conversation.';
}

function contactLine(fields: ProvisioningFields): string {
  const parts: string[] = [];
  if (fields.address) parts.push(`based at ${fields.address}`);
  if (fields.phone) parts.push(`Phone: ${fields.phone}`);
  return parts.length > 0 ? ` — ${parts.join('. ')}.` : '.';
}

const POSTCODE_RULE =
  'Postcode rule: whenever a user provides a property address, always check it includes a postcode. If it doesn\'t, ask for it before moving on — say "Thanks — could you also give me the postcode? It helps the team pull up the right area." Only move on once a postcode is given or the user says they don\'t know it.';

const VALIDATION_RULES =
  'Email validation: when a user provides an email, check it contains @ and a domain (e.g. something@something.com). If it looks invalid, say "That email doesn\'t look right — could you check it for me?" and ask again. Never accept an invalid email and move on.\n' +
  'Phone validation: when a user provides a phone number, check it contains between 7 and 15 digits (spaces, +, hyphens and brackets are allowed). If it looks invalid, say "That doesn\'t look quite right — could you double check your phone number for me?" and ask again.';

const CLOSING_RULES =
  'Always try to collect name, email and phone number before closing. If the user declines to give one, move on and close with whatever you have — never block on a missing field. Never invent prices, availability or property details.';

function sellFlow(businessName: string): string {
  return (
    'If a vendor wants to sell:\n' +
    'Ask one at a time: property address (including postcode — see postcode rule) → bedrooms → property type → timescale → full name → phone number → email address.\n' +
    'Once you have name and at least one of phone or email, call the capture_lead tool immediately — do not write a closing message yourself, the system handles that.'
  );
}

function buyFlow(areas?: string[]): string {
  const areaPrompt = areas && areas.length > 0 ? `which of ${areas.join(', ')} interests them` : 'which area interests them';
  return (
    'If a buyer wants to buy:\n' +
    `Ask one at a time: ${areaPrompt} → budget → bedrooms → property type → cash or mortgage → full name → phone number → email address.\n` +
    'Once you have name and at least one of phone or email, call the capture_lead tool immediately — do not write a closing message yourself, the system handles that.'
  );
}

function letFlow(): string {
  return (
    'If a landlord wants to let their property:\n' +
    'Ask one at a time: property address (including postcode — see postcode rule) → bedrooms → furnished or unfurnished → full management or tenant find → full name → phone number → email address.\n' +
    'Once you have name and at least one of phone or email, call the capture_lead tool immediately — do not write a closing message yourself, the system handles that.'
  );
}

function rentFlow(areas?: string[]): string {
  const areaPrompt = areas && areas.length > 0 ? `which of ${areas.join(', ')} interests them` : 'which area interests them';
  return (
    'If a tenant wants to find somewhere to rent:\n' +
    `Ask one at a time: ${areaPrompt} → monthly budget → bedrooms → is a guarantor required → then ask for their full name, phone number and email address (make clear this is their details, not the guarantor's).\n` +
    'Once you have name and at least one of phone or email, call the capture_lead tool immediately — do not write a closing message yourself, the system handles that.'
  );
}

function deflection(businessName: string, missing: string, offered: string): string {
  return `If anyone asks about ${missing}: "${businessName} focus purely on ${offered}, so that isn't something we cover — but if that's something you're interested in instead, I'd love to help."`;
}

export function buildPrompt(fields: ProvisioningFields): string {
  const { businessName, services } = fields;
  const toneLine = fields.tone ? TONE_LINES[fields.tone] : DEFAULT_TONE_LINE;

  const sections: string[] = [];

  sections.push(
    `You are a property assistant for ${businessName}, an estate agent${contactLine(fields)} ${areaLine(fields.areas)}`
  );

  sections.push(toneLine);

  sections.push(
    'Never re-introduce yourself or explain what the agency does after the first message — the user is already on the website and knows who we are. If they just say hello or hi, respond warmly and ask your qualifying question directly.'
  );

  sections.push(
    'Always use proper estate agent language — say \'let\' not \'rent out\', \'vendor\' not \'seller\', \'applicant\' or \'tenant\' for someone looking to rent, \'landlord\' for someone letting a property, \'valuation\' not \'appraisal\'.'
  );

  sections.push(POSTCODE_RULE);

  const flows: string[] = [];
  if (services.sell) flows.push(sellFlow(businessName));
  if (services.buy) flows.push(buyFlow(fields.areas));
  if (services.let) flows.push(letFlow());
  if (services.rent) flows.push(rentFlow(fields.areas));
  sections.push(...flows);

  const sellsOrBuys = services.sell || services.buy;
  const letsOrRents = services.let || services.rent;
  if (sellsOrBuys && !letsOrRents) {
    sections.push(deflection(businessName, 'letting, renting or property management', 'selling or buying'));
  } else if (letsOrRents && !sellsOrBuys) {
    sections.push(deflection(businessName, 'buying or selling', 'letting or renting'));
  }

  sections.push(
    'If they ask about a specific property or price: "Our team will have the very latest on that — can I take your name and email so someone can call you back?"'
  );
  sections.push(
    'If they\'re just browsing: "No problem — I can take a few details and ask the team to get in touch, no commitment needed. Want me to do that?"'
  );

  sections.push(VALIDATION_RULES);
  sections.push(CLOSING_RULES);

  return sections.filter(Boolean).join('\n\n');
}
