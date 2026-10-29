import { useEffect, useState } from 'react';
import Card from '../../components/common/Card.jsx';
import Button from '../../components/common/Button.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { Tag } from '../../components/common/Badge.jsx';
import { listNotes, createNote, togglePin as togglePinApi, deleteNote as deleteNoteApi } from '../../services/note.service.js';

/** Normalizes the real Note document shape into the row shape the UI renders. */
function normalize(n) {
  return {
    id: n._id,
    title: n.title,
    content: n.contentMarkdown ?? '',
    tags: n.tags || [],
    pinned: n.isPinned ?? false,
  };
}

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    listNotes()
      .then((data) => setNotes(data.map(normalize)))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load notes.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const addNote = async () => {
    if (!draft.trim()) return;
    const title = draft.slice(0, 60);
    setSaving(true);
    setError('');
    try {
      const created = await createNote({ title, contentMarkdown: draft });
      setNotes((prev) => [normalize(created), ...prev]);
      setDraft('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save note.');
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (id) => {
    const prevNotes = notes;
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)));
    try {
      await togglePinApi(id);
    } catch (err) {
      setNotes(prevNotes);
      setError(err.response?.data?.message || 'Failed to update note.');
    }
  };

  const removeNote = async (id) => {
    const prevNotes = notes;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await deleteNoteApi(id);
    } catch (err) {
      setNotes(prevNotes);
      setError(err.response?.data?.message || 'Failed to delete note.');
    }
  };

  const sorted = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Notes</h2>
      <p className="text-gray-400 text-[13.5px] mb-6">Personal notes with markdown support</p>
      <ErrorBanner message={error} onRetry={load} />

      <Card className="p-5 mb-4">
        <textarea className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-primary/60 resize-y min-h-[80px]" placeholder="Write a quick note… (markdown supported)" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <div className="flex justify-end mt-3"><Button onClick={addNote} disabled={saving} className="w-auto px-5">{saving ? 'Saving…' : 'Save note'}</Button></div>
      </Card>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading notes…</p>
      ) : (
        <div className="space-y-3.5">
          {sorted.map((n) => (
            <Card key={n.id} className="p-5">
              <div className="flex items-center gap-2 mb-2">
                {n.pinned && <Tag>📌 Pinned</Tag>}
                {n.tags.map((t) => <Tag key={t}>{t}</Tag>)}
              </div>
              <h3 className="font-bold mb-1.5">{n.title}</h3>
              <p className="text-gray-400 text-[13px] leading-relaxed whitespace-pre-line">{n.content}</p>
              <div className="flex gap-3 mt-2.5">
                <button onClick={() => togglePin(n.id)} className="text-xs text-primary hover:underline">{n.pinned ? 'Unpin' : 'Pin'}</button>
                <button onClick={() => removeNote(n.id)} className="text-xs text-red-400 hover:underline">Delete</button>
              </div>
            </Card>
          ))}
          {sorted.length === 0 && <p className="text-gray-500 text-sm">No notes yet — write your first one above.</p>}
        </div>
      )}
    </div>
  );
}
