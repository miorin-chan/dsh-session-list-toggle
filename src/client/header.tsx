import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
// DSH 0.2.2-rc.5 Web module table, @deepseek-ai/dsh-client-ui-primitives src/index.ts.
import { Button, IconTriangleRightFillRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { LIST_CLOSING } from './list-motion.js'
import type { Mode } from './index.js'

export const SCROLLPORT = '[data-sidebar-scrollport]'
const HEADER = '[data-sidebar-workspace-header]'
const MOUNT = '[data-dsh-session-list-heading]'
const BUTTON = '[data-dsh-session-list-toggle]'
const LABEL = '[data-dsh-session-list-label]'
const TITLE = '[data-dsh-session-list-title]'
const ARROW = '[data-dsh-session-list-arrow]'
const COUNT = '[data-dsh-session-list-count]'
const SEARCH_INPUT = 'input[tabindex]'
const SEARCHING = 'input[tabindex="0"]'
const LIST_AREA = '[data-sidebar-list-area]'
function ownedList(mode?: Mode, browsing = true) {
  const trigger = `${BUTTON}${mode === undefined ? '' : `[data-mode="${mode}"]`}`
  const excludeSearch = browsing ? `:not(:has(> ${HEADER} ${SEARCHING}))` : ''
  return `${SCROLLPORT} :has(> ${HEADER} > ${MOUNT} > ${trigger})${excludeSearch} > ${LIST_AREA}`
}
export const LIST = ownedList(undefined, false)
export const BROWSING_LIST = ownedList()
export const ATTENTION_LIST = ownedList('attention')

// @deepseek-ai/dsh-client-ui-workspace 0.2.2-rc.5,
// src/client/rows/WorkspaceBrowser.module.css: sectionLabel, sectionLabelHidden, iconButton.
export const HEADER_STYLE = `
  ${HEADER} > ${MOUNT}:has(> ${BUTTON}) + span { display: none; }
  ${HEADER} > ${MOUNT}:has(> ${BUTTON}) {
    flex: 0 1 auto;
    max-inline-size: calc(45% + 24px);
    min-inline-size: 0;
    position: relative;
    inset-inline-start: -5px;
    margin: 0;
    font: inherit;
    opacity: 1;
    visibility: visible;
    transition: max-inline-size 180ms var(--ds-ease-in-out, ease-in-out),
      opacity 120ms var(--ds-ease-in-out, ease-in-out),
      transform 180ms var(--ds-ease-in-out, ease-in-out), visibility 0s;
  }
  ${HEADER} > ${MOUNT}:has(${COUNT}) { max-inline-size: calc(45% + 48px); }
  ${HEADER}:has(${SEARCHING}) > ${MOUNT} {
    max-inline-size: 0;
    opacity: 0;
    visibility: hidden;
    transform: translateX(-4px);
    pointer-events: none;
    transition-delay: 0s, 0s, 0s, 180ms;
  }
  ${HEADER} ${BUTTON} {
    display: inline-flex;
    max-inline-size: 100%;
    block-size: 24px;
    gap: 3px;
    padding: 0;
    padding-inline-start: 4px;
    border-radius: 6px;
    font: inherit;
    line-height: 20px;
    text-align: start;
    color: var(--dsw-alias-label-tertiary);
    transition: color 100ms ease;
  }
  /* Match the disclosure feedback in Watched Sessions and Background Jobs. */
  ${HEADER} ${BUTTON}:active:not(:disabled) { background: transparent; }
  @media (hover: hover) {
    ${HEADER} ${BUTTON}:hover:not(:disabled) { background: transparent; }
    ${HEADER} ${BUTTON}:hover, ${HEADER} ${BUTTON}:hover ${ARROW} {
      color: var(--dsw-alias-label-secondary);
    }
  }
  ${HEADER} ${BUTTON}:focus-visible {
    outline: var(--dsw-focus-ring-width, 1px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
    outline-offset: -2px;
  }
  /* Match the label group in Watched Sessions and Background Jobs. */
  ${BUTTON} > ${LABEL} {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    min-inline-size: 0;
    line-height: 20px;
  }
  ${LABEL} > ${TITLE} {
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  ${LABEL} > ${COUNT} {
    flex: none;
    font-variant-numeric: tabular-nums;
  }
  ${BUTTON} > ${ARROW} {
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: 22px;
    block-size: 24px;
    color: var(--dsw-alias-label-caption);
    transition: color 100ms ease;
  }
  ${ARROW} > svg {
    display: block;
    transform: rotate(90deg);
    transition: transform 150ms var(--ds-ease-in-out, ease-in-out);
  }
  ${BUTTON}[data-mode="collapsed"] ${ARROW} > svg { transform: rotate(0deg); }
  ${BUTTON}[data-mode="collapsed"]:dir(rtl) ${ARROW} > svg { transform: rotate(180deg); }
  ${ownedList('collapsed')} { display: none; }
  ${ownedList('collapsed')}[${LIST_CLOSING}] {
    display: block;
    interactivity: inert;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    ${HEADER} > ${MOUNT}:has(> ${BUTTON}), ${HEADER} ${BUTTON}, ${BUTTON} > ${ARROW}, ${ARROW} > svg {
      transition: none;
    }
  }
`

// DSH has no header slot. Keep native search, menus and list in their own React
// tree. Mount only the title control before them, in DOM and keyboard order.
function useHeaderMount(wide: boolean) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [mount, setMount] = useState<{ target: HTMLElement; title: string; searching: boolean } | null>(null)
  useLayoutEffect(() => {
    if (!wide || anchor.current === null) return
    let ancestor = anchor.current.parentElement
    while (ancestor !== null && ancestor.querySelector(SCROLLPORT) === null) ancestor = ancestor.parentElement
    const sidebar = ancestor
    if (sidebar === null) return
    const target = document.createElement('h2')
    target.setAttribute('data-dsh-session-list-heading', '')
    let header: Element | undefined
    let browser: Element | null | undefined
    const sync = () => {
      const [candidate, otherHeader] = sidebar.querySelectorAll(`${SCROLLPORT} ${HEADER}`)
      header = otherHeader === undefined ? candidate : undefined
      browser = header?.parentElement
      const [list, otherList] = browser?.querySelectorAll(`:scope > ${LIST_AREA}`) ?? []
      // The title is the leading span; popup anchors can add other direct spans.
      const leading = header?.firstElementChild
      const titleNode = leading === target ? target.nextElementSibling : leading
      const [input, otherInput] = header?.querySelectorAll<HTMLInputElement>(SEARCH_INPUT) ?? []
      const title = titleNode?.textContent?.trim()
      if (!list || otherList || !titleNode?.matches('span') || !title || !input || otherInput
        || (input.tabIndex !== 0 && input.tabIndex !== -1)) {
        target.remove()
        setMount(null)
        return
      }
      if (target.nextElementSibling !== titleNode) titleNode.before(target)
      const searching = input.tabIndex === 0
      target.inert = searching
      setMount(previous => previous?.target === target && previous.title === title && previous.searching === searching
        ? previous : { target, title, searching })
    }
    sync()
    const observer = new MutationObserver(records => {
      // List rows can churn independently of the toolbar. Only resync for a
      // toolbar change, initial mount, or replacement of its containing tree.
      if (header === undefined || !sidebar.contains(header) || records.some(({ target: node }) =>
        node === browser || (header?.contains(node) && !target.contains(node)))) sync()
    })
    observer.observe(sidebar, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['tabindex'] })
    return () => {
      observer.disconnect()
      target.remove()
    }
  }, [wide])
  return { anchor, mount }
}

