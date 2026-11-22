export const IDLE_PAGE_SIZE = 5
const SESSION = 'session:'
const OVERFLOW = 'overflow:'
const PAGE_ROWS = `[data-row-key^="${SESSION}"], button[data-row-key^="${OVERFLOW}"][aria-expanded="false"]`

type IdleGroups = ReadonlyMap<string, readonly string[]>
export function scanIdlePage(
  list: HTMLElement,
  idle: ReadonlySet<string>,
  idleGroups: IdleGroups,
  shown: readonly string[],
  remaining: number,
) {
  const rows = [...list.querySelectorAll<HTMLElement>(PAGE_ROWS)].filter(row => !row.closest('[aria-hidden="true"]'))
  const mounted = new Set(rows.map(row => row.dataset.rowKey))
  const selected = new Set(shown)
  const boundaries = new Set<HTMLButtonElement>()
  for (const row of rows) {
    if (!(row instanceof HTMLButtonElement)) continue
    const group = row.dataset.rowKey?.slice(OVERFLOW.length) ?? ''
    const missing = idleGroups.get(group)?.filter(id => !mounted.has(SESSION + id)) ?? []
    if (missing.length === 0) continue
    // Previously disclosed rows can be unmounted when a native group folds.
    for (const id of missing) selected.delete(id)
    boundaries.add(row)
  }
  const added: string[] = []
  let boundary: HTMLButtonElement | undefined
  for (const row of rows) {
    const key = row.dataset.rowKey ?? ''
    if (key.startsWith(SESSION)) {
      const id = key.slice(SESSION.length)
      if (!idle.has(id) || selected.has(id)) continue
      if (added.length === remaining) return { shown: [...selected], added, hasMore: true, boundary }
      selected.add(id)
      added.push(id)
    } else if (row instanceof HTMLButtonElement && boundaries.has(row)) {
      if (added.length < remaining) boundary = row
      return { shown: [...selected], added, hasMore: true, boundary }
    }
  }
  return { shown: [...selected], added, hasMore: false, boundary }
}

export function loadNativePage(button: HTMLButtonElement, signal: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    const parent = button.parentElement
    if (parent === null || signal.aborted || button.getAttribute('aria-expanded') !== 'false') {
      resolve(false)
      return
    }
    const groupRows = `:scope > [data-row-key^="${SESSION}"], :scope > :not([role="group"]) > [data-row-key^="${SESSION}"]`
    const countRows = () => parent.querySelectorAll(groupRows).length
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
