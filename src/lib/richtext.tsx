import React, { useState } from 'react';
import type { RichDoc } from './supabase';

// ---------------------------------------------------------------------------
// Clipboard — with a fallback for browsers/contexts where the async
// Clipboard API is unavailable or blocked (non-HTTPS, missing permission).
// ---------------------------------------------------------------------------

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error('clipboard api unavailable');
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Plain text / markdown extraction (FR-21, FR-26)
// ---------------------------------------------------------------------------

export function docToPlainText(doc: RichDoc): string {
  if (!doc) return '';
  let out = '';
  const walk = (node: any) => {
    if (!node) return;
    if (node.type === 'text' && node.text) out += node.text;
    if (Array.isArray(node.content)) node.content.forEach(walk);
    if (node.type === 'paragraph' || node.type?.match(/heading/)) out += ' ';
  };
  walk(doc);
  return out.replace(/\s+/g, ' ').trim();
}

// First line/sentence only — used for collapsed heading previews and the
// book-page sidebar list, so a reader can tell headings apart at a glance.
export function firstLineOf(doc: RichDoc, maxLen = 90): string {
  const text = docToPlainText(doc);
  const cut = text.split(/(?<=[.!?।])\s/)[0] || text;
  return cut.length > maxLen ? `${cut.slice(0, maxLen).trim()}…` : cut;
}

function marksToMd(text: string, marks: any[] = []): string {
  let t = text;
  const has = (name: string) => marks.some((m) => m.type === name);
  if (has('code')) t = `\`${t}\``;
  if (has('bold')) t = `**${t}**`;
  if (has('italic')) t = `*${t}*`;
  if (has('underline')) t = `<u>${t}</u>`;
  const link = marks.find((m) => m.type === 'link');
  if (link?.attrs?.href) t = `[${t}](${link.attrs.href})`;
  return t;
}

export function docToMarkdown(doc: RichDoc): string {
  if (!doc) return '';
  const lines: string[] = [];

  const inline = (content: any[] = []): string => content.map((n) => (n.type === 'text' ? marksToMd(n.text, n.marks) : '')).join('');

  const block = (node: any, depth = 0) => {
    if (!node) return;
    switch (node.type) {
      case 'doc':
        (node.content || []).forEach((c: any) => block(c, depth));
        break;
      case 'heading': {
        const level = node.attrs?.level || 1;
        lines.push(`${'#'.repeat(level)} ${inline(node.content)}`);
        break;
      }
      case 'paragraph':
        lines.push(inline(node.content));
        break;
      case 'blockquote':
        (node.content || []).forEach((c: any) => lines.push(`> ${inline(c.content)}`));
        break;
      case 'bulletList':
        (node.content || []).forEach((li: any) =>
          (li.content || []).forEach((c: any) => lines.push(`- ${inline(c.content)}`))
        );
        break;
      case 'orderedList':
        (node.content || []).forEach((li: any, i: number) =>
          (li.content || []).forEach((c: any) => lines.push(`${i + 1}. ${inline(c.content)}`))
        );
        break;
      case 'horizontalRule':
        lines.push('---');
        break;
      case 'accordion':
        lines.push(`<details><summary>${node.attrs?.title || 'Details'}</summary>`);
        (node.content || []).forEach((c: any) => block(c, depth));
        lines.push('</details>');
        break;
      case 'annotatedImage':
        lines.push(`![${node.attrs?.alt || ''}](${node.attrs?.src || ''})`);
        break;
      default:
        if (Array.isArray(node.content)) node.content.forEach((c: any) => block(c, depth));
    }
  };

  block(doc);
  return lines.filter((l) => l.length > 0).join('\n\n');
}

// ---------------------------------------------------------------------------
// Image lightbox (FR-9: desktop off-canvas drawer, mobile fullscreen modal)
// ---------------------------------------------------------------------------

const ImageLightboxContext = React.createContext<(src: string, alt?: string) => void>(() => {});

export function useImageLightbox() {
  return React.useContext(ImageLightboxContext);
}

export function ImageLightboxProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<{ src: string; alt?: string } | null>(null);
  const open = (src: string, alt?: string) => setActive({ src, alt });
  return (
    <ImageLightboxContext.Provider value={open}>
      {children}
      {active && (
        <div className="lightbox-backdrop" onClick={() => setActive(null)}>
          <div className="lightbox-panel" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setActive(null)} aria-label="Close">
              ✕
            </button>
            <img src={active.src} alt={active.alt || ''} />
          </div>
        </div>
      )}
    </ImageLightboxContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Read-only renderer
// ---------------------------------------------------------------------------

