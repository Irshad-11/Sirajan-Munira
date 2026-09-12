-- ============================================================================
-- Sirājan Munīrā — Supabase schema + Row Level Security + demo data
-- ============================================================================
-- HOW TO USE:
--   1. Open your Supabase project → SQL Editor → New query.
--   2. Paste this whole file and click "Run".
--   3. Create your admin login: Authentication → Users → Add user
--      (email + password). No signup flow exists in the app on purpose.
--   4. Confirm a Storage bucket named exactly as VITE_SUPABASE_STORAGE_BUCKET
--      in your .env (default: sirajan-munira-media) was created below.
--
-- NOTE: this script starts by dropping the app's own tables (if they exist)
-- before recreating them. That makes it safe to re-run from a clean state
-- even if an earlier attempt partially succeeded (e.g. left behind a table
-- with a stale constraint). It does NOT touch anything outside these named
-- tables, so other data in your project is untouched.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Clean slate (safe to run even the first time — "if exists" no-ops then)
-- ----------------------------------------------------------------------------

drop table if exists category_headings cascade;
drop table if exists messages cascade;
drop table if exists analytics_events cascade;
drop table if exists drafts cascade;
drop table if exists draft_folders cascade;
drop table if exists categories cascade;
drop table if exists headings cascade;
drop table if exists source_links cascade;
drop table if exists books cascade;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table if not exists books (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  author text,
  publisher text,
  base_language text,
  cover_image_url text,
  detail_image_urls jsonb not null default '[]'::jsonb,
  description jsonb,
  visibility boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists source_links (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  label text not null,
  url text not null,
  sort_order int not null default 0
);

create table if not exists headings (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  level int not null check (level between 1 and 4),
  content jsonb not null,
  page_number text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#6b5b95',
  banner_image_url text,
  description text
);

create table if not exists category_headings (
  category_id uuid not null references categories(id) on delete cascade,
  heading_id uuid not null references headings(id) on delete cascade,
  primary key (category_id, heading_id)
);

create table if not exists draft_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_folder_id uuid references draft_folders(id) on delete cascade,
  sort_order int not null default 0
);

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references draft_folders(id) on delete set null,
  title text not null default 'Untitled note',
  content jsonb,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('view', 'interact')),
  target_type text not null check (target_type in ('book', 'heading', 'category', 'site')),
  target_id text,
  anon_visitor_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null,
  message text not null,
  contact_method text not null check (contact_method in ('email', 'whatsapp', 'other')),
  contact_value text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_headings_book on headings(book_id);
create index if not exists idx_source_links_book on source_links(book_id);
create index if not exists idx_category_headings_cat on category_headings(category_id);
create index if not exists idx_category_headings_heading on category_headings(heading_id);
create index if not exists idx_drafts_folder on drafts(folder_id);
create index if not exists idx_analytics_target on analytics_events(target_type, target_id);

-- ----------------------------------------------------------------------------
-- Row Level Security
--   Guests (anon key, unauthenticated) may only read visible/public content
--   and submit contact messages / analytics pings.
--   Admin = any authenticated Supabase Auth user (single tier, FR-27–29).
-- ----------------------------------------------------------------------------

alter table books enable row level security;
alter table source_links enable row level security;
alter table headings enable row level security;
alter table categories enable row level security;
alter table category_headings enable row level security;
alter table draft_folders enable row level security;
alter table drafts enable row level security;
alter table analytics_events enable row level security;
alter table messages enable row level security;

