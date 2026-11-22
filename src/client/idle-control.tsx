import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IDLE_PAGE_SIZE, loadNativePage, scanIdlePage } from './idle-page.js'
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

function addedRows(list: HTMLElement, ids: readonly string[]) {
  const selectors = ids.map(id => `[data-row-key="session:${CSS.escape(id)}"]`)
  if (selectors.length === 0) return []
  return [...list.querySelectorAll<HTMLElement>(selectors.join(', '))].filter(row =>
    !row.closest('[aria-hidden="true"]') && row.getClientRects().length > 0,
  )
}

export function IdleControl({ listSelector, scrollportSelector, browsingSelector, idle, idleGroups, shown, onChange, moreLabel, collapseLabel, loadingLabel, emptyLabel, hasArchives }: {
  listSelector: string
  scrollportSelector: string
  browsingSelector: string
  idle: ReadonlySet<string>
  idleGroups: ReadonlyMap<string, readonly string[]>
  shown: readonly string[] | null
  onChange: (shown: string[] | null) => void
  moreLabel: string
  collapseLabel: string
  loadingLabel: string
  emptyLabel: string
  hasArchives: boolean
}) {
  const [mount, setMount] = useState<{ list: HTMLElement; container: HTMLElement } | null>(null)
  const [archivedOnly, setArchivedOnly] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const request = useRef<AbortController | null>(null)
  const latestPageData = useRef({ idle, idleGroups })
  const reveal = useRef<{ ids: string[]; keyboard: boolean } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const activationKeyHeld = useRef(false)
  const list = mount?.list ?? null
  const watchArchiveFilter = hasArchives && idle.size > 0
  const canCollapse = shown !== null && !hasMore

  useLayoutEffect(() => {
    latestPageData.current = { idle, idleGroups }
  }, [idle, idleGroups])

  useLayoutEffect(() => () => request.current?.abort(), [list, archivedOnly])

  useEffect(() => {
    if (list === null || busy || shown === null) return
    const sync = () => {
      if (request.current === null) setHasMore(scanIdlePage(list, idle, idleGroups, shown, 0).hasMore)
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded', 'aria-hidden'] })
    return () => observer.disconnect()
  }, [list, idle, idleGroups, shown, busy])

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
    const observer = new MutationObserver(() => {
      syncMount()
      if (request.current !== null && !current?.matches(browsingSelector)) request.current.abort()
    })
    observer.observe(scrollport, { childList: true, subtree: true, attributes: true, attributeFilter: ['tabindex'] })
    return () => {
      observer.disconnect()
      container.remove()
    }
  }, [listSelector, scrollportSelector, browsingSelector])

  useEffect(() => {
    if (shown === null || list === null || busy || reveal.current === null) return
    let frame = requestAnimationFrame(function positionPage() {
      const page = reveal.current
      if (page?.keyboard && activationKeyHeld.current) {
        frame = requestAnimationFrame(positionPage)
        return
      }
      reveal.current = null
      const trigger = button.current
      if (page === null || trigger === null || trigger.getClientRects().length === 0) return
      const keepFocus = page.keyboard && document.activeElement === trigger
      if (page.keyboard && !keepFocus) return
      const added = addedRows(list, page.ids)
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
      const visible = added.find(isVisible)
      if (visible !== undefined && (!keepFocus || isVisible(trigger))) return
      const target = visible ?? first
      if (visible === undefined) target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
      if (keepFocus) target.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [shown, list, scrollportSelector, busy])

  if (mount === null || list === null) return null

  const showNextPage = async (keyboard: boolean) => {
    if (request.current !== null) return
    if (canCollapse) {
      reveal.current = null
      onChange(null)
      return
    }
    const tree = list.querySelector('[role="tree"]')
    const browsing = () => list.isConnected && list.matches(browsingSelector) && list.querySelector('[role="tree"]') === tree
    if (!browsing()) return
    const ids: string[] = []
    let committed = shown
    let page = scanIdlePage(list, idle, idleGroups, committed ?? [], IDLE_PAGE_SIZE)
    const applyPage = () => {
      const changed = page.added.length > 0 || page.shown.length !== (committed?.length ?? 0)
      if (changed || (committed === null && page.boundary === undefined)) {
        committed = page.shown
        onChange(page.shown)
      }
      ids.push(...page.added)
      setHasMore(page.hasMore)
    }
    if (page.boundary === undefined) {
      reveal.current = { ids, keyboard }
      applyPage()
      return
    }

    const controller = new AbortController()
    request.current = controller
    reveal.current = null
    setBusy(true)
    applyPage()
    try {
      while (page.boundary !== undefined) {
        const advanced = await loadNativePage(page.boundary, controller.signal)
        if (controller.signal.aborted || !browsing()) return
        if (!advanced) break
        const current = latestPageData.current
        page = scanIdlePage(list, current.idle, current.idleGroups, page.shown, IDLE_PAGE_SIZE - ids.length)
        applyPage()
      }
      reveal.current = { ids, keyboard }
    } finally {
      request.current = null
      setBusy(false)
    }
  }

  return createPortal(<>
    <div data-dsh-workspace-attention-empty="">{emptyLabel}</div>
    {idle.size > 0 && !(watchArchiveFilter && archivedOnly) && (
      <button
        ref={button}
        type="button"
        data-dsh-workspace-idle-toggle=""
        aria-expanded={shown !== null}
        aria-disabled={busy || undefined}
        onClick={event => { void showNextPage(event.detail === 0) }}
        onKeyDown={event => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          activationKeyHeld.current = true
          if (event.repeat) event.preventDefault()
        }}
        onKeyUp={event => {
          if (event.key === 'Enter' || event.key === ' ') activationKeyHeld.current = false
        }}
        onBlur={() => { activationKeyHeld.current = false }}
      >{busy ? loadingLabel : canCollapse ? collapseLabel : moreLabel}</button>
    )}
  </>, mount.container)
}
