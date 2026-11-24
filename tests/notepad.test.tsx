import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const BAND = {
  plugin: 'session-notepad',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const boot = async (
  $: Parameters<TestBody>[0],
  on: Parameters<TestBody>[1],
  store = new Map<string, unknown>(),
) => {
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('session.id', () => ({ value: 'sid' }))
  on('command.register', () => ({ value: { command: 'notepad' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__session-notepad__notepad' } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  return store
}

test('done items are removed, not struck through', async ($, on) => {
  await boot($, on)
  const added = await $.tool.call({
    tool: 'mcp__session-notepad__notepad',
    add: ['test: login flow', 'check(cache): headers', 'test: login flow'],
  } as never)
  expect(added.result).toBe('#1 test: login flow\n#2 check(cache): headers\nscopes: cache')

  const checked = await $.tool.call({ tool: 'mcp__session-notepad__notepad', done: [1] } as never)
  expect(checked.result).toBe('#2 check(cache): headers\nscopes: cache')

  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /headers/ }))?.text).toContain('• check(cache): headers')
  expect(await ui.find({ type: 'Text', text: /login/ })).toBeUndefined()
  await ui.unmount()
})

test('slash command adds and removes', async ($, on) => {
  await boot($, on)

  await $.command.run({ command: 'notepad', args: 'add check logs' } as never)
  await $.command.run({ command: 'notepad', args: 'add check metrics' } as never)
  await $.command.run({ command: 'notepad', args: 'add check alerts' } as never)
  await $.command.run({ command: 'notepad', args: 'done #1' } as never)
  const out = await $.command.run({ command: 'notepad', args: 'rm 3' } as never)
  expect((out as { text: string }).text).toBe('#2 check metrics')
})

test('list saved under the session id comes back on a new start', async ($, on) => {
  const store = await boot($, on, new Map<string, unknown>([
    ['pad:sid', {
      nextId: 3,
      items: [
        { id: 1, text: 'old checked item', isDone: true },
        { id: 2, text: 'test(retry): the path', isDone: false },
      ],
    }],
  ]))

  const added = await $.tool.call({ tool: 'mcp__session-notepad__notepad', add: ['check(cache): headers'] } as never)
  expect(added.result).toBe('#2 test(retry): the path\n#3 check(cache): headers\nscopes: cache')
  expect(store.get('pad:sid')).toEqual({
    nextId: 4,
    items: [
      { id: 2, text: 'test(retry): the path' },
      { id: 3, text: 'check(cache): headers' },
    ],
    scopes: [['cache', 1]],
    rejected: [],
  })
})

test('band lists the items under a Notepad header', async ($, on) => {
  await boot($, on)
  await $.tool.call({ tool: 'mcp__session-notepad__notepad', add: ['check(ops): logs', 'check(ops): metrics'] } as never)

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /^Notepad$/ })).toBeDefined()
  const frame = await ui.find({ type: 'Box', key: 'notepad' })
  expect(frame?.props).toMatchObject({ borderStyle: 'round', borderDimColor: true })
  expect((await ui.find({ type: 'Text', text: /logs/ }))?.text).toContain('• check(ops): logs')
  expect((await ui.find({ type: 'Text', text: /metrics/ }))?.text).toContain('• check(ops): metrics')
  await ui.unmount()
})

test('band caps at five items and tells how many are hidden', async ($, on) => {
  await boot($, on)
  await $.tool.call({
    tool: 'mcp__session-notepad__notepad',
    add: ['try: one', 'try: two', 'try: three', 'try: four', 'try: five', 'try: six', 'try: seven'],
  } as never)

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /five/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /six/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /more/ }))?.text).toBe('+2 more, /notepad show')
  await ui.unmount()
})

