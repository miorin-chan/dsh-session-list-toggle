import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listHeadingCount, sessionVisibility, workspaceVisibility } from '../src/client/attention.ts'
import { updateIdlePages } from '../src/client/idle-page.ts'

const session = (id, fields = {}) => ({ id, updatedAt: 1, running: false, ...fields })
const status = fields => ({ running: false, completionUnread: false, ...fields })

function catalog(sessions, projectionsBySession = {}) {
  return {
    phase: 'ready',
    ids: sessions.map(row => row.id),
    byId: Object.fromEntries(sessions.map(row => [row.id, row])),
    projectionsBySession,
  }
}

test('finds attention rows across the catalog without consulting workspace expansion', () => {
  const list = catalog([
    session('unread', { updatedAt: 10 }),
    session('parent-in-folded-workspace'),
    session('child', { origin: 'subagent', running: true }),
    session('running', { running: true, updatedAt: 2 }),
    session('question', { updatedAt: 3 }),
    session('review', { updatedAt: 4 }),
    session('approval', { running: true, updatedAt: 5 }),
    session('archived', { running: true }),
    session('idle'),
  ], { 'parent-in-folded-workspace': { values: { subagentCatalog: [{ id: 'child' }] } } })
  const statuses = new Map([
    ['unread', status({ completionUnread: true })],
    ['question', status({ pendingInteraction: { kind: 'question' } })],
    ['review', status({ pendingInteraction: { kind: 'plan-review' } })],
    ['approval', status({ running: true, completionUnread: true, pendingInteraction: { kind: 'approval' } })],
  ])

  const workspace = { archivedSessionIds: ['archived'], pinnedSessionIds: [] }
  assert.deepEqual(sessionVisibility(list, statuses, workspace), {
    attention: ['unread', 'parent-in-folded-workspace', 'running', 'question', 'review', 'approval'],
    idle: ['idle'], followUp: 6,
  })
  statuses.set('child', status({ running: false }))
  assert.deepEqual(sessionVisibility(list, statuses, workspace).idle, ['parent-in-folded-workspace', 'idle'])
})

test('keeps the current session through read and focus changes without counting it as idle', () => {
  const list = catalog([
    session('first'),
    session('running', { running: true }),
    session('second'),
  ])
  const workspace = { archivedSessionIds: [], pinnedSessionIds: [] }
  const statuses = new Map([['first', status({ completionUnread: true })]])

  assert.deepEqual(sessionVisibility(list, statuses, workspace, { current: 'first' }), {
    attention: ['first', 'running'], idle: ['second'], followUp: 2,
  })
  statuses.set('first', status({ completionUnread: false }))
  assert.deepEqual(sessionVisibility(list, statuses, workspace, { current: 'first' }), {
    attention: ['first', 'running'], idle: ['second'], followUp: 1,
  })
  assert.deepEqual(sessionVisibility(list, statuses, workspace, { current: 'second' }), {
    attention: ['running', 'second'], idle: ['first'], followUp: 1,
  })
  assert.deepEqual(sessionVisibility(list, statuses, workspace), {
    attention: ['running'], idle: ['first', 'second'], followUp: 1,
  })
  const archived = { ...workspace, archivedSessionIds: ['first'] }
  assert.deepEqual(sessionVisibility(list, statuses, archived, { current: 'first' }), {
    attention: ['first', 'running'], idle: ['second'], followUp: 1,
  })
  assert.deepEqual(sessionVisibility(list, statuses, archived, { current: 'second' }), {
    attention: ['running', 'second'], idle: [], followUp: 1,
  })
})

test('keeps sessions with drafts and drops the draft criterion when the source is absent', () => {
  const list = catalog([
    session('draft'),
    session('new-draft', { blank: true }),
    session('archived'),
    session('subagent', { origin: 'subagent' }),
    session('idle'),
  ])
  const statuses = new Map()
  const workspace = { archivedSessionIds: ['archived'], pinnedSessionIds: [] }
  const drafts = new Set(['draft', 'new-draft', 'archived', 'subagent', 'missing'])

  assert.deepEqual(sessionVisibility(list, statuses, workspace, { drafts }), {
    attention: ['draft', 'new-draft'], idle: ['idle'], followUp: 2,
  })
  assert.deepEqual(sessionVisibility(list, statuses, workspace), {
    attention: [], idle: ['draft', 'idle'], followUp: 0,
  })
})

