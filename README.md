# claude-notepad

A Claude Code mod that keeps a per-session notepad in a pane beside the chat: a short bullet list of small pending items (things to test, check, try later) that would otherwise scroll away.

Claude maintains it through a `notepad` tool: it adds items as they come up and removes them once verified. The list is saved per session id, so it comes back after a restart or `/resume`.

## Install

```
claude plugin install session-notepad --marketplace soyuka/claude-notepad
```

Add `--scope local` to enable it for one project only.

## Usage

The pane shows while something is pending and closes once the list is empty. You can also edit it by hand:

```
/notepad              print the list (and open the pane if anything is pending)
/notepad add <text>   add an item
/notepad done 2 3     remove items once done
/notepad rm 4         delete an item
```

The tool description tells Claude to keep the list current. To make it more reliable, add a line to your `~/.claude/CLAUDE.md`:

```
When the `mcp__session-notepad__notepad` tool is available, keep it current without being asked: add every small pending item that comes up (to test, check, verify, try later), one short line; mark items done as soon as verified or obsolete; never add the task in progress nor duplicates.
```

## Development

```
claude plugin validate .
claude plugin test .
```
