import { useCallback, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { social, useResource } from '../lib/community'
import { action, control, panel, PersonLabel, primary, ResourceStatus } from './ProgressUI'

const loadPeople = () => Promise.all([social('/profile'), social('/friends')])
const loadGroups = () => Promise.all([social('/groups'), social('/friends')])
const defaultProfile = { username: '', bio: '', visibility: 'private', discoverable: false, showXp: false, showAwards: false }

export default function CommunityPanel({ groups }) {
  return groups ? <Groups /> : <People />
}

function People() {
  const resource = useResource(loadPeople)
  const [profileResult, contacts] = resource.data || []
  const [draft, setDraft] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [view, setView] = useState(null)
  const profile = draft || profileResult?.profile || defaultProfile
  const update = (key, value) => setDraft({ ...profile, [key]: value })
  const search = () => social('/search?username=' + encodeURIComponent(query.trim().toLowerCase())).then(({ people }) => setResults(people))
  const accept = (id, accept) => resource.run(() => social('/friends/' + id, 'PATCH', { accept }))

  return <div className="space-y-4">
    <ResourceStatus resource={resource} />
    {contacts && <>
      <form className={panel} onSubmit={async (event) => { event.preventDefault(); if (await resource.run(() => social('/profile', 'PUT', profile))) setDraft(null) }}>
        <h2 className="font-bold">Social profile</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">Username<input className={control} required minLength={3} maxLength={24} pattern="[a-z0-9_]{3,24}" value={profile.username} onChange={(event) => update('username', event.target.value)} /></label>
          <label className="grid gap-1">Profile visibility<select className={control} value={profile.visibility} onChange={(event) => update('visibility', event.target.value)}><option value="private">Private details</option><option value="friends">Friends</option><option value="public">Registered users</option></select></label>
        </div>
        <label className="grid gap-1">Bio<textarea className={control} maxLength={220} value={profile.bio} onChange={(event) => update('bio', event.target.value)} /></label>
        <div className="flex flex-wrap gap-4">{[['discoverable', 'Appear in username search'], ['showXp', 'Share XP and rankings'], ['showAwards', 'Allow achievement sharing']].map(([key,label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={profile[key]} onChange={(event) => update(key, event.target.checked)} />{label}</label>)}</div>
        <button className={primary} disabled={resource.working}>Save social profile</button>
      </form>
      {profileResult.profile && <section className={panel}>
        <h2 className="font-bold">Find people</h2>
        <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setView(null); resource.run(search) }}>
          <input className={control} aria-label="Find by username" minLength={2} maxLength={24} required value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className={action} disabled={resource.working}>Search people</button>
        </form>
        {results?.length === 0 && <p>No discoverable users matched.</p>}
        {results?.map((person) => <div key={person.id} className="flex flex-wrap gap-2 items-center">
          <PersonLabel person={person} />
          <button className={action} onClick={() => resource.run(async () => setView((await social('/profiles/' + person.id)).profile))}>View profile</button>
          <button className={action} disabled={resource.working || contacts.contacts.some(({ id }) => id === person.id)} onClick={() => resource.run(() => social('/friends/' + person.id, 'POST'))}>Send request</button>
          <button className={action} disabled={resource.working} onClick={() => resource.run(async () => { await social('/blocks/' + person.id, 'PUT'); setView(null); setResults(results.filter(({ id }) => id !== person.id)) })}>Block</button>
        </div>)}
        {view && <div className="border rounded-xl border-[var(--border-color)] p-3"><PersonLabel person={view} />{view.bio && <p>{view.bio}</p>}{view.level && <p>Level {view.level}{view.xp !== undefined && ' · ' + view.xp + ' XP'}</p>}{view.achievements.map((award,index) => <p key={index}>{award.title}</p>)}</div>}
      </section>}
      <section className={panel}>
        <h2 className="font-bold">Friends and requests</h2>
        {!contacts.contacts.length && <p>No friends or pending requests.</p>}
        {contacts.contacts.map((person) => <div key={person.id} className="flex flex-wrap gap-2 items-center">
          <PersonLabel person={person} /><span className="text-xs">{person.state === 'accepted' ? 'Friend' : person.outgoing ? 'Sent' : 'Incoming'}</span>
          {person.state === 'pending' && !person.outgoing ? <>
            <button className={primary} disabled={resource.working} onClick={() => accept(person.id,true)}>Accept request</button>
            <button className={action} disabled={resource.working} onClick={() => accept(person.id,false)}>Reject request</button>
          </> : <button className={action} disabled={resource.working} onClick={() => resource.run(() => social('/friends/' + person.id,'DELETE'))}>{person.outgoing && person.state === 'pending' ? 'Cancel request' : 'Remove friend'}</button>}
          <button className={action} disabled={resource.working} onClick={() => resource.run(() => social('/blocks/' + person.id,'PUT'))}>Block</button>
        </div>)}
        {contacts.blocks.length > 0 && <h3 className="font-semibold">Blocked accounts</h3>}
        {contacts.blocks.map((person) => <p key={person.id}>@{person.username} <button className={action} disabled={resource.working} onClick={() => resource.run(() => social('/blocks/' + person.id,'DELETE'))}>Unblock</button></p>)}
      </section>
    </>}
  </div>
}

function Groups() {
  const { user } = useAuth()
  const resource = useResource(loadGroups)
  const [listed, contacts] = resource.data || []
  const [groupId, setGroupId] = useState('')
  const [draft, setDraft] = useState(null)
  const [invite, setInvite] = useState('')
  const load = useCallback(() => groupId ? social('/groups/' + groupId) : Promise.resolve({ group: null }), [groupId])
  const details = useResource(load)
  const group = details.data?.group?.id === groupId ? details.data.group : null
  const mutate = (path, method, body) => resource.run(async () => { await social(path,method,body); details.refresh() })
  const manage = group && group.role !== 'member'
  const owner = group?.role === 'owner'
  const send = async (event) => {
    event.preventDefault()
    if (await mutate('/groups' + (draft.id ? '/' + draft.id : ''), draft.id ? 'PATCH' : 'POST', draft)) setDraft(null)
  }
  return <div className="space-y-4">
    <ResourceStatus resource={resource} />
    <section className={panel}>
      <h2 className="font-bold">Private groups</h2>
      <button className={primary} onClick={() => setDraft({ name: '', description: '' })}>New group</button>
      {listed?.groups.length === 0 && <p>Start a private group or accept an invitation from a friend.</p>}
      {listed?.groups.map((item) => <div className="flex flex-wrap items-center gap-2" key={item.id}>
        <strong>{item.name}</strong>
        {item.state === 'active' ? <button className={action} onClick={() => { setInvite(''); setGroupId(item.id) }}>Open group</button> : <>
          <button className={primary} disabled={resource.working} onClick={() => mutate('/groups/' + item.id + '/invitation','PATCH',{ accept: true })}>Accept group invite</button>
          <button className={action} disabled={resource.working} onClick={() => mutate('/groups/' + item.id + '/invitation','PATCH',{ accept: false })}>Decline invite</button>
        </>}
      </div>)}
    </section>
    {draft && <form className={panel} onSubmit={send}>
      <h3 className="font-bold">{draft.id ? 'Edit group' : 'Create private group'}</h3>
      <label className="grid gap-1">Group name<input className={control} required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className="grid gap-1">Group description<textarea className={control} maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <div className="flex gap-2"><button className={primary} disabled={resource.working}>Save group</button><button type="button" className={action} onClick={() => setDraft(null)}>Cancel</button></div>
    </form>}
    {groupId && <ResourceStatus resource={details} />}
    {group && <section className={panel}>
      <h3 className="font-bold">{group.name} · {group.role}</h3><p>{group.description}</p>
      <p className="text-sm text-[var(--text-muted)]">Find shared progress in Rankings by selecting this group, or open Challenges to see its invitations.</p>
      <div className="flex flex-wrap gap-2">
        {manage && <button className={action} onClick={() => setDraft({ id: group.id, name: group.name, description: group.description })}>Edit group</button>}
        <button className={action} disabled={resource.working} onClick={async () => {
          if (confirm(owner ? 'Delete this group and its associated challenges?' : 'Leave this group?') &&
              await mutate('/groups/' + group.id + (owner ? '' : '/members/' + user.id),'DELETE')) setGroupId('')
        }}>{owner ? 'Delete group' : 'Leave group'}</button>
      </div>
      {manage && <form className="flex flex-wrap gap-2" onSubmit={async (event) => {
        event.preventDefault()
        if (await mutate('/groups/' + group.id + '/invite/' + invite,'POST')) setInvite('')
      }}>
        <select aria-label="Friend to invite" required className={control} value={invite} onChange={(event) => setInvite(event.target.value)}>
          <option value="">Choose a friend</option>{contacts?.contacts.filter((person) => person.state === 'accepted' && !group.members.some(({ id }) => id === person.id)).map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
        </select>
        <button className={primary} disabled={resource.working || !invite}>Invite to group</button>
      </form>}
      {group.members.map((member) => <div className="flex flex-wrap items-center gap-2" key={member.id}>
        <PersonLabel person={member} /><span className="text-xs">{member.state === 'invited' ? 'Invited' : member.role}</span>
        {owner && member.role !== 'owner' && member.state === 'active' && <button className={action} disabled={resource.working} onClick={() => mutate('/groups/' + group.id + '/members/' + member.id,'PATCH',{ role: member.role === 'admin' ? 'member' : 'admin' })}>{member.role === 'admin' ? 'Remove admin role' : 'Make admin'}</button>}
        {member.id !== user.id && member.role !== 'owner' && (owner || (manage && member.role === 'member')) && <button className={action} disabled={resource.working} onClick={() => mutate('/groups/' + group.id + '/members/' + member.id,'DELETE')}>{member.state === 'invited' ? 'Cancel invitation' : 'Remove member'}</button>}
      </div>)}
    </section>}
  </div>
}
