const PAGE_SIZE = 5
const SESSION = 'session:'
const OVERFLOW = 'overflow:'
const PAGE_ROWS = `[data-row-key^="${SESSION}"], button[data-row-key^="${OVERFLOW}"][aria-expanded="false"]`

type IdleGroups = ReadonlyMap<string, readonly string[]>

function pageRows(list: HTMLElement) {
  return [...list.querySelectorAll<HTMLElement>(PAGE_ROWS)].filter(row => !row.closest('[aria-hidden="true"]'))
}

function nextIdleEntry(
  list: HTMLElement,
  idle: ReadonlySet<string>,
  idleGroups: IdleGroups,
  shown: ReadonlySet<string>,
  skippedGroups: ReadonlySet<string>,
) {
  const rows = pageRows(list)
  const mounted = new Set(rows.map(row => row.dataset.rowKey))
  for (const row of rows) {
    const key = row.dataset.rowKey ?? ''
    if (key.startsWith(SESSION)) {
      const id = key.slice(SESSION.length)
      if (idle.has(id) && !shown.has(id)) return { kind: 'session', id } as const
    } else if (key.startsWith(OVERFLOW) && row instanceof HTMLButtonElement) {
      const group = key.slice(OVERFLOW.length)
      if (!skippedGroups.has(group) && idleGroups.get(group)?.some(id => !mounted.has(SESSION + id))) {
        return { kind: 'overflow', group, button: row } as const
      }
    }
  }
}

export function hasMoreIdle(list: HTMLElement, idle: ReadonlySet<string>, idleGroups: IdleGroups, shown: readonly string[]) {
  return nextIdleEntry(list, idle, idleGroups, new Set(shown), new Set()) !== undefined
}

export function nextIdlePage(
  list: HTMLElement,
  idle: ReadonlySet<string>,
  idleGroups: IdleGroups,
  shown: readonly string[],
  loadMore: (button: HTMLButtonElement) => void,
): string[] {
  const rows = pageRows(list)
  const mounted = new Set(rows.map(row => row.dataset.rowKey))
  const selected = new Set(shown)
  // A native collapse can remove rows that an earlier idle page disclosed.
  // Count those rows against the next batch when they become reachable again.
  for (const row of rows) {
    const key = row.dataset.rowKey ?? ''
    if (!key.startsWith(OVERFLOW)) continue
    for (const id of idleGroups.get(key.slice(OVERFLOW.length)) ?? []) {
      if (!mounted.has(SESSION + id)) selected.delete(id)
    }
  }
  const previousSize = selected.size
  const skippedGroups = new Set<string>()
  while (selected.size - previousSize < PAGE_SIZE) {
    const next = nextIdleEntry(list, idle, idleGroups, selected, skippedGroups)
    if (next === undefined) break
    if (next.kind === 'session') {
      selected.add(next.id)
    } else {
      const before = pageRows(list).length
      loadMore(next.button)
      if (pageRows(list).length <= before) skippedGroups.add(next.group)
    }
  }
  return [...selected]
}
