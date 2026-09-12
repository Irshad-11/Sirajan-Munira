import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, Node, Mark } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon,
  List, ListOrdered, Quote, Minus, Link2, Image as ImageIcon, ChevronsDownUp,
} from 'lucide-react';
import type { RichDoc } from '../lib/supabase';
import { uploadImage } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Custom marks: font family / font size (FR-10)
// ---------------------------------------------------------------------------

const FontFamily = Mark.create({
  name: 'fontFamily',
  addAttributes() {
    return { family: { default: null } };
  },
  parseHTML() {
    return [{ style: 'font-family', getAttrs: (v) => ({ family: v }) }];
  },
  renderHTML({ mark }) {
    return ['span', { style: `font-family: ${mark.attrs.family}` }, 0];
  },
});

const FontSize = Mark.create({
  name: 'fontSize',
  addAttributes() {
    return { size: { default: null } };
  },
  parseHTML() {
    return [{ style: 'font-size', getAttrs: (v) => ({ size: v }) }];
  },
  renderHTML({ mark }) {
    return ['span', { style: `font-size: ${mark.attrs.size}` }, 0];
  },
});

// ---------------------------------------------------------------------------
// Custom node: Accordion / collapsible block (FR-5) — usable for any content
// ---------------------------------------------------------------------------

function AccordionView({ node, updateAttributes }: any) {
  return (
    <NodeViewWrapper className="rt-accordion editing" data-open={node.attrs.open}>
      <div className="rt-accordion-head">
        <button
          type="button"
          className="accordion-toggle"
          contentEditable={false}
          onClick={() => updateAttributes({ open: !node.attrs.open })}
        >
          {node.attrs.open ? '▾' : '▸'}
        </button>
        <input
          className="accordion-title-input"
          contentEditable={false}
          value={node.attrs.title}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          placeholder="Section title…"
        />
      </div>
      {node.attrs.open && (
        <NodeViewContent className="rt-accordion-body" />
      )}
    </NodeViewWrapper>
  );
}

const Accordion = Node.create({
  name: 'accordion',
  group: 'block',
  content: 'block+',
  isolating: false,
  defining: true,
  addAttributes() {
    return {
      open: { default: true },
      title: { default: 'Details' },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-accordion]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-accordion': '', ...HTMLAttributes }, 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AccordionView);
  },
  addKeyboardShortcuts() {
    return {
      // FR-8: never let the cursor get trapped — Mod+Enter always escapes the block.
      'Mod-Enter': () => this.editor.commands.exitCode(),
    };
  },
});

// ---------------------------------------------------------------------------
// Custom node: annotated image (FR-9)
// A plain <img> renders the photo; a transparent <canvas> is stacked exactly
// on top of it (same box, via CSS) purely to catch the pen strokes. On save
// the two layers are flattened together onto an offscreen canvas.
// ---------------------------------------------------------------------------

