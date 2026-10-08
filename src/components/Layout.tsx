import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, LogIn, LogOut, Search as SearchIcon, X, Menu, Bookmark, Pin, ChevronUp, ChevronDown } from 'lucide-react';
import { useAdmin, usePrefs, THEMES } from '../lib/context';
import { getUnreadMessageCount, getSiteSetting, setSiteSetting } from '../lib/supabase';

export const SAFEENAH_URL = 'https://irshad-11.github.io/Safeenah/';

// ---------------------------------------------------------------------------
// Admin login box
// ---------------------------------------------------------------------------
function AdminLoginBox() {
  const { loginOpen, setLoginOpen, login, error } = useAdmin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  if (!loginOpen) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await login(email, password); } catch {} finally { setBusy(false); }
  };
  return createPortal(
    <div className="admin-login-box">
      <button className="close-x" onClick={() => setLoginOpen(false)} aria-label="Close"><X size={14} /></button>
      <form onSubmit={submit}>
        <h4 className="icon-row"><LogIn size={16} /> Admin login</h4>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={busy} className="primary full-width">{busy ? 'Signing in…' : 'Log in'}</button>
      </form>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Settings panel
// ---------------------------------------------------------------------------
function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { theme, setTheme, englishFont, setEnglishFont, copySettings, setCopySettings, clearLocalData, bookmarks } = usePrefs();
  return createPortal(
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h3 className="icon-row"><SettingsIcon size={17} /> Settings</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <section>
          <h4>Theme</h4>
          <div className="theme-grid">
            {THEMES.map((t) => (
              <button key={t.id} className={`theme-swatch ${theme === t.id ? 'active' : ''}`} onClick={() => setTheme(t.id)}>{t.label}</button>
            ))}
          </div>
        </section>
        <section>
          <h4>Font</h4>
          <div className="font-choices">
            {(['inter', 'roboto', 'lora'] as const).map((f) => (
              <button key={f} className={englishFont === f ? 'active' : ''} onClick={() => setEnglishFont(f)}>
                {f === 'inter' ? 'Inter' : f === 'roboto' ? 'Roboto' : 'Lora'}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h4>Copy format</h4>
          <label className="check"><input type="checkbox" checked={copySettings.includeBookTitle} onChange={(e) => setCopySettings({ ...copySettings, includeBookTitle: e.target.checked })} /> Book title</label>
          <label className="check"><input type="checkbox" checked={copySettings.includePageNumber} onChange={(e) => setCopySettings({ ...copySettings, includePageNumber: e.target.checked })} /> Page number</label>
          <label className="check"><input type="checkbox" checked={copySettings.includeSourceLink} onChange={(e) => setCopySettings({ ...copySettings, includeSourceLink: e.target.checked })} /> Source link</label>
        </section>
        <section>
          <h4>Local data</h4>
          <p className="muted">{bookmarks.length} bookmark(s) saved.</p>
          <button className="danger" onClick={() => { if (confirm('Clear local data?')) clearLocalData(); }}>Clear local data</button>
        </section>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Desktop-only nav controls (pin / minimize)
// Only real laptops/desktops get them: a wide screen AND a mouse/trackpad.
// Phones, tablets (incl. big iPads in landscape) keep the normal behaviour.
// ---------------------------------------------------------------------------
const DESKTOP_MQ = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';
const NAV_PIN_KEY = 'sm_nav_pinned';
const NAV_MIN_KEY = 'sm_nav_minimized';

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    try { return window.matchMedia(DESKTOP_MQ).matches; } catch { return false; }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia(DESKTOP_MQ); } catch { return; }
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return isDesktop;
}

function readFlag(key: string) {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}
function writeFlag(key: string, on: boolean) {
  try { on ? localStorage.setItem(key, '1') : localStorage.removeItem(key); } catch { /* storage blocked — state just won't persist */ }
}

// ---------------------------------------------------------------------------
// NavBar
// ---------------------------------------------------------------------------
export function NavBar() {
  const { isAdmin, setLoginOpen, logout } = useAdmin();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);          // auto-hide from scrolling
  const [pinned, setPinned] = useState(() => readFlag(NAV_PIN_KEY));
  const [minimized, setMinimized] = useState(() => readFlag(NAV_MIN_KEY));
  const [q, setQ] = useState('');
  const [unread, setUnread] = useState(0);
  const navRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  // Pin / minimize only take effect on desktop; elsewhere they're ignored
  // (the saved choice is kept for the next time you're on a desktop).
  const pinActive = isDesktop && pinned;
  const minActive = isDesktop && minimized;
  const navHidden = minActive || (!pinActive && hidden && !menuOpen);

  useEffect(() => { writeFlag(NAV_PIN_KEY, pinned); }, [pinned]);
  useEffect(() => { writeFlag(NAV_MIN_KEY, minimized); }, [minimized]);

  useEffect(() => {
    const load = () => getUnreadMessageCount().then(setUnread).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  // --nav-height     : full height of the nav (used for page top padding etc.)
  // --nav-visible-h  : how much of the nav currently covers the top of the
  //                    screen (0 while hidden/minimized). Sticky panels and
  //                    the editor toolbar use this so they always sit just
  //                    below the nav — never underneath it.
  useEffect(() => {
    const setH = () => {
      if (!navRef.current) return;
      const h = navRef.current.offsetHeight;
      const root = document.documentElement.style;
      root.setProperty('--nav-height', `${h}px`);
      root.setProperty('--nav-visible-h', navHidden ? '0px' : `${h}px`);
    };
    setH();
    window.addEventListener('resize', setH);
    return () => window.removeEventListener('resize', setH);
  }, [menuOpen, navHidden, isDesktop, isAdmin]);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastY && y > 80) setHidden(true);
      else if (y < lastY) setHidden(false);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const togglePin = () => {
    setHidden(false);               // never let a stale auto-hide kick in on unpin
    setPinned((v) => !v);
  };
  const minimize = () => {
    setSettingsOpen(false);
    setMinimized(true);
  };
  const restore = () => {
    setHidden(false);               // back to normal behaviour, starting visible
    setMinimized(false);
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
    setMenuOpen(false);
  };

  return (
    <>
    <header
      ref={navRef as any}
      className={`site-nav ${isAdmin ? 'admin-mode' : ''} ${navHidden ? 'nav-hidden' : ''} ${pinActive ? 'nav-pinned' : ''} ${minActive ? 'nav-minimized' : ''}`}
    >
      <Link to="/" className="brand" onClick={() => setMenuOpen(false)}>
        <span className="brand-main">Sirājan Munīrā</span>
        <span className="brand-sub">an imprint of Safeenah</span>
      </Link>

      <button className="hamburger-btn icon-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
        {menuOpen ? <X /> : <Menu />}
      </button>

      <nav className={menuOpen ? 'mobile-open' : ''}>
        <NavLink to="/books" onClick={() => setMenuOpen(false)}>Bookshelf</NavLink>
        <NavLink to="/collections" onClick={() => setMenuOpen(false)}>Collections</NavLink>
        <NavLink to="/search" onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-search-link ${isActive ? 'active' : ''}`}>
          <SearchIcon size={14} aria-hidden="true" /> Search
        </NavLink>
        {isAdmin && <NavLink to="/drafts" onClick={() => setMenuOpen(false)}>Drafts</NavLink>}
        {isAdmin && <NavLink to="/analytics" onClick={() => setMenuOpen(false)}>Analytics</NavLink>}
        <NavLink to="/about" onClick={() => setMenuOpen(false)}>About</NavLink>
        <NavLink to="/contact" onClick={() => setMenuOpen(false)}>{isAdmin ? 'Inbox' : 'Contact'}</NavLink>
      </nav>

      <form className="nav-search icon-row" role="search" onSubmit={submitSearch}>
        <SearchIcon size={14} className="muted" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Quick search…" aria-label="Quick search" />
      </form>

      <div className="nav-actions">
        {/* Desktop only: pin (stop auto-hide) + minimize */}
        {isDesktop && (
          <span className="nav-desk-controls">
            <button
              type="button"
              onClick={togglePin}
              className={`icon-btn nav-pin-btn ${pinned ? 'active' : ''}`}
              title={pinned ? 'Unpin navigation bar (auto-hide while scrolling)' : 'Pin navigation bar (stay visible while scrolling)'}
              aria-label={pinned ? 'Unpin navigation bar' : 'Pin navigation bar'}
              aria-pressed={pinned}
            >
              <Pin size={15} />
            </button>
            <button
              type="button"
              onClick={minimize}
              className="icon-btn nav-min-btn"
              title="Minimize navigation bar"
              aria-label="Minimize navigation bar"
            >
              <ChevronUp size={16} />
            </button>
          </span>
        )}

        {/* Bookmarks shortcut */}
        <Link to="/bookmarks" className="icon-btn" title="My bookmarks"><Bookmark size={16} /></Link>
        <button onClick={() => setSettingsOpen(true)} title="Settings" className="icon-btn"><SettingsIcon /></button>

        {isAdmin ? (
          <button onClick={logout} title="Log out" className="icon-btn admin-tag nav-auth-badge-wrap">
            <LogOut size={17} />
            {unread > 0 && <span className="nav-unread-badge">{unread > 9 ? '9+' : unread}</span>}
          </button>
        ) : (
          /* Icon-only login button with red dot / count when there are messages */
          <button onClick={() => setLoginOpen(true)} title="Admin login" className="icon-btn nav-auth-badge-wrap">
            <LogIn size={16} />
            {unread > 0 && <span className="nav-unread-badge">{unread > 9 ? '9+' : unread}</span>}
          </button>
        )}
      </div>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      <AdminLoginBox />
    </header>

    {/* Rendered OUTSIDE the header: the header is moved with a transform,
        and a fixed child of a transformed parent would move with it. */}
    {minActive && (
      <button
        type="button"
        className="nav-restore-tab"
        onClick={restore}
        title="Show navigation bar"
        aria-label="Show navigation bar"
      >
        <ChevronDown size={16} />
      </button>
    )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Editable footer year (admin clicks to change)
// ---------------------------------------------------------------------------
function FooterYear() {
  const { isAdmin } = useAdmin();
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [lastEdit, setLastEdit] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    getSiteSetting('footer').then((val) => {
      if (val?.year) setYear(String(val.year));
      if (val?.last_edit) setLastEdit(val.last_edit);
    });
  }, []);

  const save = async () => {
    const today = new Date().toLocaleDateString('en-GB');
    await setSiteSetting('footer', { year: draft || year, last_edit: today });
    setYear(draft || year);
    setLastEdit(today);
    setEditing(false);
  };

  if (editing && isAdmin) {
    return (
      <span className="footer-year-edit">
        ©&nbsp;
        <input
          className="footer-year-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus
          size={4}
        />
        <button className="footer-year-save link-btn" onClick={save}>✓</button>
      </span>
    );
  }

  return (
    <span>
      ©&nbsp;
      {isAdmin
        ? <button className="footer-year-btn" onClick={() => { setDraft(year); setEditing(true); }} title="Click to edit year">{year}</button>
        : year
      }
      {lastEdit && <span className="footer-last-edit"> · Last updated {lastEdit}</span>}
    </span>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <style>{FOOTER_CSS}</style>
      <div className="footer-cols">
        <span className="footer-brand">
          Sirājan Munīrā — an imprint of <a href={SAFEENAH_URL} target="_blank" rel="noopener noreferrer">Safeenah</a>
        </span>
        <nav>
          <Link to="/books">Bookshelf</Link>
          <Link to="/collections">Collections</Link>
          <Link to="/search">Search</Link>
          <Link to="/bookmarks">Bookmarks</Link>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
        </nav>
        <FooterYear />
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAdmin();
  return (
    <div className="app-shell">
      {isAdmin && <div className="admin-edge-bar" title="Admin privilege active" />}
      <NavBar />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

const FOOTER_CSS = `
.nav-auth-badge-wrap { position: relative; }
.nav-unread-badge {
  position: absolute; top: -6px; right: -6px;
  min-width: 16px; height: 16px; border-radius: 8px;
  background: #c0392b; color: #fff;
  font-size: 0.58rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  padding: 0 3px; border: 2px solid var(--bg);
  animation: badgePop 0.3s cubic-bezier(.36,1.56,.64,1);
}
@keyframes badgePop { from{transform:scale(0)} to{transform:scale(1)} }
.footer-year-btn {
  border-bottom: 1px dotted var(--muted); color: var(--muted);
  cursor: pointer; background: none; font-size: inherit;
  transition: color 0.15s;
}
.footer-year-btn:hover { color: var(--accent); border-bottom-color: var(--accent); }
.footer-year-input {
  width: 48px; background: transparent; border: none;
  border-bottom: 1px solid var(--accent); color: var(--fg);
  font-size: inherit; text-align: center; padding: 0;
}
.footer-year-input:focus { outline: none; }
.footer-year-save { font-size: 0.8rem; margin-left: 4px; }
.footer-year-edit { display: inline-flex; align-items: center; gap: 2px; }
.footer-last-edit { font-size: 0.72rem; color: var(--muted); }
@media(max-width: 720px) {
  .nav-search { display: none; }
}
.site-nav nav a.nav-search-link { display: inline-flex; align-items: center; gap: 0.3rem; }
.site-nav nav a.nav-search-link svg { width: 14px; height: 14px; }
@media(max-width: 720px) {
  .site-nav nav a.nav-search-link { padding: 0.55rem 0; }
}
`;