import { createClient, type Session } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'sirajan-munira-media';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[Sirājan Munīrā] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project credentials.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RichDoc = any;

export interface SourceLink {
  id: string;
  book_id: string;
  label: string;
  url: string;
  sort_order: number;
}

export interface Book {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  publisher: string | null;
  base_language: string | null;
  cover_image_url: string | null;
  detail_image_urls: string[];
  description: RichDoc | null;
  visibility: boolean;
  featured: boolean;
  created_at: string;
  updated_at: string;
  source_links?: SourceLink[];
}

export interface Heading {
  id: string;
  book_id: string;
  level: 1 | 2 | 3 | 4;
  content: RichDoc;
  page_number: string | null;
  sort_order: number;
  importance_level: number | null; // 1–5, admin-assigned
  title_text?: string;             // derived by DB trigger (migration 20260924)
  created_at: string;
  updated_at: string;
}

// Explicit heading columns — avoids pulling the derived search_text column
// (a full plain-text copy of the content) into the browser.
export const HEADING_COLS =
  'id, book_id, level, content, page_number, sort_order, importance_level, created_at, updated_at';

export interface Category {
  id: string;
  name: string;
  color: string;
  banner_image_url: string | null;
  description: string | null;
  featured: boolean;
  visibility: boolean;   // admin can hide collections from guests
  created_at: string;
  updated_at: string;
}

export interface CategoryStats {
  entryCount: number;
  bookCount: number;
  viewCount: number;
}

export interface CategoryHeadingRow {
  category_id: string;
  heading_id: string;
}

export interface DraftFolder {
  id: string;
  name: string;
  parent_folder_id: string | null;
  sort_order: number;
}

export interface Draft {
  id: string;
  folder_id: string | null;
  title: string;
  content: RichDoc;
  sort_order: number;
  updated_at: string;
}

export interface AnalyticsEvent {
  id: string;
  event_type: 'view' | 'interact';
  target_type: 'book' | 'heading' | 'category' | 'site';
  target_id: string | null;
  anon_visitor_id: string;
  created_at: string;
}

