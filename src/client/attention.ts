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
  for (const id of list.ids) {
    const session = list.byId[id]
    if (session === undefined || session.origin === 'subagent') continue
    if (id !== current && archived.has(id)) continue
    const status = statuses.get(id)
    const pending = status?.pendingInteraction?.kind
    const needsAttention = id === current || pinned.has(id) || drafts?.has(id)
      || pending === 'approval' || pending === 'plan-review' || pending === 'question'
      || (status?.running ?? session.running) || status?.completionUnread
      || list.projectionsBySession[id]?.values.subagentCatalog?.some(
        child => statuses.get(child.id)?.running ?? list.byId[child.id]?.running ?? false,
      )
    if (needsAttention) attention.push(id)
    else if (!session.blank) idle.push(id)
  }
  return { attention, idle }
}

export function workspaceVisibility(
  items: WorkspaceSnapshot['items'],
  attention: readonly string[],
  idle: readonly string[],
  shown: IdlePages,
  archivedOnly: boolean,
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
  for (const [key, candidates] of archivedOnly ? [] : idleGroups) {
    if (key !== '' && !shown.has(key)) continue
    keptGroups.add(key)
    groupedIds.push(...(shown.get(key) ?? []).filter(id => candidates.has(id)))
  }
  return { activeSessionsByGroup, idleGroups, keptGroups, groupedIds }
}
