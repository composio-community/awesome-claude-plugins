export type InboxKind = 'permission' | 'question' | 'idle'

/** One line of ~/.claude/inbox.jsonl, as scripts/inbox-hook.sh writes it. */
export type InboxEntry = {
  session_id: string
  host_session_id: string
  cwd: string
  project: string
  title: string
  kind: InboxKind
  summary: string
  tool: string
  ts_ms: number
  /** ISO time of ts_ms; informational. */
  ts?: string
  entrypoint: string
  pid: number
  /** claude://… deep link of the Claude Desktop session; empty for a terminal session. */
  link: string
}

export type InboxSnapshot = {
  entries: InboxEntry[]
  readAt: number
  error: string
}

declare module 'claude-code' {
  interface PluginState {
    'agent-inbox': {
      snapshot: Shaped<InboxSnapshot>
      clock: number
    }
  }
}
