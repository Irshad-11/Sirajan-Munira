# Sirājan Munīrā (সৃজন মুনীরা)

An imprint of Safeenah — a book-annotation and knowledge-archiving platform.

## Setup

```
unzip sirajan-munira.zip
cd sirajan-munira
npm install
npm run dev
```

Before running, copy `.env.example` to `.env` and fill in your Supabase project's
values (Project Settings → API):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_STORAGE_BUCKET=sirajan-munira-media
```

Then, in the Supabase SQL Editor, run `supabase/schema.sql` once. It creates every
table, Row Level Security policy, the Storage bucket, and a full set of demo
content (books, headings, collections, drafts, messages, analytics rows) so the
app has something to show immediately.

Finally, create your admin account under **Authentication → Users → Add user**
(email + password) — there is no in-app signup by design. Click "Admin Login"
in the site's bottom-right corner (or nav bar) to log in.

## What's demoed out of the box

- 5 books (4 visible, 1 hidden — try toggling it as admin)
- Rich-text findings with headings, blockquotes, an accordion, a bulleted and
  a numbered list, and highlighted text
- 3 collections with headings already assigned
- A draft folder with 2 notes
- 2 sample contact messages (one read, one unread)
- ~100 rows of coarse, no-PII analytics events across the last 30 days

## Project layout

Code is intentionally kept in a small number of dense, feature-grouped files
rather than split into many tiny ones (see `src/lib`, `src/components`,
`src/pages`).

- `src/lib/supabase.ts` — Supabase client, types, and every data-access function
- `src/lib/context.tsx` — admin auth + reader preferences (theme/font/bookmarks)
- `src/lib/richtext.tsx` — read-only rich text renderer + Markdown/plain-text export
- `src/components/Editor.tsx` — the WYSIWYG editor (TipTap) incl. custom accordion
  and annotated-image nodes, and a custom link popup
- `src/components/Layout.tsx` — nav, footer, admin login box, settings panel
- `src/pages/*` — one file per major site section (Bookshelf, BookPage,
  Collections, Drafts, Search, Analytics, Landing, static pages)
- `supabase/schema.sql` — full schema, RLS policies, storage bucket, demo data

## Data export / import

As admin, the Analytics page has an **Export all data (JSON)** button producing
a portable snapshot of every table (Storage file URLs are included inline —
download those separately from Supabase Storage if you need a full offline
mirror), plus a matching **Import JSON** control.

## Notes & known trade-offs

- Site-wide search over heading bodies is a client-side substring scan across
  fetched rows — fine at the intended scale of a single-admin archive; swap in
  a Postgres `tsvector` + GIN index if the heading count grows very large.
- Image annotation is a simple canvas dot-brush merged onto the image and
  stored as a data URL in the heading's content; it is not a full drawing
  suite, in keeping with the SRS's "basic canvas draw/highlight" scope.
- The landing page's 3D book is procedural (Three.js primitives via
  react-three-fiber) rather than a sourced 3D asset — see SRS §7.
