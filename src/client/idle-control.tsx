import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ArchiveFilter } from './attention.js'
import { IDLE_PAGE_SIZE, loadNativePage, scanIdlePage } from './idle-page.js'
import type { IdlePages, IdleScopeKey } from './idle-page.js'
// ui-workspace 0.2.2-rc.5 stores this view preference locally and exposes no slot prop for it.
const workspaceViewKey = 'dsh.workspace.view.v5'
const WORKSPACE = 'workspace:'
const WORKSPACE_ROW = `[data-row-key^="${WORKSPACE}"]`
const EMPTY_SELECTION: readonly string[] = []

type Scope = { key: IdleScopeKey; row: HTMLElement; section: HTMLElement; container: HTMLElement }

interface IdleControlsProps {
  listSelector: string
  scrollportSelector: string
  browsingSelector: string
  idle: ReadonlySet<string>
  idleGroups: ReadonlyMap<string, ReadonlySet<string>>
  shown: IdlePages
  onChange: (key: IdleScopeKey, shown: string[] | null) => void
  moreLabel: string
  collapseLabel: string
  loadingLabel: string
  emptyLabel: string
}

export function useArchiveFilter(): ArchiveFilter {
  const [filter, setFilter] = useState(readArchiveFilter)
  useEffect(() => {
    // Native view preferences can persist after the new rows render.
    const sync = () => setFilter(readArchiveFilter())
    sync()
    const timer = window.setInterval(sync, 250)
    return () => window.clearInterval(timer)
  }, [])
  return filter
}

