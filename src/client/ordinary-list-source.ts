import type { Context } from '@deepseek-ai/cordis'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type { ArchiveFilter } from './attention.js'

export interface OrdinaryListScope {
  readonly excludedIds: ReadonlySet<string>
  readonly archiveFilter: ArchiveFilter
}

export interface OrdinaryListSource {
  getSnapshot(): OrdinaryListScope | undefined
  subscribe(listener: () => void): () => void
}

const SLOT = 'sidebar.workspaces'

function readSource(entry: StoredEntry | undefined): OrdinaryListSource | undefined {
  try {
    const injected = entry?.inject?.() as { ordinaryListScope?: Partial<OrdinaryListSource> } | undefined
    const source = injected?.ordinaryListScope
    if (typeof source?.getSnapshot === 'function' && typeof source.subscribe === 'function') {
      return source as OrdinaryListSource
    }
  } catch {
    // Other workspace browsers need not expose this optional snapshot.
  }
}

function isScope(value: unknown): value is OrdinaryListScope {
  if (typeof value !== 'object' || value === null) return false
  const { excludedIds, archiveFilter } = value as Partial<OrdinaryListScope>
  return (archiveFilter === 'default' || archiveFilter === 'show' || archiveFilter === 'only')
    && excludedIds instanceof Set && [...excludedIds].every(id => typeof id === 'string')
}

/** Only the winning browser can tell which sessions its ordinary rows exclude. */
export function createOrdinaryListSource(slots: Pick<Context['slots'], 'entriesOfSlot' | 'subscribe'>): OrdinaryListSource {
  let entry: StoredEntry | undefined
  let source: OrdinaryListSource | undefined
  let checked: unknown
  let snapshot: OrdinaryListScope | undefined
  const resolve = () => {
    const winner = slots.entriesOfSlot(SLOT)[0]
    if (winner !== entry) {
      entry = winner
      source = readSource(winner)
    }
    return source
  }
  return {
    getSnapshot() {
      const value = resolve()?.getSnapshot()
      if (value !== checked) {
        checked = value
        snapshot = isScope(value) ? value : undefined
      }
      return snapshot
    },
    subscribe(listener: () => void) {
      let current = resolve()
      let stopSource = current?.subscribe(listener)
      const stopSlots = slots.subscribe(SLOT, () => {
        const next = resolve()
        if (next === current) return
        stopSource?.()
        current = next
        stopSource = next?.subscribe(listener)
        listener()
      })
      return () => { stopSlots(); stopSource?.() }
    },
  }
}
