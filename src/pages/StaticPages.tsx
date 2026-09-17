import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  FiAlertCircle, FiBookOpen, FiCheckCircle, FiChevronDown, FiEdit3,
  FiExternalLink, FiInbox, FiLink, FiMail, FiSend, FiTrash2,
  FiMessageSquare, FiClock, FiUser, FiPhone, FiAtSign,
} from 'react-icons/fi';
import {
  MessageRow, deleteMessage, listMessages, markMessageRead, submitMessage,
} from '../lib/supabase';
import { useAdmin, useTrackView } from '../lib/context';
import { SAFEENAH_URL } from '../components/Layout';

interface FaqEntry { id: string; q: string; a: ReactNode; }

const FAQS: FaqEntry[] = [
  {
    id: 'difference',
    q: 'How is this different from Safeenah?',
    a: (
      <>
        Safeenah is the main archive, while Sirājan Munīrā is a dedicated reading
        imprint centred on <strong>books, notes, findings, and sources</strong>.
        The two projects share the same source-first approach, but they organise knowledge differently.{' '}
        <a href={SAFEENAH_URL} target="_blank" rel="noopener noreferrer">
          Visit Safeenah <FiExternalLink aria-hidden="true" />
        </a>.
      </>
    ),
  },
  {
    id: 'bookmarks',
    q: 'Can I bookmark findings for myself?',
    a: <>Yes. Guest bookmarks are saved locally on your own device — no account is required.</>,
  },
  {
    id: 'curator',
    q: 'Who writes and curates the notes?',
    a: (
      <>
        This is a solo project by <strong>Irshad Hossain</strong>, the same person behind Safeenah.
        There is no editorial board — one curator reads closely, records useful findings, and keeps their sources visible.
      </>
    ),
  },
  {
    id: 'error',
    q: 'I found an error in a finding. What now?',
    a: <>Please send it in through Contact. A name and a way to reach you is enough. Corrections and source suggestions are read directly by the admin.</>,
  },
];

function ExternalLink({ children }: { children: ReactNode }) {
  return (
    <a href={SAFEENAH_URL} target="_blank" rel="noopener noreferrer">
      {children} <FiExternalLink aria-hidden="true" />
    </a>
  );
}

// ---------------------------------------------------------------------------
// Admin Inbox — redesigned with beautiful card UI
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function ContactMethodIcon({ method }: { method: 'email' | 'whatsapp' | 'other' }) {
  if (method === 'email') return <FiAtSign size={12} />;
  if (method === 'whatsapp') return <FiPhone size={12} />;
  return <FiMessageSquare size={12} />;
}

