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

// The native list is not its own slot. Scope the style to the sidebar scrollport
// and its list body. If the marker changes, the selector matches nothing.
const STYLE = `
  body:has([data-dsh-workspace-list-toggle][aria-expanded="false"])
    [data-sidebar-scrollport] [data-sidebar-list-area] { display: none; }
  [data-dsh-workspace-list-toggle] {
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--dsw-alias-content-secondary, currentColor);
    cursor: pointer;
  }
  [data-dsh-workspace-list-toggle]:hover { background: var(--dsw-alias-fill-hover, transparent); }
  [data-dsh-workspace-list-toggle]:focus-visible { outline: 1px solid currentColor; outline-offset: 1px; }
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
          stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4h6m-6 4h4m-4 4h6" />
          <path d={visible ? 'm9 10 2.5-2.5L14 10' : 'm9 7 2.5 2.5L14 7'} />
        </svg>
      </button>
    </>
  }))
}