export interface MessageRow {
  id: string;
  guest_name: string;
  message: string;
  contact_method: 'email' | 'whatsapp' | 'other';
  contact_value: string;
  read: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Auth (FR-27–29)
// ---------------------------------------------------------------------------

export async function signInAdmin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOutAdmin() {
  await supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(cb: (session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

export function slugify(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const uid = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  return base ? `${base}-${uid}` : uid;
}

// ---------------------------------------------------------------------------
// Books (FR-1, FR-2)
// ---------------------------------------------------------------------------

export async function listBooks(opts: { includeHidden: boolean }): Promise<Book[]> {
  let q = supabase.from('books').select('*, source_links(*)').order('created_at', { ascending: false });
  if (!opts.includeHidden) q = q.eq('visibility', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data as any) || [];
}

export async function getBookBySlug(slug: string): Promise<Book | null> {
  const { data, error } = await supabase
    .from('books')
    .select('*, source_links(*)')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

export async function createBook(book: Partial<Book>): Promise<Book> {
  const slug = slugify(book.title || 'untitled');
  const { data, error } = await supabase
    .from('books')
    .insert({
      slug,
      title: book.title,
      author: book.author ?? null,
      publisher: book.publisher ?? null,
      base_language: book.base_language ?? null,
      cover_image_url: book.cover_image_url ?? null,
      detail_image_urls: book.detail_image_urls ?? [],
      description: book.description ?? null,
      visibility: book.visibility ?? true,
      featured: book.featured ?? false,
    })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function updateBook(id: string, patch: Partial<Book>): Promise<void> {
  const { error } = await supabase
    .from('books')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteBook(id: string): Promise<void> {
  const { error } = await supabase.from('books').delete().eq('id', id);
  if (error) throw error;
}

export async function replaceSourceLinks(bookId: string, links: { label: string; url: string }[]) {
  await supabase.from('source_links').delete().eq('book_id', bookId);
  if (links.length === 0) return;
  const { error } = await supabase
    .from('source_links')
    .insert(links.map((l, i) => ({ book_id: bookId, label: l.label, url: l.url, sort_order: i })));
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Headings (FR-11–14)
// ---------------------------------------------------------------------------

export async function listHeadings(bookId: string): Promise<Heading[]> {
  const { data, error } = await supabase
    .from('headings')
    .select(HEADING_COLS)
    .eq('book_id', bookId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as any) || [];
}

export async function getHeading(id: string): Promise<Heading | null> {
  const { data, error } = await supabase.from('headings').select(HEADING_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as any;
}

export async function createHeading(h: {
  book_id: string;
  level: 1 | 2 | 3 | 4;
  content: RichDoc;
  page_number: string | null;
  sort_order: number;
}): Promise<Heading> {
  const { data, error } = await supabase.from('headings').insert(h).select().single();
  if (error) throw error;
  return data as any;
}

export async function updateHeading(id: string, patch: Partial<Heading>): Promise<void> {
  const { error } = await supabase
    .from('headings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function updateHeadingImportance(id: string, level: number | null): Promise<void> {
  const { error } = await supabase
    .from('headings')
    .update({ importance_level: level, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteHeading(id: string): Promise<void> {
  const { error } = await supabase.from('headings').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Categories / Collections (FR-15–18)
// ---------------------------------------------------------------------------

export async function listCategories(opts?: { includeHidden?: boolean }): Promise<Category[]> {
  let q = supabase.from('categories').select('*').order('name');
  if (!opts?.includeHidden) q = q.eq('visibility', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data as any) || [];
}

export async function getCategoryStats(categoryId: string): Promise<CategoryStats> {
  const [{ count: entryCount }, { data: headingRows }, { count: viewCount }] = await Promise.all([
    supabase
      .from('category_headings')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', categoryId),
    supabase
      .from('category_headings')
      .select('headings!inner(book_id)')
      .eq('category_id', categoryId),
    supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('target_type', 'category')
      .eq('target_id', categoryId)
      .eq('event_type', 'view'),
  ]);

  const bookIds = new Set(
    (headingRows || []).map((r: any) => r.headings?.book_id).filter(Boolean)
  );

  return {
    entryCount: entryCount || 0,
    bookCount: bookIds.size,
    viewCount: viewCount || 0,
  };
}

export async function createCategory(c: Partial<Category>): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({
      name: c.name,
      color: c.color ?? '#6b5b95',
      banner_image_url: c.banner_image_url ?? null,
      description: c.description ?? null,
      featured: c.featured ?? false,
      visibility: c.visibility ?? true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function updateCategory(id: string, patch: Partial<Category>): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

export interface CategoryHeadingDetail {
  heading: Heading;
  book: Pick<Book, 'id' | 'slug' | 'title' | 'author' | 'cover_image_url'>;
}

export async function listCategoryHeadings(categoryId: string): Promise<CategoryHeadingDetail[]> {
  const { data, error } = await supabase
    .from('category_headings')
    .select(`heading:headings(${HEADING_COLS}, book:books(id, slug, title, author, cover_image_url))`)
    .eq('category_id', categoryId);
  if (error) throw error;
  return ((data as any) || [])
    .filter((row: any) => row.heading)
    .map((row: any) => ({ heading: row.heading, book: row.heading.book }));
}

export async function addHeadingToCategory(categoryId: string, headingId: string) {
  const { error } = await supabase
    .from('category_headings')
    .upsert({ category_id: categoryId, heading_id: headingId });
  if (error) throw error;
}

export async function removeHeadingFromCategory(categoryId: string, headingId: string) {
  const { error } = await supabase
    .from('category_headings')
    .delete()
    .eq('category_id', categoryId)
    .eq('heading_id', headingId);
  if (error) throw error;
}

export async function listCategoriesForHeading(headingId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('category_headings')
    .select('category_id')
    .eq('heading_id', headingId);
  if (error) throw error;
  return ((data as any) || []).map((r: any) => r.category_id);
}

// ---------------------------------------------------------------------------
// Draft space (FR-30–31)
// ---------------------------------------------------------------------------

export async function listDraftFolders(): Promise<DraftFolder[]> {
  const { data, error } = await supabase.from('draft_folders').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as any) || [];
}

export async function createDraftFolder(name: string, parentId: string | null): Promise<DraftFolder> {
  const existing = await listDraftFolders();
  const sort_order = existing.length ? Math.max(...existing.map((f) => f.sort_order)) + 1 : 0;
  const { data, error } = await supabase
    .from('draft_folders')
    .insert({ name, parent_folder_id: parentId, sort_order })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function renameDraftFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('draft_folders').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function reorderDraftFolders(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, i) => supabase.from('draft_folders').update({ sort_order: i }).eq('id', id)));
}

export async function deleteDraftFolder(id: string): Promise<void> {
  const { error } = await supabase.from('draft_folders').delete().eq('id', id);
  if (error) throw error;
}

export async function listDrafts(folderId: string | null): Promise<Draft[]> {
  let q = supabase.from('drafts').select('*').order('sort_order', { ascending: true });
  q = folderId ? q.eq('folder_id', folderId) : q.is('folder_id', null);
  const { data, error } = await q;
  if (error) throw error;
  return (data as any) || [];
}

export async function createDraft(folderId: string | null, title: string): Promise<Draft> {
  const existing = await listDrafts(folderId);
  const sort_order = existing.length ? Math.max(...existing.map((d) => d.sort_order)) + 1 : 0;
  const { data, error } = await supabase
    .from('drafts')
    .insert({ folder_id: folderId, title, content: null, sort_order })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function renameDraft(id: string, title: string): Promise<void> {
  const { error } = await supabase.from('drafts').update({ title }).eq('id', id);
  if (error) throw error;
}

export async function reorderDrafts(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, i) => supabase.from('drafts').update({ sort_order: i }).eq('id', id)));
}

export async function updateDraft(id: string, patch: Partial<Draft>): Promise<void> {
  const { error } = await supabase
    .from('drafts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteDraft(id: string): Promise<void> {
  const { error } = await supabase.from('drafts').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Messages / Contact (FR-40–42)
// ---------------------------------------------------------------------------

export async function submitMessage(m: {
  guest_name: string;
  message: string;
  contact_method: 'email' | 'whatsapp' | 'other';
  contact_value: string;
}): Promise<void> {
  const { error } = await supabase.from('messages').insert(m);
  if (error) throw error;
}

export async function listMessages(): Promise<MessageRow[]> {
  const { data, error } = await supabase.from('messages').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data as any) || [];
}

export async function markMessageRead(id: string, read: boolean): Promise<void> {
  const { error } = await supabase.from('messages').update({ read }).eq('id', id);
  if (error) throw error;
}

export async function deleteMessage(id: string): Promise<void> {
  const { error } = await supabase.from('messages').delete().eq('id', id);
  if (error) throw error;
}

/** Public: returns unread message count via a SECURITY DEFINER RPC.
 *  Requires `schema_migration.sql` to have been run (creates the function). */
export async function getUnreadMessageCount(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_unread_message_count');
    if (error) return 0;
    return (data as number) || 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Analytics (FR-32–33)
// ---------------------------------------------------------------------------

export function getAnonVisitorId(): string {
  const key = 'sm_anon_visitor_id';
  const dayKey = 'sm_anon_visitor_day';
  const today = new Date().toISOString().slice(0, 10);
  const storedDay = localStorage.getItem(dayKey);
  let id = localStorage.getItem(key);
  if (!id || storedDay !== today) {
    id = `${today}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
    localStorage.setItem(dayKey, today);
  }
  return id;
}

export async function trackEvent(
  eventType: 'view' | 'interact',
  targetType: 'book' | 'heading' | 'category' | 'site',
  targetId: string | null
): Promise<void> {
  try {
    const anon_visitor_id = getAnonVisitorId();
    await supabase.from('analytics_events').insert({
      event_type: eventType,
      target_type: targetType,
      target_id: targetId,
      anon_visitor_id,
    });
  } catch {
    // analytics are non-critical
  }
}

export async function getBookStats(bookId: string): Promise<{ headingCount: number; viewCount: number }> {
  const [{ count: headingCount }, { count: viewCount }] = await Promise.all([
    supabase.from('headings').select('*', { count: 'exact', head: true }).eq('book_id', bookId),
    supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('target_type', 'book')
      .eq('target_id', bookId)
      .eq('event_type', 'view'),
  ]);
  return { headingCount: headingCount || 0, viewCount: viewCount || 0 };
}

export interface AnalyticsSummary {
  totalVisits: number;
  uniqueVisitors: number;
  topBooks: { target_id: string; count: number }[];
  topHeadings: { target_id: string; count: number }[];
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const { data, error } = await supabase.from('analytics_events').select('*');
  if (error) throw error;
  const rows = (data as AnalyticsEvent[]) || [];
  const totalVisits = rows.filter((r) => r.event_type === 'view').length;
  const uniqueVisitors = new Set(rows.map((r) => r.anon_visitor_id)).size;
  const countBy = (type: AnalyticsEvent['target_type']) => {
    const map = new Map<string, number>();
    rows
      .filter((r) => r.target_type === type && r.target_id)
      .forEach((r) => map.set(r.target_id as string, (map.get(r.target_id as string) || 0) + 1));
    return [...map.entries()]
      .map(([target_id, count]) => ({ target_id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  };
  return { totalVisits, uniqueVisitors, topBooks: countBy('book'), topHeadings: countBy('heading') };
}

export async function getLiveStats() {
  const [{ count: bookCount }, { count: categoryCount }] = await Promise.all([
    supabase.from('books').select('*', { count: 'exact', head: true }).eq('visibility', true),
    supabase.from('categories').select('*', { count: 'exact', head: true }).eq('visibility', true),
  ]);
  const { data: visitorRows } = await supabase.from('analytics_events').select('anon_visitor_id');
  const totalVisitors = new Set((visitorRows || []).map((r: any) => r.anon_visitor_id)).size;
  return { books: bookCount || 0, categories: categoryCount || 0, visitors: totalVisitors };
}

// ---------------------------------------------------------------------------
// Storage (image upload)
// ---------------------------------------------------------------------------

export async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || file), 'image/webp', quality);
  });
}

export async function uploadImage(file: File, pathPrefix: string): Promise<string> {
  const blob = await compressImage(file);
  const path = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, {
    contentType: 'image/webp',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// Data export / import (NFR-1)
// ---------------------------------------------------------------------------

export async function exportAllData(): Promise<Blob> {
  const [books, sourceLinks, headings, categories, categoryHeadings, folders, drafts] = await Promise.all([
    supabase.from('books').select('*'),
    supabase.from('source_links').select('*'),
    supabase.from('headings').select('*'),
    supabase.from('categories').select('*'),
    supabase.from('category_headings').select('*'),
    supabase.from('draft_folders').select('*'),
    supabase.from('drafts').select('*'),
  ]);
  const manifest = {
    exported_at: new Date().toISOString(),
    tables: {
      books: books.data || [],
      source_links: sourceLinks.data || [],
      headings: headings.data || [],
      categories: categories.data || [],
      category_headings: categoryHeadings.data || [],
      draft_folders: folders.data || [],
      drafts: drafts.data || [],
    },
  };
  return new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
}

export async function importAllData(json: any): Promise<void> {
  const t = json.tables || {};
  for (const [table, rows] of [
    ['books', t.books],
    ['source_links', t.source_links],
    ['headings', t.headings],
    ['categories', t.categories],
    ['category_headings', t.category_headings],
    ['draft_folders', t.draft_folders],
    ['drafts', t.drafts],
  ] as const) {
    if (Array.isArray(rows) && rows.length) {
      const { error } = await supabase.from(table).upsert(rows);
      if (error) throw new Error(`Import failed on table "${table}": ${error.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Site settings (quotes, footer year, etc.)
// ---------------------------------------------------------------------------

export async function getSiteSetting(key: string): Promise<any> {
  try {
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    return data?.value ?? null;
  } catch {
    return null;
  }
}

export async function setSiteSetting(key: string, value: any): Promise<void> {
  const { error } = await supabase
    .from('site_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Bookmarks page — fetch headings by IDs
// ---------------------------------------------------------------------------

export async function getHeadingsByIds(ids: string[]): Promise<Heading[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('headings')
    .select(HEADING_COLS)
    .in('id', ids);
  if (error) throw error;
  return (data as any) || [];
}

export async function getBookById(id: string): Promise<Book | null> {
  const { data, error } = await supabase
    .from('books')
    .select('*, source_links(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}
// ===========================================================================
// Pagination, batched stats, keyword + semantic search, indexing
// (requires supabase/migrations/20260924_search_pagination.sql)
// ===========================================================================

export interface Page<T> {
  rows: T[];
  total: number;
}

// ---------------------------------------------------------------------------
// Book page: lightweight index of every heading (no content) — the sidebar,
// sort modes and "jump to" use this; bodies are fetched page by page.
// ---------------------------------------------------------------------------

export interface HeadingIndexRow {
  id: string;
  level: number;
  page_number: string | null;
  sort_order: number;
  importance_level: number | null;
  title: string;
}

function titleFromContent(doc: any): string {
  let out = '';
  const walk = (n: any) => {
    if (!n) return;
    if (n.type === 'text' && n.text) out += n.text;
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(doc?.content?.[0]);
  return out.replace(/\s+/g, ' ').trim();
}

export async function listHeadingIndex(bookId: string): Promise<HeadingIndexRow[]> {
  const { data, error } = await supabase
    .from('headings')
    .select('id, level, page_number, sort_order, importance_level, title_text')
    .eq('book_id', bookId)
    .order('sort_order', { ascending: true });
  if (!error) {
    return ((data as any[]) || []).map((r) => ({ ...r, title: r.title_text || '' }));
  }
  // Fallback when the migration hasn't been run yet (no title_text column).
  const fb = await supabase
    .from('headings')
    .select('id, level, page_number, sort_order, importance_level, content')
    .eq('book_id', bookId)
    .order('sort_order', { ascending: true });
  if (fb.error) throw fb.error;
  return ((fb.data as any[]) || []).map((r) => ({
    id: r.id, level: r.level, page_number: r.page_number, sort_order: r.sort_order,
    importance_level: r.importance_level, title: titleFromContent(r.content),
  }));
}

/** heading id → collection ids, for a page of headings (one request). */
export async function listCategoryIdsForHeadings(headingIds: string[]): Promise<Record<string, string[]>> {
  if (!headingIds.length) return {};
  const { data, error } = await supabase
    .from('category_headings')
    .select('heading_id, category_id')
    .in('heading_id', headingIds);
  if (error) throw error;
  const map: Record<string, string[]> = {};
  ((data as any[]) || []).forEach((r) => { (map[r.heading_id] ||= []).push(r.category_id); });
  return map;
}

/** Full-text match inside one book (server side). Returns matching heading ids. */
export async function findHeadingIdsInBook(bookId: string, query: string): Promise<string[]> {
  const term = query.trim().replace(/[%_\\]/g, (m) => `\\${m}`);
  if (!term) return [];
  const { data, error } = await supabase
    .from('headings')
    .select('id')
    .eq('book_id', bookId)
    .ilike('search_text', `%${term}%`)
    .limit(500);
  if (error) throw error;
  return ((data as any[]) || []).map((r) => r.id);
}

export async function getChunkText(chunkId: string | number): Promise<string | null> {
  const { data, error } = await supabase.from('heading_chunks').select('content').eq('id', chunkId).maybeSingle();
  if (error) return null;
  return (data as any)?.content ?? null;
}

// ---------------------------------------------------------------------------
// Bookshelf / Collections pages
// ---------------------------------------------------------------------------

export async function listBooksPage(opts: {
  includeHidden: boolean; featured?: boolean; offset: number; limit: number;
}): Promise<Page<Book>> {
  let q = supabase
    .from('books')
    .select('*, source_links(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1);
  if (!opts.includeHidden) q = q.eq('visibility', true);
  if (opts.featured !== undefined) q = q.eq('featured', opts.featured);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data as any) || [], total: count || 0 };
}

export interface BookStats { headingCount: number; viewCount: number; }

export async function getBookStatsMany(ids: string[]): Promise<Record<string, BookStats>> {
  if (!ids.length) return {};
  const { data, error } = await supabase.rpc('sm_book_stats', { ids });
  if (!error) {
    const out: Record<string, BookStats> = {};
    ((data as any[]) || []).forEach((r) => {
      out[r.book_id] = { headingCount: Number(r.heading_count) || 0, viewCount: Number(r.view_count) || 0 };
    });
    return out;
  }
  // Fallback (migration not run): one request pair per book.
  const pairs = await Promise.all(ids.map(async (id) => [id, await getBookStats(id)] as const));
  return Object.fromEntries(pairs);
}

export async function listCategoriesPage(opts: {
  includeHidden: boolean; featured?: boolean; offset: number; limit: number;
}): Promise<Page<Category>> {
  let q = supabase
    .from('categories')
    .select('*', { count: 'exact' })
    .order('name')
    .range(opts.offset, opts.offset + opts.limit - 1);
  if (!opts.includeHidden) q = q.eq('visibility', true);
  if (opts.featured !== undefined) q = q.eq('featured', opts.featured);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data as any) || [], total: count || 0 };
}

export async function getCategoryStatsMany(ids: string[]): Promise<Record<string, CategoryStats>> {
  if (!ids.length) return {};
  const { data, error } = await supabase.rpc('sm_category_stats', { ids });
  if (!error) {
    const out: Record<string, CategoryStats> = {};
    ((data as any[]) || []).forEach((r) => {
      out[r.category_id] = {
        entryCount: Number(r.entry_count) || 0,
        bookCount: Number(r.book_count) || 0,
        viewCount: Number(r.view_count) || 0,
      };
    });
    return out;
  }
  const pairs = await Promise.all(ids.map(async (id) => [id, await getCategoryStats(id)] as const));
  return Object.fromEntries(pairs);
}

export async function getCategory(id: string): Promise<Category | null> {
  const { data, error } = await supabase.from('categories').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as any;
}

/** One page of a collection's findings, ordered by book then position. */
export async function listCategoryItemsPage(
  categoryId: string, offset: number, limit: number
): Promise<Page<CategoryHeadingDetail>> {
  const { data, error, count } = await supabase
    .from('headings')
    .select(
      `${HEADING_COLS}, book:books!inner(id, slug, title, author, cover_image_url), category_headings!inner(category_id)`,
      { count: 'exact' }
    )
    .eq('category_headings.category_id', categoryId)
    .order('book_id')
    .order('sort_order')
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = ((data as any[]) || []).map((r) => {
    const { book, category_headings, ...heading } = r;
    return { heading: heading as Heading, book };
  });
  return { rows, total: count || 0 };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchKind = 'heading' | 'book' | 'collection';

export interface SearchRow {
  kind: SearchKind;
  id: string;
  heading_id: string | null;
  chunk_id?: number | null;
  book_id: string | null;
  book_slug: string | null;
  book_title: string | null;
  book_author: string | null;
  image_url: string | null;
  page_number: string | null;
  title: string;
  snippet: string;
  color: string | null;
  rank?: number;
  similarity?: number;
}

export async function keywordSearch(
  query: string,
  opts: { limit: number; offset: number; kinds?: SearchKind[] | null }
): Promise<Page<SearchRow>> {
  const { data, error } = await supabase.rpc('sm_keyword_search', {
    q: query,
    result_limit: opts.limit,
    result_offset: opts.offset,
    kinds: opts.kinds && opts.kinds.length ? opts.kinds : null,
  });
  if (error) throw error;
  const rows = ((data as any[]) || []) as (SearchRow & { total_count: number })[];
  return { rows, total: rows.length ? Number(rows[0].total_count) : 0 };
}

export interface SemanticResponse extends Page<SearchRow> {
  cached: boolean;
  model: string;
  tookMs: number;
}

async function functionErrorMessage(error: any): Promise<string> {
  try {
    const body = await error?.context?.json?.();
    if (body?.message) return body.message;
    if (body?.error) return body.error;
  } catch { /* ignore */ }
  return error?.message || 'Request failed';
}

export async function semanticSearch(
  query: string,
  opts: { threshold: number; limit: number; offset: number; includeCollections: boolean }
): Promise<SemanticResponse> {
  const { data, error } = await supabase.functions.invoke('semantic-search', {
    body: { query, ...opts },
  });
  if (error) throw new Error(await functionErrorMessage(error));
  return {
    rows: (data?.results || []) as SearchRow[],
    total: Number(data?.total) || 0,
    cached: !!data?.cached,
    model: data?.model || '',
    tookMs: Number(data?.tookMs) || 0,
  };
}

// ---------------------------------------------------------------------------
// Semantic index maintenance (admin)
// ---------------------------------------------------------------------------

export interface EmbeddingStatus {
  model: string;
  headingsTotal: number;
  headingsPending: number;
  collectionsTotal: number;
  collectionsPending: number;
  chunksTotal: number;
  processedHeadings?: number;
  processedCollections?: number;
}

export async function embedIndex(action: 'status' | 'run' | 'reset'): Promise<EmbeddingStatus> {
  const { data, error } = await supabase.functions.invoke('embed-index', { body: { action } });
  if (error) throw new Error(await functionErrorMessage(error));
  return data as EmbeddingStatus;
}

let indexTimer: ReturnType<typeof setTimeout> | null = null;
let indexRunning = false;

/** Fire-and-forget: after an admin edit, embed whatever changed.
 *  Debounced so a burst of edits results in one background run. */
export function requestIndexing(delayMs = 2500) {
  if (indexTimer) clearTimeout(indexTimer);
  indexTimer = setTimeout(async () => {
    if (indexRunning) return;
    indexRunning = true;
    try {
      for (let i = 0; i < 20; i++) {
        const s = await embedIndex('run');
        if (s.headingsPending + s.collectionsPending === 0) break;
      }
    } catch (e) {
      console.warn('[semantic index] background indexing skipped:', e);
    } finally {
      indexRunning = false;
    }
  }, delayMs);
}