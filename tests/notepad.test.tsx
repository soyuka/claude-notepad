import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PANE = {
  plugin: 'session-notepad',
  component: 'Pane',
  requestId: 'notepad',
  props: {
    title: 'Notepad',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const boot = async (
  $: Parameters<TestBody>[0],
  on: Parameters<TestBody>[1],
  store = new Map<string, unknown>(),
  panes: string[] = [],
) => {
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('session.id', () => ({ value: 'sid' }))
  on('command.register', () => ({ value: { command: 'notepad' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__session-notepad__notepad' } }))
  on('ui.open', (_, e) => (panes.push(`open:${e.id}`), { value: { isPlaced: true } }))
  on('ui.close', (_, e) => (panes.push(`close:${e.id}`), { value: undefined }))
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

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
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

test('pane shows only while something is pending', async ($, on) => {
  const panes: string[] = []
  await boot($, on, new Map<string, unknown>(), panes)
  expect(panes).toEqual([])

  await $.tool.call({ tool: 'mcp__session-notepad__notepad', add: ['check logs'] } as never)
  await $.tool.call({ tool: 'mcp__session-notepad__notepad', add: ['check metrics'] } as never)
  expect(panes).toEqual(['open:notepad'])

  await $.tool.call({ tool: 'mcp__session-notepad__notepad', done: [1, 2] } as never)
  expect(panes).toEqual(['open:notepad', 'close:notepad'])

  await $.command.run({ command: 'notepad', args: '' } as never)
  expect(panes).toEqual(['open:notepad', 'close:notepad'])
})

test('pane opens on start when the saved list has items', async ($, on) => {
  const panes: string[] = []
  await boot($, on, new Map<string, unknown>([['pad:sid', { nextId: 2, items: [{ id: 1, text: 'retry path' }] }]]), panes)
  expect(panes).toEqual(['open:notepad'])
})
