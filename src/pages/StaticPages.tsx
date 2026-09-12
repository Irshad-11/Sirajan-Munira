import React, { useEffect, useState } from 'react';
import { MessageRow, listMessages, markMessageRead, submitMessage } from '../lib/supabase';
import { useAdmin, useTrackView } from '../lib/context';

export function AboutPage() {
  useTrackView('site', 'about');
  return (
    <div className="page about-page">
      <h1>About Sirājan Munīrā</h1>
      <p>
        সৃজন মুনীরা (Sirājan Munīrā) is a book-annotation and knowledge-archiving imprint of Safeenah. A single curator
        reads, annotates and archives structured findings from books, making every finding a deep-linkable, citable,
        collectible unit of knowledge — browsable by book, or gathered across books into curated collections.
      </p>
      <p>
        There are no reader accounts here. Anyone can browse, search, bookmark on their own device, and print a
        traceable copy of any page — quietly, without being tracked by name.
      </p>
    </div>
  );
}

function ContactForm() {
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

  if (sent) return <p className="muted">ধন্যবাদ — আপনার বার্তা পৌঁছেছে। / Thank you — your message has been sent.</p>;

  return (
    <form className="contact-form" onSubmit={submit}>
      <label>আপনার নাম / Your name <input value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label>বার্তা / Message <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} required /></label>
      <label>
        যোগাযোগের মাধ্যম / Contact method
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
      <button className="primary" disabled={busy} type="submit">{busy ? '…' : 'পাঠান / Send'}</button>
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

  return (
    <div className="admin-inbox">
      <h3>Inbox ({messages.filter((m) => !m.read).length} unread)</h3>
      <ul>
        {messages.map((m) => (
          <li key={m.id} className={m.read ? 'read' : 'unread'}>
            <div className="inbox-row-head">
              <strong>{m.guest_name}</strong>
              <span className="muted">{new Date(m.created_at).toLocaleString()}</span>
              <button className="tiny" onClick={() => toggle(m)}>{m.read ? 'Mark unread' : 'Mark read'}</button>
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
      <h1>যোগাযোগ / Contact</h1>
      <p className="muted">Have a correction, a book suggestion, or a question? Send a message below.</p>
      <ContactForm />
      {isAdmin && <AdminInbox />}
    </div>
  );
}
