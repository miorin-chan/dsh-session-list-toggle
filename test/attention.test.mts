import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listHeadingCount, ordinarySessionIds, sessionVisibility, workspaceVisibility } from '../src/client/attention.ts'
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
  const ids = ordinarySessionIds(list, workspace.archivedSessionIds, 'default', undefined)
  assert.deepEqual(sessionVisibility(list, statuses, workspace, ids), {
    attention: ['unread', 'parent-in-folded-workspace', 'running', 'question', 'review', 'approval'],
    idle: ['idle'], followUp: 6,
  })
  statuses.set('child', status({ running: false }))
  assert.deepEqual(sessionVisibility(list, statuses, workspace, ids).idle, ['parent-in-folded-workspace', 'idle'])
})

test('keeps the current session through read and focus changes without counting it as idle', () => {
  const list = catalog([
    session('first'),
    session('running', { running: true }),
    session('second'),
  ])
  const workspace = { archivedSessionIds: [], pinnedSessionIds: [] }
  const statuses = new Map([['first', status({ completionUnread: true })]])
  const ids = ordinarySessionIds(list, workspace.archivedSessionIds, 'default', 'first')

  assert.deepEqual(sessionVisibility(list, statuses, workspace, ids, { current: 'first' }), {
    attention: ['first', 'running'], idle: ['second'], followUp: 2,
  })
  statuses.set('first', status({ completionUnread: false }))
  assert.deepEqual(sessionVisibility(list, statuses, workspace, ids, { current: 'first' }), {
    attention: ['first', 'running'], idle: ['second'], followUp: 1,
  })
  assert.deepEqual(sessionVisibility(list, statuses, workspace, ids, { current: 'second' }), {
    attention: ['running', 'second'], idle: ['first'], followUp: 1,
  })
  assert.deepEqual(sessionVisibility(list, statuses, workspace, ids), {
    attention: ['running'], idle: ['first', 'second'], followUp: 1,
  })
  const archived = { ...workspace, archivedSessionIds: ['first'] }
  assert.deepEqual(ordinarySessionIds(list, archived.archivedSessionIds, 'default', 'first'), ['running', 'second'])
  const archivedShownIds = ordinarySessionIds(list, archived.archivedSessionIds, 'show', 'first')
  assert.deepEqual(sessionVisibility(list, statuses, archived, archivedShownIds, { current: 'first' }), {
    attention: ['first', 'running'], idle: ['second'], followUp: 1,
  })
  assert.deepEqual(sessionVisibility(list, statuses, archived, archivedShownIds, { current: 'second' }), {
    attention: ['running', 'second'], idle: ['first'], followUp: 1,
  })
})

