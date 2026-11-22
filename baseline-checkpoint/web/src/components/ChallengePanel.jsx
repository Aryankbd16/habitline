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
  const loadInvitees = useCallback(() => groupId ? social('/groups/' + groupId) : Promise.resolve({ group: null }), [groupId])
  const invitees = useResource(loadInvitees)

  function update(key, value) {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }
  function openNew() {
    setDraft({ scope: 'personal', groupId: '', title: '', description: '', mode: 'count', startDate: today, endDate: addDays(today,13), target: 10, habitIds: [] })
  }
  const send = (path, method, body) => resource.run(() => social('/challenges' + path, method, body === undefined ? undefined : { ...body, timeZone: timezone() }))
  async function save(event) {
    event.preventDefault()
    const path = draft.id ? '/' + draft.id : ''
    const saved = draft.workflow === 'join'
      ? await send(path + '/join', 'PATCH', { accept: true, habitIds: draft.habitIds })
      : draft.workflow === 'links'
        ? await send(path + '/habits', 'PUT', { habitIds: draft.habitIds })
        : await send(path, draft.id ? 'PATCH' : 'POST', { ...draft, target: Number(draft.target) })
    if (saved) setDraft(null)
  }
  return <div className="space-y-4">
    <ResourceStatus resource={resource} />
    <div className="flex flex-wrap justify-between gap-2 items-center">
      <h2 className="text-xl font-bold">Challenges</h2>
      <button className={primary} disabled={!listing || resource.working} onClick={openNew}>New challenge</button>
    </div>
    {listing?.challenges.length === 0 && <p>Set a personal challenge or accept an invitation from a friend or group.</p>}
    {draft && <form className={panel} onSubmit={save}>
      <h3 className="font-bold">{draft.workflow === 'join' ? 'Join challenge' : draft.workflow === 'links' ? 'Change linked habits' : draft.id ? 'Edit challenge' : 'Create challenge'}</h3>
      {!draft.workflow && <>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">Challenge title<input required maxLength={120} className={control} value={draft.title} onChange={(event) => update('title', event.target.value)} /></label>
          <label className="grid gap-1">Scope<select className={control} disabled={Boolean(draft.id)} value={draft.scope} onChange={(event) => update('scope',event.target.value)}><option value="personal">Personal</option><option value="friends">Friends</option><option value="group">Private group</option></select></label>
          {draft.scope === 'group' && !draft.id && <label className="grid gap-1">Group<select required className={control} value={draft.groupId} onChange={(event) => update('groupId',event.target.value)}><option value="">Choose a group</option>{groups?.groups.filter((item) => item.state === 'active' && item.role !== 'member').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          <label className="grid gap-1">Progress measure<select className={control} disabled={Boolean(draft.id)} value={draft.mode} onChange={(event) => setDraft({ ...draft, mode: event.target.value, habitIds: [] })}><option value="count">Completions</option><option value="streak">Consecutive scheduled occurrences</option></select></label>
          <label className="grid gap-1">Target<input className={control} required type="number" min={1} max={10000} value={draft.target} onChange={(event) => update('target',event.target.value)} /></label>
          <label className="grid gap-1">Start date<input className={control} required type="date" value={draft.startDate} onChange={(event) => update('startDate',event.target.value)} /></label>
          <label className="grid gap-1">End date<input className={control} required type="date" min={draft.startDate} value={draft.endDate} onChange={(event) => update('endDate',event.target.value)} /></label>
        </div>
        <label className="grid gap-1">Description<textarea className={control} maxLength={1000} value={draft.description} onChange={(event) => update('description',event.target.value)} /></label>
      </>}
      <fieldset className="space-y-2"><legend className="font-semibold">Your linked habits</legend>
        <p className="text-sm text-[var(--text-muted)]">{draft.mode === 'streak' ? 'Choose one habit.' : 'Choose the habits that contribute to your progress.'}</p>
        {!habits.length && <p className="text-sm">Create a habit before linking it here.</p>}
        <div className="max-h-40 overflow-auto">{habits.map((habit) => <label key={habit.id} className="flex gap-2 items-center">
          <input type="checkbox" checked={draft.habitIds.includes(habit.id)} onChange={(event) => update('habitIds', event.target.checked
            ? draft.mode === 'streak' ? [habit.id] : [...draft.habitIds,habit.id]
            : draft.habitIds.filter((id) => id !== habit.id))} />{habit.name}{habit.isArchived ? ' (archived)' : ''}
        </label>)}</div>
      </fieldset>
      <div className="flex gap-2"><button className={primary} disabled={resource.working}>{draft.workflow === 'join' ? 'Accept challenge' : 'Save challenge'}</button><button type="button" className={action} onClick={() => setDraft(null)}>Cancel</button></div>
    </form>}
    {listing?.challenges.map((item) => <article key={item.id} className={panel}>
      <header><h3 className="text-lg font-bold">{item.title}</h3><p className="text-sm">{item.scope === 'personal' ? 'Personal' : item.scope === 'friends' ? 'Friends' : 'Group'} · {item.startDate} to {item.endDate}{item.archivedOn ? ' · Archived' : item.endDate < today ? ' · Ended' : ''}</p></header>
      {item.description && <p className="whitespace-pre-wrap break-words">{item.description}</p>}
      {item.state === 'invited' ? <div className="flex flex-wrap gap-2">
        <button className={primary} disabled={resource.working || Boolean(item.archivedOn) || item.endDate < today} onClick={() => setDraft({ ...item, workflow: 'join' })}>Choose habits and join</button>
        <button className={action} disabled={resource.working} onClick={() => send('/' + item.id + '/join','PATCH',{ accept: false })}>Decline challenge</button>
      </div> : <>
        <p>{item.value} / {item.target} {item.mode === 'streak' ? 'consecutive occurrences' : 'completions'}{item.complete && ' · Complete'}</p>
        <progress aria-label={item.title + ' progress'} className="w-full accent-[var(--accent)]" value={Math.min(item.value,item.target)} max={item.target} />
        <p className="text-sm text-[var(--text-muted)]">{item.habitIds.map((id) => habits.find((habit) => habit.id === id)?.name).filter(Boolean).join(', ') || 'No linked habits.'}</p>
        {item.ranks.length > 0 && <ol aria-label="Challenge leaderboard" className="space-y-1">{item.ranks.map((person) => <li key={person.id}>{person.rank}. <PersonLabel person={person} /> · {person.value} / {person.target}{person.complete && ' · Complete'}</li>)}</ol>}
        <div className="flex flex-wrap gap-2">
          {item.owner ? <>
            <button className={action} onClick={() => setDraft(item)}>Edit challenge</button>
            <button className={action} disabled={resource.working} onClick={() => send('/' + item.id,'PATCH',{ archived: !item.archivedOn })}>{item.archivedOn ? 'Restore challenge' : 'Archive challenge'}</button>
            {item.scope !== 'personal' && !item.archivedOn && item.endDate >= today && <button className={action} onClick={() => { setFriendId(''); setIndividualTarget(''); setInviteFor(item) }}>Invite participant</button>}
          </> : <>
            <button className={action} disabled={Boolean(item.archivedOn) || item.endDate < today} onClick={() => setDraft({ ...item, workflow: 'links' })}>Edit linked habits</button>
            <button className={action} disabled={resource.working} onClick={() => { if (confirm('Leave this challenge?')) send('/' + item.id + '/participation','DELETE') }}>Leave challenge</button>
          </>}
        </div>
      </>}
    </article>)}
    {inviteFor && <form className={panel} onSubmit={async (event) => { event.preventDefault(); if (await send('/' + inviteFor.id + '/invite/' + friendId,'POST',{ target: individualTarget ? Number(individualTarget) : null })) setInviteFor(null) }}>
      <h3 className="font-bold">Invite to {inviteFor.title}</h3>
      {groupId && <ResourceStatus resource={invitees} />}
      <label className="grid gap-1">Participant<select className={control} required value={friendId} onChange={(event) => setFriendId(event.target.value)}>
        <option value="">Choose a participant</option>
        {(groupId ? invitees.data?.group?.members.filter((member) => member.state === 'active') : friends?.contacts.filter((person) => person.state === 'accepted'))?.filter((person) => !inviteFor.ranks.some(({ id }) => id === person.id)).map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
      </select></label>
      <label className="grid gap-1">Individual target (optional)<input type="number" min="1" max="10000" placeholder={String(inviteFor.target)} className={control} value={individualTarget} onChange={(event) => setIndividualTarget(event.target.value)} /></label>
      <div className="flex gap-2"><button className={primary} disabled={!friendId || resource.working}>Send challenge invitation</button><button type="button" className={action} onClick={() => setInviteFor(null)}>Cancel</button></div>
    </form>}
  </div>
}
