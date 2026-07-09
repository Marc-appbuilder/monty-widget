'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '10px',
  padding: '13px 16px',
  color: '#ffffff',
  fontSize: '15px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  background: disabled ? 'rgba(170,255,0,0.35)' : '#AAFF00',
  color: '#0a0a0a',
  border: 'none',
  borderRadius: '10px',
  padding: '14px',
  fontSize: '15px',
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'opacity 0.15s',
  fontFamily: 'inherit',
  letterSpacing: '-0.01em',
  width: '100%',
});

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]   = useState('');
  const [code, setCode]     = useState('');
  const [step, setStep]     = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithOtp({ email });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setStep('code');
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'magiclink',
    });

    setLoading(false);
    if (error) {
      setError('Invalid or expired code — please try again.');
    } else {
      router.push('/dashboard');
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
      fontFamily: '"Space Grotesk", system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Sora:wght@400&display=swap" rel="stylesheet"/>

      <div style={{ marginBottom: '48px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0,
          fontSize: '36px',
          fontWeight: 700,
          letterSpacing: '-0.025em',
          color: '#ffffff',
          lineHeight: 1,
        }}>
          <svg viewBox="0 0 88 76" fill="none" style={{ height: '0.72em', width: 'auto', display: 'block', marginRight: '-0.04em', flexShrink: 0 }}>
            <line x1="44" y1="72" x2="10" y2="8" stroke="#AAFF00" strokeWidth="16" strokeLinecap="round"/>
            <line x1="44" y1="72" x2="78" y2="8" stroke="#AAFF00" strokeWidth="16" strokeLinecap="round"/>
          </svg>
          <span style={{ fontFamily: '"Sora", sans-serif', fontWeight: 400 }}>aughan</span>
        </div>
        <div style={{
          marginTop: '8px',
          fontSize: '11px',
          color: 'rgba(255,255,255,0.28)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}>
          Client Portal
        </div>
      </div>

      <div style={{
        width: '100%',
        maxWidth: '380px',
        background: '#111',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        padding: '32px 28px',
      }}>
        {step === 'email' ? (
          <>
            <h1 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
              Sign in
            </h1>
            <p style={{ margin: '0 0 24px', fontSize: '14px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
              Enter your email and we&apos;ll send you a 6-digit code.
            </p>

            <form onSubmit={sendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="email"
                placeholder="you@agency.co.uk"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                style={inputStyle}
              />
              {error && <p style={{ margin: 0, fontSize: '13px', color: '#f87171' }}>{error}</p>}
              <button type="submit" disabled={loading || !email} style={btnStyle(loading || !email)}>
                {loading ? 'Sending…' : 'Send code'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
              Enter your code
            </h1>
            <p style={{ margin: '0 0 24px', fontSize: '14px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
              We sent a 6-digit code to <strong style={{ color: '#ffffff' }}>{email}</strong>. Check your inbox.
            </p>

            <form onSubmit={verifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="123456"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoFocus
                style={{ ...inputStyle, fontSize: '24px', letterSpacing: '0.2em', textAlign: 'center' }}
              />
              {error && <p style={{ margin: 0, fontSize: '13px', color: '#f87171' }}>{error}</p>}
              <button type="submit" disabled={loading || code.length < 6} style={btnStyle(loading || code.length < 6)}>
                {loading ? 'Verifying…' : 'Sign in'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('email'); setCode(''); setError(''); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  padding: '4px',
                }}
              >
                ← Use a different email
              </button>
            </form>
          </>
        )}
      </div>

      <p style={{ marginTop: '32px', fontSize: '12px', color: 'rgba(255,255,255,0.18)' }}>
        © 2026 VaughanAI
      </p>
    </div>
  );
}