drop policy if exists "public read visible books" on books;
create policy "public read visible books" on books for select using (visibility = true or auth.role() = 'authenticated');
drop policy if exists "admin write books" on books;
create policy "admin write books" on books for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "public read source_links" on source_links;
create policy "public read source_links" on source_links for select using (
  exists (select 1 from books b where b.id = source_links.book_id and (b.visibility = true or auth.role() = 'authenticated'))
);
drop policy if exists "admin write source_links" on source_links;
create policy "admin write source_links" on source_links for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "public read headings" on headings;
create policy "public read headings" on headings for select using (
  exists (select 1 from books b where b.id = headings.book_id and (b.visibility = true or auth.role() = 'authenticated'))
);
drop policy if exists "admin write headings" on headings;
create policy "admin write headings" on headings for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "public read categories" on categories;
create policy "public read categories" on categories for select using (true);
drop policy if exists "admin write categories" on categories;
create policy "admin write categories" on categories for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "public read category_headings" on category_headings;
create policy "public read category_headings" on category_headings for select using (true);
drop policy if exists "admin write category_headings" on category_headings;
create policy "admin write category_headings" on category_headings for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "admin only draft_folders" on draft_folders;
create policy "admin only draft_folders" on draft_folders for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "admin only drafts" on drafts;
create policy "admin only drafts" on drafts for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "anyone can insert analytics" on analytics_events;
create policy "anyone can insert analytics" on analytics_events for insert with check (true);
drop policy if exists "admin read analytics" on analytics_events;
create policy "admin read analytics" on analytics_events for select using (auth.role() = 'authenticated');

drop policy if exists "anyone can send a message" on messages;
create policy "anyone can send a message" on messages for insert with check (true);
drop policy if exists "admin read/update messages" on messages;
create policy "admin read/update messages" on messages for select using (auth.role() = 'authenticated');
drop policy if exists "admin update messages" on messages;
create policy "admin update messages" on messages for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "admin delete messages" on messages;
create policy "admin delete messages" on messages for delete using (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- Storage bucket (public read, admin write via authenticated role)
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('sirajan-munira-media', 'sirajan-munira-media', true)
on conflict (id) do nothing;

drop policy if exists "public read media" on storage.objects;
create policy "public read media" on storage.objects for select using (bucket_id = 'sirajan-munira-media');
drop policy if exists "admin upload media" on storage.objects;
create policy "admin upload media" on storage.objects for insert with check (bucket_id = 'sirajan-munira-media' and auth.role() = 'authenticated');
drop policy if exists "admin update media" on storage.objects;
create policy "admin update media" on storage.objects for update using (bucket_id = 'sirajan-munira-media' and auth.role() = 'authenticated');
drop policy if exists "admin delete media" on storage.objects;
create policy "admin delete media" on storage.objects for delete using (bucket_id = 'sirajan-munira-media' and auth.role() = 'authenticated');

-- ============================================================================
-- DEMO DATA
-- ============================================================================

-- ---- Books ------------------------------------------------------------------

insert into books (id, slug, title, author, publisher, base_language, cover_image_url, detail_image_urls, description, visibility) values
('a0000000-0000-4000-8000-000000000001', 'the-silent-garden-9f3k2', 'The Silent Garden', 'Amara Hossain', 'Banyan Leaf Press', 'English',
  'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600',
  '["https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600"]'::jsonb,
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A quiet novel about a retired botanist who discovers a hidden garden behind her late brother''s house, and the letters buried beneath its oldest tree."}]}]}'::jsonb,
  true),
('a0000000-0000-4000-8000-000000000002', 'nodir-kabbo-7h2p9', 'নদীর কাব্য', 'রফিক চৌধুরী', 'Bôi Ghor Prokashoni', 'Bangla',
  'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600',
  '[]'::jsonb,
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"পদ্মা নদীর তীরে বেড়ে ওঠা এক কবির জীবন ও সময়ের কবিতা সংকলন।"}]}]}'::jsonb,
  true),
('a0000000-0000-4000-8000-000000000003', 'principles-of-clear-thinking-3m8x1', 'Principles of Clear Thinking', 'David Ferran', 'Northgate Books', 'English',
  'https://images.unsplash.com/photo-1517673400267-0251440c45dc?w=600',
  '["https://images.unsplash.com/photo-1519682337058-a94d519337bc?w=600","https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=600"]'::jsonb,
  '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"About this book"}]},{"type":"paragraph","content":[{"type":"text","text":"A short, practical guide to reasoning carefully under uncertainty — written for readers with no background in formal logic."}]}]}'::jsonb,
  true),
