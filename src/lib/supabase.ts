import { createClient, type Session } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'sirajan-munira-media';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Sirājan Munīrā] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project credentials.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------------------------------------------------------------------
// Types (mirrors the Data Model in §6 of the SRS)
// ---------------------------------------------------------------------------

export type RichDoc = any; // TipTap/ProseMirror JSON document

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
  created_at: string;
  updated_at: string;
  source_links?: SourceLink[];
}

export interface Heading {
  id: string;
  book_id: string;
  level: 1 | 2 | 3 | 4;
  content: RichDoc;
  page_number: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  banner_image_url: string | null;
  description: string | null;
}

export interface CategoryHeadingRow {
  category_id: string;
  heading_id: string;
}

export interface DraftFolder {
  id: string;
  name: string;
  parent_folder_id: string | null;
}

export interface Draft {
  id: string;
  folder_id: string | null;
  title: string;
  content: RichDoc;
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
// Auth (FR-27–29): email+password only, no signup, single admin tier
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
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'book'}-${Math.random().toString(36).slice(2, 7)}`;
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
// Headings (FR-11–14) — deep-linkable units; id is stable from creation
// ---------------------------------------------------------------------------

export async function listHeadings(bookId: string): Promise<Heading[]> {
  const { data, error } = await supabase
    .from('headings')
    .select('*')
    .eq('book_id', bookId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as any) || [];
}

export async function getHeading(id: string): Promise<Heading | null> {
  const { data, error } = await supabase.from('headings').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as any;
}

export async function createHeading(h: {
  book_id: string;
  level: 1 | 2 | 3 | 4;
  content: RichDoc;
  page_number: number | null;
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

export async function deleteHeading(id: string): Promise<void> {
  const { error } = await supabase.from('headings').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Categories / Collections (FR-15–18)
// ---------------------------------------------------------------------------

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('*').order('name');
  if (error) throw error;
  return (data as any) || [];
}

export async function createCategory(c: Partial<Category>): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({
      name: c.name,
      color: c.color ?? '#6b5b95',
      banner_image_url: c.banner_image_url ?? null,
      description: c.description ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function updateCategory(id: string, patch: Partial<Category>): Promise<void> {
  const { error } = await supabase.from('categories').update(patch).eq('id', id);
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
    .select('heading:headings(*, book:books(id, slug, title, author, cover_image_url))')
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
  const { data, error } = await supabase.from('draft_folders').select('*').order('name');
  if (error) throw error;
  return (data as any) || [];
}

export async function createDraftFolder(name: string, parentId: string | null): Promise<DraftFolder> {
  const { data, error } = await supabase
    .from('draft_folders')
    .insert({ name, parent_folder_id: parentId })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function deleteDraftFolder(id: string): Promise<void> {
  const { error } = await supabase.from('draft_folders').delete().eq('id', id);
  if (error) throw error;
}

export async function listDrafts(folderId: string | null): Promise<Draft[]> {
  let q = supabase.from('drafts').select('*').order('updated_at', { ascending: false });
  q = folderId ? q.eq('folder_id', folderId) : q.is('folder_id', null);
  const { data, error } = await q;
  if (error) throw error;
  return (data as any) || [];
}

export async function createDraft(folderId: string | null, title: string): Promise<Draft> {
  const { data, error } = await supabase
    .from('drafts')
    .insert({ folder_id: folderId, title, content: null })
    .select()
    .single();
  if (error) throw error;
  return data as any;
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

// ---------------------------------------------------------------------------
// Analytics (FR-32–33) — coarse, no-PII events
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
  targetType: AnalyticsEvent['target_type'],
  targetId: string | null
) {
  try {
    await supabase.from('analytics_events').insert({
      event_type: eventType,
      target_type: targetType,
      target_id: targetId,
      anon_visitor_id: getAnonVisitorId(),
    });
  } catch {
    // Analytics must never break the reading experience.
  }
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
    supabase.from('categories').select('*', { count: 'exact', head: true }),
  ]);
  const { data: visitorRows } = await supabase.from('analytics_events').select('anon_visitor_id');
  const totalVisitors = new Set((visitorRows || []).map((r: any) => r.anon_visitor_id)).size;
  return { books: bookCount || 0, categories: categoryCount || 0, visitors: totalVisitors };
}

// ---------------------------------------------------------------------------
// Site-wide search (FR-26)
// ---------------------------------------------------------------------------

export interface SearchResult {
  type: 'book' | 'category' | 'heading';
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  image?: string | null;
}

export async function siteSearch(query: string): Promise<SearchResult[]> {
  const term = query.trim();
  if (!term) return [];
  const like = `%${term}%`;

  const [booksByMeta, categories, headingsByBook] = await Promise.all([
    supabase.from('books').select('id, slug, title, author, cover_image_url').eq('visibility', true).or(`title.ilike.${like},author.ilike.${like}`),
    supabase.from('categories').select('id, name, banner_image_url').ilike('name', like),
    supabase
      .from('headings')
      .select('id, book_id, content, books!inner(slug, title, cover_image_url, visibility)')
      .eq('books.visibility', true),
  ]);

  const results: SearchResult[] = [];

  (booksByMeta.data || []).forEach((b: any) => {
    results.push({ type: 'book', id: b.id, title: b.title, subtitle: b.author || undefined, href: `/book/${b.slug}`, image: b.cover_image_url });
  });

  (categories.data || []).forEach((c: any) => {
    results.push({ type: 'category', id: c.id, title: c.name, href: `/collections/${c.id}`, image: c.banner_image_url });
  });

  // Full-text scan across heading rich-text bodies (client-side substring match,
  // adequate at this project's scale; swap for a Postgres tsvector index if it grows).
  const lower = term.toLowerCase();
  (headingsByBook.data || []).forEach((h: any) => {
    const text = docToPlainTextSafe(h.content);
    if (text.toLowerCase().includes(lower)) {
      const idx = text.toLowerCase().indexOf(lower);
      const snippet = text.slice(Math.max(0, idx - 40), idx + 80);
      results.push({
        type: 'heading',
        id: h.id,
        title: h.books.title,
        subtitle: `…${snippet}…`,
        href: `/book/${h.books.slug}#${h.id}`,
        image: h.books.cover_image_url,
      });
    }
  });

  return results.slice(0, 50);
}

function docToPlainTextSafe(doc: any): string {
  if (!doc) return '';
  let out = '';
  const walk = (node: any) => {
    if (!node) return;
    if (node.type === 'text' && node.text) out += node.text + ' ';
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(doc);
  return out;
}

// ---------------------------------------------------------------------------
// Storage (image upload) — NFR-2: client resizes/compresses before upload
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
    note: 'Storage file URLs are included inline on each record (cover_image_url, detail_image_urls, banner_image_url). Download those files separately from Supabase Storage if you need a full offline mirror.',
  };
  return new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
}

export async function importAllData(json: any): Promise<void> {
  const t = json.tables || {};
  // Order matters for foreign keys.
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