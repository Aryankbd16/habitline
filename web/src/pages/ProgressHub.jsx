import { useCallback, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { social, timeQuery, useResource } from '../lib/community'
import { shareAward } from '../lib/shareAward'
import { action, control, panel, PersonLabel, ResourceStatus } from '../components/ProgressUI'
import ChallengePanel from '../components/ChallengePanel'
import CommunityPanel from '../components/CommunityPanel'
import { Trophy } from 'lucide-react'

const tabs = ['Overview', 'Challenges', 'People', 'Groups', 'Rankings', 'Activity']

export default function ProgressHub() {
  const [tab, setTab] = useState('Overview')
  return (
    <div className="space-y-8 animate-rise">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-main)]">Progress</h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium mt-1">
            Level up with XP, tackle challenges, and share milestones with friends.
          </p>
        </div>
      </div>

      <nav aria-label="Progress sections" className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
        {tabs.map((label) => (
          <button
            type="button"
            key={label}
            aria-pressed={tab === label}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              tab === label
                ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-xs font-extrabold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-elevated)]'
            }`}
            onClick={() => setTab(label)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'Overview' && <Overview openChallenges={() => setTab('Challenges')} />}
      {tab === 'Challenges' && <ChallengePanel />}
      {(tab === 'People' || tab === 'Groups') && <CommunityPanel key={tab} groups={tab === 'Groups'} />}
      {tab === 'Rankings' && <Rankings />}
      {tab === 'Activity' && <Activity />}
    </div>
  )
}

const loadOverview = () => Promise.all([api('/game?' + timeQuery()), social('/challenges?' + timeQuery())])
function Overview({ openChallenges }) {
  const resource = useResource(loadOverview)
  const [notice, setNotice] = useState('')
  const [game, challenges] = resource.data || []
  return (
    <>
      <ResourceStatus resource={resource} />
      {game && (
        <div className="space-y-6">
          {/* Level & XP Hero Card */}
          <section className="relative overflow-hidden rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 sm:p-8 shadow-xs card-hover">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-10 -bottom-10 h-44 w-44 rounded-full bg-[var(--accent)]/15 blur-3xl"
            />
            <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center font-extrabold text-xl shadow-md shadow-[var(--accent)]/25">
                  <Trophy size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-[var(--text-main)] tracking-tight">Level {game.level}</h2>
                  <p className="text-xs sm:text-sm font-bold text-[var(--accent)] font-mono-num">
                    {game.xp} XP · {game.nextLevelAt - game.xp} XP to level {game.level + 1}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2 mt-4">
              <progress
                aria-label="Progress to next level"
                className="w-full accent-[var(--accent)]"
                value={game.xp - game.threshold}
                max={game.nextLevelAt - game.threshold}
              />
            </div>
            <p className="text-xs text-[var(--text-muted)] font-medium mt-3.5 leading-relaxed">
              XP comes from tracked completions and is separate from habit points. Your longest habit streak is{' '}
              <strong className="text-[var(--text-main)] font-mono-num font-bold">{game.bestStreak}</strong> scheduled occurrences.
            </p>
          </section>

          {/* Challenge progress summary */}
          <section className={panel}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-extrabold text-lg text-[var(--text-main)] tracking-tight">Challenge progress</h2>
              <button onClick={openChallenges} className={action}>
                Manage challenges
              </button>
            </div>
            {!challenges.challenges.length && (
              <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium">No challenges yet.</p>
            )}
            <div className="space-y-2">
              {challenges.challenges
                .filter((item) => item.state === 'active')
                .slice(0, 5)
                .map((item) => (
                  <div key={item.id} className="p-3.5 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] flex items-center justify-between text-xs sm:text-sm font-bold">
                    <span className="text-[var(--text-main)]">{item.title}</span>
                    <span className="font-mono-num text-[var(--accent)]">
                      {item.value} / {item.target}
                    </span>
                  </div>
                ))}
            </div>
          </section>

          {/* Badges & Milestones */}
          <section className={panel}>
            <div>
              <h2 className="font-extrabold text-lg text-[var(--text-main)] tracking-tight">Badges and milestones</h2>
              <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">
                Shared feed posts omit private habit and goal names. An exported card contains the award shown here.
              </p>
            </div>

            {notice && (
              <p role="status" className="p-3.5 rounded-2xl bg-[var(--accent)]/12 border border-[var(--accent)]/30 text-[var(--accent)] text-xs font-bold">
                {notice}
              </p>
            )}

            {!game.achievements.length && (
              <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium py-3">
                Your badges will appear here as you earn them.
              </p>
            )}

            <ul className="divide-y divide-[var(--border-color)]">
              {game.achievements.map((award) => (
                <li
                  key={award.kind + ':' + award.subjectId}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-sm font-bold text-[var(--text-main)]">{award.title}</strong>
                      <time className="text-[11px] font-mono-num font-bold text-[var(--text-subtle)] bg-[var(--bg-surface-elevated)] px-2 py-0.5 rounded-md">
                        {award.earnedOn}
                      </time>
                    </div>
                    <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium mt-0.5">
                      {award.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      className={action}
                      onClick={() => shareAward(award).catch((error) => setNotice(error.message))}
                    >
                      Share card
                    </button>
                    <button
                      className={action}
                      disabled={resource.working}
                      onClick={async () => {
                        setNotice('')
                        if (
                          await resource.run(() =>
                            social('/feed', 'POST', { kind: award.kind, subjectId: award.subjectId })
                          )
                        )
                          setNotice('Achievement shared with friends.')
                      }}
                    >
                      Post to friends
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Recent XP Activity */}
          <section className={panel}>
            <h2 className="font-extrabold text-lg text-[var(--text-main)] tracking-tight">Recent XP activity</h2>
            {!game.activity.length && (
              <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium">Complete a habit to start earning XP.</p>
            )}
            <ul className="space-y-2">
              {game.activity.map((event, index) => (
                <li
                  key={event.at + ':' + index}
                  className="p-3 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] flex items-center justify-between text-xs sm:text-sm"
                >
                  <span className="font-mono-num text-[var(--text-subtle)] font-bold">{event.day}</span>
                  <span className="font-semibold text-[var(--text-main)]">
                    {event.kind === 'award' ? 'Earned' : 'Reversed'}
                  </span>
                  <span
                    className={`font-mono-num font-extrabold ${
                      event.amount > 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {event.amount > 0 ? '+' : ''}
                    {event.amount} XP
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  )
}

