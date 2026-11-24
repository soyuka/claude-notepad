import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Notepad } from '../types'

const PLUGIN = 'session-notepad'
const TOOL = 'notepad'
const TOOL_FULL = `mcp__${PLUGIN}__${TOOL}`

const notepad = atom(
  { plugin: 'session-notepad', key: 'notepad' } as const,
  { nextId: 1, items: [], scopes: [], rejected: [] },
  { shape: 'notepad-4' },
)

const KEEP_SESSIONS = 100
const MAX_SHOWN = 5
const storeKey = (sessionId: string) => `pad:${sessionId}`

const sync = async ($: EngineInterface): Promise<Notepad> => {
  const sessionId = await $.session.id()
  const current = await read($, notepad)
  if (current.sessionId === sessionId) {
    return current
  }
  const saved = (await $.store.get(storeKey(sessionId))) as Saved | undefined
  const items = (saved?.items ?? [])
    .filter(i => !i.isDone)
    .map(({ id, text }) => ({ id, text }))

  return update($, notepad, () => ({
    nextId: saved?.nextId ?? 1,
    items,
    scopes: saved?.scopes ?? [],
    rejected: saved?.rejected ?? [],
    sessionId,
  }))
}

const change = async ($: EngineInterface, ops: Ops): Promise<{ pad: Notepad; rejections: string[] }> => {
  await sync($)
  let rejections: string[] = []
  const pad = await update($, notepad, p => {
    const out = apply(p, ops)
    rejections = out.rejections

    return out.pad
  })
  if (pad.sessionId !== undefined) {
    await $.store.set(storeKey(pad.sessionId), {
      nextId: pad.nextId,
      items: pad.items,
      scopes: pad.scopes,
      rejected: pad.rejected,
    })
    const keys = await $.store.keys()
    for (const key of keys.slice(0, Math.max(0, keys.length - KEEP_SESSIONS))) {
      await $.store.delete(key)
    }
  }

  return { pad, rejections }
}

type Saved = {
  nextId: number
  items: { id: number; text: string; isDone?: boolean }[]
  scopes?: [string, number][]
  rejected?: string[]
}

type Parsed = { prefix: string; scope?: string; subject: string }

const TYPES = ['test', 'check', 'fix', 'try', 'ask', 'doc']
const MAX_LENGTH = 60

const parse = (text: string): Parsed | string => {
  const m = /^(\S+?)(?:\(([^)]*)\))?: (\S.*)$/.exec(text)
  if (m === null) {
    return 'expected "type(scope): subject"'
  }
  const [, type, scope, subject] = m
  if (!TYPES.includes(type)) {
    return `unknown type "${type}", use ${TYPES.slice(0, -1).join(', ')} or ${TYPES.at(-1)}`
  }
  if (scope !== undefined && !/^[a-z0-9][a-z0-9._+-]*$/.test(scope)) {
    return `bad scope "${scope}"`
  }
  if (/^\p{Lu}/u.test(subject)) {
    return 'subject must start lowercase'
  }
  if (subject.endsWith('.')) {
    return 'no trailing period'
  }
  if (text.length > MAX_LENGTH) {
    return `${text.length} chars, max ${MAX_LENGTH}`
  }

  return { prefix: `${type}${scope === undefined ? '' : `(${scope})`}:`, scope, subject }
}

const parsed = (text: string): Parsed | undefined => {
  const out = parse(text)

  return typeof out === 'string' ? undefined : out
}

const refusal = (pad: Notepad, text: string): string | undefined => {
  const out = parse(text)
  if (typeof out === 'string') {
    return out
  }

  return pad.rejected.includes(text) ? 'removed by the person, do not add it again' : undefined
}

type Ops = {
  person?: boolean
  add?: string[]
  done?: number[]
  remove?: number[]
  edit?: { id: number; text: string }[]
}

const apply = (pad: Notepad, ops: Ops): { pad: Notepad; rejections: string[] } => {
  let { nextId, items, scopes, rejected } = pad
  const rejections: string[] = []
  const check = (text: string): boolean => {
    const reason = ops.person ? undefined : refusal({ ...pad, rejected }, text)
    if (reason !== undefined) {
      rejections.push(`rejected "${text}": ${reason}`)
    }

    return reason === undefined
  }

  for (const text of ops.add ?? []) {
    const clean = text.trim()
    if (clean === '' || !check(clean) || items.some(i => i.text === clean)) {
      continue
    }
    items = [...items, { id: nextId++, text: clean }]
    rejected = rejected.filter(r => r !== clean)
    const scope = parsed(clean)?.scope
    if (scope !== undefined) {
      scopes = scopes.some(([s]) => s === scope)
        ? scopes.map(([s, n]) => [s, s === scope ? n + 1 : n])
        : [...scopes, [scope, 1]]
    }
  }
  const gone = new Set([...(ops.done ?? []), ...(ops.remove ?? [])])
  if (ops.person) {
    const removed = items.filter(i => (ops.remove ?? []).includes(i.id)).map(i => i.text)
    rejected = [...rejected, ...removed.filter(t => !rejected.includes(t))]
  }
  const edits = new Map<number, string>()
  for (const e of ops.edit ?? []) {
    const clean = e.text.trim()
    if (clean !== '' && check(clean)) {
      edits.set(e.id, clean)
    }
  }
  items = items
    .filter(i => !gone.has(i.id))
    .map(i => ({ ...i, text: edits.get(i.id) ?? i.text }))

  return { pad: { ...pad, nextId, items, scopes, rejected }, rejections }
}

