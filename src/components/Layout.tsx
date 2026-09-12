import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAdmin, usePrefs, THEMES } from '../lib/context';

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
      <button className="close-x" onClick={() => setLoginOpen(false)} aria-label="Close">✕</button>
      <form onSubmit={submit}>
        <h4>Admin Login</h4>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={busy} className="primary">
          {busy ? '…' : 'Log in'}
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
          <h3>সেটিংস / Settings</h3>
          <button onClick={onClose}>✕</button>
        </div>

        <section>
          <h4>থিম / Theme</h4>
          <div className="theme-grid">
            {THEMES.map((t) => (
              <button key={t.id} className={`theme-swatch ${theme === t.id ? 'active' : ''}`} data-theme-preview={t.id} onClick={() => setTheme(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h4>ইংরেজি ফন্ট / English font</h4>
          <div className="font-choices">
            {(['inter', 'roboto', 'lora'] as const).map((f) => (
              <button key={f} className={englishFont === f ? 'active' : ''} onClick={() => setEnglishFont(f)}>
                {f === 'inter' ? 'Inter' : f === 'roboto' ? 'Roboto' : 'Lora (Editorial)'}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h4>কপি ফরম্যাট / Copy format</h4>
          <label className="check"><input type="checkbox" checked={copySettings.includeBookTitle} onChange={(e) => setCopySettings({ ...copySettings, includeBookTitle: e.target.checked })} /> Book title</label>
          <label className="check"><input type="checkbox" checked={copySettings.includePageNumber} onChange={(e) => setCopySettings({ ...copySettings, includePageNumber: e.target.checked })} /> Page number</label>
          <label className="check"><input type="checkbox" checked={copySettings.includeSourceLink} onChange={(e) => setCopySettings({ ...copySettings, includeSourceLink: e.target.checked })} /> Source link</label>
        </section>

        <section>
          <h4>লোকাল ডেটা / Local data</h4>
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
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className={`site-nav ${isAdmin ? 'admin-mode' : ''}`}>
      <Link to="/" className="brand">
        <span className="brand-main">সৃজন মুনীরা</span>
        <span className="brand-sub">Sirājan Munīrā · an imprint of Safeenah</span>
      </Link>
      <nav>
        <NavLink to="/books">বইঘর / Bookshelf</NavLink>
        <NavLink to="/collections">সংগ্রহ / Collections</NavLink>
        {isAdmin && <NavLink to="/drafts">Drafts</NavLink>}
        {isAdmin && <NavLink to="/analytics">Analytics</NavLink>}
        <NavLink to="/about">About</NavLink>
        <NavLink to="/contact">Contact</NavLink>
      </nav>
      <form className="nav-search" onSubmit={submitSearch}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="সার্চ / Search…" />
      </form>
      <div className="nav-actions">
        <button onClick={() => setSettingsOpen(true)} title="Settings" className="icon-btn">⚙</button>
        {isAdmin ? (
          <button onClick={logout} className="icon-btn admin-tag">Admin ⏻</button>
        ) : (
          <button onClick={() => setLoginOpen(true)} className="icon-btn">Admin Login</button>
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
        <div>
          <h5>সৃজন মুনীরা</h5>
          <p className="muted">An imprint of Safeenah — a book-annotation and knowledge-archiving project.</p>
        </div>
        <div>
          <h5>Navigate</h5>
          <Link to="/books">Bookshelf</Link>
          <Link to="/collections">Collections</Link>
          <Link to="/about">About</Link>
        </div>
        <div>
          <h5>Legal & Contact</h5>
          <Link to="/contact">Contact</Link>
          <span className="muted">© {new Date().getFullYear()} Safeenah.</span>
        </div>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <NavBar />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
