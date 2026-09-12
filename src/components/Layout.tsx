import React, { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, LogIn, LogOut, Search as SearchIcon, X, Menu, Inbox } from 'lucide-react';
import { useAdmin, usePrefs, THEMES } from '../lib/context';
import { listMessages } from '../lib/supabase';

export const SAFEENAH_URL = 'https://irshad-11.github.io/Safeenah/';

// ---------------------------------------------------------------------------
// Admin login box (FR-27): minimal box bottom-right, no dedicated page
// ---------------------------------------------------------------------------

function AdminLoginBox() {
  const { loginOpen, setLoginOpen, login, error } = useAdmin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loginOpen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
    } catch {
      /* error shown via context */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-login-box">
      <button className="close-x" onClick={() => setLoginOpen(false)} aria-label="Close"><X size={14} /></button>
      <form onSubmit={submit}>
        <h4 className="icon-row"><LogIn size={16} /> Admin login</h4>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={busy} className="primary full-width">
          {busy ? 'Signing in…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings panel (theme, font, bookmarks clear, copy-format) FR-22–25
// ---------------------------------------------------------------------------

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { theme, setTheme, englishFont, setEnglishFont, copySettings, setCopySettings, clearLocalData, bookmarks } = usePrefs();

  return (
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
              <button key={t.id} className={`theme-swatch ${theme === t.id ? 'active' : ''}`} onClick={() => setTheme(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h4>Font</h4>
          <div className="font-choices">
            {(['inter', 'roboto', 'lora'] as const).map((f) => (
              <button key={f} className={englishFont === f ? 'active' : ''} onClick={() => setEnglishFont(f)}>
                {f === 'inter' ? 'Inter' : f === 'roboto' ? 'Roboto' : 'Lora (Editorial)'}
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
          <p className="muted">{bookmarks.length} bookmark(s) saved on this device.</p>
          <button className="danger" onClick={() => { if (confirm('Clear bookmarks, theme and font preferences from this device?')) clearLocalData(); }}>
            Clear local data
          </button>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top nav + footer shell
// ---------------------------------------------------------------------------

export function NavBar() {
  const { isAdmin, setLoginOpen, logout } = useAdmin();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [q, setQ] = useState('');
  const [unread, setUnread] = useState(0);
  const navRef = React.useRef<HTMLElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdmin) return;
    const load = () => listMessages().then((m) => setUnread(m.filter((x) => !x.read).length)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [isAdmin]);

  // Measure actual nav height so page content (fixed nav) and the book
  // sidebar can offset themselves correctly, including after wrapping on
  // narrow screens or the admin-mode border adding a couple of pixels.
  useEffect(() => {
    const setHeightVar = () => {
      if (navRef.current) document.documentElement.style.setProperty('--nav-height', `${navRef.current.offsetHeight}px`);
    };
    setHeightVar();
    window.addEventListener('resize', setHeightVar);
    return () => window.removeEventListener('resize', setHeightVar);
  }, [menuOpen]);

  // Hides on scroll-down, reappears on the slightest scroll-up — never
  // fully gone, just out of the way while reading further down the page.
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

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
    setMenuOpen(false);
  };

  return (
    <header ref={navRef as any} className={`site-nav ${isAdmin ? 'admin-mode' : ''} ${hidden && !menuOpen ? 'nav-hidden' : ''}`}>
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
        {isAdmin && <NavLink to="/drafts" onClick={() => setMenuOpen(false)}>Drafts</NavLink>}
        {isAdmin && <NavLink to="/analytics" onClick={() => setMenuOpen(false)}>Analytics</NavLink>}
        <NavLink to="/about" onClick={() => setMenuOpen(false)}>About</NavLink>
        <NavLink to="/contact" onClick={() => setMenuOpen(false)}>
          {isAdmin ? 'Inbox' : 'Contact'}
          {isAdmin && unread > 0 && <span className="nav-dot" />}
        </NavLink>
      </nav>

      <form className="nav-search icon-row" onSubmit={submitSearch}>
        <SearchIcon size={14} className="muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
      </form>
      <div className="nav-actions">
        <button onClick={() => setSettingsOpen(true)} title="Settings" className="icon-btn"><SettingsIcon /></button>
        {isAdmin ? (
          <button onClick={logout} title="Log out" className="icon-btn admin-tag"><LogOut /></button>
        ) : (
          <button onClick={() => setLoginOpen(true)} title="Admin login" className="icon-btn"><LogIn /></button>
        )}
      </div>
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      <AdminLoginBox />
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-cols">
        <span className="footer-brand">
          Sirājan Munīrā — an imprint of <a href={SAFEENAH_URL} target="_blank" rel="noopener noreferrer">Safeenah</a>
        </span>
        <nav>
          <Link to="/books">Bookshelf</Link>
          <Link to="/collections">Collections</Link>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
        </nav>
        <span>© {new Date().getFullYear()}</span>
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