const format = (pad: Notepad): string =>
  pad.items.length === 0
    ? 'Notepad is empty.'
    : pad.items.map(i => `#${i.id} ${i.text}`).join('\n')

const ranked = (scopes: [string, number][]): string[] =>
  scopes
    .toSorted(([, a], [, b]) => b - a)
    .map(([scope]) => scope)

const INSTRUCTIONS = `A band above the prompt shows a per-session notepad: a short bullet list of small pending items the person must not lose as output scrolls (things to test, check, verify, try, follow up on). Keep it current with this tool, without being asked:
- add an item whenever you or the person mention something still to test, check or do later, in the person's language
- every item is one line, at most 60 chars, formatted \`type(scope): subject\` with the scope optional ([a-z0-9._+-]), a lowercase subject and no trailing period. Types: test (run a test), check (verify a fact or state), fix (known bug to fix later), try (experiment), ask (question for the person), doc (docs to write). Example: \`test(auth): login with an expired token\`. Invalid items are rejected, with the reason in the answer
- reuse the scopes listed at the end of the answer rather than inventing near-duplicates
- mark items done as soon as they are verified or no longer relevant (done items are removed), edit them when they change
- do not add the task currently being worked on, nor anything already listed, nor an item the person removed (the answer rejects it)
- it is a session todo list, not memory: it dies with the session, so never put facts, decisions, preferences or anything worth keeping across sessions here, that goes to memory or the repo
The tool answers with the full list; read it rather than guessing ids.`

const USAGE =
  'usage: /notepad [add <text> | done <id…> | rm <id…> | show]'

const ids = (rest: string): number[] =>
  rest
    .split(/[\s,]+/)
    .map(s => Number(s.replace(/^#/, '')))
    .filter(n => Number.isInteger(n) && n > 0)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'notepad',
      description: 'Session notepad: show the list, or add/done/rm items',
    })
    await $.tool.register({
      name: TOOL,
      description: INSTRUCTIONS,
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          add: { type: 'array', items: { type: 'string' }, description: 'New items, one short line each' },
          done: { type: 'array', items: { type: 'integer' }, description: 'Ids done or no longer relevant, removed from the list' },
          remove: { type: 'array', items: { type: 'integer' }, description: 'Ids to delete' },
          edit: {
            type: 'array',
            items: {
              type: 'object',
              properties: { id: { type: 'integer' }, text: { type: 'string' } },
              required: ['id', 'text'],
            },
          },
        },
      },
    })
    await sync($)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await sync($)

    return next(e)
  })

  on('tool.call', { tool: TOOL_FULL }, async ($, e) => {
    const { pad, rejections } = await change($, e as unknown as Ops)
    const scopes = ranked(pad.scopes)
    const lines = [format(pad), ...rejections, ...(scopes.length === 0 ? [] : [`scopes: ${scopes.join(', ')}`])]

    return { result: lines.join('\n') }
  })

  on('command.run', { command: 'notepad' }, async ($, e) => {
    const [verb = '', ...restParts] = e.args.trim().split(/\s+/)
    const rest = restParts.join(' ')
    const ops: Ops | null =
      verb === 'add' && rest !== '' ? { add: [rest], person: true }
      : verb === 'done' ? { done: ids(rest), person: true }
      : verb === 'rm' ? { remove: ids(rest), person: true }
      : null

    if (ops === null) {
      return { text: verb === '' || verb === 'show' ? format(await sync($)) : USAGE }
    }

    const { pad } = await change($, ops)

    return { text: format(pad) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { items } = await read($, notepad)
    if (e.props.hasSurvey || items.length === 0) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const shown = items.slice(0, MAX_SHOWN)

    return (
      <Box key="notepad" flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
        <Text bold>Notepad</Text>
        {shown.map(i => {
          const p = parsed(i.text)

          return (
            <Text>
              • {p !== undefined && <Text dimColor>{p.prefix}</Text>}
              {p !== undefined && ' '}
              {p === undefined ? i.text : p.subject} <Text dimColor>#{i.id}</Text>
            </Text>
          )
        })}
        {items.length > shown.length && (
          <Text dimColor>+{items.length - shown.length} more, /notepad show</Text>
        )}
      </Box>
    )
  })
}
