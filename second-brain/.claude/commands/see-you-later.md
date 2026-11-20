---
description: End a work session. Saves what happened to memory and leaves a note for next time.
---

# /see-you-later — end of session

1. **Inventory.** List what got done, what was decided, what's still open and anything the user said
   about how they want Claude to work.
2. **Update memory.**
   - New lasting facts get a memory file (one fact per file, header from `CLAUDE.md`) and one line in
     `MEMORY.md`. Update existing files instead of duplicating.
   - Corrections or preferences the user gave become a `feedback` memory with a **Why:** line.
   - Turn relative dates into real dates.
   - If `MEMORY.md` is over 15 lines, move the stalest entries to `memory/archive/` and remove their
     lines.
3. **Rewrite `memory/next-session.md`:**
   - `## Recommended focus`: one or two sentences, the single best next thing.
   - `## Open items`: what's half done, with where it lives.
   - `## Waiting on me`: decisions or actions only the user can do.
4. **Back up.** If this folder is a git repo, commit with a one-line summary of the session. Push only
   if the user has said pushing is fine.
5. **Close** with three short lines: what got saved, the recommended focus, and anything waiting on them.

Extra instructions from the user, if any: $ARGUMENTS
