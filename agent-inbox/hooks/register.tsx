import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, PluginOptions, Register, UiPressArgument } from 'claude-code'

import type { InboxEntry, InboxKind, InboxSnapshot } from '../types'
import { LANGS, pickLanguage, strings, type Lang } from './i18n'

const PANE = 'agent-inbox'
const COMMAND = 'inbox'
const POLL_MS = 1500
const CLOCK_MS = 30_000

const EMPTY: InboxSnapshot = { entries: [], readAt: 0, error: '' }

// Change the tag when InboxEntry's fields change: it declines what an earlier
// version stored, which outlives a reload.
const snapshot = atom({ plugin: 'agent-inbox', key: 'snapshot' } as const, EMPTY, {
  shape: 'snapshot-2',
})
const clock = atom({ plugin: 'agent-inbox', key: 'clock' } as const, 0)

const KIND_COLOR: Record<InboxKind, Color> = {
  permission: 'warning',
  question: 'permission',
  idle: 'success',
}
const KINDS: readonly InboxKind[] = ['permission', 'question', 'idle']

// Module state: starts over at a reload, which only costs one re-read.
const state = {
  options: {} as PluginOptions,
  lang: 'en' as Lang,
  inboxPath: '',
  hookPath: '',
  ownId: '',
  seen: { size: -1, mtimeMs: -1 },
  opened: false,
}

const t = () => strings(state.lang)

// What the file may name: ids are plain tokens, a link is exactly the desktop
// app's session deep link. Anything else is dropped, so a crafted line cannot
// make the pane run a command with an odd argument or open another URL.
const SAFE_ID = /^[A-Za-z0-9_.-]{1,128}$/
const SAFE_LINK = /^claude:\/\/claude\.ai\/epitaxy\/local_[A-Za-z0-9-]{1,80}$/

const isEntry = (v: unknown): v is InboxEntry => {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.session_id === 'string' && SAFE_ID.test(o.session_id) && typeof o.kind === 'string'
}

const normalize = (raw: InboxEntry): InboxEntry => ({
  session_id: raw.session_id,
  host_session_id: String(raw.host_session_id ?? ''),
  cwd: String(raw.cwd ?? ''),
  project:
    String(raw.project ?? '') || String(raw.cwd ?? '').split('/').filter(Boolean).pop() || '?',
  title: String(raw.title ?? '') || String(raw.project ?? ''),
  kind: KINDS.includes(raw.kind) ? raw.kind : 'idle',
  summary: String(raw.summary ?? ''),
  tool: String(raw.tool ?? ''),
  ts_ms: Number(raw.ts_ms) || 0,
  entrypoint: String(raw.entrypoint ?? ''),
  pid: Number(raw.pid) || 0,
  link: SAFE_LINK.test(String(raw.link ?? '')) ? String(raw.link) : '',
})

// One entry per session: the last line wins, so a line appended while the
// lock was busy supersedes the older one until the next locked rewrite.
const parse = (text: string): InboxEntry[] => {
  const bySession = new Map<string, InboxEntry>()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      const value: unknown = JSON.parse(trimmed)
      if (isEntry(value)) {
        const entry = normalize(value)
        bySession.delete(entry.session_id)
        bySession.set(entry.session_id, entry)
      }
    } catch {
      // not JSON: skip the line
    }
  }
  return [...bySession.values()]
}

const summaryOf = (entry: InboxEntry): string => {
  if (entry.summary !== '') return entry.summary
  const f = t().fallback
  if (entry.kind === 'permission') return f.permission
  if (entry.kind === 'question') return entry.tool === 'ExitPlanMode' ? f.planApproval : f.question
  return f.idle
}

const ago = (ms: number, now: number): string => {
  const u = t().ago
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return `${s} ${u.s}`
  const minutes = Math.floor(s / 60)
  if (minutes < 60) return `${minutes} ${u.m}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${u.h} ${minutes % 60} ${u.m}`
  return `${Math.floor(hours / 24)} ${u.d}`
}

const ageColor = (ms: number, now: number): Color | undefined => {
  const minutes = (now - ms) / 60_000
  if (minutes >= 30) return 'error'
  if (minutes >= 10) return 'warning'
  return undefined
}

