import React, { useState } from 'react';
import type { RichDoc } from './supabase';

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