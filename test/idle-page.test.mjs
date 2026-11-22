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

test('adds at most five idle rows in native order across group page boundaries', () => {
  const first = { key: 'first', mounted: ['pin', 'a1'], ids: ['pin', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6'] }
  const second = { key: 'second', mounted: ['b1', 'b2'], ids: ['b1', 'b2'] }
  const folded = ['c1']
  const idleGroups = new Map([
    [first.key, first.ids.slice(1)], [second.key, second.ids], ['folded', folded],
  ])
  const idle = new Set([...idleGroups.values()].flat())
  const list = listFixture([first, second])
  const initial = scanIdlePage(list, idle, idleGroups, [], IDLE_PAGE_SIZE)
  assert.deepEqual(initial.shown, ['a1'])
  assert.equal(initial.boundary.dataset.rowKey, 'overflow:first')

  first.mounted = first.ids
  const page1 = scanIdlePage(list, idle, idleGroups, initial.shown, IDLE_PAGE_SIZE - initial.added.length)
  assert.deepEqual(page1.shown, ['a1', 'a2', 'a3', 'a4', 'a5'])
  assert.equal(page1.hasMore, true)
  assert.equal(page1.boundary, undefined)
  const page2 = scanIdlePage(list, idle, idleGroups, page1.shown, IDLE_PAGE_SIZE)
  assert.deepEqual(page2.added, ['a6', 'b1', 'b2'])
  assert.equal(page2.hasMore, false)

  first.mounted = ['pin', 'a1']
  const reopened = scanIdlePage(list, idle, idleGroups, page2.shown, IDLE_PAGE_SIZE)
  assert.deepEqual(reopened.shown, ['a1', 'b1', 'b2'])
  assert.equal(reopened.boundary.dataset.rowKey, 'overflow:first')
  first.mounted = first.ids
  const restored = scanIdlePage(list, idle, idleGroups, reopened.shown, IDLE_PAGE_SIZE)
  assert.deepEqual(restored.added, ['a2', 'a3', 'a4', 'a5', 'a6'])
  assert.equal(restored.hasMore, false)
})

test('scans once and stops at the next native boundary without skipping it', () => {
  const idle = new Set(['outgoing', 'hidden', 'next'])
  const idleGroups = new Map([['first', ['outgoing', 'hidden']]])
  let scans = 0
  const list = { querySelectorAll: () => {
    scans++
    return [new Row('session:outgoing', true), new Overflow('overflow:first'), new Row('session:next')]
  } }
  const page = scanIdlePage(list, idle, idleGroups, [], IDLE_PAGE_SIZE)
  assert.deepEqual(page.added, [])
  assert.equal(page.boundary.dataset.rowKey, 'overflow:first')
  assert.equal(scans, 1)
})
