import { useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SnapshotSelectorHook, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionStatusSnapshot, UseSessions, UseSessionStatus } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { attentionSessionIds } from './attention.js'

const NS = 'dsh-workspace-list-toggle'
// DSH IconQueueOutlineRegular artwork. See THIRD-PARTY-NOTICES.txt.
const EMPTY_ICON = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="black">
  <path d="M5 6.75H11" />
  <path d="M5 9H8" />
  <path d="M2.37067 11.2497C1.5872 9.89252 1.32042 8.29798 1.61945 6.7597C1.91847 5.22141 2.76317 3.84293 3.99801 2.87809C5.23285 1.91325 6.7747 1.427 8.33964 1.50888C9.90458 1.59076 11.3873 2.23526 12.5147 3.32369C13.6422 4.41232 14.3384 5.8717 14.4751 7.43304C14.6118 8.99438 14.1797 10.5525 13.2585 11.8205C12.3372 13.0885 10.9889 13.9809 9.4617 14.3334C8.18666 14.6277 6.8587 14.529 5.64964 14.0601C5.17095 13.8745 4.76937 13.4929 4.26509 13.3963C3.67389 13.2832 2.95232 13.5595 2.0377 14.3334" />
</svg>`)}`

const LABELS = {
  en: { hide: 'Collapse session list', attention: 'Show pinned sessions and sessions needing attention', show: 'Show full session list', empty: 'No pinned sessions or sessions needing attention', loading: 'Loading sessions…' },
  zh: { hide: '收起会话列表', attention: '显示置顶和需关注的会话', show: '显示全部会话', empty: '没有置顶或需关注的会话', loading: '正在加载会话…' },
  ja: { hide: 'セッション一覧を折りたたむ', attention: 'ピン留め済みと要確認のセッションを表示', show: 'すべてのセッションを表示', empty: 'ピン留め済みや要確認のセッションはありません', loading: '読み込み中…' },
  de: { hide: 'Sitzungsliste einklappen', attention: 'Angeheftete Sitzungen und Sitzungen mit Handlungsbedarf anzeigen', show: 'Alle Sitzungen anzeigen', empty: 'Keine angehefteten Sitzungen oder Sitzungen mit Handlungsbedarf', loading: 'Sitzungen werden geladen…' },
  es: { hide: 'Contraer la lista de sesiones', attention: 'Mostrar las sesiones fijadas y las que requieren atención', show: 'Mostrar todas las sesiones', empty: 'No hay sesiones fijadas ni sesiones que requieran atención', loading: 'Cargando sesiones…' },
  fr: { hide: 'Replier la liste des sessions', attention: 'Afficher les sessions épinglées et celles à suivre', show: 'Afficher toutes les sessions', empty: 'Aucune session épinglée ou à suivre', loading: 'Chargement des sessions…' },
  pt: { hide: 'Recolher a lista de sessões', attention: 'Mostrar sessões fixadas e sessões que exigem atenção', show: 'Mostrar todas as sessões', empty: 'Não há sessões fixadas nem sessões que exijam atenção', loading: 'Carregando sessões…' },
  ru: { hide: 'Свернуть список сеансов', attention: 'Показать закреплённые сеансы и сеансы, требующие внимания', show: 'Показать все сеансы', empty: 'Нет закреплённых сеансов или сеансов, требующих внимания', loading: 'Загрузка сеансов…' },
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
const SESSION_ROW = '[data-row-key^="session:"]'
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
  ${BUTTON}[data-mode="all"] > svg { transform: rotate(90deg); }
  ${BUTTON}[data-mode="attention"] > svg { transform: rotate(45deg); }
  @media (prefers-reduced-motion: reduce) {
    ${BUTTON} > svg,
    ${BROWSING}:has(${BUTTON}) ${LIST} { transition: none; }
  }
`

const nextMode = { all: 'collapsed', collapsed: 'attention', attention: 'all' } as const
type Mode = keyof typeof nextMode
const nextLabel = { all: 'hide', collapsed: 'attention', attention: 'show' } as const

interface AttentionProps {
  useSessions: UseSessions
  useSessionStatus: UseSessionStatus
  useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>
  t: TranslateNS<typeof NS>
}

function AttentionFilter({ useSessions, useSessionStatus, useWorkspaces, t }: AttentionProps) {
  const list = useSessions((value: SessionListState) => value)
  const statuses = useSessionStatus((value: SessionStatusSnapshot) => value)
  const workspace: WorkspaceSnapshot = useWorkspaces((value: WorkspaceSnapshot) => value)
  const ids = attentionSessionIds(list, statuses, workspace)
  const pending = new Set(ids)
  const activeSessionsByGroup = new Map<string, typeof ids>()
  const activeWorkspaces = workspace.items.filter(item => {
    const active = item.sessionIds.filter(id => pending.delete(id))
    if (active.length === 0) return false
    activeSessionsByGroup.set(item.workspaceId, active)
    return true
  })
  if (pending.size > 0) activeSessionsByGroup.set('', [...pending]) // Native Ungrouped key.
  const row = (key: string) => `[data-row-key="${CSS.escape(key)}"]`
  const groupRows = [...activeSessionsByGroup.keys()].map(key => row(`workspace:${key}`))
  const sessionRows = ids.map(id => row(`session:${id}`))
  const keep = [...sessionRows, ...groupRows].join(', ') || ':not(*)'
  const scope = `${BROWSING}:has(${BUTTON}[data-mode="attention"]) ${LIST}`
  // Native child headings disappear under folded ancestors. A filesystem ancestor
  // is only a fallback when the matching child heading is absent from the list.
  const hiddenDescendants = activeWorkspaces.flatMap(item => {
    const ancestors = workspace.items.filter(candidate => candidate.path !== item.path && (
      item.path.startsWith(candidate.path.replace(/\/+$/, '') + '/') ||
      item.path.startsWith(candidate.path.replace(/\\+$/, '') + '\\')
    )).map(candidate => row(`workspace:${candidate.workspaceId}`))
    if (ancestors.length === 0) return []
    return [{ anchor: row(`workspace:${item.workspaceId}`), ancestors }]
  })
  const ancestorRows = hiddenDescendants.flatMap(item => item.ancestors)
  const emptyList = `${scope}:not(:has(${[...sessionRows, ...groupRows, ...ancestorRows].join(', ') || ':not(*)'}))`
  const overflowRules = [...activeSessionsByGroup].map(([key, active]) => {
    const allRendered = active.map(id => `:has(${row(`session:${id}`)})`).join('')
    const overflow = row(`overflow:${key}`)
    return `${scope} div${allRendered} > ${overflow}[aria-expanded="false"] { display: none; }`
  }).join('')
  const activeOverflow = [...activeSessionsByGroup.keys()].map(key => row(`overflow:${key}`)).join(', ') || ':not(*)'
  const group = 'div:has(> [data-row-key^="workspace:"], > span > [data-row-key^="workspace:"])'
  return <style>{`
    ${scope} ${SESSION_ROW}:not(:is(${sessionRows.join(', ') || ':not(*)'})),
    ${scope} ${group}:not(:has(${keep})),
    ${scope} [data-row-key^="overflow:"]:not(:is(${activeOverflow})),
    ${scope} [data-row-key="empty"] { display: none; }
    ${overflowRules}
    ${hiddenDescendants.map(({ anchor, ancestors }) => `
      ${scope}:not(:has(${anchor})) ${group}:has(:is(${ancestors.join(', ')})) {
        display: block;
      }
    `).join('')}
    ${emptyList}::before {
      content: '';
      display: block;
      inline-size: 24px;
      block-size: 24px;
      margin: 80px auto 12px;
      background-color: var(--dsw-alias-label-caption);
      mask: url("${EMPTY_ICON}") center / contain no-repeat;
    }
    ${emptyList}::after {
      content: ${JSON.stringify(t(list.phase === 'pending' ? 'loading' : 'empty'))};
      display: block;
      padding-inline: 12px;
      color: var(--dsw-alias-label-tertiary);
      font-size: 13px;
      line-height: 20px;
      text-align: center;
    }
  `}</style>
}

export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  // Keep the preference for this page even if the sidebar footer remounts.
  let listMode: Mode = 'all'
  ctx.effect(() => ctx.locale.register(NS, LABELS))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: NS, locale: NS,
  }, function ListToggle({ t, wide, useSessions, useSessionStatus, useWorkspaces }) {
    const [mode, setMode] = useState(listMode)
    if (!wide) return null
    const label = t(nextLabel[mode])
    return <>
      <style>{STYLE}</style>
      <button
        type="button"
        data-dsh-workspace-list-toggle=""
        data-mode={mode}
        aria-expanded={mode !== 'collapsed'}
        aria-label={label}
        title={label}
        onClick={() => {
          listMode = nextMode[mode]
          setMode(listMode)
        }}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"
          stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6.5 5 3 3-3 3" />
        </svg>
      </button>
      {mode === 'attention' && <AttentionFilter {...{ t, useSessions, useSessionStatus, useWorkspaces }} />}
    </>
  }))
}
