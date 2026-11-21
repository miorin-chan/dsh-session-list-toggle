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
const LABELS = {
  en: { hide: 'Collapse session list', attention: 'Show sessions needing attention', show: 'Show full session list', empty: 'No sessions need attention', loading: 'Loading sessions…' },
  zh: { hide: '收起会话列表', attention: '仅显示需关注的会话', show: '显示全部会话', empty: '没有需要关注的会话', loading: '正在加载会话…' },
  ja: { hide: 'セッション一覧を折りたたむ', attention: '要確認のセッションを表示', show: 'すべてのセッションを表示', empty: '要確認のセッションはありません', loading: '読み込み中…' },
  de: { hide: 'Sitzungsliste einklappen', attention: 'Sitzungen mit Handlungsbedarf anzeigen', show: 'Alle Sitzungen anzeigen', empty: 'Keine Sitzung erfordert Aufmerksamkeit', loading: 'Sitzungen werden geladen…' },
  es: { hide: 'Contraer la lista de sesiones', attention: 'Mostrar las sesiones que requieren atención', show: 'Mostrar todas las sesiones', empty: 'Ninguna sesión requiere atención', loading: 'Cargando sesiones…' },
  fr: { hide: 'Replier la liste des sessions', attention: 'Afficher les sessions à suivre', show: 'Afficher toutes les sessions', empty: 'Aucune session ne requiert votre attention', loading: 'Chargement des sessions…' },
  pt: { hide: 'Recolher a lista de sessões', attention: 'Mostrar sessões que exigem atenção', show: 'Mostrar todas as sessões', empty: 'Nenhuma sessão requer atenção', loading: 'Carregando sessões…' },
  ru: { hide: 'Свернуть список сеансов', attention: 'Показать сеансы, требующие внимания', show: 'Показать все сеансы', empty: 'Нет сеансов, требующих внимания', loading: 'Загрузка сеансов…' },
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
  const ids = attentionSessionIds(list, statuses, workspace.archivedSessionIds)
  const pending = new Set(ids)
  const activeWorkspaces = workspace.items.filter(item => {
    let hasAttention = false
    for (const id of item.sessionIds) {
      if (pending.delete(id)) hasAttention = true
    }
    return hasAttention
  })
  const row = (key: string) => `[data-row-key="${CSS.escape(key)}"]`
  const activeKeys = activeWorkspaces.map(item => item.workspaceId as string)
  if (pending.size > 0) activeKeys.push('') // The original browser's Ungrouped key.
  const groupRows = activeKeys.map(key => row(`workspace:${key}`))
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
  return <style>{`
    ${scope} ${SESSION_ROW}:not(:is(${sessionRows.join(', ') || ':not(*)'})),
    ${scope} div:has(> [data-row-key^="workspace:"]):not(:has(${keep})),
    ${scope} [data-row-key^="overflow:"]:not(:is(${activeKeys.map(key => row(`overflow:${key}`)).join(', ') || ':not(*)'})),
    ${scope} [data-row-key="empty"] { display: none; }
    ${hiddenDescendants.map(({ anchor, ancestors }) => `
      ${scope}:not(:has(${anchor})) div:has(:is(${ancestors.join(', ')})):has(> [data-row-key^="workspace:"]) {
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
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 6h14M5 12h10M5 18h6m4 0 2 2 4-4' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / contain no-repeat;
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
