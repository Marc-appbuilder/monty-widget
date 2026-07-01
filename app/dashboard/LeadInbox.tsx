'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type Status = 'new' | 'contacted' | 'qualified' | 'dead';
type Filter = 'all' | Status;

interface Lead {
  id: string;
  created_at: string;
  agent_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  enquiry_type: string | null;
  notes: string | null;
  status: Status;
  raw_conversation: string | null;
}

const STATUS: Record<Status, { bg: string; text: string; label: string }> = {
  new:       { bg: '#1e3a5f', text: '#60a5fa', label: 'New' },
  contacted: { bg: '#3d2e0a', text: '#fbbf24', label: 'Contacted' },
  qualified: { bg: '#0a2e1a', text: '#34d399', label: 'Qualified' },
  dead:      { bg: '#1f1f1f', text: '#6b7280', label: 'Dead' },
};

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All',       value: 'all' },
  { label: 'New',       value: 'new' },
  { label: 'Contacted', value: 'contacted' },
  { label: 'Qualified', value: 'qualified' },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function LeadInbox() {
  const [leads, setLeads]       = useState<Lead[]>([]);
  const [filter, setFilter]     = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [agentId, setAgentId]   = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);

  const ADMIN_EMAILS = ['marcwrichards@gmail.com', 'marcwrichards@me.com'];

  const fetchLeads = useCallback(async (aid?: string) => {
    const url = aid ? `/api/leads?agentId=${encodeURIComponent(aid)}` : '/api/leads';
    const res = await fetch(url);
    if (res.ok) setLeads(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user?.email) return;

      // Admin emails see all leads
      if (ADMIN_EMAILS.includes(user.email.toLowerCase())) {
        fetchLeads();
        const channel = supabase
          .channel('leads-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchLeads())
          .subscribe();
        return () => { supabase.removeChannel(channel); };
      }

      // Everyone else: find matching client by email
      const res = await fetch('/api/clients');
      if (!res.ok) return;
      const clients: { agent_id: string; email: string | null }[] = await res.json();
      const match = clients.find(c => c.email?.toLowerCase() === user.email!.toLowerCase());

      if (!match) {
        setNoAccount(true);
        setLoading(false);
        return;
      }

      setAgentId(match.agent_id);
      fetchLeads(match.agent_id);

      const channel = supabase
        .channel('leads-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchLeads(match.agent_id))
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    });
  }, [fetchLeads]);

  async function updateStatus(id: string, status: Status) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    await fetch(`/api/leads/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status }),
    });
  }

  async function deleteLead(id: string) {
    if (!window.confirm('Delete this lead? This cannot be undone.')) return;
    setLeads(prev => prev.filter(l => l.id !== id));
    await fetch(`/api/leads/${id}`, { method: 'DELETE' });
  }

  const filtered = filter === 'all' ? leads : leads.filter(l => l.status === filter);
  const newCount = leads.filter(l => l.status === 'new').length;

  if (noAccount) return (
    <div style={{
      minHeight: '100dvh', background: '#0a0a0a', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '32px', textAlign: 'center',
      fontFamily: "'Space Grotesk', -apple-system, sans-serif",
    }}>
      <div style={{ fontSize: '32px', marginBottom: '16px' }}>🔒</div>
      <h2 style={{ color: '#e8eaf0', fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>No account found</h2>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', lineHeight: 1.6, maxWidth: '300px', margin: '0 0 24px' }}>
        Your email isn't linked to an estate agent account. Please contact support to get set up.
      </p>
      <button
        onClick={async () => {
          const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
          await sb.auth.signOut();
          window.location.href = '/login';
        }}
        style={{
          background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '8px', padding: '8px 16px', color: 'rgba(255,255,255,0.4)',
          fontSize: '13px', cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </div>
  );

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#0a0a0a',
      color: '#e8eaf0',
      fontFamily: "'Space Grotesk', -apple-system, sans-serif",
      WebkitFontSmoothing: 'antialiased',
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '20px 16px 0',
        background: '#0a0a0a',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        {/* Row 1: title + sign out */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 700, fontSize: '20px' }}>Lead Inbox</span>
            {newCount > 0 && (
              <span style={{
                background: '#b3ff00', color: '#0a0a0a',
                fontSize: '11px', fontWeight: 700,
                borderRadius: '99px', padding: '2px 8px',
              }}>
                {newCount} new
              </span>
            )}
          </div>
          <button
            onClick={async () => {
              const supabase = createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              );
              await supabase.auth.signOut();
              window.location.href = '/login';
            }}
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px', padding: '5px 12px', color: 'rgba(255,255,255,0.35)',
              fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Sign out
          </button>
        </div>
        {/* Row 2: admin link (subtle) */}
        <div style={{ marginBottom: '12px' }}>
          <a href="/admin" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', textDecoration: 'none' }}>Admin ↗</a>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '2px' }}>
          {FILTERS.map(f => {
            const count = f.value === 'all' ? leads.length : leads.filter(l => l.status === f.value).length;
            const active = filter === f.value;
            return (
              <button key={f.value} onClick={() => setFilter(f.value)} style={{
                flex: 1,
                padding: '8px 4px',
                border: 'none',
                borderBottom: active ? '2px solid #b3ff00' : '2px solid transparent',
                background: 'transparent',
                color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
              }}>
                {f.label}
                <span style={{ fontSize: '10px', opacity: 0.6 }}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Lead list ── */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {loading && (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', marginTop: '60px', fontSize: '14px' }}>
            Loading leads…
          </p>
        )}
        {!loading && filtered.length === 0 && (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', marginTop: '60px', fontSize: '14px' }}>
            No leads here yet.
          </p>
        )}

        {filtered.map(lead => {
          const isOpen = expanded === lead.id;
          const sc = STATUS[lead.status];

          return (
            <div key={lead.id} style={{
              background: '#111111',
              borderRadius: '14px',
              overflow: 'hidden',
              boxShadow: '0 2px 16px rgba(0,0,0,0.35)',
              border: isOpen ? '1px solid rgba(179,255,0,0.2)' : '1px solid rgba(255,255,255,0.06)',
              transition: 'border-color 0.15s ease',
            }}>

              {/* Card summary row */}
              <div
                onClick={() => setExpanded(isOpen ? null : lead.id)}
                style={{ padding: '14px 16px', cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '15px' }}>{lead.name}</span>
                      <span style={{
                        background: sc.bg, color: sc.text,
                        fontSize: '10px', fontWeight: 700,
                        borderRadius: '99px', padding: '2px 8px',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        {lead.status}
                      </span>
                      {lead.enquiry_type && (
                        <span style={{
                          background: 'rgba(255,255,255,0.06)',
                          color: 'rgba(255,255,255,0.45)',
                          fontSize: '10px', borderRadius: '99px',
                          padding: '2px 8px', textTransform: 'capitalize',
                        }}>
                          {lead.enquiry_type}
                        </span>
                      )}
                    </div>
                    <div style={{
                      marginTop: '5px', fontSize: '12px',
                      color: 'rgba(255,255,255,0.4)',
                      display: 'flex', gap: '10px', flexWrap: 'wrap',
                    }}>
                      {lead.phone && <span>{lead.phone}</span>}
                      {lead.email && (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                          {lead.email}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{timeAgo(lead.created_at)}</div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginTop: '2px' }}>{lead.agent_id}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', marginTop: '6px' }}>{isOpen ? '▲' : '▼'}</div>
                  </div>
                </div>
              </div>

              {/* Expanded panel */}
              {isOpen && (
                <div style={{
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}>
                  {/* Timestamp */}
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
                    Received {formatDate(lead.created_at)}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {lead.phone && (
                      <>
                        <a href={`tel:${lead.phone}`} style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          gap: '6px', padding: '11px 8px', borderRadius: '10px',
                          background: '#1e3a5f', color: '#60a5fa',
                          textDecoration: 'none', fontSize: '13px', fontWeight: 600,
                        }}>
                          📞 Call
                        </a>
                        <a
                          href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                          target="_blank" rel="noreferrer"
                          style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: '6px', padding: '11px 8px', borderRadius: '10px',
                            background: '#0a2e1a', color: '#34d399',
                            textDecoration: 'none', fontSize: '13px', fontWeight: 600,
                          }}
                        >
                          💬 WhatsApp
                        </a>
                      </>
                    )}
                    {lead.email && (
                      <a href={`mailto:${lead.email}`} style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '6px', padding: '11px 8px', borderRadius: '10px',
                        background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.65)',
                        textDecoration: 'none', fontSize: '13px', fontWeight: 600,
                      }}>
                        ✉️ Email
                      </a>
                    )}
                  </div>

                  {/* Status buttons */}
                  <div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      Status
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {(Object.keys(STATUS) as Status[]).map(s => {
                        const active = lead.status === s;
                        return (
                          <button key={s} onClick={() => updateStatus(lead.id, s)} style={{
                            padding: '6px 14px', borderRadius: '8px', cursor: 'pointer',
                            fontSize: '12px', fontWeight: 600, textTransform: 'capitalize',
                            border: `1px solid ${active ? STATUS[s].text : 'rgba(255,255,255,0.1)'}`,
                            background: active ? STATUS[s].bg : 'transparent',
                            color: active ? STATUS[s].text : 'rgba(255,255,255,0.35)',
                            transition: 'all 0.15s ease',
                          }}>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Delete */}
                  <div style={{ paddingTop: '4px' }}>
                    <button onClick={() => deleteLead(lead.id)} style={{
                      background: 'transparent', border: '1px solid rgba(255,80,80,0.25)',
                      borderRadius: '8px', padding: '6px 14px', cursor: 'pointer',
                      fontSize: '12px', color: 'rgba(255,100,100,0.6)',
                      transition: 'all 0.15s ease',
                    }}>
                      Delete lead
                    </button>
                  </div>

                  {/* Notes */}
                  {lead.notes && (
                    <div style={{ background: '#0a0a0a', borderRadius: '10px', padding: '12px 14px' }}>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '6px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Summary
                      </div>
                      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                        {lead.notes}
                      </div>
                    </div>
                  )}

                  {/* Raw conversation */}
                  {lead.raw_conversation && (
                    <div style={{ background: '#0a0a0a', borderRadius: '10px', padding: '12px 14px' }}>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Conversation
                      </div>
                      <div style={{
                        fontSize: '12px', color: 'rgba(255,255,255,0.45)',
                        lineHeight: 1.8, whiteSpace: 'pre-wrap',
                        maxHeight: '220px', overflowY: 'auto',
                      }}>
                        {lead.raw_conversation}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
