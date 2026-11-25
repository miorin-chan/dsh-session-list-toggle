import assert from 'node:assert/strict'
import { test } from 'node:test'
import { IDLE_PAGE_SIZE, scanIdlePage } from '../src/client/idle-page.ts'

class Row {
  constructor(key, invisible = false) {
    this.dataset = { rowKey: key }
    this.invisible = invisible
  }

  closest() { return this.invisible ? this : null }
}

class Overflow extends Row {}
globalThis.HTMLButtonElement = Overflow

const sessionRows = ids => ids.map(id => new Row(`session:${id}`))

function listFixture(groups) {
  return {
    querySelectorAll: () => groups.flatMap(group => [
      ...sessionRows(group.mounted),
      ...(group.mounted.length < group.ids.length ? [new Overflow(`overflow:${group.key}`)] : []),
    ]),
  }
}

test('loads at most five idle rows within one workspace, independently of other workspaces', () => {
  const first = { key: 'first', mounted: ['pin', 'a1'], ids: ['pin', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6'] }
  const second = { key: 'second', mounted: ['b1', 'b2'], ids: ['b1', 'b2'] }
  const idle = new Set(first.ids.slice(1))
  // Include a neighboring group's rows before this group's rows, as with a native child Workspace.
  const list = listFixture([second, first])
  const initial = scanIdlePage(list, idle, first.key, [], IDLE_PAGE_SIZE)
  assert.deepEqual(initial.shown, ['a1'])
  assert.equal(initial.boundary.dataset.rowKey, 'overflow:first')
  assert.equal(initial.nextCount, 5)
  assert.equal(initial.visibleCount, 0)

  first.mounted = first.ids
  const page1 = scanIdlePage(list, idle, first.key, initial.shown, IDLE_PAGE_SIZE - initial.added.length)
  assert.deepEqual(page1.shown, ['a1', 'a2', 'a3', 'a4', 'a5'])
  assert.equal(page1.nextCount, 4)
  assert.equal(page1.boundary, undefined)
  const page2 = scanIdlePage(list, idle, first.key, page1.shown, IDLE_PAGE_SIZE)
  assert.deepEqual(page2.added, ['a6'])
  assert.equal(page2.nextCount, 1)
  assert.equal(page2.visibleCount, 5)
  const complete = scanIdlePage(list, idle, first.key, page2.shown, IDLE_PAGE_SIZE)
  assert.equal(complete.nextCount, 0)
  assert.equal(complete.visibleCount, 6)
  const other = scanIdlePage(list, new Set(second.ids), second.key, [], IDLE_PAGE_SIZE)
  assert.deepEqual(other.shown, ['b1', 'b2'])

  first.mounted = ['pin', 'a1']
  const reopened = scanIdlePage(list, idle, first.key, page2.shown, IDLE_PAGE_SIZE)
  assert.deepEqual(reopened.shown, ['a1'])
  assert.equal(reopened.boundary.dataset.rowKey, 'overflow:first')
  assert.equal(reopened.visibleCount, 1)
  assert.equal(reopened.nextCount, 5)
  first.mounted = first.ids
  const restored = scanIdlePage(list, idle, first.key, reopened.shown, IDLE_PAGE_SIZE)
  assert.deepEqual(restored.added, ['a2', 'a3', 'a4', 'a5', 'a6'])
})

test('scans once and stops at the next native boundary without skipping it', () => {
  const idle = new Set(['outgoing', 'hidden', 'next'])
  let scans = 0
  const list = { querySelectorAll: selector => {
    assert.match(selector, /:scope > :not\(\[role="group"\]\) > \[data-row-key\^="session:"\]/)
    scans++
    return [new Row('session:outgoing', true), new Overflow('overflow:child'), new Overflow('overflow:first'), new Row('session:next')]
  } }
  const page = scanIdlePage(list, idle, 'first', [], IDLE_PAGE_SIZE)
  assert.deepEqual(page.added, [])
  assert.equal(page.boundary.dataset.rowKey, 'overflow:first')
  assert.equal(scans, 1)
})

test('flat paging follows the shared list order regardless of workspace membership', () => {
  const ids = ['b2', 'a1', 'b1', 'a2', 'ungrouped', 'a3']
  const list = { querySelectorAll: () => sessionRows(['pinned', ...ids]) }
  const first = scanIdlePage(list, new Set(ids), null, [], IDLE_PAGE_SIZE)
  assert.deepEqual(first.added, ids.slice(0, 5))
  assert.equal(first.nextCount, 5)
  const last = scanIdlePage(list, new Set(ids), null, first.shown, IDLE_PAGE_SIZE)
  assert.deepEqual(last.added, ['a3'])
  assert.equal(last.nextCount, 1)
  const onlyMounted = scanIdlePage(list, new Set([...ids, 'missing']), null, last.shown, IDLE_PAGE_SIZE)
  assert.equal(onlyMounted.nextCount, 0)
  assert.equal(onlyMounted.visibleCount, 6)
})