test('keeps idle pinned sessions and reapplies attention rules when they are unpinned', () => {
  const list = catalog([
    session('idle-pinned'),
    session('running-pinned', { running: true }),
    session('archived-pinned'),
    session('subagent', { origin: 'subagent' }),
    session('draft', { blank: true }),
    session('unpinned'),
  ])
  const statuses = new Map()
  const workspace = {
    archivedSessionIds: ['archived-pinned'],
    pinnedSessionIds: ['idle-pinned', 'running-pinned', 'archived-pinned', 'missing'],
  }

  assert.deepEqual(sessionVisibility(list, statuses, workspace), {
    attention: ['idle-pinned', 'running-pinned'], idle: ['unpinned'], followUp: 1,
  })
  assert.deepEqual(sessionVisibility(list, statuses, { ...workspace, pinnedSessionIds: [] }), {
    attention: ['running-pinned'], idle: ['idle-pinned', 'unpinned'], followUp: 1,
  })
})

test('heading distinguishes total, retained, follow-up, archives and unknown counts', () => {
  const list = catalog([
    session('current', { blank: true }), session('other-blank', { blank: true }), session('idle'),
    session('pinned'), session('unread'), session('archived', { running: true }),
    session('child', { origin: 'subagent', running: true }),
  ])
  const workspace = { phase: 'ready', archivedSessionIds: ['archived'], pinnedSessionIds: ['pinned'] }
  const statuses = new Map([['unread', status({ completionUnread: true })]])
  const visibility = sessionVisibility(list, statuses, workspace, { current: 'current' })
  const heading = (mode, filter = 'default', snapshot = list, state = visibility) =>
    listHeadingCount(mode, snapshot, workspace, filter, 'current', state)

  assert.deepEqual(heading('all'), { key: 'totalCount', value: 4 })
  assert.deepEqual(heading('all', 'show'), { key: 'totalCount', value: 5 })
  assert.deepEqual(heading('attention'), { key: 'retainedCount', value: 3 })
  assert.deepEqual(heading('collapsed'), { key: 'followUpCount', value: 1 })
  assert.deepEqual(heading('attention', 'only'), { key: 'archiveCount', value: 1 })
  assert.equal(heading('collapsed', 'only'), undefined)
  assert.equal(heading('all', 'default', { ...list, phase: 'pending' }), undefined)
  assert.equal(listHeadingCount('all', list, { ...workspace, phase: 'pending' }, 'default', 'current', visibility), undefined)
  assert.deepEqual(heading('all', 'default', catalog([])), { key: 'totalCount', value: 0 })
  const quiet = sessionVisibility(list, new Map(), workspace, { current: 'current' })
  assert.equal(heading('collapsed', 'default', list, quiet), undefined)
})

test('keeps workspaces with attention or previously disclosed idle sessions', () => {
  const items = [
    { workspaceId: 'opened', sessionIds: ['current', 'opened-idle'] },
    { workspaceId: 'untouched', sessionIds: ['untouched-idle'] },
    { workspaceId: 'empty', sessionIds: [] },
  ]
  const idle = ['opened-idle', 'untouched-idle', 'loose-idle']
  const fresh = new Map()
  const initial = workspaceVisibility(items, ['current'], idle, fresh)
  assert.deepEqual([...initial.keptGroups], ['opened', ''])
  assert.deepEqual(initial.groupedIds, ['current'])
  assert.ok(initial.idleGroups.get('opened').has('opened-idle'))
  assert.equal(updateIdlePages(fresh, 'opened', []), fresh)

  const shown = updateIdlePages(fresh, 'opened', ['opened-idle'])
  const afterFocusMoves = workspaceVisibility(items, [], idle, shown)
  assert.deepEqual([...afterFocusMoves.keptGroups], ['opened', ''])
  assert.deepEqual(afterFocusMoves.groupedIds, ['opened-idle'])
  const collapsed = updateIdlePages(shown, 'opened', null)
  assert.equal(collapsed.get('opened'), null)
  const afterCollapse = workspaceVisibility(items, [], idle, collapsed)
  assert.deepEqual([...afterCollapse.keptGroups], ['opened', ''])
  assert.deepEqual(afterCollapse.groupedIds, [])
  assert.deepEqual([...workspaceVisibility(items, [], idle, fresh).keptGroups], [''])
})
