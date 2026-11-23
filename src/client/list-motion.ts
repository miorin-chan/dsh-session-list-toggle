import { useLayoutEffect, useRef } from 'react'
import type { Mode } from './index.js'

export const LIST_MOTION_MS = 180
export const LIST_CLOSING = 'data-dsh-workspace-list-closing'
const ROW = '[data-row-key]:not([aria-hidden="true"], [aria-hidden="true"] *)'

function readRows(list: HTMLElement) {
  return [...list.querySelectorAll<HTMLElement>(ROW)].flatMap(row => {
    const rect = row.getBoundingClientRect()
    return rect.height > 0 ? [{ row, top: rect.top, bottom: rect.bottom }] : []
  })
}

export function useListMotion(mode: Mode, wide: boolean, selector: string, scrollportSelector: string) {
  const pending = useRef<{
    list: HTMLElement
    before: DOMRect
    rows: Map<HTMLElement, { top: number; bottom: number }> | null
  } | null>(null)
  const activeList = useRef<HTMLElement | null>(null)
  const deferredOpen = useRef<{ frame: number; before: DOMRect } | null>(null)
  const viewportMotion = useRef<{ list: HTMLElement; animation: Animation } | null>(null)
  const rowMotions = useRef(new Set<Animation>())

  function stopViewport() {
    if (deferredOpen.current !== null) cancelAnimationFrame(deferredOpen.current.frame)
    deferredOpen.current = null
    const current = viewportMotion.current
    viewportMotion.current = null
    current?.animation.cancel()
    current?.list.removeAttribute(LIST_CLOSING)
  }

  function stopRows() {
    for (const animation of rowMotions.current) animation.cancel()
    rowMotions.current.clear()
  }

  useLayoutEffect(() => {
    if (!wide) return
    const scrollport = document.querySelector(scrollportSelector)
    if (scrollport === null) return
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const stop = () => {
      stopViewport()
      stopRows()
      pending.current = null
      activeList.current = null
    }
    const active = () => deferredOpen.current !== null || viewportMotion.current !== null || rowMotions.current.size > 0
    const observer = new MutationObserver(() => {
      if (active() && scrollport.querySelector(selector) !== activeList.current) stop()
    })
    observer.observe(scrollport, { childList: true, subtree: true, attributes: true, attributeFilter: ['tabindex'] })
    const onPreferenceChange = () => { if (motionPreference.matches) stop() }
    const onFocus = (event: Event) => {
      if (active() && event.target instanceof Node && activeList.current?.contains(event.target)) stop()
    }
    motionPreference.addEventListener('change', onPreferenceChange)
    scrollport.addEventListener('focusin', onFocus)
    return () => {
      observer.disconnect()
      motionPreference.removeEventListener('change', onPreferenceChange)
      scrollport.removeEventListener('focusin', onFocus)
      stop()
    }
  }, [wide, selector, scrollportSelector])

  useLayoutEffect(() => {
    const snapshot = pending.current
    pending.current = null
    if (snapshot === null || !wide) return
    const { list, before, rows } = snapshot
    if (!list.isConnected || !list.matches(selector)) return
    activeList.current = list

    const closing = mode === 'collapsed'
    // Leave the outgoing list painted while it shrinks. Reading its hidden
    // layout first could clamp the native scroll position before the animation.
    if (closing && before.height > 0) list.setAttribute(LIST_CLOSING, '')
    const options = {
      duration: LIST_MOTION_MS,
      easing: getComputedStyle(list).getPropertyValue('--ds-ease-in-out').trim() || 'ease-in-out',
    }
    function animateViewport(height: number) {
      if (before.height === height) return
      // A flex basis keeps the animated size effective inside the native flex column.
      const animation = list.animate({
        flexBasis: [`${before.height}px`, `${height}px`],
        flexGrow: [0, 0],
        flexShrink: [0, 0],
      }, { ...options, fill: 'both' })
      viewportMotion.current = { list, animation }
      animation.onfinish = () => {
        if (viewportMotion.current?.animation === animation) stopViewport()
      }
    }

    function open() {
      if (!list.isConnected || !list.matches(selector)) return
      const after = list.getBoundingClientRect()
      const nextRows = rows === null ? [] : readRows(list)
      const viewport = list.closest(scrollportSelector)?.getBoundingClientRect()
      const visibleTop = Math.max(after.top, viewport?.top ?? 0, 0)
      const visibleBottom = Math.min(after.bottom, viewport?.bottom ?? window.innerHeight, window.innerHeight)
      animateViewport(after.height)
      if (rows === null) return

      // A newly visible run opens from the old boundary between its neighbours.
      // Clip each entering row as that gap grows to keep adjacent rows from painting over one another.
      let boundary = [...rows.values()].at(-1)?.bottom ?? after.top
      for (const { row, top, bottom } of nextRows.reverse()) {
        const old = rows.get(row)
        if (old !== undefined) boundary = old.top
        if (old === undefined && mode !== 'all') continue
        const start = old?.top ?? boundary
        const end = old?.bottom ?? start
        if (Math.max(end, bottom) <= visibleTop || Math.min(start, top) >= visibleBottom) continue
        const offset = start - top
        if (old !== undefined && Math.abs(offset) < 0.5) continue
        const frames: PropertyIndexedKeyframes = { translate: [`0 ${offset}px`, '0 0'] }
        if (old === undefined) frames.clipPath = ['inset(0 0 100% 0)', 'inset(0)']
        const animation = row.animate(frames, { ...options, fill: 'backwards' })
        rowMotions.current.add(animation)
        animation.onfinish = () => rowMotions.current.delete(animation)
      }
    }

    if (closing) {
      animateViewport(0)
    } else if (mode === 'attention') {
      // Measure after the attention controls and empty state have mounted in their portals.
      const frame = requestAnimationFrame(() => {
        deferredOpen.current = null
        open()
      })
      deferredOpen.current = { frame, before }
    } else {
      open()
    }
  }, [mode, wide, selector, scrollportSelector])

  return (next: Mode) => {
    const list = document.querySelector<HTMLElement>(selector)
    const animate = list !== null && typeof list.animate === 'function'
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      && (next !== 'collapsed' || CSS.supports('interactivity: inert'))
    if (animate) {
      const deferred = deferredOpen.current
      const before = deferred?.before ?? list.getBoundingClientRect()
      const trackRows = deferred === null && (next === 'all' || (next === 'attention' && before.height > 0))
      const rows = trackRows ? new Map(readRows(list)
        .map(({ row, top, bottom }) => [row, { top, bottom }])) : null
      pending.current = { list, before, rows }
    }
    // Measure before cancelling so rapid clicks pick up the current visual geometry.
    stopViewport()
    if (!animate || next !== 'collapsed') stopRows()
  }
}
