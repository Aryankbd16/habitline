import { useCallback, useState } from 'react'
import { useHabits } from '../context/HabitsContext'
import { useToday } from '../lib/useToday'
import { addDays } from '../lib/dateUtils'
import { social, timeQuery, timezone, useResource } from '../lib/community'
import { action, control, panel, PersonLabel, primary, ResourceStatus } from './ProgressUI'

const load = () => Promise.all([social('/challenges?' + timeQuery()), social('/friends'), social('/groups')])

export default function ChallengePanel() {
  const resource = useResource(load)
  const [listing, friends, groups] = resource.data || []
  const { habits } = useHabits()
  const today = useToday()
  const [draft, setDraft] = useState(null)
  const [inviteFor, setInviteFor] = useState(null)
  const [friendId, setFriendId] = useState('')
  const [individualTarget, setIndividualTarget] = useState('')
  const groupId = inviteFor?.groupId
  const loadInvitees = useCallback(
    () => (groupId ? social('/groups/' + groupId) : Promise.resolve({ group: null })),
    [groupId]
  )
  const invitees = useResource(loadInvitees)

  function update(key, value) {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }
  function openNew() {
    setDraft({
      scope: 'personal',
      groupId: '',
      title: '',
      description: '',
      mode: 'count',
      startDate: today,
      endDate: addDays(today, 13),
      target: 10,
      habitIds: [],
    })
  }
  const send = (path, method, body) =>
    resource.run(() =>
      social('/challenges' + path, method, body === undefined ? undefined : { ...body, timeZone: timezone() })
    )
  async function save(event) {
    event.preventDefault()
    const path = draft.id ? '/' + draft.id : ''
    const saved =
      draft.workflow === 'join'
        ? await send(path + '/join', 'PATCH', { accept: true, habitIds: draft.habitIds })
        : draft.workflow === 'links'
        ? await send(path + '/habits', 'PUT', { habitIds: draft.habitIds })
        : await send(path, draft.id ? 'PATCH' : 'POST', { ...draft, target: Number(draft.target) })
    if (saved) setDraft(null)
  }

  return (
    <div className="space-y-6">
      <ResourceStatus resource={resource} />
      <div className="flex flex-wrap justify-between gap-3 items-center">
        <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--text-main)] tracking-tight">Challenges</h2>
        <button className={primary} disabled={!listing || resource.working} onClick={openNew}>
          New challenge
        </button>
      </div>

      {listing?.challenges.length === 0 && (
        <div className="p-8 text-center rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
          <p className="text-sm text-[var(--text-muted)] font-medium">
            Set a personal challenge or accept an invitation from a friend or group.
          </p>
        </div>
      )}

      {draft && (
        <form className={panel} onSubmit={save}>
          <h3 className="font-extrabold text-lg text-[var(--text-main)] tracking-tight">
            {draft.workflow === 'join'
              ? 'Join challenge'
              : draft.workflow === 'links'
              ? 'Change linked habits'
              : draft.id
              ? 'Edit challenge'
              : 'Create challenge'}
          </h3>
          {!draft.workflow && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
                  Challenge title
                  <input
                    required
                    maxLength={120}
                    className={control}
                    value={draft.title}
                    onChange={(event) => update('title', event.target.value)}
                    placeholder="e.g., 30 Days of DSA"
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
                  Scope
                  <select
                    className={control}
                    disabled={Boolean(draft.id)}
                    value={draft.scope}
                    onChange={(event) => update('scope', event.target.value)}
                  >
                    <option value="personal">Personal</option>
                    <option value="friends">Friends</option>
                    <option value="group">Private group</option>
                  </select>
                </label>
                {draft.scope === 'group' && !draft.id && (
                  <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
                    Group
                    <select
                      required
                      className={control}
                      value={draft.groupId}
                      onChange={(event) => update('groupId', event.target.value)}
                    >
                      <option value="">Choose a group</option>
                      {groups?.groups
                        .filter((item) => item.state === 'active' && item.role !== 'member')
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
                  Progress measure
                  <select
                    className={control}
                    disabled={Boolean(draft.id)}
                    value={draft.mode}
                    onChange={(event) => setDraft({ ...draft, mode: event.target.value, habitIds: [] })}
                  >
                    <option value="count">Completions</option>
                    <option value="streak">Consecutive scheduled occurrences</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
                  Target
                  <input
                    className={`${control} font-mono-num font-bold`}
                    required
                    type="number"
                    min={1}
                    max={10000}
                    value={draft.target}
                    onChange={(event) => update('target', event.target.value)}
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
                  Start date
                  <input
                    className={control}
                    required
                    type="date"
                    value={draft.startDate}
                    onChange={(event) => update('startDate', event.target.value)}
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
                  End date
                  <input
                    className={control}
                    required
                    type="date"
                    min={draft.startDate}
                    value={draft.endDate}
                    onChange={(event) => update('endDate', event.target.value)}
                  />
                </label>
              </div>
              <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
                Description
                <textarea
                  className={`${control} resize-none`}
                  rows={2}
                  maxLength={1000}
                  value={draft.description}
                  onChange={(event) => update('description', event.target.value)}
                  placeholder="What is this challenge about?"
                />
              </label>
            </>
          )}

          <fieldset className="p-4 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] space-y-2">
            <legend className="font-bold text-xs text-[var(--text-subtle)] uppercase tracking-wider px-1">
              Your linked habits
            </legend>
            <p className="text-xs text-[var(--text-muted)] font-medium">
              {draft.mode === 'streak'
                ? 'Choose one habit.'
                : 'Choose the habits that contribute to your progress.'}
            </p>
            {!habits.length && (
              <p className="text-xs text-[var(--text-muted)]">Create a habit before linking it here.</p>
            )}
            <div className="max-h-44 overflow-y-auto space-y-2 mt-2">
              {habits.map((habit) => (
                <label
                  key={habit.id}
                  className="flex gap-2.5 items-center text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] p-2 rounded-xl transition cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={draft.habitIds.includes(habit.id)}
                    onChange={(event) =>
                      update(
                        'habitIds',
                        event.target.checked
                          ? draft.mode === 'streak'
                            ? [habit.id]
                            : [...draft.habitIds, habit.id]
                          : draft.habitIds.filter((id) => id !== habit.id)
                      )
                    }
                  />
                  <span>{habit.name}{habit.isArchived ? ' (archived)' : ''}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex gap-2.5 pt-2">
            <button className={primary} disabled={resource.working}>
              {draft.workflow === 'join' ? 'Accept challenge' : 'Save challenge'}
            </button>
            <button type="button" className={action} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {listing?.challenges.map((item) => (
        <article key={item.id} className={panel}>
          <header className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-lg sm:text-xl font-extrabold text-[var(--text-main)] tracking-tight">{item.title}</h3>
              <p className="text-xs font-bold text-[var(--text-subtle)] mt-0.5">
                {item.scope === 'personal' ? 'Personal' : item.scope === 'friends' ? 'Friends' : 'Group'} ·{' '}
                {item.startDate} to {item.endDate}
                {item.archivedOn ? ' · Archived' : item.endDate < today ? ' · Ended' : ''}
              </p>
            </div>
            {item.complete && (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                Complete
              </span>
            )}
          </header>

          {item.description && (
            <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium whitespace-pre-wrap break-words leading-relaxed">
              {item.description}
            </p>
          )}

          {item.state === 'invited' ? (
            <div className="flex flex-wrap gap-2.5 pt-2">
              <button
                className={primary}
                disabled={resource.working || Boolean(item.archivedOn) || item.endDate < today}
                onClick={() => setDraft({ ...item, workflow: 'join' })}
              >
                Choose habits and join
              </button>
              <button
                className={action}
                disabled={resource.working}
                onClick={() => send('/' + item.id + '/join', 'PATCH', { accept: false })}
              >
                Decline challenge
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-[var(--text-main)] font-mono-num">
                  {item.value} / {item.target} {item.mode === 'streak' ? 'consecutive occurrences' : 'completions'}
                  {item.complete && ' · Complete'}
                </p>
                <progress
                  aria-label={item.title + ' progress'}
                  className="w-full accent-[var(--accent)]"
                  value={Math.min(item.value, item.target)}
                  max={item.target}
                />
              </div>

              <p className="text-xs text-[var(--text-muted)] font-medium">
                {item.habitIds
                  .map((id) => habits.find((habit) => habit.id === id)?.name)
                  .filter(Boolean)
                  .join(', ') || 'No linked habits.'}
              </p>

              {item.ranks.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)]">
                  <span className="text-[11px] font-bold text-[var(--text-subtle)] uppercase tracking-wider block mb-2">
                    Challenge Leaderboard
                  </span>
                  <ol aria-label="Challenge leaderboard" className="space-y-1.5 text-xs font-bold">
                    {item.ranks.map((person) => (
                      <li key={person.id} className="flex justify-between items-center text-[var(--text-main)]">
                        <span>
                          <span className="font-mono-num text-[var(--accent)] mr-2">{person.rank}.</span>
                          <PersonLabel person={person} />
                        </span>
                        <span className="font-mono-num text-[var(--text-subtle)]">
                          {person.value} / {person.target}
                          {person.complete && ' · Complete'}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                {item.owner ? (
                  <>
                    <button className={action} onClick={() => setDraft(item)}>
                      Edit challenge
                    </button>
                    <button
                      className={action}
                      disabled={resource.working}
                      onClick={() => send('/' + item.id, 'PATCH', { archived: !item.archivedOn })}
                    >
                      {item.archivedOn ? 'Restore challenge' : 'Archive challenge'}
                    </button>
                    {item.scope !== 'personal' && !item.archivedOn && item.endDate >= today && (
                      <button
                        className={action}
                        onClick={() => {
                          setFriendId('')
                          setIndividualTarget('')
                          setInviteFor(item)
                        }}
                      >
                        Invite participant
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      className={action}
                      disabled={Boolean(item.archivedOn) || item.endDate < today}
                      onClick={() => setDraft({ ...item, workflow: 'links' })}
                    >
                      Edit linked habits
                    </button>
                    <button
                      className={action}
                      disabled={resource.working}
                      onClick={() => {
                        if (confirm('Leave this challenge?')) send('/' + item.id + '/participation', 'DELETE')
                      }}
                    >
                      Leave challenge
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </article>
      ))}

      {inviteFor && (
        <form
          className={panel}
          onSubmit={async (event) => {
            event.preventDefault()
            if (
              await send('/' + inviteFor.id + '/invite/' + friendId, 'POST', {
                target: individualTarget ? Number(individualTarget) : null,
              })
            )
              setInviteFor(null)
          }}
        >
          <h3 className="font-extrabold text-base sm:text-lg text-[var(--text-main)] tracking-tight">
            Invite to {inviteFor.title}
          </h3>
          {groupId && <ResourceStatus resource={invitees} />}
          <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
            Participant
            <select
              className={control}
              required
              value={friendId}
              onChange={(event) => setFriendId(event.target.value)}
            >
              <option value="">Choose a participant</option>
              {(groupId
                ? invitees.data?.group?.members.filter((member) => member.state === 'active')
                : friends?.contacts.filter((person) => person.state === 'accepted')
              )
                ?.filter((person) => !inviteFor.ranks.some(({ id }) => id === person.id))
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
            Custom target (optional)
            <input
              className={control}
              type="number"
              min={1}
              max={10000}
              value={individualTarget}
              onChange={(event) => setIndividualTarget(event.target.value)}
            />
          </label>
          <div className="flex gap-2.5 pt-2">
            <button className={primary} disabled={resource.working || !friendId}>
              Send challenge invitation
            </button>
            <button type="button" className={action} onClick={() => setInviteFor(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
