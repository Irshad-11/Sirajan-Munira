import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  FiAlertCircle,
  FiBookOpen,
  FiCheckCircle,
  FiChevronDown,
  FiEdit3,
  FiExternalLink,
  FiInbox,
  FiLink,
  FiMail,
  FiSend,
  FiTrash2,
} from 'react-icons/fi';
import {
  MessageRow,
  deleteMessage,
  listMessages,
  markMessageRead,
  submitMessage,
} from '../lib/supabase';
import { useAdmin, useTrackView } from '../lib/context';
import { SAFEENAH_URL } from '../components/Layout';

interface FaqEntry {
  id: string;
  q: string;
  a: ReactNode;
}

const FAQS: FaqEntry[] = [
  {
    id: 'difference',
    q: 'How is this different from Safeenah?',
    a: (
      <>
        Safeenah is the main archive, while Sirājan Munīrā is a dedicated reading
        imprint centred on <strong>books, notes, findings, and sources</strong>.
        The two projects share the same source-first approach, but they organise
        knowledge differently.
        {' '}
        <a href={SAFEENAH_URL} target="_blank" rel="noopener noreferrer">
          Visit Safeenah
          <FiExternalLink aria-hidden="true" />
        </a>
        .
      </>
    ),
  },
  {
    id: 'bookmarks',
    q: 'Can I bookmark findings for myself?',
    a: (
      <>
        Yes. Guest bookmarks are saved locally on your own device — no account is
        required. They remain separate from the admin-curated archive.
      </>
    ),
  },
  {
    id: 'curator',
    q: 'Who writes and curates the notes?',
    a: (
      <>
        This is a solo project by <strong>Irshad Hossain</strong>, the same person
        behind Safeenah. There is no editorial board — one curator reads closely,
        records useful findings, and keeps their sources visible.
      </>
    ),
  },
  {
    id: 'error',
    q: 'I found an error in a finding. What now?',
    a: (
      <>
        Please send it in through Contact. A name and a way to reach you is enough.
        Corrections and source suggestions are read directly by the admin.
      </>
    ),
  },
];