('a0000000-0000-4000-8000-000000000004', 'shomoyer-shakkhi-5k1t4', 'সময়ের সাক্ষী', 'নাজমা ইসলাম', 'Ittihash Publications', 'Bangla',
  'https://images.unsplash.com/photo-1524578271613-d550eacf6090?w=600',
  '[]'::jsonb,
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"বিংশ শতাব্দীর তিনটি প্রজন্মের চোখে দেখা বাংলার সামাজিক পরিবর্তনের দলিল।"}]}]}'::jsonb,
  true),
('a0000000-0000-4000-8000-000000000005', 'the-architecture-of-silence-2q6z8', 'The Architecture of Silence', 'Amara Hossain', 'Banyan Leaf Press', 'English',
  'https://images.unsplash.com/photo-1495640388908-05fa85288e61?w=600',
  '[]'::jsonb,
  null,
  false)
on conflict (id) do nothing;

-- ---- Source links -------------------------------------------------------------

insert into source_links (book_id, label, url, sort_order) values
('a0000000-0000-4000-8000-000000000001', 'Publisher page', 'https://example.com/banyan-leaf/the-silent-garden', 0),
('a0000000-0000-4000-8000-000000000001', 'WorldCat listing', 'https://www.worldcat.org/', 1),
('a0000000-0000-4000-8000-000000000001', 'Author interview', 'https://example.com/interviews/amara-hossain', 2),
('a0000000-0000-4000-8000-000000000001', 'Goodreads', 'https://www.goodreads.com/', 3),
('a0000000-0000-4000-8000-000000000003', 'Publisher page', 'https://example.com/northgate/clear-thinking', 0),
('a0000000-0000-4000-8000-000000000003', 'Errata & notes', 'https://example.com/northgate/clear-thinking/errata', 1)
on conflict do nothing;

-- ---- Headings -----------------------------------------------------------------
-- Each heading's `content` is a TipTap/ProseMirror document whose first node
-- is the H1–H4 node itself (this is what makes it a deep-linkable "finding").

insert into headings (id, book_id, level, content, page_number, sort_order) values

('b0000000-0000-4000-8000-000000000101', 'a0000000-0000-4000-8000-000000000001', 1,
 '{"type":"doc","content":[
    {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"The tree remembers what the house forgot"}]},
    {"type":"paragraph","content":[{"type":"text","text":"Mira had not opened the garden gate in eleven years, and yet the hinge gave way "},{"type":"text","marks":[{"type":"italic"}],"text":"without a sound"},{"type":"text","text":" — as though it had been waiting, oiled by habit rather than hands."}]},
    {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Grief, she had learned, does not close doors. It simply stops asking who opened them."}]}]}
 ]}'::jsonb, 12, 0),

('b0000000-0000-4000-8000-000000000102', 'a0000000-0000-4000-8000-000000000001', 2,
 '{"type":"doc","content":[
    {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Letters beneath the roots"}]},
    {"type":"paragraph","content":[{"type":"text","text":"The tin box was rusted shut, but the letters inside were dry — her brother had wrapped them in waxed paper decades before either of them knew the garden would outlive him."}]},
    {"type":"accordion","attrs":{"open":false,"title":"Excerpt from the third letter"},"content":[
      {"type":"paragraph","content":[{"type":"text","marks":[{"type":"italic"}],"text":"\"If you are reading this, the jasmine has probably taken over the north wall. Let it. Some things are allowed to be unruly.\""}]}
    ]}
 ]}'::jsonb, 34, 1),

('b0000000-0000-4000-8000-000000000103', 'a0000000-0000-4000-8000-000000000001', 2,
 '{"type":"doc","content":[
    {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"What the botanist knew and the sister did not"}]},
    {"type":"paragraph","content":[{"type":"text","text":"Professionally, Mira could name every plant in that garden in Latin. Personally, she could not have told you which ones her brother planted and which had simply arrived, uninvited, the way memory does."}]}
 ]}'::jsonb, 58, 2),

