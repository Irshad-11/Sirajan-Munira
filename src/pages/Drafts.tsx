import React, { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Pencil, Trash2, FolderPlus } from 'lucide-react';
import {
  Draft,
  DraftFolder,
  createDraft,
  createDraftFolder,
  deleteDraft,
  deleteDraftFolder,
  listDraftFolders,
  listDrafts,
  renameDraft,
  renameDraftFolder,
  reorderDraftFolders,
  reorderDrafts,
  updateDraft,
} from '../lib/supabase';
import { useAdmin } from '../lib/context';
import { RichEditor } from '../components/Editor';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function DraggableList<T extends { id: string; sort_order: number }>({
  items, renderRow, onReorder,
}: {
  items: T[]; renderRow: (item: T, dragProps: any) => React.ReactNode; onReorder: (orderedIds: string[]) => void;
}) {
  const [order, setOrder] = useState(items);
  const dragId = useRef<string | null>(null);
  useEffect(() => setOrder(items), [items]);

  const onDrop = (targetId: string) => {
    if (!dragId.current || dragId.current === targetId) return;
    const arr = [...order];
    const from = arr.findIndex((i) => i.id === dragId.current);
    const to = arr.findIndex((i) => i.id === targetId);
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    setOrder(arr);
    onReorder(arr.map((i) => i.id));
    dragId.current = null;
  };

  return (
    <>
      {order.map((item) => renderRow(item, {
        draggable: true,
        onDragStart: () => { dragId.current = item.id; },
        onDragOver: (e: React.DragEvent) => e.preventDefault(),
        onDrop: () => onDrop(item.id),
      }))}
    </>
  );
}

export default function Drafts() {
  const { isAdmin, loading } = useAdmin();
  const [folders, setFolders] = useState<DraftFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [titleDraft, setTitleDraft] = useState('');

  const reloadFolders = () => listDraftFolders().then(setFolders);
  const reloadDrafts = (folderId: string | null) => listDrafts(folderId).then(setDrafts);

  useEffect(() => { if (isAdmin) reloadFolders(); }, [isAdmin]);
  useEffect(() => { if (isAdmin) reloadDrafts(activeFolder); }, [isAdmin, activeFolder]);
  useEffect(() => { setTitleDraft(activeDraft?.title || ''); }, [activeDraft?.id]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const addFolder = async () => {
    const name = prompt('Folder name?');
    if (!name) return;
    await createDraftFolder(name, null);
    reloadFolders();
  };

  const renameFolder = async (f: DraftFolder) => {
    const name = prompt('Rename folder', f.name);
    if (!name || name === f.name) return;
    await renameDraftFolder(f.id, name);
    reloadFolders();
  };

  const removeFolder = async (id: string) => {
    if (!confirm('Delete this folder? Notes inside will remain but become unfiled.')) return;
    await deleteDraftFolder(id);
    if (activeFolder === id) setActiveFolder(null);
    reloadFolders();
  };

  const addDraft = async () => {
    const title = prompt('Note title?') || 'Untitled note';
    const d = await createDraft(activeFolder, title);
    reloadDrafts(activeFolder);
    setActiveDraft(d);
  };

  const renameActiveDraft = async () => {
    if (!activeDraft || !titleDraft.trim() || titleDraft === activeDraft.title) return;
    await renameDraft(activeDraft.id, titleDraft.trim());
    setActiveDraft({ ...activeDraft, title: titleDraft.trim() });
    reloadDrafts(activeFolder);
  };

  const saveContent = async (content: any) => {
    if (!activeDraft) return;
    await updateDraft(activeDraft.id, { content });
  };

  const removeDraft = async (id: string) => {
    if (!confirm('Delete this note?')) return;
    await deleteDraft(id);
    if (activeDraft?.id === id) setActiveDraft(null);
    reloadDrafts(activeFolder);
  };

  return (
    <div className="page drafts-page">
      <div className="page-head">
        <h1>Draft space</h1>
        <button className="secondary" onClick={() => setSidebarOpen((s) => !s)}>{sidebarOpen ? '← Collapse' : 'Folders →'}</button>
      </div>
      <div className={`drafts-layout ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
        {sidebarOpen && (
          <aside className="drafts-sidebar">
            <button className="add-note-link icon-row" onClick={addFolder}><FolderPlus size={14} /> New folder</button>
            <ul className="folder-list">
              <li className={activeFolder === null ? 'active' : ''} onClick={() => setActiveFolder(null)}>Unfiled</li>
              <DraggableList
                items={folders}
                onReorder={reorderDraftFolders}
                renderRow={(f, dragProps) => (
                  <li key={f.id} className={activeFolder === f.id ? 'active' : ''} {...dragProps}>
                    <span onClick={() => setActiveFolder(f.id)}>{f.name}</span>
                    <span className="draft-row-actions" style={{ opacity: 1 }}>
                      <button className="tiny" onClick={() => renameFolder(f)}><Pencil size={11} /></button>
                      <button className="tiny danger" onClick={() => removeFolder(f.id)}><Trash2 size={11} /></button>
                    </span>
                  </li>
                )}
              />
            </ul>
          </aside>
        )}
        <section className="drafts-list">
          <button className="add-note-link" onClick={addDraft}>+ New note</button>
          <DraggableList
            items={drafts}
            onReorder={reorderDrafts}
            renderRow={(d, dragProps) => (
              <div key={d.id} className={`draft-row ${activeDraft?.id === d.id ? 'active' : ''}`} {...dragProps}>
                <div className="draft-row-main" onClick={() => setActiveDraft(d)}>
                  <div className="draft-row-title">{d.title}</div>
                  <div className="draft-row-meta">Edited {timeAgo(d.updated_at)}</div>
                </div>
                <div className="draft-row-actions">
                  <button className="tiny danger" onClick={() => removeDraft(d.id)}><Trash2 size={12} /></button>
                </div>
              </div>
            )}
          />
          {drafts.length === 0 && <p className="muted">No notes here yet.</p>}
        </section>
        <section className="draft-editor-pane">
          {activeDraft ? (
            <>
              <input
                className="draft-title-input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={renameActiveDraft}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              <RichEditor content={activeDraft.content} onChange={saveContent} imagePathPrefix={`drafts/${activeDraft.id}`} autosaveKey={`draft-${activeDraft.id}`} placeholder="Quick note…" />
            </>
          ) : (
            <p className="muted">Select or create a note.</p>
          )}
        </section>
      </div>
    </div>
  );
}