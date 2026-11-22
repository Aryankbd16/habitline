import { useEffect, useMemo, useState } from 'react'
import { Link2, Trash2 } from 'lucide-react'
import Modal from './Modal'
import { useHabits } from '../context/HabitsContext'

const TYPES = ['Related', 'Supports', 'Paired']

export default function HabitRelationshipModal({ habit, open, onClose }) {
  const { habits, activeHabits, relationships, addRelationship, removeRelationship } = useHabits()
  const [relatedHabitId, setRelatedHabitId] = useState('')
  const [relationshipType, setRelationshipType] = useState('Related')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) { setRelatedHabitId(''); setRelationshipType('Related'); setError('') }
  }, [open, habit?.id])

  const existing = useMemo(() => relationships.filter((relationship) => relationship.habitId === habit?.id || relationship.relatedHabitId === habit?.id), [relationships, habit?.id])
  const relatedName = (relationship) => habits.find((item) => item.id === (relationship.habitId === habit?.id ? relationship.relatedHabitId : relationship.habitId))?.name || 'Unavailable habit'
  const candidates = activeHabits.filter((item) => item.id !== habit?.id && !existing.some((relationship) => relationship.habitId === item.id || relationship.relatedHabitId === item.id))

  const submit = async (event) => {
    event.preventDefault()
    if (!relatedHabitId) return setError('Choose a habit to connect.')
    setSaving(true); setError('')
    try { await addRelationship(habit.id, relatedHabitId, relationshipType); setRelatedHabitId('') }
    catch (err) { setError(err.message || 'Could not save this relationship.') }
    finally { setSaving(false) }
  }

  if (!habit) return null
  return (
    <Modal open={open} onClose={onClose} title={`Relationships · ${habit.name}`} maxWidth="max-w-lg">
      <div className="space-y-5">
        <p className="text-sm text-[var(--text-muted)]">Connect existing habits for context only. Completing one will never change another.</p>
        {existing.length > 0 && <div className="space-y-2">{existing.map((relationship) => <div key={relationship.id} className="flex items-center gap-3 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] p-3"><Link2 size={16} className="text-[var(--accent)] shrink-0" /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-[var(--text-main)] truncate">{relatedName(relationship)}</p><p className="text-xs text-[var(--text-muted)]">{relationship.relationshipType}</p></div><button type="button" onClick={async () => {
          setError('')
          try { await removeRelationship(relationship.id) } catch (error) { setError(error.message) }
        }} aria-label={`Remove relationship with ${relatedName(relationship)}`} className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/10 cursor-pointer"><Trash2 size={16} /></button></div>)}</div>}
        <form onSubmit={submit} className="space-y-3 border-t border-[var(--border-color)] pt-5">
          <label className="block"><span className="block text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wider mb-1.5">Connect to</span><select value={relatedHabitId} onChange={(event) => setRelatedHabitId(event.target.value)} disabled={!candidates.length} className="w-full bg-[var(--bg-surface-elevated)] text-[var(--text-main)] rounded-xl px-3 py-3 text-sm outline-none border border-[var(--border-color)] focus:border-[var(--accent)] cursor-pointer"><option value="">{candidates.length ? 'Select an existing habit' : 'No remaining habits to connect'}</option>{candidates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="block"><span className="block text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wider mb-1.5">Connection type</span><select value={relationshipType} onChange={(event) => setRelationshipType(event.target.value)} className="w-full bg-[var(--bg-surface-elevated)] text-[var(--text-main)] rounded-xl px-3 py-3 text-sm outline-none border border-[var(--border-color)] focus:border-[var(--accent)] cursor-pointer">{TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
          {error && <p className="text-sm font-semibold text-rose-500">{error}</p>}
          <button type="submit" disabled={!candidates.length || saving} className="w-full bg-[var(--accent)] text-[var(--accent-fg)] font-bold py-3 rounded-xl hover:brightness-110 cursor-pointer disabled:opacity-60">{saving ? 'Saving…' : 'Add relationship'}</button>
        </form>
      </div>
    </Modal>
  )
}
