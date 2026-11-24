export type NoteItem = { id: number; text: string }
export type Notepad = {
  nextId: number
  items: NoteItem[]
  scopes: [string, number][]
  rejected: string[]
  sessionId?: string
}

declare module 'claude-code' {
  interface PluginState {
    'session-notepad': { notepad: Shaped<Notepad> }
  }
}
