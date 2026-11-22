import { useCallback, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { social, timeQuery, useResource } from '../lib/community'
import { shareAward } from '../lib/shareAward'
import { action, control, panel, PersonLabel, primary, ResourceStatus } from '../components/ProgressUI'
import ChallengePanel from '../components/ChallengePanel'
import CommunityPanel from '../components/CommunityPanel'

const tabs = ['Overview', 'Challenges', 'People', 'Groups', 'Rankings', 'Activity']

export default function ProgressHub() {
  const [tab, setTab] = useState('Overview')
  return <div className="space-y-5">
    <h1 className="text-3xl font-extrabold">Progress</h1>
    <nav aria-label="Progress sections" className="flex flex-wrap gap-2">
      {tabs.map((label) => <button type="button" key={label} aria-pressed={tab === label} className={tab === label ? primary : action} onClick={() => setTab(label)}>{label}</button>)}
    </nav>
    {tab === 'Overview' && <Overview openChallenges={() => setTab('Challenges')} />}
    {tab === 'Challenges' && <ChallengePanel />}
    {(tab === 'People' || tab === 'Groups') && <CommunityPanel key={tab} groups={tab === 'Groups'} />}
    {tab === 'Rankings' && <Rankings />}
    {tab === 'Activity' && <Activity />}
  </div>
}

const loadOverview = () => Promise.all([api('/game?' + timeQuery()), social('/challenges?' + timeQuery())])
function Overview({ openChallenges }) {
  const resource = useResource(loadOverview)
  const [notice, setNotice] = useState('')
  const [game, challenges] = resource.data || []
  return <><ResourceStatus resource={resource} />{game && <>
    <section className={panel}>
      <h2 className="text-xl font-bold">Level {game.level}</h2>
      <p>{game.xp} XP · {game.nextLevelAt - game.xp} XP to level {game.level + 1}</p>
      <progress aria-label="Progress to next level" className="w-full accent-[var(--accent)]" value={game.xp - game.threshold} max={game.nextLevelAt - game.threshold} />
      <p className="text-sm text-[var(--text-muted)]">XP comes from tracked completions and is separate from habit points. Your longest habit streak is {game.bestStreak} scheduled occurrences.</p>
    </section>
    <section className={panel}>
      <h2 className="font-bold">Challenge progress</h2>
      {!challenges.challenges.length && <p>No challenges yet.</p>}
      {challenges.challenges.filter((item) => item.state === 'active').slice(0, 5).map((item) => <p key={item.id}>{item.title} · {item.value} / {item.target}</p>)}
      <button onClick={openChallenges} className={action}>Manage challenges</button>
    </section>
    <section className={panel}>
      <h2 className="font-bold">Badges and milestones</h2>
      <p className="text-sm text-[var(--text-muted)]">Shared feed posts omit private habit and goal names. An exported card contains the award shown here.</p>
      {notice && <p role="status">{notice}</p>}
      {!game.achievements.length && <p>Your badges will appear here as you earn them.</p>}
      <ul className="divide-y divide-[var(--border-color)]">{game.achievements.map((award) => <li key={award.kind + ':' + award.subjectId} className="py-3 flex flex-wrap justify-between gap-2">
        <div><strong>{award.title}</strong> <time className="text-xs text-[var(--text-muted)]">{award.earnedOn}</time><p className="text-sm">{award.description}</p></div>
        <div className="flex flex-wrap gap-2">
          <button className={action} onClick={() => shareAward(award).catch((error) => setNotice(error.message))}>Share card</button>
          <button className={action} disabled={resource.working} onClick={async () => {
            setNotice('')
            if (await resource.run(() => social('/feed', 'POST', { kind: award.kind, subjectId: award.subjectId }))) setNotice('Achievement shared with friends.')
          }}>Post to friends</button>
        </div>
      </li>)}</ul>
    </section>
    <section className={panel}>
      <h2 className="font-bold">Recent XP activity</h2>
      {!game.activity.length && <p>Complete a habit to start earning XP.</p>}
      <ul className="space-y-1">{game.activity.map((event, index) => <li key={event.at + ':' + index} className="text-sm">{event.day} · {event.kind === 'award' ? 'Earned' : 'Reversed'} · {event.amount > 0 ? '+' : ''}{event.amount} XP</li>)}</ul>
    </section>
  </>}</>
}

const loadGroups = () => social('/groups')
function Rankings() {
  const [period, setPeriod] = useState('week')
  const [group, setGroup] = useState('')
  const groups = useResource(loadGroups)
  const load = useCallback(() => social('/leaderboard?' + timeQuery() + '&period=' + period + (group ? '&group=' + encodeURIComponent(group) : '')), [period, group])
  const resource = useResource(load)
  return <section className={panel}>
    <h2 className="font-bold">Leaderboards</h2>
    <div className="flex flex-wrap gap-3">
      <label>Period <select className={control} value={period} onChange={(event) => setPeriod(event.target.value)}><option value="week">Week</option><option value="month">Month</option></select></label>
      <label>Circle <select className={control} value={group} onChange={(event) => setGroup(event.target.value)}><option value="">Friends</option>{groups.data?.groups.filter((item) => item.state === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    <p className="text-sm text-[var(--text-muted)]">Ranked by net XP this period, with up to 100 XP counted per day. Equal scores share a rank. Other people appear only if their privacy settings allow it.</p>
    <ResourceStatus resource={groups} /><ResourceStatus resource={resource} />
    {resource.data && <><p>{resource.data.start} to {resource.data.end}</p>
      {!resource.data.ranks.length && <p>No visible participants.</p>}
      <ul className="space-y-2">{resource.data.ranks.map((person) => <li key={person.id} className="flex justify-between gap-2"><span>{person.rank}. <PersonLabel person={person} /></span><strong>{person.xp} XP</strong></li>)}</ul></>}
  </section>
}

const loadFeed = () => social('/feed')
function Activity() {
  const { user } = useAuth()
  const resource = useResource(loadFeed)
  return <section className={panel}>
    <h2 className="font-bold">Friends activity</h2>
    <ResourceStatus resource={resource} />
    {resource.data?.posts.length === 0 && <p>Achievement posts from friends will appear here when they choose to share.</p>}
    <ul className="divide-y divide-[var(--border-color)]">{resource.data?.posts.map((post) => <li key={post.id} className="space-y-2 py-3">
      <PersonLabel person={post.author} /><p>{post.caption}</p>
      {post.author.id === user.id ? <button className={action} disabled={resource.working} onClick={() => resource.run(() => social('/feed/' + post.id, 'DELETE'))}>Remove post</button> : <div className="flex flex-wrap gap-2">{Object.entries(post.reactions).map(([emoji, count]) => <button key={emoji} aria-pressed={post.ownReaction === emoji} className={post.ownReaction === emoji ? primary : action} disabled={resource.working} onClick={() => resource.run(() => social('/feed/' + post.id + '/reaction', 'PUT', { emoji: post.ownReaction === emoji ? null : emoji }))}>{emoji} {count}</button>)}</div>}
    </li>)}</ul>
  </section>
}
