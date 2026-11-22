import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

let registration
globalThis.window = { __ModuleLoader__: { load(entry) { registration = entry } } }
await import('../client.js')
delete globalThis.window
const plugin = registration.factory(createRequire(import.meta.url))

test('registers the footer action and releases it on unload', () => {
  assert.equal(registration.id, 'dsh-workspace-list-toggle')
  assert.deepEqual(plugin.inject, ['slots', 'locale'])

  const cleanups = []
  const active = new Map()
  const ctx = {
    inject(services) { assert.deepEqual(services, ['sessionDraftIndicators']) },
    effect(setup) { cleanups.push(setup()) },
    locale: {
      register(namespace, labels) {
        assert.equal(Object.keys(labels).length, 8)
        for (const dictionary of Object.values(labels)) {
          assert.ok(dictionary.expandIdle)
          assert.ok(dictionary.collapseIdle)
        }
        active.set('locale', namespace)
        return () => active.delete('locale')
      },
    },
    slots: {
      inject(name, setup) {
        assert.equal(name, 'sidebar.footer.action')
        cleanups.push(setup())
      },
      register(options, component) {
        assert.equal(typeof component, 'function')
        active.set('footer', options)
        return () => active.delete('footer')
      },
    },
  }

  plugin.apply(ctx)
  assert.equal(active.get('locale'), registration.id)
  assert.deepEqual(active.get('footer'), {
    name: 'sidebar.footer.action', id: registration.id, locale: registration.id,
  })
  for (const cleanup of cleanups.reverse()) cleanup()
  assert.equal(active.size, 0)
})
