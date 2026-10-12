# CULL — guidance for Claude Code

CULL is a browser game: nothing exists unless it is framed; you hold the camera.
Design source of truth: `docs/design/game-design.md` (the bible). Build milestones M1…M8 are defined there; do one milestone per PR.

## Working rules
- Delegate codebase searches/exploration to the `scout` subagent (haiku) and tiny mechanical edits to the `tweaker` subagent (haiku). Keep Opus for design, architecture and non-trivial code.
- Small steps: one milestone per branch/PR, never one-shot the whole campaign.
- Balance is measured with the repo's bot harness (see `tests/` and `docs/PROGRESS.md`): passive bot must fail most seeds, skilled bot must clearly beat it, no seed winnable by luck. Report the numbers in each PR.
- Run lint, typecheck and tests before opening a PR. Include screenshots for visual changes.
- Do not merge PRs yourself; the reviewer merges.