function ExternalLink({ children }: { children: ReactNode }) {
  return (
    <a href={SAFEENAH_URL} target="_blank" rel="noopener noreferrer">
      {children} <FiExternalLink aria-hidden="true" />
    </a>
  );
}

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

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const toggleFaq = (id: string) => {
    setOpenFaqId((current) => (current === id ? null : id));
  };

  return (
    <div className="page about-page sjm-about" ref={rootRef}>
      <style>{STATIC_PAGE_CSS}</style>

      <section className="sjm-hero" data-sjm-reveal>
        <div className="sjm-hero-rule" aria-hidden="true" />
        <p className="sjm-eyebrow">An Imprint of Safeenah</p>

        <div className="sjm-arabic" lang="ar" dir="rtl">
          وَدَاعِيًا إِلَى اللَّهِ بِإِذْنِهِ وَسِرَاجًا مُّنِيرًا
        </div>

        <p className="sjm-translation">
          &quot;…and as one who invites to Allah by His permission, and as a lamp
          spreading light.&quot; — Al-Ahzab, 33:46
        </p>

        <h1>
          Every Book, <em>Held</em> Under One Lamp.
        </h1>

        <p className="sjm-hero-copy">
          A carefully kept reading archive built around books, findings, sources,
          and the connections that emerge from reading them closely.
        </p>

        <div className="sjm-ornament" aria-hidden="true">
          <span />
          <FiBookOpen />
          <span />
        </div>
      </section>

      <section className="sjm-section" data-sjm-reveal>
        <div className="sjm-section-label">01&nbsp;&nbsp; What This Is</div>

        <div className="sjm-quote-card">
          <div className="sjm-quote-arabic" lang="ar" dir="rtl">
            مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ بِهِ طَرِيقًا إِلَى الْجَنَّةِ
          </div>
          <p className="sjm-quote-translation">
            &quot;Whoever takes a path in search of knowledge, Allah makes easy for
            him a path to Paradise.&quot;
          </p>
          <div className="sjm-quote-source">
            — Narrated by Abu Hurairah · Sahih Muslim
          </div>
        </div>

        <div className="sjm-prose">
          <p>
            Sirājan Munīrā is a dedicated reading and knowledge-archiving imprint of{' '}
            <ExternalLink>Safeenah</ExternalLink>. It is built around books and the
            useful things discovered inside them: passages, observations, references,
            source details, and carefully recorded findings.
          </p>
          <p>
            Each finding is kept close to its source and organised so that it can be
            found again, read in context, and shared without losing where it came from.
          </p>
        </div>
      </section>

      <div className="sjm-divider" aria-hidden="true">
        <span>◆</span>
      </div>

      <section className="sjm-section" data-sjm-reveal>
        <div className="sjm-section-label">02&nbsp;&nbsp; Mission &amp; Vision</div>

        <div className="sjm-card-grid">
          <article className="sjm-card" data-sjm-reveal>
            <FiBookOpen className="sjm-card-icon" aria-hidden="true" />
            <h2>Mission</h2>
            <p>
              To turn private reading notes into a public, durable, and precisely
              sourced archive — so a useful sentence discovered on page 214 of an
              out-of-print book can be found and shared as easily as a modern web page.
            </p>
          </article>

          <article className="sjm-card" data-sjm-reveal>
            <FiLink className="sjm-card-icon" aria-hidden="true" />
            <h2>Vision</h2>
            <p>
              A small, well-kept library can outlast a large, neglected one. The project
              favours depth over volume: fewer books, read closely, recorded carefully,
              and organised so that a reader arriving years later can still find what
              they were looking for.
            </p>
          </article>
        </div>
      </section>

      <div className="sjm-divider" aria-hidden="true">
        <span>◆</span>
      </div>

      <section className="sjm-section" data-sjm-reveal>
        <div className="sjm-section-label">03&nbsp;&nbsp; The Story Behind This</div>
        <h2 className="sjm-section-title">Notes That Kept Getting Lost</h2>

        <div className="sjm-timeline">
          <article className="sjm-timeline-item" data-sjm-reveal>
            <div className="sjm-timeline-marker" aria-hidden="true">
              <span />
            </div>
            <div>
              <div className="sjm-timeline-label">The Spark</div>
              <p>
                Building <ExternalLink>Safeenah</ExternalLink> meant reading whole
                books, following references, and repeatedly returning to passages that
                mattered. Each book produced pages of loose notes scattered across
                notebooks, phone apps, and unfinished documents.
              </p>
            </div>
          </article>

          <article className="sjm-timeline-item" data-sjm-reveal>
            <div className="sjm-timeline-marker" aria-hidden="true">
              <span />
            </div>
            <div>
              <div className="sjm-timeline-label">The Problem</div>
              <p>
                A note is only useful if you can <strong>find it again</strong> and
                <strong> point someone else to it</strong>. A private document makes
                that surprisingly difficult when the useful sentence is buried among
                dozens of pages.
              </p>
            </div>
          </article>

          <article className="sjm-timeline-item" data-sjm-reveal>
            <div className="sjm-timeline-marker" aria-hidden="true">
              <span />
            </div>
            <div>
              <div className="sjm-timeline-label">The Idea</div>
              <p>
                What if every book had its own shelf space, and every useful finding
                inside it had its own <em>address</em> — something a reader could open,
                revisit, copy, and cite directly?
              </p>
            </div>
          </article>

          <article className="sjm-timeline-item" data-sjm-reveal>
            <div className="sjm-timeline-marker" aria-hidden="true">
              <span />
            </div>
            <div>
              <div className="sjm-timeline-label">The Shelf</div>
              <p>
                Sirājan Munīrā is that shelf: a reading companion designed around books,
                findings, sources, and long-term retrieval, offered as a sibling project
                to Safeenah.
              </p>
            </div>
          </article>
        </div>
      </section>

      <div className="sjm-divider" aria-hidden="true">
        <span>◆</span>
      </div>

      <section className="sjm-section" data-sjm-reveal>
        <div className="sjm-section-label">04&nbsp;&nbsp; Editorial Standards</div>

        <div className="sjm-card-grid">
          <article className="sjm-card" data-sjm-reveal>
            <FiLink className="sjm-card-icon" aria-hidden="true" />
            <h2>Full Attribution</h2>
            <p>
              Every finding is attributed to its book, with a page number whenever one
              is available.
            </p>
          </article>

          <article className="sjm-card" data-sjm-reveal>
            <FiEdit3 className="sjm-card-icon" aria-hidden="true" />
            <h2>Meaning Untouched</h2>
            <p>
              Findings are not rewritten to alter their meaning. Formatting is kept
              focused on making the material easier to read.
            </p>
          </article>

          <article className="sjm-card" data-sjm-reveal>
            <FiCheckCircle className="sjm-card-icon" aria-hidden="true" />
            <h2>Verified Sources</h2>
            <p>
              Source links point to places where a book can be verified or obtained,
              rather than to pirated copies.
            </p>
          </article>

          <article className="sjm-card" data-sjm-reveal>
            <FiAlertCircle className="sjm-card-icon" aria-hidden="true" />
            <h2>One Editor</h2>
            <p>
              There is one editor. Corrections, suggestions, and source improvements
              are welcome through Contact.
            </p>
          </article>
        </div>
      </section>

      <div className="sjm-divider" aria-hidden="true">
        <span>◆</span>
      </div>

      <section className="sjm-section" data-sjm-reveal>
        <div className="sjm-section-label">05&nbsp;&nbsp; Why This Architecture</div>
        <h2 className="sjm-section-title">A Small Archive, Built to Last</h2>

        <div className="sjm-feature-card">
          <p>
            Safeenah runs on plain HTML and JSON — no backend, no login, and very
            little to maintain. Sirājan Munīrā keeps that same preference for simplicity
            while making one deliberate change.
          </p>
          <p>
            Book material grows continuously. Notes need richer formatting, embedded
            images, organised sources, and a comfortable writing environment. Those
            requirements make a small backend useful for the person maintaining the
            archive.
          </p>
          <p>
            The principle therefore remains simple:{' '}
            <strong>free-tier only, no ongoing cost, single-admin, nothing locked away</strong>.
            Readers still get a fast, open experience without signing in.
          </p>
        </div>

        <div className="sjm-callout">
          <FiAlertCircle aria-hidden="true" />
          <p>
            <strong>Part of Safeenah:</strong> Sirājan Munīrā is a dedicated reading
            imprint of the main archive. <ExternalLink>Visit Safeenah</ExternalLink>{' '}
            to see where the larger project began.
          </p>
        </div>
      </section>

      <div className="sjm-divider" aria-hidden="true">
        <span>◆</span>
      </div>

      <section className="sjm-section" data-sjm-reveal>
        <div className="sjm-section-label">06&nbsp;&nbsp; No Accounts, Ever</div>

        <div className="sjm-feature-card sjm-no-account">
          <FiBookOpen aria-hidden="true" />
          <p>
            Readers browse anonymously. Bookmarks, theme, and font choices are stored
            only in your browser and never leave your device. There is no reader
            sign-up, and there will not be one.
          </p>
        </div>
      </section>

      <div className="sjm-divider" aria-hidden="true">
        <span>◆</span>
      </div>

      <section className="sjm-section" data-sjm-reveal>
        <div className="sjm-section-label">07&nbsp;&nbsp; FAQ</div>
        <h2 className="sjm-section-title">Frequently Asked Questions</h2>

        <div className="sjm-faq-list">
          {FAQS.map((faq) => {
            const isOpen = openFaqId === faq.id;

            return (
              <article
                key={faq.id}
                className={`sjm-faq ${isOpen ? 'sjm-faq-open' : ''}`}
              >
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

                <div
                  id={`faq-answer-${faq.id}`}
                  className="sjm-faq-answer"
                  aria-hidden={!isOpen}
                >
                  <div>{faq.a}</div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="sjm-divider" aria-hidden="true">
        <span>◆</span>
      </div>

      <section className="sjm-section" data-sjm-reveal>
        <div className="sjm-section-label">08&nbsp;&nbsp; Reach Out</div>
        <h2 className="sjm-section-title">Read · Correct · Connect</h2>

        <div className="sjm-prose sjm-contact-intro">
          <p>
            This shelf grows through careful reading and honest correction. If a
            finding needs fixing, a book is missing, or you simply want to talk about
            a book, every message reaches the admin directly.
          </p>
        </div>

        <div className="sjm-contact-grid">
          <Link to="/contact" className="sjm-contact-card">
            <FiMail aria-hidden="true" />
            <span className="sjm-contact-card-title">Send a Message</span>
            <span className="sjm-contact-card-copy">
              Leave your name and a way to reach you — email, WhatsApp, or anything you
              prefer.
            </span>
            <span className="sjm-contact-card-action">
              Open Contact <FiExternalLink aria-hidden="true" />
            </span>
          </Link>

          <a
            href={SAFEENAH_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="sjm-contact-card"
          >
            <FiBookOpen aria-hidden="true" />
            <span className="sjm-contact-card-title">Visit Safeenah</span>
            <span className="sjm-contact-card-copy">
              See the main archive and the project from which this reading imprint grew.
            </span>
            <span className="sjm-contact-card-action">
              Open Safeenah <FiExternalLink aria-hidden="true" />
            </span>
          </a>
        </div>
      </section>

      <div className="sjm-divider" aria-hidden="true">
        <span>◆</span>
      </div>

      <section className="sjm-section" data-sjm-reveal>
        <div className="sjm-section-label">A Note from the Founder</div>

        <div className="sjm-founder-card">
          <div className="sjm-founder-avatar" aria-hidden="true">IH</div>

          <div>
            <div className="sjm-founder-name">Irshad Hossain</div>
            <div className="sjm-founder-role">
              Founder · Software Engineering Student · Bangladesh
            </div>
            <blockquote>
              &quot;Safeenah taught me how much gets lost between a page and a memory.
              Sirājan Munīrā is what I built so the notes I take while reading don't
              disappear the same way — so a useful finding can have its own address and
              outlive the notebook it was first written in.&quot;
            </blockquote>
          </div>
        </div>
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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!name.trim() || !message.trim() || !value.trim()) return;

    setBusy(true);

    try {
      await submitMessage({
        guest_name: name.trim(),
        message: message.trim(),
        contact_method: method,
        contact_value: value.trim(),
      });
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
  <form
    className="contact-form sjm-contact-form"
    onSubmit={submit}
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}
  >
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <span>Your name</span>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="name"
        required
      />
    </label>

    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <span>Message</span>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={compact ? 3 : 5}
        required
      />
    </label>

    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <span>Contact method</span>
      <select
        value={method}
        onChange={(event) =>
          setMethod(event.target.value as 'email' | 'whatsapp' | 'other')
        }
      >
        <option value="email">Email</option>
        <option value="whatsapp">WhatsApp</option>
        <option value="other">Other</option>
      </select>
    </label>

    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <span>
        {method === 'email'
          ? 'Email address'
          : method === 'whatsapp'
            ? 'WhatsApp number'
            : 'Contact detail'}
      </span>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        required
      />
    </label>

    <button
      className="primary icon-row sjm-submit-button"
      disabled={busy}
      type="submit"
      style={{ alignSelf: 'flex-start' }}
    >
      <FiSend aria-hidden="true" />
      {busy ? 'Sending…' : 'Send message'}
    </button>
  </form>
);
}

function AdminInbox() {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      const rows = await listMessages();
      setMessages(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const toggle = async (message: MessageRow) => {
    await markMessageRead(message.id, !message.read);
    reload();
  };

  const remove = async (message: MessageRow) => {
    if (!confirm(`Delete message from "${message.guest_name}"?`)) return;
    await deleteMessage(message.id);
    reload();
  };

  const unreadCount = messages.filter((message) => !message.read).length;

  return (
    <div className="admin-inbox sjm-admin-inbox">
      <div className="sjm-inbox-summary">
        <FiInbox aria-hidden="true" />
        <strong>{unreadCount} unread</strong>
        <span>of {messages.length} messages</span>
      </div>

      {loading ? (
        <p className="muted">Loading messages…</p>
      ) : (
        <ul>
          {messages.map((message) => (
            <li
              key={message.id}
              className={`sjm-inbox-message ${message.read ? 'read' : 'unread'}`}
            >
              <div className="sjm-inbox-head">
                <div>
                  <strong>{message.guest_name}</strong>
                  <span className="muted">
                    {new Date(message.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="sjm-inbox-actions">
                  <button
                    className="tiny"
                    type="button"
                    onClick={() => toggle(message)}
                  >
                    {message.read ? 'Mark unread' : 'Mark read'}
                  </button>

                  <button
                    className="tiny danger"
                    type="button"
                    onClick={() => remove(message)}
                  >
                    <FiTrash2 aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </div>

              <p>{message.message}</p>

              <span className="muted">
                via {message.contact_method}: {message.contact_value}
              </span>
            </li>
          ))}

          {messages.length === 0 && (
            <li className="sjm-empty-inbox">
              <FiInbox aria-hidden="true" />
              <span>No messages yet.</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function ContactPage() {
  const { isAdmin } = useAdmin();
  useTrackView('site', 'contact');

  return (
    <div className="page contact-page sjm-contact-page">
      {isAdmin ? (
        <>
          <h1 className="icon-row">
            <FiInbox aria-hidden="true" />
            Inbox
          </h1>
          <p className="muted">
            Messages sent through the public Contact form.
          </p>
          <AdminInbox />
        </>
      ) : (
        <>
          <h1>Contact</h1>
          <p className="muted">
            Have a correction, a book suggestion, or a question? Send a message below.
          </p>
          <ContactForm />
        </>
      )}
    </div>
  );
}

/*
  IMPORTANT:
  This page intentionally uses the application's global theme tokens from
  src/styles/index.css:
    --bg, --fg, --muted, --accent, --surface, --border

  No independent light/dark palette is declared here.
  Therefore every theme selected by PrefsProvider is inherited automatically.
*/
const STATIC_PAGE_CSS = `
.sjm-about {
  --sjm-radius: 5px;
  --sjm-reading-width: 860px;
  color: var(--fg);
  background: var(--bg);
  transition: background-color .25s ease, color .25s ease;
}

.sjm-about a {
  color: var(--accent);
  text-decoration: none;
  transition: color .18s ease, border-color .18s ease, opacity .18s ease;
}

.sjm-about svg {
  flex: 0 0 auto;
  vertical-align: middle;
}

.sjm-hero {
  max-width: 940px;
  margin: 0 auto 4.5rem;
  padding: 4.5rem 1rem 1rem;
  text-align: center;
  position: relative;
}

.sjm-hero-rule {
  width: 1px;
  height: 55px;
  margin: 0 auto 1.4rem;
  background: linear-gradient(to bottom, transparent, var(--accent));
  opacity: .65;
}

.sjm-eyebrow,
.sjm-section-label,
.sjm-timeline-label,
.sjm-founder-role,
.sjm-contact-card-title,
.sjm-contact-card-action {
  font-family: var(--font-english), sans-serif;
  text-transform: uppercase;
  letter-spacing: .16em;
}

.sjm-eyebrow {
  margin: 0 0 1rem;
  color: var(--accent);
  font-size: .68rem;
  font-weight: 700;
}

.sjm-arabic {
  color: var(--accent);
  font-family: 'Hind Siliguri', sans-serif;
  font-size: clamp(1.25rem, 4vw, 2.2rem);
  line-height: 2;
  margin: 0 auto .5rem;
}

.sjm-translation {
  max-width: 660px;
  margin: 0 auto 1.6rem;
  color: var(--muted);
  font-family: var(--font-serif), Georgia, serif;
  font-size: clamp(.86rem, 1.7vw, 1rem);
  font-style: italic;
  line-height: 1.7;
}

.sjm-hero h1 {
  margin: 0 auto .9rem;
  max-width: 760px;
  font-family: var(--font-serif), Georgia, serif;
  font-size: clamp(2rem, 5.5vw, 3.35rem);
  line-height: 1.12;
  letter-spacing: -.025em;
  color: var(--fg);
}

.sjm-hero h1 em {
  color: var(--accent);
  font-style: normal;
}

.sjm-hero-copy {
  max-width: 610px;
  margin: 0 auto;
  color: var(--muted);
  font-size: clamp(.95rem, 2vw, 1.1rem);
  line-height: 1.8;
}

.sjm-ornament {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: .65rem;
  margin: 1.7rem auto 0;
  color: var(--accent);
}

.sjm-ornament span {
  width: 55px;
  height: 1px;
  background: var(--border);
}

.sjm-ornament svg {
  width: 15px;
  height: 15px;
}

.sjm-section {
  max-width: var(--sjm-reading-width);
  margin: 0 auto 4.5rem;
  padding: 0 .2rem;
}

.sjm-section-label {
  display: flex;
  align-items: center;
  gap: .75rem;
  margin-bottom: 1.35rem;
  color: var(--accent);
  font-size: .63rem;
  font-weight: 700;
}

.sjm-section-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, var(--border), transparent);
}

.sjm-section-title {
  margin: 0 0 1.2rem;
  color: var(--fg);
  font-family: var(--font-serif), Georgia, serif;
  font-size: clamp(1.35rem, 3.4vw, 1.9rem);
  line-height: 1.25;
}

.sjm-prose {
  color: var(--fg);
  font-family: var(--font-serif), Georgia, serif;
  font-size: clamp(.98rem, 1.8vw, 1.08rem);
  line-height: 1.9;
}

.sjm-prose p {
  margin: 0 0 1rem;
}

.sjm-prose p:last-child {
  margin-bottom: 0;
}

.sjm-prose strong,
.sjm-feature-card strong,
.sjm-timeline-item strong,
.sjm-founder-card strong {
  color: var(--fg);
}

.sjm-prose em,
.sjm-timeline-item em {
  color: var(--accent);
}

.sjm-prose a,
.sjm-timeline-item a,
.sjm-faq-answer a,
.sjm-callout a {
  display: inline-flex;
  align-items: center;
  gap: .25rem;
  border-bottom: 1px dotted var(--border);
}

.sjm-prose a:hover,
.sjm-timeline-item a:hover,
.sjm-faq-answer a:hover,
.sjm-callout a:hover {
  border-bottom-color: var(--accent);
}

.sjm-quote-card,
.sjm-card,
.sjm-feature-card,
.sjm-founder-card,
.sjm-contact-card,
.sjm-faq,
.sjm-callout {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--sjm-radius);
  transition:
    background-color .25s ease,
    border-color .2s ease,
    box-shadow .25s ease,
    transform .2s ease;
}

.sjm-quote-card {
  padding: clamp(1.25rem, 4vw, 2rem);
  margin-bottom: 1.7rem;
}

.sjm-quote-arabic {
  padding: 1rem 1.2rem;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  border-right: 3px solid var(--accent);
  border-radius: 2px 0 0 2px;
  font-family: 'Hind Siliguri', sans-serif;
  font-size: clamp(1rem, 2.2vw, 1.2rem);
  line-height: 2.1;
}

.sjm-quote-translation {
  margin: .9rem auto .7rem;
  max-width: 700px;
  color: var(--muted);
  font-family: var(--font-serif), Georgia, serif;
  font-size: clamp(.88rem, 1.8vw, 1rem);
  font-style: italic;
  line-height: 1.7;
  text-align: center;
}

.sjm-quote-source {
  color: var(--muted);
  font-size: .62rem;
  letter-spacing: .1em;
  text-align: center;
  text-transform: uppercase;
}

.sjm-divider {
  max-width: var(--sjm-reading-width);
  margin: 3.3rem auto;
  display: flex;
  align-items: center;
  gap: .7rem;
  color: var(--muted);
}

.sjm-divider::before,
.sjm-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--border), transparent);
}

.sjm-divider span {
  font-size: .55rem;
  opacity: .8;
}

.sjm-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.sjm-card {
  padding: 1.3rem 1.4rem;
}

.sjm-card:hover,
.sjm-contact-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 8px 28px color-mix(in srgb, var(--fg) 8%, transparent);
}

.sjm-card-icon {
  width: 21px;
  height: 21px;
  margin-bottom: .75rem;
  color: var(--accent);
}

.sjm-card h2 {
  margin: 0 0 .45rem;
  color: var(--fg);
  font-size: 1rem;
}

.sjm-card p {
  margin: 0;
  color: var(--muted);
  font-family: var(--font-serif), Georgia, serif;
  font-size: .95rem;
  line-height: 1.8;
}

.sjm-timeline {
  position: relative;
  padding-left: 2rem;
}

.sjm-timeline::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 6px;
  bottom: 4px;
  width: 1px;
  background: linear-gradient(to bottom, var(--accent), transparent);
}

.sjm-timeline-item {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  margin-bottom: 2rem;
}

.sjm-timeline-item:last-child {
  margin-bottom: 0;
}

.sjm-timeline-marker {
  position: absolute;
  left: -2rem;
  top: 4px;
  width: 10px;
  height: 10px;
  border: 2px solid var(--accent);
  border-radius: 50%;
  background: var(--bg);
  transition: background-color .2s ease, transform .2s ease;
}

.sjm-timeline-item:hover .sjm-timeline-marker {
  background: var(--accent);
  transform: scale(1.15);
}

.sjm-timeline-label {
  margin-bottom: .35rem;
  color: var(--accent);
  font-size: .56rem;
  font-weight: 700;
}

.sjm-timeline-item p {
  margin: 0;
  color: var(--muted);
  font-family: var(--font-serif), Georgia, serif;
  font-size: clamp(.92rem, 1.8vw, 1rem);
  line-height: 1.85;
}

.sjm-feature-card {
  padding: 1.4rem 1.55rem;
  border-left: 3px solid var(--accent);
}

.sjm-feature-card p {
  margin: 0 0 .85rem;
  color: var(--muted);
  font-family: var(--font-serif), Georgia, serif;
  font-size: clamp(.92rem, 1.8vw, 1.03rem);
  line-height: 1.85;
}

.sjm-feature-card p:last-child {
  margin-bottom: 0;
}

.sjm-callout {
  display: flex;
  gap: .75rem;
  align-items: flex-start;
  margin-top: 1rem;
  padding: .9rem 1.1rem;
  background: color-mix(in srgb, var(--accent) 7%, var(--surface));
}

.sjm-callout > svg {
  margin-top: .15rem;
  color: var(--accent);
}

.sjm-callout p {
  margin: 0;
  color: var(--muted);
  font-family: var(--font-serif), Georgia, serif;
  font-size: .92rem;
  line-height: 1.7;
}

.sjm-no-account {
  display: flex;
  gap: .8rem;
  align-items: flex-start;
}

.sjm-no-account > svg {
  margin-top: .2rem;
  color: var(--accent);
}

.sjm-faq-list {
  display: flex;
  flex-direction: column;
  gap: .55rem;
}

.sjm-faq {
  overflow: hidden;
}

.sjm-faq:hover {
  border-color: color-mix(in srgb, var(--accent) 65%, var(--border));
}

.sjm-faq-question {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.1rem;
  color: var(--fg);
  text-align: left;
  background: transparent;
}

.sjm-faq-question span {
  font-family: var(--font-serif), Georgia, serif;
  font-size: .95rem;
  font-weight: 700;
}

.sjm-faq-question > svg {
  color: var(--muted);
  transition: transform .3s ease, color .2s ease;
}

.sjm-faq-open .sjm-faq-question > svg {
  color: var(--accent);
  transform: rotate(180deg);
}

.sjm-faq-answer {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows .32s ease;
}

.sjm-faq-open .sjm-faq-answer {
  grid-template-rows: 1fr;
}

.sjm-faq-answer > div {
  overflow: hidden;
  padding: 0 1.1rem;
  color: var(--muted);
  font-family: var(--font-serif), Georgia, serif;
  font-size: .93rem;
  line-height: 1.8;
  transition: padding .3s ease;
}

.sjm-faq-open .sjm-faq-answer > div {
  padding: 0 1.1rem 1rem;
}

.sjm-contact-intro {
  margin-bottom: 1.4rem;
}

.sjm-contact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.sjm-contact-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: .5rem;
  padding: 1.25rem 1.35rem;
  color: inherit !important;
}

.sjm-contact-card > svg {
  width: 22px;
  height: 22px;
  margin-bottom: .25rem;
  color: var(--accent);
}

.sjm-contact-card-title {
  color: var(--fg);
  font-size: .62rem;
  font-weight: 700;
}

.sjm-contact-card-copy {
  color: var(--muted);
  font-family: var(--font-serif), Georgia, serif;
  font-size: .92rem;
  line-height: 1.7;
}

.sjm-contact-card-action {
  display: inline-flex;
  align-items: center;
  gap: .35rem;
  margin-top: .25rem;
  color: var(--accent);
  font-size: .6rem;
  font-weight: 700;
}

.sjm-founder-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1.3rem;
  padding: clamp(1.3rem, 4vw, 2rem);
}

.sjm-founder-avatar {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border: 2px solid var(--accent);
  border-radius: 50%;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 7%, var(--surface));
  font-family: var(--font-serif), Georgia, serif;
  font-size: 1.2rem;
  font-weight: 700;
}

.sjm-founder-name {
  margin-bottom: .15rem;
  color: var(--fg);
  font-family: var(--font-serif), Georgia, serif;
  font-size: 1rem;
  font-weight: 700;
}

.sjm-founder-role {
  margin-bottom: .8rem;
  color: var(--accent);
  font-size: .53rem;
  font-weight: 700;
}

.sjm-founder-card blockquote {
  margin: 0;
  color: var(--muted);
  font-family: var(--font-serif), Georgia, serif;
  font-size: clamp(.92rem, 1.8vw, 1.03rem);
  font-style: italic;
  line-height: 1.85;
}

.sjm-contact-form {
  max-width: 520px;
}

.sjm-contact-form label {
  display: flex;
  flex-direction: column;
  gap: .4rem;
}

.sjm-contact-form label > span {
  color: var(--fg);
  font-size: .82rem;
  font-weight: 600;
}

.sjm-contact-form input,
.sjm-contact-form textarea,
.sjm-contact-form select {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
  color: var(--fg);
  padding: .65rem .7rem;
  transition: border-color .18s ease, box-shadow .18s ease, background-color .2s ease;
}

.sjm-contact-form input:focus,
.sjm-contact-form textarea:focus,
.sjm-contact-form select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent);
}

.sjm-submit-button {
  align-self: flex-start;
  transition: transform .18s ease, opacity .18s ease;
}

.sjm-submit-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.sjm-submit-button:active:not(:disabled) {
  transform: translateY(0);
}

.sjm-form-success {
  display: flex;
  align-items: flex-start;
  gap: .7rem;
  max-width: 520px;
  padding: .9rem 1rem;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--accent) 7%, var(--surface));
  color: var(--fg);
}

.sjm-form-success > svg {
  color: var(--accent);
  margin-top: .1rem;
}

.sjm-form-success div {
  display: flex;
  flex-direction: column;
  gap: .1rem;
}

.sjm-form-success span {
  color: var(--muted);
  font-size: .88rem;
}

.sjm-admin-inbox {
  margin-top: 1.5rem;
}

.sjm-inbox-summary {
  display: flex;
  align-items: center;
  gap: .5rem;
  padding-bottom: .8rem;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: .85rem;
}

.sjm-inbox-summary svg {
  color: var(--accent);
}

.sjm-inbox-summary strong {
  color: var(--fg);
}

.sjm-admin-inbox ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.sjm-inbox-message {
  padding: 1rem 0;
  border-bottom: 1px solid var(--border);
  transition: opacity .2s ease;
}

.sjm-inbox-message.read {
  opacity: .55;
}

.sjm-inbox-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.sjm-inbox-head > div:first-child {
  display: flex;
  flex-direction: column;
  gap: .15rem;
}

.sjm-inbox-actions {
  display: flex;
  align-items: center;
  gap: .55rem;
}

.sjm-inbox-message p {
  margin: .7rem 0 .45rem;
  line-height: 1.65;
}

.sjm-inbox-actions button {
  display: inline-flex;
  align-items: center;
  gap: .3rem;
}

.sjm-empty-inbox {
  display: flex;
  align-items: center;
  gap: .5rem;
  padding: 1.2rem 0;
  color: var(--muted);
}

.sjm-empty-inbox svg {
  color: var(--accent);
}

[data-sjm-reveal] {
  opacity: 0;
  transform: translateY(18px);
  transition:
    opacity .55s ease,
    transform .55s ease;
}

[data-sjm-reveal].sjm-visible {
  opacity: 1;
  transform: translateY(0);
}

.sjm-card[data-sjm-reveal]:nth-child(2),
.sjm-contact-card:nth-child(2) {
  transition-delay: .08s;
}

.sjm-card[data-sjm-reveal]:nth-child(3) {
  transition-delay: .16s;
}

.sjm-card[data-sjm-reveal]:nth-child(4) {
  transition-delay: .24s;
}

@media (max-width: 720px) {
  .sjm-hero {
    padding: 2.6rem .3rem .5rem;
    margin-bottom: 3.2rem;
  }

  .sjm-section {
    margin-bottom: 3.2rem;
  }

  .sjm-card-grid,
  .sjm-contact-grid {
    grid-template-columns: 1fr;
  }

  .sjm-founder-card {
    grid-template-columns: 1fr;
  }

  .sjm-founder-avatar {
    width: 52px;
    height: 52px;
  }

  .sjm-inbox-head {
    flex-direction: column;
  }

  .sjm-inbox-actions {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sjm-about *,
  .sjm-about *::before,
  .sjm-about *::after {
    scroll-behavior: auto !important;
    transition-duration: .01ms !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
  }

  [data-sjm-reveal] {
    opacity: 1;
    transform: none;
  }
}
`;

export default AboutPage;