// Outline of the native disclosure icon, which has no outline variant.
// @deepseek-ai/dsh-client-ui-primitives 0.2.2-rc.5, IconTriangleRightFillRegular.
const TRIANGLE = 'M5.5 4.5C5.5 4.40714 5.52586 4.31612 5.57467 4.23713C5.62349 4.15815 5.69334 4.09431 5.77639 4.05279C5.85945 4.01126 5.95242 3.99368 6.0449 4.00202C6.13738 4.01036 6.22572 4.04429 6.3 4.1L10.967 7.6C11.0291 7.64657 11.0795 7.70697 11.1142 7.77639C11.1489 7.84582 11.167 7.92238 11.167 8C11.167 8.07762 11.1489 8.15418 11.1142 8.22361C11.0795 8.29303 11.0291 8.35343 10.967 8.4L6.3 11.9C6.22572 11.9557 6.13738 11.9896 6.0449 11.998C5.95242 12.0063 5.85945 11.9887 5.77639 11.9472C5.69334 11.9057 5.62349 11.8419 5.57467 11.7629C5.52586 11.6839 5.5 11.5929 5.5 11.5V4.5Z'

export function ListHeading({ wide, mode, label, current, count, countDescription, onCycle }: {
  wide: boolean; mode: Mode; label: string; current: string; count?: string; countDescription?: string; onCycle: () => void
}) {
  const { anchor, mount } = useHeaderMount(wide)
  const description = countDescription === undefined ? current : `${current} · ${countDescription}`
  return <>
    <span hidden ref={anchor} />
    {wide && mount && createPortal(
      <Tooltip label={`${description} · ${label}`} side="bottom" delayMs={500} disabled={mount.searching} portal>
        <Button size="sm" variant="ghost" data-dsh-session-list-toggle="" data-mode={mode}
          aria-expanded={mode !== 'collapsed'} aria-label={`${mount.title} — ${label}`}
          aria-description={description} onClick={onCycle}>
          <span data-dsh-session-list-label="">
            <span data-dsh-session-list-title="">{mount.title}</span>
            {count !== undefined && <span data-dsh-session-list-count="" aria-hidden="true">{count}</span>}
          </span>
          <span data-dsh-session-list-arrow="" aria-hidden="true">
            {mode === 'attention' ? (
              <svg width="16" height="16" viewBox="0 0 16 16"
                fill="none" stroke="currentColor" strokeLinejoin="round"><path d={TRIANGLE} /></svg>
            ) : <IconTriangleRightFillRegular size={16} />}
          </span>
        </Button>
      </Tooltip>,
      mount.target,
    )}
  </>
}