const loadGroups = () => social('/groups')
function Rankings() {
  const [period, setPeriod] = useState('week')
  const [group, setGroup] = useState('')
  const groups = useResource(loadGroups)
  const load = useCallback(
    () =>
      social(
        '/leaderboard?' +
          timeQuery() +
          '&period=' +
          period +
          (group ? '&group=' + encodeURIComponent(group) : '')
      ),
    [period, group]
  )
  const resource = useResource(load)
  return (
    <section className={panel}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-extrabold text-xl text-[var(--text-main)] tracking-tight">Leaderboards</h2>
        <div className="flex flex-wrap gap-2.5">
          <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-subtle)] uppercase">
            Period
            <select
              className={control}
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-subtle)] uppercase">
            Circle
            <select
              className={control}
              value={group}
              onChange={(event) => setGroup(event.target.value)}
            >
              <option value="">Friends</option>
              {groups.data?.groups
                .filter((item) => item.state === 'active')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </div>

      <p className="text-xs text-[var(--text-muted)] font-medium leading-relaxed">
        Ranked by net XP this period, with up to 100 XP counted per day. Equal scores share a rank. Other people appear
        only if their privacy settings allow it.
      </p>

      <ResourceStatus resource={groups} />
      <ResourceStatus resource={resource} />

      {resource.data && (
        <div className="space-y-4 pt-2">
          <p className="text-xs font-mono-num font-bold text-[var(--accent)]">
            {resource.data.start} to {resource.data.end}
          </p>

          {!resource.data.ranks.length && (
            <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium py-3">No visible participants.</p>
          )}

          <ul className="space-y-2">
            {resource.data.ranks.map((person) => (
              <li
                key={person.id}
                className="p-4 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] flex items-center justify-between gap-3 text-xs sm:text-sm card-hover"
              >
                <span className="flex items-center gap-2 font-bold text-[var(--text-main)]">
                  <span className="w-6 font-mono-num text-[var(--accent)]">{person.rank}.</span>
                  <PersonLabel person={person} />
                </span>
                <strong className="font-mono-num text-[var(--accent)] text-sm">{person.xp} XP</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

const loadFeed = () => social('/feed')
function Activity() {
  const { user } = useAuth()
  const resource = useResource(loadFeed)
  return (
    <section className={panel}>
      <h2 className="font-extrabold text-xl text-[var(--text-main)] tracking-tight">Friends activity</h2>
      <ResourceStatus resource={resource} />

      {resource.data?.posts.length === 0 && (
        <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium py-4">
          Achievement posts from friends will appear here when they choose to share.
        </p>
      )}

      <ul className="divide-y divide-[var(--border-color)]">
        {resource.data?.posts.map((post) => (
          <li key={post.id} className="space-y-3 py-4">
            <div className="flex items-center justify-between gap-2">
              <PersonLabel person={post.author} />
            </div>
            <p className="text-sm text-[var(--text-main)] font-medium leading-relaxed">{post.caption}</p>
            {post.author.id === user.id ? (
              <button
                className="button-press px-3.5 py-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 text-xs font-bold text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                disabled={resource.working}
                onClick={() => resource.run(() => social('/feed/' + post.id, 'DELETE'))}
              >
                Remove post
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Object.entries(post.reactions).map(([emoji, count]) => (
                  <button
                    key={emoji}
                    aria-pressed={post.ownReaction === emoji}
                    className={`button-press px-3.5 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                      post.ownReaction === emoji
                        ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-transparent shadow-xs'
                        : 'border-[var(--border-color)] bg-[var(--bg-surface-elevated)] text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                    disabled={resource.working}
                    onClick={() =>
                      resource.run(() =>
                        social('/feed/' + post.id + '/reaction', 'PUT', {
                          emoji: post.ownReaction === emoji ? null : emoji,
                        })
                      )
                    }
                  >
                    {emoji} {count}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
