import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasMoreIdle, nextIdlePage } from '../src/client/idle-page.ts'

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
  let loads = 0
  const loadMore = button => {
    assert.equal(button.dataset.rowKey, 'overflow:first')
    first.mounted = first.ids
    loads++
  }

  const page1 = nextIdlePage(list, idle, idleGroups, [], loadMore)
  assert.deepEqual(page1, ['a1', 'a2', 'a3', 'a4', 'a5'])
  assert.equal(loads, 1)
  assert.equal(hasMoreIdle(list, idle, idleGroups, page1), true)
  const page2 = nextIdlePage(list, idle, idleGroups, page1, loadMore)
  assert.deepEqual(page2.slice(page1.length), ['a6', 'b1', 'b2'])
  assert.equal(hasMoreIdle(list, idle, idleGroups, page2), false)

  first.mounted = ['pin', 'a1']
  assert.equal(hasMoreIdle(list, idle, idleGroups, page2), true)
  assert.deepEqual(nextIdlePage(list, idle, idleGroups, page2, loadMore), [
    'a1', 'b1', 'b2', 'a2', 'a3', 'a4', 'a5', 'a6',
  ])
})

test('skips outgoing animated rows and stops at a native page that does not advance', () => {
  const idle = new Set(['outgoing', 'hidden', 'next'])
  const idleGroups = new Map([['first', ['outgoing', 'hidden']]])
  const list = { querySelectorAll: () => [
    new Row('session:outgoing', true), new Overflow('overflow:first'), new Row('session:next'),
  ] }
  let attempts = 0
  assert.deepEqual(nextIdlePage(list, idle, idleGroups, [], () => { attempts++ }), ['next'])
  assert.equal(attempts, 1)
})
