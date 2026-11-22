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
    if (open) {
      setRelatedHabitId('')
      setRelationshipType('Related')
      setError('')
    }
  }, [open, habit?.id])

  const existing = useMemo(
    () =>
      relationships.filter(
        (relationship) =>
          relationship.habitId === habit?.id || relationship.relatedHabitId === habit?.id
      ),
    [relationships, habit?.id]
  )
  const relatedName = (relationship) =>
    habits.find(
      (item) =>
        item.id ===
        (relationship.habitId === habit?.id
          ? relationship.relatedHabitId
          : relationship.habitId)
    )?.name || 'Unavailable habit'
  const candidates = activeHabits.filter(
    (item) =>
      item.id !== habit?.id &&
      !existing.some(
        (relationship) =>
          relationship.habitId === item.id || relationship.relatedHabitId === item.id
      )
  )

  const submit = async (event) => {
    event.preventDefault()
    if (!relatedHabitId) return setError('Choose a habit to connect.')
    setSaving(true)
    setError('')
    try {
      await addRelationship(habit.id, relatedHabitId, relationshipType)
      setRelatedHabitId('')
    } catch (err) {
      setError(err.message || 'Could not save this relationship.')
    } finally {
      setSaving(false)
    }
  }

  if (!habit) return null

  return (
    <Modal open={open} onClose={onClose} title={`Relationships · ${habit.name}`} maxWidth="max-w-lg">
      <div className="space-y-5">
        <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium leading-relaxed">
          Connect existing habits for context only. Completing one will never change another.
        </p>

        {existing.length > 0 && (
          <div className="space-y-2.5">
            {existing.map((relationship) => (
              <div
                key={relationship.id}
                className="flex items-center gap-3 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] p-3.5 shadow-xs"
              >
                <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center text-[var(--accent)] shrink-0">
                  <Link2 size={16} strokeWidth={2.4} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--text-main)] truncate">
                    {relatedName(relationship)}
                  </p>
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--bg-surface)] text-[var(--text-subtle)] border border-[var(--border-color)] mt-0.5">
                    {relationship.relationshipType}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setError('')
                    try {
                      await removeRelationship(relationship.id)
                    } catch (error) {
                      setError(error.message)
                    }
                  }}
                  aria-label={`Remove relationship with ${relatedName(relationship)}`}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-rose-400 hover:bg-rose-500/15 hover:text-rose-500 transition cursor-pointer shrink-0 border border-transparent hover:border-rose-500/20"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3.5 border-t border-[var(--border-color)] pt-5">
          <label className="block">
            <span className="block text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2">
              Connect to
            </span>
            <select
              value={relatedHabitId}
              onChange={(event) => setRelatedHabitId(event.target.value)}
              disabled={!candidates.length}
              className="w-full bg-[var(--bg-surface-elevated)] text-[var(--text-main)] rounded-2xl px-4 py-3 text-sm outline-none border border-[var(--border-color)] focus:border-[var(--accent)] cursor-pointer font-medium"
            >
              <option value="">
                {candidates.length ? 'Select an existing habit' : 'No remaining habits to connect'}
              </option>
              {candidates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2">
              Connection type
            </span>
            <select
              value={relationshipType}
              onChange={(event) => setRelationshipType(event.target.value)}
              className="w-full bg-[var(--bg-surface-elevated)] text-[var(--text-main)] rounded-2xl px-4 py-3 text-sm outline-none border border-[var(--border-color)] focus:border-[var(--accent)] cursor-pointer font-medium"
            >
              {TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>

          {error && (
            <p className="text-sm font-semibold text-rose-500 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!candidates.length || saving}
            className="button-press w-full bg-[var(--accent)] text-[var(--accent-fg)] font-extrabold py-3.5 rounded-2xl hover:brightness-110 cursor-pointer disabled:opacity-60 transition shadow-lg shadow-[var(--accent)]/20 text-sm mt-2"
          >
            {saving ? 'Saving…' : 'Add relationship'}
          </button>
        </form>
      </div>
    </Modal>
  )
}
