'use client';

/**
 * "Ask btg." — the floating chat. It sends the question, the recent turns
 * and what the page is showing to the app's own chat route, which reads the
 * figures from the sheets and holds the API key.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChatAnswer } from '@/components/chat-answer';
import { useView } from '@/lib/use-model';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  thinking?: boolean;
  /** An error shown in place of an answer. It is not sent back as part of the conversation. */
  failed?: boolean;
}

/** How many recent turns go with each question. */
const HISTORY_TURNS = 10;

export function Chat() {
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', content: 'Hello — ask me anything about the numbers on this dashboard. For example: "Are we on pace for the FY27 target, and which quarter is exposed?"' },
  ]);
  const { fy, period } = useView();
  const pathname = usePathname();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setWide(false);
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const send = async () => {
    const q = input.trim();
    if (!q) return;
    setInput('');
    const history = msgs.filter((x) => !x.thinking && !x.failed).map(({ role, content }) => ({ role, content }));
    const next = [...history, { role: 'user' as const, content: q }];
    setMsgs([...msgs, { role: 'user', content: q }, { role: 'assistant', content: 'Reading the numbers…', thinking: true }]);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(-HISTORY_TURNS), view: { fy, period, page: pathname.replace('/', '') } }),
      });
      const j = (await res.json()) as { text?: string; error?: string };
      setMsgs((cur) => [...cur.filter((x) => !x.thinking), { role: 'assistant', content: j.error ?? j.text ?? '', failed: Boolean(j.error) }]);
    } catch {
      setMsgs((cur) => [...cur.filter((x) => !x.thinking), { role: 'assistant', content: 'Could not reach the assistant. Check your connection and try again.', failed: true }]);
    }
  };

  return (
    <>
      <button type="button" className="chat-fab" style={{ display: open ? 'none' : undefined }} onClick={() => setOpen(true)}>
        <span className="dot" /> Ask btg.
      </button>
      {open && wide ? <div className="chat-back" onClick={() => setWide(false)} /> : null}
      <div className={`chat ${open ? 'on' : ''} ${wide ? 'wide' : ''}`}>
        <div className="chat-hd">
          <span className="dot" />
          <div>
            <b>Ask btg.</b>
            <small>Answers from this dashboard&apos;s data · powered by Claude</small>
          </div>
          <button type="button" className="chat-x" onClick={() => setWide((w) => !w)} title={wide ? 'Shrink' : 'Expand'}>
            {wide ? '⤡' : '⤢'}
          </button>
          <button
            type="button"
            className="chat-x"
            onClick={() => {
              setWide(false);
              setOpen(false);
            }}
            title="Close"
          >
            ✕
          </button>
        </div>
        <div className="chat-msgs">
          {msgs.map((x, i) => (
            <div key={i} className={`msg ${x.role === 'user' ? 'me' : 'ai'} ${x.thinking ? 'think' : ''}`}>
              {x.role === 'assistant' && !x.thinking ? <ChatAnswer text={x.content} /> : x.content}
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="chat-in">
          <input
            ref={inputRef}
            value={input}
            placeholder="Ask about pace, margins, clients, pipeline…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send();
            }}
          />
          <button type="button" onClick={() => void send()}>
            →
          </button>
        </div>
      </div>
    </>
  );
}
