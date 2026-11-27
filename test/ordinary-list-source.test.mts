import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createOrdinaryListSource } from '../src/client/ordinary-list-source.ts'

function slotHarness(initialEntries: Record<string, unknown>[] = []) {
  let entries = [...initialEntries]
  const listeners = new Set<() => void>()
  return {
    slots: {
      entriesOfSlot: () => entries.slice(0, 1),
      subscribe(_name: string, listener: () => void) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    setEntries(next: Record<string, unknown>[]) {
      entries = next
      for (const listener of [...listeners]) listener()
    },
    listenerCount: () => listeners.size,
  }
}

test('resolves ordinaryListScope dynamically, validates snapshots, caches identity, and cleans up subscriptions', () => {
  const native = { inject: () => ({ searchResultLimit: 20 }) }
  const h = slotHarness([native])
  const source = createOrdinaryListSource(h.slots)

  assert.equal(source.getSnapshot(), undefined)

  let notifications = 0
  const unsubscribe = source.subscribe(() => { notifications += 1 })
  assert.equal(h.listenerCount(), 1)

  let currentSnapshot: unknown = { excludedIds: new Set(['alpha']), archiveFilter: 'default' }
  const watchedListeners = new Set<() => void>()
  const watched = {
    inject: () => ({
      ordinaryListScope: {
        getSnapshot: () => currentSnapshot,
        subscribe(listener: () => void) {
          watchedListeners.add(listener)
          return () => { watchedListeners.delete(listener) }
        },
      },
    }),
  }

  // Winning entry changes from native browser to watched browser.
  h.setEntries([watched, native])
  assert.equal(notifications, 1)
  assert.equal(watchedListeners.size, 1)
  const first = source.getSnapshot()
  assert.ok(first)
  assert.deepEqual([...first.excludedIds], ['alpha'])
  assert.equal(first.archiveFilter, 'default')
  assert.equal(source.getSnapshot(), first)

  // Malformed snapshots degrade cleanly to undefined without throwing.
  for (const invalid of [null, { excludedIds: ['alpha'], archiveFilter: 'default' }, { excludedIds: new Set([1]), archiveFilter: 'default' }, { excludedIds: new Set(['alpha']), archiveFilter: 'bogus' }]) {
    currentSnapshot = invalid
    for (const listener of watchedListeners) listener()
    assert.equal(source.getSnapshot(), undefined)
  }

  // Live valid update resumes cleanly.
  currentSnapshot = { excludedIds: new Set(['alpha', 'beta']), archiveFilter: 'only' }
  for (const listener of watchedListeners) listener()
  assert.deepEqual([...(source.getSnapshot()?.excludedIds ?? [])], ['alpha', 'beta'])
  assert.equal(source.getSnapshot()?.archiveFilter, 'only')

  // Slot reverts back to native browser (or throwing inject): resets snapshot and detaches watched listener.
  h.setEntries([native])
  assert.equal(watchedListeners.size, 0)
  assert.equal(source.getSnapshot(), undefined)

  h.setEntries([{ inject() { throw new Error('boom') } }])
  assert.equal(source.getSnapshot(), undefined)

  unsubscribe()
  assert.equal(h.listenerCount(), 0)
})
