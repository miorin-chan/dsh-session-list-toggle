import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const rowSelector = '[data-row-key^="session:"], [data-row-key^="workspace:"], [data-row-key^="overflow:"]'
// ui-workspace 0.2.2-rc.5 stores this view preference locally and exposes no slot prop for it.
const workspaceViewKey = 'dsh.workspace.view.v5'

function isArchivedOnly() {
  try {
    const view: unknown = JSON.parse(window.localStorage.getItem(workspaceViewKey) ?? 'null')
    return view !== null && typeof view === 'object' && 'archivedFilter' in view && view.archivedFilter === 'only'
  } catch {
    return false
  }
}

function renderedRows(list: HTMLElement) {
  return [...list.querySelectorAll<HTMLElement>(rowSelector)].filter(row =>
    !row.closest('[aria-hidden="true"]') && row.getClientRects().length > 0,
  )
}

export function IdleControl({ listSelector, scrollportSelector, expanded, onChange, label, emptyLabel, hasArchives }: {
  listSelector: string
  scrollportSelector: string
  expanded: boolean
  onChange: (expanded: boolean) => void
  label: string | undefined
  emptyLabel: string
  hasArchives: boolean
}) {
  const [mount, setMount] = useState<{ list: HTMLElement; container: HTMLElement } | null>(null)
  const [archivedOnly, setArchivedOnly] = useState(false)
  const reveal = useRef<{ rows: Set<HTMLElement>; keyboard: boolean } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = mount?.list ?? null
  const watchArchiveFilter = hasArchives && label !== undefined

  useEffect(() => {
    if (!watchArchiveFilter) return
    // Native view preferences can persist after the new rows render.
    const sync = () => setArchivedOnly(isArchivedOnly())
    sync()
    const timer = window.setInterval(sync, 250)
    return () => window.clearInterval(timer)
  }, [watchArchiveFilter])

  useLayoutEffect(() => {
    const scrollport = document.querySelector(scrollportSelector)
    if (scrollport === null) return
    const container = document.createElement('div')
    container.dataset.dshWorkspaceListEnd = ''
    let current: HTMLElement | null = null
    const syncMount = () => {
      const next = current?.isConnected ? current : document.querySelector<HTMLElement>(listSelector)
      // A native layout or search change may insert a new list body after the portal.
      if (next !== null && next.lastElementChild !== container) next.append(container)
      if (next === current) return
      current = next
      setMount(next === null ? null : { list: next, container })
    }
    syncMount()
    const observer = new MutationObserver(syncMount)
    observer.observe(scrollport, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      container.remove()
    }
  }, [listSelector, scrollportSelector])

  useLayoutEffect(() => {
    const before = reveal.current
    reveal.current = null
    if (!expanded || list === null || before === null) return
    const added = renderedRows(list).filter(row => !before.rows.has(row))
    const first = added[0]
    if (first === undefined) return
    const bounds = list.getBoundingClientRect()
    const outer = list.closest(scrollportSelector)?.getBoundingClientRect()
    const top = Math.max(bounds.top, outer?.top ?? 0, 0)
    const bottom = Math.min(bounds.bottom, outer?.bottom ?? window.innerHeight, window.innerHeight)
    const isVisible = (row: HTMLElement) => {
      const rect = row.getBoundingClientRect()
      return rect.bottom > top && rect.top < bottom
    }
    const visibleRows = added.filter(isVisible)
    const trigger = button.current
    if (visibleRows.length > 0 && (!before.keyboard || (trigger !== null && isVisible(trigger)))) return

    // Scroll to the new content and keep keyboard focus on a visible control.
    // Native workspace headings are not always focusable.
    const focusTarget = before.keyboard
      ? visibleRows.find(row => row.tabIndex >= 0) ?? added.find(row => row.tabIndex >= 0)
      : undefined
    const target = focusTarget ?? visibleRows[0] ?? first
    if (!isVisible(target)) target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    focusTarget?.focus({ preventScroll: true })
  }, [expanded, list, scrollportSelector])

  if (mount === null || list === null) return null
  return createPortal(<>
    <div data-dsh-workspace-attention-empty="">{emptyLabel}</div>
    {label !== undefined && !(watchArchiveFilter && archivedOnly) && (
      <button
        ref={button}
        type="button"
        data-dsh-workspace-idle-toggle=""
        aria-expanded={expanded}
        onClick={event => {
          if (!expanded) reveal.current = { rows: new Set(renderedRows(list)), keyboard: event.detail === 0 }
          onChange(!expanded)
        }}
      >{label}</button>
    )}
  </>, mount.container)
}
