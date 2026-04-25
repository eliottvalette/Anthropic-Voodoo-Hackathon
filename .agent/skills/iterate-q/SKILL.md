---
name: iterate-q
description: >
  Question every assumption before planning or implementing. Use when the user
  says "iterate-q", "question my assumptions", "poke holes", "what am I missing",
  or presents a complex task without clear constraints. Also use when a request
  has multiple reasonable interpretations. Do not jump to implementation.
---

# Iterate-Q

Before writing any plan or code, surface every unstated assumption through
iterative questioning. Do not implement until the OPEN list is empty.

## How to ask

Use the built-in interactive question tool for every batch of questions:

- **Claude Code:** use `AskUserQuestion` to present each question with
  selectable options the user can click.
- **Codex:** switch to plan mode (`/plan`) and use `request_user_input` to
  present questions with concrete choices.

Never dump questions as plain numbered text. Always use the interactive tool
so the user can respond by selecting options, not by typing paragraphs.

When a question has predictable answers, provide 2 to 4 concrete options.
When it is truly open-ended, present it as a free-text question through the
same tool.

## Loop (no round limit)

1. **Decompose.** Read the request. Separate stated facts from things you are
   tempted to assume but were never confirmed.

2. **Ask.** Present 3 to 6 questions per batch via the interactive tool.
   Skip questions you can answer from the codebase or conversation.

3. **Track.** After each batch, display a running tracker:

   ```
   CONFIRMED: [locked decisions]
   OPEN: [remaining questions]
   ASSUMED: [defaults you will use unless corrected]
   ```

4. **Repeat until OPEN is empty.** Keep asking as long as any question or
   assumption remains that would affect the plan. Only stop when OPEN has
   zero items and every ASSUMED item has been acknowledged.

   If the user says "just go", lock all working assumptions as confirmed
   and proceed.

5. **Plan.** Once every assumption is resolved, output: locked decisions,
   implementation plan, tests, and risks. Then implement.

## Rules

- There is no maximum number of rounds. Keep going until done.
- Adapt depth to stakes: a script needs 1 round, a production service needs more.
- If the user already gave exhaustive constraints, skip straight to planning.