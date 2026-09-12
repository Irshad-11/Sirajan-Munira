import React, { useEffect, useState } from 'react';
import { Send, Inbox as InboxIcon, Trash2 } from 'lucide-react';
import { MessageRow, deleteMessage, listMessages, markMessageRead, submitMessage } from '../lib/supabase';
import { useAdmin, useTrackView } from '../lib/context';
import { SAFEENAH_URL } from '../components/Layout';

export function AboutPage() {
  useTrackView('site', 'about');
  return (
    <div className="page about-page">
      <h1>About</h1>

      <section className="landing-section" style={{ paddingTop: 0 }}>
        <h2>What this is</h2>
        <p>
          Sirājan Munīrā is a book-annotation and knowledge-archiving imprint of{' '}
          <a href={SAFEENAH_URL} target="_blank" rel="noopener noreferrer">Safeenah</a>. A single curator reads,
          annotates and archives structured findings from books, making every finding a deep-linkable, citable,
          collectible unit of knowledge — browsable by book, or gathered across books into curated collections.
        </p>
      </section>

      <section className="landing-section">
        <h2>Mission</h2>
        <p>
          To turn private reading notes into a public, permanent, and precisely citable archive — so a single
          sentence found on page 214 of an out-of-print book is as easy to find and share as a modern web page.
        </p>
      </section>

      <section className="landing-section">
        <h2>Vision</h2>
        <p>
          A small, well-kept library outlasts a large, unkept one. This project favours depth over volume: fewer
          books, read closely, annotated carefully, and organised so that a reader arriving years from now can still
          find the exact passage they were looking for.
        </p>
      </section>

      <section className="landing-section">
        <h2>Editorial standards</h2>
        <ul>
          <li>Every finding is attributed to its book, and to a page number where one is available.</li>
          <li>Findings are not edited to change their original meaning — only lightly formatted for reading.</li>
          <li>Source links point to where a book can be verified or obtained, not to pirated copies.</li>
          <li>There is one editor. Corrections and suggestions are welcome — see Contact.</li>
        </ul>
      </section>

      <section className="landing-section" style={{ borderBottom: 'none' }}>
        <h2>No accounts, ever</h2>
        <p>
          Readers browse anonymously. Bookmarks, theme, and font choices are stored only in your browser and never
          leave your device. There is no reader sign-up, and there will not be one.
        </p>
      </section>
    </div>
  );
}

export function ContactForm({ compact }: { compact?: boolean }) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [method, setMethod] = useState<'email' | 'whatsapp' | 'other'>('email');
  const [value, setValue] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim() || !value.trim()) return;
    setBusy(true);
    try {
      await submitMessage({ guest_name: name, message, contact_method: method, contact_value: value });
      setSent(true);
    } catch (err: any) {
      alert(err.message || 'Could not send message.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) return <p className="muted">Thank you — your message has been sent.</p>;

  return (
    <form className="contact-form" onSubmit={submit}>
      <label>Your name <input value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label>Message <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={compact ? 3 : 5} required /></label>
      <label>
        Contact method
        <select value={method} onChange={(e) => setMethod(e.target.value as any)}>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>
        {method === 'email' ? 'Email address' : method === 'whatsapp' ? 'WhatsApp number' : 'Contact detail'}
        <input value={value} onChange={(e) => setValue(e.target.value)} required />
      </label>
      <button className="primary icon-row" disabled={busy} type="submit" style={{ alignSelf: 'flex-start' }}>
        <Send size={15} /> {busy ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}

function AdminInbox() {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const reload = () => listMessages().then(setMessages);
  useEffect(() => { reload(); }, []);

  const toggle = async (m: MessageRow) => {
    await markMessageRead(m.id, !m.read);
    reload();
  };

  const remove = async (m: MessageRow) => {
    if (!confirm(`Delete message from "${m.guest_name}"?`)) return;
    await deleteMessage(m.id);
    reload();
  };

  return (
    <div className="admin-inbox">
      <h3>{messages.filter((m) => !m.read).length} unread of {messages.length}</h3>
      <ul>
        {messages.map((m) => (
          <li key={m.id} className={m.read ? 'read' : 'unread'}>
            <div className="inbox-row-head">
              <strong>{m.guest_name}</strong>
              <span className="muted">{new Date(m.created_at).toLocaleString()}</span>
              <span className="inbox-row-actions">
                <button className="tiny" onClick={() => toggle(m)}>{m.read ? 'Mark unread' : 'Mark read'}</button>
                <button className="tiny danger" onClick={() => remove(m)}><Trash2 size={12} /> Delete</button>
              </span>
            </div>
            <p>{m.message}</p>
            <p className="muted">via {m.contact_method}: {m.contact_value}</p>
          </li>
        ))}
        {messages.length === 0 && <p className="muted">No messages yet.</p>}
      </ul>
    </div>
  );
}

export function ContactPage() {
  const { isAdmin } = useAdmin();
  useTrackView('site', 'contact');
  return (
    <div className="page contact-page">
      {isAdmin ? (
        <>
          <h1 className="icon-row"><InboxIcon size={22} /> Inbox</h1>
          <p className="muted">Messages sent through the public Contact form.</p>
          <AdminInbox />
        </>
      ) : (
        <>
          <h1>Contact</h1>
          <p className="muted">Have a correction, a book suggestion, or a question? Send a message below.</p>
          <ContactForm />
        </>
      )}
    </div>
  );
}