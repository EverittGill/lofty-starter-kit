---
description: Start a work session. Reads memory and the last session's note, then asks what today is.
---

# /hey-claude — start of session

1. Read `memory/MEMORY.md` (already loaded through CLAUDE.md) and `memory/next-session.md`.
2. **First run?** If the "About me" section in `CLAUDE.md` is still blank, run setup instead of a
   briefing. Ask, one or two at a time: name, brokerage and market, lead sources, what tools they use
   (FUB, website, email), what a great week looks like, and how they like Claude to talk (short or
   detailed). Fill in "About me", write a `user` memory and a `feedback` memory, add both to
   `MEMORY.md`, and finish.
3. Otherwise, brief in under 10 lines:
   - **Last time:** one sentence from `next-session.md`.
   - **Recommended focus:** the `## Recommended focus` line.
   - **Waiting on you:** anything under "Waiting on me".
   - **What are we doing today?**
4. Wait for an answer. Load only the memory files that matter for what they pick.

Extra instructions from the user, if any: $ARGUMENTS
