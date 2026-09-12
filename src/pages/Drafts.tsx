import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Draft,
  DraftFolder,
  createDraft,
  createDraftFolder,
  deleteDraft,
  deleteDraftFolder,
  listDraftFolders,
  listDrafts,
  updateDraft,
} from '../lib/supabase';
import { useAdmin } from '../lib/context';
import { RichEditor } from '../components/Editor';

export default function Drafts() {
  const { isAdmin, loading } = useAdmin();
  const [folders, setFolders] = useState<DraftFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const reloadFolders = () => listDraftFolders().then(setFolders);
  const reloadDrafts = (folderId: string | null) => listDrafts(folderId).then(setDrafts);

  useEffect(() => { if (isAdmin) reloadFolders(); }, [isAdmin]);
  useEffect(() => { if (isAdmin) reloadDrafts(activeFolder); }, [isAdmin, activeFolder]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const addFolder = async () => {
    const name = prompt('Folder name?');
    if (!name) return;
    await createDraftFolder(name, null);
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
            <button className="secondary full-width" onClick={addFolder}>+ Folder</button>
            <ul className="folder-list">
              <li className={activeFolder === null ? 'active' : ''} onClick={() => setActiveFolder(null)}>Unfiled</li>
              {folders.map((f) => (
                <li key={f.id} className={activeFolder === f.id ? 'active' : ''}>
                  <span onClick={() => setActiveFolder(f.id)}>{f.name}</span>
                  <button className="tiny danger" onClick={() => removeFolder(f.id)}>✕</button>
                </li>
              ))}
            </ul>
          </aside>
        )}
        <section className="drafts-list">
          <button className="primary full-width" onClick={addDraft}>+ New note</button>
          <ul>
            {drafts.map((d) => (
              <li key={d.id} className={activeDraft?.id === d.id ? 'active' : ''}>
                <span onClick={() => setActiveDraft(d)}>{d.title}</span>
                <button className="tiny danger" onClick={() => removeDraft(d.id)}>✕</button>
              </li>
            ))}
            {drafts.length === 0 && <p className="muted">No notes here yet.</p>}
          </ul>
        </section>
        <section className="draft-editor-pane">
          {activeDraft ? (
            <RichEditor content={activeDraft.content} onChange={saveContent} imagePathPrefix={`drafts/${activeDraft.id}`} autosaveKey={`draft-${activeDraft.id}`} placeholder="দ্রুত নোট লিখুন…" />
          ) : (
            <p className="muted">একটি নোট বাছাই করুন বা নতুন তৈরি করুন। / Select or create a note.</p>
          )}
        </section>
      </div>
    </div>
  );
}
