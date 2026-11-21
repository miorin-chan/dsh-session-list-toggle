import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'

export function attentionSessionIds(
  list: SessionListState,
  statuses: SessionStatusSnapshot,
  archivedIds: readonly SessionSummary['id'][],
): SessionSummary['id'][] {
  const archived = new Set(archivedIds)
  return list.ids.filter(id => {
    const session = list.byId[id]
    if (session === undefined || session.origin === 'subagent' || archived.has(id)) return false
    const status = statuses.get(id)
    const pending = status?.pendingInteraction?.kind
    if (pending === 'approval' || pending === 'plan-review' || pending === 'question') return true
    if ((status?.running ?? session.running) || status?.completionUnread) return true
    return list.projectionsBySession[id]?.values.subagentCatalog?.some(
      child => statuses.get(child.id)?.running ?? list.byId[child.id]?.running ?? false,
    ) ?? false
  })
}
