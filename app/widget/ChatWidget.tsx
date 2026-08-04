'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { ClientConfig } from '@/lib/clients';
import type { ChatMessage } from '@/app/api/chat/route';

interface Props {
  clientId: string;
  config: ClientConfig;
}

interface Message extends ChatMessage {
  id: string;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

/* Render text with [label](url) markdown links as real <a> tags */
function renderWithLinks(text: string) {
  const linkColour = '#7eb8f7'; // fixed light-blue — readable on dark backgrounds regardless of brand colour
  const parts = text.split(/(\[([^\]]+)\]\((https?:\/\/[^)]+)\))/g);
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < parts.length) {
    const full = parts[i];
    // Every 4th chunk starting at 0 is plain text; chunks at i%4===1 are full match
    if (i % 4 === 0) {
      if (full) nodes.push(full);
    } else if (i % 4 === 1) {
      const label = parts[i + 1];
      const href  = parts[i + 2];
      nodes.push(
        <a key={i} href={href} target="_blank" rel="noopener noreferrer"
          style={{ color: linkColour, textDecoration: 'underline', wordBreak: 'break-word' }}>
          {label}
        </a>
      );
      i += 2; // skip label and href captures
    }
    i++;
  }
  return nodes;
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function lighten(hex: string, amount = 40): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function TypingDots({ colour }: { colour: string }) {
  return (
    <span className="inline-flex gap-1.5 items-center h-5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            display: 'block',
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: colour,
            opacity: 0.8,
            animation: `vaughan-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

export default function ChatWidget({ clientId, config }: Props) {
  const brand = config.brandColour;
  const rgb = hexToRgb(brand);
  const brandLight = lighten(brand, 40);

  const [messages, setMessages] = useState<Message[]>([
    { id: uid(), role: 'assistant', content: config.openingMessage },
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [quickRepliesUsed, setQuickRepliesUsed] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function sendMessage(text: string) {
    if (streaming) return;

    const userMsg: Message = { id: uid(), role: 'user', content: text };
    const assistantId = uid();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '' };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);
    setStreamingId(assistantId);

    try {
      const history: ChatMessage[] = [...messagesRef.current, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, messages: history }),
      });

      if (res.status === 429) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "Sorry, we're experiencing high demand right now. Please try again in a few minutes." }
              : m
          )
        );
        return;
      }

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;

          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + parsed.text } : m
                )
              );
            }
          } catch (parseErr) {
            console.warn('[chat] parse error:', parseErr);
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: 'Sorry, something went wrong. Please try again.' }
            : m
        )
      );
    } finally {
      setStreaming(false);
      setStreamingId(null);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await sendMessage(text);
  }

  async function handleQuickReply(text: string) {
    setQuickRepliesUsed(true);
    await sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const canSend = input.trim() && !streaming;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh',  /* dvh shrinks when the mobile keyboard opens */
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '15px',
      background: config.headerImageUrl ? '#09141c' : '#0d0f14', /* revert: '#0d0f14' for all */
      WebkitFontSmoothing: 'antialiased',
    }}>

      {/* ── Injected keyframes ── */}
      <style>{`
        @keyframes vaughan-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes vaughan-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes vaughan-glow-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(${rgb}, 0), 0 4px 20px rgba(${rgb}, 0.5); }
          50%       { box-shadow: 0 0 0 10px rgba(${rgb}, 0), 0 4px 32px rgba(${rgb}, 0.8); }
        }
        @keyframes vaughan-online-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.8); }
        }
        @keyframes vaughan-header-shimmer {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .vaughan-msg { animation: vaughan-fade-up 0.25s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .vaughan-send-active { animation: vaughan-glow-pulse 1.8s ease-in-out infinite; }
        .vaughan-online { animation: vaughan-online-pulse 2s ease-in-out infinite; }
        .vaughan-input {
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
          border: 1.5px solid rgba(255,255,255,0.08);
        }
        .vaughan-input:focus {
          outline: none;
          border-color: rgba(${rgb}, 0.5);
          box-shadow: 0 0 0 3px rgba(${rgb}, 0.15), 0 0 20px rgba(${rgb}, 0.1);
        }
        .vaughan-send { transition: transform 0.15s ease, box-shadow 0.2s ease; }
        .vaughan-send:not(:disabled):hover { transform: scale(1.1); }
        .vaughan-send:not(:disabled):active { transform: scale(0.93); }

        /* Quick-reply chips */
        .vaughan-chip {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.11);
          color: rgba(255,255,255,0.62);
          border-radius: 20px;
          padding: 7px 15px;
          font-size: 12.5px;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease, color 0.15s ease;
          white-space: nowrap;
          letter-spacing: 0.02em;
          line-height: 1;
        }
        .vaughan-chip:hover {
          background: rgba(255,255,255,0.10);
          border-color: rgba(${rgb}, 0.55);
          transform: translateY(-1px);
          color: rgba(255,255,255,0.9);
        }
        .vaughan-chip:active {
          transform: translateY(0);
          background: rgba(255,255,255,0.13);
        }
        .vaughan-chip:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>

      {/* ── Header ── */}
      {config.headerImageUrl ? (
        /* Banner header — full-width brand image, close button overlaid */
        <header style={{ position: 'relative', flexShrink: 0, lineHeight: 0 }}>
          <img
            src={config.headerImageUrl}
            alt={config.name}
            style={{ width: '100%', display: 'block' }}
          />
          <button
            onClick={() => window.parent.postMessage('vaughan:close', '*')}
            aria-label="Close chat"
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(0,0,0,0.35)',
              color: 'rgba(255,255,255,0.85)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>
      ) : (
        /* Standard header — avatar + name + subtitle. Remove headerImageUrl from config to revert TM to this. */
        <header style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px 18px',
          flexShrink: 0,
          background: `linear-gradient(135deg, #0a0c10 0%, #111520 40%, rgba(${rgb}, 0.25) 100%)`,
          borderBottom: `1px solid rgba(${rgb}, 0.2)`,
          boxShadow: `0 1px 0 rgba(${rgb}, 0.15), 0 8px 32px rgba(0,0,0,0.5)`,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Glow accent line at top */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            background: `linear-gradient(90deg, transparent, ${brand}, ${brandLight}, transparent)`,
            opacity: 0.9,
          }} />

          {/* Avatar */}
          {config.logoUrl ? (
            <img
              src={config.logoUrl}
              alt={config.name}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0,
                boxShadow: `0 0 0 2px rgba(${rgb}, 0.3), 0 0 20px rgba(${rgb}, 0.4)`,
              }}
            />
          ) : (
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              background: '#0a0a0a',
              boxShadow: `0 0 0 2px rgba(${rgb}, 0.3), 0 0 20px rgba(${rgb}, 0.2)`,
            }}>
              <svg viewBox="0 0 88 76" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="19">
                <line x1="44" y1="72" x2="10" y2="8" stroke="#AAFF00" strokeWidth="16" strokeLinecap="round"/>
                <line x1="44" y1="72" x2="78" y2="8" stroke="#AAFF00" strokeWidth="16" strokeLinecap="round"/>
              </svg>
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              margin: 0,
              fontWeight: 700,
              fontSize: '14px',
              color: '#ffffff',
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {config.name}
            </p>
            {(config.agentTitle ?? 'Virtual Assistant') && (
              <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.3 }}>{config.agentTitle ?? 'Virtual Assistant'}</p>
            )}
          </div>

          {/* Online indicator */}
          {config.showOnlineIndicator !== false && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span className="vaughan-online" style={{
                display: 'block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#4ade80',
                boxShadow: '0 0 10px 4px rgba(74,222,128,0.6)',
              }} />
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Online</span>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={() => window.parent.postMessage('vaughan:close', '*')}
            aria-label="Close chat"
            style={{
              flexShrink: 0,
              marginLeft: '4px',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>
      )}

      {/* ── Messages ── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        background: config.headerImageUrl
          ? 'linear-gradient(180deg, #0c1f2a 0%, #09141c 100%)' /* revert: '#0c1f2a 0%, #0d0f14 40%' */
          : 'linear-gradient(180deg, #0d0f14 0%, #0f1219 100%)',
      }}>
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          const isStreamingThis = msg.id === streamingId;
          const showChips = index === 0 && !isUser && !quickRepliesUsed && !!config.quickReplies?.length;

          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                className="vaughan-msg"
                style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                  alignItems: 'flex-end',
                  gap: '8px',
                }}
              >
                {/* Bubble */}
                <div style={{
                  maxWidth: '76%',
                  padding: '11px 15px',
                  borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  fontSize: '14px',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  ...(isUser ? {
                    background: `linear-gradient(135deg, ${brand} 0%, ${brandLight} 100%)`,
                    color: '#ffffff',
                    boxShadow: `0 4px 24px rgba(${rgb}, 0.5), 0 0 0 1px rgba(${rgb}, 0.3)`,
                  } : {
                    background: config.headerImageUrl ? '#0e2232' : '#1a1d26',
                    color: '#e8eaf0',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
                  }),
                }}>
                  {isStreamingThis && !msg.content
                    ? <TypingDots colour={brand} />
                    : renderWithLinks(msg.content)
                  }
                </div>
              </div>

              {/* Quick-reply chips — only beneath the opening message, gone once used */}
              {showChips && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingLeft: '2px' }}>
                  {config.quickReplies!.map((reply) => (
                    <button
                      key={reply}
                      className="vaughan-chip"
                      disabled={streaming}
                      onClick={() => handleQuickReply(reply)}
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <div style={{
        flexShrink: 0,
        padding: '12px 14px',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        display: 'flex',
        alignItems: 'flex-end',
        gap: '10px',
        background: config.headerImageUrl ? '#071019' : '#12151c', /* revert: '#12151c' for all */
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <textarea
          ref={inputRef}
          className="vaughan-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          disabled={streaming}
          style={{
            flex: 1,
            resize: 'none',
            borderRadius: '14px',
            padding: '13px 16px',
            fontSize: '16px',   /* 16px prevents iOS auto-zoom on focus */
            lineHeight: 1.5,
            minHeight: '50px',
            maxHeight: '120px',
            overflowY: 'auto',
            background: config.headerImageUrl ? '#0e2232' : '#1a1d26', /* revert: '#1a1d26' for all */
            color: '#e8eaf0',
            fontFamily: 'inherit',
            opacity: streaming ? 0.5 : 1,
            fieldSizing: 'content',
            WebkitAppearance: 'none',
          } as React.CSSProperties}
        />

        <button
          onClick={handleSend}
          disabled={!canSend}
          className={`vaughan-send ${canSend ? 'vaughan-send-active' : ''}`}
          style={{
            flexShrink: 0,
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            border: 'none',
            cursor: canSend ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: canSend
              ? `linear-gradient(135deg, ${brand} 0%, ${brandLight} 100%)`
              : 'rgba(255,255,255,0.08)',
            color: canSend ? '#ffffff' : 'rgba(255,255,255,0.2)',
            transition: 'background 0.2s ease',
          }}
          aria-label="Send"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="17" height="17">
            <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
          </svg>
        </button>
      </div>

      {/* ── Footer ── */}
      <div style={{
        textAlign: 'center',
        padding: '5px 12px 7px',
        flexShrink: 0,
        background: config.headerImageUrl ? '#071019' : '#12151c', /* revert: '#12151c' for all */
        borderTop: '1px solid rgba(255,255,255,0.04)',
      }}>
        <p style={{ margin: '0 0 3px', fontSize: '9px', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.01em', lineHeight: 1.4 }}>
          By continuing you agree to your details being shared with {config.name} in accordance with their privacy policy.
        </p>
        <p style={{ margin: 0, fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.01em' }}>
          Powered by{' '}
          <span style={{ fontWeight: 700 }}>
            <span style={{ color: '#AAFF00' }}>V</span><span style={{ color: 'rgba(255,255,255,0.85)' }}>aughan</span>
          </span>
        </p>
      </div>
    </div>
  );
}