test('band falls through to the engine when empty or a survey is up', async ($, on) => {
  await boot($, on)

  const empty = await $.ui.mount(BAND)
  expect((await empty.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  expect(await empty.find({ type: 'Text', text: /Notepad/ })).toBeUndefined()
  await empty.unmount()

  await $.tool.call({ tool: 'mcp__session-notepad__notepad', add: ['check: logs'] } as never)
  const survey = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true } })
  expect((await survey.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  expect(await survey.find({ type: 'Text', text: /logs/ })).toBeUndefined()
  await survey.unmount()
})

test('slash command shows the list without opening anything', async ($, on) => {
  await boot($, on)
  await $.tool.call({ tool: 'mcp__session-notepad__notepad', add: ['check: logs'] } as never)

  const out = await $.command.run({ command: 'notepad', args: '' } as never)
  expect((out as { text: string }).text).toBe('#1 check: logs')
})

const call = ($: Parameters<TestBody>[0], input: Record<string, unknown>) =>
  $.tool.call({ tool: 'mcp__session-notepad__notepad', ...input } as never).then(r => r.result as string)

const slash = ($: Parameters<TestBody>[0], args: string) =>
  $.command.run({ command: 'notepad', args } as never).then(r => (r as { text: string }).text)

test('invalid tool entries are rejected one by one while valid ones apply', async ($, on) => {
  await boot($, on)
  const out = await call($, {
    add: [
      'test(auth): login with an expired token',
      'check the cache',
      'nope: something',
      'fix(Bad Scope): thing',
      'fix: Capital start',
      'fix: ends with a dot.',
      `try: ${'x'.repeat(60)}`,
      'ask: which db',
    ],
  })
  expect(out).toBe([
    '#1 test(auth): login with an expired token',
    '#2 ask: which db',
    'rejected "check the cache": expected "type(scope): subject"',
    'rejected "nope: something": unknown type "nope", use test, check, fix, try, ask or doc',
    'rejected "fix(Bad Scope): thing": bad scope "Bad Scope"',
    'rejected "fix: Capital start": subject must start lowercase',
    'rejected "fix: ends with a dot.": no trailing period',
    `rejected "try: ${'x'.repeat(60)}": 65 chars, max 60`,
    'scopes: auth',
  ].join('\n'))
})

test('an invalid edit leaves the item unchanged', async ($, on) => {
  await boot($, on)
  await call($, { add: ['check(db): index'] })
  const out = await call($, {
    edit: [{ id: 1, text: 'Check the index' }],
  })
  expect(out).toBe('#1 check(db): index\nrejected "Check the index": expected "type(scope): subject"\nscopes: db')

  const ok = await call($, { edit: [{ id: 1, text: 'fix(db): index' }] })
  expect(ok).toBe('#1 fix(db): index\nscopes: db')
})

test('scopes are listed most frequent first, ties by first use', async ($, on) => {
  await boot($, on)
  const out = await call($, {
    add: ['test(a): one', 'test(b): two', 'test(c): three', 'test(b): four', 'test(c): five', 'try: free'],
  })
  expect(out.split('\n').at(-1)).toBe('scopes: b, c, a')
  expect(await slash($, 'show')).not.toContain('scopes')
})

test('numeric scopes keep their first-use rank on ties', async ($, on) => {
  await boot($, on)
  const out = await call($, { add: ['test(a): one', 'test(43): two'] })
  expect(out.split('\n').at(-1)).toBe('scopes: a, 43')
})

test('items the person removed are not re-added by the tool', async ($, on) => {
  await boot($, on)
  await call($, { add: ['test(a): one', 'test(a): two'] })
  await slash($, 'rm 1')

  const again = await call($, { add: ['test(a): one'], edit: [{ id: 2, text: 'test(a): one' }] })
  expect(again).toBe([
    '#2 test(a): two',
    'rejected "test(a): one": removed by the person, do not add it again',
    'rejected "test(a): one": removed by the person, do not add it again',
    'scopes: a',
  ].join('\n'))
})

test('tool remove and done do not tombstone', async ($, on) => {
  await boot($, on)
  await call($, { add: ['test: one', 'test: two'] })
  await call($, { remove: [1] })
  await call($, { done: [2] })
  await slash($, 'add check: three')
  await slash($, 'done 3')

  const out = await call($, { add: ['test: one', 'test: two', 'check: three'] })
  expect(out).toBe('#4 test: one\n#5 test: two\n#6 check: three')
})

test('slash add of a removed text is allowed and clears the tombstone', async ($, on) => {
  const store = await boot($, on)
  await call($, { add: ['test: one'] })
  await slash($, 'rm 1')
  expect((store.get('pad:sid') as { rejected: string[] }).rejected).toEqual(['test: one'])

  await slash($, 'add test: one')
  expect((store.get('pad:sid') as { rejected: string[] }).rejected).toEqual([])
  await slash($, 'rm 2')
  await slash($, 'add test: one')
  await slash($, 'done 3')
  expect(await call($, { add: ['test: one'] })).toBe('#4 test: one')
})

test('slash add accepts free-form text', async ($, on) => {
  await boot($, on)
  expect(await slash($, 'add Whatever I want.')).toBe('#1 Whatever I want.')
})

test('scopes and tombstones are saved and restored', async ($, on) => {
  const store = await boot($, on, new Map<string, unknown>([
    ['pad:sid', {
      nextId: 3,
      items: [{ id: 2, text: 'test(a): kept' }],
      scopes: [['a', 2], ['b', 1]],
      rejected: ['fix: gone'],
    }],
  ]))

  const out = await call($, { add: ['fix: gone', 'test(b): more', 'test(b): again'] })
  expect(out).toBe([
    '#2 test(a): kept',
    '#3 test(b): more',
    '#4 test(b): again',
    'rejected "fix: gone": removed by the person, do not add it again',
    'scopes: b, a',
  ].join('\n'))
  expect(store.get('pad:sid')).toEqual({
    nextId: 5,
    items: [
      { id: 2, text: 'test(a): kept' },
      { id: 3, text: 'test(b): more' },
      { id: 4, text: 'test(b): again' },
    ],
    scopes: [['a', 2], ['b', 3]],
    rejected: ['fix: gone'],
  })
})

test('band dims the type and scope prefix of formatted items', async ($, on) => {
  await boot($, on)
  await call($, { add: ['test(auth): login with an expired token'] })
  await slash($, 'add free form')

  const ui = await $.ui.mount(BAND)
  const line = await ui.find({ type: 'Text', text: /login/ })
  expect(line?.text).toContain('• test(auth): login with an expired token')
  const prefix = await ui.find({ type: 'Text', text: /^test\(auth\):$/ })
  expect(prefix?.props).toMatchObject({ dimColor: true })
  expect((await ui.find({ type: 'Text', text: /free form/ }))?.text).toContain('• free form')
  await ui.unmount()
})