('b0000000-0000-4000-8000-000000000201', 'a0000000-0000-4000-8000-000000000002', 1,
 '{"type":"doc","content":[
    {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"প্রথম কবিতা: ভোরের কুয়াশা"}]},
    {"type":"paragraph","content":[{"type":"text","text":"পদ্মার বুকে কুয়াশা নামে, মাঝির গান থেমে যায় নিঃশব্দে। এই কবিতাটি কবির শৈশবের প্রথম স্মৃতি নিয়ে লেখা।"}]},
    {"type":"bulletList","content":[
      {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"রচনাকাল: শীতকাল, ১৯৭৬"}]}]},
      {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"স্থান: গোয়ালন্দ ঘাট"}]}]}
    ]}
 ]}'::jsonb, 3, 0),

('b0000000-0000-4000-8000-000000000202', 'a0000000-0000-4000-8000-000000000002', 2,
 '{"type":"doc","content":[
    {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"নদীর নাম"}]},
    {"type":"paragraph","content":[{"type":"text","text":"এই অংশে কবি নদীকে একটি চরিত্র হিসেবে উপস্থাপন করেছেন — যার নিজস্ব স্মৃতি, রাগ এবং ক্ষমা আছে।"}]}
 ]}'::jsonb, 19, 1),

('b0000000-0000-4000-8000-000000000301', 'a0000000-0000-4000-8000-000000000003', 1,
 '{"type":"doc","content":[
    {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Chapter 1 — Why certainty is usually a warning sign"}]},
    {"type":"paragraph","content":[{"type":"text","text":"Ferran opens with a simple claim: the more confident a claim sounds, the more scrutiny it has usually "},{"type":"text","marks":[{"type":"bold"}],"text":"not"},{"type":"text","text":" received."}]},
    {"type":"paragraph","content":[{"type":"text","marks":[{"type":"highlight","attrs":{"color":"#fff3a3"}}],"text":"Key idea: treat strong confidence as a prompt to ask \"compared to what evidence?\", not as evidence itself."}]}
 ]}'::jsonb, 7, 0),

('b0000000-0000-4000-8000-000000000302', 'a0000000-0000-4000-8000-000000000003', 2,
 '{"type":"doc","content":[
    {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"The base-rate trap"}]},
    {"type":"paragraph","content":[{"type":"text","text":"A worked example: a screening test that is 99% accurate can still be wrong more often than right when the underlying condition is rare."}]},
    {"type":"orderedList","content":[
      {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Estimate the base rate before looking at the test result."}]}]},
      {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Update proportionally, not absolutely."}]}]},
      {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Re-check your update against a second, independent signal."}]}]}
    ]}
 ]}'::jsonb, 24, 1),

('b0000000-0000-4000-8000-000000000303', 'a0000000-0000-4000-8000-000000000003', 3,
 '{"type":"doc","content":[
    {"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"A short note on overcorrection"}]},
    {"type":"paragraph","content":[{"type":"text","text":"Skepticism, taken too far, becomes its own kind of certainty. The goal is calibration, not suspicion."}]}
 ]}'::jsonb, null, 2),

('b0000000-0000-4000-8000-000000000401', 'a0000000-0000-4000-8000-000000000004', 1,
 '{"type":"doc","content":[
    {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"প্রথম প্রজন্ম: দাদির চোখে দেশভাগ"}]},
    {"type":"paragraph","content":[{"type":"text","text":"এই অধ্যায়ে লেখিকা তার দাদির মুখে শোনা দেশভাগের স্মৃতিগুলো লিপিবদ্ধ করেছেন — যা ইতিহাসের পাঠ্যবইয়ে পাওয়া যায় না।"}]}
 ]}'::jsonb, 5, 0),

