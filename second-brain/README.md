# Your second brain for Claude Code

This is a blank copy of the setup Everitt uses every day. It's a folder where Claude keeps notes on
your business, your clients and your week, so every session picks up where the last one ended.

## Install (5 minutes)

1. Copy this whole `second-brain` folder somewhere you'll keep it, for example `~/Desktop/My Business`.
   Rename it whatever you like.
2. Open Terminal, `cd` into it, and run `claude`.
3. Type **`/hey-claude`**. The first time, Claude asks you a few questions about you and your
   business and writes your first memories.
4. At the end of a work session, type **`/see-you-later`**. Claude saves what happened and writes a
   note for next time.

That's it. Every session after that starts with `/hey-claude` and ends with `/see-you-later`.

## What's inside

| Path | What it is |
|---|---|
| `CLAUDE.md` | The instructions Claude reads every session. Fill in the "About me" part, or let Claude do it. |
| `memory/MEMORY.md` | The index of everything Claude remembers. One line per memory. Loaded every session. |
| `memory/*.md` | One file per memory (you, how you like to work, each client, this week's goals) |
| `memory/next-session.md` | The note `/see-you-later` leaves for the next `/hey-claude` |
| `memory/archive/` | Old memories, kept but not loaded |
| `notes/` | Anything else: scripts, checklists, call notes |
| `.claude/commands/` | The `/hey-claude` and `/see-you-later` commands |

## Tips

- Talk to it like an assistant: "remember that the Smiths want to close before school starts".
- Keep `MEMORY.md` short, under 20 lines. Claude moves old things to `archive/`.
- Put the folder in a **private** GitHub repo if you want a backup or want to use it on two computers.
