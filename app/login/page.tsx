'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default function LoginPage() {
  const [email, setEmail]     = useState('');
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'auth') {
      setError('For security reasons, please open this link in the same browser you requested it from, then try again.');
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: "'Space Grotesk', -apple-system, sans-serif",
      WebkitFontSmoothing: 'antialiased',
    }}>

      {/* Logo / wordmark */}
      <div style={{ marginBottom: '40px', textAlign: 'center' }}>
        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: '32px',
          fontWeight: 700,
          letterSpacing: '-0.025em',
          color: '#ffffff',
          lineHeight: 1,
        }}>
          Vaughan
        </div>
        <div style={{
          marginTop: '8px',
          fontSize: '11px',
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}>
          Client Portal
        </div>
      </div>

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: '380px',
        background: '#111111',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        padding: '32px 28px',
      }}>
        {!sent ? (
          <>
            <h1 style={{
              margin: '0 0 6px',
              fontSize: '20px',
              fontWeight: 700,
              color: '#ffffff',
            }}>
              Sign in
            </h1>
            <p style={{
              margin: '0 0 24px',
              fontSize: '14px',
              color: 'rgba(255,255,255,0.4)',
              lineHeight: 1.5,
            }}>
              Enter your email and we&apos;ll send you a magic link.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <input
                type="email"
                placeholder="you@agency.co.uk"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '10px',
                  padding: '13px 16px',
                  color: '#ffffff',
                  fontSize: '15px',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />

              {error && (
                <p style={{ margin: 0, fontSize: '13px', color: '#f87171' }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                style={{
                  background: loading || !email ? 'rgba(179,255,0,0.25)' : '#b3ff00',
                  color: '#0a0a0a',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '14px',
                  fontSize: '15px',
                  fontWeight: 700,
                  cursor: loading || !email ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s ease',
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {loading ? 'Sending…' : 'Send magic link'}
              </button>
            </form>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '16px' }}>✉</div>
            <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700, color: '#ffffff' }}>
              Check your inbox
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
              We sent a magic link to <strong style={{ color: '#ffffff' }}>{email}</strong>. Click it to sign in.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '10px',
                padding: '10px 20px',
                color: 'rgba(255,255,255,0.4)',
                fontSize: '13px',
                cursor: 'pointer',
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              Use a different email
            </button>
          </div>
        )}
      </div>

      <p style={{
        marginTop: '32px',
        fontSize: '12px',
        color: 'rgba(255,255,255,0.18)',
      }}>
        © {new Date().getFullYear()} Vaughan
      </p>
    </div>
  );
}