export function IdleControls({ listSelector, scrollportSelector, browsingSelector, idle, idleGroups, shown, onChange, moreLabel, collapseLabel, loadingLabel, emptyLabel }: IdleControlsProps) {
  const [mount, setMount] = useState<{ list: HTMLElement; end: HTMLElement; scopes: Scope[] } | null>(null)

  useLayoutEffect(() => {
    const scrollport = document.querySelector(scrollportSelector)
    if (scrollport === null) return
    const end = document.createElement('div')
    end.dataset.dshWorkspaceListEnd = ''
    let current: HTMLElement | null = null
    let scopes: Scope[] = []
    const sync = () => {
      const list = current?.isConnected && current.matches(listSelector) ? current : scrollport.querySelector<HTMLElement>(listSelector)
      if (list === null) end.remove()
      else if (list.lastElementChild !== end) list.append(end)
      const tree = list?.matches(browsingSelector) ? list.querySelector<HTMLElement>('[role="tree"]') : null
      const headers = [...(tree?.querySelectorAll<HTMLElement>(WORKSPACE_ROW) ?? [])]
        .filter(row => !row.closest('[aria-hidden="true"]'))
      const previous = new Map(scopes.map(scope => [scope.row, scope]))
      const next: Scope[] = []
      if (tree !== null && headers.length === 0) {
        next.push(previous.get(tree) ?? { key: null, row: tree, section: tree, container: end })
      }
      for (const row of headers) {
        const key = row.dataset.rowKey?.slice(WORKSPACE.length)
        if (key === undefined || row.getAttribute('aria-expanded') !== 'true') continue
        // The real workspace heading is wrapped by the native hover card.
        const section = row.parentElement?.matches('span') ? row.parentElement.parentElement : row.parentElement
        if (section == null) continue
        const old = previous.get(row)
        const scope = old?.section === section ? old : { key, row, section, container: document.createElement('div') }
        scope.container.dataset.dshWorkspaceIdleGroup = ''
        if (section.lastElementChild !== scope.container) {
          const focused = document.activeElement
          section.append(scope.container)
          if (focused instanceof HTMLElement && scope.container.contains(focused)) focused.focus({ preventScroll: true })
        }
        next.push(scope)
      }
      if (list === current && scopes.length === next.length && scopes.every((scope, index) => scope === next[index])) return
      const retained = new Set(next)
      for (const scope of scopes) if (scope.container !== end && !retained.has(scope)) scope.container.remove()
      current = list
      scopes = next
      setMount(list === null ? null : { list, end, scopes })
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(scrollport, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded', 'aria-hidden', 'tabindex'] })
    return () => {
      observer.disconnect()
      for (const scope of scopes) scope.container.remove()
      end.remove()
    }
  }, [listSelector, scrollportSelector, browsingSelector])

  if (mount === null) return null
  return <>
    {createPortal(<div data-dsh-workspace-attention-empty="">{emptyLabel}</div>, mount.end)}
    {mount.scopes.map(scope => {
      const candidates = scope.key === null ? idle : idleGroups.get(scope.key)
      if (candidates === undefined || candidates.size === 0) return null
      return <IdlePageControl key={JSON.stringify(scope.key)}
        {...{ scope, list: mount.list, scrollportSelector, browsingSelector, moreLabel, collapseLabel, loadingLabel, onChange }}
        idle={candidates} shown={shown.get(scope.key) ?? null} />
    })}
  </>
}

function readArchiveFilter(): ArchiveFilter {
  try {
    const filter: unknown = JSON.parse(window.localStorage.getItem(workspaceViewKey) ?? 'null')?.archivedFilter
    if (filter === 'only' || filter === 'show') return filter
  } catch {
    // Use the native default if storage is unavailable or malformed.
  }
  return 'default'
}

function addedRows(list: HTMLElement, ids: readonly string[]) {
  const selectors = ids.map(id => `[data-row-key="session:${CSS.escape(id)}"]`)
  if (selectors.length === 0) return []
  return [...list.querySelectorAll<HTMLElement>(selectors.join(', '))].filter(row =>
    !row.closest('[aria-hidden="true"]') && row.getClientRects().length > 0,
  )
}

function IdlePageControl({ scope, list, scrollportSelector, browsingSelector, idle, shown, onChange, moreLabel, collapseLabel, loadingLabel }: Pick<IdleControlsProps,
  'scrollportSelector' | 'browsingSelector' | 'idle' | 'onChange' | 'moreLabel' | 'collapseLabel' | 'loadingLabel'> & {
  scope: Scope
  list: HTMLElement
  shown: readonly string[] | null
}) {
  const { key, row, section, container } = scope
  const [hasMore, setHasMore] = useState(true)
  const [busy, setBusy] = useState(false)
  const request = useRef<AbortController | null>(null)
  const latestIdle = useRef(idle)
  const reveal = useRef<{ ids: string[]; keyboard: boolean } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const activationKeyHeld = useRef(false)
  const canCollapse = shown !== null && !hasMore

  useLayoutEffect(() => {
    latestIdle.current = idle
  }, [idle])

  useLayoutEffect(() => () => request.current?.abort(), [scope, list])

  useEffect(() => {
    if (busy || shown === null) return
    const sync = () => {
      if (request.current === null) setHasMore(scanIdlePage(section, idle, key, shown, 0).hasMore)
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(section, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded', 'aria-hidden'] })
    return () => observer.disconnect()
  }, [section, idle, key, shown, busy])

  useEffect(() => {
    if (shown === null || busy || reveal.current === null) return
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
      const added = addedRows(section, page.ids)
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
  }, [shown, list, section, scrollportSelector, busy])

  const showNextPage = async (keyboard: boolean) => {
    if (request.current !== null) return
    if (canCollapse) {
      reveal.current = null
      onChange(key, null)
      return
    }
    const browsing = () => list.contains(row) && list.matches(browsingSelector) && !row.closest('[aria-hidden="true"]')
      && (key === null || row.getAttribute('aria-expanded') === 'true')
    if (!browsing()) return
    const ids: string[] = []
    let committed = shown
    let page = scanIdlePage(section, idle, key, committed ?? EMPTY_SELECTION, IDLE_PAGE_SIZE)
    const applyPage = () => {
      const changed = page.added.length > 0 || page.shown.length !== (committed?.length ?? 0)
      if (changed || (committed === null && page.boundary === undefined)) {
        committed = page.shown
        onChange(key, page.shown)
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
        page = scanIdlePage(section, latestIdle.current, key, page.shown, IDLE_PAGE_SIZE - ids.length)
        applyPage()
      }
      reveal.current = { ids, keyboard }
    } finally {
      request.current = null
      setBusy(false)
    }
  }

  const label = busy ? loadingLabel : canCollapse ? collapseLabel : moreLabel
  // The native heading renders its title after the folder and chevron cells.
  const workspaceName = key === null ? undefined : row.children[2]?.textContent?.trim()
  return createPortal(<button
    ref={button}
    type="button"
    data-dsh-workspace-idle-toggle=""
    aria-label={workspaceName ? `${label} · ${workspaceName}` : undefined}
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
  >{label}</button>, container)
}
