import type { Context } from '@deepseek-ai/cordis'

/** Optional read-only service provided by dsh-session-draft. */
interface DraftSource {
  getSnapshot(): ReadonlySet<string>
  subscribe(listener: () => void): () => void
}

const service = 'sessionDraftIndicators'
const empty: ReadonlySet<string> = new Set()

function isDraftSource(value: unknown): value is DraftSource {
  return typeof value === 'object' && value !== null
    && 'getSnapshot' in value && typeof value.getSnapshot === 'function'
    && 'subscribe' in value && typeof value.subscribe === 'function'
}

export function connectDrafts(ctx: Context): DraftSource {
  let source: DraftSource | undefined
  const listeners = new Set<() => void>()
  const notify = () => { for (const listener of listeners) listener() }

  ctx.inject([service], scope => {
    const candidate: unknown = scope.get(service)
    if (!isDraftSource(candidate)) return
    scope.effect(() => {
      source = candidate
      const unsubscribe = candidate.subscribe(notify)
      notify()
      return () => {
        unsubscribe()
        source = undefined
        notify()
      }
    })
  })

  return {
    getSnapshot: () => source?.getSnapshot() ?? empty,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