const hhmm = (ms: number): string => {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

type Group = { key: string; project: string; cwd: string; entries: InboxEntry[]; oldest: number }

const groupByProject = (entries: InboxEntry[]): Group[] => {
  const groups = new Map<string, Group>()
  for (const entry of entries) {
    const key = entry.cwd || entry.project
    const group = groups.get(key) ?? {
      key,
      project: entry.project,
      cwd: entry.cwd,
      entries: [],
      oldest: Number.POSITIVE_INFINITY,
    }
    group.entries.push(entry)
    group.oldest = Math.min(group.oldest, entry.ts_ms)
    groups.set(key, group)
  }
  const list = [...groups.values()]
  for (const group of list) group.entries.sort((a, b) => a.ts_ms - b.ts_ms)
  return list.sort((a, b) => a.oldest - b.oldest)
}

const resolveLanguage = async ($: EngineInterface) => {
  const envLocale =
    (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  let systemLocale: string | undefined
  if (!envLocale && String(state.options.language ?? 'auto') === 'auto') {
    const info = await $.session.info().catch(() => undefined)
    if (info?.platform === 'macos') {
      const ran = await $.process
        .run(['/usr/bin/defaults', 'read', '-g', 'AppleLanguages'], { timeoutMs: 3000 })
        .catch(() => undefined)
      systemLocale = ran?.stdout.match(/"([A-Za-z-]+)"/)?.[1]
    }
  }
  state.lang = pickLanguage(state.options.language, envLocale, systemLocale)
}

const resolvePaths = async ($: EngineInterface) => {
  const home = (await $.env.get('HOME')) ?? ''
  const raw = String(state.options.inboxPath || '~/.claude/inbox.jsonl')
  state.inboxPath = raw.startsWith('~/') ? `${home}${raw.slice(1)}` : raw
  state.hookPath = `${$.plugin.root}/scripts/inbox-hook.sh`
}

const poll = async ($: EngineInterface) => {
  try {
    if (state.inboxPath === '') await resolvePaths($)
    if (!(await $.fs.exists(state.inboxPath))) {
      if (state.seen.size !== 0) {
        state.seen = { size: 0, mtimeMs: 0 }
        await update($, snapshot, () => ({ entries: [], readAt: Date.now(), error: '' }))
      }
      return
    }
    const stat = await $.fs.stat(state.inboxPath)
    if (stat.size === state.seen.size && stat.mtimeMs === state.seen.mtimeMs) return
    state.seen = { size: stat.size, mtimeMs: stat.mtimeMs }
    const text = await $.fs.read(state.inboxPath)
    const entries = parse(typeof text === 'string' ? text : '')
    await update($, snapshot, () => ({ entries, readAt: Date.now(), error: '' }))
  } catch (err) {
    state.seen = { size: -1, mtimeMs: -1 }
    await update($, snapshot, s => ({ ...s, error: String(err) })).catch(() => undefined)
  }
}

const openPane = async ($: EngineInterface, focus = false) => {
  state.opened = true
  const title = t().title
  return focus
    ? $.ui.open({ id: PANE, title, columns: 56, focus: true })
    : $.ui.open({ id: PANE, title, columns: 56 })
}

const copyResume = async ($: EngineInterface, entry: InboxEntry, press: UiPressArgument) => {
  const command = `claude --resume ${entry.session_id}`
  const copied = await $.ui
    .copy({ text: command, surface: press.surface })
    .catch(() => ({ isCopied: false as const, reason: 'error' }))
  $.ui.toast(copied.isCopied ? t().copied(command) : t().copyFailed(copied.reason, command))
}

const goTo = async ($: EngineInterface, entry: InboxEntry, press: UiPressArgument) => {
  if (entry.link !== '') {
    const info = await $.session.info().catch(() => undefined)
    if (info?.platform === 'macos') {
      const ran = await $.process
        .run(['/usr/bin/open', entry.link], { timeoutMs: 5000 })
        .catch(err => ({ exitCode: -1, stdout: '', stderr: String(err) }))
      if (ran.exitCode === 0) {
        $.ui.toast(t().switching(entry.title))
        return
      }
    }
    $.ui.toast(t().cannotSwitch)
  } else {
    $.ui.toast(t().terminalNoSwitch)
  }
  await copyResume($, entry, press)
}

const remove = async ($: EngineInterface, entry: InboxEntry) => {
  await $.process
    .run([state.hookPath, '--remove', entry.session_id], { timeoutMs: 5000, env: { CLAUDE_INBOX_FILE: state.inboxPath } })
    .catch(() => undefined)
  state.seen = { size: -1, mtimeMs: -1 }
  await poll($)
}

export const register: Register = (on, options) => {
  state.options = options
  const autoOpen = options.autoOpen !== false

  on('session.start', async ($, e, next) => {
    await resolveLanguage($)
    await resolvePaths($)
    state.ownId = await $.session.id().catch(() => '')
    await $.command.register({
      name: COMMAND,
      description: t().commandDescription,
      argumentHint: '[lang <en|tr|de|fr|es> | clear | close | status]',
    })
    $.clock.every(POLL_MS, () => poll($))
    $.clock.every(CLOCK_MS, () => update($, clock, () => Date.now()))
    void poll($)
    // A desktop-hosted session draws nowhere yet at start (surface null); the
    // pane stays open and is drawn once the desktop page attaches.
    if (autoOpen && (e.surface === 'desktop' || e.surface === null)) void openPane($)
    return next(e)
  })

  on('session.attach', async ($, e, next) => {
    if (autoOpen && !state.opened && e.surface === 'desktop') void openPane($)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const [sub = '', ...rest] = (e.args ?? '').trim().split(/\s+/).filter(Boolean)
    const s = t()
    switch (sub.toLowerCase()) {
      case '': {
        await openPane($, true)
        await poll($)
        return { text: s.paneOpened }
      }
      case 'lang': {
        const code = (rest[0] ?? '').toLowerCase()
        if (!(LANGS as readonly string[]).includes(code)) return { text: s.langUsage(LANGS.join(', ')) }
        const set = await $.config.set({ key: 'agent-inbox.language', value: code })
        if (set.deny !== undefined) return { text: s.langFailed(set.deny) }
        state.lang = code as Lang
        if (state.opened) await $.ui.open({ id: PANE, title: t().title })
        return { text: t().langSet(code) }
      }
      case 'clear': {
        await poll($)
        const entries = (await read($, snapshot)).entries
        for (const entry of entries) {
          await $.process
            .run([state.hookPath, '--remove', entry.session_id], { timeoutMs: 5000, env: { CLAUDE_INBOX_FILE: state.inboxPath } })
            .catch(() => undefined)
        }
        state.seen = { size: -1, mtimeMs: -1 }
        await poll($)
        return { text: s.cleared(entries.length) }
      }
      case 'close': {
        await $.ui.close({ id: PANE }).catch(() => undefined)
        state.opened = false
        return { text: s.paneClosed }
      }
      case 'status': {
        await poll($)
        const snap = await read($, snapshot)
        const now = Date.now()
        const entries = snap.entries
        if (entries.length === 0) return { text: s.noneLong }
        const lines = [s.waiting(entries.length)]
        for (const group of groupByProject(entries)) {
          lines.push(`\n${group.project}  (${group.cwd})`)
          for (const entry of group.entries) {
            const own = entry.session_id === state.ownId ? ` (${s.thisSession})` : ''
            lines.push(`  [${s.kind[entry.kind]}] ${entry.title}${own} · ${ago(entry.ts_ms, now)}`)
            lines.push(`    ${summaryOf(entry)}`)
            lines.push(`    claude --resume ${entry.session_id}`)
          }
        }
        return { text: lines.join('\n') }
      }
      default:
        return { text: s.usage }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = t()
    const snap = await read($, snapshot)
    const tick = await read($, clock)
    const now = Math.max(tick, snap.readAt, Date.now())
    const entries = snap.entries
    const groups = groupByProject(entries)

    if (e.props.placement === 'widget') {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text bold>{s.title}</Text>
          <Text dimColor>{entries.length === 0 ? s.none : s.waiting(entries.length)}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
        <Box flexDirection="row" flexWrap="wrap" justifyContent="space-between" columnGap={2}>
          <Text bold>{entries.length === 0 ? s.none : s.waiting(entries.length)}</Text>
          <Text dimColor size="caption">
            {snap.readAt > 0 ? s.updated(hhmm(snap.readAt)) : s.reading}
          </Text>
        </Box>
        {snap.error !== '' && <Text color="error">{s.readError(snap.error)}</Text>}
        {entries.length === 0 && snap.error === '' && (
          <Box borderStyle="round" borderDimColor paddingX={1}>
            <Text dimColor>{s.noneLong}</Text>
          </Box>
        )}
        {groups.map(group => (
          <Box flexDirection="column" key={`g:${group.key}`}>
            <Box flexDirection="row" gap={1}>
              <Text color="claude" bold>
                ▍
              </Text>
              <Text bold size="heading">
                {group.project}
              </Text>
              <Text dimColor>({group.entries.length})</Text>
            </Box>
            <Text dimColor size="caption" wrap="truncate-start">
              {group.cwd}
            </Text>
            {group.entries.map(entry => (
              <Box
                flexDirection="column"
                marginTop={1}
                paddingX={1}
                borderStyle="round"
                borderColor={KIND_COLOR[entry.kind]}
              >
                <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
                  <Text color={KIND_COLOR[entry.kind]} bold>
                    ● {s.kind[entry.kind]}
                  </Text>
                  <Text
                    color={ageColor(entry.ts_ms, now)}
                    dimColor={ageColor(entry.ts_ms, now) === undefined}
                    tabular
                    wrap="truncate-end"
                  >
                    {ago(entry.ts_ms, now)}
                  </Text>
                </Box>
                <Box flexShrink={1} minWidth={0}>
                  <Text bold wrap="truncate-end" maxLines={2}>
                    {entry.title}
                  </Text>
                </Box>
                <Text italic dimColor wrap="wrap" maxLines={3}>
                  {summaryOf(entry)}
                </Text>
                <Box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
                  {entry.session_id !== state.ownId && entry.link !== '' && (
                    <Button
                      key={`open:${entry.session_id}`}
                      variant="primary"
                      onPress={press => goTo($, entry, press)}
                    >
                      {s.open}
                    </Button>
                  )}
                  <Button key={`copy:${entry.session_id}`} onPress={press => copyResume($, entry, press)}>
                    {s.copy}
                  </Button>
                  <Button key={`rm:${entry.session_id}`} dimColor onPress={() => remove($, entry)}>
                    {s.remove}
                  </Button>
                </Box>
                {entry.session_id === state.ownId ? (
                  <Text dimColor italic>
                    {s.thisSession}
                  </Text>
                ) : (
                  entry.link === '' && (
                    <Text dimColor italic>
                      {s.terminalSession}
                    </Text>
                  )
                )}
                <Text dimColor mono size="caption" wrap="truncate-end">
                  claude --resume {entry.session_id}
                </Text>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
