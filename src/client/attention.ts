import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'

export function attentionSessionIds(
  list: SessionListState,
  statuses: SessionStatusSnapshot,
  { archivedSessionIds, pinnedSessionIds }: Pick<WorkspaceSnapshot, 'archivedSessionIds' | 'pinnedSessionIds'>,
): SessionSummary['id'][] {
  const archived = new Set(archivedSessionIds)
  const pinned = new Set(pinnedSessionIds)
  return list.ids.filter(id => {
    const session = list.byId[id]
    if (session === undefined || session.origin === 'subagent' || archived.has(id)) return false
    if (pinned.has(id)) return true
    const status = statuses.get(id)
    const pending = status?.pendingInteraction?.kind
    if (pending === 'approval' || pending === 'plan-review' || pending === 'question') return true
    if ((status?.running ?? session.running) || status?.completionUnread) return true
    return list.projectionsBySession[id]?.values.subagentCatalog?.some(
      child => statuses.get(child.id)?.running ?? list.byId[child.id]?.running ?? false,
    ) ?? false
  })
}
