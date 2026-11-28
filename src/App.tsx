import React from 'react';
import { CollectionImport } from './pages/MyCollections';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AdminProvider, PrefsProvider } from './lib/context';
import { Layout } from './components/Layout';
import Landing from './pages/Landing';
import Bookshelf from './pages/Bookshelf';
import BookPage from './pages/BookPage';
import { CollectionsList, CategoryDetail } from './pages/Collections';
import Drafts from './pages/Drafts';
import SearchPage from './pages/Search';
import Analytics from './pages/Analytics';
import { AboutPage, ContactPage } from './pages/StaticPages';
import BookmarksPage from './pages/Bookmarks';
import AiIntegrationPage from './pages/AiIntegration';
import AiTestPage from './pages/AiTest';
import FindPage from './pages/FindPage';
import { Splash } from './components/Splash';

/** Every page opens at its top, also when the user comes back with the Back button. Hash links scroll themselves. */
try { window.history.scrollRestoration = 'manual'; } catch { /* ignore */ }
function ScrollToTop() {
  const { pathname, search, hash } = useLocation();
  React.useEffect(() => { try { window.history.scrollRestoration = 'manual'; } catch { /* ignore */ } }, []);
  React.useEffect(() => {
    if (hash) return;
    // Stay at the top while the page settles (late layout / browser restoration), unless the reader scrolls first.
    let user = false;
    const stop = () => { user = true; };
    const hold = () => { if (!user && window.scrollY > 0) window.scrollTo(0, 0); };
    window.scrollTo(0, 0);
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((e) => window.addEventListener(e, stop, { passive: true }));
    window.addEventListener('scroll', hold, { passive: true });
    const end = setTimeout(() => { user = true; }, 1600);
    return () => { clearTimeout(end); window.removeEventListener('scroll', hold); ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((e) => window.removeEventListener(e, stop)); };
  }, [pathname, search, hash]);
  return null;
}

export default function App() {
  return (
    <AdminProvider>
      <Splash />
      <PrefsProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Layout>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/books" element={<Bookshelf />} />
              <Route path="/book/:slug" element={<BookPage />} />
              <Route path="/collections" element={<CollectionsList />} />
              <Route path="/f/:id" element={<FindPage />} />
              <Route path="/find" element={<FindPage />} />
              <Route path="/collections/import" element={<CollectionImport />} />
              <Route path="/collections/:id" element={<CategoryDetail />} />
              <Route path="/my-collections" element={<Navigate to="/collections" replace />} />
              <Route path="/my-collections/:id" element={<CategoryDetail />} />
              <Route path="/drafts" element={<Drafts />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/bookmarks" element={<BookmarksPage />} />
              <Route path="/guide" element={<Navigate to="/#guide" replace />} />
              <Route path="/ai-integration" element={<AiIntegrationPage />} />
              <Route path="/ai-integration/test" element={<AiTestPage />} />
              <Route path="*" element={<Landing />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </PrefsProvider>
    </AdminProvider>
  );
}