import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attentionSessionIds } from '../src/client/attention.ts'

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
  assert.deepEqual(attentionSessionIds(list, statuses, workspace), [
    'unread', 'parent-in-folded-workspace', 'running', 'question', 'review', 'approval',
  ])
  statuses.set('child', status({ running: false }))
  assert.equal(attentionSessionIds(list, statuses, workspace).includes('parent-in-folded-workspace'), false)
})

test('keeps idle pinned sessions and reapplies attention rules when they are unpinned', () => {
  const list = catalog([
    session('idle-pinned'),
    session('running-pinned', { running: true }),
    session('archived-pinned'),
    session('unpinned'),
  ])
  const statuses = new Map()
  const workspace = {
    archivedSessionIds: ['archived-pinned'],
    pinnedSessionIds: ['idle-pinned', 'running-pinned', 'archived-pinned', 'missing'],
  }

  assert.deepEqual(attentionSessionIds(list, statuses, workspace), ['idle-pinned', 'running-pinned'])
  assert.deepEqual(attentionSessionIds(list, statuses, { ...workspace, pinnedSessionIds: [] }), ['running-pinned'])
})
