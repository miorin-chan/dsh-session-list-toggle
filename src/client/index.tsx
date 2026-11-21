import { useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

const NS = 'dsh-workspace-list-toggle'
const LABELS = {
  en: { hide: 'Hide workspace and session list', show: 'Show workspace and session list' },
  zh: { hide: '隐藏工作区和会话列表', show: '显示工作区和会话列表' },
  ja: { hide: 'ワークスペースとセッションの一覧を隠す', show: 'ワークスペースとセッションの一覧を表示' },
  de: { hide: 'Arbeitsbereichs- und Sitzungsliste ausblenden', show: 'Arbeitsbereichs- und Sitzungsliste anzeigen' },
  es: { hide: 'Ocultar la lista de espacios de trabajo y sesiones', show: 'Mostrar la lista de espacios de trabajo y sesiones' },
  fr: { hide: 'Masquer la liste des espaces de travail et des sessions', show: 'Afficher la liste des espaces de travail et des sessions' },
  pt: { hide: 'Ocultar a lista de espaços de trabalho e sessões', show: 'Mostrar a lista de espaços de trabalho e sessões' },
  ru: { hide: 'Скрыть список рабочих областей и сеансов', show: 'Показать список рабочих областей и сеансов' },
} as const

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    [NS]: keyof typeof LABELS.en
  }
}

// The footer slot supplies the button. These native DOM markers locate the
// title and list without changing their React ownership.
const SCROLLPORT = '[data-sidebar-scrollport]'
const HEADER = `${SCROLLPORT} [data-sidebar-workspace-header]`
const TITLE = `${HEADER} > span:first-child`
const BUTTON = '[data-dsh-workspace-list-toggle]'
const LIST = `${SCROLLPORT} [data-sidebar-list-area]`
const BROWSING = `body:has(${TITLE}):not(:has(${HEADER} input[tabindex="0"]))`
const STYLE = `
  ${BUTTON} { display: none; }
  @supports (anchor-name: --dsh-workspace-list-title) and (position-visibility: anchors-visible) {
    body:has(${BUTTON}) ${TITLE} {
      anchor-name: --dsh-workspace-list-title;
    }
    body:has(${BUTTON}) ${HEADER}:not(:has(input[tabindex="0"])) > span:first-child {
      margin-right: 24px;
    }
    ${BROWSING}:has(${BUTTON}[aria-expanded="false"]) ${LIST} { display: none; }
    /* Match the native scroller's viewport cap so long lists start shrinking immediately. */
    @supports (block-size: calc-size(auto, min(size, 100cqh))) and (interactivity: inert) {
      ${BROWSING}:has(${BUTTON}) ${LIST} {
        flex: 0 1 auto;
        block-size: calc-size(auto, min(size, 100cqh - var(--workspace-toolbar-height, 36px)));
        transition: block-size 180ms ease-in-out, opacity 180ms ease-in-out, visibility 180ms;
      }
      ${BROWSING}:has(${BUTTON}[aria-expanded="false"]) ${LIST} {
        display: block;
        block-size: 0;
        opacity: 0;
        visibility: hidden;
        interactivity: inert;
        pointer-events: none;
      }
    }
    ${BROWSING} ${BUTTON} {
      display: grid;
      position: fixed;
      position-anchor: --dsh-workspace-list-title;
      position-visibility: anchors-visible;
      top: anchor(center);
      left: calc(anchor(right) + 3px);
      translate: 0 -50%;
      z-index: 1;
    }
  }
  ${BUTTON} {
    place-items: center;
    inline-size: 22px;
    block-size: 24px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--dsw-alias-content-secondary, currentColor);
    cursor: pointer;
  }
  ${BUTTON}:hover { background: var(--dsw-alias-fill-hover, transparent); }
  ${BUTTON}:focus-visible { outline: 1px solid currentColor; outline-offset: 1px; }
  ${BUTTON} > svg {
    transform: rotate(0deg);
    transition: transform 160ms ease-in-out;
  }
  ${BUTTON}[aria-expanded="true"] > svg { transform: rotate(90deg); }
  @media (prefers-reduced-motion: reduce) {
    ${BUTTON} > svg,
    ${BROWSING}:has(${BUTTON}) ${LIST} { transition: none; }
  }
`

export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  // Keep the preference for this page even if the sidebar footer remounts.
  let listVisible = true
  ctx.effect(() => ctx.locale.register(NS, LABELS))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: NS, locale: NS,
  }, function ListToggle({ t, wide }) {
    const [visible, setVisible] = useState(listVisible)
    if (!wide) return null
    const label = t(visible ? 'hide' : 'show')
    return <>
      <style>{STYLE}</style>
      <button
        type="button"
        data-dsh-workspace-list-toggle=""
        aria-expanded={visible}
        aria-label={label}
        title={label}
        onClick={() => {
          listVisible = !listVisible
          setVisible(listVisible)
        }}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"
          stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6.5 5 3 3-3 3" />
        </svg>
      </button>
    </>
  }))
}