function Inline({ content }: { content: any[] }) {
  return (
    <>
      {(content || []).map((n, i) => {
        if (n.type !== 'text') return null;
        let el: React.ReactNode = n.text;
        (n.marks || []).forEach((m: any) => {
          if (m.type === 'bold') el = <strong key={m.type}>{el}</strong>;
          if (m.type === 'italic') el = <em key={m.type}>{el}</em>;
          if (m.type === 'underline')
            el = (
              <u key={m.type} style={m.attrs?.color ? { textDecorationColor: m.attrs.color } : undefined}>
                {el}
              </u>
            );
          if (m.type === 'highlight') el = <mark key={m.type} style={{ backgroundColor: m.attrs?.color || '#fff3a3' }}>{el}</mark>;
          if (m.type === 'textStyle' && m.attrs?.color) el = <span key={m.type} style={{ color: m.attrs.color }}>{el}</span>;
          if (m.type === 'link')
            el = (
              <a key={m.type} href={m.attrs?.href} target="_blank" rel="noopener noreferrer" className="rt-link">
                {el}
              </a>
            );
        });
        return <React.Fragment key={i}>{el}</React.Fragment>;
      })}
    </>
  );
}

function Node({ node }: { node: any }): React.ReactElement | null {
  const openLightbox = useImageLightbox();
  if (!node) return null;
  switch (node.type) {
    case 'doc':
      return <>{(node.content || []).map((c: any, i: number) => <Node key={i} node={c} />)}</>;
    case 'heading': {
      const Tag = `h${node.attrs?.level || 2}` as any;
      return React.createElement(Tag, null, <Inline content={node.content} />);
    }
    case 'paragraph':
      return (
        <p>
          <Inline content={node.content} />
        </p>
      );
    case 'blockquote':
      return <blockquote>{(node.content || []).map((c: any, i: number) => <Node key={i} node={c} />)}</blockquote>;
    case 'bulletList':
      return <ul>{(node.content || []).map((c: any, i: number) => <Node key={i} node={c} />)}</ul>;
    case 'orderedList':
      return <ol>{(node.content || []).map((c: any, i: number) => <Node key={i} node={c} />)}</ol>;
    case 'listItem':
      return <li>{(node.content || []).map((c: any, i: number) => <Node key={i} node={c} />)}</li>;
    case 'horizontalRule':
      return <hr />;
    case 'accordion':
      return (
        <details className="rt-accordion" open={!!node.attrs?.open}>
          <summary>{node.attrs?.title || 'Details'}</summary>
          <div className="rt-accordion-body">
            {(node.content || []).map((c: any, i: number) => <Node key={i} node={c} />)}
          </div>
        </details>
      );
    case 'annotatedImage': {
      const size = node.attrs?.size || 'medium';
      const displaySrc = node.attrs?.annotationSrc || node.attrs?.src;
      return (
        <button className={`rt-image rt-image-${size}`} onClick={() => openLightbox(displaySrc, node.attrs?.alt)}>
          <img src={displaySrc} alt={node.attrs?.alt || ''} />
        </button>
      );
    }
    default:
      return null;
  }
}

export function RichTextView({ doc, className }: { doc: RichDoc; className?: string }) {
  if (!doc) return null;
  return (
    <div className={`rt-content ${className || ''}`}>
      <Node node={doc} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auto-advancing image carousel — used for a book's extra detail images and
// for the featured-book card. Center image full size, neighbours peeking at
// the edges; advances on its own and eases between slides.
// ---------------------------------------------------------------------------

export function ImageCarousel({ images, onImageClick, intervalMs = 3500 }: { images: string[]; onImageClick?: (src: string) => void; intervalMs?: number }) {
  const [index, setIndex] = useState(0);

  React.useEffect(() => {
    if (images.length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % images.length), intervalMs);
    return () => clearInterval(t);
  }, [images.length, intervalMs]);

  if (images.length === 0) return null;
  if (images.length === 1) {
    return (
      <button className="carousel-single" onClick={() => onImageClick?.(images[0])}>
        <img src={images[0]} alt="" />
      </button>
    );
  }

  return (
    <div className="carousel">
      <div className="carousel-track">
        {images.map((src, i) => {
          const offset = i - index;
          const wrapped = offset > images.length / 2 ? offset - images.length : offset < -images.length / 2 ? offset + images.length : offset;
          const isCenter = wrapped === 0;
          return (
            <button
              key={src + i}
              className={`carousel-slide ${isCenter ? 'center' : 'peek'}`}
              style={{ transform: `translateX(${wrapped * 62}%) scale(${isCenter ? 1 : 0.8})`, zIndex: isCenter ? 2 : 1, opacity: Math.abs(wrapped) > 1 ? 0 : 1 }}
              onClick={() => (isCenter ? onImageClick?.(src) : setIndex(i))}
            >
              <img src={src} alt="" />
            </button>
          );
        })}
      </div>
      <div className="carousel-dots">
        {images.map((_, i) => (
          <button key={i} className={`carousel-dot ${i === index ? 'active' : ''}`} onClick={() => setIndex(i)} />
        ))}
      </div>
    </div>
  );
}