('b0000000-0000-4000-8000-000000000402', 'a0000000-0000-4000-8000-000000000004', 1,
 '{"type":"doc","content":[
    {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"দ্বিতীয় প্রজন্ম: মুক্তিযুদ্ধের দিনগুলো"}]},
    {"type":"paragraph","content":[{"type":"text","text":"লেখিকার মায়ের বর্ণনায় ১৯৭১ সালের কয়েকটি টানটান সপ্তাহ।"}]}
 ]}'::jsonb, 41, 1)

on conflict (id) do nothing;

-- ---- Categories / Collections ---------------------------------------------

insert into categories (id, name, color, banner_image_url, description) values
('c0000000-0000-4000-8000-000000000001', 'Favorite Quotes', '#a4501f', 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800', 'Short passages worth returning to, gathered from across every book on the shelf.'),
('c0000000-0000-4000-8000-000000000002', 'প্রিয় পঙক্তি (Bangla Poetry)', '#1e6b3a', 'https://images.unsplash.com/photo-1519098901909-b1553a1190af?w=800', 'বাংলা কবিতার নির্বাচিত অংশ।'),
('c0000000-0000-4000-8000-000000000003', 'Reasoning & Reflection', '#1c4fa1', null, 'Passages about how to think, not just what to think.')
on conflict (id) do nothing;

insert into category_headings (category_id, heading_id) values
('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000101'),
('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000102'),
('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000201'),
('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000202'),
('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000301'),
('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000303')
on conflict do nothing;

-- ---- Draft space (admin scratch space) -------------------------------------

insert into draft_folders (id, name, parent_folder_id) values
('d0000000-0000-4000-8000-000000000001', 'Book proposals to review', null),
('d0000000-0000-4000-8000-000000000002', 'Quick highlights', null)
on conflict (id) do nothing;

insert into drafts (id, folder_id, title, content) values
('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Possible next acquisition: river-town memoirs',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A reader recommended two memoirs set along the Padma — worth requesting review copies."}]}]}'::jsonb),
('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 'Line to revisit from Ferran, ch. 4',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"\"Calibration, not suspicion\" — good pull-quote for the Reasoning collection banner."}]}]}'::jsonb)
on conflict (id) do nothing;

-- ---- Sample contact messages -------------------------------------------------

insert into messages (guest_name, message, contact_method, contact_value, read) values
('Tanvir Ahmed', 'Would you consider adding an RSS feed for new headings? I''d love to follow updates without checking manually.', 'email', 'tanvir.reads@example.com', false),
('Sara Chowdhury', 'নদীর কাব্য বইটার আরও কবিতা যোগ করার পরিকল্পনা আছে কি?', 'whatsapp', '+8801700000000', true)
on conflict do nothing;

-- ---- Sample analytics events (coarse, no PII) -------------------------------

insert into analytics_events (event_type, target_type, target_id, anon_visitor_id, created_at)
select
  (array['view','view','view','interact'])[1 + floor(random()*4)],
  t.target_type,
  t.target_id,
  '2024-demo-visitor-' || (1 + floor(random()*40))::text,
  now() - (floor(random()*30) || ' days')::interval
from (
  values
    ('book', 'a0000000-0000-4000-8000-000000000001'),
    ('book', 'a0000000-0000-4000-8000-000000000002'),
    ('book', 'a0000000-0000-4000-8000-000000000003'),
    ('heading', 'b0000000-0000-4000-8000-000000000101'),
    ('heading', 'b0000000-0000-4000-8000-000000000102'),
    ('heading', 'b0000000-0000-4000-8000-000000000301'),
    ('category', 'c0000000-0000-4000-8000-000000000001')
) as t(target_type, target_id)
cross join generate_series(1, 15)
on conflict do nothing;

-- ============================================================================
-- Done. Verify counts:
--   select 'books', count(*) from books
--   union all select 'headings', count(*) from headings
--   union all select 'categories', count(*) from categories;
-- ============================================================================