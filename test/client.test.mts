import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

let registration
globalThis.window = { __ModuleLoader__: { load(entry) { registration = entry } } }
await import('../client.js')
delete globalThis.window
const require = createRequire(import.meta.url)
const nativeUi = '@deepseek-ai/dsh-client-ui-primitives'
const imports = new Set()
const plugin = registration.factory(id => {
  imports.add(id)
  // The browser shell, not the plugin's development dependencies, supplies this module.
  return id === nativeUi ? {} : require(id)
})

test('uses the shell component library and no unseeded runtime packages', () => {
  assert.deepEqual(imports, new Set(['react', 'react-dom', 'react/jsx-runtime', nativeUi]))
})

test('registers the footer action and releases it on unload', () => {
  assert.equal(registration.id, '@miorin/dsh-session-list-toggle')
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
  assert.equal(active.get('locale'), 'dsh-session-list-toggle')
  assert.deepEqual(active.get('footer'), {
    name: 'sidebar.footer.action', id: 'dsh-session-list-toggle', locale: 'dsh-session-list-toggle',
  })
  for (const cleanup of cleanups.reverse()) cleanup()
  assert.equal(active.size, 0)
})
