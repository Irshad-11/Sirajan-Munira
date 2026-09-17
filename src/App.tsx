import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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

export default function App() {
  return (
    <AdminProvider>
      <PrefsProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/books" element={<Bookshelf />} />
              <Route path="/book/:slug" element={<BookPage />} />
              <Route path="/collections" element={<CollectionsList />} />
              <Route path="/collections/:id" element={<CategoryDetail />} />
              <Route path="/drafts" element={<Drafts />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/bookmarks" element={<BookmarksPage />} />
              <Route path="*" element={<Landing />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </PrefsProvider>
    </AdminProvider>
  );
}