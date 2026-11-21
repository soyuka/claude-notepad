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
    add: ['test the login flow', 'check the cache headers', 'test the login flow'],
  } as never)
  expect(added.result).toBe('#1 test the login flow\n#2 check the cache headers')

  const checked = await $.tool.call({ tool: 'mcp__session-notepad__notepad', done: [1] } as never)
  expect(checked.result).toBe('#2 check the cache headers')

  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /cache/ }))?.text).toContain('• check the cache headers')
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
        { id: 2, text: 'test the retry path', isDone: false },
      ],
    }],
  ]))

  const added = await $.tool.call({ tool: 'mcp__session-notepad__notepad', add: ['check the cache'] } as never)
  expect(added.result).toBe('#2 test the retry path\n#3 check the cache')
  expect(store.get('pad:sid')).toEqual({
    nextId: 4,
    items: [
      { id: 2, text: 'test the retry path' },
      { id: 3, text: 'check the cache' },
    ],
  })
})

test('band lists the items under a Notepad header', async ($, on) => {
  await boot($, on)
  await $.tool.call({ tool: 'mcp__session-notepad__notepad', add: ['check logs', 'check metrics'] } as never)

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /^Notepad$/ })).toBeDefined()
  const frame = await ui.find({ type: 'Box', key: 'notepad' })
  expect(frame?.props).toMatchObject({ borderStyle: 'round', borderDimColor: true })
  expect((await ui.find({ type: 'Text', text: /logs/ }))?.text).toContain('• check logs')
  expect((await ui.find({ type: 'Text', text: /metrics/ }))?.text).toContain('• check metrics')
  await ui.unmount()
})

test('band caps at five items and tells how many are hidden', async ($, on) => {
  await boot($, on)
  await $.tool.call({
    tool: 'mcp__session-notepad__notepad',
    add: ['one', 'two', 'three', 'four', 'five', 'six', 'seven'],
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

  await $.tool.call({ tool: 'mcp__session-notepad__notepad', add: ['check logs'] } as never)
  const survey = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true } })
  expect((await survey.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  expect(await survey.find({ type: 'Text', text: /logs/ })).toBeUndefined()
  await survey.unmount()
})

test('slash command shows the list without opening anything', async ($, on) => {
  await boot($, on)
  await $.tool.call({ tool: 'mcp__session-notepad__notepad', add: ['check logs'] } as never)

  const out = await $.command.run({ command: 'notepad', args: '' } as never)
  expect((out as { text: string }).text).toBe('#1 check logs')
})
