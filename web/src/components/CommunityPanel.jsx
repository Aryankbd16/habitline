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
  const search = () =>
    social('/search?username=' + encodeURIComponent(query.trim().toLowerCase())).then(({ people }) => setResults(people))
  const accept = (id, accept) => resource.run(() => social('/friends/' + id, 'PATCH', { accept }))

  return (
    <div className="space-y-6">
      <ResourceStatus resource={resource} />
      {contacts && (
        <>
          {/* Social Profile Form */}
          <form
            className={panel}
            onSubmit={async (event) => {
              event.preventDefault()
              if (await resource.run(() => social('/profile', 'PUT', profile))) setDraft(null)
            }}
          >
            <h2 className="font-extrabold text-xl text-[var(--text-main)] tracking-tight">Social profile</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
                Username
                <input
                  className={control}
                  required
                  minLength={3}
                  maxLength={24}
                  pattern="[a-z0-9_]{3,24}"
                  value={profile.username}
                  onChange={(event) => update('username', event.target.value)}
                  placeholder="e.g., alex_dev"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
                Profile visibility
                <select
                  className={control}
                  value={profile.visibility}
                  onChange={(event) => update('visibility', event.target.value)}
                >
                  <option value="private">Private details</option>
                  <option value="friends">Friends</option>
                  <option value="public">Registered users</option>
                </select>
              </label>
            </div>
            <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
              Bio
              <textarea
                className={`${control} resize-none`}
                rows={2}
                maxLength={220}
                value={profile.bio}
                onChange={(event) => update('bio', event.target.value)}
                placeholder="A short note about your routines or focus..."
              />
            </label>
            <div className="flex flex-wrap gap-4 pt-1">
              {[
                ['discoverable', 'Appear in username search'],
                ['showXp', 'Share XP and rankings'],
                ['showAwards', 'Allow achievement sharing'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-xs font-semibold text-[var(--text-main)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile[key]}
                    onChange={(event) => update(key, event.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <button className={primary} disabled={resource.working}>
              Save social profile
            </button>
          </form>

          {/* Find People */}
          {profileResult.profile && (
            <section className={panel}>
              <h2 className="font-extrabold text-xl text-[var(--text-main)] tracking-tight">Find people</h2>
              <form
                className="flex flex-wrap gap-2.5"
                onSubmit={(event) => {
                  event.preventDefault()
                  setView(null)
                  resource.run(search)
                }}
              >
                <input
                  className={`${control} flex-1 min-w-[200px]`}
                  aria-label="Find by username"
                  minLength={2}
                  maxLength={24}
                  required
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Enter username..."
                />
                <button className={action} disabled={resource.working}>
                  Search people
                </button>
              </form>

              {results?.length === 0 && (
                <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium py-2">
                  No discoverable users matched.
                </p>
              )}

              {results?.map((person) => (
                <div
                  key={person.id}
                  className="flex flex-wrap gap-2.5 items-center justify-between p-3.5 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)]"
                >
                  <PersonLabel person={person} />
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={action}
                      onClick={() =>
                        resource.run(async () => setView((await social('/profiles/' + person.id)).profile))
                      }
                    >
                      View profile
                    </button>
                    <button
                      className={action}
                      disabled={resource.working || contacts.contacts.some(({ id }) => id === person.id)}
                      onClick={() => resource.run(() => social('/friends/' + person.id, 'POST'))}
                    >
                      Send request
                    </button>
                    <button
                      className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/20 cursor-pointer disabled:opacity-40"
                      disabled={resource.working}
                      onClick={() =>
                        resource.run(async () => {
                          await social('/blocks/' + person.id, 'PUT')
                          setView(null)
                          setResults(results.filter(({ id }) => id !== person.id))
                        })
                      }
                    >
                      Block
                    </button>
                  </div>
                </div>
              ))}

              {view && (
                <div className="border rounded-2xl border-[var(--border-color)] bg-[var(--bg-surface-elevated)] p-4 space-y-2 mt-3">
                  <PersonLabel person={view} />
                  {view.bio && <p className="text-xs text-[var(--text-muted)]">{view.bio}</p>}
                  {view.level && (
                    <p className="text-xs font-bold text-[var(--accent)] font-mono-num">
                      Level {view.level}
                      {view.xp !== undefined && ' · ' + view.xp + ' XP'}
                    </p>
                  )}
                  {view.achievements.map((award, index) => (
                    <p key={index} className="text-xs font-semibold text-[var(--text-main)]">
                      {award.title}
                    </p>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Friends & Requests */}
          <section className={panel}>
            <h2 className="font-extrabold text-xl text-[var(--text-main)] tracking-tight">Friends and requests</h2>
            {!contacts.contacts.length && (
              <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium py-2">
                No friends or pending requests.
              </p>
            )}

            <div className="space-y-2.5">
              {contacts.contacts.map((person) => (
                <div
                  key={person.id}
                  className="flex flex-wrap gap-2.5 items-center justify-between p-3.5 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)]"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <PersonLabel person={person} />
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--bg-surface)] text-[var(--text-subtle)] border border-[var(--border-color)] font-mono-num">
                      {person.state === 'accepted' ? 'Friend' : person.outgoing ? 'Sent' : 'Incoming'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {person.state === 'pending' && !person.outgoing ? (
                      <>
                        <button className={primary} disabled={resource.working} onClick={() => accept(person.id, true)}>
                          Accept request
                        </button>
                        <button className={action} disabled={resource.working} onClick={() => accept(person.id, false)}>
                          Reject request
                        </button>
                      </>
                    ) : (
                      <button
                        className={action}
                        disabled={resource.working}
                        onClick={() => resource.run(() => social('/friends/' + person.id, 'DELETE'))}
                      >
                        {person.outgoing && person.state === 'pending' ? 'Cancel request' : 'Remove friend'}
                      </button>
                    )}
                    <button
                      className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/20 cursor-pointer disabled:opacity-40"
                      disabled={resource.working}
                      onClick={() => resource.run(() => social('/blocks/' + person.id, 'PUT'))}
                    >
                      Block
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {contacts.blocks.length > 0 && (
              <div className="pt-4 border-t border-[var(--border-color)] space-y-2">
                <h3 className="font-bold text-xs text-[var(--text-subtle)] uppercase tracking-wider">
                  Blocked accounts
                </h3>
                {contacts.blocks.map((person) => (
                  <div key={person.id} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-[var(--bg-surface-elevated)]">
                    <span className="font-mono-num font-bold">@{person.username}</span>
                    <button
                      className={action}
                      disabled={resource.working}
                      onClick={() => resource.run(() => social('/blocks/' + person.id, 'DELETE'))}
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Groups() {
  const { user } = useAuth()
  const resource = useResource(loadGroups)
  const [listed, contacts] = resource.data || []
  const [groupId, setGroupId] = useState('')
  const [draft, setDraft] = useState(null)
  const [invite, setInvite] = useState('')
  const load = useCallback(() => (groupId ? social('/groups/' + groupId) : Promise.resolve({ group: null })), [
    groupId,
  ])
  const details = useResource(load)
  const group = details.data?.group?.id === groupId ? details.data.group : null
  const mutate = (path, method, body) =>
    resource.run(async () => {
      await social(path, method, body)
      details.refresh()
    })
  const manage = group && group.role !== 'member'
  const owner = group?.role === 'owner'
  const send = async (event) => {
    event.preventDefault()
    if (await mutate('/groups' + (draft.id ? '/' + draft.id : ''), draft.id ? 'PATCH' : 'POST', draft)) setDraft(null)
  }

  return (
    <div className="space-y-6">
      <ResourceStatus resource={resource} />

      {/* Private Groups List */}
      <section className={panel}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-extrabold text-xl text-[var(--text-main)] tracking-tight">Private groups</h2>
          <button className={primary} onClick={() => setDraft({ name: '', description: '' })}>
            New group
          </button>
        </div>

        {listed?.groups.length === 0 && (
          <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium py-2">
            Start a private group or accept an invitation from a friend.
          </p>
        )}

        <div className="space-y-2.5">
          {listed?.groups.map((item) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2.5 p-3.5 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)]"
              key={item.id}
            >
              <strong className="text-sm font-bold text-[var(--text-main)]">{item.name}</strong>
              <div className="flex flex-wrap gap-2">
                {item.state === 'active' ? (
                  <button
                    className={action}
                    onClick={() => {
                      setInvite('')
                      setGroupId(item.id)
                    }}
                  >
                    Open group
                  </button>
                ) : (
                  <>
                    <button
                      className={primary}
                      disabled={resource.working}
                      onClick={() => mutate('/groups/' + item.id + '/invitation', 'PATCH', { accept: true })}
                    >
                      Accept group invite
                    </button>
                    <button
                      className={action}
                      disabled={resource.working}
                      onClick={() => mutate('/groups/' + item.id + '/invitation', 'PATCH', { accept: false })}
                    >
                      Decline invite
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Draft Modal/Form */}
      {draft && (
        <form className={panel} onSubmit={send}>
          <h3 className="font-extrabold text-lg text-[var(--text-main)] tracking-tight">
            {draft.id ? 'Edit group' : 'Create private group'}
          </h3>
          <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
            Group name
            <input
              className={control}
              required
              maxLength={80}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="e.g., Focus Circle"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
            Group description
            <textarea
              className={`${control} resize-none`}
              rows={2}
              maxLength={500}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              placeholder="What are the group's goals?"
            />
          </label>
          <div className="flex gap-2.5 pt-2">
            <button className={primary} disabled={resource.working}>
              Save group
            </button>
            <button type="button" className={action} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {groupId && <ResourceStatus resource={details} />}

      {/* Active Group Details */}
      {group && (
        <section className={panel}>
          <div className="border-b border-[var(--border-color)] pb-4 space-y-1">
            <h3 className="font-extrabold text-lg sm:text-xl text-[var(--text-main)] tracking-tight">
              {group.name} · {group.role}
            </h3>
            {group.description && (
              <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium leading-relaxed">
                {group.description}
              </p>
            )}
            <p className="text-xs text-[var(--text-subtle)] font-medium pt-1">
              Find shared progress in Rankings by selecting this group, or open Challenges to see its invitations.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {manage && (
              <button
                className={action}
                onClick={() =>
                  setDraft({ id: group.id, name: group.name, description: group.description })
                }
              >
                Edit group
              </button>
            )}
            <button
              className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/20 cursor-pointer disabled:opacity-40"
              disabled={resource.working}
              onClick={async () => {
                if (
                  confirm(owner ? 'Delete this group and its associated challenges?' : 'Leave this group?') &&
                  (await mutate('/groups/' + group.id + (owner ? '' : '/members/' + user.id), 'DELETE'))
                )
                  setGroupId('')
              }}
            >
              {owner ? 'Delete group' : 'Leave group'}
            </button>
          </div>

          {manage && (
            <form
              className="flex flex-wrap gap-2.5 pt-2"
              onSubmit={async (event) => {
                event.preventDefault()
                if (await mutate('/groups/' + group.id + '/invite/' + invite, 'POST')) setInvite('')
              }}
            >
              <select
                aria-label="Friend to invite"
                required
                className={`${control} flex-1 min-w-[200px]`}
                value={invite}
                onChange={(event) => setInvite(event.target.value)}
              >
                <option value="">Choose a friend</option>
                {contacts?.contacts
                  .filter((person) => person.state === 'accepted' && !group.members.some(({ id }) => id === person.id))
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName}
                    </option>
                  ))}
              </select>
              <button className={primary} disabled={resource.working || !invite}>
                Invite to group
              </button>
            </form>
          )}

          <div className="space-y-2 pt-2">
            <span className="text-[11px] font-bold text-[var(--text-subtle)] uppercase tracking-wider block mb-1">
              Members ({group.members.length})
            </span>
            {group.members.map((member) => (
              <div
                className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-[var(--bg-surface-elevated)] text-xs"
                key={member.id}
              >
                <div className="flex items-center gap-2">
                  <PersonLabel person={member} />
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--bg-surface)] text-[var(--text-subtle)] border border-[var(--border-color)]">
                    {member.state === 'invited' ? 'Invited' : member.role}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {owner && member.role !== 'owner' && member.state === 'active' && (
                    <button
                      className={action}
                      disabled={resource.working}
                      onClick={() =>
                        mutate('/groups/' + group.id + '/members/' + member.id, 'PATCH', {
                          role: member.role === 'admin' ? 'member' : 'admin',
                        })
                      }
                    >
                      {member.role === 'admin' ? 'Remove admin role' : 'Make admin'}
                    </button>
                  )}
                  {member.id !== user.id && member.role !== 'owner' && (owner || (manage && member.role === 'member')) && (
                    <button
                      className="button-press rounded-xl px-2.5 py-1 text-xs font-bold text-rose-400 hover:bg-rose-500/10 cursor-pointer disabled:opacity-40"
                      disabled={resource.working}
                      onClick={() => mutate('/groups/' + group.id + '/members/' + member.id, 'DELETE')}
                    >
                      {member.state === 'invited' ? 'Cancel invitation' : 'Remove member'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
