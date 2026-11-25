import { useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { PanelInfo, UsePanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SnapshotSelectorHook, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { listHeadingCount, sessionVisibility, workspaceVisibility, type SessionStatusSnapshot } from './attention.js'

type UseSessionStatus = SnapshotSelectorHook<SessionStatusSnapshot>
import { connectDrafts } from './drafts.js'
import { IdleControls, useArchiveFilter } from './idle-control.js'
import { updateIdlePages } from './idle-page.js'
import type { IdlePages } from './idle-page.js'
import { useListMotion } from './list-motion.js'
import { ATTENTION_LIST, BROWSING_LIST, HEADER_STYLE, LIST, ListHeading, SCROLLPORT } from './header.js'

const NS = 'dsh-session-list-toggle'
// DSH IconQueueOutlineRegular artwork. See THIRD-PARTY-NOTICES.txt.
const EMPTY_ICON = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="black">
  <path d="M5 6.75H11" />
  <path d="M5 9H8" />
  <path d="M2.37067 11.2497C1.5872 9.89252 1.32042 8.29798 1.61945 6.7597C1.91847 5.22141 2.76317 3.84293 3.99801 2.87809C5.23285 1.91325 6.7747 1.427 8.33964 1.50888C9.90458 1.59076 11.3873 2.23526 12.5147 3.32369C13.6422 4.41232 14.3384 5.8717 14.4751 7.43304C14.6118 8.99438 14.1797 10.5525 13.2585 11.8205C12.3372 13.0885 10.9889 13.9809 9.4617 14.3334C8.18666 14.6277 6.8587 14.529 5.64964 14.0601C5.17095 13.8745 4.76937 13.4929 4.26509 13.3963C3.67389 13.2832 2.95232 13.5595 2.0377 14.3334" />
</svg>`)}`
const LABELS = {
  en: { modeAll: 'All sessions', modeCollapsed: 'List collapsed', modeAttention: 'Needs attention',
    hide: 'Collapse session list', attention: 'Show the current session, pinned sessions, and sessions needing attention', show: 'Show full session list', empty: 'No pinned sessions or sessions needing attention', loading: 'Loading sessions…',
    expandIdle: 'Show more idle conversations', collapseIdle: 'Show fewer idle conversations',
    totalCount: 'Total sessions: {count}', retainedCount: 'Sessions kept in view: {count}',
    followUpCount: 'Sessions with activity or drafts: {count}', archiveCount: 'Archived sessions: {count}' },
  zh: { modeAll: '全部会话', modeCollapsed: '列表已收起', modeAttention: '需关注',
    hide: '收起会话列表', attention: '显示当前、置顶和需关注的会话', show: '显示全部会话', empty: '没有置顶或需关注的会话', loading: '正在加载会话…',
    expandIdle: '显示更多空闲会话', collapseIdle: '收起空闲会话',
    totalCount: '共 {count} 条会话', retainedCount: '保留 {count} 条会话',
    followUpCount: '{count} 条会话有活动或草稿', archiveCount: '{count} 条已归档会话' },
  ja: { modeAll: 'すべてのセッション', modeCollapsed: '一覧は折りたたまれています', modeAttention: '要確認',
    hide: 'セッション一覧を折りたたむ', attention: '現在のセッション、ピン留め済み、要確認のセッションを表示', show: 'すべてのセッションを表示', empty: 'ピン留め済みや要確認のセッションはありません', loading: '読み込み中…',
    expandIdle: '待機中の会話をさらに表示', collapseIdle: '待機中の会話を非表示',
    totalCount: '全セッション：{count}件', retainedCount: '絞り込み対象：{count}件',
    followUpCount: '活動または下書きのあるセッション：{count}件', archiveCount: 'アーカイブ済み：{count}件' },
  de: { modeAll: 'Alle Sitzungen', modeCollapsed: 'Liste eingeklappt', modeAttention: 'Handlungsbedarf',
    hide: 'Sitzungsliste einklappen', attention: 'Die aktuelle Sitzung, angeheftete Sitzungen und Sitzungen mit Handlungsbedarf anzeigen', show: 'Alle Sitzungen anzeigen', empty: 'Keine angehefteten Sitzungen oder Sitzungen mit Handlungsbedarf', loading: 'Sitzungen werden geladen…',
    expandIdle: 'Weitere inaktive Unterhaltungen anzeigen', collapseIdle: 'Inaktive Unterhaltungen ausblenden',
    totalCount: 'Sitzungen insgesamt: {count}', retainedCount: 'Sitzungen in der Auswahl: {count}',
    followUpCount: 'Sitzungen mit Aktivität oder Entwürfen: {count}', archiveCount: 'Archivierte Sitzungen: {count}' },
  es: { modeAll: 'Todas las sesiones', modeCollapsed: 'Lista contraída', modeAttention: 'Requieren atención',
    hide: 'Contraer la lista de sesiones', attention: 'Mostrar la sesión actual, las fijadas y las que requieren atención', show: 'Mostrar todas las sesiones', empty: 'No hay sesiones fijadas ni sesiones que requieran atención', loading: 'Cargando sesiones…',
    expandIdle: 'Mostrar más conversaciones inactivas', collapseIdle: 'Ocultar conversaciones inactivas',
    totalCount: 'Total de sesiones: {count}', retainedCount: 'Sesiones en la selección: {count}',
    followUpCount: 'Sesiones con actividad o borradores: {count}', archiveCount: 'Sesiones archivadas: {count}' },
  fr: { modeAll: 'Toutes les sessions', modeCollapsed: 'Liste repliée', modeAttention: 'À suivre',
    hide: 'Replier la liste des sessions', attention: 'Afficher la session en cours, les sessions épinglées et celles à suivre', show: 'Afficher toutes les sessions', empty: 'Aucune session épinglée ou à suivre', loading: 'Chargement des sessions…',
    expandIdle: 'Afficher plus de conversations inactives', collapseIdle: 'Masquer les conversations inactives',
    totalCount: 'Total des sessions : {count}', retainedCount: 'Sessions dans la sélection : {count}',
    followUpCount: 'Sessions avec une activité ou un brouillon : {count}', archiveCount: 'Sessions archivées : {count}' },
  pt: { modeAll: 'Todas as sessões', modeCollapsed: 'Lista recolhida', modeAttention: 'Exigem atenção',
    hide: 'Recolher a lista de sessões', attention: 'Mostrar a sessão atual, as sessões fixadas e as que exigem atenção', show: 'Mostrar todas as sessões', empty: 'Não há sessões fixadas nem sessões que exijam atenção', loading: 'Carregando sessões…',
    expandIdle: 'Mostrar mais conversas inativas', collapseIdle: 'Ocultar conversas inativas',
    totalCount: 'Total de sessões: {count}', retainedCount: 'Sessões na seleção: {count}',
    followUpCount: 'Sessões com atividade ou rascunho: {count}', archiveCount: 'Sessões arquivadas: {count}' },
  ru: { modeAll: 'Все сеансы', modeCollapsed: 'Список свёрнут', modeAttention: 'Требуют внимания',
    hide: 'Свернуть список сеансов', attention: 'Показать текущий сеанс, закреплённые сеансы и сеансы, требующие внимания', show: 'Показать все сеансы', empty: 'Нет закреплённых сеансов или сеансов, требующих внимания', loading: 'Загрузка сеансов…',
    expandIdle: 'Показать больше неактивных диалогов', collapseIdle: 'Скрыть неактивные диалоги',
    totalCount: 'Всего сеансов: {count}', retainedCount: 'Сеансов в выборке: {count}',
    followUpCount: 'Сеансов с активностью или черновиками: {count}', archiveCount: 'Архивных сеансов: {count}' },
} as const

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    [NS]: keyof typeof LABELS.en
  }
}

