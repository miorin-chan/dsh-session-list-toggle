import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sessionVisibility } from '../src/client/attention.ts'

const session = (id, fields = {}) => ({ id, updatedAt: 1, running: false, ...fields })
const status = fields => ({ running: false, completionUnread: false, ...fields })

function catalog(sessions, projectionsBySession = {}) {
  return {
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
    idle: ['idle'],
  })
  statuses.set('child', status({ running: false }))
  assert.deepEqual(sessionVisibility(list, statuses, workspace).idle, ['parent-in-folded-workspace', 'idle'])
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

  assert.deepEqual(sessionVisibility(list, statuses, workspace, drafts), {
    attention: ['draft', 'new-draft'], idle: ['idle'],
  })
  assert.deepEqual(sessionVisibility(list, statuses, workspace), {
    attention: [], idle: ['draft', 'idle'],
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
    attention: ['idle-pinned', 'running-pinned'], idle: ['unpinned'],
  })
  assert.deepEqual(sessionVisibility(list, statuses, { ...workspace, pinnedSessionIds: [] }), {
    attention: ['running-pinned'], idle: ['idle-pinned', 'unpinned'],
  })
})
