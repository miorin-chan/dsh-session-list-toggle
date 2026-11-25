import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { IdlePages } from './idle-page.js'

export function sessionVisibility(
  list: SessionListState,
  statuses: SessionStatusSnapshot,
  { archivedSessionIds, pinnedSessionIds }: Pick<WorkspaceSnapshot, 'archivedSessionIds' | 'pinnedSessionIds'>,
  { current, drafts }: { current?: SessionSummary['id']; drafts?: ReadonlySet<string> } = {},
) {
  const archived = new Set(archivedSessionIds)
  const pinned = new Set(pinnedSessionIds)
  const attention: SessionSummary['id'][] = []
  const idle: SessionSummary['id'][] = []
  let followUp = 0
  for (const id of list.ids) {
    const session = list.byId[id]
    if (session === undefined || session.origin === 'subagent') continue
    if (id !== current && archived.has(id)) continue
    const status = statuses.get(id)
    const pending = status?.pendingInteraction?.kind
    const hasActivity = drafts?.has(id) || pending === 'approval' || pending === 'plan-review' || pending === 'question'
      || (status?.running ?? session.running) || status?.completionUnread
      || list.projectionsBySession[id]?.values.subagentCatalog?.some(
        child => statuses.get(child.id)?.running ?? list.byId[child.id]?.running ?? false,
      )
    if (hasActivity && !archived.has(id)) followUp++
    if (hasActivity || id === current || pinned.has(id)) attention.push(id)
    else if (!session.blank) idle.push(id)
  }
  return { attention, idle, followUp }
}

export type ArchiveFilter = 'default' | 'show' | 'only'

function browseCount(
  list: SessionListState,
  archivedIds: WorkspaceSnapshot['archivedSessionIds'],
  filter: ArchiveFilter,
  current: SessionSummary['id'] | undefined,
): number {
  const archived = new Set(archivedIds)
  let count = 0
  for (const id of list.ids) {
    const session = list.byId[id]
    if (!session || session.origin === 'subagent' || (session.blank && id !== current)) continue
    if (filter === 'show' || archived.has(id) === (filter === 'only')) count++
  }
  return count
}

export function listHeadingCount(
  mode: 'all' | 'collapsed' | 'attention',
  list: SessionListState,
  workspace: Pick<WorkspaceSnapshot, 'phase' | 'archivedSessionIds'>,
  filter: ArchiveFilter,
  current: SessionSummary['id'] | undefined,
  visibility: ReturnType<typeof sessionVisibility> | undefined,
) {
  if (list.phase !== 'ready' || workspace.phase !== 'ready') return undefined
  const archivedIds = workspace.archivedSessionIds
  if (mode === 'collapsed') {
    return filter !== 'only' && visibility && visibility.followUp > 0
      ? { key: 'followUpCount' as const, value: visibility.followUp }
      : undefined
  }
  if (filter === 'only') return { key: 'archiveCount' as const, value: browseCount(list, archivedIds, filter, current) }
  if (mode === 'all') return { key: 'totalCount' as const, value: browseCount(list, archivedIds, filter, current) }
  if (visibility === undefined) return undefined
  return { key: 'retainedCount' as const, value: visibility.attention.length }
}

export function workspaceVisibility(
  items: WorkspaceSnapshot['items'],
  attention: readonly string[],
  idle: readonly string[],
  shown: IdlePages,
) {
  const pending = new Set(attention)
  const looseIdle = new Set(idle)
  const activeSessionsByGroup = new Map<string, string[]>()
  const idleGroups = new Map<string, ReadonlySet<string>>()
  for (const item of items) {
    const groupIdle = item.sessionIds.filter(id => looseIdle.delete(id))
    if (groupIdle.length > 0) idleGroups.set(item.workspaceId, new Set(groupIdle))
    const active = item.sessionIds.filter(id => pending.delete(id))
    if (active.length > 0) activeSessionsByGroup.set(item.workspaceId, active)
  }
  if (pending.size > 0) activeSessionsByGroup.set('', [...pending]) // Native Ungrouped key.
  if (looseIdle.size > 0) idleGroups.set('', looseIdle)
  const keptGroups = new Set(activeSessionsByGroup.keys())
  const groupedIds = [...attention]
  for (const [key, candidates] of idleGroups) {
    if (key !== '' && !shown.has(key)) continue
    keptGroups.add(key)
    groupedIds.push(...(shown.get(key) ?? []).filter(id => candidates.has(id)))
  }
  return { activeSessionsByGroup, idleGroups, keptGroups, groupedIds }
}