const SESSION_ROW = '[data-row-key^="session:"]'
const LIST_END = '[data-dsh-workspace-list-end]'
const IDLE_BUTTON = '[data-dsh-workspace-idle-toggle]'
const IDLE_GROUP = '[data-dsh-workspace-idle-group]'
const ATTENTION_EMPTY = '[data-dsh-workspace-attention-empty]'

const nextMode = { all: 'collapsed', collapsed: 'attention', attention: 'all' } as const
export type Mode = keyof typeof nextMode
const nextLabel = { all: 'hide', collapsed: 'attention', attention: 'show' } as const
const modeLabel = { all: 'modeAll', collapsed: 'modeCollapsed', attention: 'modeAttention' } as const

interface AttentionProps {
  usePanelInfo: UsePanelInfo
  useSessions: UseSessions
  useSessionStatus: UseSessionStatus
  useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>
  t: TranslateNS<typeof NS>
  draftSource: ReturnType<typeof connectDrafts>
}

function AttentionFilter({ list, workspace, visibility, t, archivedOnly }: {
  list: SessionListState
  workspace: WorkspaceSnapshot
  visibility: ReturnType<typeof sessionVisibility>
  t: TranslateNS<typeof NS>
  archivedOnly: boolean
}) {
  const [shown, setShown] = useState<IdlePages>(() => new Map())
  // The explicit native archive view owns its contents and empty-state action.
  if (archivedOnly) return null
  const { attention, idle } = visibility
  const idleIds = new Set<string>(idle)
  const { activeSessionsByGroup, idleGroups, keptGroups, groupedIds } = workspaceVisibility(
    workspace.items, attention, idle, shown,
  )
  const flatIds = [...attention, ...(shown.get(null) ?? []).filter(id => idleIds.has(id))]
  const activeWorkspaces = workspace.items.filter(item => keptGroups.has(item.workspaceId))
  const row = (key: string) => `[data-row-key="${CSS.escape(key)}"]`
  const groupRows = [...keptGroups].map(key => row(`workspace:${key}`))
  const groupedRows = groupedIds.map(id => row(`session:${id}`))
  const flatRows = flatIds.map(id => row(`session:${id}`))
  const keep = [...groupedRows, ...groupRows].join(', ') || ':not(*)'
  const scope = ATTENTION_LIST
  const nativeWorkspaceRow = '[data-row-key^="workspace:"]:not([aria-hidden="true"] *)'
  const grouped = `${scope}:has(${nativeWorkspaceRow})`
  const flat = `${scope}:not(:has(${nativeWorkspaceRow}))`
  // Native child headings disappear under folded ancestors. A filesystem ancestor
  // is only a fallback when the matching child heading is absent from the list.
  const ancestorSelectors = (path: string) => workspace.items.filter(candidate => candidate.path !== path && (
    path.startsWith(candidate.path.replace(/\/+$/, '') + '/') ||
    path.startsWith(candidate.path.replace(/\\+$/, '') + '\\')
  )).map(candidate => row(`workspace:${candidate.workspaceId}`))
  const hiddenDescendants = activeWorkspaces.flatMap(item => {
    const ancestors = ancestorSelectors(item.path)
    if (ancestors.length === 0) return []
    return [{ anchor: row(`workspace:${item.workspaceId}`), ancestors }]
  })
  const ancestorRows = hiddenDescendants.flatMap(item => item.ancestors)
  const empty = (layout: string, rows: readonly string[]) =>
    `${layout}:not(:has(${rows.join(', ') || ':not(*)'})) ${ATTENTION_EMPTY}`
  const overflowRules = [...activeSessionsByGroup].map(([key, active]) => {
    const allRendered = active.map(id => `:has(${row(`session:${id}`)})`).join('')
    const overflow = row(`overflow:${key}`)
    return `${scope} div${allRendered} > ${overflow}[aria-expanded="false"] { display: none; }`
  }).join('')
  const activeOverflow = [...activeSessionsByGroup.keys()].map(key => row(`overflow:${key}`)).join(', ') || ':not(*)'
  const group = 'div:has(> [data-row-key^="workspace:"], > span > [data-row-key^="workspace:"])'
  const idleRows = idle.map(id => row(`session:${id}`)).join(', ') || ':not(*)'
  const flatIdle = `${flat}:has(${idleRows}):has(> ${LIST_END} > ${IDLE_BUTTON})`
  return <>
    <style>{`
      ${grouped} ${SESSION_ROW}:not(:is(${groupedRows.join(', ') || ':not(*)'})),
      ${flat} ${SESSION_ROW}:not(:is(${flatRows.join(', ') || ':not(*)'})),
      ${scope} ${group}:not(:has(${keep})),
      ${scope} [data-row-key="empty"] { display: none; }
      ${scope} [data-row-key^="overflow:"]:not(:is(${activeOverflow})) { display: none; }
      ${overflowRules}
      ${hiddenDescendants.map(({ anchor, ancestors }) => `
        ${scope}:not(:has(${anchor})) ${group}:has(:is(${ancestors.join(', ')})) {
          display: block;
        }
      `).join('')}
      ${LIST_END}, ${IDLE_GROUP}, ${IDLE_BUTTON}, ${ATTENTION_EMPTY} { display: none; }
      ${scope} > ${LIST_END} { display: block; }
      /* The flat control sits outside the native tree, so move its fade clearance. */
      ${flatIdle} [role="tree"] { padding-bottom: 0; }
      ${flatIdle} > ${LIST_END} { padding-bottom: 16px; }
      ${flatIdle} > ${LIST_END} > ${IDLE_BUTTON},
      ${grouped} ${IDLE_GROUP}:has(> ${IDLE_BUTTON}),
      ${grouped} ${IDLE_GROUP} > ${IDLE_BUTTON} { display: block; }
      ${empty(grouped, [...groupedRows, ...groupRows, ...ancestorRows])},
      ${empty(flat, flatRows)} {
        display: block;
        padding-inline: 12px;
        color: var(--dsw-alias-label-tertiary);
        font-size: 13px;
        line-height: 20px;
        text-align: center;
      }
      ${ATTENTION_EMPTY}::before {
        content: '';
        display: block;
        inline-size: 24px;
        block-size: 24px;
        margin: 64px auto 12px;
        background-color: var(--dsw-alias-label-caption);
        mask: url("${EMPTY_ICON}") center / contain no-repeat;
      }
      /* WorkspaceBrowser.module.css .sessionOverflowButton (DSH ui-workspace 0.2.2-rc.5). */
      ${IDLE_BUTTON} {
        width: 100%;
        height: 28px;
        padding: 0 var(--dsh-sidebar-row-padding) 0 calc(var(--dsh-sidebar-row-padding) + 16px + var(--dsh-sidebar-label-gap) + var(--dsh-workspace-indent, 0px));
        border: none;
        border-radius: var(--dsw-radius-sm);
        background: transparent;
        color: var(--dsw-alias-label-tertiary);
        font-size: 12px;
        text-align: left;
        cursor: pointer;
      }
      @media (hover: hover) {
        ${IDLE_BUTTON}:hover {
          background: transparent;
          color: var(--dsw-alias-label-secondary);
        }
      }
    `}</style>
    <IdleControls
      listSelector={LIST}
      scrollportSelector={SCROLLPORT}
      browsingSelector={BROWSING_LIST}
      idle={idleIds}
      idleGroups={idleGroups}
      shown={shown}
      onChange={(key, selection) => setShown(previous => updateIdlePages(previous, key, selection))}
      moreLabel={t('expandIdle')}
      collapseLabel={t('collapseIdle')}
      loadingLabel={t('loading')}
      emptyLabel={t(list.phase === 'pending' ? 'loading' : 'empty')}
    />
  </>
}