function AnnotatedImageView({ node, updateAttributes }: any) {
  const [annotating, setAnnotating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drawing = useRef(false);
  const [color, setColor] = useState('#ff3b30');
  const [ready, setReady] = useState(false);

  const sizeCanvasToImage = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.naturalWidth) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    setReady(true);
  }, []);

  // Handles both the "image loads while modal is already open" case and the
  // "image was already cached before the modal mounted" case.
  useEffect(() => {
    if (!annotating) {
      setReady(false);
      return;
    }
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth) {
      sizeCanvasToImage();
    }
  }, [annotating, sizeCanvasToImage]);

  const pointerDown = (e: React.PointerEvent) => {
    drawing.current = true;
    draw(e);
  };
  const pointerUp = () => (drawing.current = false);
  const draw = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(x, y, canvas.width * 0.008, 0, Math.PI * 2);
    ctx.fill();
  };

  const saveAnnotation = () => {
    const strokes = canvasRef.current!;
    const img = imgRef.current!;
    const out = document.createElement('canvas');
    out.width = strokes.width;
    out.height = strokes.height;
    const ctx = out.getContext('2d')!;
    try {
      ctx.drawImage(img, 0, 0, out.width, out.height);
      ctx.drawImage(strokes, 0, 0);
      updateAttributes({ annotationSrc: out.toDataURL('image/png') });
      setAnnotating(false);
    } catch (err) {
      alert(
        'Could not save the annotation: the image failed a cross-origin security check. ' +
        'Make sure your Supabase Storage bucket is set to Public (Storage → your bucket → Public), then try again.'
      );
    }
  };

  const clearAnnotation = () => updateAttributes({ annotationSrc: null });
  const setSize = (size: 'small' | 'medium' | 'large') => updateAttributes({ size });

  const displaySrc = node.attrs.annotationSrc || node.attrs.src;

  return (
    <NodeViewWrapper className={`rt-image-node rt-image-${node.attrs.size}`} contentEditable={false}>
      <img src={displaySrc} alt={node.attrs.alt || ''} className="rt-image-preview" crossOrigin="anonymous" />
      <div className="rt-image-toolbar">
        <div className="size-group">
          {(['small', 'medium', 'large'] as const).map((s) => (
            <button key={s} className={node.attrs.size === s ? 'active' : ''} onClick={() => setSize(s)}>
              {s === 'small' ? 'S' : s === 'medium' ? 'M' : 'L'}
            </button>
          ))}
        </div>
        <button onClick={() => setAnnotating(true)}>Annotate</button>
        {node.attrs.annotationSrc && <button onClick={clearAnnotation}>Clear annotation</button>}
      </div>
      {annotating && (
        <div className="annotate-modal-backdrop" onClick={() => setAnnotating(false)}>
          <div className="annotate-modal" onClick={(e) => e.stopPropagation()}>
            <div className="annotate-toolbar">
              {['#ff3b30', '#ffcc00', '#34c759', '#0a84ff'].map((c) => (
                <button
                  key={c}
                  className={`swatch ${c === color ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
              <button onClick={saveAnnotation} className="save-btn" disabled={!ready}>Save</button>
              <button onClick={() => setAnnotating(false)}>Cancel</button>
            </div>
            <div className="annotate-canvas-wrap">
              <img ref={imgRef} src={node.attrs.src} alt="" crossOrigin="anonymous" onLoad={sizeCanvasToImage} />
              <canvas
                ref={canvasRef}
                onPointerDown={pointerDown}
                onPointerMove={draw}
                onPointerUp={pointerUp}
                onPointerLeave={pointerUp}
              />
            </div>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

const AnnotatedImage = Node.create({
  name: 'annotatedImage',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      size: { default: 'medium' },
      annotationSrc: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-annotated-image]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-annotated-image': '', ...HTMLAttributes }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AnnotatedImageView);
  },
});

// ---------------------------------------------------------------------------
// Link popup (FR-6, FR-7 — custom UI instead of browser prompt)
// ---------------------------------------------------------------------------

function LinkPopup({ editor, onClose }: { editor: any; onClose: () => void }) {
  const prev = editor.getAttributes('link');
  const [text, setText] = useState(() => {
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, '');
  });
  const [url, setUrl] = useState(prev.href || '');

  const apply = () => {
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      onClose();
      return;
    }
    const { from, to } = editor.state.selection;
    if (from === to && text) {
      editor.chain().focus().insertContent(`<a href="${url}">${text}</a>`).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    onClose();
  };

  return (
    <div className="link-popup-backdrop" onClick={onClose}>
      <div className="link-popup" onClick={(e) => e.stopPropagation()}>
        <label>
          Text
          <input value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label>
          URL
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoFocus />
        </label>
        <div className="link-popup-actions">
          <button onClick={apply} className="primary">Apply</button>
          <button onClick={onClose} className="secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

const HIGHLIGHT_COLORS = ['#fff3a3', '#ffd6d6', '#d6ffe0', '#d6e8ff', '#f0d6ff'];
// Mid-saturation hues stay legible against both light and dark theme
// backgrounds; "Auto" clears the mark so text falls back to the theme color.
const FONT_COLORS: { label: string; value: string | null }[] = [
  { label: 'Auto', value: null },
  { label: 'Red', value: '#c94f4f' },
  { label: 'Green', value: '#3f9e5e' },
  { label: 'Blue', value: '#3f7fc9' },
  { label: 'Purple', value: '#8f5fc9' },
];
const FONT_FAMILIES = [
  { label: 'Editorial (Lora)', value: 'Lora, serif' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Roboto', value: 'Roboto, sans-serif' },
  { label: 'Bangla (Hind Siliguri)', value: '"Hind Siliguri", sans-serif' },
];

function Toolbar({ editor, imagePathPrefix }: { editor: any; imagePathPrefix: string }) {
  const [showLink, setShowLink] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  if (!editor) return null;

  const insertImage = async (file: File) => {
    const url = await uploadImage(file, imagePathPrefix);
    editor.chain().focus().insertContent({ type: 'annotatedImage', attrs: { src: url, alt: '', size: 'medium' } }).run();
  };

  const btn = (active: boolean) => (active ? 'active' : '');

  return (
    <div className="editor-toolbar">
      <select
        value={editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : editor.isActive('heading', { level: 4 }) ? 'h4' : 'p'}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'p') editor.chain().focus().setParagraph().run();
          else editor.chain().focus().toggleHeading({ level: Number(v[1]) }).run();
        }}
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="h4">Heading 4</option>
      </select>

      <button className={btn(editor.isActive('bold'))} title="Bold" onClick={() => editor.chain().focus().toggleBold().run()}><BoldIcon /></button>
      <button className={btn(editor.isActive('italic'))} title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}><ItalicIcon /></button>
      <button className={btn(editor.isActive('underline'))} title="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon /></button>

      <div className="swatch-group" title="Highlight">
        {HIGHLIGHT_COLORS.map((c) => (
          <button key={c} className="swatch" style={{ background: c }} onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()} />
        ))}
        <button onClick={() => editor.chain().focus().unsetHighlight().run()}>✕</button>
      </div>

      <select
        onChange={(e) => {
          const found = FONT_COLORS.find((c) => c.label === e.target.value);
          if (!found || found.value === null) editor.chain().focus().unsetColor().run();
          else editor.chain().focus().setColor(found.value).run();
        }}
        defaultValue=""
      >
        <option value="" disabled>Color</option>
        {FONT_COLORS.map((f) => <option key={f.label} value={f.label}>{f.label}</option>)}
      </select>

      <select onChange={(e) => editor.chain().focus().extendMarkRange('fontFamily').setMark('fontFamily', { family: e.target.value }).run()} defaultValue="">
        <option value="" disabled>Font</option>
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
      <select onChange={(e) => editor.chain().focus().extendMarkRange('fontSize').setMark('fontSize', { size: e.target.value }).run()} defaultValue="">
        <option value="" disabled>Size</option>
        {['14px', '16px', '18px', '22px', '28px'].map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <button className={btn(editor.isActive('bulletList'))} title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}><List /></button>
      <button className={btn(editor.isActive('orderedList'))} title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered /></button>
      <button className={btn(editor.isActive('blockquote'))} title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote /></button>
      <button title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus /></button>

      <button title="Link" onClick={() => setShowLink(true)}><Link2 /></button>
      <button
        title="Accordion"
        onClick={() => editor.chain().focus().insertContent({ type: 'accordion', attrs: { open: true, title: 'Details' }, content: [{ type: 'paragraph' }] }).run()}
      >
        <ChevronsDownUp />
      </button>
      <button title="Image" onClick={() => fileRef.current?.click()}><ImageIcon /></button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) insertImage(f);
          e.target.value = '';
        }}
      />

      {showLink && <LinkPopup editor={editor} onClose={() => setShowLink(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main editor export
// ---------------------------------------------------------------------------

export function RichEditor({
  content,
  onChange,
  placeholder,
  imagePathPrefix = 'content',
  autosaveKey,
}: {
  content: RichDoc;
  onChange: (doc: RichDoc) => void;
  placeholder?: string;
  imagePathPrefix?: string;
  autosaveKey?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: false }),
      HorizontalRule,
      Placeholder.configure({ placeholder: placeholder || 'Start writing…' }),
      Accordion,
      AnnotatedImage,
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      onChange(json);
      // NFR-5: periodic autosave snapshot to localStorage guards against a crash/refresh.
      if (autosaveKey) {
        try {
          localStorage.setItem(`sm_autosave_${autosaveKey}`, JSON.stringify(json));
        } catch {
          /* storage full — ignore, this is best-effort */
        }
      }
    },
    editorProps: {
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              uploadImage(file, imagePathPrefix).then((url) => {
                const { schema } = view.state;
                const node = schema.nodes.annotatedImage.create({ src: url, alt: '', size: 'medium' });
                view.dispatch(view.state.tr.replaceSelectionWith(node));
              });
              return true;
            }
          }
        }
        return false;
      },
    },
  });

  return (
    <div className="rich-editor">
      <Toolbar editor={editor} imagePathPrefix={imagePathPrefix} />
      <EditorContent editor={editor} className="rt-content editable" />
    </div>
  );
}

export function recoverAutosave(key: string): RichDoc | null {
  try {
    const raw = localStorage.getItem(`sm_autosave_${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearAutosave(key: string) {
  localStorage.removeItem(`sm_autosave_${key}`);
}