test('keeps sessions with drafts, drops absent draft criterion, and excludes non-current blank drafts', () => {
  const list = catalog([
    session('draft'),
    session('new-draft', { blank: true }),
    session('stale-blank', { blank: true }),
    session('archived'),
    session('subagent', { origin: 'subagent' }),
    session('idle'),
  ])
  const statuses = new Map()
  const workspace = { archivedSessionIds: ['archived'], pinnedSessionIds: [] }
  const drafts = new Set(['draft', 'new-draft', 'stale-blank', 'archived', 'subagent', 'missing'])

  const ids = ordinarySessionIds(list, workspace.archivedSessionIds, 'default', 'new-draft')
  assert.deepEqual(ids, ['draft', 'new-draft', 'idle'])
  assert.deepEqual(sessionVisibility(list, statuses, workspace, ids, { current: 'new-draft', drafts }), {
    attention: ['draft', 'new-draft'], idle: ['idle'], followUp: 2,
  })
  // While a global panel is open over the blank current session, only a draft keeps it in attention; a quiet blank never becomes idle.
  assert.deepEqual(sessionVisibility(list, statuses, workspace, ids, { current: undefined, drafts }), {
    attention: ['draft', 'new-draft'], idle: ['idle'], followUp: 2,
  })
  assert.deepEqual(sessionVisibility(list, statuses, workspace, ids), {
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
  const ids = ordinarySessionIds(list, workspace.archivedSessionIds, 'default', undefined)

  assert.deepEqual(sessionVisibility(list, statuses, workspace, ids), {
    attention: ['idle-pinned', 'running-pinned'], idle: ['unpinned'], followUp: 1,
  })
  assert.deepEqual(sessionVisibility(list, statuses, { ...workspace, pinnedSessionIds: [] }, ids), {
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
  const heading = (mode, filter = 'default', snapshot = list, ready = snapshot.phase === 'ready' && workspace.phase === 'ready') => {
    const ids = ordinarySessionIds(snapshot, workspace.archivedSessionIds, filter, 'current')
    const visibility = filter === 'only' ? undefined : sessionVisibility(snapshot, statuses, workspace, ids, { current: 'current' })
    return listHeadingCount(mode, ready, filter, ids, visibility)
  }

  assert.deepEqual(heading('all'), { key: 'totalCount', value: 4 })
  assert.deepEqual(heading('all', 'show'), { key: 'totalCount', value: 5 })
  assert.deepEqual(heading('attention'), { key: 'retainedCount', value: 3 })
  assert.deepEqual(heading('collapsed'), { key: 'followUpCount', value: 1 })
  assert.deepEqual(heading('attention', 'only'), { key: 'archiveCount', value: 1 })
  assert.equal(heading('collapsed', 'only'), undefined)
  assert.equal(heading('all', 'default', { ...list, phase: 'pending' }), undefined)
  assert.equal(heading('all', 'default', list, false), undefined)
  assert.deepEqual(heading('all', 'default', catalog([])), { key: 'totalCount', value: 0 })
  assert.deepEqual(heading('attention', 'only', catalog([])), { key: 'archiveCount', value: 0 })
  const quiet = sessionVisibility(list, new Map(), workspace, ordinarySessionIds(list, workspace.archivedSessionIds, 'default', 'current'), { current: 'current' })
  assert.equal(listHeadingCount('collapsed', true, 'default', [], quiet), undefined)
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

test('switching from New Session to watched vs non-watched session keeps counts and groups aligned with ordinary rows', () => {
  const list = catalog([
    session('blank-new', { blank: true }),
    session('watched-quiet'),
    session('ordinary-idle'),
  ])
  const items = [
    { workspaceId: 'ws-watched', sessionIds: ['watched-quiet'] },
    { workspaceId: 'ws-plain', sessionIds: ['ordinary-idle'] },
  ]
  const workspace = { phase: 'ready', archivedSessionIds: [], pinnedSessionIds: [] }
  const statuses = new Map()
  const excluded = new Set(['watched-quiet'])

  const viewFor = (main) => {
    const ids = ordinarySessionIds(list, workspace.archivedSessionIds, 'default', main, excluded)
    const visibility = sessionVisibility(list, statuses, workspace, ids, { current: main })
    const tree = workspaceVisibility(items, visibility.attention, visibility.idle, new Map())
    return {
      ids,
      all: listHeadingCount('all', true, 'default', ids, visibility),
      attentionCount: listHeadingCount('attention', true, 'default', ids, visibility),
      collapsed: listHeadingCount('collapsed', true, 'default', ids, visibility),
      attention: visibility.attention,
      idle: visibility.idle,
      keptGroups: [...tree.keptGroups],
    }
  }

  // On New Session: ordinary list counts New Session + ordinary-idle (not watched-quiet).
  const onNew = viewFor('blank-new')
  assert.deepEqual(onNew.all, { key: 'totalCount', value: 2 })
  assert.deepEqual(onNew.attentionCount, { key: 'retainedCount', value: 1 })
  assert.equal(onNew.collapsed, undefined)
  assert.deepEqual(onNew.attention, ['blank-new'])
  assert.deepEqual(onNew.idle, ['ordinary-idle'])

  // Clicking the watched session drops New Session and keeps watched-quiet out of ordinary counts and workspace groups.
  const clickedWatched = viewFor('watched-quiet')
  assert.deepEqual(clickedWatched.ids, ['ordinary-idle'])
  assert.deepEqual(clickedWatched.all, { key: 'totalCount', value: 1 })
  assert.deepEqual(clickedWatched.attentionCount, { key: 'retainedCount', value: 0 })
  assert.equal(clickedWatched.collapsed, undefined)
  assert.deepEqual(clickedWatched.attention, [])
  assert.deepEqual(clickedWatched.idle, ['ordinary-idle'])
  assert.deepEqual(clickedWatched.keptGroups, [])

  // Contrast: clicking the non-watched ordinary session keeps it in attention and retains its workspace.
  const clickedOrdinary = viewFor('ordinary-idle')
  assert.deepEqual(clickedOrdinary.ids, ['ordinary-idle'])
  assert.deepEqual(clickedOrdinary.all, { key: 'totalCount', value: 1 })
  assert.deepEqual(clickedOrdinary.attentionCount, { key: 'retainedCount', value: 1 })
  assert.deepEqual(clickedOrdinary.attention, ['ordinary-idle'])
  assert.deepEqual(clickedOrdinary.keptGroups, ['ws-plain'])
})

test('excludes watched pinned, active, draft, idle, disclosed-idle, and ungrouped sessions and restores on unwatch', () => {
  const list = catalog([
    session('pinned-watched', { running: true }),
    session('parent-watched'),
    session('child', { origin: 'subagent', running: true }),
    session('unread-watched'),
    session('draft-watched'),
    session('disclosed-watched'),
    session('ungrouped-watched'),
    session('ordinary-idle'),
  ], { 'parent-watched': { values: { subagentCatalog: [{ id: 'child' }] } } })
  const items = [
    { workspaceId: 'ws-pin', sessionIds: ['pinned-watched'] },
    { workspaceId: 'ws-active', sessionIds: ['parent-watched', 'unread-watched', 'draft-watched'] },
    { workspaceId: 'ws-disclosed', sessionIds: ['disclosed-watched'] },
    { workspaceId: 'ws-plain', sessionIds: ['ordinary-idle'] },
  ]
  const workspace = { archivedSessionIds: [], pinnedSessionIds: ['pinned-watched'] }
  const statuses = new Map([
    ['pinned-watched', status({ pendingInteraction: { kind: 'approval' }, running: true })],
    ['unread-watched', status({ completionUnread: true })],
  ])
  const drafts = new Set(['draft-watched'])
  const excluded = new Set([
    'pinned-watched', 'parent-watched', 'unread-watched', 'draft-watched', 'disclosed-watched', 'ungrouped-watched',
  ])

  const ids = ordinarySessionIds(list, workspace.archivedSessionIds, 'default', 'pinned-watched', excluded)
  assert.deepEqual(ids, ['ordinary-idle'])
  const visibility = sessionVisibility(list, statuses, workspace, ids, { current: 'pinned-watched', drafts })
  assert.deepEqual(visibility, { attention: [], idle: ['ordinary-idle'], followUp: 0 })
  assert.deepEqual(listHeadingCount('all', true, 'default', ids, visibility), { key: 'totalCount', value: 1 })
  assert.deepEqual(listHeadingCount('attention', true, 'default', ids, visibility), { key: 'retainedCount', value: 0 })
  assert.equal(listHeadingCount('collapsed', true, 'default', ids, visibility), undefined)

  // Even when a workspace previously expanded idle rows, watching them drops it from keptGroups and idleGroups.
  const shown = updateIdlePages(new Map(), 'ws-disclosed', ['disclosed-watched'])
  const tree = workspaceVisibility(items, visibility.attention, visibility.idle, shown)
  assert.equal(tree.idleGroups.has('ws-disclosed'), false)
  assert.equal(tree.idleGroups.has(''), false)
  assert.deepEqual([...tree.keptGroups], [])

  // Watching every session yields zero ordinary counts across modes.
  const allWatched = new Set([...excluded, 'ordinary-idle'])
  const emptyIds = ordinarySessionIds(list, workspace.archivedSessionIds, 'default', undefined, allWatched)
  const emptyVis = sessionVisibility(list, statuses, workspace, emptyIds)
  assert.equal(listHeadingCount('all', true, 'default', emptyIds, emptyVis)?.value, 0)
  assert.equal(listHeadingCount('attention', true, 'default', emptyIds, emptyVis)?.value, 0)
  assert.equal(listHeadingCount('collapsed', true, 'default', emptyIds, emptyVis), undefined)

  // Unwatching pinned-watched immediately restores it to ordinary counts and ws-pin group.
  const restoredExcluded = new Set([...excluded].filter(id => id !== 'pinned-watched'))
  const restoredIds = ordinarySessionIds(list, workspace.archivedSessionIds, 'default', 'ordinary-idle', restoredExcluded)
  const restoredVis = sessionVisibility(list, statuses, workspace, restoredIds, { current: 'ordinary-idle', drafts })
  assert.deepEqual(restoredIds, ['pinned-watched', 'ordinary-idle'])
  assert.deepEqual(listHeadingCount('all', true, 'default', restoredIds, restoredVis), { key: 'totalCount', value: 2 })
  assert.deepEqual(listHeadingCount('attention', true, 'default', restoredIds, restoredVis), { key: 'retainedCount', value: 2 })
  assert.deepEqual(listHeadingCount('collapsed', true, 'default', restoredIds, restoredVis), { key: 'followUpCount', value: 1 })
  const restoredTree = workspaceVisibility(items, restoredVis.attention, restoredVis.idle, shown)
  assert.deepEqual([...restoredTree.keptGroups], ['ws-pin', 'ws-plain'])
  assert.deepEqual(restoredTree.activeSessionsByGroup.get('ws-pin'), ['pinned-watched'])
})

test('archived sessions stay excluded in default view and suppress activity and pins when shown', () => {
  const list = catalog([
    session('arch-pinned', { running: true }),
    session('arch-draft'),
    session('ordinary'),
  ])
  const workspace = { archivedSessionIds: ['arch-pinned', 'arch-draft'], pinnedSessionIds: ['arch-pinned'] }
  const statuses = new Map([['arch-pinned', status({ running: true, completionUnread: true })]])
  const drafts = new Set(['arch-draft'])

  // Default view hides archived sessions even if running, pinned, drafted, or retained in mainView.
  const defaultIds = ordinarySessionIds(list, workspace.archivedSessionIds, 'default', 'arch-pinned')
  assert.deepEqual(defaultIds, ['ordinary'])

  // Show-archived includes them in totalCount, suppresses followUp and pin retention, and only highlights an active current row.
  const shownIds = ordinarySessionIds(list, workspace.archivedSessionIds, 'show', undefined)
  assert.deepEqual(shownIds, ['arch-pinned', 'arch-draft', 'ordinary'])
  const shownVis = sessionVisibility(list, statuses, workspace, shownIds, { drafts })
  assert.deepEqual(shownVis, { attention: [], idle: ['arch-pinned', 'arch-draft', 'ordinary'], followUp: 0 })
  assert.deepEqual(listHeadingCount('all', true, 'show', shownIds, shownVis), { key: 'totalCount', value: 3 })
  assert.equal(listHeadingCount('collapsed', true, 'show', shownIds, shownVis), undefined)

  const shownCurrentVis = sessionVisibility(list, statuses, workspace, shownIds, { current: 'arch-pinned', drafts })
  assert.deepEqual(shownCurrentVis, { attention: ['arch-pinned'], idle: ['arch-draft', 'ordinary'], followUp: 0 })
})