function InboxMessageCard({
  message, onToggle, onDelete,
}: {
  message: MessageRow;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(!message.read);

  return (
    <article
      className={`inbox-card ${message.read ? 'inbox-card--read' : 'inbox-card--unread'}`}
      aria-label={`Message from ${message.guest_name}`}
    >
      {/* Unread indicator strip */}
      {!message.read && <div className="inbox-card__strip" aria-hidden="true" />}

      <div className="inbox-card__body">
        {/* Header row */}
        <div className="inbox-card__header">
          <div className="inbox-card__avatar" aria-hidden="true">
            {getInitials(message.guest_name)}
          </div>

          <div className="inbox-card__meta">
            <div className="inbox-card__sender-row">
              <span className="inbox-card__sender">{message.guest_name}</span>
              {!message.read && <span className="inbox-card__new-badge">New</span>}
            </div>
            <div className="inbox-card__time-row">
              <FiClock size={11} />
              <time dateTime={message.created_at} title={formatFullDate(message.created_at)}>
                {formatRelativeTime(message.created_at)}
              </time>
              <span className="inbox-card__full-date">· {formatFullDate(message.created_at)}</span>
            </div>
          </div>

          <div className="inbox-card__actions">
            <button
              className="inbox-action-btn"
              onClick={onToggle}
              title={message.read ? 'Mark as unread' : 'Mark as read'}
            >
              {message.read ? (
                <><FiMessageSquare size={13} /> Unread</>
              ) : (
                <><FiCheckCircle size={13} /> Read</>
              )}
            </button>
            <button
              className="inbox-action-btn inbox-action-btn--danger"
              onClick={onDelete}
              title="Delete message"
            >
              <FiTrash2 size={13} /> Delete
            </button>
          </div>
        </div>

        {/* Message preview / expand */}
        <div className={`inbox-card__message ${expanded ? 'inbox-card__message--expanded' : ''}`}>
          <p>{message.message}</p>
        </div>

        {/* Toggle expand for long messages */}
        {message.message.length > 200 && (
          <button
            className="inbox-expand-btn"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show less ↑' : 'Read full message ↓'}
          </button>
        )}

        {/* Contact info */}
        <div className="inbox-card__contact">
          <ContactMethodIcon method={message.contact_method} />
          <span className="inbox-card__contact-method">
            {message.contact_method === 'email' ? 'Email' : message.contact_method === 'whatsapp' ? 'WhatsApp' : 'Contact'}:
          </span>
          <span className="inbox-card__contact-value">
            {message.contact_method === 'email' ? (
              <a href={`mailto:${message.contact_value}`}>{message.contact_value}</a>
            ) : (
              message.contact_value
            )}
          </span>
        </div>
      </div>
    </article>
  );
}

function AdminInbox() {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');

  const reload = async () => {
    try {
      const rows = await listMessages();
      setMessages(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const toggle = async (message: MessageRow) => {
    await markMessageRead(message.id, !message.read);
    reload();
  };

  const remove = async (message: MessageRow) => {
    if (!confirm(`Delete message from "${message.guest_name}"?`)) return;
    await deleteMessage(message.id);
    reload();
  };

  const unreadCount = messages.filter((m) => !m.read).length;
  const readCount = messages.filter((m) => m.read).length;

  const filtered = messages.filter((m) => {
    if (filter === 'unread') return !m.read;
    if (filter === 'read') return m.read;
    return true;
  });

  return (
    <div className="admin-inbox-redesigned">
      {/* Stats bar */}
      <div className="inbox-stats-bar">
        <div className="inbox-stat">
          <FiInbox size={16} />
          <strong>{messages.length}</strong>
          <span>total</span>
        </div>
        <div className="inbox-stat inbox-stat--unread">
          <span className="inbox-stat__dot" />
          <strong>{unreadCount}</strong>
          <span>unread</span>
        </div>
        <div className="inbox-stat">
          <strong>{readCount}</strong>
          <span>read</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="inbox-filter-tabs" role="tablist">
        {(['all', 'unread', 'read'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={filter === tab}
            className={`inbox-tab ${filter === tab ? 'inbox-tab--active' : ''}`}
            onClick={() => setFilter(tab)}
          >
            {tab === 'all' ? `All (${messages.length})` : tab === 'unread' ? `Unread (${unreadCount})` : `Read (${readCount})`}
          </button>
        ))}
      </div>

      {/* Message list */}
      {loading ? (
        <div className="inbox-skeleton-list">
          {[1, 2, 3].map((i) => (
            <div key={i} className="inbox-skeleton-card">
              <div className="inbox-skeleton__avatar skeleton-pulse" />
              <div className="inbox-skeleton__content">
                <div className="skeleton-pulse" style={{ width: '40%', height: 14, marginBottom: 6 }} />
                <div className="skeleton-pulse" style={{ width: '70%', height: 11, marginBottom: 10 }} />
                <div className="skeleton-pulse" style={{ width: '90%', height: 11, marginBottom: 4 }} />
                <div className="skeleton-pulse" style={{ width: '60%', height: 11 }} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="inbox-empty">
          <FiInbox size={36} />
          <p>{filter === 'unread' ? 'No unread messages.' : filter === 'read' ? 'No read messages.' : 'No messages yet.'}</p>
        </div>
      ) : (
        <div className="inbox-message-list">
          {filtered.map((msg) => (
            <InboxMessageCard
              key={msg.id}
              message={msg}
              onToggle={() => toggle(msg)}
              onDelete={() => remove(msg)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public ContactForm
// ---------------------------------------------------------------------------

export function ContactForm({ compact }: { compact?: boolean }) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [method, setMethod] = useState<'email' | 'whatsapp' | 'other'>('email');
  const [value, setValue] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !message.trim() || !value.trim()) return;
    setBusy(true);
    try {
      await submitMessage({ guest_name: name.trim(), message: message.trim(), contact_method: method, contact_value: value.trim() });
      setSent(true);
    } catch (error: any) {
      alert(error?.message || 'Could not send message.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="sjm-form-success">
        <FiCheckCircle aria-hidden="true" />
        <div>
          <strong>Message sent.</strong>
          <span>Thank you — your message has been received.</span>
        </div>
      </div>
    );
  }

  return (
    <form className="contact-form sjm-contact-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span>Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span>Message</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={compact ? 3 : 5} required />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span>Contact method</span>
        <select value={method} onChange={(e) => setMethod(e.target.value as 'email' | 'whatsapp' | 'other')}>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span>{method === 'email' ? 'Email address' : method === 'whatsapp' ? 'WhatsApp number' : 'Contact detail'}</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} required />
      </label>
      <button className="primary icon-row sjm-submit-button" disabled={busy} type="submit" style={{ alignSelf: 'flex-start' }}>
        <FiSend aria-hidden="true" />
        {busy ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Contact page
// ---------------------------------------------------------------------------

export function ContactPage() {
  const { isAdmin } = useAdmin();
  useTrackView('site', 'contact');

  return (
    <div className="page contact-page sjm-contact-page">
      <style>{INBOX_CSS}</style>
      {isAdmin ? (
        <>
          <div className="page-head">
            <h1 className="icon-row"><FiInbox aria-hidden="true" /> Inbox</h1>
          </div>
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

// ---------------------------------------------------------------------------
// About page (unchanged structure, minor CSS fixes)
// ---------------------------------------------------------------------------

export function AboutPage() {
  useTrackView('site', 'about');
  const rootRef = useRef<HTMLDivElement>(null);
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const elements = root.querySelectorAll<HTMLElement>('[data-sjm-reveal]');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('sjm-visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.08 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const toggleFaq = (id: string) => setOpenFaqId((cur) => (cur === id ? null : id));

  return (
    <div className="page about-page sjm-about" ref={rootRef}>
      <style>{STATIC_PAGE_CSS}</style>

      <section className="sjm-hero" data-sjm-reveal>
        <div className="sjm-hero-rule" aria-hidden="true" />
        <p className="sjm-eyebrow">An Imprint of Safeenah</p>
        <div className="sjm-arabic" lang="ar" dir="rtl">وَدَاعِيًا إِلَى اللَّهِ بِإِذْنِهِ وَسِرَاجًا مُّنِيرًا</div>
        <p className="sjm-translation">
          &quot;…and as one who invites to Allah by His permission, and as a lamp spreading light.&quot; — Al-Ahzab, 33:46
        </p>
        <h1>Every Book, <em>Held</em> Under One Lamp.</h1>
        <p className="sjm-hero-copy">
          A carefully kept reading archive built around books, findings, sources, and the connections that emerge from reading them closely.
        </p>
        <div className="sjm-ornament" aria-hidden="true">
          <span /><FiBookOpen /><span />
        </div>
      </section>

      <section className="sjm-section" data-sjm-reveal>
        <div className="sjm-section-label">01&nbsp;&nbsp; What This Is</div>
        <div className="sjm-quote-card">
          <div className="sjm-quote-arabic" lang="ar" dir="rtl">
            مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ بِهِ طَرِيقًا إِلَى الْجَنَّةِ
          </div>
          <p className="sjm-quote-translation">
            &quot;Whoever takes a path in search of knowledge, Allah makes easy for him a path to Paradise.&quot;
          </p>
          <div className="sjm-quote-source">— Narrated by Abu Hurairah · Sahih Muslim</div>
        </div>
        <div className="sjm-prose">
          <p>
            Sirājan Munīrā is a dedicated reading and knowledge-archiving imprint of{' '}
            <ExternalLink>Safeenah</ExternalLink>. It is built around books and the
            useful things discovered inside them: passages, observations, references,
            source details, and carefully recorded findings.
          </p>
          <p>
            Each finding is kept close to its source and organised so that it can be found again, read in context, and shared without losing where it came from.
          </p>
        </div>
      </section>

      <div className="sjm-divider" aria-hidden="true"><span>◆</span></div>

      <section className="sjm-section" data-sjm-reveal>
        <div className="sjm-section-label">02&nbsp;&nbsp; Mission &amp; Vision</div>
        <div className="sjm-card-grid">
          <article className="sjm-card" data-sjm-reveal>
            <FiBookOpen className="sjm-card-icon" aria-hidden="true" />
            <h2>Mission</h2>
            <p>To turn private reading notes into a public, durable, and precisely sourced archive — so a useful sentence discovered on page 214 of an out-of-print book can be found and shared as easily as a modern web page.</p>
          </article>
          <article className="sjm-card" data-sjm-reveal>
            <FiLink className="sjm-card-icon" aria-hidden="true" />
            <h2>Vision</h2>
            <p>A small, well-kept library can outlast a large, neglected one. The project favours depth over volume: fewer books, read closely, recorded carefully, and organised so that a reader arriving years later can still find what they were looking for.</p>
          </article>
        </div>
      </section>

      <div className="sjm-divider" aria-hidden="true"><span>◆</span></div>

      <section className="sjm-section" data-sjm-reveal>
        <div className="sjm-section-label">03&nbsp;&nbsp; The Story Behind This</div>
        <h2 className="sjm-section-title">Notes That Kept Getting Lost</h2>
        <div className="sjm-timeline">
          {[
            { label: 'The Spark', text: `Building Safeenah meant reading whole books, following references, and repeatedly returning to passages that mattered. Each book produced pages of loose notes scattered across notebooks, phone apps, and unfinished documents.` },
            { label: 'The Problem', text: `A note is only useful if you can find it again and point someone else to it. A private document makes that surprisingly difficult when the useful sentence is buried among dozens of pages.` },
            { label: 'The Idea', text: `What if every book had its own shelf space, and every useful finding inside it had its own address — something a reader could open, revisit, copy, and cite directly?` },
            { label: 'The Shelf', text: `Sirājan Munīrā is that shelf: a reading companion designed around books, findings, sources, and long-term retrieval, offered as a sibling project to Safeenah.` },
          ].map(({ label, text }) => (
            <article key={label} className="sjm-timeline-item" data-sjm-reveal>
              <div className="sjm-timeline-marker" aria-hidden="true"><span /></div>
              <div>
                <div className="sjm-timeline-label">{label}</div>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="sjm-divider" aria-hidden="true"><span>◆</span></div>

      <section className="sjm-section" data-sjm-reveal>
        <div className="sjm-section-label">04&nbsp;&nbsp; Editorial Standards</div>
        <div className="sjm-card-grid">
          {[
            { icon: FiLink, title: 'Full Attribution', text: 'Every finding is attributed to its book, with a page number whenever one is available.' },
            { icon: FiEdit3, title: 'Meaning Untouched', text: 'Findings are not rewritten to alter their meaning. Formatting is kept focused on making the material easier to read.' },
            { icon: FiCheckCircle, title: 'Verified Sources', text: 'Source links point to places where a book can be verified or obtained, rather than to pirated copies.' },
            { icon: FiAlertCircle, title: 'One Editor', text: 'There is one editor. Corrections, suggestions, and source improvements are welcome through Contact.' },
          ].map(({ icon: Icon, title, text }) => (
            <article key={title} className="sjm-card" data-sjm-reveal>
              <Icon className="sjm-card-icon" aria-hidden="true" />
              <h2>{title}</h2>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="sjm-divider" aria-hidden="true"><span>◆</span></div>

      <section className="sjm-section" data-sjm-reveal>
        <div className="sjm-section-label">07&nbsp;&nbsp; FAQ</div>
        <h2 className="sjm-section-title">Frequently Asked Questions</h2>
        <div className="sjm-faq-list">
          {FAQS.map((faq) => {
            const isOpen = openFaqId === faq.id;
            return (
              <article key={faq.id} className={`sjm-faq ${isOpen ? 'sjm-faq-open' : ''}`}>
                <button
                  type="button"
                  className="sjm-faq-question"
                  onClick={() => toggleFaq(faq.id)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${faq.id}`}
                >
                  <span>{faq.q}</span>
                  <FiChevronDown aria-hidden="true" />
                </button>
                <div id={`faq-answer-${faq.id}`} className="sjm-faq-answer" aria-hidden={!isOpen}>
                  <div>{faq.a}</div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="sjm-divider" aria-hidden="true"><span>◆</span></div>

      <section className="sjm-section" data-sjm-reveal>
        <div className="sjm-section-label">08&nbsp;&nbsp; Reach Out</div>
        <h2 className="sjm-section-title">Read · Correct · Connect</h2>
        <div className="sjm-contact-grid">
          <Link to="/contact" className="sjm-contact-card">
            <FiMail aria-hidden="true" />
            <span className="sjm-contact-card-title">Send a Message</span>
            <span className="sjm-contact-card-copy">Leave your name and a way to reach you — email, WhatsApp, or anything you prefer.</span>
            <span className="sjm-contact-card-action">Open Contact <FiExternalLink aria-hidden="true" /></span>
          </Link>
          <a href={SAFEENAH_URL} target="_blank" rel="noopener noreferrer" className="sjm-contact-card">
            <FiBookOpen aria-hidden="true" />
            <span className="sjm-contact-card-title">Visit Safeenah</span>
            <span className="sjm-contact-card-copy">See the main archive and the project from which this reading imprint grew.</span>
            <span className="sjm-contact-card-action">Open Safeenah <FiExternalLink aria-hidden="true" /></span>
          </a>
        </div>
      </section>

      <div className="sjm-divider" aria-hidden="true"><span>◆</span></div>

      <section className="sjm-section" data-sjm-reveal>
        <div className="sjm-section-label">A Note from the Founder</div>
        <div className="sjm-founder-card">
          <div className="sjm-founder-avatar" aria-hidden="true">IH</div>
          <div>
            <div className="sjm-founder-name">Irshad Hossain</div>
            <div className="sjm-founder-role">Founder · Software Engineering Student · Bangladesh</div>
            <blockquote>
              &quot;Safeenah taught me how much gets lost between a page and a memory. Sirājan Munīrā is what I built so the notes I take while reading don't disappear the same way — so a useful finding can have its own address and outlive the notebook it was first written in.&quot;
            </blockquote>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSS for the redesigned Inbox
// ---------------------------------------------------------------------------

const INBOX_CSS = `
/* ── Inbox redesigned ─────────────────────────────────── */
.admin-inbox-redesigned {
  margin-top: 1.2rem;
}

/* Stats bar */
.inbox-stats-bar {
  display: flex;
  gap: 1.5rem;
  align-items: center;
  padding: 0.9rem 1.1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.inbox-stat {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.88rem;
  color: var(--muted);
}
.inbox-stat strong {
  color: var(--fg);
  font-size: 1.1rem;
  font-family: var(--font-serif), Georgia, serif;
}
.inbox-stat--unread strong { color: var(--accent); }
.inbox-stat__dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--accent); flex-shrink: 0;
}

/* Filter tabs */
.inbox-filter-tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0;
}
.inbox-tab {
  padding: 0.5rem 1rem;
  font-size: 0.82rem;
  color: var(--muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  border-radius: 0;
  transition: color 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.inbox-tab:hover { color: var(--fg); }
.inbox-tab--active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }

/* Message list */
.inbox-message-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* Message card */
.inbox-card {
  position: relative;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  overflow: hidden;
  transition: box-shadow 0.2s, border-color 0.2s;
}
.inbox-card:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
.inbox-card--read { opacity: 0.72; }
.inbox-card__strip {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  background: var(--accent);
  border-radius: 10px 0 0 10px;
}
.inbox-card__body { padding: 1rem 1.1rem 1rem 1.3rem; }
.inbox-card--unread .inbox-card__body { padding-left: 1.5rem; }

/* Header */
.inbox-card__header {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  margin-bottom: 0.75rem;
}
.inbox-card__avatar {
  width: 40px; height: 40px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  color: var(--accent);
  font-size: 0.82rem;
  font-weight: 700;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  letter-spacing: 0.03em;
  border: 1.5px solid color-mix(in srgb, var(--accent) 30%, transparent);
}
.inbox-card__meta { flex: 1; min-width: 0; }
.inbox-card__sender-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem; flex-wrap: wrap; }
.inbox-card__sender { font-weight: 700; font-size: 0.96rem; color: var(--fg); }
.inbox-card__new-badge {
  font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
  background: var(--accent); color: #fff;
  padding: 0.12rem 0.45rem; border-radius: 20px;
}
.inbox-card__time-row {
  display: flex; align-items: center; gap: 0.3rem;
  color: var(--muted); font-size: 0.76rem;
}
.inbox-card__full-date {
  display: none;
  font-size: 0.74rem;
  color: var(--muted);
}
@media (min-width: 560px) {
  .inbox-card__full-date { display: inline; }
}

/* Action buttons */
.inbox-card__actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.inbox-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.74rem;
  padding: 0.3rem 0.65rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--muted);
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap;
}
.inbox-action-btn:hover { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, var(--bg)); }
.inbox-action-btn--danger:hover { border-color: #c0392b; color: #c0392b; background: rgba(192,57,43,0.06); }

/* Message content */
.inbox-card__message {
  font-size: 0.9rem;
  line-height: 1.65;
  color: var(--fg);
  max-height: 4.6em;
  overflow: hidden;
  position: relative;
  transition: max-height 0.3s ease;
  margin-bottom: 0.5rem;
}
.inbox-card__message--expanded { max-height: none; }
.inbox-card__message p { margin: 0; }

.inbox-expand-btn {
  font-size: 0.76rem;
  color: var(--accent);
  border-bottom: 1px dotted var(--accent);
  margin-bottom: 0.6rem;
}

/* Contact info */
.inbox-card__contact {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.76rem;
  color: var(--muted);
  padding-top: 0.6rem;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}
.inbox-card__contact svg { color: var(--accent); flex-shrink: 0; }
.inbox-card__contact-method { text-transform: capitalize; }
.inbox-card__contact-value { color: var(--fg); font-weight: 500; }
.inbox-card__contact-value a { color: var(--accent); text-decoration: none; border-bottom: 1px dotted var(--accent); }

/* Skeleton */
.inbox-skeleton-list { display: flex; flex-direction: column; gap: 0.75rem; }
.inbox-skeleton-card {
  display: flex; gap: 0.8rem; padding: 1rem 1.1rem;
  border: 1px solid var(--border); border-radius: 10px;
  background: var(--surface);
}
.inbox-skeleton__avatar {
  width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
}
.inbox-skeleton__content { flex: 1; display: flex; flex-direction: column; justify-content: center; }
.skeleton-pulse {
  background: color-mix(in srgb, var(--border) 80%, var(--fg) 20%);
  border-radius: 4px;
  animation: skeletonPulse 1.4s ease-in-out infinite;
}
@keyframes skeletonPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* Empty state */
.inbox-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 0.75rem; padding: 3rem 1rem;
  color: var(--muted); text-align: center;
}
.inbox-empty svg { opacity: 0.4; }
.inbox-empty p { margin: 0; font-size: 0.9rem; }

/* Mobile */
@media (max-width: 560px) {
  .inbox-card__header { flex-wrap: wrap; }
  .inbox-card__actions { width: 100%; justify-content: flex-start; margin-top: 0.3rem; }
  .inbox-stats-bar { gap: 1rem; }
  .inbox-filter-tabs { overflow-x: auto; }
}
`;

// ---------------------------------------------------------------------------
// Static page CSS (original About page styles)
// ---------------------------------------------------------------------------

const STATIC_PAGE_CSS = `
.sjm-about { --sjm-radius: 5px; --sjm-reading-width: 860px; color: var(--fg); background: var(--bg); }
.sjm-about a { color: var(--accent); text-decoration: none; transition: color .18s ease; }
.sjm-about svg { flex: 0 0 auto; vertical-align: middle; }
.sjm-hero { max-width: 940px; margin: 0 auto 4.5rem; padding: 4.5rem 1rem 1rem; text-align: center; position: relative; }
.sjm-hero-rule { width: 1px; height: 55px; margin: 0 auto 1.4rem; background: linear-gradient(to bottom, transparent, var(--accent)); opacity: .65; }
.sjm-eyebrow, .sjm-section-label, .sjm-timeline-label, .sjm-founder-role, .sjm-contact-card-title, .sjm-contact-card-action { font-family: var(--font-english), sans-serif; text-transform: uppercase; letter-spacing: .16em; }
.sjm-eyebrow { margin: 0 0 1rem; color: var(--accent); font-size: .68rem; font-weight: 700; }
.sjm-arabic { color: var(--accent); font-family: 'Hind Siliguri', sans-serif; font-size: clamp(1.25rem, 4vw, 2.2rem); line-height: 2; margin: 0 auto .5rem; }
.sjm-translation { max-width: 660px; margin: 0 auto 1.6rem; color: var(--muted); font-family: var(--font-serif), Georgia, serif; font-size: clamp(.86rem, 1.7vw, 1rem); font-style: italic; line-height: 1.7; }
.sjm-hero h1 { margin: 0 auto .9rem; max-width: 760px; font-family: var(--font-serif), Georgia, serif; font-size: clamp(2rem, 5.5vw, 3.35rem); line-height: 1.12; letter-spacing: -.025em; color: var(--fg); }
.sjm-hero h1 em { color: var(--accent); font-style: normal; }
.sjm-hero-copy { max-width: 610px; margin: 0 auto; color: var(--muted); font-size: clamp(.95rem, 2vw, 1.1rem); line-height: 1.8; }
.sjm-ornament { display: flex; justify-content: center; align-items: center; gap: .65rem; margin: 1.7rem auto 0; color: var(--accent); }
.sjm-ornament span { width: 55px; height: 1px; background: var(--border); }
.sjm-ornament svg { width: 15px; height: 15px; }
.sjm-section { max-width: var(--sjm-reading-width); margin: 0 auto 4.5rem; padding: 0 .2rem; }
.sjm-section-label { display: flex; align-items: center; gap: .75rem; margin-bottom: 1.35rem; color: var(--accent); font-size: .63rem; font-weight: 700; }
.sjm-section-label::after { content: ''; flex: 1; height: 1px; background: linear-gradient(to right, var(--border), transparent); }
.sjm-section-title { margin: 0 0 1.2rem; color: var(--fg); font-family: var(--font-serif), Georgia, serif; font-size: clamp(1.35rem, 3.4vw, 1.9rem); line-height: 1.25; }
.sjm-prose { color: var(--fg); font-family: var(--font-serif), Georgia, serif; font-size: clamp(.98rem, 1.8vw, 1.08rem); line-height: 1.9; }
.sjm-prose p { margin: 0 0 1rem; }
.sjm-prose p:last-child { margin-bottom: 0; }
.sjm-quote-card, .sjm-card, .sjm-feature-card, .sjm-founder-card, .sjm-contact-card, .sjm-faq, .sjm-callout { background: var(--surface); border: 1px solid var(--border); border-radius: var(--sjm-radius); transition: background-color .25s, border-color .2s, box-shadow .25s, transform .2s; }
.sjm-quote-card { padding: clamp(1.25rem, 4vw, 2rem); margin-bottom: 1.7rem; }
.sjm-quote-arabic { padding: 1rem 1.2rem; color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); border-right: 3px solid var(--accent); border-radius: 2px 0 0 2px; font-family: 'Hind Siliguri', sans-serif; font-size: clamp(1rem, 2.2vw, 1.2rem); line-height: 2.1; }
.sjm-quote-translation { margin: .9rem auto .7rem; max-width: 700px; color: var(--muted); font-family: var(--font-serif), Georgia, serif; font-size: clamp(.88rem, 1.8vw, 1rem); font-style: italic; line-height: 1.7; text-align: center; }
.sjm-quote-source { color: var(--muted); font-size: .62rem; letter-spacing: .1em; text-align: center; text-transform: uppercase; }
.sjm-divider { max-width: var(--sjm-reading-width); margin: 3.3rem auto; display: flex; align-items: center; gap: .7rem; color: var(--muted); }
.sjm-divider::before, .sjm-divider::after { content: ''; flex: 1; height: 1px; background: linear-gradient(to right, transparent, var(--border), transparent); }
.sjm-divider span { font-size: .55rem; opacity: .8; }
.sjm-card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.sjm-card { padding: 1.3rem 1.4rem; }
.sjm-card:hover, .sjm-contact-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 8px 28px color-mix(in srgb, var(--fg) 8%, transparent); }
.sjm-card-icon { width: 21px; height: 21px; margin-bottom: .75rem; color: var(--accent); }
.sjm-card h2 { margin: 0 0 .45rem; color: var(--fg); font-size: 1rem; }
.sjm-card p { margin: 0; color: var(--muted); font-family: var(--font-serif), Georgia, serif; font-size: .95rem; line-height: 1.8; }
.sjm-timeline { position: relative; padding-left: 2rem; }
.sjm-timeline::before { content: ''; position: absolute; left: 4px; top: 6px; bottom: 4px; width: 1px; background: linear-gradient(to bottom, var(--accent), transparent); }
.sjm-timeline-item { position: relative; margin-bottom: 2rem; }
.sjm-timeline-item:last-child { margin-bottom: 0; }
.sjm-timeline-marker { position: absolute; left: -2rem; top: 4px; width: 10px; height: 10px; border: 2px solid var(--accent); border-radius: 50%; background: var(--bg); }
.sjm-timeline-label { margin-bottom: .35rem; color: var(--accent); font-size: .56rem; font-weight: 700; text-transform: uppercase; letter-spacing: .16em; }
.sjm-timeline-item p { margin: 0; color: var(--muted); font-family: var(--font-serif), Georgia, serif; font-size: clamp(.92rem, 1.8vw, 1rem); line-height: 1.85; }
.sjm-faq-list { display: flex; flex-direction: column; gap: .55rem; }
.sjm-faq { overflow: hidden; }
.sjm-faq-question { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 1.1rem; color: var(--fg); text-align: left; background: transparent; }
.sjm-faq-question span { font-family: var(--font-serif), Georgia, serif; font-size: .95rem; font-weight: 700; }
.sjm-faq-question > svg { color: var(--muted); transition: transform .3s; }
.sjm-faq-open .sjm-faq-question > svg { color: var(--accent); transform: rotate(180deg); }
.sjm-faq-answer { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .32s; }
.sjm-faq-open .sjm-faq-answer { grid-template-rows: 1fr; }
.sjm-faq-answer > div { overflow: hidden; padding: 0 1.1rem; color: var(--muted); font-family: var(--font-serif), Georgia, serif; font-size: .93rem; line-height: 1.8; transition: padding .3s; }
.sjm-faq-open .sjm-faq-answer > div { padding: 0 1.1rem 1rem; }
.sjm-contact-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.sjm-contact-card { display: flex; flex-direction: column; align-items: flex-start; gap: .5rem; padding: 1.25rem 1.35rem; color: inherit !important; }
.sjm-contact-card > svg { width: 22px; height: 22px; margin-bottom: .25rem; color: var(--accent); }
.sjm-contact-card-title { color: var(--fg); font-size: .62rem; font-weight: 700; }
.sjm-contact-card-copy { color: var(--muted); font-family: var(--font-serif), Georgia, serif; font-size: .92rem; line-height: 1.7; }
.sjm-contact-card-action { display: inline-flex; align-items: center; gap: .35rem; margin-top: .25rem; color: var(--accent); font-size: .6rem; font-weight: 700; }
.sjm-founder-card { display: grid; grid-template-columns: auto 1fr; gap: 1.3rem; padding: clamp(1.3rem, 4vw, 2rem); }
.sjm-founder-avatar { width: 58px; height: 58px; display: grid; place-items: center; border: 2px solid var(--accent); border-radius: 50%; color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--surface)); font-family: var(--font-serif), Georgia, serif; font-size: 1.2rem; font-weight: 700; }
.sjm-founder-name { margin-bottom: .15rem; color: var(--fg); font-family: var(--font-serif), Georgia, serif; font-size: 1rem; font-weight: 700; }
.sjm-founder-role { margin-bottom: .8rem; color: var(--accent); font-size: .53rem; font-weight: 700; text-transform: uppercase; letter-spacing: .16em; }
.sjm-founder-card blockquote { margin: 0; color: var(--muted); font-family: var(--font-serif), Georgia, serif; font-size: clamp(.92rem, 1.8vw, 1.03rem); font-style: italic; line-height: 1.85; }
.sjm-contact-form { max-width: 520px; }
.sjm-form-success { display: flex; align-items: flex-start; gap: .7rem; max-width: 520px; padding: .9rem 1rem; border: 1px solid var(--border); background: color-mix(in srgb, var(--accent) 7%, var(--surface)); color: var(--fg); }
.sjm-form-success > svg { color: var(--accent); margin-top: .1rem; }
.sjm-form-success div { display: flex; flex-direction: column; gap: .1rem; }
.sjm-form-success span { color: var(--muted); font-size: .88rem; }
.sjm-submit-button { transition: transform .18s; }
.sjm-submit-button:hover:not(:disabled) { transform: translateY(-1px); }
[data-sjm-reveal] { opacity: 0; transform: translateY(18px); transition: opacity .55s, transform .55s; }
[data-sjm-reveal].sjm-visible { opacity: 1; transform: none; }
@media (max-width: 720px) {
  .sjm-hero { padding: 2.6rem .3rem .5rem; margin-bottom: 3.2rem; }
  .sjm-section { margin-bottom: 3.2rem; }
  .sjm-card-grid, .sjm-contact-grid { grid-template-columns: 1fr; }
  .sjm-founder-card { grid-template-columns: 1fr; }
}
`;

export default AboutPage;