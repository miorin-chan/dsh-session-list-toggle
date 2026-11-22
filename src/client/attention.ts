import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'

export function sessionVisibility(
  list: SessionListState,
  statuses: SessionStatusSnapshot,
  { archivedSessionIds, pinnedSessionIds }: Pick<WorkspaceSnapshot, 'archivedSessionIds' | 'pinnedSessionIds'>,
  drafts?: ReadonlySet<string>,
) {
  const archived = new Set(archivedSessionIds)
  const pinned = new Set(pinnedSessionIds)
  const attention: SessionSummary['id'][] = []
  const idle: SessionSummary['id'][] = []
  for (const id of list.ids) {
    const session = list.byId[id]
    if (session === undefined || session.origin === 'subagent' || archived.has(id)) continue
    const status = statuses.get(id)
    const pending = status?.pendingInteraction?.kind
    const needsAttention = pinned.has(id) || drafts?.has(id)
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
