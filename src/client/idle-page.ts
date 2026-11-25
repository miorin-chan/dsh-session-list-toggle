export const IDLE_PAGE_SIZE = 5
const SESSION = 'session:'
const OVERFLOW = 'overflow:'
const SESSION_ROW = `[data-row-key^="${SESSION}"]`
const OVERFLOW_ROW = `button[data-row-key^="${OVERFLOW}"][aria-expanded="false"]`
// Native child Workspaces are inside role="group"; own Sessions may have hover wrappers.
const OWN_SESSIONS = `:scope > ${SESSION_ROW}, :scope > :not([role="group"]) > ${SESSION_ROW}`
const GROUP_PAGE_ROWS = `${OWN_SESSIONS}, :scope > ${OVERFLOW_ROW}`

export type IdleScopeKey = string | null // null is the flat view; '' is the native Ungrouped key.
// A workspace remains in the map after its idle rows have been collapsed.
export type IdlePages = ReadonlyMap<IdleScopeKey, readonly string[] | null>

export function updateIdlePages(previous: IdlePages, key: IdleScopeKey, selection: string[] | null): IdlePages {
  const workspace = key !== null && key !== ''
  if (workspace && !selection?.length && !previous.has(key)) return previous
  const next = new Map(previous)
  if (!workspace && selection === null) next.delete(key)
  else next.set(key, workspace && !selection?.length ? null : selection)
  return next
}

export function scanIdlePage(
  section: HTMLElement,
  idle: ReadonlySet<string>,
  groupKey: string | null,
  shown: readonly string[],
  remaining: number,
) {
  const rows = [...section.querySelectorAll<HTMLElement>(groupKey === null ? SESSION_ROW : GROUP_PAGE_ROWS)]
    .filter(row => !row.closest('[aria-hidden="true"]'))
  const mounted = new Set(rows.map(row => row.dataset.rowKey))
  const selected = new Set(shown)
  const nativeOverflow = groupKey === null ? undefined : rows.find(
    (row): row is HTMLButtonElement => row instanceof HTMLButtonElement && row.dataset.rowKey === OVERFLOW + groupKey,
  )
  const missing = nativeOverflow === undefined ? [] : [...idle].filter(id => !mounted.has(SESSION + id))
  const visibleCount = [...selected].filter(id => idle.has(id) && mounted.has(SESSION + id)).length
  const result = (boundary?: HTMLButtonElement) => ({
    shown: [...selected], added, boundary, visibleCount,
    nextCount: boundary === undefined ? added.length : Math.min(remaining, added.length + missing.length),
  })
  // Native folding may unmount rows from the previously disclosed page.
  for (const id of missing) selected.delete(id)
  const added: string[] = []
  for (const row of rows) {
    const key = row.dataset.rowKey ?? ''
    if (key.startsWith(SESSION)) {
      const id = key.slice(SESSION.length)
      if (!idle.has(id) || selected.has(id)) continue
      if (added.length === remaining) return result()
      selected.add(id)
      added.push(id)
    } else if (row === nativeOverflow && missing.length > 0) {
      return result(added.length < remaining ? nativeOverflow : undefined)
    }
  }
  return result()
}

export function loadNativePage(button: HTMLButtonElement, signal: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    const parent = button.parentElement
    if (parent === null || signal.aborted || button.getAttribute('aria-expanded') !== 'false') {
      resolve(false)
      return
    }
    const countRows = () => parent.querySelectorAll(OWN_SESSIONS).length
    const before = countRows()
    let continuation = 0
    const finish = (changed: boolean) => {
      observer.disconnect()
      clearTimeout(timeout)
      clearTimeout(continuation)
      signal.removeEventListener('abort', abort)
      resolve(changed)
    }
    const abort = () => finish(false)
    const observer = new MutationObserver(() => {
      if (countRows() <= before) return
      observer.disconnect()
      // Yield after the commit without depending on a background tab's frame rate.
      continuation = window.setTimeout(() => finish(true), 0)
    })
    const timeout = window.setTimeout(() => finish(continuation !== 0), 150)
    signal.addEventListener('abort', abort, { once: true })
    observer.observe(parent, { childList: true, subtree: true })
    button.click()
  })
}
