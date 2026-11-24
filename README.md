# claude-notepad

A Claude Code mod that keeps a per-session notepad in a band above the prompt: a short bullet list of small pending items (things to test, check, try later) that would otherwise scroll away.

Claude maintains it through a `notepad` tool: it adds items as they come up and removes them once verified. The list is saved per session id, so it comes back after a restart or `/resume`.

## Install

```
claude plugin install session-notepad --marketplace soyuka/claude-notepad
```

Add `--scope local` to enable it for one project only.

## Usage

The band shows above the prompt while something is pending and disappears once the list is empty. You can also edit it by hand:

```
/notepad              print the list
/notepad add <text>   add an item (free-form, no format check)
/notepad done 2 3     remove items once done
/notepad rm 4         delete an item
```

Items Claude adds or edits through the tool follow a conventional-commits-like format, one line of at most 60 characters:

```
type(scope): subject
```

- `type` is one of `test` (run a test), `check` (verify a fact or state), `fix` (known bug to fix later), `try` (experiment), `ask` (question for the person), `doc` (docs to write)
- `scope` is optional, one token matching `[a-z0-9][a-z0-9._+-]*`
- `subject` is non-empty, starts lowercase and has no trailing period

```
• test(auth): login with an expired token
• check(cache): headers on the 304 path
• try: piper voice for say-tts
```

Invalid entries are rejected one by one with the reason in the tool result, and the result ends with the scopes used so far so Claude reuses them. Items removed with `/notepad rm` are remembered for the session: the tool cannot add them back, `/notepad add` can.

The tool description tells Claude to keep the list current. To make it more reliable, add a line to your `~/.claude/CLAUDE.md`:

```
When the `mcp__session-notepad__notepad` tool is available, keep it current without being asked: add every small pending item that comes up (to test, check, verify, try later), one short line formatted `type(scope): subject` (types test, check, fix, try, ask, doc; reuse the scopes the tool lists; never re-add an item I removed); mark items done as soon as verified or obsolete; never add the task in progress nor duplicates.
```

## Development

```
claude plugin validate .
claude plugin test .
```