function ListContent({ mode, onCycle, locale, t, usePanelInfo, useSessions, useSessionStatus, useWorkspaces, draftSource }: AttentionProps & {
  mode: Mode
  onCycle: () => void
  locale: string
}) {
  const list = useSessions((value: SessionListState) => value)
  const workspace: WorkspaceSnapshot = useWorkspaces((value: WorkspaceSnapshot) => value)
  const statuses = useSessionStatus((value: SessionStatusSnapshot) => value)
  const drafts = useSyncExternalStore(draftSource.subscribe, draftSource.getSnapshot)
  const panelActive = usePanelInfo((info: PanelInfo) => info.activePanelId !== null)
  const main = Object.values<SessionSummary>(list.byId).find(session => (session.retainedBy.mainView ?? 0) > 0)?.id
  const filter = useArchiveFilter()
  const archivedOnly = filter === 'only' && workspace.archivedSessionIds.length > 0
  const visibility = mode === 'attention' || (mode === 'collapsed' && filter !== 'only')
    ? sessionVisibility(list, statuses, workspace, { current: panelActive ? undefined : main, drafts })
    : undefined
  const metric = listHeadingCount(mode, list, workspace, filter, main, visibility)
  const count = metric?.value.toLocaleString(locale)
  return <>
    <style>{HEADER_STYLE}</style>
    <ListHeading wide mode={mode} label={t(nextLabel[mode])} current={t(modeLabel[mode])} onCycle={onCycle}
      count={count} countDescription={metric && t(metric.key, { count })} />
    {mode === 'attention' && visibility && <AttentionFilter {...{ list, workspace, visibility, t, archivedOnly }} />}
  </>
}

export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  // Keep the preference for this page even if the sidebar footer remounts.
  let listMode: Mode = 'attention'
  const draftSource = connectDrafts(ctx)
  ctx.effect(() => ctx.locale.register(NS, LABELS))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: NS, locale: NS,
  }, function ListToggle({ t, wide, usePanelInfo, useSessions, useSessionStatus, useWorkspaces }) {
    const [mode, setMode] = useState(listMode)
    const prepareMotion = useListMotion(mode, wide, BROWSING_LIST, SCROLLPORT)
    if (!wide) return null
    return <ListContent {...{ mode, t, usePanelInfo, useSessions, useSessionStatus, useWorkspaces, draftSource }}
      locale={ctx.locale.getLocale().active} onCycle={() => {
        const next = nextMode[mode]
        prepareMotion(next)
        listMode = next
        setMode(next)
      }} />
  }))
}
